// 7A-app/src/renderer/__tests__/BulkUninstallDialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkUninstallDialog } from '../components/my-setup/BulkUninstallDialog';
import type { Component } from '@shared/types';

function makeComp(name: string, tool = 'claude-code' as const): Component {
  return { id: { tool, type: 'mcp-server', name, scope: 'user' }, enabled: true } as Component;
}

describe('BulkUninstallDialog', () => {
  it('shows count in title', () => {
    render(
      <BulkUninstallDialog
        componentIds={[makeComp('a').id, makeComp('b').id]}
        components={[makeComp('a'), makeComp('b')]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/Uninstall 2 plugins/)).toBeDefined();
  });

  it('groups by tool', () => {
    const comps = [makeComp('a', 'claude-code'), makeComp('b', 'claude-desktop')];
    render(
      <BulkUninstallDialog
        componentIds={comps.map((c) => c.id)}
        components={comps}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/Claude Code/)).toBeDefined();
    expect(screen.getByText(/Claude Desktop/)).toBeDefined();
  });

  it('calls onCancel when Cancel clicked', () => {
    const onCancel = vi.fn();
    render(
      <BulkUninstallDialog
        componentIds={[makeComp('a').id]}
        components={[makeComp('a')]}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onConfirm with ids when confirm clicked', () => {
    const onConfirm = vi.fn();
    const ids = [makeComp('a').id];
    render(
      <BulkUninstallDialog
        componentIds={ids}
        components={[makeComp('a')]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Uninstall 1/ }));
    expect(onConfirm).toHaveBeenCalledWith(ids);
  });

  it('closes on Escape', () => {
    const onCancel = vi.fn();
    render(
      <BulkUninstallDialog
        componentIds={[makeComp('a').id]}
        components={[makeComp('a')]}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
