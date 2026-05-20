import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CollieConfig } from './config';

export type ServerLaunchSource = 'custom' | 'workspace' | 'bundler' | 'path' | 'test';

export interface ServerLaunch {
  command: string;
  args: string[];
  cwd: string | undefined;
  source: ServerLaunchSource;
  displayCommand: string;
}

export interface SetupCheckResult {
  ok: boolean;
  launch: ServerLaunch;
  version: string | undefined;
  error: string | undefined;
}

const commandExists = (filePath: string): boolean => {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
};

const workspaceBinstubCandidates = (): ServerLaunch[] => {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const executableNames = process.platform === 'win32'
    ? ['collie-lsp.cmd', 'collie-lsp.bat', 'collie-lsp']
    : ['collie-lsp'];

  return folders.flatMap(folder => {
    return executableNames
      .map(executableName => path.join(folder.uri.fsPath, 'bin', executableName))
      .filter(commandExists)
      .map(command => ({
        command,
        args: ['--stdio'],
        cwd: folder.uri.fsPath,
        source: 'workspace' as const,
        displayCommand: command
      }));
  });
};

const workspaceHasGemfile = (): boolean => {
  return (vscode.workspace.workspaceFolders ?? []).some(folder => {
    return commandExists(path.join(folder.uri.fsPath, 'Gemfile'));
  });
};

const primaryWorkspacePath = (): string | undefined => {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
};

export const getServerLaunchCandidates = (config: CollieConfig): ServerLaunch[] => {
  const testServer = process.env.COLLIE_LSP_TEST_SERVER;
  if (testServer) {
    return [{
      command: process.execPath,
      args: [testServer, '--stdio'],
      cwd: primaryWorkspacePath(),
      source: 'test',
      displayCommand: `${process.execPath} ${testServer}`
    }];
  }

  if (config.lspPath) {
    return [{
      command: config.lspPath,
      args: ['--stdio'],
      cwd: primaryWorkspacePath(),
      source: 'custom',
      displayCommand: config.lspPath
    }];
  }

  const candidates = workspaceBinstubCandidates();

  if (config.useBundler || workspaceHasGemfile()) {
    candidates.push({
      command: 'bundle',
      args: ['exec', 'collie-lsp', '--stdio'],
      cwd: primaryWorkspacePath(),
      source: 'bundler',
      displayCommand: 'bundle exec collie-lsp'
    });
  }

  candidates.push({
    command: 'collie-lsp',
    args: ['--stdio'],
    cwd: primaryWorkspacePath(),
    source: 'path',
    displayCommand: 'collie-lsp'
  });

  return candidates;
};

const versionArgsFor = (launch: ServerLaunch): string[] => {
  const argsWithoutStdio = launch.args.filter(arg => arg !== '--stdio');
  return [...argsWithoutStdio, '--version'];
};

const asErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const execFile = (
  command: string,
  args: string[],
  cwd: string | undefined,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    childProcess.execFile(
      command,
      args,
      { cwd, timeout: timeoutMs, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${asErrorMessage(error)} ${stderr}`.trim()));
          return;
        }

        resolve({ stdout, stderr });
      }
    );
  });
};

export const checkServerLaunch = async (
  launch: ServerLaunch,
  timeoutMs = 2500
): Promise<SetupCheckResult> => {
  try {
    const { stdout, stderr } = await execFile(
      launch.command,
      versionArgsFor(launch),
      launch.cwd,
      timeoutMs
    );
    const version = (stdout || stderr).trim().split(/\r?\n/)[0];
    return { ok: true, launch, version: version || undefined, error: undefined };
  } catch (error) {
    const message = asErrorMessage(error);
    return { ok: false, launch, version: undefined, error: message };
  }
};

export const findAvailableServer = async (
  config: CollieConfig
): Promise<SetupCheckResult> => {
  const candidates = getServerLaunchCandidates(config);
  let lastResult: SetupCheckResult | undefined;

  for (const candidate of candidates) {
    const result = await checkServerLaunch(candidate);
    if (result.ok) {
      return result;
    }

    lastResult = result;
    if (candidate.source === 'custom') {
      break;
    }
  }

  return lastResult ?? {
    ok: false,
    launch: candidates[0],
    version: undefined,
    error: 'No collie-lsp launch candidate was available'
  };
};

export const getRubyVersion = async (): Promise<string> => {
  try {
    const { stdout, stderr } = await execFile('ruby', ['--version'], primaryWorkspacePath(), 2500);
    return (stdout || stderr).trim();
  } catch (error) {
    return `unavailable (${asErrorMessage(error)})`;
  }
};
