import { addError } from '@fusescope/browser';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../src/index';

vi.mock('@fusescope/browser', () => ({ addError: vi.fn() }));

const failure = new Error('render failed');
function Broken(): ReactNode {
  throw failure;
}
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders healthy children without reporting errors', async () => {
    await act(() =>
      root.render(
        <ErrorBoundary fallback={<p>Failed</p>}>
          <p>Healthy</p>
        </ErrorBoundary>,
      ),
    );
    expect(container.textContent).toBe('Healthy');
    expect(addError).not.toHaveBeenCalled();
  });
  it('recovers when the application changes its key', async () => {
    await act(() =>
      root.render(
        <ErrorBoundary key="broken" fallback={<p>Failed</p>}>
          <Broken />
        </ErrorBoundary>,
      ),
    );
    expect(container.textContent).toBe('Failed');
    await act(() =>
      root.render(
        <ErrorBoundary key="healthy" fallback={<p>Failed</p>}>
          <p>Recovered</p>
        </ErrorBoundary>,
      ),
    );
    expect(container.textContent).toBe('Recovered');
    expect(addError).toHaveBeenCalledTimes(1);
  });

  it('recovers on navigation when a reset key changes without remounting the boundary', async () => {
    await act(() =>
      root.render(
        <ErrorBoundary resetKeys={['/broken']} fallback={<p>Failed</p>}>
          <Broken />
        </ErrorBoundary>,
      ),
    );
    expect(container.textContent).toBe('Failed');
    await act(() =>
      root.render(
        <ErrorBoundary resetKeys={['/healthy']} fallback={<p>Recovered fallback</p>}>
          <p>Healthy route</p>
        </ErrorBoundary>,
      ),
    );
    expect(container.textContent).toBe('Healthy route');
    expect(addError).toHaveBeenCalledTimes(1);
  });

  it('does not reset when a new resetKeys array has equal values', async () => {
    await act(() =>
      root.render(
        <ErrorBoundary resetKeys={['/broken', 1]} fallback={<p>Failed</p>}>
          <Broken />
        </ErrorBoundary>,
      ),
    );
    await act(() =>
      root.render(
        <ErrorBoundary resetKeys={['/broken', 1]} fallback={<p>Failed</p>}>
          <p>Healthy</p>
        </ErrorBoundary>,
      ),
    );
    expect(container.textContent).toBe('Failed');
    expect(addError).toHaveBeenCalledTimes(1);
  });

  it('exposes the error and recovers when the fallback calls reset()', async () => {
    let broken = true;
    function Retryable(): ReactNode {
      if (broken) throw failure;
      return <p>Recovered</p>;
    }
    await act(() =>
      root.render(
        <ErrorBoundary
          fallback={({ error, reset }) => (
            <button
              type="button"
              onClick={() => {
                broken = false;
                reset();
              }}
            >
              {error instanceof Error ? error.message : 'Unknown error'}
            </button>
          )}
        >
          <Retryable />
        </ErrorBoundary>,
      ),
    );
    expect(container.textContent).toBe('render failed');
    await act(() => container.querySelector('button')?.click());
    expect(container.textContent).toBe('Recovered');
    expect(addError).toHaveBeenCalledTimes(1);
  });

  it('bounds the component stack and scrubs query strings and fragments before reporting', () => {
    const boundary = new ErrorBoundary({ fallback: null });
    const frame = '\n    at Product (https://shop.example.com/app.js?token=private#secret:12:34)';
    boundary.componentDidCatch(failure, { componentStack: frame.repeat(300) });
    expect(addError).toHaveBeenCalledExactlyOnceWith(failure, {
      'fusescope.rum.react.component_stack': '\n    at Product (https://shop.example.com/app.js:12:34)'
        .repeat(300)
        .trim()
        .slice(0, 4096),
    });
  });

  it('reports a render error through addError, which supplies the manual source', async () => {
    await act(() =>
      root.render(
        <ErrorBoundary fallback={<p>Failed</p>}>
          <Broken />
        </ErrorBoundary>,
      ),
    );
    expect(container.textContent).toBe('Failed');
    expect(addError).toHaveBeenCalledExactlyOnceWith(failure, {
      'fusescope.rum.react.component_stack': expect.stringContaining('Broken'),
    });
  });
});
