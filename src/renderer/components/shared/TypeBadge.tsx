/**
 * Component type badge — colored label with type-specific icon shape.
 * Uses Warm Jewel tones from the design system.
 */

import type { ComponentType } from '@shared/types';
import { COMPONENT_TYPE_META } from '@shared/constants';
import { cn } from '@renderer/lib/utils';

const TYPE_ICONS: Record<ComponentType, string> = {
  'mcp-server': '\u2600', // Sun/connection
  skill: '\u25A6', // Stacked layers
  command: '\u276F', // Terminal prompt >
  hook: '\u26D3', // Chain link
  agent: '\u25A1', // Document
  'context-file': '\u25A1',
  'lsp-server': '\u25A1',
  'output-style': '\u25A1',
  prompt: '\u25A1',
  unknown: '\u25A1',
};

type TypeBadgeProps = {
  type: ComponentType;
  className?: string;
};

let tooltipIdCounter = 0;

export function TypeBadge({ type, className }: TypeBadgeProps) {
  const meta = COMPONENT_TYPE_META[type];
  const icon = TYPE_ICONS[type];
  const tooltipId = `type-tooltip-${type}-${++tooltipIdCounter}`;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        'relative group cursor-help',
        className,
      )}
      style={{
        color: meta.color,
        backgroundColor: `${meta.color}14`,
      }}
      title={meta.tooltip}
      aria-describedby={tooltipId}
    >
      <span aria-hidden="true">{icon}</span>
      {meta.label}
      <span
        id={tooltipId}
        className={cn(
          'absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5',
          'hidden group-hover:block',
          'bg-sand-text text-sand-paper text-xs rounded px-2.5 py-1.5',
          'w-52 text-center leading-snug shadow-md z-50 font-normal',
          'pointer-events-none',
        )}
        role="tooltip"
      >
        {meta.tooltip}
      </span>
    </span>
  );
}
