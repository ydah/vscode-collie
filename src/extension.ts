import * as vscode from 'vscode';
import { ExtensionController } from './extensionController';

let controller: ExtensionController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  controller = new ExtensionController(context);
  context.subscriptions.push(controller);
  await controller.activate();
}

export async function deactivate(): Promise<void> {
  controller?.dispose();
  controller = undefined;
}
