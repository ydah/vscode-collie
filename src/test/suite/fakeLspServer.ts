interface JsonRpcMessage {
  id?: number | string | null;
  method?: string;
  params?: unknown;
}

interface TextDocumentItem {
  uri: string;
  text: string;
}

interface DidOpenTextDocumentParams {
  textDocument: TextDocumentItem;
}

interface DidChangeTextDocumentParams {
  textDocument: {
    uri: string;
  };
  contentChanges: Array<{
    text: string;
  }>;
}

interface TextDocumentParams {
  textDocument: {
    uri: string;
  };
}

interface PositionedTextDocumentParams extends TextDocumentParams {
  position: {
    line: number;
    character: number;
  };
}

interface RenameParams extends PositionedTextDocumentParams {
  newName: string;
}

interface WorkspaceSymbolParams {
  query: string;
}

interface SyntaxDiagramParams extends TextDocumentParams {
  ruleName: string;
}

const documents = new Map<string, string>();
let inputBuffer = Buffer.alloc(0);

if (process.argv.includes('--version')) {
  process.stdout.write('collie-lsp fake 0.0.0\n');
  process.exit(0);
}

const send = (message: unknown): void => {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
};

const respond = (id: number | string | null | undefined, result: unknown): void => {
  if (id === undefined) {
    return;
  }

  send({ jsonrpc: '2.0', id, result });
};

const publishDiagnostics = (uri: string): void => {
  const text = documents.get(uri) ?? '';
  const tokenMatches = [...text.matchAll(/^%token\s+([A-Z_][A-Z0-9_]*)/gm)];
  const seen = new Set<string>();
  const diagnostics = [];

  for (const match of tokenMatches) {
    const token = match[1];
    if (!seen.has(token)) {
      seen.add(token);
      continue;
    }

    diagnostics.push({
      range: {
        start: { line: lineForOffset(text, match.index ?? 0), character: 0 },
        end: { line: lineForOffset(text, match.index ?? 0), character: match[0].length }
      },
      severity: 2,
      source: 'collie',
      code: 'duplicate-token',
      message: `duplicate token ${token}`
    });
  }

  send({
    jsonrpc: '2.0',
    method: 'textDocument/publishDiagnostics',
    params: { uri, diagnostics }
  });
};

const lineForOffset = (text: string, offset: number): number => {
  return text.slice(0, offset).split(/\r?\n/).length - 1;
};

const formatText = (text: string): string => {
  return text
    .replace(/^%token\s+/gm, '%token ')
    .replace(/start\s*:\s*TOKEN\s*;/g, 'start: TOKEN ;');
};

const handleRequest = (message: JsonRpcMessage): void => {
  switch (message.method) {
    case 'initialize':
      respond(message.id, {
        capabilities: {
          textDocumentSync: 1,
          documentFormattingProvider: true,
          definitionProvider: true,
          referencesProvider: true,
          renameProvider: true,
          foldingRangeProvider: true,
          semanticTokensProvider: {
            legend: {
              tokenTypes: ['function'],
              tokenModifiers: []
            },
            full: true
          },
          codeActionProvider: {
            codeActionKinds: ['source.fixAll.collie', 'quickfix']
          },
          documentSymbolProvider: true,
          workspaceSymbolProvider: true,
          experimental: {
            syntaxDiagramProvider: true
          }
        },
        serverInfo: {
          name: 'fake-collie-lsp',
          version: '0.0.0'
        }
      });
      break;
    case 'shutdown':
      respond(message.id, null);
      break;
    case 'textDocument/formatting':
      respond(message.id, formattingEdits(message.params as TextDocumentParams));
      break;
    case 'textDocument/codeAction':
      respond(message.id, fixAllActions(message.params as TextDocumentParams));
      break;
    case 'textDocument/definition':
      respond(message.id, definitionLocations(message.params as PositionedTextDocumentParams));
      break;
    case 'textDocument/references':
      respond(message.id, definitionLocations(message.params as PositionedTextDocumentParams));
      break;
    case 'textDocument/rename':
      respond(message.id, renameEdit(message.params as RenameParams));
      break;
    case 'textDocument/foldingRange':
      respond(message.id, foldingRanges(message.params as TextDocumentParams));
      break;
    case 'textDocument/semanticTokens/full':
      respond(message.id, semanticTokens(message.params as TextDocumentParams));
      break;
    case 'textDocument/documentSymbol':
      respond(message.id, documentSymbols(message.params as TextDocumentParams));
      break;
    case 'workspace/symbol':
      respond(message.id, workspaceSymbols(message.params as WorkspaceSymbolParams));
      break;
    case 'collie/syntaxDiagram':
      respond(message.id, syntaxDiagram(message.params as SyntaxDiagramParams));
      break;
    case 'collie/lint':
      handleLint(message);
      break;
    default:
      if (message.id !== undefined) {
        respond(message.id, null);
      }
  }
};

