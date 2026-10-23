/** The URL path a browser loads a file from: `prefix` (a path or a full URL) plus its path relative to the build directory. */
export function urlPath(relPath: string, prefix: string): string {
  let base = prefix.trim();
  if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(base)) base = new URL(base, 'https://x').pathname;
  base = `/${base.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
  const rel = relPath
    .split(/[\\/]/)
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/');
  return base + rel;
}
