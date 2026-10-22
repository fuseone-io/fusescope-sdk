import type { SessionProvider } from '@opentelemetry/browser-sdk/session';
import { isSampled } from './sampling';

export interface SessionRecord {
  id: string;
  previousId?: string;
  startedAt: number;
  lastActiveAt: number;
  sampled: boolean;
}

export interface SessionOptions {
  inactivityTimeoutMs: number;
  maxDurationMs: number;
  sampleRate: number;
}

export interface KeyValueStore {
  get(): string | null;
  set(value: string): void;
}

export type SessionListener = (session: SessionRecord, previous?: SessionRecord) => void;

export const STORAGE_KEY = 'fusescope.session';
const TOUCH_WRITE_INTERVAL_MS = 5_000;

export function newSessionId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function isExpired(s: SessionRecord, now: number, o: SessionOptions): boolean {
  return now - s.lastActiveAt > o.inactivityTimeoutMs || now - s.startedAt > o.maxDurationMs;
}

function parse(raw: string | null | undefined): SessionRecord | undefined {
  if (!raw) return undefined;
  try {
    const s = JSON.parse(raw) as SessionRecord;
    return typeof s?.id === 'string' ? s : undefined;
  } catch {
    return undefined;
  }
}

export function localStorageStore(): KeyValueStore {
  return {
    get: () => {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    },
    set: (v) => {
      try {
        localStorage.setItem(STORAGE_KEY, v);
      } catch {
        // Storage unavailable: the session stays per tab.
      }
    },
  };
}

/**
 * One session per browser: tabs share it through `localStorage`, and `storage`
 * events carry rotations from other tabs. The sampling decision is stored with
 * the session so every tab and signal agrees.
 */
export class SessionManager implements SessionProvider {
  private current: SessionRecord | undefined;
  private lastWrite = 0;
  private readonly listeners: SessionListener[] = [];
  private readonly onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    const next = parse(e.newValue);
    if (!next) return;
    const previous = this.current;
    this.current = next;
    if (next.id !== previous?.id) this.emit(next, previous);
  };

  constructor(
    private readonly options: SessionOptions,
    private readonly store: KeyValueStore = localStorageStore(),
    private readonly now: () => number = Date.now,
    private readonly makeId: () => string = newSessionId,
  ) {
    this.current = parse(store.get());
    this.touch();
    if (typeof window !== 'undefined') window.addEventListener('storage', this.onStorage);
  }

  onChange(listener: SessionListener): void {
    this.listeners.push(listener);
  }

  getSessionId(): string {
    return this.get().id;
  }

  get(): SessionRecord {
    return this.touch(false);
  }

  /** Records user activity, rotating the session if it expired. */
  touch(activity = true): SessionRecord {
    const now = this.now();
    const base = parse(this.store.get()) ?? this.current;
    const previous = this.current;
    let session: SessionRecord;
    if (base && !isExpired(base, now, this.options)) {
      session = activity ? { ...base, lastActiveAt: now } : base;
      if (activity && now - this.lastWrite > TOUCH_WRITE_INTERVAL_MS) this.write(session, now);
    } else {
      const id = this.makeId();
      session = {
        id,
        previousId: base?.id,
        startedAt: now,
        lastActiveAt: now,
        sampled: isSampled(id, this.options.sampleRate),
      };
      this.write(session, now);
    }
    this.current = session;
    if (previous?.id !== session.id) this.emit(session, previous);
    return session;
  }

  dispose(): void {
    if (typeof window !== 'undefined') window.removeEventListener('storage', this.onStorage);
    this.listeners.length = 0;
  }

  private write(session: SessionRecord, now: number): void {
    this.store.set(JSON.stringify(session));
    this.lastWrite = now;
  }

  private emit(session: SessionRecord, previous?: SessionRecord): void {
    for (const l of this.listeners) l(session, previous);
  }
}
