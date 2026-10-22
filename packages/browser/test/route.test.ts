import { describe, expect, it } from 'vitest';
import { defaultRoute } from '../src/route';

describe('defaultRoute', () => {
  it.each([
    ['/orders/123/items/9f86d081-884c-4d63-8f2b-1d1e7c3f6a10', '/orders/:id/items/:id'],
    ['/settings/profile', '/settings/profile'],
    ['/blob/0123456789abcdef0123', '/blob/:id'],
    ['/', '/'],
  ])('%s', (path, want) => {
    expect(defaultRoute(path)).toBe(want);
  });
});
