// Test fixture: serves the page and the bundle on APP_PORT, and emulates the
// RUM gateway plus a cross-origin API on API_PORT. Records what it receives.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const APP_PORT = Number(process.env.APP_PORT ?? 4400);
const API_PORT = Number(process.env.API_PORT ?? 4401);
const root = new URL('..', import.meta.url);

let received = { exports: [], preflights: [], api: [] };

const body = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

const json = (res, status, value, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(value));
};

const cors = (req) => ({
  'access-control-allow-origin': req.headers.origin ?? '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'content-type, fusescope-rum-key, traceparent',
  'access-control-max-age': '600',
  vary: 'origin',
});

const recordApi = (req, port) =>
  received.api.push({ port, host: req.headers.host, url: req.url, traceparent: req.headers.traceparent ?? null });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/__received') return json(res, 200, received);
  if (url.pathname === '/__reset') {
    received = { exports: [], preflights: [], api: [] };
    return json(res, 200, {});
  }
  if (url.pathname.startsWith('/api/')) {
    recordApi(req, APP_PORT);
    return json(res, 200, { ok: true });
  }
  if (url.pathname.startsWith('/dist/')) {
    const file = await readFile(new URL(`.${url.pathname}`, root)).catch(() => null);
    if (!file) return json(res, 404, {});
    res.writeHead(200, { 'content-type': 'text/javascript' });
    return res.end(file);
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(await readFile(new URL('e2e/index.html', root)));
}).listen(APP_PORT);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') {
    received.preflights.push({
      url: url.pathname,
      method: req.headers['access-control-request-method'],
      headers: req.headers['access-control-request-headers'],
      origin: req.headers.origin,
    });
    res.writeHead(204, cors(req));
    return res.end();
  }
  if (url.pathname === '/rum/v1/traces' || url.pathname === '/rum/v1/logs') {
    received.exports.push({
      signal: url.pathname.endsWith('traces') ? 'traces' : 'logs',
      key: req.headers['fusescope-rum-key'] ?? null,
      contentType: req.headers['content-type'],
      body: JSON.parse(await body(req)),
    });
    return json(res, 200, {}, cors(req));
  }
  recordApi(req, API_PORT);
  return json(res, 200, { ok: true }, cors(req));
}).listen(API_PORT);

console.log(`app http://localhost:${APP_PORT}, gateway and API http://127.0.0.1:${API_PORT}`);
