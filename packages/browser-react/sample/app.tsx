import * as FuseScope from '@fusescope/browser';
import { ErrorBoundary } from '@fusescope/browser-react';
import { reactRouterRouteTemplate } from '@fusescope/browser-react/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, type RouteObject, useLocation, useParams, useRoutes } from 'react-router-dom';

function Product() {
  const { productId } = useParams();
  return <h1>Product: {productId}</h1>;
}

function Broken(): never {
  throw new Error('FuseScope React sample render error');
}

const routes: RouteObject[] = [
  { path: '/', element: <h1>FuseScope React sample</h1> },
  { path: '/products/:productId', element: <Product /> },
  { path: '/broken', element: <Broken /> },
  { path: '*', element: <h1>Not found</h1> },
];

const query = new URLSearchParams(location.search);
FuseScope.init({
  applicationId: query.get('applicationId') ?? 'e2e-react',
  publicKey: query.get('publicKey') ?? 'rum_pub_e2e',
  endpoint: query.get('endpoint') ?? location.origin,
  environment: 'sample',
  version: '0.1.0',
  routeTemplate: reactRouterRouteTemplate(routes),
  requireConsent: query.get('consent') === 'required',
});

function Pages() {
  return useRoutes(routes);
}

function App() {
  const location = useLocation();
  return (
    <>
      <nav aria-label="Sample routes">
        <Link to="/products/red-shoe">Red shoe</Link> <Link to="/products/blue-boot">Blue boot</Link>{' '}
        <Link to="/broken">Throw render error</Link>
      </nav>
      <ErrorBoundary key={location.pathname} fallback={<p role="alert">The example failed to render.</p>}>
        <Pages />
      </ErrorBoundary>
      <button type="button" onClick={() => void FuseScope.setConsent(true)}>
        Grant consent
      </button>{' '}
      <button type="button" onClick={() => void FuseScope.shutdown()}>
        Flush and stop RUM
      </button>
    </>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Sample root is missing');
createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
