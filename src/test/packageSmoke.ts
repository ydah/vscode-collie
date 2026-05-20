import * as fs from 'fs';
import * as path from 'path';

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x02014b50;
const MAX_COMMENT_LENGTH = 0xffff;
const MAX_VSIX_SIZE_BYTES = 20 * 1024 * 1024;

const readZipEntries = (zipPath: string): string[] => {
  const buffer = fs.readFileSync(zipPath);
  const searchStart = Math.max(0, buffer.length - MAX_COMMENT_LENGTH - 22);

  let endOfCentralDirectory = -1;
  for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      endOfCentralDirectory = offset;
      break;
    }
  }

  if (endOfCentralDirectory === -1) {
    throw new Error(`${zipPath} is not a valid VSIX zip archive`);
  }

  const entryCount = buffer.readUInt16LE(endOfCentralDirectory + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(endOfCentralDirectory + 16);
  const entries: string[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) {
      throw new Error(`Invalid central directory header in ${zipPath}`);
    }

    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;

    entries.push(buffer.toString('utf8', fileNameStart, fileNameEnd));
    offset = fileNameEnd + extraFieldLength + commentLength;
  }

  return entries;
};

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

const requireEntry = (entries: string[], entry: string): void => {
  if (!entries.includes(entry)) {
    throw new Error(`Packaged VSIX is missing ${entry}`);
  }
};

const rejectEntryPrefix = (entries: string[], prefix: string): void => {
  const match = entries.find(entry => entry.startsWith(prefix));
  if (match) {
    throw new Error(`Packaged VSIX unexpectedly includes ${match}`);
  }
};

const main = (): void => {
  const vsixPath = findVsix();
  const { size } = fs.statSync(vsixPath);
  if (size > MAX_VSIX_SIZE_BYTES) {
    throw new Error(`${path.basename(vsixPath)} is too large: ${size} bytes`);
  }

  const entries = readZipEntries(vsixPath);

  requireEntry(entries, 'extension/package.json');
  requireEntry(entries, 'extension/out/extension.js');
  rejectEntryPrefix(entries, 'extension/src/');
  rejectEntryPrefix(entries, 'extension/.github/');

  if (!entries.some(entry => entry.startsWith('extension/node_modules/vscode-languageclient/'))) {
    throw new Error('Packaged VSIX is missing vscode-languageclient runtime dependency');
  }

  console.log(`VSIX smoke test passed for ${path.basename(vsixPath)}`);
};

main();
