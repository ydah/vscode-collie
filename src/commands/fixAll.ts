import * as vscode from 'vscode';

export async function fixAllOffenses(): Promise<void> {
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
    await vscode.commands.executeCommand(
      'editor.action.sourceAction',
      {
        kind: 'source.fixAll',
        apply: 'first'
      }
    );
    vscode.window.showInformationMessage('Fixed all auto-correctable offenses');
  } catch (error) {
    vscode.window.showErrorMessage(`Fix all failed: ${error}`);
  }
}
