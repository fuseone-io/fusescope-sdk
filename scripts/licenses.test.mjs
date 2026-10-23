import assert from 'node:assert/strict';
import { test } from 'node:test';
import { check, parseReport } from './licenses.mjs';

const pkg = (name, version) => ({ name, versions: [version] });

test('accepts permissive licences and SPDX alternatives', () => {
  assert.deepEqual(
    check({ MIT: [pkg('a', '1.0.0')], 'Apache-2.0': [pkg('b', '1.0.0')], '(MIT OR GPL-3.0)': [pkg('c', '1.0.0')] }),
    [],
  );
});

test('rejects copyleft and source-available licences', () => {
  for (const license of ['GPL-3.0', 'AGPL-3.0-only', 'LGPL-2.1', 'SSPL-1.0', 'BUSL-1.1']) {
    assert.match(check({ [license]: [pkg('x', '1.0.0')] })[0], /forbidden/, license);
  }
});

test('rejects licences outside the allowlist', () => {
  assert.match(check({ 'CC-BY-4.0': [pkg('x', '1.0.0')] })[0], /not in/);
});

test('rejects ua-parser-js 2.x whatever it declares', () => {
  assert.equal(check({ MIT: [pkg('ua-parser-js', '1.0.40')] }).length, 0);
  assert.match(check({ MIT: [pkg('ua-parser-js', '2.0.0')] })[0], /AGPL/);
});

test('reads a package without production dependencies as an empty report', () => {
  assert.deepEqual(parseReport('No licenses in packages found\n'), {});
  assert.deepEqual(parseReport(''), {});
  assert.deepEqual(parseReport('{"MIT":[]}'), { MIT: [] });
});
