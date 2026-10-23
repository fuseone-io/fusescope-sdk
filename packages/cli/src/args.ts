import { parseArgs } from 'node:util';

export class UsageError extends Error {}

type Env = Record<string, string | undefined>;

interface Connection {
  app: string;
  url: string;
  apiKey: string;
}

export interface UploadCommand extends Partial<Connection> {
  name: 'upload';
  dir: string;
  release: string;
  urlPrefix: string;
  deleteAfter: boolean;
  dryRun: boolean;
  include: string[];
  ignore: string[];
}

export interface ListCommand extends Connection {
  name: 'list';
  release: string | undefined;
  json: boolean;
}

export interface DeleteCommand extends Connection {
  name: 'delete';
  release: string;
}

export type Command = { name: 'help' } | { name: 'version' } | UploadCommand | ListCommand | DeleteCommand;

export const DEFAULT_INCLUDE = ['**/*.js.map', '**/*.mjs.map', '**/*.cjs.map'];
export const DEFAULT_IGNORE = ['**/node_modules/**'];

const connection = {
  app: { type: 'string' },
  url: { type: 'string' },
  'api-key': { type: 'string' },
  release: { type: 'string' },
} as const;

const options = {
  upload: {
    ...connection,
    'url-prefix': { type: 'string', default: '/' },
    'delete-after': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    include: { type: 'string', multiple: true },
    ignore: { type: 'string', multiple: true },
  },
  list: { ...connection, json: { type: 'boolean', default: false } },
  delete: connection,
} as const;

/** Parses `argv` (without the node and script paths). Flags win over `FUSESCOPE_*` variables. */
export function parseCommand(argv: string[], env: Env): Command {
  const [group, sub, ...rest] = argv;
  if (group === undefined || group === '--help' || group === '-h' || group === 'help') return { name: 'help' };
  if (group === '--version' || group === '-v') return { name: 'version' };
  if (group !== 'sourcemaps') throw new UsageError(`unknown command "${group}"`);
  if (sub === undefined || sub === '--help' || sub === '-h' || rest.includes('--help') || rest.includes('-h'))
    return { name: 'help' };
  if (sub !== 'upload' && sub !== 'list' && sub !== 'delete')
    throw new UsageError(`unknown command "sourcemaps ${sub}"`);

  let parsed: { values: Record<string, unknown>; positionals: string[] };
  try {
    parsed = parseArgs({ args: rest, options: options[sub], allowPositionals: true, strict: true });
  } catch (e) {
    throw new UsageError(redact((e as Error).message, rest));
  }
  const v = parsed.values as Record<string, string | boolean | string[] | undefined>;
  const str = (k: string) => v[k] as string | undefined;

  const app = str('app') ?? env.FUSESCOPE_APP;
  const url = str('url') ?? env.FUSESCOPE_URL;
  const apiKey = str('api-key') ?? env.FUSESCOPE_API_KEY;

  if (sub === 'upload') {
    if (parsed.positionals.length === 0) throw new UsageError('missing the build directory: sourcemaps upload <dir>');
    if (parsed.positionals.length > 1) throw new UsageError('pass exactly one directory');
    const release = str('release') ?? env.FUSESCOPE_RELEASE;
    if (!release) throw new UsageError('missing --release (or FUSESCOPE_RELEASE); it must equal service.version');
    const dryRun = v['dry-run'] as boolean;
    if (!dryRun) requireConnection(app, url, apiKey);
    return {
      name: 'upload',
      dir: parsed.positionals[0] as string,
      release,
      app,
      url,
      apiKey,
      urlPrefix: str('url-prefix') as string,
      deleteAfter: v['delete-after'] as boolean,
      dryRun,
      include: (v.include as string[] | undefined) ?? DEFAULT_INCLUDE,
      ignore: (v.ignore as string[] | undefined) ?? DEFAULT_IGNORE,
    };
  }

  if (parsed.positionals.length) throw new UsageError(`unexpected argument "${parsed.positionals[0]}"`);
  const conn = requireConnection(app, url, apiKey);
  if (sub === 'list')
    return { name: 'list', ...conn, release: str('release') ?? env.FUSESCOPE_RELEASE, json: v.json as boolean };
  const release = str('release');
  if (!release) throw new UsageError('missing --release: delete removes one release and never reads FUSESCOPE_RELEASE');
  return { name: 'delete', ...conn, release };
}

function requireConnection(app?: string, url?: string, apiKey?: string): Connection {
  if (!app) throw new UsageError('missing --app (or FUSESCOPE_APP)');
  if (!url) throw new UsageError('missing --url (or FUSESCOPE_URL)');
  if (!/^https?:\/\//i.test(url)) throw new UsageError('--url must be an http(s) URL');
  if (!apiKey) throw new UsageError('missing --api-key (or FUSESCOPE_API_KEY)');
  return { app, url, apiKey };
}

function redact(message: string, args: string[]): string {
  let out = message;
  args.forEach((a, i) => {
    if (a === '--api-key' && args[i + 1]) out = out.replaceAll(args[i + 1] as string, '***');
    if (a.startsWith('--api-key=')) out = out.replaceAll(a.slice('--api-key='.length), '***');
  });
  return out;
}

export const HELP = `Usage: fusescope sourcemaps <command> [options]

Commands:
  upload <dir> --release <v>   Upload the source maps under <dir> for a release
  list [--release <v>]         List uploaded releases, or the files of one release
  delete --release <v>         Delete the source maps of a release

Connection (all commands):
  --app <id>          RUM application ID          [FUSESCOPE_APP]
  --url <base>        FuseScope base URL          [FUSESCOPE_URL]
  --api-key <key>     Service account API key     [FUSESCOPE_API_KEY]

upload:
  --release <v>       Release; must equal service.version in init()   [FUSESCOPE_RELEASE]
  --url-prefix <p>    Path (or URL) the bundles are served from (default "/")
  --include <glob>    Files to upload, repeatable (default **/*.js.map, **/*.mjs.map, **/*.cjs.map)
  --ignore <glob>     Files to skip, repeatable (default **/node_modules/**)
  --delete-after      Delete the uploaded .map files so they are not deployed
  --dry-run           Show what would be uploaded; sends nothing

list:
  --json              Print the server response as JSON

Exit codes: 0 ok, 1 failed or rejected files, 2 usage error, 3 authentication or permission error.
`;
