import {
  type Context,
  type TextMapGetter,
  type TextMapPropagator,
  type TextMapSetter,
  TraceFlags,
  trace,
} from '@opentelemetry/api';
import { type Sampler, SamplingDecision, type SamplingResult } from '@opentelemetry/sdk-trace';

/** Deterministic per id, so every tab and every signal of a session agrees. */
export function isSampled(sessionId: string, rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  return Number.parseInt(sessionId.slice(0, 8), 16) / 0xffffffff < rate;
}

export interface SampledSession {
  get(): { sampled: boolean };
}

/** Samples whole sessions: every span of a session shares its decision. */
export class SessionSampler implements Sampler {
  constructor(private readonly sessions: SampledSession) {}

  shouldSample(): SamplingResult {
    return {
      decision: this.sessions.get().sampled ? SamplingDecision.RECORD_AND_SAMPLED : SamplingDecision.NOT_RECORD,
    };
  }

  toString(): string {
    return 'SessionSampler';
  }
}

/**
 * An unsampled browser span would send `traceparent` with flags 00, and
 * parent-based backend samplers would then drop the server trace too.
 * Unsampled sessions send no header, so the backend samples on its own.
 */
export class SampledOnlyPropagator implements TextMapPropagator {
  constructor(private readonly inner: TextMapPropagator) {}

  inject(context: Context, carrier: unknown, setter: TextMapSetter): void {
    const sc = trace.getSpanContext(context);
    if (!sc || (sc.traceFlags & TraceFlags.SAMPLED) === 0) return;
    this.inner.inject(context, carrier, setter);
  }

  extract(context: Context, carrier: unknown, getter: TextMapGetter): Context {
    return this.inner.extract(context, carrier, getter);
  }

  fields(): string[] {
    return this.inner.fields();
  }
}
