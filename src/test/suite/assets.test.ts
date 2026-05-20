import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

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
});

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
