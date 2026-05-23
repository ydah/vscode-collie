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
    const edits = await vscode.commands.executeCommand<vscode.TextEdit[] | undefined>(
      'vscode.executeFormatDocumentProvider',
      editor.document.uri,
      formattingOptionsFor(editor)
    );
    if (!edits || edits.length === 0) {
      return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    edits.forEach(edit => {
      workspaceEdit.replace(editor.document.uri, edit.range, edit.newText);
    });

    const applied = await vscode.workspace.applyEdit(workspaceEdit);
    if (!applied) {
      throw new Error('workspace edit was rejected');
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Collie formatting failed: ${messageForError(error)}`);
  }
}

const formattingOptionsFor = (editor: vscode.TextEditor): vscode.FormattingOptions => {
  return {
    tabSize: typeof editor.options.tabSize === 'number' ? editor.options.tabSize : 2,
    insertSpaces: typeof editor.options.insertSpaces === 'boolean'
      ? editor.options.insertSpaces
      : true
  };
};
