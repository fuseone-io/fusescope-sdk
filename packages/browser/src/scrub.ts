const URL_ATTRIBUTES = new Set([
  'url.full',
  'url.original',
  'http.url',
  'http.target',
  'location.href',
  'browser.document.url.full',
]);

/** Query parameters kept in URLs: a list of names, or `'*'` for all. */
export type QueryPolicy = readonly string[] | '*';

const URL_IN_TEXT = /((?:https?:\/\/|\/)[^\s?#]*)[?#][^\s]*/g;

/** Drops the fragment and every query parameter not in `allowedParams`. */
export function scrubUrl(raw: string, allowedParams: QueryPolicy = []): string {
  let url: URL;
  try {
    url = new URL(raw, 'http://relative.invalid');
  } catch {
    return raw.split(/[?#]/)[0] ?? '';
  }
  url.hash = '';
  if (allowedParams === '*') return relative(raw) ? url.pathname + url.search : url.toString();
  const kept = new URLSearchParams();
  url.searchParams.forEach((v, k) => {
    if (allowedParams.includes(k)) kept.append(k, v);
  });
  url.search = kept.toString();
  return relative(raw) ? url.pathname + url.search : url.toString();
}

const relative = (raw: string) => raw.startsWith('/') && !raw.startsWith('//');

/** Returns the scrubbed values of the URL attributes in `attrs`. */
export function scrubAttributes(
  attrs: Readonly<Record<string, unknown>>,
  allowedParams: QueryPolicy,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(attrs)) {
    if (typeof v !== 'string') continue;
    if (key === 'url.fragment') out[key] = '';
    else if (key === 'url.query') out[key] = scrubUrl(`/?${v}`, allowedParams).slice(2);
    else if (URL_ATTRIBUTES.has(key)) out[key] = scrubUrl(v, allowedParams);
  }
  return out;
}

const URL_IN_STACK = /((?:https?:\/\/|\/)[^\s?#()]*)[?#][^\s()]*?(:\d+(?::\d+)?)?(?=[\s)]|$)/g;

/** Like `scrubText`, keeping the `:line:column` that follows a URL in a stack frame. */
export function scrubStack(stack: string, allowedParams: QueryPolicy): string {
  return allowedParams === '*' ? stack : stack.replace(URL_IN_STACK, '$1$2');
}

/** Strips query strings and fragments from URLs and paths inside free text such as span names. */
export function scrubText(text: string, allowedParams: QueryPolicy): string {
  return allowedParams === '*' ? text : text.replace(URL_IN_TEXT, '$1');
}
