import { FetchInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/fetch';
import { NavigationTimingInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/navigation-timing';
import { UserActionInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/user-action';
import { XhrInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/xhr';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import { withActionTarget } from './actions';
import type { ResolvedConfig } from './config';
import { scrubUrl } from './scrub';

export function instrumentations(c: ResolvedConfig): Instrumentation[] {
  const enabled = c.instrumentations;
  const http = {
    propagateTraceHeaderCorsUrls: c.tracingUrls,
    ignoreUrls: [c.tracesUrl, c.logsUrl],
    sanitizeUrl: (url: string) => scrubUrl(url, c.privacy.allowedQueryParams),
  };
  const list: Instrumentation[] = [];
  if (enabled.documentLoad) list.push(new NavigationTimingInstrumentation());
  if (enabled.fetch) list.push(new FetchInstrumentation(http));
  if (enabled.xhr) list.push(new XhrInstrumentation(http));
  if (enabled.userActions) list.push(new UserActionInstrumentation({ applyCustomLogRecordData: withActionTarget }));
  return list;
}
