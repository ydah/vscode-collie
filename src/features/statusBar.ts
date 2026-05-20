import * as vscode from 'vscode';
import { COMMANDS, LANGUAGE_ID } from '../constants';

export type CollieServerState =
  | 'initializing'
  | 'ready'
  | 'restarting'
  | 'stopped'
  | 'error'
  | 'untrusted';

export class StatusBar {
  private statusBarItem: vscode.StatusBarItem;
  private serverState: CollieServerState = 'initializing';
  private diagnosticCounts = { errors: 0, warnings: 0, infos: 0, hints: 0 };
  private activeDocument: vscode.TextDocument | undefined;
  private serverPath: string | undefined;
  private serverVersion: string | undefined;
  private configPath: string | undefined;
  private errorMessage: string | undefined;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = COMMANDS.showOutputChannel;
    this.update();
  }

  setInitializing(): void {
    this.serverState = 'initializing';
    this.update();
  }

  setReady(): void {
    this.serverState = 'ready';
    this.errorMessage = undefined;
    this.update();
  }

  setRestarting(): void {
    this.serverState = 'restarting';
    this.update();
  }

  setStopped(): void {
    this.serverState = 'stopped';
    this.update();
  }

  setWorkspaceUntrusted(): void {
    this.serverState = 'untrusted';
    this.errorMessage = undefined;
    this.update();
  }

  setError(message: string): void {
    this.serverState = 'error';
    this.errorMessage = message;
    this.statusBarItem.command = COMMANDS.checkSetup;
    this.update();
  }

  setOffenseCount(count: number): void {
    this.diagnosticCounts = { errors: 0, warnings: count, infos: 0, hints: 0 };
    this.update();
  }

  setDiagnostics(diagnostics: readonly vscode.Diagnostic[]): void {
    this.diagnosticCounts = diagnostics.reduce(
      (counts, diagnostic) => {
        switch (diagnostic.severity) {
          case vscode.DiagnosticSeverity.Error:
            counts.errors += 1;
            break;
          case vscode.DiagnosticSeverity.Warning:
            counts.warnings += 1;
            break;
          case vscode.DiagnosticSeverity.Information:
            counts.infos += 1;
            break;
          case vscode.DiagnosticSeverity.Hint:
            counts.hints += 1;
            break;
        }

        return counts;
      },
      { errors: 0, warnings: 0, infos: 0, hints: 0 }
    );
    this.update();
  }

  setActiveDocument(document: vscode.TextDocument | undefined): void {
    this.activeDocument = document?.languageId === LANGUAGE_ID ? document : undefined;
    this.update();
  }

  setServerInfo(serverPath: string | undefined, serverVersion: string | undefined): void {
    this.serverPath = serverPath;
    this.serverVersion = serverVersion;
    this.update();
  }

  setConfigPath(configPath: string | undefined): void {
    this.configPath = configPath;
    this.update();
  }

  private update(): void {
    if (!this.activeDocument && this.serverState !== 'error' && this.serverState !== 'untrusted') {
      this.statusBarItem.hide();
      return;
    }

    this.statusBarItem.command = this.serverState === 'error'
      ? COMMANDS.checkSetup
      : COMMANDS.showOutputChannel;

    this.statusBarItem.text = this.textForState();
    this.statusBarItem.tooltip = this.tooltipForState();
    this.statusBarItem.show();
  }

  private textForState(): string {
    if (this.serverState === 'initializing') {
      return '$(sync~spin) Collie';
    }

    if (this.serverState === 'restarting') {
      return '$(sync~spin) Collie Restarting';
    }

    if (this.serverState === 'error') {
      return '$(error) Collie';
    }

    if (this.serverState === 'untrusted') {
      return '$(lock) Collie';
    }

    if (this.serverState === 'stopped') {
      return '$(circle-slash) Collie';
    }

    const count = this.totalDiagnostics();
    if (count === 0) {
      return '$(check) Collie';
    }

    if (this.diagnosticCounts.errors > 0) {
      return `$(error) Collie ${this.diagnosticCounts.errors}E`;
    }

    return `$(warning) Collie ${count}`;
  }

  private tooltipForState(): string {
    const lines = [
      this.stateDescription(),
      `Diagnostics: ${this.diagnosticCounts.errors} errors, ${this.diagnosticCounts.warnings} warnings, ${this.diagnosticCounts.infos} infos, ${this.diagnosticCounts.hints} hints`
    ];

    if (this.serverPath) {
      lines.push(`Server path: ${this.serverPath}`);
    }

    if (this.serverVersion) {
      lines.push(`Server version: ${this.serverVersion}`);
    }

    if (this.configPath) {
      lines.push(`Config path: ${this.configPath}`);
    }

    return lines.join('\n');
  }

  private stateDescription(): string {
    switch (this.serverState) {
      case 'initializing':
        return 'Collie is initializing';
      case 'ready':
        return 'Collie is ready';
      case 'restarting':
        return 'Collie is restarting';
      case 'stopped':
        return 'Collie language server is stopped';
      case 'untrusted':
        return 'Collie is waiting for workspace trust';
      case 'error':
        return `Collie error: ${this.errorMessage ?? 'unknown error'}`;
    }
  }

  private totalDiagnostics(): number {
    return this.diagnosticCounts.errors
      + this.diagnosticCounts.warnings
      + this.diagnosticCounts.infos
      + this.diagnosticCounts.hints;
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
