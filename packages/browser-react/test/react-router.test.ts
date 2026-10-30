import type { RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { reactRouterRouteTemplate } from '../src/react-router';

const routes: RouteObject[] = [
  {
    path: '/',
    children: [
      { index: true },
      { children: [{ path: 'products/:productId' }] },
      { path: 'teams/:teamId', children: [{ path: 'members/:memberId' }] },
      { path: 'settings', children: [{ path: '/settings/profile' }] },
      { path: 'docs/*' },
      { path: ':lang?/help' },
    ],
  },
];

describe('reactRouterRouteTemplate', () => {
  it.each([
    ['/', '/'],
    ['/products/red-shoe', '/products/:productId'],
    ['/products/blue-boot?token=secret#top', '/products/:productId'],
    ['/products/red-shoe/', '/products/:productId'],
    ['/teams/acme/members/alice', '/teams/:teamId/members/:memberId'],
    ['/settings/profile', '/settings/profile'],
    ['/docs/private/customer/path', '/docs/*'],
    ['/en/help', '/:lang?/help'],
    ['/help', '/:lang?/help'],
    ['/unknown/private-value', '/*'],
  ])('matches %s to %s', (path, template) => {
    expect(reactRouterRouteTemplate(routes)(path)).toBe(template);
  });
  it('uses the router basename without putting it in the route pattern', () => {
    expect(reactRouterRouteTemplate(routes, '/shop')('/shop/products/red-shoe')).toBe('/products/:productId');
  });
  it('keeps separate URLs under the same named pattern', () => {
    const template = reactRouterRouteTemplate(routes);
    expect(template('/products/red-shoe')).toBe(template('/products/blue-boot'));
  });
});
