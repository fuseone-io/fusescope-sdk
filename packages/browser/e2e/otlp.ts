import type { APIRequestContext } from '@playwright/test';

type AnyValue = { stringValue?: string; intValue?: number | string; doubleValue?: number; boolValue?: boolean };
type KeyValue = { key: string; value: AnyValue };
type Attrs = Record<string, string | number | boolean | undefined>;

export interface Export {
  signal: 'traces' | 'logs';
  key: string | null;
  contentType: string;
  body: Record<string, unknown>;
}

export interface Received {
  exports: Export[];
  preflights: { url: string; method: string; headers: string; origin: string }[];
  api: { port: number; host: string; url: string; traceparent: string | null }[];
}

export interface Span {
  name: string;
  durationMs: number;
  attributes: Attrs;
  resource: Attrs;
}

export interface LogRecord {
  eventName?: string;
  attributes: Attrs;
  resource: Attrs;
}

const value = (v: AnyValue) =>
  v.stringValue ?? v.boolValue ?? v.doubleValue ?? (v.intValue === undefined ? undefined : Number(v.intValue));
const attrs = (kvs: KeyValue[] = []): Attrs => Object.fromEntries(kvs.map((kv) => [kv.key, value(kv.value)]));

export async function received(request: APIRequestContext): Promise<Received> {
  return (await request.get('/__received')).json();
}

export function spans(r: Received): Span[] {
  return r.exports
    .filter((e) => e.signal === 'traces')
    .flatMap((e) =>
      (
        e.body.resourceSpans as {
          resource: { attributes: KeyValue[] };
          scopeSpans: {
            spans: { name: string; startTimeUnixNano: string; endTimeUnixNano: string; attributes: KeyValue[] }[];
          }[];
        }[]
      ).flatMap((rs) =>
        rs.scopeSpans.flatMap((ss) =>
          ss.spans.map((s) => ({
            name: s.name,
            durationMs: Number((BigInt(s.endTimeUnixNano) - BigInt(s.startTimeUnixNano)) / 1_000_000n),
            attributes: attrs(s.attributes),
            resource: attrs(rs.resource.attributes),
          })),
        ),
      ),
    );
}

export function logRecords(r: Received): LogRecord[] {
  return r.exports
    .filter((e) => e.signal === 'logs')
    .flatMap((e) =>
      (
        e.body.resourceLogs as {
          resource: { attributes: KeyValue[] };
          scopeLogs: { logRecords: { eventName?: string; attributes: KeyValue[] }[] }[];
        }[]
      ).flatMap((rl) =>
        rl.scopeLogs.flatMap((sl) =>
          sl.logRecords.map((l) => ({
            eventName: l.eventName,
            attributes: attrs(l.attributes),
            resource: attrs(rl.resource.attributes),
          })),
        ),
      ),
    );
}
