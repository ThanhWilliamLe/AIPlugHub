/**
 * Lightweight keyboard navigation for lists with nested DOM structures.
 * Uses DOM queries to find focusable items (role="button") rather than
 * requiring prop threading through deeply nested components.
 *
 * For flat lists (Browse), prefer useRovingFocus which offers tighter control.
 * For grouped/nested lists (My Setup), use this hook.
 *
 * Source: 5A-specs/keyboard-browse-multiselect-spec.md §2b
 */

import { useCallback, useRef } from 'react';

type ListKeyboardNavOptions = {
  /** Selector for focusable items within the container */
  itemSelector?: string;
  /** Called when Enter is pressed on a focused item */
  onActivate?: (el: HTMLElement) => void;
  /** Called when Space is pressed on a focused item */
  onSpace?: (el: HTMLElement) => void;
  /** Called when Escape is pressed */
  onEscape?: () => void;
};

export function useListKeyboardNav({
  itemSelector = '[role="button"]',
  onActivate,
  onSpace,
  onEscape,
}: ListKeyboardNavOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const getItems = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll<HTMLElement>(itemSelector));
  }, [itemSelector]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const items = getItems();
      if (items.length === 0) return;

      const activeEl = document.activeElement as HTMLElement;
      const currentIndex = items.indexOf(activeEl);

      let nextIndex: number | null = null;

      switch (e.key) {
        case 'ArrowDown':
        case 'j': {
          e.preventDefault();
          nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, items.length - 1);
          break;
        }
        case 'ArrowUp':
        case 'k': {
          e.preventDefault();
          nextIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0);
          break;
        }
        case 'Home': {
          e.preventDefault();
          nextIndex = 0;
          break;
        }
        case 'End': {
          e.preventDefault();
          nextIndex = items.length - 1;
          break;
        }
        case 'Enter': {
          if (currentIndex >= 0) {
            e.preventDefault();
            onActivate?.(items[currentIndex]);
          }
          break;
        }
        case ' ': {
          if (currentIndex >= 0) {
            e.preventDefault();
            onSpace?.(items[currentIndex]);
          }
          break;
        }
        case 'Escape': {
          onEscape?.();
          break;
        }
      }

      if (nextIndex !== null && nextIndex !== currentIndex) {
        items[nextIndex].focus({ preventScroll: true });
        items[nextIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    },
    [getItems, onActivate, onSpace, onEscape],
  );

  return { containerRef, handleKeyDown };
}
