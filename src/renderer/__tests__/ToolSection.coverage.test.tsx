/**
 * Coverage push for ToolSection.tsx — collapse toggle behaviour and
 * large list rendering (virtualization disabled for single-scroll UX).
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

  it('hides list when collapsed (large component count)', () => {
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

describe('ToolSection — large component lists (single-scroll UX)', () => {
  it('renders all components inline without nested scroll container', () => {
    const components = makeComponents(100);
    const { container } = render(
      <ToolSection
        toolId="claude-code"
        components={components}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
      />,
    );

    // Non-virtualized path: list should NOT have maxHeight (no nested scroll)
    const list = container.querySelector('[role="list"]');
    expect(list).toBeInTheDocument();
    expect(list?.style.maxHeight).toBe('');
  });

  it('renders 50 components without virtualization', () => {
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
    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
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

  it('large list collapses and re-expands correctly', () => {
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
});
