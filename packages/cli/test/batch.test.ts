import { describe, expect, it } from 'vitest';
import { planBatches } from '../src/batch.js';
import type { SourceMapFile } from '../src/discover.js';

const f = (name: string, size: number): SourceMapFile => ({
  path: `/d/${name}`,
  relPath: name,
  urlPath: `/${name}`,
  size,
});
const names = (b: SourceMapFile[][]) => b.map((x) => x.map((y) => y.relPath));

describe('planBatches', () => {
  const limits = { maxFileBytes: 100, maxBatchBytes: 100, maxBatchFiles: 3, maxReleaseFiles: 10 };

  it('packs files in order up to the byte budget', () => {
    const { batches, rejected } = planBatches([f('a', 40), f('b', 40), f('c', 40), f('d', 10)], limits);
    expect(names(batches)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(rejected).toEqual([]);
  });

  it('caps the number of files per batch', () => {
    const { batches } = planBatches([f('a', 1), f('b', 1), f('c', 1), f('d', 1)], limits);
    expect(names(batches)).toEqual([['a', 'b', 'c'], ['d']]);
  });

  it('sends a file as large as the budget on its own', () => {
    const { batches } = planBatches([f('a', 10), f('b', 100), f('c', 10)], limits);
    expect(names(batches)).toEqual([['a'], ['b'], ['c']]);
  });

  it('rejects files over the per-file limit', () => {
    const { batches, rejected } = planBatches([f('a', 10), f('big', 101)], limits);
    expect(names(batches)).toEqual([['a']]);
    expect(rejected).toEqual([{ file: '/big', reason: expect.stringMatching(/limit/) }]);
  });

  it('rejects everything over the per-release file count', () => {
    const files = Array.from({ length: 11 }, (_, i) => f(`m${i}`, 1));
    expect(() => planBatches(files, limits)).toThrow(/11 source maps.*10/);
  });

  it('returns no batches for no files', () => {
    expect(planBatches([], limits)).toEqual({ batches: [], rejected: [] });
  });
});
