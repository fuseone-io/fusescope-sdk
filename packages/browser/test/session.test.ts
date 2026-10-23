import { afterEach, describe, expect, it, vi } from 'vitest';
import { type KeyValueStore, SessionManager, STORAGE_KEY } from '../src/session';

const options = { inactivityTimeoutMs: 15 * 60_000, maxDurationMs: 4 * 3_600_000, sampleRate: 1 };

function memoryStore(): KeyValueStore & { value: string | null } {
  const s = {
    value: null as string | null,
    get: () => s.value,
    set: (v: string) => {
      s.value = v;
    },
  };
  return s;
}

function harness(store = memoryStore(), sampleRate = 1) {
  const clock = { now: 1_000_000 };
  let n = 0;
  const make = () =>
    new SessionManager(
      { ...options, sampleRate },
      store,
      () => clock.now,
      () => `${++n}`.padStart(8, '0').padEnd(32, '0'),
    );
  return { clock, store, make };
}

describe('SessionManager', () => {
  it('rotates after inactivity and keeps the previous id', () => {
    const { clock, make } = harness();
    const m = make();
    const first = m.get().id;
    clock.now += 16 * 60_000;
    const s = m.get();
    expect(s.id).not.toBe(first);
    expect(s.previousId).toBe(first);
  });

  it('activity extends the session', () => {
    const { clock, make } = harness();
    const m = make();
    const first = m.get().id;
    for (let i = 0; i < 10; i++) {
      clock.now += 10 * 60_000;
      m.touch();
    }
    expect(m.get().id).toBe(first);
  });

  it('rotates at max duration despite activity', () => {
    const { clock, make } = harness();
    const m = make();
    const first = m.get().id;
    for (let i = 0; i < 25; i++) {
      clock.now += 10 * 60_000;
      m.touch();
    }
    expect(m.get().id).not.toBe(first);
  });

  it('shares the session and its rotation between tabs', () => {
    const { clock, store, make } = harness();
    const tabA = make();
    const tabB = make();
    expect(tabB.get().id).toBe(tabA.get().id);
    clock.now += 16 * 60_000;
    const rotated = tabA.get().id;
    expect(tabB.get().id).toBe(rotated);
    expect(store.value).toContain(rotated);
  });

  it('follows rotations announced by storage events', () => {
    const { make } = harness();
    const m = make();
    const seen: string[] = [];
    m.onChange((s) => seen.push(s.id));
    const other = { id: 'f'.repeat(32), startedAt: 1_000_000, lastActiveAt: 1_000_000, sampled: true };
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(other) }));
    expect(seen).toEqual([other.id]);
    m.dispose();
  });

  it('implements the upstream SessionProvider', () => {
    const { make } = harness();
    const m = make();
    expect(m.getSessionId()).toBe(m.get().id);
  });

  it('decides sampling once per session', () => {
    const { make } = harness(memoryStore(), 0);
    expect(make().get().sampled).toBe(false);
  });

  it('ignores corrupt storage', () => {
    const store = memoryStore();
    store.value = '{not json';
    const { make } = harness(store);
    expect(make().get().id).toHaveLength(32);
  });
});

describe('SessionManager on the wall clock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const make = () => new SessionManager(options, memoryStore());

  it('rotates after inactivity with session.previous_id', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const m = make();
    const first = m.get();
    vi.advanceTimersByTime(14 * 60_000);
    expect(m.get().id).toBe(first.id);
    vi.advanceTimersByTime(2 * 60_000);
    const next = m.get();
    expect(next.id).toMatch(/^[0-9a-f]{32}$/);
    expect(next.id).not.toBe(first.id);
    expect(next.previousId).toBe(first.id);
  });

  it('rotates at max duration with session.previous_id', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const m = make();
    const first = m.get().id;
    for (let t = 0; t < 4 * 60; t += 10) {
      vi.advanceTimersByTime(10 * 60_000);
      m.touch();
    }
    expect(m.get().id).toBe(first);
    vi.advanceTimersByTime(10 * 60_000);
    const next = m.touch();
    expect(next.id).not.toBe(first);
    expect(next.previousId).toBe(first);
  });
});
