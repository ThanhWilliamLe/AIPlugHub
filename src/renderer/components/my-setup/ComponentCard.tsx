/**
 * Individual component card in the My Setup list.
 * Shows type icon, name, type label, scope, version, and toggle.
 */

import React from 'react';
import type { Component, ComponentId } from '@shared/types';
import { COMPONENT_TYPE_META } from '@shared/constants';
import { TypeBadge } from '@renderer/components/shared/TypeBadge';
import { cn } from '@renderer/lib/utils';

type ComponentCardProps = {
  component: Component;
  selected: boolean;
  onSelect: (id: ComponentId) => void;
  onToggle: (id: ComponentId) => void;
  selectionMode?: boolean;
  checked?: boolean;
  onCheckChange?: (id: ComponentId) => void;
};

export const ComponentCard = React.memo(function ComponentCard({
  component,
  selected,
  onSelect,
  onToggle,
  selectionMode = false,
  checked = false,
  onCheckChange,
}: ComponentCardProps) {
  const { id, enabled, displayName, version } = component;
  const canToggle = enabled !== undefined;
  const meta = COMPONENT_TYPE_META[id.type];

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'flex items-center gap-3 w-full px-4 py-2.5 text-left rounded-lg transition-colors cursor-pointer',
        'hover:bg-sand-surface/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-olive/40',
        selected && 'bg-sand-surface ring-1 ring-sand-border',
        canToggle && enabled === false && 'opacity-50',
        selectionMode && checked && 'bg-[#4A7FB5]/10 ring-1 ring-[#4A7FB5]/20',
      )}
      onClick={() => (selectionMode && onCheckChange ? onCheckChange(id) : onSelect(id))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectionMode && onCheckChange ? onCheckChange(id) : onSelect(id);
        }
      }}
      aria-current={selected ? 'true' : undefined}
    >
      {selectionMode && (
        <input
          type="checkbox"
          checked={checked}
          aria-label={`Select ${displayName ?? id.name}`}
          className="w-3.5 h-3.5 shrink-0 accent-[#4A7FB5] cursor-pointer"
          onChange={() => onCheckChange?.(id)}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Type color indicator */}
      <span
        className="w-1 h-8 rounded-full shrink-0"
        style={{ backgroundColor: meta.color }}
        aria-hidden="true"
      />

      {/* Name + type */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-sand-text truncate">
            {displayName ?? id.name}
          </span>
          {version && <span className="text-xs text-sand-muted shrink-0">v{version}</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <TypeBadge type={id.type} />
          <span className="text-xs text-sand-muted" title={`Scope: ${id.scope}`}>
            {id.scope === 'user'
              ? 'Available everywhere'
              : id.scope === 'project'
                ? 'This project only'
                : id.scope === 'plugin'
                  ? 'From plugin'
                  : id.scope}
          </span>
        </div>
      </div>

      {/* Toggle */}
      {canToggle && (
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${enabled ? 'Disable' : 'Enable'} ${displayName ?? id.name}`}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-olive/40',
            enabled ? 'bg-accent-olive' : 'bg-sand-muted/40',
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(id);
          }}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
              'translate-y-0.5',
              enabled ? 'translate-x-[18px]' : 'translate-x-0.5',
            )}
          />
        </button>
      )}
    </div>
  );
});
