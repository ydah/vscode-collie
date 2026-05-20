import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { COMMANDS } from '../constants';
import { StatusBar } from '../features/statusBar';
import { formatDocument } from './format';
import { lintDocument } from './lint';
import { fixAllOffenses } from './fixAll';
import { searchCollieSymbols } from './symbols';
import { previewSyntaxDiagram } from './syntaxDiagram';

export interface CommandServices {
  getClient(): LanguageClient | undefined;
  getStatusBar(): StatusBar;
  getOutputChannel(): vscode.OutputChannel;
  restartServer(): Promise<void>;
  showOutputChannel(): void;
  checkSetup(): Promise<void>;
  copyEnvironmentInfo(): Promise<void>;
  createConfig(): Promise<void>;
  openConfig(): Promise<void>;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  services: CommandServices
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.format, () => {
      return formatDocument(services.getClient());
    }),

    vscode.commands.registerCommand(COMMANDS.lint, () => {
      return lintDocument(
        services.getClient(),
        services.getStatusBar(),
        services.getOutputChannel()
      );
    }),

    vscode.commands.registerCommand(COMMANDS.fixAll, () => {
      return fixAllOffenses(services.getClient());
    }),

    vscode.commands.registerCommand(COMMANDS.restartServer, async () => {
      await services.restartServer();
    }),

    vscode.commands.registerCommand(COMMANDS.showOutputChannel, () => {
      services.showOutputChannel();
    }),

    vscode.commands.registerCommand(COMMANDS.checkSetup, () => services.checkSetup()),
    vscode.commands.registerCommand(COMMANDS.copyEnvironmentInfo, () => services.copyEnvironmentInfo()),
    vscode.commands.registerCommand(COMMANDS.createConfig, () => services.createConfig()),
    vscode.commands.registerCommand(COMMANDS.openConfig, () => services.openConfig()),

    vscode.commands.registerCommand(COMMANDS.searchSymbols, (query?: string) => {
      return searchCollieSymbols(query);
    }),

    vscode.commands.registerCommand(COMMANDS.previewSyntaxDiagram, (ruleName?: string) => {
      return previewSyntaxDiagram(services.getClient(), ruleName);
    })
  );
}
