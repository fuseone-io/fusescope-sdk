import { describe, expect, it } from 'vitest';
import { globToRegExp, matchesAny } from '../src/glob.js';

describe('globToRegExp', () => {
  it.each([
    ['**/*.js.map', 'a.js.map', true],
    ['**/*.js.map', 'assets/a.js.map', true],
    ['**/*.js.map', 'assets/deep/a.js.map', true],
    ['**/*.js.map', 'assets/a.css.map', false],
    ['*.map', 'assets/a.js.map', true],
    ['assets/*.map', 'assets/a.js.map', true],
    ['assets/*.map', 'assets/x/a.js.map', false],
    ['assets/**', 'assets/x/a.js.map', true],
    ['**/node_modules/**', 'node_modules/p/a.js.map', true],
    ['**/node_modules/**', 'x/node_modules/p/a.js.map', true],
    ['**/vendor-?.js.map', 'vendor-a.js.map', true],
    ['**/vendor-?.js.map', 'vendor-ab.js.map', false],
    ['**/*.{js,mjs}.map', 'a.mjs.map', true],
    ['**/*.{js,mjs}.map', 'a.cjs.map', false],
    ['a+b(1).js.map', 'a+b(1).js.map', true],
    ['./assets/*.map', 'assets/a.js.map', true],
  ])('%s against %s is %s', (glob, path, expected) => {
    expect(globToRegExp(glob).test(path)).toBe(expected);
  });

  it('matchesAny', () => {
    expect(matchesAny('a/b.js.map', ['*.css', '**/b.js.map'])).toBe(true);
    expect(matchesAny('a/b.js.map', [])).toBe(false);
  });
});
