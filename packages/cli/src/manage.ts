import type { DeleteCommand, ListCommand } from './args.js';
import { Client } from './client.js';
import { EXIT, type Io } from './io.js';
import { formatBytes } from './limits.js';

const client = (cmd: ListCommand | DeleteCommand, io: Io) =>
  new Client({ url: cmd.url, apiKey: cmd.apiKey, fetch: io.fetch, sleep: io.sleep });

export async function list(cmd: ListCommand, io: Io): Promise<number> {
  const c = client(cmd, io);
  const body = await c.request('GET', c.sourcemapsPath(cmd.app), { release: cmd.release });
  const data = (body as { data?: unknown })?.data ?? body;
  if (cmd.json) {
    io.stdout(`${JSON.stringify(data, null, 2)}\n`);
    return EXIT.ok;
  }
  const { releases, files } = (data ?? {}) as { releases?: unknown; files?: unknown };
  const rows = Array.isArray(data)
    ? data
    : cmd.release && Array.isArray(files) && files.length
      ? files
      : (releases ?? files);
  if (!Array.isArray(rows) || !rows.length) {
    io.stdout(cmd.release ? `No source maps for release ${cmd.release}.\n` : 'No source maps uploaded.\n');
    return EXIT.ok;
  }
  io.stdout(table(rows.map(row)));
  return EXIT.ok;
}

export async function remove(cmd: DeleteCommand, io: Io): Promise<number> {
  const c = client(cmd, io);
  await c.request('DELETE', c.sourcemapsPath(cmd.app), { release: cmd.release });
  io.stdout(`Deleted release ${cmd.release} of ${cmd.app}.\n`);
  return EXIT.ok;
}

const pick = (o: Record<string, unknown>, ...keys: string[]) =>
  keys.map((k) => o[k]).find((v) => v !== undefined && v !== null);

function row(r: unknown): Record<string, string> {
  const o = (r ?? {}) as Record<string, unknown>;
  const size = pick(o, 'size', 'sizeBytes', 'bytes', 'totalSize');
  const files = pick(o, 'files', 'fileCount', 'count');
  return {
    RELEASE: String(pick(o, 'release', 'version') ?? ''),
    FILE: String(pick(o, 'path', 'urlPath', 'name', 'debugId') ?? ''),
    FILES: Array.isArray(files) ? String(files.length) : String(files ?? ''),
    SIZE: typeof size === 'number' ? formatBytes(size) : String(size ?? ''),
    UPLOADED: String(pick(o, 'uploadedAt', 'createdAt', 'updatedAt') ?? ''),
  };
}

function table(rows: Record<string, string>[]): string {
  const cols = Object.keys(rows[0] as object).filter((c) => rows.some((r) => r[c]));
  const width = (c: string) => Math.max(c.length, ...rows.map((r) => (r[c] as string).length));
  const line = (r: Record<string, string>) =>
    `${cols
      .map((c) => (r[c] as string).padEnd(width(c)))
      .join('  ')
      .trimEnd()}\n`;
  return line(Object.fromEntries(cols.map((c) => [c, c]))) + rows.map(line).join('');
}
