import * as vscode from 'vscode';

export async function formatDocument(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  const document = editor.document;
  if (document.languageId !== 'yacc') {
    vscode.window.showWarningMessage('Current file is not a grammar file');
    return;
  }

  try {
    await vscode.commands.executeCommand('editor.action.formatDocument');
  } catch (error) {
    vscode.window.showErrorMessage(`Formatting failed: ${error}`);
  }
}
