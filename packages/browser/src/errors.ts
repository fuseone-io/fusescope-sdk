import type { Attributes } from '@opentelemetry/api';
import { type Logger, SeverityNumber } from '@opentelemetry/api-logs';

export type ErrorSource = 'onerror' | 'unhandledrejection' | 'manual';

export function errorAttributes(error: unknown, source: ErrorSource): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (error instanceof Error) {
    attrs['exception.type'] = error.name;
    attrs['exception.message'] = error.message;
    if (error.stack) attrs['exception.stacktrace'] = error.stack;
  } else {
    attrs['exception.type'] = typeof error;
    attrs['exception.message'] = String(error);
  }
  attrs['fusescope.rum.error.source'] = source;
  return attrs;
}

export function captureError(logger: Logger, error: unknown, source: ErrorSource, extra?: Attributes): void {
  const attrs = errorAttributes(error, source);
  logger.emit({
    eventName: 'exception',
    severityNumber: SeverityNumber.ERROR,
    severityText: 'ERROR',
    body: attrs['exception.message'],
    attributes: { ...extra, ...attrs },
  });
}

/**
 * Captures uncaught errors and unhandled rejections. Upstream's errors
 * instrumentation does not tell the two apart, which
 * `fusescope.rum.error.source` needs.
 */
export function installErrorCapture(logger: Logger): () => void {
  const onError = (e: ErrorEvent) => captureError(logger, e.error ?? e.message, 'onerror');
  const onRejection = (e: PromiseRejectionEvent) => captureError(logger, e.reason, 'unhandledrejection');
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
