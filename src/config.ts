import * as vscode from 'vscode';

export interface CollieConfig {
  lspPath: string | undefined;
  enableLinting: boolean;
  enableFormatting: boolean;
  configPath: string | undefined;
  trace: {
    server: string;
  };
}

export function getConfig(): CollieConfig {
  const config = vscode.workspace.getConfiguration('collie');

  return {
    lspPath: config.get<string>('lspPath'),
    enableLinting: config.get<boolean>('enableLinting', true),
    enableFormatting: config.get<boolean>('enableFormatting', true),
    configPath: config.get<string>('configPath'),
    trace: {
      server: config.get<string>('trace.server', 'off')
    }
  };
}
