/**
 * Expandable type education table for the Getting Started section (UX-11b).
 * Shows what each component type does and what to expect.
 * Default: expanded (foldout open).
 * Source: 5A-specs/getting-started-spec.md §UX-11
 */

import { useState } from 'react';
import { cn } from '@renderer/lib/utils';

type TypeRow = {
  type: string;
  whatItDoes: string;
  whatToExpect: string;
};

const TYPE_ROWS: TypeRow[] = [
  {
    type: 'Plugin',
    whatItDoes: 'A bundle of components that work together',
    whatToExpect:
      'A plugin groups related skills, commands, agents, and other components into one installable package. Installing a plugin adds all its components at once. You manage (enable/disable/uninstall) the entire plugin as a unit.',
  },
  {
    type: 'Skill',
    whatItDoes: 'Teaches your AI a specific capability',
    whatToExpect:
      'Adds knowledge the AI uses automatically. No commands to learn \u2014 it just gets smarter at that task. Does not use extra system resources.',
  },
  {
    type: 'Command',
    whatItDoes: 'A slash command you can type',
    whatToExpect:
      'Adds a /command you type in the AI chat. Shows up in autocomplete. Only runs when you invoke it.',
  },
  {
    type: 'Agent',
    whatItDoes: 'A specialized AI for a specific job',
    whatToExpect:
      'A separate AI personality tuned for one task (reviewing code, debugging, etc). You invoke it by name. May take longer to respond when active.',
  },
  {
    type: 'MCP Server',
    whatItDoes: 'Connects your AI to external tools and services',
    whatToExpect:
      'Lets your AI interact with databases, browsers, APIs, and more. Runs a small service in the background to handle the connection. Some may ask for login credentials during setup.',
  },
  {
    type: 'Hook',
    whatItDoes: 'Automation that runs at specific moments',
    whatToExpect:
      'Runs automatically before or after AI actions (like pre-commit checks). Works silently in the background \u2014 you only notice it when it catches something. You can disable it from My Setup.',
  },
  {
    type: 'Context File',
    whatItDoes: 'Background info the AI reads',
    whatToExpect:
      'A document the AI loads as background knowledge. Affects how it responds but isn\u2019t a "feature" you interact with. Using many may slow down responses slightly.',
  },
];

export function TypeEducation() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        type="button"
        className={cn(
          'flex items-center gap-1.5 text-sm font-medium text-sand-secondary',
          'hover:text-sand-text transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-olive/40 rounded',
        )}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="type-education-table"
      >
        <span className="text-xs">{expanded ? '\u25BC' : '\u25B6'}</span>
        What do the different types mean?
      </button>

      {expanded && (
        <div
          id="type-education-table"
          role="region"
          aria-label="Component type education"
          className="mt-2 rounded-lg border border-sand-border overflow-hidden"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-surface/50 text-left">
                <th className="px-3 py-2 font-medium text-sand-secondary">Type</th>
                <th className="px-3 py-2 font-medium text-sand-secondary">What it does</th>
                <th className="px-3 py-2 font-medium text-sand-secondary">What to expect</th>
              </tr>
            </thead>
            <tbody>
              {TYPE_ROWS.map((row) => (
                <tr
                  key={row.type}
                  className="border-t border-sand-border/50 hover:bg-sand-surface/30"
                >
                  <td className="px-3 py-2 font-medium text-sand-text whitespace-nowrap">
                    {row.type}
                  </td>
                  <td className="px-3 py-2 text-sand-secondary">{row.whatItDoes}</td>
                  <td className="px-3 py-2 text-sand-secondary">{row.whatToExpect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
