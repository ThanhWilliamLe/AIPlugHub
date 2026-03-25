/**
 * Shared roving-focus hook for keyboard arrow navigation through a list.
 * Used by Browse and My Setup tabs for consistent keyboard behavior.
 * Source: 5A-specs/keyboard-browse-multiselect-spec.md §2
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export type RovingFocusActions = {
  /** Current focus index (-1 = none focused) */
  focusIndex: number;
  /** Set focus index directly */
  setFocusIndex: (index: number) => void;
  /** Keydown handler for the list container */
  handleListKeyDown: (e: React.KeyboardEvent) => void;
  /** Props to spread on each item: tabIndex and ref callback */
  getItemProps: (index: number) => {
    tabIndex: number;
    ref: (el: HTMLElement | null) => void;
    'data-focus-index': number;
  };
};

type RovingFocusOptions = {
  /** Total number of items in the list */
  itemCount: number;
  /** Called when Enter is pressed on focused item */
  onEnter?: (index: number) => void;
  /** Called when Space is pressed on focused item */
  onSpace?: (index: number) => void;
  /** Called when Escape is pressed */
  onEscape?: () => void;
  /** Dependencies that reset focusIndex to 0 when changed */
  resetDeps?: unknown[];
};

export function useRovingFocus({
  itemCount,
  onEnter,
  onSpace,
  onEscape,
  resetDeps = [],
}: RovingFocusOptions): RovingFocusActions {
  const [focusIndex, setFocusIndex] = useState(-1);
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map());

  // Reset focus when deps change (search, filters)
  useEffect(() => {
    setFocusIndex(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps);

  const scrollToIndex = useCallback((index: number) => {
    const el = itemRefs.current.get(index);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
  }, []);

  const moveFocus = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(nextIndex, itemCount - 1));
      setFocusIndex(clamped);
      scrollToIndex(clamped);
    },
    [itemCount, scrollToIndex],
  );

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (itemCount === 0) return;

      switch (e.key) {
        case 'ArrowDown':
        case 'j': {
          e.preventDefault();
          const next = focusIndex < 0 ? 0 : focusIndex + 1;
          moveFocus(next);
          break;
        }
        case 'ArrowUp':
        case 'k': {
          e.preventDefault();
          const prev = focusIndex < 0 ? 0 : focusIndex - 1;
          moveFocus(prev);
          break;
        }
        case 'Home': {
          e.preventDefault();
          moveFocus(0);
          break;
        }
        case 'End': {
          e.preventDefault();
          moveFocus(itemCount - 1);
          break;
        }
        case 'Enter': {
          if (focusIndex >= 0) {
            e.preventDefault();
            onEnter?.(focusIndex);
          }
          break;
        }
        case ' ': {
          if (focusIndex >= 0) {
            e.preventDefault();
            onSpace?.(focusIndex);
          }
          break;
        }
        case 'Escape': {
          onEscape?.();
          break;
        }
      }
    },
    [focusIndex, itemCount, moveFocus, onEnter, onSpace, onEscape],
  );

  const getItemProps = useCallback(
    (index: number) => ({
      tabIndex: index === focusIndex ? 0 : -1,
      ref: (el: HTMLElement | null) => {
        if (el) {
          itemRefs.current.set(index, el);
        } else {
          itemRefs.current.delete(index);
        }
      },
      'data-focus-index': index,
    }),
    [focusIndex],
  );

  return { focusIndex, setFocusIndex, handleListKeyDown, getItemProps };
}
