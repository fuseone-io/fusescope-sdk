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
  await page.click('#buy');
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
    'telemetry.distro.version': '0.1.0',
    'telemetry.sdk.language': 'webjs',
  });

  // Session on every signal, one id.
  const ids = new Set([...allSpans, ...logs].map((x) => x.attributes['session.id']));
  expect(ids.size).toBe(1);
  expect([...ids][0]).toMatch(/^[0-9a-f]{32}$/);

  // Views with route templates.
  const views = allSpans.filter((s) => s.name === 'view');
  expect(views.map((v) => v.attributes['fusescope.rum.view.route'])).toEqual(['/products/:id', '/orders/:id']);
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
  expect(byEvent('browser.user_action.click')[0]?.attributes).toMatchObject({
    'fusescope.rum.action.type': 'click',
    'browser.css_selector': '#buy',
  });
  expect(byEvent('fusescope.rum.action')[0]?.attributes).toMatchObject({
    'fusescope.rum.action.name': 'checkout',
    'app.cart.size': 2,
    'user.hash': '2bd806c97f0e00af1a1fc3328fa763a9269723c8db8fac4f93af71db186d6e90',
  });
  expect(byEvent('browser.navigation_timing')).toHaveLength(1);

  // Page-load vitals keep the route they were loaded on, even after navigating.
  const lcp = byEvent('browser.web_vital').find((l) => l.attributes['browser.web_vital.name'] === 'lcp');
  expect(lcp?.attributes['fusescope.rum.view.route']).toBe('/products/:id');

  // No PII left anywhere in the payloads.
  const wire = JSON.stringify(r.exports.map((e) => e.body));
  for (const pii of ['a@b.c', 'x@y.z', 'secret', 'card=4111', 'frag', '"alice"']) expect(wire).not.toContain(pii);
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
