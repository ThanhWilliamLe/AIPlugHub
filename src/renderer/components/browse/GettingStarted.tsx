/**
 * Getting Started — full-page overlay on the Browse tab (UX-09).
 * Never shown automatically. Only opens when the superscript button is clicked.
 * When open, covers the entire Browse tab content with scrollable onboarding.
 * Source: 5A-specs/getting-started-spec.md §UX-09
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MarketplaceRef } from '@shared/types';
import { TypeEducation } from './TypeEducation';
import { SourcePicker } from './SourcePicker';
import { FeaturedPlugins } from './FeaturedPlugins';
import { cn } from '@renderer/lib/utils';

/** Custom event dispatched by the superscript button (UX-10) */
export const GETTING_STARTED_EXPAND_EVENT = 'plughub:expand-getting-started';

type GettingStartedProps = {
  onSelectEntry: (ref: MarketplaceRef) => void;
  onSourcesAdded: () => void;
  /** Called when expanded state changes — parent hides browse content when true */
  onExpandedChange?: (expanded: boolean) => void;
};

export function GettingStarted({
  onSelectEntry,
  onSourcesAdded,
  onExpandedChange,
}: GettingStartedProps) {
  const [expanded, setExpanded] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  // Listen for superscript button expand event (UX-10)
  useEffect(() => {
    const handler = () => {
      setExpanded(true);
      // Scroll to top
      setTimeout(() => {
        sectionRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 50);
    };
    document.addEventListener(GETTING_STARTED_EXPAND_EVENT, handler);
    return () => document.removeEventListener(GETTING_STARTED_EXPAND_EVENT, handler);
  }, []);

  const handleDismiss = useCallback(() => {
    setExpanded(false);
  }, []);

  // Notify parent of expanded state changes
  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  // Not expanded — render nothing (no foldout bar)
  if (!expanded) return null;

  // Expanded state — full overlay covering entire Browse tab content
  return (
    <div
      ref={sectionRef}
      className="flex-1 overflow-y-auto"
      role="region"
      aria-label="Getting Started"
    >
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {/* Header with dismiss button */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-sand-text flex items-center gap-2">
            {'\u2728'} Getting Started
          </h2>
          <button
            type="button"
            onClick={handleDismiss}
            className={cn(
              'text-xs text-sand-muted hover:text-sand-text transition-colors px-3 py-1.5 rounded-md',
              'border border-sand-border/50 hover:border-sand-border',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-olive/40',
            )}
          >
            Dismiss
          </button>
        </div>

        {/* Plugin explainer */}
        <p className="text-sm text-sand-secondary leading-relaxed">
          Plugins extend what your AI tools can do — from code review to database access to
          automated testing. Browse and install plugins to customize your AI workflow.
        </p>

        {/* Type education (UX-11b) */}
        <TypeEducation />

        {/* Source picker (UX-12) */}
        <SourcePicker onSourcesAdded={onSourcesAdded} />

        {/* Featured plugins (UX-13) */}
        <FeaturedPlugins onSelect={onSelectEntry} />

        {/* Bottom padding for scroll comfort */}
        <div className="pb-4" />
      </div>
    </div>
  );
}
