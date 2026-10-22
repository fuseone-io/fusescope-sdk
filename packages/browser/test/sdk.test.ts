import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type BrowserConfig, resolveConfig } from '../src/config';
import { type Rum, startRum } from '../src/sdk';

const base: BrowserConfig = {
  applicationId: 'shop-web',
  publicKey: 'rum_pub_1',
  endpoint: 'https://f.example',
  instrumentations: { fetch: false, xhr: false, documentLoad: false, webVitals: false },
};

// The in-memory exporters forget their data on shutdown, which startRum's shutdown triggers.
class KeptSpans extends InMemorySpanExporter {
  override shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

class KeptLogs extends InMemoryLogRecordExporter {
  override shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

describe('startRum', () => {
  let spans: InMemorySpanExporter;
  let logs: InMemoryLogRecordExporter;
  let rum: Rum | undefined;

  const start = (config: Partial<BrowserConfig> = {}) => {
    rum = startRum(resolveConfig({ ...base, ...config }), { spans, logs });
    return rum;
  };

  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, '', '/products/42');
    spans = new KeptSpans();
    logs = new KeptLogs();
  });

  afterEach(async () => {
    await rum?.shutdown();
    rum = undefined;
  });

  it('exports the view and its resource on shutdown', async () => {
    const r = start({ environment: 'prod', version: '2.0.0' });
    await r.shutdown();
    const [view] = spans.getFinishedSpans();
    expect(view?.name).toBe('view');
    expect(view?.attributes['fusescope.rum.view.route']).toBe('/products/:id');
    expect(view?.attributes['session.id']).toMatch(/^[0-9a-f]{32}$/);
    expect(view?.resource.attributes).toMatchObject({
      'service.name': 'shop-web',
      'service.version': '2.0.0',
      'deployment.environment.name': 'prod',
      'fusescope.rum.platform': 'web',
    });
  });

  it('records errors and custom actions as events', async () => {
    const r = start();
    r.addError(new Error('payment failed'), { 'app.step': 'pay' });
    r.addAction('add_to_cart', { 'app.sku': 'x1' });
    await r.shutdown();
    const records = logs.getFinishedLogRecords();
    expect(records.map((l) => l.attributes['event.name'])).toEqual(['exception', 'fusescope.rum.action']);
    expect(records[0]?.attributes).toMatchObject({ 'exception.message': 'payment failed', 'app.step': 'pay' });
    expect(records[1]?.attributes).toMatchObject({
      'fusescope.rum.action.type': 'custom',
      'fusescope.rum.action.name': 'add_to_cart',
      'app.sku': 'x1',
    });
  });

  it('stamps the user once set', async () => {
    const r = start({ privacy: { hashUserId: false } });
    await r.setUser({ id: 'u-1' });
    r.addAction('a');
    await r.shutdown();
    expect(logs.getFinishedLogRecords()[0]?.attributes['user.id']).toBe('u-1');
  });

  it('names the current view with setView', async () => {
    const r = start();
    r.setView('/products/[slug]');
    await r.shutdown();
    expect(spans.getFinishedSpans()[0]?.attributes['fusescope.rum.view.route']).toBe('/products/[slug]');
  });

  it('exports nothing for an unsampled session', async () => {
    const r = start({ sessionSampleRate: 0 });
    r.addError(new Error('x'));
    await r.shutdown();
    expect(spans.getFinishedSpans()).toHaveLength(0);
    expect(logs.getFinishedLogRecords()).toHaveLength(0);
  });

  it('can start again after shutdown', async () => {
    await start().shutdown();
    start().addAction('again');
    await rum?.shutdown();
    expect(logs.getFinishedLogRecords()).toHaveLength(1);
  });
});
