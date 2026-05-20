import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as oniguruma from 'vscode-oniguruma';
import * as textmate from 'vscode-textmate';

const extensionRoot = path.resolve(__dirname, '../../..');

const readJson = <T>(relativePath: string): T => {
  const filePath = path.join(extensionRoot, relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
};

suite('Language Asset Tests', () => {
  test('TextMate grammar includes Lrama directives and valid regex patterns', () => {
    const grammar = readJson<{ repository: Record<string, unknown> }>('syntaxes/yacc.tmLanguage.json');
    const serialized = JSON.stringify(grammar);

    assert.match(serialized, /lex-param/);
    assert.match(serialized, /parse-param/);
    assert.match(serialized, /%inline/);
    assert.match(serialized, /named-reference/);

    assertRegexPatternsCompile(grammar);
  });

  test('Language configuration word and indentation patterns compile', () => {
    const config = readJson<{
      wordPattern: string;
      indentationRules: Record<string, string>;
      onEnterRules: Array<{ beforeText: string }>;
    }>('language-configuration.json');

    assert.doesNotThrow(() => new RegExp(config.wordPattern));
    Object.values(config.indentationRules).forEach(pattern => {
      assert.doesNotThrow(() => new RegExp(pattern));
    });
    config.onEnterRules.forEach(rule => {
      assert.doesNotThrow(() => new RegExp(rule.beforeText));
    });
  });

  test('Snippets include Lrama-specific constructs', () => {
    const snippets = readJson<Record<string, { prefix: string | string[] }>>('snippets/yacc.json');
    const prefixes = Object.values(snippets).flatMap(snippet => {
      return Array.isArray(snippet.prefix) ? snippet.prefix : [snippet.prefix];
    });

    assert.ok(prefixes.includes('%token'));
    assert.ok(prefixes.includes('%nterm'));
    assert.ok(prefixes.includes('%empty'));
    assert.ok(prefixes.includes('%destructor'));
    assert.ok(prefixes.includes('%printer'));
  });

  test('TextMate grammar tokenizes representative Lrama constructs', async () => {
    const grammar = await loadGrammar();
    const sample = [
      '%token <node> TOKEN "token"',
      '%rule %inline list(X): X | list(X) X ;',
      'start: TOKEN[name] { $$ = { value: $1 }; } ;'
    ];

    let ruleStack: textmate.StateStack | null = null;
    const tokenScopes = sample.flatMap(line => {
      const result = grammar.tokenizeLine(line, ruleStack);
      ruleStack = result.ruleStack;
      return result.tokens.flatMap(token => token.scopes);
    });

    assert.ok(tokenScopes.includes('keyword.control.directive.yacc'));
    assert.ok(tokenScopes.includes('storage.type.tag.yacc'));
    assert.ok(tokenScopes.includes('string.quoted.double.token-alias.yacc'));
    assert.ok(tokenScopes.includes('keyword.control.inline.yacc'));
    assert.ok(tokenScopes.includes('entity.name.tag.named-reference.yacc'));
    assert.ok(tokenScopes.includes('meta.embedded.block.c.yacc'));
  });
});

const loadGrammar = async (): Promise<textmate.IGrammar> => {
  const wasmPath = require.resolve('vscode-oniguruma/release/onig.wasm');
  const wasm = fs.readFileSync(wasmPath).buffer;
  await oniguruma.loadWASM(wasm);

  const registry = new textmate.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: patterns => new oniguruma.OnigScanner(patterns),
      createOnigString: text => new oniguruma.OnigString(text)
    }),
    loadGrammar: scopeName => {
      if (scopeName !== 'source.yacc') {
        return Promise.resolve(null);
      }

      return Promise.resolve(readJson<textmate.IRawGrammar>('syntaxes/yacc.tmLanguage.json'));
    }
  });

  const grammar = await registry.loadGrammar('source.yacc');
  assert.ok(grammar);
  return grammar;
};

const assertRegexPatternsCompile = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach(assertRegexPatternsCompile);
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  const record = value as Record<string, unknown>;
  ['match', 'begin', 'end'].forEach(key => {
    if (typeof record[key] === 'string') {
      assert.doesNotThrow(() => new RegExp(record[key] as string), `Invalid regex: ${record[key]}`);
    }
  });

  Object.values(record).forEach(assertRegexPatternsCompile);
};
