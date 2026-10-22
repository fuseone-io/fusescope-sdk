import { describe, expect, it } from 'vitest';
import { type BrowserConfig, resolveConfig, tracingUrlMatchers } from '../src/config';

const base: BrowserConfig = {
  applicationId: 'shop-web',
  publicKey: 'rum_pub_123',
  endpoint: 'https://fusescope.example.com/',
};

describe('resolveConfig', () => {
  it('applies defaults', () => {
    const c = resolveConfig(base);
    expect(c.tracesUrl).toBe('https://fusescope.example.com/rum/v1/traces');
    expect(c.logsUrl).toBe('https://fusescope.example.com/rum/v1/logs');
    expect(c.headers).toEqual({ 'FuseScope-RUM-Key': 'rum_pub_123' });
    expect(c.sessionSampleRate).toBe(1);
    expect(c.service).toBe('shop-web');
    expect(c.session).toEqual({ inactivityTimeoutMs: 15 * 60_000, maxDurationMs: 4 * 3_600_000 });
    expect(c.privacy).toEqual({ allowedQueryParams: [], hashUserId: true });
    expect(c.requireConsent).toBe(false);
    expect(c.instrumentations).toEqual({
      documentLoad: true,
      fetch: true,
      xhr: true,
      userActions: true,
      webVitals: true,
      errors: true,
    });
  });

  it('keeps a path prefix on the endpoint', () => {
    expect(resolveConfig({ ...base, endpoint: 'https://x.example/fusescope' }).tracesUrl).toBe(
      'https://x.example/fusescope/rum/v1/traces',
    );
  });

  it('keeps allow-listed query parameters', () => {
    expect(resolveConfig({ ...base, privacy: { queryAllowlist: ['utm_source'] } }).privacy.allowedQueryParams).toEqual([
      'utm_source',
    ]);
  });

  it('keeps every query parameter when dropQuery is false', () => {
    expect(resolveConfig({ ...base, privacy: { dropQuery: false } }).privacy.allowedQueryParams).toBe('*');
  });

  it('lets instrumentations be turned off one by one', () => {
    expect(resolveConfig({ ...base, instrumentations: { xhr: false } }).instrumentations.xhr).toBe(false);
  });

  it.each([
    [{ applicationId: '' }, 'applicationId'],
    [{ publicKey: '' }, 'publicKey'],
    [{ endpoint: 'not a url' }, 'endpoint'],
    [{ sessionSampleRate: 1.5 }, 'sessionSampleRate'],
    [{ sessionSampleRate: -0.1 }, 'sessionSampleRate'],
  ])('rejects %j', (override, field) => {
    expect(() => resolveConfig({ ...base, ...override })).toThrow(field);
  });
});

describe('tracingUrlMatchers', () => {
  const matches = (url: string, origins: (string | RegExp)[]) => tracingUrlMatchers(origins).some((m) => m.test(url));

  it('matches an origin and nothing that only starts like it', () => {
    const origins = ['https://api.example.com'];
    expect(matches('https://api.example.com/orders?id=1', origins)).toBe(true);
    expect(matches('https://api.example.com', origins)).toBe(true);
    expect(matches('https://api.example.com.evil.io/x', origins)).toBe(false);
    expect(matches('http://api.example.com/x', origins)).toBe(false);
  });

  it('passes regular expressions through', () => {
    expect(matches('https://eu.api.example.com/x', [/^https:\/\/[a-z]+\.api\.example\.com\//])).toBe(true);
  });
});
