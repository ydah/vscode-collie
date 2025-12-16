import * as vscode from 'vscode';

export class StatusBar {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'collie.showOutputChannel';
    this.setInitializing();
    this.statusBarItem.show();
  }

  setInitializing(): void {
    this.statusBarItem.text = '$(sync~spin) Collie';
    this.statusBarItem.tooltip = 'Collie is initializing...';
  }

  setReady(): void {
    this.statusBarItem.text = '$(check) Collie';
    this.statusBarItem.tooltip = 'Collie is ready';
  }

  setError(message: string): void {
    this.statusBarItem.text = '$(error) Collie';
    this.statusBarItem.tooltip = `Collie error: ${message}`;
  }

  setOffenseCount(count: number): void {
    if (count === 0) {
      this.setReady();
    } else {
      this.statusBarItem.text = `$(warning) Collie (${count})`;
      this.statusBarItem.tooltip = `${count} offense(s) found`;
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
