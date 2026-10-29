import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const common = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  target: 'es2020',
  define: { __FUSESCOPE_VERSION__: JSON.stringify(pkg.version) },
  legalComments: 'none',
  logLevel: 'warning',
};

rmSync('dist', { recursive: true, force: true });

// npm: ESM, dependencies left to the app's bundler.
await build({
  ...common,
  format: 'esm',
  outfile: 'dist/index.js',
  external: Object.keys(pkg.dependencies),
  sourcemap: true,
});

// Script tag: everything bundled, exposed as `window.FuseScope`.
await build({
  ...common,
  format: 'iife',
  globalName: 'FuseScope',
  minify: true,
  outfile: 'dist/fusescope.min.js',
  sourcemap: true,
  metafile: false,
  banner: { js: `/*! ${pkg.name} ${pkg.version} | Apache-2.0 | includes OpenTelemetry (Apache-2.0) */` },
});

// `integrity` attribute value for the script tag.
const sri = `sha384-${createHash('sha384').update(readFileSync('dist/fusescope.min.js')).digest('base64')}`;
writeFileSync('dist/fusescope.min.js.sri', `${sri}\n`);

execFileSync('tsc', ['-p', 'tsconfig.build.json'], { stdio: 'inherit' });
