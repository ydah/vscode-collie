export const EXTENSION_ID = 'ydah.collie';
export const LANGUAGE_ID = 'yacc';
export const OUTPUT_CHANNEL_NAME = 'Collie';

export const COMMANDS = {
  format: 'collie.format',
  lint: 'collie.lint',
  fixAll: 'collie.fixAll',
  restartServer: 'collie.restartServer',
  showOutputChannel: 'collie.showOutputChannel',
  checkSetup: 'collie.checkSetup',
  copyEnvironmentInfo: 'collie.copyEnvironmentInfo',
  createConfig: 'collie.createConfig',
  openConfig: 'collie.openConfig',
  searchSymbols: 'collie.searchSymbols',
  previewSyntaxDiagram: 'collie.previewSyntaxDiagram'
} as const;

export const CONTEXTS = {
  formatSupported: 'collie.formatSupported',
  fixAllSupported: 'collie.fixAllSupported',
  symbolsSupported: 'collie.symbolsSupported',
  syntaxDiagramSupported: 'collie.syntaxDiagramSupported'
} as const;

export const SETTINGS = {
  section: 'collie',
  lspPath: 'collie.lspPath',
  useBundler: 'collie.useBundler',
  enableLinting: 'collie.enableLinting',
  enableFormatting: 'collie.enableFormatting',
  configPath: 'collie.configPath',
  traceServer: 'collie.trace.server',
  legacyServerPath: 'collie-lsp.serverPath'
} as const;
