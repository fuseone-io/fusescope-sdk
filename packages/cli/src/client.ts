import { VERSION } from './version.js';

export type Fetch = typeof fetch;

export interface ClientOptions {
  url: string;
  apiKey: string;
  fetch?: Fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Retries after the first attempt, on network errors, 429 and 5xx. */
  retries?: number;
  backoffMs?: number;
  timeoutMs?: number;
  onRetry?: (attempt: number, reason: string, delayMs: number) => void;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }

  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

const retryable = (status: number) => status === 429 || status >= 500;

export class Client {
  private readonly base: string;
  private readonly fetch: Fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: ClientOptions) {
    this.base = opts.url.replace(/\/+$/, '');
    this.fetch = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  sourcemapsPath(app: string): string {
    return `/api/v1/rum/applications/${encodeURIComponent(app)}/sourcemaps`;
  }

  /** Sends a request, retrying transient failures. Resolves with the parsed JSON body; rejects with ApiError otherwise. */
  async request(method: string, path: string, query: Record<string, string | undefined>, body?: FormData) {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
    const retries = this.opts.retries ?? 3;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetch(url, {
          method,
          body,
          headers: {
            'SigNoz-Api-Key': this.opts.apiKey,
            'User-Agent': `fusescope-cli/${VERSION}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(this.opts.timeoutMs ?? 120_000),
        });
      } catch (e) {
        if (attempt >= retries) throw new ApiError(0, `cannot reach ${url.origin}: ${describe(e)}`, undefined);
        await this.backoff(attempt, describe(e));
        continue;
      }
      const parsed = await readBody(res);
      if (res.ok) return parsed;
      if (retryable(res.status) && attempt < retries) {
        await this.backoff(attempt, `HTTP ${res.status}`);
        continue;
      }
      throw new ApiError(res.status, errorMessage(res.status, parsed), parsed);
    }
  }

  private async backoff(attempt: number, reason: string) {
    const delay = (this.opts.backoffMs ?? 1000) * 2 ** attempt;
    this.opts.onRetry?.(attempt + 1, reason, delay);
    await this.sleep(delay);
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function describe(e: unknown): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  if (err?.name === 'TimeoutError') return 'timed out';
  return err?.cause?.code ?? err?.cause?.message ?? err?.message ?? String(e);
}

/** The server's error message: the SigNoz envelope `{ error: { message } }`, `{ message }`, or text. */
export function errorMessage(status: number, body: unknown): string {
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : undefined);
  const b = (body ?? {}) as { error?: unknown; message?: unknown };
  const message = text(body) ?? text(b.error) ?? text((b.error as { message?: unknown })?.message) ?? text(b.message);
  return message ? `HTTP ${status}: ${message}` : `HTTP ${status}`;
}
