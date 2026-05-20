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
          codeActionProvider: {
            codeActionKinds: ['source.fixAll.collie', 'quickfix']
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
