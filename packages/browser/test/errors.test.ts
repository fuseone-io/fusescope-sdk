import { InMemoryLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { afterEach, describe, expect, it } from 'vitest';
import { captureError, errorAttributes, installErrorCapture } from '../src/errors';

function harness() {
  const exporter = new InMemoryLogRecordExporter();
  const logger = new LoggerProvider({ processors: [new SimpleLogRecordProcessor({ exporter })] }).getLogger('t');
  return { exporter, logger };
}

describe('errorAttributes', () => {
  it('maps an Error', () => {
    const err = new TypeError('boom');
    expect(errorAttributes(err, 'onerror')).toMatchObject({
      'exception.type': 'TypeError',
      'exception.message': 'boom',
      'exception.stacktrace': err.stack,
      'fusescope.rum.error.source': 'onerror',
    });
  });

  it('maps a thrown string', () => {
    expect(errorAttributes('nope', 'unhandledrejection')).toEqual({
      'exception.type': 'string',
      'exception.message': 'nope',
      'fusescope.rum.error.source': 'unhandledrejection',
    });
  });
});

describe('captureError', () => {
  it('emits an exception event with extra attributes', () => {
    const { exporter, logger } = harness();
    captureError(logger, new Error('x'), 'manual', { 'app.step': 'checkout' });
    const [record] = exporter.getFinishedLogRecords();
    expect(record?.eventName).toBe('exception');
    expect(record?.severityText).toBe('ERROR');
    expect(record?.attributes).toMatchObject({ 'fusescope.rum.error.source': 'manual', 'app.step': 'checkout' });
  });
});

describe('installErrorCapture', () => {
  let uninstall: (() => void) | undefined;
  afterEach(() => uninstall?.());

  it('captures window errors until uninstalled', () => {
    const { exporter, logger } = harness();
    uninstall = installErrorCapture(logger);
    window.dispatchEvent(new ErrorEvent('error', { error: new RangeError('r'), message: 'r' }));
    expect(exporter.getFinishedLogRecords()[0]?.attributes['fusescope.rum.error.source']).toBe('onerror');
    uninstall();
    window.dispatchEvent(new ErrorEvent('error', { error: new RangeError('r'), message: 'r' }));
    expect(exporter.getFinishedLogRecords()).toHaveLength(1);
  });

  it('builds a stack trace from the error location when there is no Error', () => {
    const { exporter, logger } = harness();
    uninstall = installErrorCapture(logger);
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'Script error.',
        filename: 'https://a.example/app.min.js',
        lineno: 1,
        colno: 4821,
      }),
    );
    expect(exporter.getFinishedLogRecords()[0]?.attributes).toMatchObject({
      'exception.message': 'Script error.',
      'exception.stacktrace': 'Script error.\n    at https://a.example/app.min.js:1:4821',
    });
  });
});
