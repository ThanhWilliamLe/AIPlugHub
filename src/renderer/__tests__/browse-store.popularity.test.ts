import { describe, it, expect, beforeEach } from 'vitest';
import { useBrowseStore, useFilteredEntries } from '../stores/browse-store';
import type { MarketplaceEntry } from '@shared/types';
import { renderHook } from '@testing-library/react';

function makeEntry(name: string, starCount?: number): MarketplaceEntry {
  return { name, sourceId: 'test', ref: name, description: `${name} desc`, tools: ['claude-code'], starCount };
}

beforeEach(() => {
  useBrowseStore.setState({
    entries: [], searchQuery: '', toolFilters: [], typeFilters: [], sourceFilters: [], sortBy: 'name',
  });
});

describe('popularity sort', () => {
  it('sorts by starCount descending', () => {
    useBrowseStore.setState({ entries: [makeEntry('a', 10), makeEntry('b', 100), makeEntry('c', 50)], sortBy: 'popularity' });
    const { result } = renderHook(() => useFilteredEntries());
    expect(result.current.map(e => e.name)).toEqual(['b', 'c', 'a']);
  });

  it('entries without stars sort after entries with stars', () => {
    useBrowseStore.setState({ entries: [makeEntry('no-stars'), makeEntry('has-stars', 5)], sortBy: 'popularity' });
    const { result } = renderHook(() => useFilteredEntries());
    expect(result.current[0].name).toBe('has-stars');
  });

  it('entries without stars fall back to name sort', () => {
    useBrowseStore.setState({ entries: [makeEntry('z-plugin'), makeEntry('a-plugin')], sortBy: 'popularity' });
    const { result } = renderHook(() => useFilteredEntries());
    expect(result.current.map(e => e.name)).toEqual(['a-plugin', 'z-plugin']);
  });

  it('tiebreaker is name ascending', () => {
    useBrowseStore.setState({ entries: [makeEntry('z', 100), makeEntry('a', 100)], sortBy: 'popularity' });
    const { result } = renderHook(() => useFilteredEntries());
    expect(result.current.map(e => e.name)).toEqual(['a', 'z']);
  });
});
