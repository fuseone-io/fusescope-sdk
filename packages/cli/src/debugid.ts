const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const comment = /^\/\/[#@] debugId=([0-9a-fA-F-]{36})\s*$/gm;

/** The debug ID a source map declares (`debugId`, or the older `debug_id`), lower-cased. */
export function debugIdFromMap(map: unknown): string | undefined {
  if (!map || typeof map !== 'object') return undefined;
  const { debugId, debug_id } = map as { debugId?: unknown; debug_id?: unknown };
  const id = debugId ?? debug_id;
  return typeof id === 'string' && uuid.test(id) ? id.toLowerCase() : undefined;
}

/** The debug ID from the last `//# debugId=` comment of a generated file. */
export function debugIdFromSource(source: string): string | undefined {
  let id: string | undefined;
  for (const m of source.matchAll(comment)) if (uuid.test(m[1] as string)) id = m[1];
  return id?.toLowerCase();
}
