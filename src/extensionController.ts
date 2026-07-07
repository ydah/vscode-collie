import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, State } from 'vscode-languageclient/node';
import { createClient, ensureLogDirectory } from './client';
import { CommandServices, registerCommands } from './commands';
import { getConfig, getExtensionVersion, resolveConfigPath, toWorkspaceSettings } from './config';
import { OUTPUT_CHANNEL_NAME, SETTINGS } from './constants';
import { clearFeatureContexts, featureSupportFor, setFeatureContexts } from './features/capabilities';
import { StatusBar } from './features/statusBar';
import {
  findAvailableServer,
  getRubyVersion,
  getServerLaunchCandidates,
  ServerLaunch,
  SetupIssue,
  SetupCheckResult
} from './serverSetup';
import { isVersionAtLeast, requiredServerVersion } from './version';

const RESTART_DEBOUNCE_MS = 300;
const MAX_AUTO_RESTARTS = 3;
const UNTITLED_CLIENT_KEY = '__untitled__';
const INSTALL_COLLIE_LSP_ACTION = 'Install collie-lsp';
const SET_LSP_PATH_ACTION = 'Set collie.lspPath';
const SHOW_OUTPUT_ACTION = 'Show Output';

interface ClientEntry {
  key: string;
  workspaceFolder: vscode.WorkspaceFolder | undefined;
  client: LanguageClient;
  launch: ServerLaunch;
  version: string | undefined;
}

export class ExtensionController implements vscode.Disposable, CommandServices {
  private readonly outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  private readonly statusBar = new StatusBar();
  private readonly disposables: vscode.Disposable[] = [this.outputChannel, this.statusBar];
  private readonly clients = new Map<string, ClientEntry>();
  private readonly clientStateDisposables = new Map<string, vscode.Disposable>();
  private readonly autoRestartCounts = new Map<string, number>();
  private readonly warnedVersionMismatches = new Set<string>();
  private restartTimer: NodeJS.Timeout | undefined;
  private restartPromise: Promise<void> | undefined;
  private intentionallyStopping = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async activate(): Promise<void> {
    registerCommands(this.context, this);
    this.registerWorkspaceListeners();
    this.updateActiveDocument();
    await clearFeatureContexts();

    if (!vscode.workspace.isTrusted) {
      this.statusBar.setWorkspaceUntrusted();
      return;
    }

    void this.startServer();
  }

  getClient(): LanguageClient | undefined {
    return this.activeClientEntry()?.client;
  }

  getStatusBar(): StatusBar {
    return this.statusBar;
  }

  getOutputChannel(): vscode.OutputChannel {
    return this.outputChannel;
  }

  async restartServer(): Promise<void> {
    if (this.restartPromise) {
      return this.restartPromise;
    }

    this.restartPromise = this.restartServerNow();
    try {
      await this.restartPromise;
    } finally {
      this.restartPromise = undefined;
    }
  }

  showOutputChannel(): void {
    this.outputChannel.show();
  }

  async checkSetup(): Promise<void> {
    const config = getConfig();
    const workspaceFolder = this.activeWorkspaceFolder();
    const result = await findAvailableServer(config, workspaceFolder);
    this.writeSetupResult(result);

    if (result.ok) {
      if (this.warnIfServerVersionUnsupported(result.version, config.minimumServerVersion, false)) {
        return;
      }

      vscode.window.showInformationMessage(
        `Collie setup OK: ${result.launch.displayCommand}${result.version ? ` (${result.version})` : ''}`
      );
      return;
    }

    void this.showMissingServerActions(result);
  }

