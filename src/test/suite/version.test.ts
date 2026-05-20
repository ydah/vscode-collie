import * as assert from 'assert';
import {
  compareSemanticVersions,
  extractSemanticVersion,
  isVersionAtLeast
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
});
