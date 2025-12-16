import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

export function createClient(context: vscode.ExtensionContext): LanguageClient {
  // Server options
  const serverOptions: ServerOptions = {
    run: {
      command: getCollieLspCommand(),
      args: ['--stdio'],
      transport: TransportKind.stdio
    },
    debug: {
      command: getCollieLspCommand(),
      args: ['--stdio'],
      transport: TransportKind.stdio,
      options: {
        env: {
          ...process.env,
          COLLIE_LSP_LOG: path.join(context.logUri.fsPath, 'collie-lsp.log')
        }
      }
    }
  };

  // Client options
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'yacc' },
      { scheme: 'file', pattern: '**/*.y' }
    ],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/.collie.yml')
    },
    outputChannelName: 'Collie',
    revealOutputChannelOn: 4 // RevealOutputChannelOn.Never
  };

  return new LanguageClient(
    'collie',
    'Collie Language Server',
    serverOptions,
    clientOptions
  );
}

function getCollieLspCommand(): string {
  const config = vscode.workspace.getConfiguration('collie');
  const customPath = config.get<string>('lspPath');

  if (customPath) {
    return customPath;
  }

  // Try to find collie-lsp in PATH
  return 'collie-lsp';
}
