import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ToolSection } from '../components/my-setup/ToolSection';
import type { Component } from '@shared/types';

const mockComponents: Component[] = [
  {
    id: { tool: 'claude-code', type: 'skill', name: 'tdd-guide', scope: 'user' },
    enabled: true,
    tracking: 'detected',
    displayName: 'TDD Guide',
    core: { description: 'TDD workflow', content: '# TDD' },
  },
  {
    id: { tool: 'claude-code', type: 'mcp-server', name: 'sqlite', scope: 'user' },
    enabled: undefined,
    tracking: 'detected',
    core: { transport: 'stdio' as const, command: 'sqlite-mcp' },
  },
];

describe('ToolSection', () => {
  it('renders tool name with emoji and count', () => {
    render(
      <ToolSection
        toolId="claude-code"
        components={mockComponents}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
      />,
    );
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('renders components when expanded (default)', () => {
    render(
      <ToolSection
        toolId="claude-code"
        components={mockComponents}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
      />,
    );
    expect(screen.getByText('TDD Guide')).toBeInTheDocument();
    expect(screen.getByText('sqlite')).toBeInTheDocument();
  });

  it('collapses and hides components on click', () => {
    render(
      <ToolSection
        toolId="claude-code"
        components={mockComponents}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
      />,
    );
    // Click the tool section header to collapse
    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByText('TDD Guide')).not.toBeInTheDocument();
  });

  it('re-expands on second click', () => {
    render(
      <ToolSection
        toolId="claude-code"
        components={mockComponents}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
      />,
    );
    const header = screen.getByRole('button', { expanded: true });
    fireEvent.click(header); // collapse
    fireEvent.click(header); // expand
    expect(screen.getByText('TDD Guide')).toBeInTheDocument();
  });
});
