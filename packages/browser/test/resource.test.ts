import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config';
import { resourceAttributes, SDK_NAME, SDK_VERSION } from '../src/resource';

describe('resourceAttributes', () => {
  it('follows the ADR data model', () => {
    const attrs = resourceAttributes(
      resolveConfig({
        applicationId: 'shop-web',
        publicKey: 'rum_pub_1',
        endpoint: 'https://f.example',
        environment: 'production',
        version: '1.4.0',
      }),
    );
    expect(attrs).toMatchObject({
      'service.name': 'shop-web',
      'service.version': '1.4.0',
      'deployment.environment.name': 'production',
      'fusescope.rum.platform': 'web',
      'fusescope.rum.application.id': 'shop-web',
      'telemetry.distro.name': '@fusescope/browser',
      'telemetry.distro.version': SDK_VERSION,
      'user_agent.original': navigator.userAgent,
      'browser.language': navigator.language,
    });
    expect(SDK_NAME).toBe('@fusescope/browser');
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('omits optional attributes that are not configured', () => {
    const attrs = resourceAttributes(
      resolveConfig({ applicationId: 'a', publicKey: 'k', endpoint: 'https://f.example' }),
    );
    expect(attrs).not.toHaveProperty('service.version');
    expect(attrs).not.toHaveProperty('deployment.environment.name');
  });
});
