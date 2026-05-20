import * as path from 'path';
import * as vscode from 'vscode';
import { SETTINGS } from './constants';

export type ServerTrace = 'off' | 'messages' | 'verbose';

export interface CollieConfig {
  lspPath: string | undefined;
  useBundler: boolean;
  minimumServerVersion: string | undefined;
  enableLinting: boolean;
  enableFormatting: boolean;
  configPath: string | undefined;
  trace: {
    server: ServerTrace;
  };
}

export interface CollieInitializationOptions {
  extensionVersion: string;
  enableLinting: boolean;
  enableFormatting: boolean;
  configPath: string | undefined;
  workspaceFolders: CollieWorkspaceFolderConfig[];
  rootUri: string | undefined;
  trace: ServerTrace;
}

export interface CollieWorkspaceFolderConfig {
  name: string;
  uri: string;
  configPath: string | undefined;
}

export interface CollieWorkspaceSettings {
  collie: {
    enableLinting: boolean;
    enableFormatting: boolean;
    configPath: string | undefined;
    workspaceFolders: CollieWorkspaceFolderConfig[];
    trace: {
      server: ServerTrace;
    };
  };
}

const normalizeOptionalString = (value: string | null | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getTrace = (value: string | undefined): ServerTrace => {
  if (value === 'messages' || value === 'verbose') {
    return value;
  }

  return 'off';
};

const getConfiguredLspPath = (): string | undefined => {
  const config = vscode.workspace.getConfiguration(SETTINGS.section);
  const configuredPath = normalizeOptionalString(config.get<string | null>('lspPath'));
  if (configuredPath) {
    return configuredPath;
  }

  const legacyConfig = vscode.workspace.getConfiguration('collie-lsp');
  return normalizeOptionalString(legacyConfig.get<string | null>('serverPath'));
};

export const getConfig = (): CollieConfig => {
  const config = vscode.workspace.getConfiguration(SETTINGS.section);

  return {
    lspPath: getConfiguredLspPath(),
    useBundler: config.get<boolean>('useBundler', false),
    minimumServerVersion: normalizeOptionalString(config.get<string | null>('minimumServerVersion')),
    enableLinting: config.get<boolean>('enableLinting', true),
    enableFormatting: config.get<boolean>('enableFormatting', true),
    configPath: normalizeOptionalString(config.get<string | null>('configPath')),
    trace: {
      server: getTrace(config.get<string>('trace.server', 'off'))
    }
  };
};

export const getExtensionVersion = (context: vscode.ExtensionContext): string => {
  const packageJson = context.extension.packageJSON as { version?: unknown };
  return typeof packageJson.version === 'string' ? packageJson.version : 'unknown';
};

export const resolveConfigPath = (
  config: CollieConfig,
  resource?: vscode.Uri
): string | undefined => {
  if (!config.configPath) {
    return undefined;
  }

  if (path.isAbsolute(config.configPath)) {
    return path.normalize(config.configPath);
  }

  const workspaceFolder = resource
    ? vscode.workspace.getWorkspaceFolder(resource)
    : vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    return path.normalize(config.configPath);
  }

  return path.join(workspaceFolder.uri.fsPath, config.configPath);
};

export const resolveConfigPathForFolder = (
  config: CollieConfig,
  workspaceFolder: vscode.WorkspaceFolder
): string | undefined => {
  if (!config.configPath) {
    return undefined;
  }

  if (path.isAbsolute(config.configPath)) {
    return path.normalize(config.configPath);
  }

  return path.join(workspaceFolder.uri.fsPath, config.configPath);
};

export const getWorkspaceFolderConfig = (
  config: CollieConfig
): CollieWorkspaceFolderConfig[] => {
  return (vscode.workspace.workspaceFolders ?? []).map(folder => ({
    name: folder.name,
    uri: folder.uri.toString(),
    configPath: resolveConfigPathForFolder(config, folder)
  }));
};

export const toInitializationOptions = (
  context: vscode.ExtensionContext,
  config: CollieConfig
): CollieInitializationOptions => ({
  extensionVersion: getExtensionVersion(context),
  enableLinting: config.enableLinting,
  enableFormatting: config.enableFormatting,
  configPath: resolveConfigPath(config),
  workspaceFolders: getWorkspaceFolderConfig(config),
  rootUri: vscode.workspace.workspaceFolders?.[0]?.uri.toString(),
  trace: config.trace.server
});

export const toWorkspaceSettings = (config: CollieConfig): CollieWorkspaceSettings => ({
  collie: {
    enableLinting: config.enableLinting,
    enableFormatting: config.enableFormatting,
    configPath: resolveConfigPath(config),
    workspaceFolders: getWorkspaceFolderConfig(config),
    trace: {
      server: config.trace.server
    }
  }
});