  async copyEnvironmentInfo(): Promise<void> {
    const config = getConfig();
    const workspaceFolder = this.activeWorkspaceFolder();
    const result = await findAvailableServer(config, workspaceFolder);
    const configPath = workspaceFolder
      ? resolveConfigPath(config, workspaceFolder.uri)
      : resolveConfigPath(config);
    const rubyVersion = await getRubyVersion();
    const candidates = getServerLaunchCandidates(config, workspaceFolder)
      .map(candidate => `- ${candidate.displayCommand} [${candidate.source}]`)
      .join('\n');
    const support = featureSupportFor(this.getClient()?.initializeResult?.capabilities, config);

    const info = [
      `Collie extension: ${this.context.extension.id}`,
      `Workspace trusted: ${vscode.workspace.isTrusted}`,
      `Ruby: ${rubyVersion}`,
      `LSP command: ${result.launch.displayCommand}`,
      `LSP version: ${result.version ?? 'unavailable'}`,
      `LSP check: ${result.ok ? 'ok' : result.error ?? 'failed'}`,
      `LSP setup issue: ${result.issue.kind}`,
      `collie-lsp gem: ${result.issue.gemVersion ?? 'unknown'}`,
      `Config path: ${configPath ?? 'default'}`,
      `Linting enabled: ${config.enableLinting}`,
      `Formatting enabled: ${config.enableFormatting}`,
      `Trace: ${config.trace.server}`,
      `Feature support: format=${support.format}, fixAll=${support.fixAll}, symbols=${support.symbols}, syntaxDiagram=${support.syntaxDiagram}`,
      'Candidates:',
      candidates
    ].join('\n');

    await vscode.env.clipboard.writeText(info);
    void vscode.window.setStatusBarMessage('Collie: Environment info copied', 3000);
  }

  async createConfig(): Promise<void> {
    const uri = this.defaultConfigUri(this.activeWorkspaceFolder());
    if (!uri) {
      vscode.window.showWarningMessage('Open a workspace before creating .collie.yml');
      return;
    }

    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      await vscode.workspace.fs.writeFile(uri, Buffer.from('rules: {}\n'));
    }

