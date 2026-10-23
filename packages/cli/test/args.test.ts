import { describe, expect, it } from 'vitest';
import { parseCommand, UsageError } from '../src/args.js';

const full = ['--app', 'web-shop', '--url', 'https://fs.example.com', '--api-key', 'k'];

describe('parseCommand', () => {
  it.each([
    [[], 'help'],
    [['--help'], 'help'],
    [['sourcemaps'], 'help'],
    [['sourcemaps', '--help'], 'help'],
    [['--version'], 'version'],
  ])('%j is %s', (argv, name) => {
    expect(parseCommand(argv, {}).name).toBe(name);
  });

  it('parses upload with flags and defaults', () => {
    expect(parseCommand(['sourcemaps', 'upload', './dist', '--release', '1.8.0', ...full], {})).toEqual({
      name: 'upload',
      dir: './dist',
      release: '1.8.0',
      app: 'web-shop',
      url: 'https://fs.example.com',
      apiKey: 'k',
      urlPrefix: '/',
      deleteAfter: false,
      dryRun: false,
      include: ['**/*.js.map', '**/*.mjs.map', '**/*.cjs.map'],
      ignore: ['**/node_modules/**'],
    });
  });

  it('takes options before the directory, repeated globs and boolean flags', () => {
    const cmd = parseCommand(
      [
        'sourcemaps',
        'upload',
        '--release=2.0.0',
        '--url-prefix',
        '/static/',
        '--include',
        'assets/**/*.map',
        '--include',
        '*.map',
        '--ignore',
        '**/legacy/**',
        '--delete-after',
        '--dry-run',
        'build',
      ],
      {},
    );
    expect(cmd).toMatchObject({
      name: 'upload',
      dir: 'build',
      release: '2.0.0',
      urlPrefix: '/static/',
      include: ['assets/**/*.map', '*.map'],
      ignore: ['**/legacy/**'],
      deleteAfter: true,
      dryRun: true,
    });
  });

  it('falls back to the environment', () => {
    const env = {
      FUSESCOPE_URL: 'https://env.example.com',
      FUSESCOPE_API_KEY: 'secret',
      FUSESCOPE_APP: 'env-app',
      FUSESCOPE_RELEASE: '3.1.0',
    };
    expect(parseCommand(['sourcemaps', 'upload', 'dist'], env)).toMatchObject({
      app: 'env-app',
      url: 'https://env.example.com',
      apiKey: 'secret',
      release: '3.1.0',
    });
    expect(parseCommand(['sourcemaps', 'upload', 'dist', '--app', 'flag-app'], env)).toMatchObject({ app: 'flag-app' });
  });

  it('parses list and delete', () => {
    expect(parseCommand(['sourcemaps', 'list', ...full], {})).toEqual({
      name: 'list',
      app: 'web-shop',
      url: 'https://fs.example.com',
      apiKey: 'k',
      release: undefined,
      json: false,
    });
    expect(parseCommand(['sourcemaps', 'list', '--release', '1.0.0', '--json', ...full], {})).toMatchObject({
      release: '1.0.0',
      json: true,
    });
    expect(parseCommand(['sourcemaps', 'delete', '--release', '1.0.0', ...full], {})).toEqual({
      name: 'delete',
      app: 'web-shop',
      url: 'https://fs.example.com',
      apiKey: 'k',
      release: '1.0.0',
    });
  });

  it('dry run needs neither credentials nor an app', () => {
    expect(parseCommand(['sourcemaps', 'upload', 'dist', '--release', '1', '--dry-run'], {})).toMatchObject({
      dryRun: true,
      app: undefined,
      apiKey: undefined,
    });
  });

  it.each([
    [['bogus'], /unknown command/i],
    [['sourcemaps', 'bogus'], /unknown command/i],
    [['sourcemaps', 'upload', '--release', '1', ...full], /directory/i],
    [['sourcemaps', 'upload', 'dist', ...full], /--release/],
    [['sourcemaps', 'upload', 'dist', '--release', '1', '--url', 'u', '--api-key', 'k'], /--app/],
    [['sourcemaps', 'upload', 'dist', '--release', '1', '--app', 'a', '--api-key', 'k'], /--url/],
    [['sourcemaps', 'upload', 'dist', '--release', '1', '--app', 'a', '--url', 'https://x'], /--api-key/],
    [['sourcemaps', 'upload', 'dist', '--release', '1', '--app', 'a', '--url', 'ftp://x', '--api-key', 'k'], /http/],
    [['sourcemaps', 'upload', 'a', 'b', '--release', '1', ...full], /one directory/i],
    [['sourcemaps', 'upload', 'dist', '--release', '1', '--bogus', ...full], /bogus/],
    [['sourcemaps', 'delete', ...full], /--release/],
    [['sourcemaps', 'list', '--app', 'a'], /--url/],
  ])('%j is a usage error', (argv, message) => {
    expect(() => parseCommand(argv, {})).toThrow(UsageError);
    expect(() => parseCommand(argv, {})).toThrow(message);
  });

  it('delete does not take the release from the environment', () => {
    expect(() => parseCommand(['sourcemaps', 'delete', ...full], { FUSESCOPE_RELEASE: '1' })).toThrow(/--release/);
  });

  it('never echoes the API key in errors', () => {
    try {
      parseCommand(['sourcemaps', 'upload', 'dist', '--api-key', 'top-secret', '--bogus'], {});
    } catch (e) {
      expect(String(e)).not.toContain('top-secret');
      return;
    }
    throw new Error('expected a usage error');
  });
});
