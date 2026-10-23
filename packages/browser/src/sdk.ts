import { type Attributes, context, propagation, trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider, type LogRecordExporter } from '@opentelemetry/sdk-logs';
import { BatchSpanProcessor, type SpanExporter, StackContextManager, TracerProvider } from '@opentelemetry/sdk-trace';
import type { ResolvedConfig } from './config';
import { captureError, installErrorCapture } from './errors';
import { instrumentations } from './instrumentations';
import { type RumContext, RumLogProcessor, rumSpanProcessors } from './processors';
import { resourceAttributes } from './resource';
import { defaultRoute } from './route';
import { SampledOnlyPropagator, SessionSampler } from './sampling';
import { SessionManager } from './session';
import { type User, userAttributes } from './user';
import { SDK_NAME, SDK_VERSION } from './version';
import { installViews } from './views';
import { installVitals } from './vitals';

export interface Exporters {
  spans: SpanExporter;
  logs: LogRecordExporter;
}

export interface Rum {
  addError(error: unknown, attributes?: Attributes): void;
  addAction(name: string, attributes?: Attributes): void;
  setView(route: string): void;
  setUser(user: User | null): Promise<void>;
  shutdown(): Promise<void>;
}

const ACTIVITY_EVENTS = ['click', 'keydown', 'scroll', 'touchstart'];
const EXPORT_DELAY_MS = 2_000;

function otlpExporters(c: ResolvedConfig): Exporters {
  return {
    spans: new OTLPTraceExporter({ url: c.tracesUrl, headers: c.headers }),
    logs: new OTLPLogExporter({ url: c.logsUrl, headers: c.headers }),
  };
}

export function startRum(c: ResolvedConfig, exporters: Exporters = otlpExporters(c)): Rum {
  const sessions = new SessionManager({ ...c.session, sampleRate: c.sessionSampleRate });
  let user: Attributes = {};
  let userCalls = 0;
  let route: () => string | undefined = () => undefined;
  const ctx: RumContext = {
    sessions,
    route: () => route(),
    user: () => user,
    allowedQueryParams: c.privacy.allowedQueryParams,
  };
  const spanExport = new BatchSpanProcessor({ exporter: exporters.spans, scheduledDelayMillis: EXPORT_DELAY_MS });
  const logExport = new BatchLogRecordProcessor({ exporter: exporters.logs, scheduledDelayMillis: EXPORT_DELAY_MS });

  // Providers are wired by hand rather than with upstream's startBrowserSdk(), which adds 1.2 KB gzip
  // (baggage and composite propagators, config plumbing) to a bundle with a 35 KB budget.
  const resource = defaultResource().merge(resourceFromAttributes(resourceAttributes(c)));
  const tracerProvider = new TracerProvider({
    resource,
    sampler: new SessionSampler(sessions),
    spanProcessors: rumSpanProcessors(ctx, spanExport),
  });
  const loggerProvider = new LoggerProvider({ resource, processors: [new RumLogProcessor(ctx, logExport)] });
  trace.setGlobalTracerProvider(tracerProvider);
  logs.setGlobalLoggerProvider(loggerProvider);
  propagation.setGlobalPropagator(new SampledOnlyPropagator(new W3CTraceContextPropagator()));
  context.setGlobalContextManager(new StackContextManager().enable());
  const tracer = trace.getTracer(SDK_NAME, SDK_VERSION);
  const logger = logs.getLogger(SDK_NAME, SDK_VERSION);

  const views = installViews(tracer, {
    routeOf: c.routeTemplate ?? defaultRoute,
    allowedQueryParams: c.privacy.allowedQueryParams,
  });
  route = views.route;
  const uninstallErrors = c.instrumentations.errors ? installErrorCapture(logger) : () => {};
  if (c.instrumentations.webVitals) installVitals(logger, views.loadRoute);
  const deregister = registerInstrumentations({ instrumentations: instrumentations(c) });

  const touch = () => sessions.touch();
  for (const type of ACTIVITY_EVENTS) window.addEventListener(type, touch, { passive: true, capture: true });
  // Registered after the view tracker, so the view ended on hide is part of the flush.
  const flush = () => void Promise.all([spanExport.forceFlush(), logExport.forceFlush()]);
  const flushOnHide = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', flushOnHide);
  window.addEventListener('pagehide', flush);

  return {
    addError: (error, attributes) => captureError(logger, error, 'manual', attributes),
    addAction: (name, attributes) =>
      logger.emit({
        eventName: 'fusescope.rum.action',
        severityNumber: SeverityNumber.INFO,
        attributes: { ...attributes, 'fusescope.rum.action.type': 'custom', 'fusescope.rum.action.name': name },
      }),
    setView: (r) => views.setView(r),
    // Until the hash resolves, records carry no user rather than the previous one; only the last call wins.
    async setUser(next) {
      const call = ++userCalls;
      user = {};
      let attrs: Attributes = {};
      try {
        attrs = await userAttributes(next, c.privacy.hashUserId);
      } catch {
        console.warn('FuseScope: setUser() needs a secure context (HTTPS) to hash the user id; user not set');
      }
      if (call === userCalls) user = attrs;
    },
    async shutdown() {
      deregister();
      uninstallErrors();
      views.uninstall();
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, touch, { capture: true });
      document.removeEventListener('visibilitychange', flushOnHide);
      window.removeEventListener('pagehide', flush);
      sessions.dispose();
      await Promise.all([tracerProvider.shutdown(), loggerProvider.shutdown()]);
      trace.disable();
      logs.disable();
      propagation.disable();
      context.disable();
    },
  };
}
