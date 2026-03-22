/**
 * + Add button with dropdown: "From URL", "From file".
 * Storefront install goes through Browse tab.
 */

import { useState, useRef, useEffect } from 'react';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/utils';

type AddButtonProps = {
  onAddFromUrl: () => void;
  onAddFromFile: () => void;
};

export function AddButton({ onAddFromUrl, onAddFromFile }: AddButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        + Add
      </Button>

      {open && (
        <div
          className={cn(
            'absolute right-0 top-full mt-1 z-50',
            'bg-sand-paper border border-sand-border rounded-lg shadow-lg',
            'py-1 min-w-[160px]',
          )}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm text-sand-text hover:bg-sand-surface transition-colors"
            onClick={() => {
              setOpen(false);
              onAddFromUrl();
            }}
          >
            From URL
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm text-sand-text hover:bg-sand-surface transition-colors"
            onClick={() => {
              setOpen(false);
              onAddFromFile();
            }}
          >
            From file
          </button>
        </div>
      )}
    </div>
  );
}
