import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { Window } from 'happy-dom';
import { afterAll, describe, expect, it } from 'vitest';
import * as esm from '../../src/index';

const dist = (file: string) => readFileSync(join(import.meta.dirname, '../../dist', file));
const { version } = JSON.parse(readFileSync(join(import.meta.dirname, '../../package.json'), 'utf8')) as {
  version: string;
};

describe('script-tag bundle', () => {
  const window = new Window({ url: 'https://shop.example/' });
  afterAll(() => window.happyDOM.close());

  it('exposes the ESM API as window.FuseScope', () => {
    // Runs like a classic <script>: top-level `var` becomes a window property, strict mode or not.
    new Script(dist('fusescope.min.js').toString('utf8'), { filename: 'fusescope.min.js' }).runInContext(window);
    const global = (window as unknown as { FuseScope: typeof esm }).FuseScope;
    expect(typeof global.init).toBe('function');
    expect(Object.keys(global).sort()).toEqual(Object.keys(esm).sort());
    expect(global.VERSION).toBe(version);
  });

  it('ships an SRI file matching the bundle', () => {
    const sri = `sha384-${createHash('sha384').update(dist('fusescope.min.js')).digest('base64')}`;
    expect(dist('fusescope.min.js.sri').toString('utf8')).toBe(`${sri}\n`);
  });
});
