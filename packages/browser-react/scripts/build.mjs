import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { build } from 'esbuild';

rmSync('dist', { recursive: true, force: true });
await build({
  entryPoints: ['src/index.ts', 'src/react-router.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outdir: 'dist',
  packages: 'external',
  sourcemap: true,
});
execFileSync('tsc', ['-p', 'tsconfig.build.json'], { stdio: 'inherit' });
