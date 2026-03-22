// 7A-app/src/renderer/__tests__/BulkActionBar.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BulkActionBar } from '../components/my-setup/BulkActionBar';
import type { Component } from '@shared/types';

function makeComp(name: string, opts: Partial<Component> = {}): Component {
  return {
    id: { tool: 'claude-code', type: 'mcp-server', name, scope: 'user' },
    enabled: true,
    tracking: 'detected',
    core: { transport: 'stdio', command: name },
    ...opts,
  };
}
const comps = [makeComp('a'), makeComp('b'), makeComp('c')];

describe('BulkActionBar', () => {
  it('shows selected count', () => {
    render(
      <BulkActionBar
        selectedIds={comps.map((c) => c.id)}
        components={comps}
        filteredComponents={comps}
        onExport={vi.fn()}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onUninstall={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/3 selected/)).toBeDefined();
  });

  it('shows hidden count when filtered', () => {
    render(
      <BulkActionBar
        selectedIds={comps.map((c) => c.id)}
        components={comps}
        filteredComponents={[comps[0]]}
        onExport={vi.fn()}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onUninstall={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/2 not shown/)).toBeDefined();
  });

  it('shows Disable when all selected are enabled', () => {
    render(
      <BulkActionBar
        selectedIds={comps.map((c) => c.id)}
        components={comps}
        filteredComponents={comps}
        onExport={vi.fn()}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onUninstall={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/Disable/)).toBeDefined();
  });

  it('shows Uninstall with destructive styling', () => {
    render(
      <BulkActionBar
        selectedIds={comps.map((c) => c.id)}
        components={comps}
        filteredComponents={comps}
        onExport={vi.fn()}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onUninstall={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const btn = screen.getByText('Uninstall').closest('button');
    expect(btn?.className).toContain('destructive');
  });

  it('renders all 4 action buttons', () => {
    render(
      <BulkActionBar
        selectedIds={comps.map((c) => c.id)}
        components={comps}
        filteredComponents={comps}
        onExport={vi.fn()}
        onToggle={vi.fn()}
        onUpdate={vi.fn()}
        onUninstall={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Export')).toBeDefined();
    expect(screen.getByText(/Disable|Enable/)).toBeDefined();
    expect(screen.getByText('Update')).toBeDefined();
    expect(screen.getByText('Uninstall')).toBeDefined();
  });
});
