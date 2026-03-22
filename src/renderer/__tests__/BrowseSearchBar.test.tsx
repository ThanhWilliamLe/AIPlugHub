import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowseSearchBar } from '../components/browse/BrowseSearchBar';
import { useBrowseStore } from '@renderer/stores/browse-store';

beforeEach(() => {
  useBrowseStore.setState({ searchQuery: '' });
  vi.clearAllMocks();
});

describe('BrowseSearchBar', () => {
  it('renders search input with correct placeholder', () => {
    render(<BrowseSearchBar />);
    expect(screen.getByPlaceholderText(/Search plugins.*Ctrl\+K/)).toBeInTheDocument();
  });

  it('renders with aria-label="Search plugins"', () => {
    render(<BrowseSearchBar />);
    expect(screen.getByLabelText('Search plugins')).toBeInTheDocument();
  });

  it('starts with empty value when store searchQuery is empty', () => {
    render(<BrowseSearchBar />);
    const input = screen.getByLabelText('Search plugins') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('starts with store searchQuery value when pre-populated', () => {
    useBrowseStore.setState({ searchQuery: 'sqlite' });
    render(<BrowseSearchBar />);
    const input = screen.getByLabelText('Search plugins') as HTMLInputElement;
    expect(input.value).toBe('sqlite');
  });

  it('updates local value immediately on change', () => {
    render(<BrowseSearchBar />);
    const input = screen.getByLabelText('Search plugins') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'code review' } });
    expect(input.value).toBe('code review');
  });

  it('updates store searchQuery after debounce (150ms)', () => {
    vi.useFakeTimers();
    render(<BrowseSearchBar />);
    const input = screen.getByLabelText('Search plugins');
    fireEvent.change(input, { target: { value: 'sqlite' } });

    // Not yet updated (debounce)
    expect(useBrowseStore.getState().searchQuery).toBe('');

    vi.advanceTimersByTime(150);
    expect(useBrowseStore.getState().searchQuery).toBe('sqlite');
    vi.useRealTimers();
  });

  it('does not update store before debounce timer fires', () => {
    vi.useFakeTimers();
    render(<BrowseSearchBar />);
    const input = screen.getByLabelText('Search plugins');
    fireEvent.change(input, { target: { value: 'sql' } });
    vi.advanceTimersByTime(100);
    expect(useBrowseStore.getState().searchQuery).toBe('');
    vi.useRealTimers();
  });

  it('debounces rapid keystrokes — only the final value is stored', () => {
    vi.useFakeTimers();
    render(<BrowseSearchBar />);
    const input = screen.getByLabelText('Search plugins');
    fireEvent.change(input, { target: { value: 's' } });
    fireEvent.change(input, { target: { value: 'sq' } });
    fireEvent.change(input, { target: { value: 'sql' } });
    vi.advanceTimersByTime(150);
    expect(useBrowseStore.getState().searchQuery).toBe('sql');
    vi.useRealTimers();
  });

  it('syncs local value when store searchQuery is externally reset to empty', () => {
    useBrowseStore.setState({ searchQuery: 'test' });
    const { rerender } = render(<BrowseSearchBar />);
    // External clear (e.g., from clearFilters)
    useBrowseStore.setState({ searchQuery: '' });
    rerender(<BrowseSearchBar />);
    const input = screen.getByLabelText('Search plugins') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('renders inside a <search> element', () => {
    render(<BrowseSearchBar />);
    const searchEl = document.querySelector('search');
    expect(searchEl).not.toBeNull();
  });
});
