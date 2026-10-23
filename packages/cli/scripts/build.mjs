import { execFileSync } from 'node:child_process';
import { chmodSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
execFileSync('tsc', ['-p', 'tsconfig.build.json'], { stdio: 'inherit' });
chmodSync('dist/bin.js', 0o755);
