import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { createClient } from './client';
import { registerCommands } from './commands';
import { StatusBar } from './features/statusBar';

let client: LanguageClient;
let statusBar: StatusBar;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Collie extension is now active');

  // Create LSP client
  client = createClient(context);

  // Create status bar
  statusBar = new StatusBar();
  context.subscriptions.push(statusBar);

  // Register commands
  registerCommands(context, client, statusBar);

  // Start the client
  await client.start();

  // Update status bar
  statusBar.setReady();

  console.log('Collie LSP client started');
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
  }
}
