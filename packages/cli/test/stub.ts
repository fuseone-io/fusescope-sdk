import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Recorded {
  method: string;
  url: URL;
  headers: IncomingHttpHeaders;
  form?: FormData;
}

export type Reply = { status: number; body?: unknown } | 'drop';

/** A local HTTP server that records requests and answers from a queue (default 200 `{status:"success"}`). */
export async function startStub() {
  const requests: Recorded[] = [];
  const replies: Reply[] = [];
  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks);
    const ct = req.headers['content-type'];
    const rec: Recorded = {
      method: req.method ?? '',
      url: new URL(req.url ?? '/', 'http://stub'),
      headers: req.headers,
    };
    if (ct?.startsWith('multipart/form-data'))
      rec.form = await new Response(raw, { headers: { 'content-type': ct } }).formData();
    requests.push(rec);
    const reply = replies.shift() ?? { status: 200, body: { status: 'success', data: {} } };
    if (reply === 'drop') {
      req.socket.destroy();
      return;
    }
    res.writeHead(reply.status, { 'content-type': 'application/json' });
    res.end(reply.body === undefined ? '' : JSON.stringify(reply.body));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    replies,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
