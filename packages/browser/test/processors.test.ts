import { ROOT_CONTEXT } from '@opentelemetry/api';
import { InMemoryLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { describe, expect, it } from 'vitest';
import { type RumContext, RumLogProcessor, rumSpanProcessors } from '../src/processors';
import type { SessionRecord } from '../src/session';

function rumContext(overrides: Partial<SessionRecord> = {}): RumContext {
  const session: SessionRecord = {
    id: 'a'.repeat(32),
    previousId: 'b'.repeat(32),
    startedAt: 0,
    lastActiveAt: 0,
    sampled: true,
    ...overrides,
  };
  return {
    sessions: { get: () => session, getSessionId: () => session.id },
    route: () => '/orders/:id',
    user: () => ({ 'user.hash': 'h' }),
    allowedQueryParams: ['keep'],
  };
}

function traces(ctx: RumContext) {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({
    spanProcessors: rumSpanProcessors(ctx, new SimpleSpanProcessor({ exporter })),
  });
  return { tracer: provider.getTracer('test'), exporter };
}

function logs(ctx: RumContext) {
  const exporter = new InMemoryLogRecordExporter();
  const provider = new LoggerProvider({
    processors: [new RumLogProcessor(ctx, new SimpleLogRecordProcessor({ exporter }))],
  });
  return { logger: provider.getLogger('test'), exporter };
}

describe('span processors', () => {
  it('stamp session, view and user attributes', () => {
    const { tracer, exporter } = traces(rumContext());
    tracer.startSpan('GET', {}, ROOT_CONTEXT).end();
    expect(exporter.getFinishedSpans()[0]?.attributes).toMatchObject({
      'session.id': 'a'.repeat(32),
      'session.previous_id': 'b'.repeat(32),
      'fusescope.rum.view.route': '/orders/:id',
      'user.hash': 'h',
    });
  });

  it('keep attributes the span already has', () => {
    const { tracer, exporter } = traces(rumContext());
    tracer.startSpan('view', { attributes: { 'fusescope.rum.view.route': '/home' } }, ROOT_CONTEXT).end();
    expect(exporter.getFinishedSpans()[0]?.attributes['fusescope.rum.view.route']).toBe('/home');
  });

  it('scrub URL attributes and span names', () => {
    const { tracer, exporter } = traces(rumContext());
    const span = tracer.startSpan('Navigation: /c/1#t?email=a@b.c', {}, ROOT_CONTEXT);
    span.setAttribute('url.full', 'https://api.example/c?email=a@b.c&keep=1');
    span.end();
    const [out] = exporter.getFinishedSpans();
    expect(out?.name).toBe('Navigation: /c/1');
    expect(out?.attributes['url.full']).toBe('https://api.example/c?keep=1');
  });
});

describe('RumLogProcessor', () => {
  it('drops records of unsampled sessions', () => {
    const { logger, exporter } = logs(rumContext({ sampled: false }));
    logger.emit({ eventName: 'exception', attributes: {} });
    expect(exporter.getFinishedLogRecords()).toHaveLength(0);
  });

  it('copies the event name into the event.name attribute', () => {
    const { logger, exporter } = logs(rumContext());
    logger.emit({ eventName: 'browser.web_vital', attributes: { 'browser.web_vital.name': 'lcp' } });
    const [record] = exporter.getFinishedLogRecords();
    expect(record?.eventName).toBe('browser.web_vital');
    expect(record?.attributes).toMatchObject({
      'event.name': 'browser.web_vital',
      'session.id': 'a'.repeat(32),
      'session.previous_id': 'b'.repeat(32),
      'fusescope.rum.view.route': '/orders/:id',
    });
  });

  it('keeps a route set by the emitter', () => {
    const { logger, exporter } = logs(rumContext());
    logger.emit({ eventName: 'browser.web_vital', attributes: { 'fusescope.rum.view.route': '/products/:id' } });
    expect(exporter.getFinishedLogRecords()[0]?.attributes['fusescope.rum.view.route']).toBe('/products/:id');
  });

  it('types click actions', () => {
    const { logger, exporter } = logs(rumContext());
    logger.emit({ eventName: 'browser.user_action.click', attributes: { 'browser.css_selector': '#buy' } });
    expect(exporter.getFinishedLogRecords()[0]?.attributes['fusescope.rum.action.type']).toBe('click');
  });

  it('scrubs URLs in attributes, exception messages, stack traces and the body', () => {
    const { logger, exporter } = logs(rumContext());
    logger.emit({
      eventName: 'exception',
      body: 'Failed to load /u?token=t',
      attributes: {
        'exception.stacktrace': 'Error: Failed to load /u?token=t\n    at https://a.example/app.js?v=1:1:2',
        'url.full': 'https://a.example/p?token=t#x',
        'exception.message': 'Failed to load https://a.example/u?token=t',
      },
    });
    const [record] = exporter.getFinishedLogRecords();
    expect(record?.body).toBe('Failed to load /u');
    expect(record?.attributes).toMatchObject({
      'url.full': 'https://a.example/p',
      'exception.message': 'Failed to load https://a.example/u',
      'exception.stacktrace': 'Error: Failed to load /u\n    at https://a.example/app.js:1:2',
    });
  });
});