const handleNotification = (message: JsonRpcMessage): void => {
  switch (message.method) {
    case 'textDocument/didOpen': {
      const params = message.params as DidOpenTextDocumentParams;
      documents.set(params.textDocument.uri, params.textDocument.text);
      publishDiagnostics(params.textDocument.uri);
      break;
    }
    case 'textDocument/didChange': {
      const params = message.params as DidChangeTextDocumentParams;
      const latestChange = params.contentChanges[params.contentChanges.length - 1];
      if (latestChange) {
        documents.set(params.textDocument.uri, latestChange.text);
        publishDiagnostics(params.textDocument.uri);
      }
      break;
    }
    case 'exit':
      process.exit(0);
      break;
  }
};

const handleLint = (message: JsonRpcMessage): void => {
  const params = message.params as TextDocumentParams;
  publishDiagnostics(params.textDocument.uri);
  respond(message.id, null);
};

const formattingEdits = (params: TextDocumentParams): unknown[] => {
  const uri = params.textDocument.uri;
  const text = documents.get(uri) ?? '';
  const formatted = formatText(text);

  return [{
    range: {
      start: { line: 0, character: 0 },
      end: { line: 9999, character: 0 }
    },
    newText: formatted
  }];
};

const fixAllActions = (params: TextDocumentParams): unknown[] => {
  const uri = params.textDocument.uri;
  const text = documents.get(uri) ?? '';
  const deduplicated = text.replace(/^%token\s+([A-Z_][A-Z0-9_]*)\n%token\s+\1\n/m, '%token $1\n');

  return [{
    title: 'Collie: Fix all offenses',
    kind: 'source.fixAll.collie',
    edit: {
      changes: {
        [uri]: [{
          range: {
            start: { line: 0, character: 0 },
            end: { line: 9999, character: 0 }
          },
          newText: deduplicated
        }]
      }
    }
  }];
};

const definitionLocations = (params: PositionedTextDocumentParams): unknown[] => {
  const uri = params.textDocument.uri;
  const text = documents.get(uri) ?? '';
  const rules = extractRules(uri, text);
  const firstRule = rules[0];
  if (!firstRule) {
    return [];
  }

  return [{
    uri,
    range: firstRule.range
  }];
};

const renameEdit = (params: RenameParams): unknown => {
  const uri = params.textDocument.uri;
  const text = documents.get(uri) ?? '';
  const firstRule = extractRules(uri, text)[0];
  if (!firstRule) {
    return { changes: {} };
  }

  return {
    changes: {
      [uri]: [{
        range: firstRule.range,
        newText: params.newName
      }]
    }
  };
};

