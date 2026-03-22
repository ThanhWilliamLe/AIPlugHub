import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UninstallDialog } from '../components/my-setup/UninstallDialog';
import type { ComponentId } from '@shared/types';

const mockId: ComponentId = {
  tool: 'claude-code',
  type: 'skill',
  name: 'code-review',
  scope: 'user',
};

describe('UninstallDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog with component name', () => {
    render(
      <UninstallDialog
        componentId={mockId}
        componentName="Code Review"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Uninstall Code Review?')).toBeInTheDocument();
  });

  it('renders descriptive warning text', () => {
    render(
      <UninstallDialog
        componentId={mockId}
        componentName="Code Review"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/This will remove the component/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
  });

  it('calls onConfirm with componentId when Uninstall button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <UninstallDialog
        componentId={mockId}
        componentName="Code Review"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Uninstall'));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledWith(mockId);
  });

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <UninstallDialog
        componentId={mockId}
        componentName="Code Review"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onCancel when Escape key is pressed', () => {
    const onCancel = vi.fn();
    render(
      <UninstallDialog
        componentId={mockId}
        componentName="Code Review"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onCancel when backdrop is clicked', () => {
    const onCancel = vi.fn();
    render(
      <UninstallDialog
        componentId={mockId}
        componentName="Code Review"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    // The backdrop has aria-hidden="true" and class fixed inset-0 z-50 bg-black/20
    const backdrop = document.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('dialog has role="alertdialog"', () => {
    render(
      <UninstallDialog
        componentId={mockId}
        componentName="Code Review"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('Uninstall button is the focused element (autoFocus)', () => {
    render(
      <UninstallDialog
        componentId={mockId}
        componentName="Code Review"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // The Uninstall button has autoFocus — verify it is the active element
    const uninstallButton = screen.getByText('Uninstall').closest('button')!;
    expect(document.activeElement).toBe(uninstallButton);
  });

  it('removes keydown listener on unmount', () => {
    const onCancel = vi.fn();
    const { unmount } = render(
      <UninstallDialog
        componentId={mockId}
        componentName="Code Review"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
