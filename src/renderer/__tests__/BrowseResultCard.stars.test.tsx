import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowseResultCard } from '../components/browse/BrowseResultCard';
import type { MarketplaceEntry } from '@shared/types';

function makeEntry(overrides: Partial<MarketplaceEntry> = {}): MarketplaceEntry {
  return { name: 'test-plugin', sourceId: 'test', ref: 'test-plugin', description: 'A test plugin', tools: ['claude-code'], ...overrides };
}

describe('BrowseResultCard star badge', () => {
  it('shows star count when starCount is defined', () => {
    render(<BrowseResultCard entry={makeEntry({ starCount: 1234 })} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText(/1,234/)).toBeDefined();
  });

  it('does not show star badge when starCount is undefined', () => {
    render(<BrowseResultCard entry={makeEntry()} selected={false} onSelect={vi.fn()} />);
    expect(screen.queryByText(/★/)).toBeNull();
  });

  it('shows star count of 0', () => {
    render(<BrowseResultCard entry={makeEntry({ starCount: 0 })} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText(/★/)).toBeDefined();
  });
});
