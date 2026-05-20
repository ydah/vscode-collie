import * as assert from 'assert';
import * as childProcess from 'child_process';
import * as os from 'os';
import * as path from 'path';

interface JsonRpcMessage {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
}

const LSP_TIMEOUT_MS = 5000;

class LspProcess {
  private readonly child = childProcess.spawn('collie-lsp', ['--stdio'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env
  });
  private buffer = Buffer.alloc(0);
  private readonly pending = new Map<number | string, (message: JsonRpcMessage) => void>();
  private nextId = 1;

  constructor() {
    this.child.stdout.on('data', chunk => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.readMessages();
    });

    this.child.stderr.on('data', chunk => {
      process.stderr.write(chunk);
    });
  }

  request(method: string, params: unknown): Promise<JsonRpcMessage> {
    const id = this.nextId;
    this.nextId += 1;
    this.send({ jsonrpc: '2.0', id, method, params });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, LSP_TIMEOUT_MS);

      this.pending.set(id, message => {
        clearTimeout(timeout);
        resolve(message);
      });
    });
  }

  notify(method: string, params?: unknown): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  stop(): void {
    this.notify('exit');
    this.child.kill();
  }

  private send(message: unknown): void {
    const body = JSON.stringify(message);
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
  }

  private readMessages(): void {
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }

      const header = this.buffer.toString('ascii', 0, headerEnd);
      const lengthMatch = /Content-Length: (\d+)/i.exec(header);
      if (!lengthMatch) {
        throw new Error('Missing Content-Length header');
      }

      const contentLength = Number(lengthMatch[1]);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      if (this.buffer.length < messageEnd) {
        return;
      }

      const body = this.buffer.toString('utf8', messageStart, messageEnd);
      this.buffer = this.buffer.subarray(messageEnd);
      const message = JSON.parse(body) as JsonRpcMessage;
      if (message.id !== undefined) {
        this.pending.get(message.id)?.(message);
        this.pending.delete(message.id);
      }
    }
  }
}

const main = async (): Promise<void> => {
  const lsp = new LspProcess();
  try {
    const rootUri = `file://${process.cwd()}`;
    const initialize = await lsp.request('initialize', {
      processId: process.pid,
      rootUri,
      capabilities: {}
    });
    const initializeResult = initialize.result as {
      capabilities?: Record<string, unknown>;
      serverInfo?: { name?: string; version?: string };
    };

    assert.strictEqual(initializeResult.serverInfo?.name, 'collie-lsp');
    assert.ok(initializeResult.serverInfo?.version);
    assert.strictEqual(initializeResult.capabilities?.documentFormattingProvider, true);
    assert.strictEqual(initializeResult.capabilities?.documentSymbolProvider, true);
    assert.strictEqual(initializeResult.capabilities?.definitionProvider, true);
    assert.strictEqual(initializeResult.capabilities?.referencesProvider, true);
    assert.strictEqual(initializeResult.capabilities?.renameProvider, true);
    assert.strictEqual(initializeResult.capabilities?.workspaceSymbolProvider, true);
    assert.strictEqual(initializeResult.capabilities?.foldingRangeProvider, true);

    lsp.notify('initialized', {});

    const uri = `file://${path.join(os.tmpdir(), `collie-probe-${Date.now()}.y`)}`;
    lsp.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'yacc',
        version: 1,
        text: '%token TOKEN\n%%\nstart: TOKEN ;\n%%'
      }
    });

    const documentSymbols = await lsp.request('textDocument/documentSymbol', {
      textDocument: { uri }
    });
    assert.ok(Array.isArray(documentSymbols.result));

    await lsp.request('shutdown', null);
  } finally {
    lsp.stop();
  }

  console.log('Real collie-lsp protocol probe passed');
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
