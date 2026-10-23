import type { Fetch } from './client.js';

export interface Io {
  env: Record<string, string | undefined>;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  fetch?: Fetch;
  sleep?: (ms: number) => Promise<void>;
}

export const EXIT = { ok: 0, failed: 1, usage: 2, auth: 3 } as const;
