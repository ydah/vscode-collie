import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  CollieConfig,
  getWorkspaceFolderConfig,
  resolveConfigPath,
  resolveConfigPathForFolder,
  toWorkspaceSettings
} from '../../config';

const baseConfig: CollieConfig = {
  lspPath: undefined,
  useBundler: false,
  minimumServerVersion: undefined,
  enableLinting: true,
  enableFormatting: true,
  configPath: '.collie.yml',
  trace: {
    server: 'off'
  }
};

suite('Config Tests', () => {
  test('resolves relative config path without workspace as a normalized path', () => {
    assert.strictEqual(resolveConfigPath(baseConfig), path.normalize('.collie.yml'));
  });

  test('resolves relative config path against a workspace folder', () => {
    const folder = {
      uri: vscode.Uri.file(path.join(path.sep, 'tmp', 'project')),
      name: 'project',
      index: 0
    };

    assert.strictEqual(
      resolveConfigPathForFolder(baseConfig, folder),
      path.join(path.sep, 'tmp', 'project', '.collie.yml')
    );
  });

  test('keeps absolute config path stable', () => {
    const absolutePath = path.join(path.sep, 'tmp', 'custom.yml');
    const config = { ...baseConfig, configPath: absolutePath };

    assert.strictEqual(resolveConfigPath(config), absolutePath);
  });

  test('workspace settings include per-folder config metadata', () => {
    const settings = toWorkspaceSettings(baseConfig);
    assert.deepStrictEqual(settings.collie.workspaceFolders, getWorkspaceFolderConfig(baseConfig));
  });
});
