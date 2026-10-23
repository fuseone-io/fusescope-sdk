import { expect, type Page, test } from '@playwright/test';
import { logRecords, received, spans } from './otlp';

const hide = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });

const requests = (page: Page) =>
  page.evaluate(async () => {
    await fetch('/api/same?token=secret');
    await fetch('http://127.0.0.1:4401/api/allowed?token=secret');
    await fetch('http://localhost:4401/api/other');
    await new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/xhr?token=secret');
      xhr.onloadend = resolve;
      xhr.send();
    });
  });

test.beforeEach(async ({ request }) => {
  await request.get('/__reset');
});

test('sampled session: attributes, scrubbing, propagation and events', async ({ page, request }) => {
  await page.goto('/products/42?email=a@b.c&keep=1#frag');
  await requests(page);
  await page.evaluate(async () => {
    history.pushState(null, '', '/orders/123?email=x@y.z');
    await FuseScope.setUser({ id: 'alice' });
    FuseScope.addAction('checkout', { 'app.cart.size': 2 });
    setTimeout(() => {
      throw new Error('boom at /checkout?card=4111');
    });
  });
  for (const target of ['#buy', '#add-to-cart span', 'a.nav-link', '.btn', '#email']) await page.click(target);
  await page.waitForTimeout(200);
  await hide(page);

  await expect
    .poll(
      async () => logRecords(await received(request)).some((l) => l.attributes['browser.web_vital.name'] === 'lcp'),
      { timeout: 15_000 },
    )
    .toBe(true);
  await page.evaluate(() => FuseScope.shutdown());
  const r = await received(request);
  const allSpans = spans(r);
  const logs = logRecords(r);

  // Transport: gateway paths, key header, OTLP/JSON.
  expect(new Set(r.exports.map((e) => e.signal))).toEqual(new Set(['traces', 'logs']));
  for (const e of r.exports) {
    expect(e.key).toBe('rum_pub_e2e');
    expect(e.contentType).toBe('application/json');
  }
  expect(r.preflights.find((p) => p.url === '/rum/v1/traces')?.headers).toContain('fusescope-rum-key');

  // Resource.
  expect(allSpans[0]?.resource).toMatchObject({
    'service.name': 'e2e-web',
    'service.version': '9.9.9',
    'deployment.environment.name': 'test',
    'fusescope.rum.platform': 'web',
    'fusescope.rum.application.id': 'e2e-web',
    'telemetry.distro.name': '@fusescope/browser',
    'telemetry.distro.version': '0.2.0-beta.0',
    'telemetry.sdk.language': 'webjs',
  });

  // Session on every signal, one id.
  const ids = new Set([...allSpans, ...logs].map((x) => x.attributes['session.id']));
  expect(ids.size).toBe(1);
  expect([...ids][0]).toMatch(/^[0-9a-f]{32}$/);

  // Views with route templates.
  const views = allSpans.filter((s) => s.name === 'view');
  expect(views.map((v) => v.attributes['fusescope.rum.view.route'])).toEqual(['/products/:id', '/orders/:id']);
  expect(views.map((v) => v.attributes['fusescope.rum.view.loading_type'])).toEqual(['initial_load', 'route_change']);
  expect(views[0]?.attributes['url.full']).toBe('http://localhost:4400/products/42?keep=1');

  // HTTP spans, scrubbed; traceparent to same origin and allow-listed origins only.
  const http = allSpans.filter((s) => s.attributes['http.request.method'] === 'GET');
  expect(http.map((s) => s.attributes['url.full']).sort()).toEqual([
    'http://127.0.0.1:4401/api/allowed',
    'http://localhost:4400/api/same',
    'http://localhost:4400/api/xhr',
    'http://localhost:4401/api/other',
  ]);
  const tp = Object.fromEntries(r.api.map((a) => [`${a.host}${a.url.split('?')[0]}`, a.traceparent]));
  expect(tp['localhost:4400/api/same']).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  expect(tp['localhost:4400/api/xhr']).toMatch(/-01$/);
  expect(tp['127.0.0.1:4401/api/allowed']).toMatch(/-01$/);
  expect(tp['localhost:4401/api/other']).toBeNull();

  // Events carry event.name as an attribute.
  const byEvent = (name: string) => logs.filter((l) => l.eventName === name);
  for (const l of logs) expect(l.attributes['event.name']).toBe(l.eventName);
  const [error] = byEvent('exception');
  expect(error?.attributes).toMatchObject({
    'exception.type': 'Error',
    'exception.message': 'boom at /checkout',
    'fusescope.rum.error.source': 'onerror',
    'fusescope.rum.view.route': '/orders/:id',
  });
  expect(error?.attributes['exception.stacktrace']).toMatch(/^Error: boom at \/checkout\n\s+at .+:\d+:\d+/);
  const clicks = byEvent('browser.user_action.click');
  expect(clicks[0]?.attributes).toMatchObject({ 'fusescope.rum.action.type': 'click', 'browser.css_selector': '#buy' });
  expect(clicks.map((c) => c.attributes['fusescope.rum.action.target'])).toEqual([
    'button#buy',
    'button#add-to-cart',
    'a.nav-link',
    'div[data-fusescope-action="checkout"]',
    'input#email',
  ]);
  expect(byEvent('fusescope.rum.action')[0]?.attributes).toMatchObject({
    'fusescope.rum.action.name': 'checkout',
    'app.cart.size': 2,
    'user.id': '2bd806c97f0e00af1a1fc3328fa763a9269723c8db8fac4f93af71db186d6e90',
  });
  for (const l of logs) expect(l.attributes).not.toHaveProperty('user.hash');
  expect(byEvent('browser.navigation_timing')).toHaveLength(1);

  // Page-load vitals keep the route they were loaded on, even after navigating.
  const lcp = byEvent('browser.web_vital').find((l) => l.attributes['browser.web_vital.name'] === 'lcp');
  expect(lcp?.attributes['fusescope.rum.view.route']).toBe('/products/:id');

  // No PII left anywhere in the payloads.
  const wire = JSON.stringify(r.exports.map((e) => e.body));
  for (const pii of ['a@b.c', 'x@y.z', 'secret', 'card=4111', 'frag', '"alice"', 'typed@', 'Add to cart'])
    expect(wire).not.toContain(pii);
});

