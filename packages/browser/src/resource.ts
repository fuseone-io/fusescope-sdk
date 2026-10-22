import type { ResolvedConfig } from './config';
import { SDK_NAME, SDK_VERSION } from './version';

export { SDK_NAME, SDK_VERSION };

interface UADataLike {
  brands?: { brand: string; version: string }[];
  mobile?: boolean;
  platform?: string;
}

/** Resource attributes of the ADR 0003 data model. Client Hints where available; the user agent is never parsed. */
export function resourceAttributes(c: ResolvedConfig): Record<string, string | boolean | string[]> {
  const uaData = (navigator as Navigator & { userAgentData?: UADataLike }).userAgentData;
  const attrs: Record<string, string | boolean | string[]> = {
    'service.name': c.service,
    'fusescope.rum.platform': 'web',
    'fusescope.rum.application.id': c.applicationId,
    'telemetry.distro.name': SDK_NAME,
    'telemetry.distro.version': SDK_VERSION,
    'user_agent.original': navigator.userAgent,
    'browser.language': navigator.language,
  };
  if (c.version) attrs['service.version'] = c.version;
  if (c.environment) attrs['deployment.environment.name'] = c.environment;
  if (uaData?.brands) attrs['browser.brands'] = uaData.brands.map((b) => `${b.brand} ${b.version}`);
  if (uaData?.platform) attrs['browser.platform'] = uaData.platform;
  if (uaData?.mobile !== undefined) attrs['browser.mobile'] = uaData.mobile;
  return attrs;
}
