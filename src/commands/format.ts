import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { getConfig } from '../config';
import { getActiveGrammarEditor, messageForError } from './activeDocument';

export async function formatDocument(client: LanguageClient | undefined): Promise<void> {
  const editor = getActiveGrammarEditor();
  if (!editor) {
    return;
  }

  if (!getConfig().enableFormatting) {
    void vscode.window.setStatusBarMessage('Collie: Formatting is disabled', 3000);
    return;
  }

  const formattingProvider = client?.initializeResult?.capabilities.documentFormattingProvider;
  if (client && !formattingProvider) {
    void vscode.window.setStatusBarMessage('Collie: Server does not provide formatting', 3000);
    return;
  }

  try {
    await vscode.commands.executeCommand('editor.action.formatDocument');
  } catch (error) {
    vscode.window.showErrorMessage(`Collie formatting failed: ${messageForError(error)}`);
  }
}
