import type { Attributes, Context } from '@opentelemetry/api';
import { SessionLogRecordProcessor, SessionSpanProcessor } from '@opentelemetry/browser-sdk/session';
import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace';
import { type QueryPolicy, scrubAttributes, scrubStack, scrubText } from './scrub';
import type { SessionRecord } from './session';

export interface RumContext {
  sessions: { get(): SessionRecord; getSessionId(): string };
  route(): string | undefined;
  user(): Attributes;
  allowedQueryParams: QueryPolicy;
}

const ACTION_EVENT_PREFIX = 'browser.user_action.';

function rumAttributes(ctx: RumContext): Attributes {
  const attrs: Attributes = { ...ctx.user() };
  const previousId = ctx.sessions.get().previousId;
  if (previousId) attrs['session.previous_id'] = previousId;
  const route = ctx.route();
  if (route) attrs['fusescope.rum.view.route'] = route;
  return attrs;
}

/** Adds session, view and user attributes on start and scrubs PII from attributes and the name on end. */
export class RumSpanProcessor implements SpanProcessor {
  constructor(private readonly ctx: RumContext) {}

  onStart(span: Span): void {
    span.setAttributes({ ...rumAttributes(this.ctx), ...span.attributes });
  }

  /** Spans that started before `setUser()` resolved, such as the initial view, get the user on end. */
  onEnding(span: Span): void {
    if (span.attributes['user.id'] === undefined) span.setAttributes(this.ctx.user());
    span.setAttributes(scrubAttributes(span.attributes, this.ctx.allowedQueryParams));
    const name = scrubText(span.name, this.ctx.allowedQueryParams);
    if (name !== span.name) span.updateName(name);
  }

  onEnd(_span: ReadableSpan): void {}

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

export function rumSpanProcessors(ctx: RumContext, exporting: SpanProcessor): SpanProcessor[] {
  return [new SessionSpanProcessor(ctx.sessions), new RumSpanProcessor(ctx), exporting];
}

/**
 * Drops records of unsampled sessions, adds the RUM attributes, copies the
 * event name into `event.name` (storage drops the record's own field) and
 * scrubs PII before handing the record to `next`.
 */
export class RumLogProcessor implements LogRecordProcessor {
  private readonly session: SessionLogRecordProcessor;

  constructor(
    private readonly ctx: RumContext,
    private readonly next: LogRecordProcessor,
  ) {
    this.session = new SessionLogRecordProcessor(ctx.sessions);
  }

  onEmit(record: SdkLogRecord, context?: Context): void {
    if (!this.ctx.sessions.get().sampled) return;
    this.session.onEmit(record, context);
    const extra: Attributes = rumAttributes(this.ctx);
    const eventName = record.eventName;
    if (eventName) {
      extra['event.name'] = eventName;
      if (eventName.startsWith(ACTION_EVENT_PREFIX)) {
        extra['fusescope.rum.action.type'] = eventName.slice(ACTION_EVENT_PREFIX.length);
      }
    }
    record.setAttributes({ ...extra, ...record.attributes });
    record.setAttributes(scrubAttributes(record.attributes, this.ctx.allowedQueryParams));
    const policy = this.ctx.allowedQueryParams;
    const { 'exception.message': message, 'exception.stacktrace': stack } = record.attributes;
    if (typeof message === 'string') record.setAttribute('exception.message', scrubText(message, policy));
    if (typeof stack === 'string') record.setAttribute('exception.stacktrace', scrubStack(stack, policy));
    if (typeof record.body === 'string') record.setBody(scrubText(record.body, policy));
    this.next.onEmit(record, context);
  }

  forceFlush(): Promise<void> {
    return this.next.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.next.shutdown();
  }
}
