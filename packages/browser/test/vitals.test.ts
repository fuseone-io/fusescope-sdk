import type { LogRecord } from '@opentelemetry/api-logs';
import { describe, expect, it } from 'vitest';
import { vitalRecord, withLoadRoute } from '../src/vitals';

describe('withLoadRoute', () => {
  it('stamps the route the page was loaded on', () => {
    const record: LogRecord = { eventName: 'browser.web_vital', attributes: { 'browser.web_vital.name': 'lcp' } };
    withLoadRoute('/products/:id')(record);
    expect(record.attributes).toEqual({
      'browser.web_vital.name': 'lcp',
      'fusescope.rum.view.route': '/products/:id',
    });
  });

  it('creates the attributes when missing', () => {
    const record: LogRecord = {};
    withLoadRoute('/')(record);
    expect(record.attributes).toEqual({ 'fusescope.rum.view.route': '/' });
  });
});

describe('vitalRecord', () => {
  it('uses the upstream browser.web_vital names', () => {
    const record = vitalRecord({
      name: 'LCP',
      value: 1200,
      delta: 1200,
      rating: 'good',
      id: 'v5-1',
      navigationType: 'navigate',
      entries: [],
      navigationId: 1,
    });
    expect(record.eventName).toBe('browser.web_vital');
    expect(record.attributes).toEqual({
      'browser.web_vital.name': 'lcp',
      'browser.web_vital.value': 1200,
      'browser.web_vital.delta': 1200,
      'browser.web_vital.rating': 'good',
      'browser.web_vital.id': 'v5-1',
      'browser.web_vital.navigation_type': 'navigate',
    });
  });
});