test('unsampled session: nothing exported and no traceparent', async ({ page, request }) => {
  await page.goto('/products/42?rate=0');
  await requests(page);
  await page.evaluate(() => FuseScope.addError(new Error('dropped')));
  await hide(page);
  await page.evaluate(() => FuseScope.shutdown());
  const r = await received(request);
  expect(r.exports).toHaveLength(0);
  expect(r.api).toHaveLength(4);
  for (const a of r.api) expect(a.traceparent).toBeNull();
});

test('tabs share one session', async ({ context, request }) => {
  const [a, b] = [await context.newPage(), await context.newPage()];
  await a.goto('/a');
  await b.goto('/b');
  await a.evaluate(() => FuseScope.shutdown());
  await b.evaluate(() => FuseScope.shutdown());
  const views = spans(await received(request)).filter((s) => s.name === 'view');
  expect(views).toHaveLength(2);
  expect(views[0]?.attributes['session.id']).toBe(views[1]?.attributes['session.id']);
});

test('consent: nothing is collected before setConsent(true)', async ({ page, request }) => {
  await page.goto('/a?consent=required');
  await page.evaluate(() => fetch('/api/before'));
  await page.evaluate(() => FuseScope.setConsent(true));
  await page.evaluate(() => fetch('/api/after'));
  await page.evaluate(() => FuseScope.shutdown());
  const urls = spans(await received(request)).map((s) => s.attributes['url.full']);
  expect(urls).toContain('http://localhost:4400/api/after');
  expect(urls).not.toContain('http://localhost:4400/api/before');
});

test('time on view: views end on navigation and on pagehide', async ({ page, request }) => {
  await page.goto('/a');
  await page.waitForTimeout(300);
  await page.evaluate(() => history.pushState(null, '', '/b'));
  await page.waitForTimeout(200);
  await page.goto('/c');
  await expect
    .poll(async () => spans(await received(request)).filter((s) => s.name === 'view').length, { timeout: 10_000 })
    .toBe(2);
  await page.evaluate(() => FuseScope.shutdown());
  const views = spans(await received(request)).filter((s) => s.name === 'view');
  expect(views.map((v) => [v.attributes['url.path'], v.attributes['fusescope.rum.view.loading_type']])).toEqual([
    ['/a', 'initial_load'],
    ['/b', 'route_change'],
    ['/c', 'initial_load'],
  ]);
  expect(views[0]?.durationMs).toBeGreaterThanOrEqual(300);
  expect(views[1]?.durationMs).toBeGreaterThanOrEqual(200);
});

test('session rotates after inactivity and links the previous one', async ({ page, request }) => {
  await page.clock.install();
  await page.goto('/a');
  await page.evaluate(() => FuseScope.addAction('before'));
  await page.clock.fastForward('16:00');
  await page.evaluate(() => FuseScope.addAction('after'));
  await page.evaluate(() => FuseScope.shutdown());
  const actions = logRecords(await received(request)).filter((l) => l.eventName === 'fusescope.rum.action');
  const [before, after] = actions.map((a) => a.attributes);
  expect(actions.map((a) => a.attributes['fusescope.rum.action.name'])).toEqual(['before', 'after']);
  expect(after?.['session.id']).toMatch(/^[0-9a-f]{32}$/);
  expect(after?.['session.id']).not.toBe(before?.['session.id']);
  expect(after?.['session.previous_id']).toBe(before?.['session.id']);
});
