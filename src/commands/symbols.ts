import * as vscode from 'vscode';
import { LANGUAGE_ID } from '../constants';

interface SymbolQuickPickItem extends vscode.QuickPickItem {
  symbol: vscode.SymbolInformation;
}

export const searchCollieSymbols = async (
  query?: string
): Promise<vscode.SymbolInformation[]> => {
  const symbolQuery = query ?? await vscode.window.showInputBox({
    prompt: 'Search Collie symbols',
    placeHolder: 'rule or token name'
  });

  if (symbolQuery === undefined) {
    return [];
  }

  const symbols = await getSymbols(symbolQuery);
  if (query !== undefined) {
    return symbols;
  }

  if (symbols.length === 0) {
    void vscode.window.setStatusBarMessage('Collie: No symbols found', 3000);
    return symbols;
  }

  const selected = await vscode.window.showQuickPick(
    symbols.map(toQuickPickItem),
    { matchOnDescription: true, matchOnDetail: true }
  );

  if (selected) {
    await openSymbol(selected.symbol);
  }

  return symbols;
};

const getSymbols = async (query: string): Promise<vscode.SymbolInformation[]> => {
  const workspaceSymbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
    'vscode.executeWorkspaceSymbolProvider',
    query
  );

  if (workspaceSymbols && workspaceSymbols.length > 0) {
    return workspaceSymbols.filter(symbol => symbol.location.uri.scheme !== 'output');
  }

  const document = vscode.window.activeTextEditor?.document;
  if (!document || document.languageId !== LANGUAGE_ID) {
    return [];
  }

  const documentSymbols = await vscode.commands.executeCommand<Array<vscode.DocumentSymbol | vscode.SymbolInformation>>(
    'vscode.executeDocumentSymbolProvider',
    document.uri
  );

  return flattenDocumentSymbols(document.uri, documentSymbols ?? [])
    .filter(symbol => symbol.name.toLowerCase().includes(query.toLowerCase()));
};

const flattenDocumentSymbols = (
  uri: vscode.Uri,
  symbols: Array<vscode.DocumentSymbol | vscode.SymbolInformation>
): vscode.SymbolInformation[] => {
  return symbols.flatMap(symbol => {
    if (symbol instanceof vscode.SymbolInformation) {
      return [symbol];
    }

    const current = new vscode.SymbolInformation(
      symbol.name,
      symbol.kind,
      symbol.detail,
      new vscode.Location(uri, symbol.selectionRange)
    );

    return [current, ...flattenDocumentSymbols(uri, symbol.children)];
  });
};

const toQuickPickItem = (symbol: vscode.SymbolInformation): SymbolQuickPickItem => ({
  label: `$(${iconFor(symbol.kind)}) ${symbol.name}`,
  description: symbol.containerName,
  detail: vscode.workspace.asRelativePath(symbol.location.uri),
  symbol
});

const openSymbol = async (symbol: vscode.SymbolInformation): Promise<void> => {
  const document = await vscode.workspace.openTextDocument(symbol.location.uri);
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(
    symbol.location.range.start,
    symbol.location.range.start
  );
  editor.revealRange(symbol.location.range, vscode.TextEditorRevealType.InCenter);
};

const iconFor = (kind: vscode.SymbolKind): string => {
  switch (kind) {
    case vscode.SymbolKind.Function:
    case vscode.SymbolKind.Method:
      return 'symbol-method';
    case vscode.SymbolKind.Variable:
    case vscode.SymbolKind.Constant:
      return 'symbol-variable';
    case vscode.SymbolKind.Class:
    case vscode.SymbolKind.Struct:
      return 'symbol-structure';
    default:
      return 'symbol-misc';
  }
};
