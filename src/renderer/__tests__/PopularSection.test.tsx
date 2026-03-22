import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PopularSection } from '../components/browse/PopularSection';
import type { MarketplaceEntry } from '@shared/types';

function makeEntry(name: string, starCount?: number): MarketplaceEntry {
  return { name, sourceId: 'test', ref: name, description: `${name} desc`, tools: ['claude-code'], starCount };
}

describe('PopularSection', () => {
  it('renders top entries sorted by star count', () => {
    const entries = [makeEntry('low', 10), makeEntry('high', 1000), makeEntry('mid', 100)];
    render(<PopularSection entries={entries} onSelect={vi.fn()} />);
    const cards = screen.getAllByRole('button');
    expect(cards[0].textContent).toContain('high');
  });

  it('renders nothing when no entries have stars', () => {
    const entries = [makeEntry('a'), makeEntry('b')];
    const { container } = render(<PopularSection entries={entries} onSelect={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('limits to 10 entries', () => {
    const entries = Array.from({ length: 20 }, (_, i) => makeEntry(`p-${i}`, 100 - i));
    render(<PopularSection entries={entries} onSelect={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(10);
  });

  it('calls onSelect when a card is clicked', () => {
    const onSelect = vi.fn();
    const entries = [makeEntry('plugin', 50)];
    render(<PopularSection entries={entries} onSelect={onSelect} />);
    screen.getByRole('button').click();
    expect(onSelect).toHaveBeenCalledWith({ sourceId: 'test', ref: 'plugin' });
  });
});
