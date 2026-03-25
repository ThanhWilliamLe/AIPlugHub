/**
 * Search input for filtering components by name.
 * Uses local state for responsive typing + debounced store update.
 */

import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { useUiStore } from '@renderer/stores/ui-store';

const DEBOUNCE_MS = 200;

export function SearchBar() {
  const storeQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const [localQuery, setLocalQuery] = useState(storeQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync local state when store changes externally (e.g., clearFilters)
  useEffect(() => {
    setLocalQuery(storeQuery);
  }, [storeQuery]);

  // Listen for Ctrl+K focus event
  useEffect(() => {
    const handler = () => inputRef.current?.focus();
    document.addEventListener('plughub:focus-search', handler);
    return () => document.removeEventListener('plughub:focus-search', handler);
  }, []);

  const handleChange = (value: string) => {
    setLocalQuery(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSearchQuery(value), DEBOUNCE_MS);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (localQuery) {
        setLocalQuery('');
        setSearchQuery('');
      } else {
        inputRef.current?.blur();
      }
    }
  };

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <search className="relative">
      <span
        className="absolute left-3 top-1/2 -translate-y-1/2 text-sand-muted text-sm"
        aria-hidden="true"
      >
        {'\u{1F50D}'}
      </span>
      <input
        ref={inputRef}
        type="search"
        placeholder="Search plugins...  (Ctrl+K / Ctrl+F)"
        value={localQuery}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full pl-9 pr-3 py-2 rounded-lg bg-sand-surface/50 border border-sand-border
                   text-sm text-sand-text placeholder:text-sand-muted
                   focus:outline-none focus:ring-2 focus:ring-accent-olive/40 focus:bg-sand-surface
                   transition-colors"
        aria-label="Search plugins"
      />
    </search>
  );
}
