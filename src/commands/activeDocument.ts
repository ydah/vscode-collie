import * as vscode from 'vscode';
import { LANGUAGE_ID } from '../constants';

export const getActiveGrammarEditor = (): vscode.TextEditor | undefined => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.setStatusBarMessage('Collie: No active editor', 3000);
    return undefined;
  }

  if (editor.document.languageId !== LANGUAGE_ID) {
    void vscode.window.setStatusBarMessage('Collie: Current file is not a grammar file', 3000);
    return undefined;
  }

  return editor;
};

export const messageForError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};
