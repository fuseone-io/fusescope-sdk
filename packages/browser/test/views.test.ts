import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultRoute } from '../src/route';
import { installViews, type ViewTracker } from '../src/views';

describe('installViews', () => {
  let exporter: InMemorySpanExporter;
  let views: ViewTracker;
  const originalPushState = history.pushState;

  beforeEach(() => {
    history.replaceState(null, '', '/products/42?email=a@b.c#top');
    exporter = new InMemorySpanExporter();
    const tracer = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] }).getTracer('t');
    views = installViews(tracer, { routeOf: defaultRoute, allowedQueryParams: [] });
  });

  afterEach(() => views.uninstall());

  const viewSpans = () => exporter.getFinishedSpans().filter((s) => s.name === 'view');

  it('starts a view on load and remembers the load route', () => {
    expect(views.route()).toBe('/products/:id');
    expect(views.loadRoute).toBe('/products/:id');
    expect(viewSpans()).toHaveLength(0);
  });

  it('ends the view and starts the next on SPA navigation', () => {
    history.pushState(null, '', '/orders/7');
    expect(views.route()).toBe('/orders/:id');
    expect(views.loadRoute).toBe('/products/:id');
    const [first] = viewSpans();
    expect(first?.attributes).toMatchObject({
      'url.path': '/products/42',
      'url.full': `${location.origin}/products/42`,
      'fusescope.rum.view.route': '/products/:id',
      'fusescope.rum.view.navigation_type': 'load',
    });
  });

  it('ignores navigations that keep the path', () => {
    history.replaceState(null, '', '/products/42?tab=2');
    expect(viewSpans()).toHaveLength(0);
  });

  it('records the navigation type', () => {
    history.pushState(null, '', '/a');
    history.pushState(null, '', '/b');
    expect(viewSpans()[1]?.attributes['fusescope.rum.view.navigation_type']).toBe('push');
  });

  it('lets setView name the current view', () => {
    views.setView('/products/[slug]');
    expect(views.route()).toBe('/products/[slug]');
    history.pushState(null, '', '/x');
    expect(viewSpans()[0]?.attributes['fusescope.rum.view.route']).toBe('/products/[slug]');
  });

  it('ends the view when the page is hidden', () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    expect(viewSpans()).toHaveLength(1);
  });

  it('restores the History API on uninstall', () => {
    views.uninstall();
    expect(history.pushState).toBe(originalPushState);
  });
});
