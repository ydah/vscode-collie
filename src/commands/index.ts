import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { StatusBar } from '../features/statusBar';
import { formatDocument } from './format';
import { lintDocument } from './lint';
import { fixAllOffenses } from './fixAll';

export function registerCommands(
  context: vscode.ExtensionContext,
  client: LanguageClient,
  statusBar: StatusBar
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('collie.format', () => {
      formatDocument();
    }),

    vscode.commands.registerCommand('collie.lint', () => {
      lintDocument(statusBar);
    }),

    vscode.commands.registerCommand('collie.fixAll', () => {
      fixAllOffenses();
    }),

    vscode.commands.registerCommand('collie.restartServer', async () => {
      await client.stop();
      await client.start();
      vscode.window.showInformationMessage('Collie server restarted');
    }),

    vscode.commands.registerCommand('collie.showOutputChannel', () => {
      client.outputChannel.show();
    })
  );
}
