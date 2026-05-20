import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { getConfig } from '../config';
import { StatusBar } from '../features/statusBar';
import { getActiveGrammarEditor, messageForError } from './activeDocument';

export async function lintDocument(
  client: LanguageClient | undefined,
  statusBar: StatusBar,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  const editor = getActiveGrammarEditor();
  if (!editor) {
    return;
  }

  if (!getConfig().enableLinting) {
    void vscode.window.setStatusBarMessage('Collie: Linting is disabled', 3000);
    return;
  }

  const document = editor.document;
  await requestLint(client, document, outputChannel);

  const diagnostics = vscode.languages.getDiagnostics(document.uri);
  statusBar.setDiagnostics(diagnostics);
  await vscode.commands.executeCommand('workbench.actions.view.problems');

  if (diagnostics.length === 0) {
    void vscode.window.setStatusBarMessage('Collie: No offenses found', 3000);
  } else {
    void vscode.window.setStatusBarMessage(`Collie: Found ${diagnostics.length} offense(s)`, 3000);
  }
}

const requestLint = async (
  client: LanguageClient | undefined,
  document: vscode.TextDocument,
  outputChannel: vscode.OutputChannel
): Promise<void> => {
  if (!client) {
    return;
  }

  try {
    await client.sendRequest('collie/lint', {
      textDocument: {
        uri: document.uri.toString()
      }
    });
  } catch (error) {
    outputChannel.appendLine(`collie/lint request failed; using current diagnostics: ${messageForError(error)}`);
  }
};
