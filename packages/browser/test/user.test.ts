import { describe, expect, it } from 'vitest';
import { userAttributes } from '../src/user';

describe('userAttributes', () => {
  it('hashes the id', async () => {
    expect(await userAttributes({ id: 'alice@example.com' }, true)).toEqual({
      'user.hash': 'ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976',
    });
  });

  it('keeps the raw id when hashing is turned off', async () => {
    expect(await userAttributes({ id: 'u-42' }, false)).toEqual({ 'user.id': 'u-42' });
  });

  it('clears the user', async () => {
    expect(await userAttributes(null, true)).toEqual({});
  });
});
