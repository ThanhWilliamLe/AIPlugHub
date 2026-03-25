/**
 * Tests for browse-store multi-select functionality.
 * Source: 5A-specs/keyboard-browse-multiselect-spec.md §3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  useBrowseStore,
  marketplaceRefEquals,
  marketplaceRefKey,
} from '../stores/browse-store';
import type { MarketplaceRef } from '@shared/types';

function makeRef(ref = 'plugin-alpha', sourceId = 'test-source'): MarketplaceRef {
  return { sourceId, ref };
}

beforeEach(() => {
  useBrowseStore.setState({
    browseSelectionMode: false,
    browseSelectedRefs: [],
  });
});

describe('marketplaceRefEquals', () => {
  it('returns true for matching refs', () => {
    expect(marketplaceRefEquals(makeRef(), makeRef())).toBe(true);
  });

  it('returns false when sourceId differs', () => {
    expect(marketplaceRefEquals(makeRef('a', 'src1'), makeRef('a', 'src2'))).toBe(false);
  });

  it('returns false when ref differs', () => {
    expect(marketplaceRefEquals(makeRef('a'), makeRef('b'))).toBe(false);
  });
});

describe('marketplaceRefKey', () => {
  it('produces sourceId:ref string', () => {
    expect(marketplaceRefKey(makeRef('alpha', 'src'))).toBe('src:alpha');
  });
});

describe('enterBrowseSelectionMode', () => {
  it('sets browseSelectionMode to true', () => {
    useBrowseStore.getState().enterBrowseSelectionMode();
    expect(useBrowseStore.getState().browseSelectionMode).toBe(true);
  });
});

describe('exitBrowseSelectionMode', () => {
  it('clears selection mode and selected refs', () => {
    useBrowseStore.setState({
      browseSelectionMode: true,
      browseSelectedRefs: [makeRef()],
    });
    useBrowseStore.getState().exitBrowseSelectionMode();
    const state = useBrowseStore.getState();
    expect(state.browseSelectionMode).toBe(false);
    expect(state.browseSelectedRefs).toHaveLength(0);
  });
});

describe('toggleBrowseSelectRef', () => {
  it('adds a ref and enters selection mode', () => {
    const ref = makeRef();
    useBrowseStore.getState().toggleBrowseSelectRef(ref);
    const state = useBrowseStore.getState();
    expect(state.browseSelectionMode).toBe(true);
    expect(state.browseSelectedRefs).toHaveLength(1);
    expect(marketplaceRefEquals(state.browseSelectedRefs[0], ref)).toBe(true);
  });

  it('removes a ref when toggled again', () => {
    const ref = makeRef();
    useBrowseStore.getState().toggleBrowseSelectRef(ref);
    useBrowseStore.getState().toggleBrowseSelectRef(ref);
    expect(useBrowseStore.getState().browseSelectedRefs).toHaveLength(0);
  });

  it('handles multiple refs independently', () => {
    const ref1 = makeRef('a');
    const ref2 = makeRef('b');
    useBrowseStore.getState().toggleBrowseSelectRef(ref1);
    useBrowseStore.getState().toggleBrowseSelectRef(ref2);
    expect(useBrowseStore.getState().browseSelectedRefs).toHaveLength(2);

    // Remove first, second remains
    useBrowseStore.getState().toggleBrowseSelectRef(ref1);
    const state = useBrowseStore.getState();
    expect(state.browseSelectedRefs).toHaveLength(1);
    expect(marketplaceRefEquals(state.browseSelectedRefs[0], ref2)).toBe(true);
  });
});

describe('setBrowseSelectedRefs', () => {
  it('replaces the full array', () => {
    const refs = [makeRef('a'), makeRef('b'), makeRef('c')];
    useBrowseStore.getState().setBrowseSelectedRefs(refs);
    expect(useBrowseStore.getState().browseSelectedRefs).toHaveLength(3);
  });
});

describe('clearBrowseSelection', () => {
  it('clears refs but preserves selection mode', () => {
    useBrowseStore.setState({
      browseSelectionMode: true,
      browseSelectedRefs: [makeRef()],
    });
    useBrowseStore.getState().clearBrowseSelection();
    const state = useBrowseStore.getState();
    expect(state.browseSelectionMode).toBe(true);
    expect(state.browseSelectedRefs).toHaveLength(0);
  });
});
