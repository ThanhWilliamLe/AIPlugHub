/**
 * Search input for the Browse tab — debounced fuzzy search via fuse.js.
 * Source: 5A-specs/browse-tab-spec.md §4
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useBrowseStore } from '@renderer/stores/browse-store';

export function BrowseSearchBar() {
  const searchQuery = useBrowseStore((s) => s.searchQuery);
  const setSearchQuery = useBrowseStore((s) => s.setSearchQuery);
  const [localValue, setLocalValue] = useState(searchQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external resets (e.g., clearFilters) back to input
  useEffect(() => {
    setLocalValue(searchQuery);
  }, [searchQuery]);

  // Listen for Ctrl+K focus event
  useEffect(() => {
    const handler = () => inputRef.current?.focus();
    document.addEventListener('plughub:focus-search', handler);
    return () => document.removeEventListener('plughub:focus-search', handler);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setLocalValue(value);
      // Debounce 150ms per spec
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSearchQuery(value), 150);
    },
    [setSearchQuery],
  );

  return (
    <search className="relative flex-1">
      <span
        className="absolute left-3 top-1/2 -translate-y-1/2 text-sand-muted text-sm"
        aria-hidden="true"
      >
        {'\u{1F50D}'}
      </span>
      <input
        ref={inputRef}
        type="search"
        placeholder="Search plugins...  (Ctrl+K)"
        value={localValue}
        onChange={handleChange}
        className="w-full pl-9 pr-3 py-2 rounded-lg bg-sand-surface/50 border border-sand-border
                   text-sm text-sand-text placeholder:text-sand-muted
                   focus:outline-none focus:ring-2 focus:ring-accent-olive/40 focus:bg-sand-surface
                   transition-colors"
        aria-label="Search plugins"
      />
    </search>
  );
}
