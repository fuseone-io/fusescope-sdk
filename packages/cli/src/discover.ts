import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { Rejection } from './batch.js';
import { debugIdFromMap, debugIdFromSource } from './debugid.js';
import { matchesAny } from './glob.js';
import { LIMITS } from './limits.js';
import { urlPath } from './urlpath.js';

export interface SourceMapFile {
  path: string;
  relPath: string;
  urlPath: string;
  size: number;
  debugId?: string;
}

export interface DiscoverOptions {
  include: string[];
  ignore: string[];
  urlPrefix: string;
}

/** Finds the source maps under `dir`. Maps that are not JSON are returned as `invalid`, with paths relative to `dir`. */
export async function discoverSourceMaps(
  dir: string,
  opts: DiscoverOptions,
): Promise<{ files: SourceMapFile[]; invalid: Rejection[] }> {
  const info = await stat(dir).catch(() => undefined);
  if (!info?.isDirectory()) throw new Error(`${dir} is not a directory`);

  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const relPaths = entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join('/'))
    .filter((rel) => matchesAny(rel, opts.include) && !matchesAny(rel, opts.ignore))
    .sort();

  const files: SourceMapFile[] = [];
  const invalid: Rejection[] = [];
  for (const relPath of relPaths) {
    const path = join(dir, relPath);
    const { size } = await stat(path);
    const file: SourceMapFile = { path, relPath, urlPath: urlPath(relPath, opts.urlPrefix), size };
    if (size <= LIMITS.maxFileBytes) {
      let map: unknown;
      try {
        map = JSON.parse(await readFile(path, 'utf8'));
      } catch {
        invalid.push({ file: relPath, reason: 'not a valid JSON source map' });
        continue;
      }
      file.debugId = debugIdFromMap(map) ?? (await debugIdOfGenerated(path));
    }
    files.push(file);
  }
  return { files, invalid };
}

async function debugIdOfGenerated(mapPath: string): Promise<string | undefined> {
  const source = await readFile(mapPath.replace(/\.map$/, ''), 'utf8').catch(() => undefined);
  return source === undefined ? undefined : debugIdFromSource(source);
}
