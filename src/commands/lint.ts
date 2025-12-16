import * as vscode from 'vscode';
import { StatusBar } from '../features/statusBar';

export async function lintDocument(statusBar: StatusBar): Promise<void> {
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

  // Get diagnostics for the current document
  const diagnostics = vscode.languages.getDiagnostics(document.uri);

  // Update status bar with offense count
  statusBar.setOffenseCount(diagnostics.length);

  if (diagnostics.length === 0) {
    vscode.window.showInformationMessage('No offenses found');
  } else {
    vscode.window.showWarningMessage(`Found ${diagnostics.length} offense(s)`);
  }
}