const foldingRanges = (params: TextDocumentParams): unknown[] => {
  const text = documents.get(params.textDocument.uri) ?? '';
  const lines = text.split(/\r?\n/);
  const rulesStart = lines.findIndex(line => /^\s*%%\s*$/.test(line));
  const rulesEnd = lines.findIndex((line, index) => index > rulesStart && /^\s*%%\s*$/.test(line));

  if (rulesStart === -1 || rulesEnd === -1 || rulesEnd <= rulesStart + 1) {
    return [];
  }

  return [{
    startLine: rulesStart + 1,
    endLine: rulesEnd - 1,
    kind: 'region'
  }];
};

const semanticTokens = (params: TextDocumentParams): unknown => {
  const text = documents.get(params.textDocument.uri) ?? '';
  const firstRule = extractRules(params.textDocument.uri, text)[0];
  if (!firstRule) {
    return { data: [] };
  }

  const range = firstRule.range as {
    start: { line: number; character: number };
    end: { character: number };
  };

  return {
    data: [
      range.start.line,
      range.start.character,
      range.end.character - range.start.character,
      0,
      0
    ]
  };
};

const documentSymbols = (params: TextDocumentParams): unknown[] => {
  const uri = params.textDocument.uri;
  const text = documents.get(uri) ?? '';
  return extractRules(uri, text).map(rule => ({
    name: rule.name,
    kind: 12,
    range: rule.range,
    selectionRange: rule.range
  }));
};

const workspaceSymbols = (params: WorkspaceSymbolParams): unknown[] => {
  const query = params.query.toLowerCase();
  return [...documents.entries()].flatMap(([uri, text]) => {
    return extractRules(uri, text)
      .filter(rule => rule.name.toLowerCase().includes(query))
      .map(rule => ({
        name: rule.name,
        kind: 12,
        containerName: 'grammar',
        location: {
          uri,
          range: rule.range
        }
      }));
  });
};

const extractRules = (_uri: string, text: string): Array<{ name: string; range: unknown }> => {
  return [...text.matchAll(/^\s*(?:%rule\s+)?(?:%inline\s+)?([a-z_][a-z0-9_]*)(?:\s*\([^)]*\))?\s*:/gm)]
    .map(match => {
      const offset = match.index ?? 0;
      const line = lineForOffset(text, offset);
      const character = match[0].search(/[A-Za-z_]/);
      const startCharacter = Math.max(0, character);
      return {
        name: match[1],
        range: {
          start: { line, character: startCharacter },
          end: { line, character: startCharacter + match[1].length }
        }
      };
    });
};

const syntaxDiagram = (params: SyntaxDiagramParams): SyntaxDiagramResponse => {
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" role="img" aria-label="${params.ruleName}">
  <rect x="8" y="20" width="120" height="40" rx="6" fill="#2b579a"/>
  <text x="68" y="45" text-anchor="middle" fill="#fff" font-size="14">${params.ruleName}</text>
  <path d="M128 40 H220" stroke="#888" stroke-width="2"/>
  <rect x="220" y="20" width="92" height="40" rx="6" fill="#444"/>
  <text x="266" y="45" text-anchor="middle" fill="#fff" font-size="14">production</text>
</svg>`
  };
};

interface SyntaxDiagramResponse {
  svg: string;
}

const processMessage = (message: JsonRpcMessage): void => {
  if (message.id === undefined) {
    handleNotification(message);
    return;
  }

  handleRequest(message);
};

const readMessages = (): void => {
  for (;;) {
    const headerEnd = inputBuffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return;
    }

    const header = inputBuffer.toString('ascii', 0, headerEnd);
    const lengthMatch = /Content-Length: (\d+)/i.exec(header);
    if (!lengthMatch) {
      throw new Error('Missing Content-Length header');
    }

    const contentLength = Number(lengthMatch[1]);
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;
    if (inputBuffer.length < messageEnd) {
      return;
    }

    const body = inputBuffer.toString('utf8', messageStart, messageEnd);
    inputBuffer = inputBuffer.subarray(messageEnd);
    processMessage(JSON.parse(body) as JsonRpcMessage);
  }
};

process.stdin.on('data', chunk => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  readMessages();
});
