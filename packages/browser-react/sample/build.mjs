import { build } from 'esbuild';

await build({
  entryPoints: ['sample/app.tsx'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outfile: 'sample/dist/sample.js',
  sourcemap: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
