import { describe, expect, it } from 'vitest';
import { debugIdFromMap, debugIdFromSource } from '../src/debugid.js';

const id = '85314830-023f-4cf1-a267-535f4e37bb17';

describe('debugIdFromMap', () => {
  it.each([
    [JSON.stringify({ version: 3, debugId: id }), id],
    [JSON.stringify({ version: 3, debug_id: id.toUpperCase() }), id],
    [JSON.stringify({ version: 3 }), undefined],
    [JSON.stringify({ version: 3, debugId: 'not-a-uuid' }), undefined],
    [JSON.stringify({ version: 3, debugId: 42 }), undefined],
  ])('%s', (text, expected) => {
    expect(debugIdFromMap(JSON.parse(text))).toBe(expected);
  });
});

describe('debugIdFromSource', () => {
  it.each([
    [`console.log(1);\n//# debugId=${id}\n//# sourceMappingURL=a.js.map\n`, id],
    [`console.log(1);\n//# debugId=${id}`, id],
    [`console.log(1);\n//@ debugId=${id}\n`, id],
    ['console.log("//# debugId=nope");\n', undefined],
    ['console.log(1);\n', undefined],
  ])('%j', (text, expected) => {
    expect(debugIdFromSource(text)).toBe(expected);
  });

  it('takes the last comment', () => {
    const other = '00000000-0000-4000-8000-000000000000';
    expect(debugIdFromSource(`//# debugId=${other}\nx();\n//# debugId=${id}\n`)).toBe(id);
  });
});
