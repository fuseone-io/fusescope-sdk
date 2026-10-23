# @fusescope/browser

Real User Monitoring for the browser, sending to [FuseScope](https://github.com/fuseone-io/fusescope).
It is a thin distribution over OpenTelemetry JS (`@opentelemetry/sdk-trace`, `sdk-logs`, the OTLP/HTTP
exporters, `@opentelemetry/browser-sdk` and `@opentelemetry/browser-instrumentation`) that adds what RUM
still lacks upstream: cross-tab sessions, session sampling, SPA views with route templates, PII scrubbing
and the FuseScope data model.

**Homologated, not mandatory.** This package is the tested and recommended path, but FuseScope accepts any
OTLP client. Clients configured by hand only need the attributes listed under [Data](#data) for the RUM
screens to work.

Status: 0.x, built on experimental upstream packages; options may change before 1.0.

## Install

```bash
npm install @fusescope/browser
```

```ts
import { init } from '@fusescope/browser';

init({
  applicationId: 'shop-web',
  publicKey: 'rum_pub_…',
  endpoint: 'https://fusescope.example.com',
  environment: 'production',
  version: '1.4.0',
  propagateTraceHeaderCorsUrls: ['https://api.example.com'],
});
```

The package ships ESM only, for bundlers (Vite, webpack, Next.js, …).

### Script tag (coming soon)

A versioned, immutable CDN build with SRI hashes, and the same bundle served by the FuseScope backend at
`/rum/sdk/browser/<version>.js`, come in a later release. The build already exists
(`dist/fusescope.min.js`, exposed as `window.FuseScope`):

```html
<script src="…/fusescope.min.js" integrity="sha384-…" crossorigin="anonymous"></script>
<script>
  FuseScope.init({ applicationId: 'shop-web', publicKey: 'rum_pub_…', endpoint: 'https://fusescope.example.com' });
</script>
```

## API

| Function | Does |
|---|---|
| `init(config)` | Starts collection (see below). A second call is ignored with a warning. |
| `setConsent(granted)` | `true` starts collection when `requireConsent` is set; `false` flushes and stops it. |
| `setUser(user \| null)` | Opt-in: `{ id }` is sent as `user.id`, hashed (see [User identity](#user-identity)). `null` clears it. |
| `addError(error, attributes?)` | Reports a handled error (`fusescope.rum.error.source = manual`). |
| `addAction(name, attributes?)` | Reports a custom action. |
| `setView(route)` | Names the current view with your router's template, e.g. `/orders/:id`. |
| `shutdown()` | Flushes and stops; `init()` can be called again. |

Calls made before collection starts are dropped, except `setUser`, which is applied on start.

## Configuration

| Option | Default | |
|---|---|---|
| `applicationId` | required | RUM application id from FuseScope's Setup screen. Also `service.name` unless `service` is set. |
| `publicKey` | required | Public, write-only key (`rum_pub_…`). Safe to ship in a bundle. |
| `endpoint` | required | FuseScope base URL. Data goes to `<endpoint>/rum/v1/traces` and `<endpoint>/rum/v1/logs`. |
| `service` | `applicationId` | `service.name`. |
| `environment` | — | `deployment.environment.name`. |
| `version` | — | `service.version`, the release of your app. Must equal the `--release` of your source-map upload. |
| `sessionSampleRate` | `1` | Share of sessions recorded, 0–1. |
| `propagateTraceHeaderCorsUrls` | `[]` | Cross-origin API URLs that get `traceparent`. Strings match URLs that start with them at a `/`, `?` or `#` boundary (so an origin works); `RegExp`s are tested against the full URL. Same-origin requests always get it. |
| `requireConsent` | `false` | Collect nothing until `setConsent(true)`. |
| `privacy.dropQuery` | `true` | Drop query strings from URLs, span names and error messages and stacks. |
| `privacy.queryAllowlist` | `[]` | Query parameters kept while `dropQuery` is on. |
| `privacy.hashUserId` | `true` | `setUser()` sends the SHA-256 of the id as `user.id`; `false` sends the raw id. |
| `session.inactivityTimeoutMs` | 15 min | A session ends after this long without a click, key, scroll or touch. |
| `session.maxDurationMs` | 4 h | A session never lasts longer. |
| `routeTemplate` | id segments → `:id` | `(path) => route` for view routes. |
| `instrumentations` | all `true` | Turn off `documentLoad`, `fetch`, `xhr`, `userActions`, `webVitals` or `errors` one by one. |

## Behaviour

- **Sessions.** `session.id` and `session.previous_id` on every span and log record. One session per
  browser, shared by tabs through `localStorage`. After inactivity or at the maximum duration, the next
  span or record starts a new session whose `session.previous_id` is the one that expired. The view open at
  that moment keeps the old session.
- **Sampling.** Decided once per session, from its id, so every tab and signal agrees. An unsampled session
  exports nothing and sends **no `traceparent`**: flags `00` would make parent-based backend samplers drop
  the server trace too.
- **Trace link.** fetch and XHR spans propagate W3C `traceparent` to the same origin and to
  `propagateTraceHeaderCorsUrls`, so the browser span becomes the parent of the backend trace. Those APIs
  must allow the `traceparent` request header in CORS.
- **Views.** A `view` span per History API navigation (`pushState`, `replaceState`, `popstate`). It ends
  at the next navigation, when the page is hidden (`visibilitychange`, `pagehide`) or on `shutdown()`, so
  its duration is the **time on view**. `fusescope.rum.view.loading_type` is `initial_load` for the view
  the page was loaded on and `route_change` for every other view, including one restarted when a hidden
  page is shown again (`navigation_type = restore`).
- **Web Vitals.** LCP, INP, CLS, FCP and TTFB as `browser.web_vital` events. They carry the route the page
  was **loaded** on, since `web-vitals` reports them late, often after SPA navigations.
- **Errors.** Uncaught errors and unhandled rejections as `exception` events, with the current route.
  `exception.stacktrace` is sent raw (minified) and symbolicated by FuseScope at read time; grouping is
  server-side too. An `error` event without an `Error` (such as cross-origin `Script error.`) gets a
  one-frame stack from its file, line and column. `addError()` called while a span is active (for example
  inside `context.with`) carries its trace and span ids; uncaught errors in async callbacks don't, since
  that needs a zone-based context manager.
- **Clicks.** `fusescope.rum.action.target` names what was clicked as a short, stable selector: the
  closest `data-fusescope-action` (`div[data-fusescope-action="checkout"]`), else the closest button, link,
  form control or `aria-label` element by id (`button#add-to-cart`, generated-looking ids skipped),
  `aria-label` (`button[aria-label="Close"]`) or first class (`a.nav-link`). Clicks on SVG icons are not
  reported yet (upstream only reports HTML elements).
- **Instrumentations.** Upstream `@opentelemetry/browser-instrumentation`: navigation timing (document
  load), fetch, XHR and user actions (clicks; no element text is captured).

## Privacy defaults

- Query strings and fragments are dropped from URL attributes, span names, error messages and stack
  traces; `privacy.queryAllowlist` keeps named parameters.
- Inputs and user text are never captured. Clicks report the tag, CSS selectors, `aria-label`,
  `data-fusescope-action` and `data-otel-*` attributes only.
- No user identity unless you call `setUser()`, and then hashed by default.
- `requireConsent` with `setConsent()` lets the SDK start only after the user agrees.
- The FuseScope gateway applies the application's PII policy again server-side.

## User identity

`setUser({ id })` sends `user.id` on every span and log record that follows, as the hex SHA-256 of the
id computed with WebCrypto (`privacy.hashUserId: false` sends the raw id). FuseScope can then filter
sessions by user without storing who they are; hash the id the same way to look one up.

- Hashing is asynchronous. Records emitted between the call and the hash carry **no** `user.id`, never the
  previous user's; spans already open, like the current view, get it when they end.
- When calls overlap, the last one wins, so `setUser(null)` right after a login is never undone by a late
  hash.
- WebCrypto needs a secure context (HTTPS or `localhost`); elsewhere the user is not set and a warning is
  logged, rather than sending the raw id.

## Releases and source maps

`version` in `init()` is the `service.version` resource attribute, and FuseScope symbolicates stack traces
with the source maps uploaded for that release. Use the **same value** for both, for example the
`package.json` version:

```bash
npx @fusescope/cli sourcemaps upload --release 1.4.0 ./dist
```

## Data

| Signal | Name | Key attributes |
|---|---|---|
| Resource | — | `service.name`, `service.version`, `deployment.environment.name`, `fusescope.rum.platform=web`, `fusescope.rum.application.id`, `telemetry.distro.name=@fusescope/browser`, `telemetry.distro.version`, `telemetry.sdk.*`, `user_agent.original`, `browser.language`, `browser.brands`, `browser.platform`, `browser.mobile` |
| Every span and log | — | `session.id`, `session.previous_id`, `fusescope.rum.view.route`, `user.id` |
| Span | `view` | `url.path`, `url.full`, `fusescope.rum.view.route`, `fusescope.rum.view.loading_type` (`initial_load`, `route_change`), `fusescope.rum.view.navigation_type` (`load`, `push`, `replace`, `pop`, `restore`, `manual`); duration = time on view |
| Span | `GET`, `POST`, … | `http.request.method`, `url.full`, `http.response.status_code`, `server.*` |
| Log event | `exception` | `exception.type`, `exception.message`, `exception.stacktrace`, `fusescope.rum.error.source` (`onerror`, `unhandledrejection`, `manual`), `fusescope.rum.view.route`; the record's trace and span ids when reported inside an active span |
| Log event | `browser.web_vital` | `browser.web_vital.name` (`lcp`, `inp`, `cls`, `fcp`, `ttfb`), `.value`, `.delta`, `.rating`, `.id`, `.navigation_type` |
| Log event | `browser.user_action.click` | `fusescope.rum.action.type=click`, `fusescope.rum.action.target`, `browser.css_selector`, `browser.tag_name` |
| Log event | `fusescope.rum.action` | `fusescope.rum.action.type=custom`, `fusescope.rum.action.name` |
| Log event | `browser.navigation_timing` | `browser.navigation_timing.*`, `browser.resource_timing.*`, `url.full` |

Every log record also carries its event name as the **`event.name` attribute**, because FuseScope's storage
drops the record's own event-name field.

## Gateway contract

What the FuseScope RUM gateway (or anything standing in for it) must accept:

- `POST <endpoint>/rum/v1/traces` and `POST <endpoint>/rum/v1/logs`, OTLP/HTTP with
  `Content-Type: application/json` (protobuf is not sent by this SDK).
- The public key in the **`FuseScope-RUM-Key`** request header.
- Requests are sent with `fetch(…, { keepalive: true })` when the payload allows it, so they survive page
  unload.
- **CORS.** The custom header makes every export a non-simple request: answer the `OPTIONS` preflight with
  `Access-Control-Allow-Origin: <origin>` (from the application's allowed origins),
  `Access-Control-Allow-Methods: POST`, `Access-Control-Allow-Headers: content-type, fusescope-rum-key`, and
  a `Access-Control-Max-Age` to cache it. Responses to the `POST` need `Access-Control-Allow-Origin` too.
  No credentials are sent.

## Bundle size

CI fails when the default bundle (core, document load, fetch, XHR, user actions, Web Vitals) exceeds
**35 KB gzip**, and prints the size per package (`pnpm --filter @fusescope/browser size`).

## Compatibility

| @fusescope/browser | FuseScope server | OpenTelemetry JS line |
|---|---|---|
| 0.2.x | to be filled when the RUM gateway ships | 2.12 / 0.223, `browser-sdk` 0.5, `browser-instrumentation` 0.8 |
| 0.1.x | to be filled when the RUM gateway ships | 2.12 / 0.223, `browser-sdk` 0.5, `browser-instrumentation` 0.8 |

Browsers: evergreen browsers supporting ES2020 and `fetch`.

## Contributing

Node 22 and pnpm 10 (`npx -y pnpm@10`).

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test   # Biome, tsc, Vitest
pnpm build && pnpm --filter @fusescope/browser size
pnpm --filter @fusescope/browser exec playwright install chromium
pnpm --filter @fusescope/browser test:e2e  # Playwright on ports 4400 and 4401
```

- Behaviour changes start with a failing test: Vitest next to the module in `test/`, and the Playwright
  suite in `e2e/` asserts the exported OTLP payloads.
- Every OpenTelemetry package stays on one release line, so the bundle holds one SDK.
- Dependencies must be MIT, BSD, ISC or Apache-2.0; CI rejects GPL, AGPL, LGPL, SSPL and BUSL, and
  `ua-parser-js` 2.x (AGPL).
- Conventional commits; pull requests to `main` with CI green.

## Releasing

`.github/workflows/release.yml` runs on manual dispatch only. It builds, tests, checks licences and CVEs,
writes the SBOM (CycloneDX) and SRI hashes, packs, dry-runs, and publishes with provenance. The dist-tag
is `next` for prereleases and `latest` otherwise.

Publishing uses npm trusted publishing (OIDC): no npm token is stored. It needs:

1. a trusted publisher on the npm package for `fuseone-io/fusescope-sdk`, workflow `release.yml`,
   environment `npm`;
2. the `NPM_PUBLISH_ENABLED` variable set to `true` in the `npm` environment;
3. the run dispatched from `main` with `package` set to `browser` and `publish` checked, and approved by an `npm` environment reviewer.

A new package must exist on npm before a trusted publisher can be added to it. Its first version is
published by dispatching the workflow with `bootstrap` checked and a short-lived granular token in the
`NPM_TOKEN` secret; delete the secret and revoke the token afterwards.

## Licence

[Apache-2.0](../../LICENSE). See [NOTICE](../../NOTICE) for the OpenTelemetry attribution.
