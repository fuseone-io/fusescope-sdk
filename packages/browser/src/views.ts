import { ROOT_CONTEXT, type Span, type Tracer } from '@opentelemetry/api';
import { type QueryPolicy, scrubUrl } from './scrub';

export interface ViewTracker {
  /** Route of the current view. */
  route(): string | undefined;
  /** Route the page was loaded on; page-load Web Vitals belong to it. */
  readonly loadRoute: string;
  /** Names the current view, e.g. with the router's route template. */
  setView(route: string): void;
  end(): void;
  uninstall(): void;
}

export interface ViewOptions {
  routeOf: (path: string) => string;
  allowedQueryParams: QueryPolicy;
}

type HistoryMethod = 'pushState' | 'replaceState';

/**
 * One `view` span per History API navigation, so its duration is the time on view: it ends at the next
 * navigation, when the page is hidden or unloaded, or on shutdown. Only the first view is an `initial_load`;
 * a view restarted when the page is shown again is a `route_change` with navigation type `restore`.
 */
export function installViews(tracer: Tracer, o: ViewOptions): ViewTracker {
  let current: { span: Span; path: string; route: string } | undefined;
  let lastRoute: string | undefined;

  const start = (navigationType: string) => {
    const path = location.pathname;
    if (current?.path === path) return;
    current?.span.end();
    const route = o.routeOf(path);
    lastRoute = route;
    const span = tracer.startSpan(
      'view',
      {
        attributes: {
          'url.path': path,
          'url.full': scrubUrl(location.href, o.allowedQueryParams),
          'fusescope.rum.view.route': route,
          'fusescope.rum.view.navigation_type': navigationType,
          'fusescope.rum.view.loading_type': navigationType === 'load' ? 'initial_load' : 'route_change',
        },
      },
      ROOT_CONTEXT,
    );
    current = { span, path, route };
  };

  const end = () => {
    current?.span.end();
    current = undefined;
  };

  const originals = { pushState: history.pushState, replaceState: history.replaceState };
  const patch = (method: HistoryMethod, navigationType: string) => {
    const original = originals[method];
    history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      start(navigationType);
      return result;
    };
  };
  patch('pushState', 'push');
  patch('replaceState', 'replace');
  const onPop = () => start('pop');
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') end();
    else if (!current) start('restore');
  };
  window.addEventListener('popstate', onPop);
  window.addEventListener('pagehide', end);
  document.addEventListener('visibilitychange', onVisibility);
  start('load');
  const loadRoute = lastRoute ?? o.routeOf(location.pathname);

  return {
    route: () => lastRoute,
    loadRoute,
    setView(route) {
      if (!current) start('manual');
      if (!current) return;
      current.route = route;
      lastRoute = route;
      current.span.setAttribute('fusescope.rum.view.route', route);
    },
    end,
    uninstall() {
      end();
      history.pushState = originals.pushState;
      history.replaceState = originals.replaceState;
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pagehide', end);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
