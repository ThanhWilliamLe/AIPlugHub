import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorBoundary } from '../components/shared/ErrorBoundary';

// A component that always throws during render
function BrokenComponent({ shouldThrow }: { shouldThrow: boolean }): React.ReactElement {
  if (shouldThrow) {
    throw new Error('Test render error');
  }
  return <div>Everything is fine</div>;
}

// Suppress console.error from React during error boundary tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ErrorBoundary', () => {
  it('renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('catches a render error and shows fallback UI', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('displays the error message in the fallback UI', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Test render error')).toBeInTheDocument();
  });

  it('renders "Try again" button in the fallback UI', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('"Try again" button resets the error state and re-renders children', () => {
    // We use a stateful wrapper to control shouldThrow after reset
    let throwError = true;
    function ControlledBroken() {
      if (throwError) throw new Error('Controlled error');
      return <div>Recovered content</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <ControlledBroken />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Stop throwing before clicking Try again
    throwError = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // After reset, children should be re-rendered
    rerender(
      <ErrorBoundary>
        <ControlledBroken />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Recovered content')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('shows fallback message when error message is null/undefined', () => {
    // getDerivedStateFromError receives the thrown error — if error.message is
    // undefined the ?? fallback kicks in. We simulate this by overriding message.
    function NoMessageError() {
      const err = new Error('original');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err as any).message = undefined;
      throw err;
    }

    render(
      <ErrorBoundary>
        <NoMessageError />
      </ErrorBoundary>,
    );
    expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument();
  });

  it('does not show error UI when children render without errors', () => {
    render(
      <ErrorBoundary>
        <span>Normal child</span>
      </ErrorBoundary>,
    );
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
