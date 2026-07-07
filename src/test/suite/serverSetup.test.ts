import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  executableNamesForPlatform,
  extractCollieLspGemVersion,
  getServerLaunchCandidates
} from '../../serverSetup';
import { CollieConfig } from '../../config';

const baseConfig: CollieConfig = {
  lspPath: undefined,
  useBundler: false,
  minimumServerVersion: undefined,
  enableLinting: true,
  enableFormatting: true,
  configPath: undefined,
  trace: {
    server: 'off'
  }
};

suite('Server Setup Tests', () => {
  test('test server uses injected node executable', () => {
    const testServer = process.env.COLLIE_LSP_TEST_SERVER;
    const testNode = process.env.COLLIE_LSP_TEST_NODE;
    process.env.COLLIE_LSP_TEST_SERVER = path.join(path.sep, 'tmp', 'fakeLspServer.js');
    process.env.COLLIE_LSP_TEST_NODE = path.join(path.sep, 'tmp', 'node');

    try {
      const candidates = getServerLaunchCandidates(baseConfig);

      assert.strictEqual(candidates.length, 1);
      assert.strictEqual(candidates[0].command, path.join(path.sep, 'tmp', 'node'));
      assert.deepStrictEqual(candidates[0].args, [
        path.join(path.sep, 'tmp', 'fakeLspServer.js'),
        '--stdio'
      ]);
      assert.strictEqual(candidates[0].source, 'test');
    } finally {
      if (testServer) {
        process.env.COLLIE_LSP_TEST_SERVER = testServer;
      } else {
        delete process.env.COLLIE_LSP_TEST_SERVER;
      }

      if (testNode) {
        process.env.COLLIE_LSP_TEST_NODE = testNode;
      } else {
        delete process.env.COLLIE_LSP_TEST_NODE;
      }
    }
  });

  test('uses cmd and bat binstubs on Windows', () => {
    assert.deepStrictEqual(
      executableNamesForPlatform('win32'),
      ['collie-lsp.cmd', 'collie-lsp.bat', 'collie-lsp']
    );
  });

  test('uses executable name directly on POSIX platforms', () => {
    assert.deepStrictEqual(executableNamesForPlatform('darwin'), ['collie-lsp']);
    assert.deepStrictEqual(executableNamesForPlatform('linux'), ['collie-lsp']);
  });

  test('custom path short-circuits launch candidate resolution', () => {
    const testServer = process.env.COLLIE_LSP_TEST_SERVER;
    delete process.env.COLLIE_LSP_TEST_SERVER;

    try {
      const candidates = getServerLaunchCandidates({
        ...baseConfig,
        lspPath: '/custom/collie-lsp'
      });

      assert.strictEqual(candidates.length, 1);
      assert.strictEqual(candidates[0].command, '/custom/collie-lsp');
      assert.strictEqual(candidates[0].source, 'custom');
    } finally {
      if (testServer) {
        process.env.COLLIE_LSP_TEST_SERVER = testServer;
      }
    }
  });

  test('custom path uses the requested workspace folder as cwd', () => {
    const testServer = process.env.COLLIE_LSP_TEST_SERVER;
    delete process.env.COLLIE_LSP_TEST_SERVER;
    const folder = {
      uri: vscode.Uri.file(path.join(path.sep, 'tmp', 'workspace-b')),
      name: 'workspace-b',
      index: 1
    };

    try {
      const candidates = getServerLaunchCandidates({
        ...baseConfig,
        lspPath: '/custom/collie-lsp'
      }, folder);

      assert.strictEqual(candidates[0].cwd, path.join(path.sep, 'tmp', 'workspace-b'));
    } finally {
      if (testServer) {
        process.env.COLLIE_LSP_TEST_SERVER = testServer;
      }
    }
  });

  test('extracts collie-lsp gem version from gem list output', () => {
    assert.strictEqual(
      extractCollieLspGemVersion('collie-lsp (0.3.1)'),
      '0.3.1'
    );
    assert.strictEqual(
      extractCollieLspGemVersion('collie-lsp (0.3.1, 0.2.0)'),
      '0.3.1'
    );
    assert.strictEqual(extractCollieLspGemVersion(''), undefined);
  });
});
