import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolSection } from '../components/my-setup/ToolSection';
import type { Component } from '@shared/types';

function makeComp(name: string, tool = 'claude-code' as const): Component {
  return {
    id: { tool, type: 'mcp-server', name, scope: 'user' },
    enabled: true,
    tracking: 'detected',
    core: { transport: 'stdio' as const, command: name },
  };
}

describe('ToolSection in selection mode', () => {
  it('renders tool-level checkbox when selectionMode is true', () => {
    render(
      <ToolSection
        toolId="claude-code"
        components={[makeComp('a'), makeComp('b')]}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
        selectionMode={true}
        selectedIds={[]}
        onCheckChange={vi.fn()}
        onCheckGroup={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThanOrEqual(1);
  });

  it('does not render checkbox when selectionMode is false', () => {
    render(
      <ToolSection
        toolId="claude-code"
        components={[makeComp('a')]}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
      />,
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('tool checkbox is checked when all children selected', () => {
    const comps = [makeComp('a'), makeComp('b')];
    render(
      <ToolSection
        toolId="claude-code"
        components={comps}
        selectedComponentId={null}
        onSelectComponent={vi.fn()}
        onToggleComponent={vi.fn()}
        selectionMode={true}
        selectedIds={comps.map((c) => c.id)}
        onCheckChange={vi.fn()}
        onCheckGroup={vi.fn()}
      />,
    );
    // The tool-level checkbox (first one) should be checked
    const checkboxes = screen.getAllByRole('checkbox');
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
  });
});
