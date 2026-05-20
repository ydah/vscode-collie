import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const fakeServerPath = path.resolve(__dirname, './suite/fakeLspServer.js');
    const extensionTestsEnv = process.env.COLLIE_LSP_REAL_SERVER === '1'
      ? undefined
      : {
        COLLIE_LSP_TEST_SERVER: fakeServerPath
      };

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      version: process.env.VSCODE_TEST_VERSION,
      extensionTestsEnv
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
