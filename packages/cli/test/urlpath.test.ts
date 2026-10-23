import { describe, expect, it } from 'vitest';
import { urlPath } from '../src/urlpath.js';

describe('urlPath', () => {
  it.each([
    ['assets/index-abc.js.map', '/', '/assets/index-abc.js.map'],
    ['assets/index-abc.js.map', '', '/assets/index-abc.js.map'],
    ['assets/index-abc.js.map', '/static', '/static/assets/index-abc.js.map'],
    ['assets/index-abc.js.map', '/static/', '/static/assets/index-abc.js.map'],
    ['assets/index-abc.js.map', 'static', '/static/assets/index-abc.js.map'],
    ['assets/index-abc.js.map', 'https://cdn.example.com/app/', '/app/assets/index-abc.js.map'],
    ['assets/index-abc.js.map', '//cdn.example.com/app', '/app/assets/index-abc.js.map'],
    ['assets\\win\\a.js.map', '/', '/assets/win/a.js.map'],
    ['a b.js.map', '/', '/a%20b.js.map'],
  ])('%s with prefix %j is %s', (rel, prefix, expected) => {
    expect(urlPath(rel, prefix)).toBe(expected);
  });
});
