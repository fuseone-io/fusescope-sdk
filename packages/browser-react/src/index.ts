import { addError } from '@fusescope/browser';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { componentStack } from './component-stack';

export interface ErrorBoundaryFallbackProps {
  error: unknown;
  reset: () => void;
}

export interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback: ReactNode | ((props: ErrorBoundaryFallbackProps) => ReactNode);
  resetKeys?: readonly unknown[];
}

type ErrorBoundaryState = { failed: false } | { failed: true; error: unknown };

const changedKeys = (previous: readonly unknown[] = [], next: readonly unknown[] = []): boolean =>
  previous.length !== next.length || previous.some((key, index) => !Object.is(key, next[index]));

/** Reports render/lifecycle errors as manual RUM errors and renders the supplied fallback. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { failed: true, error };
  }

  readonly reset = (): void => this.setState({ failed: false });

  override componentDidUpdate(previous: ErrorBoundaryProps, previousState: ErrorBoundaryState): void {
    // Don't immediately retry an error first triggered by the same change to resetKeys.
    if (this.state.failed && previousState.failed && changedKeys(previous.resetKeys, this.props.resetKeys)) {
      this.reset();
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    addError(error, { 'fusescope.rum.react.component_stack': componentStack(info.componentStack ?? '') });
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return typeof this.props.fallback === 'function'
      ? this.props.fallback({ error: this.state.error, reset: this.reset })
      : this.props.fallback;
  }
}
