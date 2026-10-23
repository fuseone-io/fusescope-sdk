import type { SourceMapFile } from './discover.js';
import { formatBytes, type Limits } from './limits.js';

export interface Rejection {
  file: string;
  reason: string;
}

/** Splits files, in order, into requests within the byte and file budgets. Files over the per-file limit are rejected. */
export function planBatches(
  files: SourceMapFile[],
  limits: Limits,
): { batches: SourceMapFile[][]; rejected: Rejection[] } {
  if (files.length > limits.maxReleaseFiles)
    throw new Error(
      `found ${files.length} source maps; a release holds at most ${limits.maxReleaseFiles}. Narrow them with --include or --ignore.`,
    );
  const batches: SourceMapFile[][] = [];
  const rejected: Rejection[] = [];
  let current: SourceMapFile[] = [];
  let bytes = 0;
  for (const f of files) {
    if (f.size > limits.maxFileBytes) {
      rejected.push({
        file: f.urlPath,
        reason: `${formatBytes(f.size)} is over the ${formatBytes(limits.maxFileBytes)} limit`,
      });
      continue;
    }
    if (current.length && (bytes + f.size > limits.maxBatchBytes || current.length >= limits.maxBatchFiles)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(f);
    bytes += f.size;
  }
  if (current.length) batches.push(current);
  return { batches, rejected };
}
