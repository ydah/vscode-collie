import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as oniguruma from 'vscode-oniguruma';
import * as textmate from 'vscode-textmate';

const extensionRoot = path.resolve(__dirname, '../../..');

interface ExtensionManifest {
  contributes: {
    walkthroughs?: WalkthroughContribution[];
    problemPatterns?: ProblemPatternContribution[];
    problemMatchers?: ProblemMatcherContribution[];
  };
}

interface WalkthroughContribution {
  id: string;
  steps: WalkthroughStepContribution[];
}

interface WalkthroughStepContribution {
  id: string;
  media?: {
    markdown?: string;
  };
}

interface ProblemPatternContribution {
  name: string;
  regexp: string;
}

interface ProblemMatcherContribution {
  name: string;
  pattern: string;
}

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
    const snippets = readJson<Record<string, { prefix: string | string[]; body: string[] }>>('snippets/yacc.json');
    const prefixes = Object.values(snippets).flatMap(snippet => {
      return Array.isArray(snippet.prefix) ? snippet.prefix : [snippet.prefix];
    });
    const snippetBody = (name: string): string => snippets[name].body.join('\n');

    assert.ok(prefixes.includes('%token'));
    assert.ok(prefixes.includes('%nterm'));
    assert.ok(prefixes.includes('%empty'));
    assert.ok(prefixes.includes('%destructor'));
    assert.ok(prefixes.includes('%printer'));
    assert.ok(prefixes.includes('lrama-rule'));
    assert.ok(prefixes.includes('parameterized-rule'));
    assert.ok(prefixes.includes('parameterized-call'));
    assert.ok(prefixes.includes('named-reference-action'));
    assert.match(snippetBody('Lrama Rule Directive'), /^%rule \$\{1:rule_name\}:/);
    assert.match(snippetBody('Parameterized Rule'), /^%rule \$\{1:rule_name\}\(\$\{2:Item\}\):/);
    assert.ok(snippetBody('Parameterized Rule Call').includes('${1:rule_name}(${2:SYMBOL})'));
    assert.ok(snippetBody('Named Reference Action').includes('${2:LEFT}[${3:left}]'));
    assert.ok(snippetBody('Named Reference Action').includes('\\$${3:left}'));
  });

  test('Getting Started walkthrough references packaged markdown files', () => {
    const manifest = readJson<ExtensionManifest>('package.json');
    const walkthrough = manifest.contributes.walkthroughs?.find(item => {
      return item.id === 'collie.gettingStarted';
    });

    assert.ok(walkthrough);
    assert.deepStrictEqual(
      walkthrough.steps.map(step => step.id),
      [
        'collie.installServer',
        'collie.openGrammar',
        'collie.configureRules',
        'collie.useTasks'
      ]
    );

    walkthrough.steps.forEach(step => {
      assert.ok(step.media?.markdown, `Missing markdown media for ${step.id}`);
      assert.ok(
        fs.existsSync(path.join(extensionRoot, step.media.markdown)),
        `Missing walkthrough media file: ${step.media.markdown}`
      );
    });
  });

  test('Problem matchers include line-column and line-only Collie patterns', () => {
    const manifest = readJson<ExtensionManifest>('package.json');
    const patterns = manifest.contributes.problemPatterns ?? [];
    const matchers = manifest.contributes.problemMatchers ?? [];
    const locationPattern = patterns.find(pattern => pattern.name === 'collie-location');
    const linePattern = patterns.find(pattern => pattern.name === 'collie-line');

    assert.ok(matchers.some(matcher => {
      return matcher.name === 'collie' && matcher.pattern === '$collie-location';
    }));
    assert.ok(matchers.some(matcher => {
      return matcher.name === 'collie-line' && matcher.pattern === '$collie-line';
    }));
    assert.ok(locationPattern);
    assert.ok(linePattern);
    assert.ok(
      new RegExp(locationPattern.regexp).test('grammar.y:12:8: error: duplicate token TOKEN')
    );
    assert.ok(
      new RegExp(linePattern.regexp).test('grammar.y:12: warning: duplicate token TOKEN')
    );
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
