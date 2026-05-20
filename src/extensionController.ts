import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, State } from 'vscode-languageclient/node';
import { createClient, ensureLogDirectory } from './client';
import { CommandServices, registerCommands } from './commands';
import { getConfig, resolveConfigPath, toWorkspaceSettings } from './config';
import { OUTPUT_CHANNEL_NAME, SETTINGS } from './constants';
import { clearFeatureContexts, featureSupportFor, setFeatureContexts } from './features/capabilities';
import { StatusBar } from './features/statusBar';
import {
  findAvailableServer,
  getRubyVersion,
  getServerLaunchCandidates,
  ServerLaunch,
  SetupCheckResult
} from './serverSetup';

const RESTART_DEBOUNCE_MS = 300;
const MAX_AUTO_RESTARTS = 3;

export class ExtensionController implements vscode.Disposable, CommandServices {
  private readonly outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  private readonly statusBar = new StatusBar();
  private readonly disposables: vscode.Disposable[] = [this.outputChannel, this.statusBar];
  private client: LanguageClient | undefined;
  private clientStateDisposable: vscode.Disposable | undefined;
  private restartTimer: NodeJS.Timeout | undefined;
  private restartPromise: Promise<void> | undefined;
  private intentionallyStopping = false;
  private autoRestartCount = 0;

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

    await this.startServer();
  }

  getClient(): LanguageClient | undefined {
    return this.client;
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
    const result = await findAvailableServer(config);
    this.writeSetupResult(result);

    if (result.ok) {
      vscode.window.showInformationMessage(
        `Collie setup OK: ${result.launch.displayCommand}${result.version ? ` (${result.version})` : ''}`
      );
      return;
    }

    await this.showMissingServerActions(result.error ?? 'collie-lsp is unavailable');
  }

  async copyEnvironmentInfo(): Promise<void> {
    const config = getConfig();
    const result = await findAvailableServer(config);
    const configPath = resolveConfigPath(config);
    const rubyVersion = await getRubyVersion();
    const candidates = getServerLaunchCandidates(config)
      .map(candidate => `- ${candidate.displayCommand} [${candidate.source}]`)
      .join('\n');
    const support = featureSupportFor(this.client?.initializeResult?.capabilities, config);

    const info = [
      `Collie extension: ${this.context.extension.id}`,
      `Workspace trusted: ${vscode.workspace.isTrusted}`,
      `Ruby: ${rubyVersion}`,
      `LSP command: ${result.launch.displayCommand}`,
      `LSP version: ${result.version ?? 'unavailable'}`,
      `LSP check: ${result.ok ? 'ok' : result.error ?? 'failed'}`,
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
    const uri = this.defaultConfigUri();
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
    const configuredPath = resolveConfigPath(config);
    const uri = configuredPath ? vscode.Uri.file(configuredPath) : this.defaultConfigUri();

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

    this.clientStateDisposable?.dispose();
    void this.stopServer();
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

    const result = await findAvailableServer(config);
    this.writeSetupResult(result);
    if (!result.ok) {
      this.statusBar.setError(result.error ?? 'collie-lsp is unavailable');
      await this.showMissingServerActions(result.error ?? 'collie-lsp is unavailable');
      return;
    }

    await this.startClient(result.launch, result.version, config);
  }

  private async startClient(
    launch: ServerLaunch,
    version: string | undefined,
    config = getConfig()
  ): Promise<void> {
    try {
      const client = createClient(this.context, this.outputChannel, launch, config);
      this.client = client;
      this.statusBar.setServerInfo(launch.displayCommand, version);
      this.watchClientState(client);
      await client.start();
      this.autoRestartCount = 0;
      await this.updateFeatureContexts();
      this.statusBar.setReady();
      this.updateActiveDocument();
      this.updateDiagnostics();
      this.outputChannel.appendLine(`Collie language server started: ${launch.displayCommand}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.statusBar.setError(message);
      await clearFeatureContexts();
      this.outputChannel.appendLine(`Failed to start Collie language server: ${message}`);
      await this.showMissingServerActions(message);
    }
  }

  private async restartServerNow(): Promise<void> {
    this.statusBar.setRestarting();
    await this.stopServer();
    await this.startServer();
  }

  private async stopServer(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.clientStateDisposable?.dispose();
    this.clientStateDisposable = undefined;
    await clearFeatureContexts();

    if (!client) {
      return;
    }

    this.intentionallyStopping = true;
    try {
      await client.stop();
    } finally {
      this.intentionallyStopping = false;
    }
  }

  private watchClientState(client: LanguageClient): void {
    this.clientStateDisposable?.dispose();
    this.clientStateDisposable = client.onDidChangeState(event => {
      if (event.newState === State.Running) {
        this.statusBar.setReady();
        return;
      }

      if (event.newState === State.Stopped) {
        this.statusBar.setStopped();
        this.scheduleAutoRestart();
      }
    });
  }

  private scheduleAutoRestart(): void {
    if (this.intentionallyStopping || !vscode.workspace.isTrusted) {
      return;
    }

    if (this.autoRestartCount >= MAX_AUTO_RESTARTS) {
      this.statusBar.setError('language server stopped repeatedly');
      return;
    }

    this.autoRestartCount += 1;
    const delayMs = this.autoRestartCount * 1000;
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
    const client = this.client;
    if (!client) {
      return;
    }

    const settings = toWorkspaceSettings(getConfig());
    void client.sendNotification('workspace/didChangeConfiguration', { settings });
    void this.updateFeatureContexts();
  }

  private async updateFeatureContexts(): Promise<void> {
    const support = featureSupportFor(
      this.client?.initializeResult?.capabilities,
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

  private writeSetupResult(result: SetupCheckResult): void {
    if (result.ok) {
      this.outputChannel.appendLine(
        `Setup check OK: ${result.launch.displayCommand}${result.version ? ` (${result.version})` : ''}`
      );
      return;
    }

    this.outputChannel.appendLine(
      `Setup check failed for ${result.launch.displayCommand}: ${result.error ?? 'unknown error'}`
    );
  }

  private async showMissingServerActions(message: string): Promise<void> {
    const action = await vscode.window.showErrorMessage(
      `Collie language server is not available: ${message}`,
      'Install gem',
      'Set collie.lspPath',
      'Show Output'
    );

    if (action === 'Install gem') {
      const terminal = vscode.window.createTerminal('Collie Setup');
      terminal.sendText('gem install collie-lsp');
      terminal.show();
    } else if (action === 'Set collie.lspPath') {
      await vscode.commands.executeCommand('workbench.action.openSettings', SETTINGS.lspPath);
    } else if (action === 'Show Output') {
      this.showOutputChannel();
    }
  }

  private defaultConfigUri(): vscode.Uri | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return undefined;
    }

    return vscode.Uri.file(path.join(folder.uri.fsPath, '.collie.yml'));
  }

  private async openConfigUri(uri: vscode.Uri): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
  }
}
