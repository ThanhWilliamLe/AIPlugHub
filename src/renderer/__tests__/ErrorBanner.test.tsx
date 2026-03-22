import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorBanner } from '../components/shared/ErrorBanner';
import { useToolStore } from '@renderer/stores/tool-store';

beforeEach(() => {
  useToolStore.setState({ error: null });
});

describe('ErrorBanner', () => {
  it('renders nothing when there is no error', () => {
    useToolStore.setState({ error: null });
    const { container } = render(<ErrorBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the error message from tool-store', () => {
    useToolStore.setState({ error: 'Something went wrong' });
    render(<ErrorBanner />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders Dismiss button when error is present', () => {
    useToolStore.setState({ error: 'Scan failed' });
    render(<ErrorBanner />);
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
  });

  it('clears the error when Dismiss button is clicked', () => {
    useToolStore.setState({ error: 'Scan failed' });
    render(<ErrorBanner />);
    fireEvent.click(screen.getByText('Dismiss'));
    expect(useToolStore.getState().error).toBeNull();
  });

  it('disappears from DOM after error is cleared', () => {
    useToolStore.setState({ error: 'Scan failed' });
    const { rerender } = render(<ErrorBanner />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    useToolStore.setState({ error: null });
    rerender(<ErrorBanner />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('displays different error messages correctly', () => {
    useToolStore.setState({ error: 'Network connection refused' });
    render(<ErrorBanner />);
    expect(screen.getByText('Network connection refused')).toBeInTheDocument();
  });
});
