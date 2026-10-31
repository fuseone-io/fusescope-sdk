# @fusescope/browser-react

React adapters for `@fusescope/browser`. Apache-2.0; see [NOTICE](../../NOTICE).

- `ErrorBoundary` (root entry): accepts `children` and a required `fallback` React node or render function `({ error, reset }) => ReactNode`. Reports caught render/lifecycle errors through `browser.addError()`, which sets `fusescope.rum.error.source=manual`, with the React component stack in `fusescope.rum.react.component_stack`. Pass `resetKeys={[location.pathname]}` to recover on navigation, or call `reset()` from the fallback to retry. Keys are compared with `Object.is`; a different React `key` also resets the boundary. Component stacks are trimmed of surrounding whitespace, scrubbed of URL queries/fragments and truncated to the first 4,096 characters, independently of the browser SDK’s URL privacy setting. Event-handler and async errors still use the browser SDK.
- `reactRouterRouteTemplate(routes, basename?)` (`@fusescope/browser-react/react-router`): pass its return value as `routeTemplate` to `browser.init()` before mounting the router. Uses React Router's matcher and declared paths, including nested/index/pathless/optional/splat routes; unmatched paths or malformed route configurations use `/*`. It adds no history listeners or view spans: the browser SDK creates one view per pathname navigation. The same pattern can therefore have several visits.

Peers: `@fusescope/browser` `^0.2.0-beta.1` (0.2.0-beta.1 or a later 0.2.0 prerelease, or any 0.2.x release; not 0.3), React 18/19. The optional router entry requires React Router 6.30.6+ or 7.18.5+. The error boundary entry does not import the router.

The router entry imports `react-router`, not `react-router-dom`. An app that lists only `react-router-dom` (usual with React Router 6) must also add `react-router` as a direct dependency, at the same version, under installers that don't hoist transitive dependencies, such as pnpm. Browser history routers (`BrowserRouter`, `createBrowserRouter`) are supported; hash and memory routers do not create pathname navigations and are outside this adapter's scope.

Setup, consent, data-router boundary placement and verification: [React setup guide](https://docs.fusescope.fuseone.io/frontend/set-up-react/).

## Initialization and development errors

Call `browser.init()` **before** `createRoot().render()`. Errors caught before initialization (or while waiting for consent) are dropped, not buffered.

React 18 development builds rethrow an error caught by a boundary to `window.onerror`, so the browser SDK also reports it with source `onerror`, in addition to the boundary’s `manual` event. React 18 production builds and React 19 do not: React 19 passes caught errors to the root's `onCaughtError`, which by default logs them with `console.error`, and the browser SDK does not report console output.

## Development sample

From the workspace root:

```sh
npx -y pnpm@10 install
npx -y pnpm@10 build
npx -y pnpm@10 --filter @fusescope/browser-react sample
```

Open `http://127.0.0.1:4500/products/red-shoe`. Links navigate between two products sharing `/products/:productId` and a page that throws a render error. By default the local server records OTLP at `/__received`; it is a test gateway, not a FuseScope instance. To send to a real application instead, open the sample with URL query parameters `endpoint`, `applicationId` and `publicKey`, and allow `http://127.0.0.1:4500` in that application's origins. The key is the public `rum_pub_…` key, never a service account key.

```sh
npx -y pnpm@10 --filter @fusescope/browser-react test
npx -y pnpm@10 --filter @fusescope/browser-react exec playwright install chromium
npx -y pnpm@10 --filter @fusescope/browser-react test:e2e
```

CI runs React 19 / React Router 7 and React 18 / React Router 6. Playwright checks the actual OTLP exports, one view per navigation, manual error source, current route, session and consent.

## Release

Select `browser-react` in the existing `release` workflow. It uses the same licence and CVE gates, SBOM, pack, provenance and `next` prerelease tag as the other packages. The initial npm publication needs the workflow's existing bootstrap procedure, then configure its trusted publisher; see [browser release instructions](../browser/README.md#releasing). No publish runs automatically on merge.
