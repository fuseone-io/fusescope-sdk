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
