const special = /[.+^${}()|[\]\\]/g;

/**
 * Compiles a glob over `/`-separated relative paths: `**` spans directories, `*` and `?` stay within one,
 * `{a,b}` is an alternation. A glob without `/` matches the file name at any depth.
 */
export function globToRegExp(glob: string): RegExp {
  let g = glob.replace(/^\.\//, '');
  if (!g.includes('/')) g = `**/${g}`;
  let out = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i] as string;
    if (c === '*' && g[i + 1] === '*') {
      i++;
      if (g[i + 1] === '/') {
        i++;
        out += '(?:.*/)?';
      } else out += '.*';
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '{') {
      const end = g.indexOf('}', i);
      if (end === -1) out += '\\{';
      else {
        out += `(?:${g
          .slice(i + 1, end)
          .split(',')
          .map((s) => s.replace(special, '\\$&'))
          .join('|')})`;
        i = end;
      }
    } else out += c.replace(special, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

export function matchesAny(path: string, globs: string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(path));
}
