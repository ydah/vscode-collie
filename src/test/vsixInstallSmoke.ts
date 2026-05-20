import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath
} from '@vscode/test-electron';

const findVsix = (): string => {
  const vsixFiles = fs
    .readdirSync(process.cwd())
    .filter(file => file.endsWith('.vsix'))
    .map(file => ({
      file,
      mtime: fs.statSync(file).mtimeMs
    }))
    .sort((left, right) => right.mtime - left.mtime);

  if (vsixFiles.length === 0) {
    throw new Error('No VSIX file found. Run npm run package first.');
  }

  return path.resolve(vsixFiles[0].file);
};

const main = async (): Promise<void> => {
  const vsixPath = findVsix();
  const vscodeExecutablePath = await downloadAndUnzipVSCode({
    version: process.env.VSCODE_TEST_VERSION ?? 'stable'
  });
  const [cli, ...baseArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
  const args = [
    ...baseArgs,
    '--install-extension',
    vsixPath,
    '--force'
  ];

  const result = childProcess.spawnSync(cli, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    throw new Error([
      `VSIX install smoke failed with exit code ${result.status}`,
      result.stdout,
      result.stderr
    ].join('\n'));
  }

  console.log(`VSIX install smoke passed for ${path.basename(vsixPath)}`);
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
