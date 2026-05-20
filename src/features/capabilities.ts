import * as vscode from 'vscode';
import { ServerCapabilities } from 'vscode-languageclient/node';
import { CONTEXTS } from '../constants';
import { CollieConfig } from '../config';

export interface CollieFeatureSupport {
  format: boolean;
  fixAll: boolean;
  symbols: boolean;
  syntaxDiagram: boolean;
}

export const featureSupportFor = (
  capabilities: ServerCapabilities | undefined,
  config: CollieConfig
): CollieFeatureSupport => {
  const experimental = capabilities?.experimental as { syntaxDiagramProvider?: unknown } | undefined;

  return {
    format: Boolean(config.enableFormatting && capabilities?.documentFormattingProvider),
    fixAll: Boolean(capabilities?.codeActionProvider),
    symbols: Boolean(capabilities?.documentSymbolProvider || capabilities?.workspaceSymbolProvider),
    syntaxDiagram: Boolean(experimental?.syntaxDiagramProvider)
  };
};

export const setFeatureContexts = async (support: CollieFeatureSupport): Promise<void> => {
  await Promise.all([
    vscode.commands.executeCommand('setContext', CONTEXTS.formatSupported, support.format),
    vscode.commands.executeCommand('setContext', CONTEXTS.fixAllSupported, support.fixAll),
    vscode.commands.executeCommand('setContext', CONTEXTS.symbolsSupported, support.symbols),
    vscode.commands.executeCommand('setContext', CONTEXTS.syntaxDiagramSupported, support.syntaxDiagram)
  ]);
};

export const clearFeatureContexts = async (): Promise<void> => {
  await setFeatureContexts({
    format: false,
    fixAll: false,
    symbols: false,
    syntaxDiagram: false
  });
};
