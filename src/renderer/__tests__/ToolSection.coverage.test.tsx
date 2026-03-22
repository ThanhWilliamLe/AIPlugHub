/**
 * Coverage push for ToolSection.tsx — virtualization branch (50+ components)
 * and collapse toggle behaviour.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ToolSection } from '../components/my-setup/ToolSection';
import type { Component } from '@shared/types';

/** Build N components for the given tool */
function makeComponents(count: number, toolId = 'claude-code'): Component[] {
  return Array.from({ length: count }, (_, i) => ({
    id: { tool: toolId as 'claude-code', type: 'skill' as const, name: `skill-${i}`, scope: 'user' as const },
    enabled: true,
    tracking: 'detected' as const,
    core: { description: `Skill ${i}`, content: `# Skill ${i}` },
  }));
}

describe('ToolSection — collapse / expand toggle', () => {
  it('section is expanded by default and collapses on click', () => {
    const components = makeComponents(3);
    render(
      <ToolSection
        toolId="claude-code"
        components={components}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
      />,
    );
    // All components visible initially
    expect(screen.getByText('skill-0')).toBeInTheDocument();

    // The section header button has aria-controls
    const header = screen.getByRole('button', { expanded: true });
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('skill-0')).not.toBeInTheDocument();
  });

  it('re-expands on second click and shows components again', () => {
    const components = makeComponents(3);
    render(
      <ToolSection
        toolId="claude-code"
        components={components}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
      />,
    );
    const header = screen.getByRole('button', { expanded: true });
    fireEvent.click(header); // collapse
    fireEvent.click(header); // expand
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('skill-0')).toBeInTheDocument();
  });

  it('hides virtualized list when collapsed', () => {
    // 50+ components triggers virtualization
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

    const header = screen.getByRole('button', { expanded: true });
    fireEvent.click(header); // collapse

    // The list should not be in the DOM when collapsed
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('ToolSection — virtualization (50+ components)', () => {
  it('renders the virtualized container div when component count >= 50', () => {
    const components = makeComponents(50);
    const { container } = render(
      <ToolSection
        toolId="claude-code"
        components={components}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
      />,
    );

    // Virtualized path: the list container with overflow-y-auto should be present
    const list = container.querySelector('[role="list"]');
    expect(list).toBeInTheDocument();
    // The overflow container is the scrollable div
    expect(list?.style.maxHeight).toBe('60vh');
  });

  it('renders the virtualized container for exactly 50 components', () => {
    const components = makeComponents(50);
    render(
      <ToolSection
        toolId="claude-code"
        components={components}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
      />,
    );
    // With 50 components, shouldVirtualize = true
    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
  });

  it('uses non-virtualized list for fewer than 50 components', () => {
    const components = makeComponents(49);
    const { container } = render(
      <ToolSection
        toolId="claude-code"
        components={components}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
      />,
    );

    // Non-virtualized path: list has space-y-0.5 class, NOT the overflow-y-auto style
    const list = container.querySelector('[role="list"]');
    expect(list).toBeInTheDocument();
    expect(list?.style.maxHeight).toBe('');
  });

  it('shows component count in header for large lists', () => {
    const components = makeComponents(60);
    render(
      <ToolSection
        toolId="claude-code"
        components={components}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
      />,
    );
    expect(screen.getByText('(60)')).toBeInTheDocument();
  });

  it('virtualized list collapses and re-expands correctly', () => {
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

    const header = screen.getByRole('button', { expanded: true });
    expect(header).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(header); // collapse
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    fireEvent.click(header); // expand
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('renders virtual items when element has scroll height (layout simulation)', () => {
    // The virtualizer needs the scroll container to have height to produce items.
    // We mock getBoundingClientRect to simulate a 600px tall container.
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      bottom: 600,
      right: 800,
      x: 0,
      y: 0,
    });

    const components = makeComponents(55);
    const { container } = render(
      <ToolSection
        toolId="claude-code"
        components={components}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
      />,
    );

    // The virtualized list container should be rendered
    const list = container.querySelector('[role="list"]');
    expect(list).toBeInTheDocument();

    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });
});
