import { describe, expect, it } from 'vitest';
import { type QueryPolicy, scrubAttributes, scrubStack, scrubText, scrubUrl } from '../src/scrub';

describe('scrubUrl', () => {
  it.each([
    ['https://shop.example/cart?email=a@b.c&token=x#pay', [], 'https://shop.example/cart'],
    ['https://shop.example/search?q=shoes&utm_source=ad', ['utm_source'], 'https://shop.example/search?utm_source=ad'],
    ['/api/orders?id=7#x', [], '/api/orders'],
    ['/api/orders', [], '/api/orders'],
    ['http://[bad?secret=1', [], 'http://[bad'],
    ['https://shop.example/search?q=shoes#top', '*', 'https://shop.example/search?q=shoes'],
  ])('%s with %j', (input, allowed, want) => {
    expect(scrubUrl(input, allowed as QueryPolicy)).toBe(want);
  });
});

describe('scrubAttributes', () => {
  it('rewrites URL attributes and leaves the others', () => {
    const out = scrubAttributes(
      {
        'url.full': 'https://a.example/x?k=v',
        'url.query': 'k=v&keep=1',
        'url.fragment': 'frag',
        'browser.document.url.full': 'https://a.example/p?email=a@b.c',
        'http.request.method': 'GET',
        'http.response.status_code': 200,
      },
      ['keep'],
    );
    expect(out).toEqual({
      'url.full': 'https://a.example/x',
      'url.query': 'keep=1',
      'url.fragment': '',
      'browser.document.url.full': 'https://a.example/p',
    });
  });
});

describe('scrubText', () => {
  it.each([
    ['Navigation: /customers/392#tab?email=a@b.c', 'Navigation: /customers/392'],
    ['GET https://api.example/u?token=abc failed', 'GET https://api.example/u failed'],
    ['view', 'view'],
    ['Failed to fetch /a?x=1 and /b#y', 'Failed to fetch /a and /b'],
  ])('%s', (input, want) => {
    expect(scrubText(input, [])).toBe(want);
  });

  it('keeps text untouched when every query parameter is kept', () => {
    expect(scrubText('GET /u?id=1', '*')).toBe('GET /u?id=1');
  });
});

describe('scrubStack', () => {
  it('keeps line and column numbers', () => {
    expect(
      scrubStack(
        'Error: GET /u?id=1\n    at f (https://a.example/app.js?v=3:10:5)\n    at https://a.example/b.js#x:2:1',
        [],
      ),
    ).toBe('Error: GET /u\n    at f (https://a.example/app.js:10:5)\n    at https://a.example/b.js:2:1');
  });
});
