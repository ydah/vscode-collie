import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { getActiveGrammarEditor, messageForError } from './activeDocument';

interface ProtocolWorkspaceEdit {
  changes?: Record<string, Array<{
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
    newText: string;
  }>>;
}

export async function fixAllOffenses(client: LanguageClient | undefined): Promise<void> {
  const editor = getActiveGrammarEditor();
  if (!editor) {
    return;
  }

  const document = editor.document;
  const lastLine = document.lineAt(document.lineCount - 1);
  const fullRange = new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length);

  try {
    if (await requestFixAll(client, document)) {
      void vscode.window.setStatusBarMessage('Collie: Applied fix-all action', 3000);
      return;
    }

    const action = await findFixAllAction(document.uri, fullRange);
    if (action) {
      const before = document.getText();
      await applyCodeAction(action);
      if (document.getText() === before && await requestFixAll(client, document)) {
        void vscode.window.setStatusBarMessage('Collie: Applied fix-all action', 3000);
        return;
      }

      void vscode.window.setStatusBarMessage('Collie: Applied fix-all action', 3000);
      return;
    }

    const fixedByRequest = await requestFixAll(client, document);
    if (!fixedByRequest) {
      void vscode.window.setStatusBarMessage('Collie: No fix-all action is available', 3000);
      return;
    }

    void vscode.window.setStatusBarMessage('Collie: Applied fix-all action', 3000);
  } catch (error) {
    vscode.window.showErrorMessage(`Collie fix-all failed: ${messageForError(error)}`);
  }
}

const findFixAllAction = async (
  uri: vscode.Uri,
  range: vscode.Range
): Promise<vscode.CodeAction | vscode.Command | undefined> => {
  const collieFixAll = vscode.CodeActionKind.SourceFixAll.append('collie');
  const collieActions = await executeCodeActionProvider(uri, range, collieFixAll);
  if (collieActions.length > 0) {
    return collieActions[0];
  }

  const sourceActions = await executeCodeActionProvider(uri, range, vscode.CodeActionKind.SourceFixAll);
  return sourceActions.find(action => {
    return 'kind' in action && action.kind?.value.startsWith(collieFixAll.value);
  }) ?? sourceActions[0];
};

const executeCodeActionProvider = async (
  uri: vscode.Uri,
  range: vscode.Range,
  kind: vscode.CodeActionKind
): Promise<Array<vscode.CodeAction | vscode.Command>> => {
  const actions = await vscode.commands.executeCommand<Array<vscode.CodeAction | vscode.Command>>(
    'vscode.executeCodeActionProvider',
    uri,
    range,
    kind,
    100
  );

  return actions ?? [];
};

const applyCodeAction = async (action: vscode.CodeAction | vscode.Command): Promise<void> => {
  if ('edit' in action && action.edit) {
    const applied = await vscode.workspace.applyEdit(action.edit);
    if (!applied) {
      throw new Error('workspace edit was rejected');
    }
  }

  if ('command' in action && action.command) {
    const commandId = typeof action.command === 'string'
      ? action.command
      : action.command.command;
    const commandArguments = typeof action.command === 'string'
      && 'arguments' in action
      && Array.isArray(action.arguments)
      ? action.arguments
      : typeof action.command === 'string'
        ? []
        : action.command.arguments ?? [];

    await vscode.commands.executeCommand(commandId, ...commandArguments);
  }
};

const requestFixAll = async (
  client: LanguageClient | undefined,
  document: vscode.TextDocument
): Promise<boolean> => {
  if (!client) {
    return false;
  }

  try {
    const edit = await client.sendRequest<ProtocolWorkspaceEdit | undefined>(
      'collie/fixAll',
      {
        textDocument: {
          uri: document.uri.toString()
        }
      }
    );

    if (!edit) {
      return false;
    }

    return vscode.workspace.applyEdit(toWorkspaceEdit(edit));
  } catch {
    return false;
  }
};

const toWorkspaceEdit = (protocolEdit: ProtocolWorkspaceEdit): vscode.WorkspaceEdit => {
  const workspaceEdit = new vscode.WorkspaceEdit();

  Object.entries(protocolEdit.changes ?? {}).forEach(([uri, edits]) => {
    edits.forEach(edit => {
      workspaceEdit.replace(
        vscode.Uri.parse(uri),
        new vscode.Range(
          edit.range.start.line,
          edit.range.start.character,
          edit.range.end.line,
          edit.range.end.character
        ),
        edit.newText
      );
    });
  });

  return workspaceEdit;
};
