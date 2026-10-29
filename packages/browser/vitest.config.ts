import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: { __FUSESCOPE_VERSION__: JSON.stringify(version) },
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    exclude: ['test/bundle/**', '**/node_modules/**'],
  },
});
