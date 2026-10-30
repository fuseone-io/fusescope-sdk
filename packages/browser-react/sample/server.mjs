// Local sample and OTLP recorder; use ?endpoint=...&applicationId=...&publicKey=... for a real FuseScope.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 4500);
let exports = [];

const json = (res, value) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(value));
};

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/__received') return json(res, { exports, preflights: [], api: [] });
  if (path === '/__reset') {
    exports = [];
    return json(res, {});
  }
  if (req.method === 'POST' && (path === '/rum/v1/traces' || path === '/rum/v1/logs')) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    exports.push({
      signal: path.endsWith('/traces') ? 'traces' : 'logs',
      key: req.headers['fusescope-rum-key'] ?? null,
      contentType: req.headers['content-type'],
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    });
    return json(res, {});
  }
  const file =
    path === '/sample.js' ? 'dist/sample.js' : path === '/sample.js.map' ? 'dist/sample.js.map' : 'index.html';
  const content = await readFile(new URL(file, import.meta.url));
  res.writeHead(200, {
    'content-type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.map') ? 'application/json' : 'text/html',
  });
  res.end(content);
}).listen(port, '127.0.0.1', () => console.log(`React sample: http://127.0.0.1:${port}`));
