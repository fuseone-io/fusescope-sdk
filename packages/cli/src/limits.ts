const MiB = 1024 * 1024;

export const LIMITS = {
  maxFileBytes: 50 * MiB,
  maxBatchBytes: 25 * MiB,
  maxBatchFiles: 100,
  maxReleaseFiles: 1000,
};

export type Limits = typeof LIMITS;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < MiB) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / MiB).toFixed(1)} MB`;
}
