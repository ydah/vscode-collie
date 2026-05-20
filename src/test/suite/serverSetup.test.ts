import * as assert from 'assert';
import {
  executableNamesForPlatform,
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
    const candidates = getServerLaunchCandidates({
      ...baseConfig,
      lspPath: '/custom/collie-lsp'
    });

    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].command, '/custom/collie-lsp');
    assert.strictEqual(candidates[0].source, 'custom');
  });
});
