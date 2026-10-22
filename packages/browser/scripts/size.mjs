import { appendFileSync, readFileSync } from 'node:fs';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build } from 'esbuild';

/** ADR 0003: the default bundle (core, document load, fetch, XHR, user actions) stays within 35 KB gzip. */
const BUDGET_GZIP_KB = 35;
const kb = (n) => (n / 1024).toFixed(1);

const sizes = (buf) => ({
  min: buf.length,
  gzip: gzipSync(buf, { level: 9 }).length,
  brotli: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
});

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// What an app's bundler produces from `import { init } from '@fusescope/browser'`.
const esm = await build({
  stdin: {
    contents: "export { init, setUser, addError, addAction, setView, setConsent, shutdown } from './dist/index.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  write: false,
  metafile: true,
  legalComments: 'none',
});

const rows = [
  { name: 'dist/fusescope.min.js (script tag)', ...sizes(readFileSync('dist/fusescope.min.js')) },
  { name: 'npm import, bundled and minified', ...sizes(Buffer.from(esm.outputFiles[0].contents)) },
];

const pkgOf = (path) => path.match(/.*node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1] ?? `${pkg.name} (own code)`;
const perPkg = {};
for (const [input, { bytesInOutput }] of Object.entries(Object.values(esm.metafile.outputs)[0].inputs)) {
  perPkg[pkgOf(input)] = (perPkg[pkgOf(input)] ?? 0) + bytesInOutput;
}
const total = Object.values(perPkg).reduce((a, b) => a + b, 0);

let md = `| bundle | min KB | gzip KB | brotli KB | budget |\n|---|---:|---:|---:|---|\n`;
for (const r of rows) {
  md += `| ${r.name} | ${kb(r.min)} | ${kb(r.gzip)} | ${kb(r.brotli)} | ${r.gzip / 1024 <= BUDGET_GZIP_KB ? 'ok' : 'OVER'} ≤ ${BUDGET_GZIP_KB} KB gzip |\n`;
}
md += `\n| package | min KB | share |\n|---|---:|---:|\n`;
for (const [name, bytes] of Object.entries(perPkg).sort((a, b) => b[1] - a[1])) {
  md += `| ${name} | ${kb(bytes)} | ${((bytes / total) * 100).toFixed(0)}% |\n`;
}

console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Bundle size\n\n${md}`);

const over = rows.filter((r) => r.gzip / 1024 > BUDGET_GZIP_KB);
if (over.length) {
  console.error(
    `Bundle-size budget exceeded: ${over.map((r) => `${r.name} ${kb(r.gzip)} KB`).join(', ')} > ${BUDGET_GZIP_KB} KB gzip`,
  );
  process.exit(1);
}
