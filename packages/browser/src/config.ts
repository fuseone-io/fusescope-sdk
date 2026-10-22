import type { QueryPolicy } from './scrub';

/** Header that carries the public application key to the RUM gateway. */
export const KEY_HEADER = 'FuseScope-RUM-Key';

export interface PrivacyConfig {
  /** Drop query strings from URLs, span names and error messages. Default `true`. Fragments are always dropped. */
  dropQuery?: boolean;
  /** Query parameters kept when `dropQuery` is on. */
  queryAllowlist?: string[];
  /** `setUser()` sends a SHA-256 of the id as `user.hash` instead of `user.id`. Default `true`. */
  hashUserId?: boolean;
}

export interface SessionConfig {
  /** A session ends after this long without user activity. Default 15 minutes. */
  inactivityTimeoutMs?: number;
  /** A session never lasts longer than this. Default 4 hours. */
  maxDurationMs?: number;
}

export interface InstrumentationsConfig {
  documentLoad?: boolean;
  fetch?: boolean;
  xhr?: boolean;
  userActions?: boolean;
  webVitals?: boolean;
  errors?: boolean;
}

export interface BrowserConfig {
  /** RUM application id, as shown in FuseScope's Setup screen. */
  applicationId: string;
  /** Public, write-only application key (`rum_pub_…`). */
  publicKey: string;
  /** FuseScope base URL; data is sent to `<endpoint>/rum/v1/traces` and `<endpoint>/rum/v1/logs`. */
  endpoint: string;
  /** `service.name`; defaults to `applicationId`. */
  service?: string;
  /** `deployment.environment.name`, e.g. `production`. */
  environment?: string;
  /** `service.version`: the release of the instrumented app. */
  version?: string;
  /** Share of sessions recorded, 0 to 1. Default 1. Unsampled sessions send nothing and no `traceparent`. */
  sessionSampleRate?: number;
  /**
   * Cross-origin API URLs that receive `traceparent`; same-origin requests always do.
   * A string matches URLs starting with it at a `/`, `?` or `#` boundary, e.g. an origin.
   */
  propagateTraceHeaderCorsUrls?: (string | RegExp)[];
  privacy?: PrivacyConfig;
  session?: SessionConfig;
  /** Builds the route template of a path; defaults to replacing id-like segments with `:id`. */
  routeTemplate?: (path: string) => string;
  instrumentations?: InstrumentationsConfig;
  /** Collect nothing until `setConsent(true)`. Default `false`. */
  requireConsent?: boolean;
}

export interface ResolvedConfig {
  applicationId: string;
  service: string;
  environment?: string;
  version?: string;
  tracesUrl: string;
  logsUrl: string;
  headers: Record<string, string>;
  sessionSampleRate: number;
  tracingUrls: RegExp[];
  privacy: { allowedQueryParams: QueryPolicy; hashUserId: boolean };
  requireConsent: boolean;
  session: { inactivityTimeoutMs: number; maxDurationMs: number };
  routeTemplate?: (path: string) => string;
  instrumentations: Required<InstrumentationsConfig>;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Turns origins into matchers for the URLs that may receive `traceparent`. */
export function tracingUrlMatchers(origins: readonly (string | RegExp)[]): RegExp[] {
  return origins.map((o) =>
    typeof o === 'string' ? new RegExp(`^${escapeRegExp(o.replace(/\/+$/, ''))}(?:[/?#]|$)`) : o,
  );
}

function required(value: string | undefined, field: string): string {
  if (!value) throw new Error(`FuseScope: ${field} is required`);
  return value;
}

export function resolveConfig(c: BrowserConfig): ResolvedConfig {
  const applicationId = required(c.applicationId, 'applicationId');
  const publicKey = required(c.publicKey, 'publicKey');
  let base: string;
  try {
    base = new URL(required(c.endpoint, 'endpoint')).href.replace(/\/+$/, '');
  } catch {
    throw new Error(`FuseScope: endpoint must be an absolute URL, got ${JSON.stringify(c.endpoint)}`);
  }
  const sessionSampleRate = c.sessionSampleRate ?? 1;
  if (!(sessionSampleRate >= 0 && sessionSampleRate <= 1)) {
    throw new Error('FuseScope: sessionSampleRate must be within [0, 1]');
  }
  return {
    applicationId,
    service: c.service ?? applicationId,
    environment: c.environment,
    version: c.version,
    tracesUrl: `${base}/rum/v1/traces`,
    logsUrl: `${base}/rum/v1/logs`,
    headers: { [KEY_HEADER]: publicKey },
    sessionSampleRate,
    tracingUrls: tracingUrlMatchers(c.propagateTraceHeaderCorsUrls ?? []),
    privacy: {
      allowedQueryParams: c.privacy?.dropQuery === false ? '*' : [...(c.privacy?.queryAllowlist ?? [])],
      hashUserId: c.privacy?.hashUserId ?? true,
    },
    requireConsent: c.requireConsent ?? false,
    session: {
      inactivityTimeoutMs: c.session?.inactivityTimeoutMs ?? 15 * 60_000,
      maxDurationMs: c.session?.maxDurationMs ?? 4 * 3_600_000,
    },
    routeTemplate: c.routeTemplate,
    instrumentations: {
      documentLoad: true,
      fetch: true,
      xhr: true,
      userActions: true,
      webVitals: true,
      errors: true,
      ...c.instrumentations,
    },
  };
}
