import * as assert from 'assert';
import {
  compareSemanticVersions,
  extractSemanticVersion,
  isVersionAtLeast,
  requiredServerVersion
} from '../../version';

suite('Version Tests', () => {
  test('extracts semantic version from server output', () => {
    assert.strictEqual(extractSemanticVersion('collie-lsp 1.2.3'), '1.2.3');
    assert.strictEqual(extractSemanticVersion('collie-lsp 1.2.3-beta.1'), '1.2.3-beta.1');
  });

  test('compares semantic versions', () => {
    assert.ok(compareSemanticVersions('1.2.4', '1.2.3') > 0);
    assert.ok(compareSemanticVersions('1.2.3', '1.2.3') === 0);
    assert.ok(compareSemanticVersions('1.2.2', '1.2.3') < 0);
  });

  test('treats unparsable versions as non-blocking', () => {
    assert.strictEqual(isVersionAtLeast('collie-lsp unknown', '1.0.0'), true);
  });

  test('uses configured minimum before extension version', () => {
    assert.strictEqual(requiredServerVersion('1.2.3', '2.0.0'), '1.2.3');
  });

  test('uses extension version as the default server requirement', () => {
    assert.strictEqual(requiredServerVersion(undefined, '0.1.0'), '0.1.0');
  });
});
