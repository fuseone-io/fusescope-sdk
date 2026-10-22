import { context, ROOT_CONTEXT, type TextMapPropagator, TraceFlags, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { SamplingDecision } from '@opentelemetry/sdk-trace';
import { describe, expect, it } from 'vitest';
import { isSampled, SampledOnlyPropagator, SessionSampler } from '../src/sampling';

describe('isSampled', () => {
  it('is deterministic per session id', () => {
    expect(isSampled('00000000'.padEnd(32, 'a'), 0.1)).toBe(true);
    expect(isSampled('ffffffff'.padEnd(32, 'a'), 0.1)).toBe(false);
    expect(isSampled('ffffffff'.padEnd(32, 'a'), 1)).toBe(true);
    expect(isSampled('00000000'.padEnd(32, 'a'), 0)).toBe(false);
  });

  it('matches the configured rate', () => {
    const ids = Array.from({ length: 10_000 }, (_, i) => ((i * 2654435761) >>> 0).toString(16).padStart(8, '0'));
    const rate = ids.filter((id) => isSampled(id, 0.25)).length / ids.length;
    expect(Math.abs(rate - 0.25)).toBeLessThan(0.02);
  });
});

describe('SessionSampler', () => {
  it.each([
    [true, SamplingDecision.RECORD_AND_SAMPLED],
    [false, SamplingDecision.NOT_RECORD],
  ])('sampled=%s', (sampled, decision) => {
    const sampler = new SessionSampler({ get: () => ({ sampled }) });
    expect(sampler.shouldSample().decision).toBe(decision);
  });
});

describe('SampledOnlyPropagator', () => {
  const propagator: TextMapPropagator = new SampledOnlyPropagator(new W3CTraceContextPropagator());
  const spanContext = (traceFlags: number) => ({
    traceId: '0af7651916cd43dd8448eb211c80319c',
    spanId: 'b7ad6b7169203331',
    traceFlags,
  });
  const inject = (ctx = ROOT_CONTEXT) => {
    const carrier: Record<string, string> = {};
    propagator.inject(ctx, carrier, {
      set: (c, k, v) => {
        (c as Record<string, string>)[k] = v;
      },
    });
    return carrier;
  };

  it('injects traceparent for sampled spans', () => {
    const ctx = trace.setSpanContext(context.active(), spanContext(TraceFlags.SAMPLED));
    expect(inject(ctx).traceparent).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
  });

  it('sends nothing for unsampled spans', () => {
    const ctx = trace.setSpanContext(context.active(), spanContext(TraceFlags.NONE));
    expect(inject(ctx)).toEqual({});
  });

  it('sends nothing without a span', () => {
    expect(inject()).toEqual({});
  });
});
