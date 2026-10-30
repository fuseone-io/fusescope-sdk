import { matchRoutes, type RouteObject } from 'react-router';

/** Pass to browser.init({ routeTemplate }) before mounting BrowserRouter/createBrowserRouter. */
export function reactRouterRouteTemplate(routes: RouteObject[], basename = '/'): (path: string) => string {
  return (path) => {
    try {
      const matches = matchRoutes(routes, path, basename);
      // Unknown routes still get a bounded label, never an unbounded URL or user-provided slug.
      if (!matches) return '/*';
      let template = '';
      for (const { route } of matches) {
        if (!route.path) continue;
        template = route.path.startsWith('/') ? route.path : `${template.replace(/\/\*?$/, '')}/${route.path}`;
      }
      return template || '/';
    } catch {
      return '/*';
    }
  };
}
