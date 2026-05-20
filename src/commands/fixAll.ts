import * as vscode from 'vscode';
import { getActiveGrammarEditor, messageForError } from './activeDocument';

export async function fixAllOffenses(): Promise<void> {
  const editor = getActiveGrammarEditor();
  if (!editor) {
    return;
  }

  const document = editor.document;
  const fullRange = new vscode.Range(0, 0, document.lineCount, 0);

  try {
    const action = await findFixAllAction(document.uri, fullRange);
    if (!action) {
      void vscode.window.setStatusBarMessage('Collie: No fix-all action is available', 3000);
      return;
    }

    await applyCodeAction(action);
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
    await vscode.workspace.applyEdit(action.edit);
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
