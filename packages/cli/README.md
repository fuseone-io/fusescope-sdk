# @fusescope/cli

Command line for [FuseScope](https://github.com/fuseone-io/fusescope). It uploads your build's source
maps so FuseScope shows browser errors from [`@fusescope/browser`](../browser) with original file names,
lines and functions instead of minified code.

Maps are stored on the FuseScope server per application and release, and stack traces are symbolicated
when you read them. Uploading late also fixes errors you already received. Maps are never sent to
browsers.

Status: 0.x beta; flags may change before 1.0. Node 22 or later; no runtime dependencies.

```bash
npm install --save-dev @fusescope/cli
```

## Upload

```bash
export FUSESCOPE_URL=https://fusescope.example.com
export FUSESCOPE_API_KEY=…            # service account key, Editor role
export FUSESCOPE_APP=web-shop         # RUM application ID
npx fusescope sourcemaps upload ./dist --release 1.8.0
```

```text
[1/1] 14 files, 6.2 MB uploaded
Uploaded to web-shop · release 1.8.0 · 14 files · 6.2 MB
```

### The release rule

**`--release` must equal the `version` you pass to `init()`**, which the SDK sends as `service.version`.
FuseScope looks up maps by an error's `service.version`; with any other value its stack stays
minified. Use one source for both, such as the `version` in `package.json`:

```ts
init({ applicationId: 'web-shop', publicKey: 'rum_pub_…', endpoint: 'https://fusescope.example.com',
  version: import.meta.env.VITE_APP_VERSION });
```

### How files are matched

The CLI finds `*.js.map`, `*.mjs.map` and `*.cjs.map` under `<dir>` (`node_modules` excluded) and
uploads each under its URL path: `--url-prefix` plus the path relative to `<dir>`. With
`./dist/assets/index-abc123.js.map` and the default prefix `/`, the path is
`/assets/index-abc123.js.map`, matching the `/assets/index-abc123.js` the browser reports. Serve your
bundles from a sub-path or CDN? Pass it: `--url-prefix /static/` or `--url-prefix https://cdn.example.com/app/`
(only the path part is used).

When a map has a `debugId` (or its bundle ends with a `//# debugId=` comment), it is sent as well.

### Options

| Flag | Environment | Default | |
|---|---|---|---|
| `<dir>` | | required | Build output directory. |
| `--release <v>` | `FUSESCOPE_RELEASE` | required | Release; equals `service.version`. |
| `--app <id>` | `FUSESCOPE_APP` | required | RUM application ID. |
| `--url <base>` | `FUSESCOPE_URL` | required | FuseScope base URL. |
| `--api-key <key>` | `FUSESCOPE_API_KEY` | required | Service account API key, Editor role. Prefer the variable: flags show up in shell history and process lists. |
| `--url-prefix <p>` | | `/` | Path (or URL) the bundles are served from. |
| `--include <glob>` | | `**/*.js.map`, `**/*.mjs.map`, `**/*.cjs.map` | Repeatable; replaces the default. |
| `--ignore <glob>` | | `**/node_modules/**` | Repeatable; replaces the default. |
| `--delete-after` | | off | Delete the uploaded `.map` files, so they are not deployed. |
| `--dry-run` | | off | List what would be uploaded; sends nothing, needs no key. |

Globs match `/`-separated paths relative to `<dir>`: `**` spans directories, `*` and `?` do not, `{a,b}`
is an alternation, and a glob without `/` matches the file name at any depth.

Files are sent in a few multipart requests (up to 25 MB or 100 files each). Network errors, HTTP 429 and
5xx are retried three times with backoff. Limits: 50 MB per file and 1,000 files per release; a file over
the limit is reported and skipped. Uploading a file again replaces it. The API key is never printed.

### Exit codes

| Code | |
|---|---|
| 0 | Everything uploaded. |
| 1 | Some files rejected (listed with reasons), no maps found, unknown application, or the server unreachable after retries. |
| 2 | Usage error. |
| 3 | Authentication or permission error (HTTP 401/403). |

## Build setups

Build with **hidden** source maps: the maps are written but the bundles carry no `sourceMappingURL`, so
browsers never ask for them. Then upload, and delete the maps before deploying (`--delete-after`) or
keep them out of what you deploy.

### npm script

```json
{
  "scripts": {
    "build": "vite build",
    "postbuild": "fusescope sourcemaps upload ./dist --release $npm_package_version --delete-after"
  },
  "devDependencies": { "@fusescope/cli": "^0.1.0-beta.0" }
}
```

`$npm_package_version` is set by npm, pnpm and Yarn on POSIX shells; on Windows `cmd` use
`%npm_package_version%`, or set `FUSESCOPE_RELEASE` instead.

### Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: { sourcemap: 'hidden' },
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version) },
});
```

### webpack

```js
// webpack.config.js
const { DefinePlugin } = require('webpack');

module.exports = {
  devtool: 'hidden-source-map',
  output: { publicPath: '/static/' },
  plugins: [new DefinePlugin({ __APP_VERSION__: JSON.stringify(process.env.npm_package_version) })],
};
```

```bash
fusescope sourcemaps upload ./build --release "$npm_package_version" --url-prefix /static/
```

Bundler plugins for Vite and webpack are planned.

## CI

Keep the key in a secret and pass everything through the environment. GitHub Actions:

```yaml
- run: npm ci && npm run build:app
- run: npx fusescope sourcemaps upload ./dist --release "$GITHUB_SHA" --delete-after
  env:
    FUSESCOPE_URL: https://fusescope.example.com
    FUSESCOPE_APP: web-shop
    FUSESCOPE_API_KEY: ${{ secrets.FUSESCOPE_API_KEY }}
- run: ./deploy.sh ./dist
```

Here the release is the commit SHA, so the app must be built with the same value as `version`
(for example `VITE_APP_VERSION=$GITHUB_SHA`). Create the key from a FuseScope service account with the
Editor role, scoped to CI. GitLab CI works the same with a masked `FUSESCOPE_API_KEY` variable.

## Manage

```bash
fusescope sourcemaps list                       # releases of FUSESCOPE_APP
fusescope sourcemaps list --release 1.8.0       # files of one release
fusescope sourcemaps list --json
fusescope sourcemaps delete --release 1.7.1
```

`delete` needs an explicit `--release` and never reads `FUSESCOPE_RELEASE`. Deleting a release never
deletes its events; their stack traces go back to minified.

## API

The CLI wraps the HTTP API; any client can call it with the `SigNoz-Api-Key` header:

| | |
|---|---|
| `POST /api/v1/rum/applications/{app}/sourcemaps?release=<v>` | Multipart upload, one part per map, named by its URL path. |
| `GET /api/v1/rum/applications/{app}/sourcemaps[?release=<v>]` | List releases, or the files of one. |
| `DELETE /api/v1/rum/applications/{app}/sourcemaps?release=<v>` | Delete a release. |

## Contributing

```bash
pnpm install
pnpm --filter @fusescope/cli test        # Vitest, including a local HTTP stub
pnpm --filter @fusescope/cli build && node packages/cli/dist/bin.js --help
```

Runtime code uses Node built-ins only (`fetch`, `FormData`, `fs`, `util.parseArgs`). Releasing: see
[packages/browser](../browser#releasing), with `package` set to `cli`.

## Licence

[Apache-2.0](../../LICENSE).
