import * as path from 'path';
import * as childProcess from 'child_process';
import { runTests } from '@vscode/test-electron';

const DOWNLOAD_ATTEMPTS = 3;
const executablePathPrefix = 'VSCODE_EXECUTABLE_PATH=';

const runDownloadProcess = (
  downloadScriptPath: string
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string }> => {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(process.execPath, [downloadScriptPath], {
      env: process.env
    });
    let stdout = '';

    child.stdout.on('data', chunk => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', chunk => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout }));
  });
};

const extractExecutablePath = (stdout: string): string | undefined => {
  return stdout
    .split(/\r?\n/)
    .find(line => line.startsWith(executablePathPrefix))
    ?.slice(executablePathPrefix.length);
};

const downloadVSCodeWithRetries = async (
  downloadScriptPath: string
): Promise<string> => {
  let lastExit: string | undefined;

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    const result = await runDownloadProcess(downloadScriptPath);
    const executablePath = extractExecutablePath(result.stdout);
    if (result.code === 0 && executablePath) {
      return executablePath;
    }

    lastExit = result.signal ?? String(result.code);
    if (attempt < DOWNLOAD_ATTEMPTS) {
      console.warn(`VS Code download failed (${lastExit}); retrying ${attempt + 1}/${DOWNLOAD_ATTEMPTS}`);
    }
  }

  throw new Error(`VS Code download failed after ${DOWNLOAD_ATTEMPTS} attempts (${lastExit ?? 'unknown'})`);
};

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const downloadScriptPath = path.resolve(__dirname, './downloadVSCode.js');
    const fakeServerPath = path.resolve(__dirname, './suite/fakeLspServer.js');
    const vscodeExecutablePath = await downloadVSCodeWithRetries(downloadScriptPath);
    const inheritedEnv = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => {
        return typeof entry[1] === 'string';
      })
    );
    const extensionTestsEnv = process.env.COLLIE_LSP_REAL_SERVER === '1'
      ? {
        ...inheritedEnv,
        COLLIE_LSP_REAL_SERVER: '1',
        RBENV_VERSION: process.env.RBENV_VERSION ?? ''
      }
      : {
        ...inheritedEnv,
        COLLIE_LSP_TEST_NODE: process.execPath,
        COLLIE_LSP_TEST_SERVER: fakeServerPath
      };

    // Download VS Code, unzip it and run the integration test
    await runTests({
      vscodeExecutablePath,
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
