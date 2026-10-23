import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main } from '../src/cli.js';
import { startStub } from './stub.js';

const KEY = 'sk-super-secret-key';
const debugId = '85314830-023f-4cf1-a267-535f4e37bb17';

let dir: string;
let stub: Awaited<ReturnType<typeof startStub>>;
let out: string;
let err: string;

const put = (rel: string, body: string) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), body);
};

const run = (...argv: string[]) =>
  main(argv, {
    env: { FUSESCOPE_URL: stub.url, FUSESCOPE_API_KEY: KEY, FUSESCOPE_APP: 'web-shop' },
    stdout: (s) => {
      out += s;
    },
    stderr: (s) => {
      err += s;
    },
    sleep: async () => {},
  });

beforeEach(async () => {
  out = '';
  err = '';
  dir = mkdtempSync(join(tmpdir(), 'fusescope-cli-it-'));
  put('assets/index-abc.js.map', JSON.stringify({ version: 3, debugId, mappings: 'AAAA' }));
  put('assets/index-abc.js', 'x();\n');
  put('assets/vendor-def.js.map', JSON.stringify({ version: 3, mappings: 'BBBB' }));
  stub = await startStub();
});

afterEach(async () => {
  await stub.close();
  rmSync(dir, { recursive: true, force: true });
});

const noSecret = () => {
  expect(out).not.toContain(KEY);
  expect(err).not.toContain(KEY);
};

describe('sourcemaps upload', () => {
  it('posts one multipart request with headers, release and a part per map', async () => {
    expect(await run('sourcemaps', 'upload', dir, '--release', '1.8.0')).toBe(0);
    expect(stub.requests).toHaveLength(1);
    const [req] = stub.requests;
    expect(req?.method).toBe('POST');
    expect(req?.url.pathname).toBe('/api/v1/rum/applications/web-shop/sourcemaps');
    expect(req?.url.searchParams.get('release')).toBe('1.8.0');
    expect(req?.headers['signoz-api-key']).toBe(KEY);
    expect(req?.headers['user-agent']).toMatch(/^fusescope-cli\//);
    expect(req?.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);

    const form = req?.form as FormData;
    const index = form.get('/assets/index-abc.js.map') as File;
    const vendor = form.get('/assets/vendor-def.js.map') as File;
    expect(index.name).toBe('index-abc.js.map');
    expect(JSON.parse(await index.text())).toMatchObject({ mappings: 'AAAA' });
    expect(JSON.parse(await vendor.text())).toMatchObject({ mappings: 'BBBB' });
    expect(JSON.parse(form.get('debug_ids') as string)).toEqual({ '/assets/index-abc.js.map': debugId });

    expect(out).toMatch(/\[1\/1\] 2 files/);
    expect(out).toMatch(/Uploaded to web-shop · release 1\.8\.0 · 2 files · \d/);
    noSecret();
  });

  it('applies --url-prefix to the field names', async () => {
    await run('sourcemaps', 'upload', dir, '--release', '1', '--url-prefix', '/static/');
    expect(stub.requests[0]?.form?.has('/static/assets/index-abc.js.map')).toBe(true);
  });

  it('retries 5xx and dropped connections, then succeeds', async () => {
    stub.replies.push({ status: 503 }, 'drop', { status: 502 });
    expect(await run('sourcemaps', 'upload', dir, '--release', '1')).toBe(0);
    expect(stub.requests).toHaveLength(4);
    expect(err).toMatch(/retry 1/i);
    expect(err).toMatch(/HTTP 503/);
  });

  it('gives up after the retries and exits 1', async () => {
    stub.replies.push({ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 });
    expect(await run('sourcemaps', 'upload', dir, '--release', '1')).toBe(1);
    expect(stub.requests).toHaveLength(4);
    expect(err).toMatch(/HTTP 500/);
  });

  it.each([401, 403])('exits 3 on HTTP %i without retrying or printing the key', async (status) => {
    stub.replies.push({
      status,
      body: { status: 'error', error: { code: 'unauthenticated', message: 'invalid key' } },
    });
    expect(await run('sourcemaps', 'upload', dir, '--release', '1', '--api-key', KEY)).toBe(3);
    expect(stub.requests).toHaveLength(1);
    expect(err).toMatch(/invalid key/);
    noSecret();
  });

  it('exits 1 on an unknown application', async () => {
    stub.replies.push({ status: 404, body: { status: 'error', error: { message: 'application not found' } } });
    expect(await run('sourcemaps', 'upload', dir, '--release', '1')).toBe(1);
    expect(err).toMatch(/application not found/);
  });

  it('reports files the server rejected and exits 1', async () => {
    stub.replies.push({
      status: 200,
      body: { status: 'success', data: { rejected: [{ path: '/assets/vendor-def.js.map', reason: 'no sources' }] } },
    });
    expect(await run('sourcemaps', 'upload', dir, '--release', '1')).toBe(1);
    expect(out).toMatch(/1 file/);
    expect(err).toMatch(/\/assets\/vendor-def\.js\.map: no sources/);
  });

  it('reports a 413 batch as rejected files', async () => {
    stub.replies.push({ status: 413, body: { status: 'error', error: { message: 'too large' } } });
    expect(await run('sourcemaps', 'upload', dir, '--release', '1')).toBe(1);
    expect(err).toMatch(/\/assets\/index-abc\.js\.map: HTTP 413: too large/);
  });

  it('rejects maps that are not JSON before sending', async () => {
    put('broken.js.map', 'nope');
    expect(await run('sourcemaps', 'upload', dir, '--release', '1')).toBe(1);
    expect(stub.requests[0]?.form?.has('/broken.js.map')).toBe(false);
    expect(err).toMatch(/broken\.js\.map: not a valid JSON source map/);
  });

  it('--delete-after removes the uploaded maps but keeps the bundles', async () => {
    expect(await run('sourcemaps', 'upload', dir, '--release', '1', '--delete-after')).toBe(0);
    expect(existsSync(join(dir, 'assets/index-abc.js.map'))).toBe(false);
    expect(existsSync(join(dir, 'assets/vendor-def.js.map'))).toBe(false);
    expect(readFileSync(join(dir, 'assets/index-abc.js'), 'utf8')).toBe('x();\n');
    expect(out).toMatch(/Deleted 2 source maps/);
  });

  it('--delete-after keeps maps the server rejected', async () => {
    stub.replies.push({
      status: 200,
      body: { data: { rejected: [{ file: '/assets/vendor-def.js.map', error: 'bad' }] } },
    });
    await run('sourcemaps', 'upload', dir, '--release', '1', '--delete-after');
    expect(existsSync(join(dir, 'assets/index-abc.js.map'))).toBe(false);
    expect(existsSync(join(dir, 'assets/vendor-def.js.map'))).toBe(true);
  });

  it('--dry-run sends nothing and deletes nothing', async () => {
    expect(await run('sourcemaps', 'upload', dir, '--release', '1', '--dry-run', '--delete-after')).toBe(0);
    expect(stub.requests).toHaveLength(0);
    expect(existsSync(join(dir, 'assets/index-abc.js.map'))).toBe(true);
    expect(out).toContain('/assets/index-abc.js.map');
    expect(out).toContain(debugId);
    expect(out).toMatch(/dry run/i);
  });

  it('exits 1 when there is nothing to upload', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'fusescope-cli-empty-'));
    expect(await run('sourcemaps', 'upload', empty, '--release', '1')).toBe(1);
    expect(err).toMatch(/no source maps/i);
    rmSync(empty, { recursive: true });
  });

  it('exits 2 on usage errors', async () => {
    expect(await run('sourcemaps', 'upload', dir)).toBe(2);
    expect(err).toMatch(/--release/);
  });
});

