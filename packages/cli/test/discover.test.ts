import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverSourceMaps } from '../src/discover.js';

const mapId = '85314830-023f-4cf1-a267-535f4e37bb17';
const jsId = '00000000-0000-4000-8000-000000000001';
const defaults = {
  include: ['**/*.js.map', '**/*.mjs.map'],
  ignore: ['**/node_modules/**'],
  urlPrefix: '/',
};

let dir: string;
const put = (rel: string, body: string) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), body);
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fusescope-cli-'));
  put('assets/index-abc.js.map', JSON.stringify({ version: 3, debugId: mapId, mappings: '' }));
  put('assets/index-abc.js', 'x();\n');
  put('assets/chunk-def.mjs.map', JSON.stringify({ version: 3, mappings: '' }));
  put('assets/chunk-def.mjs', `y();\n//# debugId=${jsId}\n`);
  put('plain.js.map', JSON.stringify({ version: 3, mappings: '' }));
  put('assets/style.css.map', '{}');
  put('node_modules/pkg/lib.js.map', '{}');
  put('broken.js.map', '{not json');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('discoverSourceMaps', () => {
  it('finds JS source maps with URL paths and debug IDs, sorted', async () => {
    const { files, invalid } = await discoverSourceMaps(dir, defaults);
    expect(files.map(({ relPath, urlPath, debugId }) => ({ relPath, urlPath, debugId }))).toEqual([
      { relPath: 'assets/chunk-def.mjs.map', urlPath: '/assets/chunk-def.mjs.map', debugId: jsId },
      { relPath: 'assets/index-abc.js.map', urlPath: '/assets/index-abc.js.map', debugId: mapId },
      { relPath: 'plain.js.map', urlPath: '/plain.js.map', debugId: undefined },
    ]);
    expect(files[0]?.path).toBe(join(dir, 'assets/chunk-def.mjs.map'));
    expect(files[0]?.size).toBeGreaterThan(0);
    expect(invalid).toEqual([{ file: 'broken.js.map', reason: 'not a valid JSON source map' }]);
  });

  it('applies the URL prefix', async () => {
    const { files } = await discoverSourceMaps(dir, { ...defaults, urlPrefix: '/static/' });
    expect(files.map((f) => f.urlPath)).toContain('/static/assets/index-abc.js.map');
  });

  it('applies include and ignore globs', async () => {
    const { files } = await discoverSourceMaps(dir, {
      ...defaults,
      include: ['assets/**/*.map'],
      ignore: ['**/*.css.map'],
    });
    expect(files.map((f) => f.relPath)).toEqual(['assets/chunk-def.mjs.map', 'assets/index-abc.js.map']);
  });

  it('fails clearly when the directory does not exist', async () => {
    await expect(discoverSourceMaps(join(dir, 'missing'), defaults)).rejects.toThrow(/missing/);
  });
});
