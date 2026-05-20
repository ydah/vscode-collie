import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  ServerOptions,
  State,
  Trace,
  TransportKind
} from 'vscode-languageclient/node';
import { CollieConfig, resolveConfigPathForFolder, toInitializationOptions } from './config';
import { LANGUAGE_ID } from './constants';
import { ServerLaunch } from './serverSetup';

export const ensureLogDirectory = (context: vscode.ExtensionContext): void => {
  fs.mkdirSync(context.logUri.fsPath, { recursive: true });
};

const traceFor = (config: CollieConfig): Trace => {
  switch (config.trace.server) {
    case 'messages':
      return Trace.Messages;
    case 'verbose':
      return Trace.Verbose;
    case 'off':
    default:
      return Trace.Off;
  }
};

export const createConfigWatchers = (
  config: CollieConfig,
  workspaceFolder?: vscode.WorkspaceFolder
): vscode.FileSystemWatcher[] => {
  const watchers = [
    workspaceFolder
      ? vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder, '**/.collie.yml'))
      : vscode.workspace.createFileSystemWatcher('**/.collie.yml')
  ];

  const resolvedConfigPath = workspaceFolder
    ? resolveConfigPathForFolder(config, workspaceFolder)
    : undefined;
  if (resolvedConfigPath) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        path.dirname(resolvedConfigPath),
        path.basename(resolvedConfigPath)
      )
    );
    watchers.push(watcher);
  }

  return watchers;
};

export function createClient(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
  launch: ServerLaunch,
  config: CollieConfig,
  workspaceFolder?: vscode.WorkspaceFolder
): LanguageClient {
  const env = {
    ...process.env,
    COLLIE_LSP_LOG: path.join(context.logUri.fsPath, 'collie-lsp.log')
  };

  const serverOptions: ServerOptions = {
    run: {
      command: launch.command,
      args: launch.args,
      transport: TransportKind.stdio,
      options: {
        cwd: launch.cwd,
        env
      }
    },
    debug: {
      command: launch.command,
      args: launch.args,
      transport: TransportKind.stdio,
      options: {
        cwd: launch.cwd,
        env
      }
    }
  };

  const fileWatchers = createConfigWatchers(config, workspaceFolder);
  const clientOptions: LanguageClientOptions = {
    documentSelector: documentSelectorFor(workspaceFolder),
    synchronize: {
      configurationSection: 'collie',
      fileEvents: fileWatchers
    },
    initializationOptions: toInitializationOptions(context, config, workspaceFolder),
    outputChannel,
    traceOutputChannel: outputChannel,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    workspaceFolder
  };

  const client = new LanguageClient(
    'collie',
    'Collie Language Server',
    serverOptions,
    clientOptions
  );

  client.setTrace(traceFor(config));
  const watcherDisposable = client.onDidChangeState(event => {
    if (event.newState === State.Stopped) {
      fileWatchers.forEach(watcher => watcher.dispose());
      watcherDisposable.dispose();
    }
  });

  return client;
}

const documentSelectorFor = (
  workspaceFolder?: vscode.WorkspaceFolder
): NonNullable<LanguageClientOptions['documentSelector']> => {
  if (!workspaceFolder) {
    return [
      { scheme: 'file', language: LANGUAGE_ID },
      { scheme: 'untitled', language: LANGUAGE_ID }
    ];
  }

  return [
    {
      scheme: 'file',
      language: LANGUAGE_ID,
      pattern: `${workspaceFolder.uri.fsPath.replace(/\\/g, '/')}/**/*`
    }
  ];
};