describe('sourcemaps list and delete', () => {
  it('lists releases', async () => {
    stub.replies.push({
      status: 200,
      body: {
        status: 'success',
        data: [{ release: '1.8.0', files: 14, size: 6_500_000, uploadedAt: '2026-10-22T08:58:00Z' }],
      },
    });
    expect(await run('sourcemaps', 'list')).toBe(0);
    expect(stub.requests[0]?.method).toBe('GET');
    expect(stub.requests[0]?.url.pathname).toBe('/api/v1/rum/applications/web-shop/sourcemaps');
    expect(stub.requests[0]?.headers['signoz-api-key']).toBe(KEY);
    expect(out).toMatch(/1\.8\.0/);
    expect(out).toMatch(/14/);
  });

  it('lists the files of one release', async () => {
    stub.replies.push({
      status: 200,
      body: {
        status: 'success',
        data: {
          releases: [{ release: '1.8.0', files: 2, sizeBytes: 900 }],
          files: [
            { path: '/assets/index-abc.js.map', sizeBytes: 600 },
            { path: '/assets/vendor-def.js.map', sizeBytes: 300 },
          ],
        },
      },
    });
    expect(await run('sourcemaps', 'list', '--release', '1.8.0')).toBe(0);
    expect(out).toMatch(/\/assets\/index-abc\.js\.map/);
    expect(out).toMatch(/\/assets\/vendor-def\.js\.map/);
  });

  it('lists as JSON', async () => {
    stub.replies.push({ status: 200, body: { status: 'success', data: [{ release: '1' }] } });
    expect(await run('sourcemaps', 'list', '--json', '--release', '1')).toBe(0);
    expect(stub.requests[0]?.url.searchParams.get('release')).toBe('1');
    expect(JSON.parse(out)).toEqual([{ release: '1' }]);
  });

  it('deletes a release', async () => {
    expect(await run('sourcemaps', 'delete', '--release', '1.7.1')).toBe(0);
    expect(stub.requests[0]?.method).toBe('DELETE');
    expect(stub.requests[0]?.url.searchParams.get('release')).toBe('1.7.1');
    expect(out).toMatch(/Deleted release 1\.7\.1/);
  });

  it('exits 3 on auth failure', async () => {
    stub.replies.push({ status: 401 });
    expect(await run('sourcemaps', 'delete', '--release', '1')).toBe(3);
    noSecret();
  });
});
