import { type Logger, type LogRecord, SeverityNumber } from '@opentelemetry/api-logs';
import { type Metric, onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';

/** `web-vitals` reports LCP, CLS and INP late, often after SPA navigations; they belong to the load route. */
export function withLoadRoute(route: string): (record: LogRecord) => void {
  return (record) => {
    record.attributes = { ...record.attributes, 'fusescope.rum.view.route': route };
  };
}

/**
 * Emits the `browser.web_vital` event of upstream's web-vitals instrumentation,
 * on the plain `web-vitals` build: upstream's attribution build costs 2.5 KB gzip more.
 */
export function vitalRecord(m: Metric): LogRecord {
  return {
    eventName: 'browser.web_vital',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      'browser.web_vital.name': m.name.toLowerCase(),
      'browser.web_vital.value': m.value,
      'browser.web_vital.delta': m.delta,
      'browser.web_vital.rating': m.rating,
      'browser.web_vital.id': m.id,
      'browser.web_vital.navigation_type': m.navigationType,
    },
  };
}

export function installVitals(logger: Logger, loadRoute: string): void {
  const stamp = withLoadRoute(loadRoute);
  const report = (m: Metric) => {
    const record = vitalRecord(m);
    stamp(record);
    logger.emit(record);
  };
  for (const on of [onCLS, onINP, onLCP, onFCP, onTTFB]) on(report);
}
