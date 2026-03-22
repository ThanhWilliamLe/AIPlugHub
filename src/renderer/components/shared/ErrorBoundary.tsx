/**
 * React error boundary — catches render errors, shows recovery UI.
 */

import React from 'react';
import { Button } from '@renderer/components/ui/button';

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-sand-paper px-8 text-center">
          <p className="text-2xl mb-4">Something went wrong</p>
          <p className="text-sm text-sand-secondary mb-6 max-w-md">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <Button
            variant="outline"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
