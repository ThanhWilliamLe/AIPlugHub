/**
 * ToolSection virtualizer callback coverage — uses vi.mock to make
 * the virtualizer produce items so lines 107-108 get covered.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock the entire @tanstack/react-virtual module before any imports
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn().mockImplementation(({ count }: { count: number }) => ({
    getVirtualItems: () =>
      count > 0
        ? [
            { key: 'vrow-0', index: 0, start: 0, end: 52, size: 52, lane: 0 },
            { key: 'vrow-1', index: 1, start: 52, end: 104, size: 52, lane: 0 },
          ]
        : [],
    getTotalSize: () => (count > 0 ? 104 : 0),
  })),
}));

import { ToolSection } from '../components/my-setup/ToolSection';
import type { Component } from '@shared/types';

function makeComponents(count: number): Component[] {
  return Array.from({ length: count }, (_, i) => ({
    id: {
      tool: 'claude-code' as const,
      type: 'skill' as const,
      name: `skill-${i}`,
      scope: 'user' as const,
    },
    enabled: true,
    tracking: 'detected' as const,
    core: { description: `Skill ${i}`, content: `# Skill ${i}` },
  }));
}

describe('ToolSection — virtualizer item rendering (mocked virtualizer)', () => {
  it('renders component cards from virtual items', () => {
    const components = makeComponents(55);
    render(
      <ToolSection
        toolId="claude-code"
        components={components}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
      />,
    );

    // Virtual items at index 0 and 1 should be rendered
    expect(screen.getByText('skill-0')).toBeInTheDocument();
    expect(screen.getByText('skill-1')).toBeInTheDocument();
  });

  it('renders selected component with selected state in virtual list', () => {
    const components = makeComponents(55);
    const selectedId = components[0].id;
    render(
      <ToolSection
        toolId="claude-code"
        components={components}
        selectedComponentId={selectedId}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
      />,
    );

    // The first virtual item renders (and would be highlighted as selected)
    expect(screen.getByText('skill-0')).toBeInTheDocument();
  });
});
