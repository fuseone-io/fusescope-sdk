import { readFile, rm } from 'node:fs/promises';
import { basename } from 'node:path';
import type { UploadCommand } from './args.js';
import { planBatches, type Rejection } from './batch.js';
import { ApiError, Client } from './client.js';
import { discoverSourceMaps, type SourceMapFile } from './discover.js';
import { EXIT, type Io } from './io.js';
import { formatBytes, LIMITS } from './limits.js';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const total = (files: SourceMapFile[]) => files.reduce((n, f) => n + f.size, 0);

export async function upload(cmd: UploadCommand, io: Io): Promise<number> {
  const { files, invalid } = await discoverSourceMaps(cmd.dir, cmd);
  const { batches, rejected } = planBatches(files, LIMITS);
  rejected.unshift(...invalid);
  const sendable = batches.flat();
  if (!sendable.length && !rejected.length) {
    io.stderr(`No source maps found under ${cmd.dir} (include: ${cmd.include.join(', ')}).\n`);
    return EXIT.failed;
  }

  if (cmd.dryRun) {
    for (const f of sendable)
      io.stdout(`  ${f.urlPath}  ${formatBytes(f.size)}${f.debugId ? `  debugId=${f.debugId}` : ''}\n`);
    io.stdout(
      `Dry run: would upload ${plural(sendable.length, 'file')} (${formatBytes(total(sendable))}) ` +
        `in ${plural(batches.length, 'request')} to release ${cmd.release}. Nothing was sent.\n`,
    );
    return report(rejected, io);
  }

  const app = cmd.app as string;
  const client = new Client({
    url: cmd.url as string,
    apiKey: cmd.apiKey as string,
    fetch: io.fetch,
    sleep: io.sleep,
    onRetry: (n, reason, ms) => io.stderr(`  ${reason}; retry ${n} in ${(ms / 1000).toFixed(1)}s\n`),
  });

  const accepted: SourceMapFile[] = [];
  for (const [i, batch] of batches.entries()) {
    const tag = `[${i + 1}/${batches.length}]`;
    try {
      const body = await client.request(
        'POST',
        client.sourcemapsPath(app),
        { release: cmd.release },
        await encode(batch),
      );
      const refused = serverRejections(body);
      rejected.push(...refused);
      const refusedPaths = new Set(refused.map((r) => r.file));
      const ok = batch.filter((f) => !refusedPaths.has(f.urlPath));
      accepted.push(...ok);
      io.stdout(`${tag} ${plural(ok.length, 'file')}, ${formatBytes(total(ok))} uploaded\n`);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (e.status === 400 || e.status === 413) {
        rejected.push(...batch.map((f) => ({ file: f.urlPath, reason: e.message })));
        io.stdout(`${tag} ${plural(batch.length, 'file')} rejected\n`);
        continue;
      }
      io.stderr(`Upload failed: ${e.message}${hint(e)}\n`);
      return e.isAuth ? EXIT.auth : EXIT.failed;
    }
  }

  io.stdout(
    `Uploaded to ${app} · release ${cmd.release} · ${plural(accepted.length, 'file')} · ${formatBytes(total(accepted))}\n`,
  );
  if (cmd.deleteAfter && accepted.length) {
    await Promise.all(accepted.map((f) => rm(f.path, { force: true })));
    io.stdout(`Deleted ${plural(accepted.length, 'source map')} from ${cmd.dir}\n`);
  }
  return report(rejected, io);
}

/**
 * One multipart part per map, named by its URL path; `debug_ids` maps URL paths to debug IDs.
 */
async function encode(batch: SourceMapFile[]): Promise<FormData> {
  const form = new FormData();
  const debugIds: Record<string, string> = {};
  for (const f of batch) {
    form.append(f.urlPath, new Blob([await readFile(f.path)], { type: 'application/json' }), basename(f.path));
    if (f.debugId) debugIds[f.urlPath] = f.debugId;
  }
  if (Object.keys(debugIds).length) form.append('debug_ids', JSON.stringify(debugIds));
  return form;
}

function serverRejections(body: unknown): Rejection[] {
  const data = (body as { data?: unknown })?.data ?? body;
  const list = (data as { rejected?: unknown })?.rejected;
  if (!Array.isArray(list)) return [];
  return list.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const file = String(o.path ?? o.file ?? o.name ?? o.debugId ?? '?');
    return { file, reason: String(o.reason ?? o.error ?? o.message ?? 'rejected') };
  });
}

function report(rejected: Rejection[], io: Io): number {
  if (!rejected.length) return EXIT.ok;
  io.stderr(`Rejected ${plural(rejected.length, 'file')}:\n`);
  for (const r of rejected) io.stderr(`  ${r.file}: ${r.reason}\n`);
  return EXIT.failed;
}

export function hint(e: ApiError): string {
  if (e.status === 401) return ' (check --api-key / FUSESCOPE_API_KEY)';
  if (e.status === 403) return ' (the API key needs the Editor role)';
  if (e.status === 404) return ' (check --app / FUSESCOPE_APP and --url)';
  return '';
}
