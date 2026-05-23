import { downloadAndUnzipVSCode } from '@vscode/test-electron';

async function main() {
  try {
    const options = process.env.VSCODE_TEST_VERSION
      ? { version: process.env.VSCODE_TEST_VERSION }
      : {};
    const executablePath = await downloadAndUnzipVSCode(options);
    console.log(`VSCODE_EXECUTABLE_PATH=${executablePath}`);
  } catch (error) {
    console.error('Failed to download VS Code:', error);
    process.exit(1);
  }
}

main();
