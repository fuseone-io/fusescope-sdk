import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Runs against dist/, so after `pnpm build`.
export default defineConfig({
  define: { __FUSESCOPE_VERSION__: JSON.stringify(version) },
  test: { include: ['test/bundle/**/*.test.ts'] },
});
