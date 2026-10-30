import { addError } from '@fusescope/browser';
import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/** Reports render/lifecycle errors as manual RUM errors and renders the supplied fallback. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    addError(error, { 'fusescope.rum.react.component_stack': info.componentStack ?? '' });
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