    await this.openConfigUri(uri);
  }

  async openConfig(): Promise<void> {
    const config = getConfig();
    const workspaceFolder = this.activeWorkspaceFolder();
    const configuredPath = workspaceFolder
      ? resolveConfigPath(config, workspaceFolder.uri)
      : resolveConfigPath(config);
    const uri = configuredPath
      ? vscode.Uri.file(configuredPath)
      : this.defaultConfigUri(workspaceFolder);

    if (!uri) {
      vscode.window.showWarningMessage('Open a workspace before opening Collie config');
      return;
    }

    try {
      await vscode.workspace.fs.stat(uri);
      await this.openConfigUri(uri);
    } catch {
      const action = await vscode.window.showWarningMessage(
        'Collie config does not exist.',
        'Create .collie.yml'
      );
      if (action === 'Create .collie.yml') {
        await this.createConfig();
      }
    }
  }

  dispose(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }

    void this.stopServers();
    void clearFeatureContexts();
    this.disposables.forEach(disposable => disposable.dispose());
  }

  private registerWorkspaceListeners(): void {
    this.disposables.push(
      vscode.workspace.onDidGrantWorkspaceTrust(() => {
        void this.startServer();
      }),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (!event.affectsConfiguration(SETTINGS.section)
          && !event.affectsConfiguration(SETTINGS.legacyServerPath)) {
          return;
        }

        this.sendConfiguration();
        if (this.requiresRestart(event)) {
          this.scheduleRestart();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.scheduleRestart();
      }),
      vscode.window.onDidChangeActiveTextEditor(() => this.updateActiveDocument()),
      vscode.languages.onDidChangeDiagnostics(event => this.updateDiagnostics(event.uris))
    );
  }

  private async startServer(): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      this.statusBar.setWorkspaceUntrusted();
      return;
    }

    const config = getConfig();
    this.statusBar.setInitializing();
    this.statusBar.setConfigPath(resolveConfigPath(config));
    ensureLogDirectory(this.context);

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      await this.startClientForFolder(undefined, config);
    } else {
      await Promise.all(folders.map(folder => this.startClientForFolder(folder, config)));
    }

    await this.updateFeatureContexts();
    this.updateActiveDocument();
  }

  private async startClientForFolder(
    workspaceFolder: vscode.WorkspaceFolder | undefined,
    config: ReturnType<typeof getConfig>
  ): Promise<void> {
    const result = await findAvailableServer(config, workspaceFolder);
    this.writeSetupResult(result, workspaceFolder);
    if (!result.ok) {
      if (this.isActiveWorkspaceFolder(workspaceFolder)) {
        this.statusBar.setError(result.error ?? 'collie-lsp is unavailable');
        void this.showMissingServerActions(result);
      }
      return;
    }

    await this.startClient(result.launch, result.version, config, workspaceFolder);
    this.warnIfServerVersionUnsupported(result.version, config.minimumServerVersion);
  }

  private async startClient(
    launch: ServerLaunch,
    version: string | undefined,
    config: ReturnType<typeof getConfig>,
    workspaceFolder: vscode.WorkspaceFolder | undefined
  ): Promise<void> {
    const key = this.clientKey(workspaceFolder);
    try {
      const client = createClient(this.context, this.outputChannel, launch, config, workspaceFolder);
      this.clients.set(key, { key, workspaceFolder, client, launch, version });
      this.setActiveServerInfo();
      this.watchClientState(key, client);
      await client.start();
      this.autoRestartCounts.set(key, 0);
      if (this.isActiveWorkspaceFolder(workspaceFolder)) {
        await this.updateFeatureContexts();
        this.statusBar.setReady();
        this.updateActiveDocument();
        this.updateDiagnostics();
      }
      this.outputChannel.appendLine(`Collie language server started${workspaceFolder ? ` for ${workspaceFolder.name}` : ''}: ${launch.displayCommand}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.isActiveWorkspaceFolder(workspaceFolder)) {
        this.statusBar.setError(message);
      }
      await clearFeatureContexts();
      this.outputChannel.appendLine(`Failed to start Collie language server${workspaceFolder ? ` for ${workspaceFolder.name}` : ''}: ${message}`);
      if (this.isActiveWorkspaceFolder(workspaceFolder)) {
        void this.showMissingServerActions(message);
      }
    }
  }

  private async restartServerNow(): Promise<void> {
    this.statusBar.setRestarting();
    await this.stopServers();
    await this.startServer();
  }

  private async stopServers(): Promise<void> {
    const entries = [...this.clients.values()];
    this.clients.clear();
    this.clientStateDisposables.forEach(disposable => disposable.dispose());
    this.clientStateDisposables.clear();
    await clearFeatureContexts();

    if (entries.length === 0) {
      return;
    }

    this.intentionallyStopping = true;
    try {
      await Promise.all(entries.map(entry => entry.client.stop()));
    } finally {
      this.intentionallyStopping = false;
    }
  }

  private watchClientState(key: string, client: LanguageClient): void {
    this.clientStateDisposables.get(key)?.dispose();
    const disposable = client.onDidChangeState(event => {
      if (event.newState === State.Running) {
        if (this.activeClientEntry()?.key === key) {
          this.statusBar.setReady();
        }
        return;
      }

      if (event.newState === State.Stopped) {
        if (this.activeClientEntry()?.key === key) {
          this.statusBar.setStopped();
        }
        this.scheduleAutoRestart(key);
      }
    });
    this.clientStateDisposables.set(key, disposable);
  }

  private scheduleAutoRestart(key: string): void {
    if (this.intentionallyStopping || !vscode.workspace.isTrusted) {
      return;
    }

    const restartCount = this.autoRestartCounts.get(key) ?? 0;
    if (restartCount >= MAX_AUTO_RESTARTS) {
      if (this.activeClientEntry()?.key === key) {
        this.statusBar.setError('language server stopped repeatedly');
      }
      return;
    }

    const nextRestartCount = restartCount + 1;
    this.autoRestartCounts.set(key, nextRestartCount);
    const delayMs = nextRestartCount * 1000;
    this.outputChannel.appendLine(`Collie language server stopped; restarting in ${delayMs}ms`);
    setTimeout(() => void this.restartServer(), delayMs);
  }

  private scheduleRestart(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }

    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      void this.restartServer();
    }, RESTART_DEBOUNCE_MS);
  }

  private sendConfiguration(): void {
    if (this.clients.size === 0) {
      return;
    }

    const settings = toWorkspaceSettings(getConfig());
    this.clients.forEach(entry => {
      void entry.client.sendNotification('workspace/didChangeConfiguration', { settings });
    });
    void this.updateFeatureContexts();
  }

  private async updateFeatureContexts(): Promise<void> {
    const support = featureSupportFor(
      this.getClient()?.initializeResult?.capabilities,
      getConfig()
    );
    await setFeatureContexts(support);
  }

  private requiresRestart(event: vscode.ConfigurationChangeEvent): boolean {
    return event.affectsConfiguration(SETTINGS.lspPath)
      || event.affectsConfiguration(SETTINGS.legacyServerPath)
      || event.affectsConfiguration(SETTINGS.useBundler)
      || event.affectsConfiguration(SETTINGS.configPath)
      || event.affectsConfiguration(SETTINGS.traceServer);
  }

  private updateActiveDocument(): void {
    this.statusBar.setActiveDocument(vscode.window.activeTextEditor?.document);
    const config = getConfig();
    const activeFolder = this.activeWorkspaceFolder();
    this.statusBar.setConfigPath(
      activeFolder ? resolveConfigPath(config, activeFolder.uri) : resolveConfigPath(config)
    );
    this.setActiveServerInfo();
    void this.updateFeatureContexts();
    this.updateDiagnostics();
  }

  private updateDiagnostics(uris?: readonly vscode.Uri[]): void {
    const document = vscode.window.activeTextEditor?.document;
    if (!document) {
      this.statusBar.setDiagnostics([]);
      return;
    }

    if (uris && !uris.some(uri => uri.toString() === document.uri.toString())) {
      return;
    }

    this.statusBar.setDiagnostics(vscode.languages.getDiagnostics(document.uri));
  }

  private writeSetupResult(
    result: SetupCheckResult,
    workspaceFolder?: vscode.WorkspaceFolder
  ): void {
    const scope = workspaceFolder ? ` for ${workspaceFolder.name}` : '';
    if (result.ok) {
      this.outputChannel.appendLine(
        `Setup check OK${scope}: ${result.launch.displayCommand}${result.version ? ` (${result.version})` : ''}`
      );
      return;
    }

    this.outputChannel.appendLine(
      `Setup check failed${scope} for ${result.launch.displayCommand}: ${result.error ?? 'unknown error'} [${result.issue.kind}]`
    );
  }

  private async showMissingServerActions(resultOrMessage: SetupCheckResult | string): Promise<void> {
    const message = typeof resultOrMessage === 'string'
      ? resultOrMessage
      : resultOrMessage.error ?? 'collie-lsp is unavailable';
    const issue = typeof resultOrMessage === 'string' ? undefined : resultOrMessage.issue;
    const action = await vscode.window.showErrorMessage(
      this.setupErrorMessage(message, issue),
      ...this.setupActions(issue)
    );

    await this.handleSetupAction(action);
  }

  private setupErrorMessage(message: string, issue: SetupIssue | undefined): string {
    if (!issue) {
      return `Collie language server is not available: ${message}`;
    }

    switch (issue.kind) {
      case 'collieLspGemMissing':
        return 'Collie language server is not installed. Install the collie-lsp gem to enable linting and formatting.';
      case 'rubyMissing':
        return `Collie requires Ruby before collie-lsp can run: ${issue.detail ?? message}`;
      case 'rubyGemsMissing':
        return `Collie could not query RubyGems before installing collie-lsp: ${issue.detail ?? message}`;
      case 'customPathFailed':
        return `Collie could not start the configured collie.lspPath: ${message}`;
      case 'serverNotExecutable':
        if (issue.gemVersion) {
          return `collie-lsp ${issue.gemVersion} is installed, but VS Code could not start it: ${message}`;
        }

        return `Collie language server is not available: ${message}`;
      case 'none':
        return `Collie language server is not available: ${message}`;
    }
  }

  private setupActions(issue: SetupIssue | undefined): string[] {
    if (issue?.kind === 'collieLspGemMissing') {
      return [INSTALL_COLLIE_LSP_ACTION, SET_LSP_PATH_ACTION, SHOW_OUTPUT_ACTION];
    }

    return [SET_LSP_PATH_ACTION, SHOW_OUTPUT_ACTION];
  }

  private async handleSetupAction(action: string | undefined): Promise<void> {
    if (action === INSTALL_COLLIE_LSP_ACTION) {
      this.installCollieLsp();
    } else if (action === SET_LSP_PATH_ACTION) {
      await vscode.commands.executeCommand('workbench.action.openSettings', SETTINGS.lspPath);
    } else if (action === SHOW_OUTPUT_ACTION) {
      this.showOutputChannel();
    }
  }

  private installCollieLsp(): void {
    const terminal = vscode.window.createTerminal('Collie Setup');
    terminal.sendText('gem install collie-lsp');
    terminal.show();
  }

  private warnIfServerVersionUnsupported(
    version: string | undefined,
    minimumVersion: string | undefined,
    dedupe = true
  ): boolean {
    const requiredVersion = requiredServerVersion(
      minimumVersion,
      getExtensionVersion(this.context)
    );
    if (isVersionAtLeast(version, requiredVersion)) {
      return false;
    }

    const key = `${version ?? 'unknown'}:${requiredVersion ?? 'unknown'}`;
    if (dedupe && this.warnedVersionMismatches.has(key)) {
      return true;
    }

    this.warnedVersionMismatches.add(key);
    void this.showVersionMismatchActions(version, requiredVersion);
    return true;
  }

  private async showVersionMismatchActions(
    version: string | undefined,
    requiredVersion: string | undefined
  ): Promise<void> {
    const action = await vscode.window.showWarningMessage(
      `Collie language server version mismatch: ${version ?? 'unknown'} is older than required ${requiredVersion}.`,
      INSTALL_COLLIE_LSP_ACTION,
      SHOW_OUTPUT_ACTION
    );

    await this.handleSetupAction(action);
  }

  private defaultConfigUri(
    workspaceFolder: vscode.WorkspaceFolder | undefined
  ): vscode.Uri | undefined {
    const folder = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return undefined;
    }

    return vscode.Uri.file(path.join(folder.uri.fsPath, '.collie.yml'));
  }

  private async openConfigUri(uri: vscode.Uri): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
  }

  private activeClientEntry(): ClientEntry | undefined {
    const folder = this.activeWorkspaceFolder();
    return this.clients.get(this.clientKey(folder)) ?? this.clients.values().next().value;
  }

  private activeWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const document = vscode.window.activeTextEditor?.document;
    if (document?.uri.scheme === 'file') {
      return vscode.workspace.getWorkspaceFolder(document.uri);
    }

    return vscode.workspace.workspaceFolders?.[0];
  }

  private isActiveWorkspaceFolder(workspaceFolder: vscode.WorkspaceFolder | undefined): boolean {
    return this.clientKey(workspaceFolder) === this.clientKey(this.activeWorkspaceFolder());
  }

  private clientKey(workspaceFolder: vscode.WorkspaceFolder | undefined): string {
    return workspaceFolder?.uri.toString() ?? UNTITLED_CLIENT_KEY;
  }

  private setActiveServerInfo(): void {
    const entry = this.activeClientEntry();
    if (!entry) {
      return;
    }

    this.statusBar.setServerInfo(entry.launch.displayCommand, entry.version);
  }
}
