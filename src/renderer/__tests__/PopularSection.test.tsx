import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PopularSection } from '../components/browse/PopularSection';
import type { MarketplaceEntry } from '@shared/types';

function makeEntry(name: string, starCount?: number, keywords?: string[]): MarketplaceEntry {
  return { name, sourceId: 'test', ref: name, description: `${name} desc`, tools: ['claude-code'], starCount, keywords };
}

describe('PopularSection', () => {
  it('renders top entries sorted by star count when enough have stars', () => {
    const entries = [makeEntry('low', 10), makeEntry('high', 1000), makeEntry('mid', 100)];
    render(<PopularSection entries={entries} onSelect={vi.fn()} />);
    expect(screen.getByText('★ Popular')).toBeTruthy();
    const cards = screen.getAllByRole('button');
    expect(cards[0].textContent).toContain('high');
  });

  it('falls back to Featured when fewer than 3 entries have stars', () => {
    const entries = [makeEntry('a'), makeEntry('b')];
    const { container } = render(<PopularSection entries={entries} onSelect={vi.fn()} />);
    expect(container.innerHTML).toContain('★ Featured');
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('renders nothing when no entries at all', () => {
    const { container } = render(<PopularSection entries={[]} onSelect={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('Featured mode sorts by keyword richness then alphabetical', () => {
    const entries = [
      makeEntry('z-poor'),
      makeEntry('a-rich', undefined, ['foo', 'bar', 'baz']),
      makeEntry('m-mid', undefined, ['one']),
    ];
    render(<PopularSection entries={entries} onSelect={vi.fn()} />);
    const cards = screen.getAllByRole('button');
    expect(cards[0].textContent).toContain('a-rich');
    expect(cards[1].textContent).toContain('m-mid');
    expect(cards[2].textContent).toContain('z-poor');
  });

  it('limits to 10 entries', () => {
    const entries = Array.from({ length: 20 }, (_, i) => makeEntry(`p-${i}`, 100 - i));
    render(<PopularSection entries={entries} onSelect={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(10);
  });

  it('calls onSelect when a card is clicked', () => {
    const onSelect = vi.fn();
    const entries = [makeEntry('plugin', 50), makeEntry('a', 30), makeEntry('b', 20)];
    render(<PopularSection entries={entries} onSelect={onSelect} />);
    screen.getAllByRole('button')[0].click();
    expect(onSelect).toHaveBeenCalledWith({ sourceId: 'test', ref: 'plugin' });
  });

  it('does not show star badge in Featured mode for entries without stars', () => {
    const entries = [makeEntry('no-stars')];
    render(<PopularSection entries={entries} onSelect={vi.fn()} />);
    expect(screen.queryByText(/★ \d/)).toBeNull();
  });
});
