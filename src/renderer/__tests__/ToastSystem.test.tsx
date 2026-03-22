import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useToastStore } from '@renderer/stores/toast-store';
import { ToastContainer } from '@renderer/components/shared/ToastContainer';

describe('toast-store', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('addToast adds a toast and returns an id', () => {
    const id = useToastStore.getState().addToast({ message: 'Test', type: 'info' });
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].message).toBe('Test');
    expect(useToastStore.getState().toasts[0].type).toBe('info');
    expect(useToastStore.getState().toasts[0].id).toBe(id);
  });

  it('addToast caps at 5 toasts', () => {
    const { addToast } = useToastStore.getState();
    for (let i = 0; i < 6; i++) {
      addToast({ message: `Toast ${i}`, type: 'info', duration: 0 });
    }
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(5);
    // The first toast should have been evicted; the last 5 remain
    expect(toasts[0].message).toBe('Toast 1');
    expect(toasts[4].message).toBe('Toast 5');
  });

  it('removeToast removes the correct toast', () => {
    const { addToast } = useToastStore.getState();
    const id1 = addToast({ message: 'First', type: 'info', duration: 0 });
    const id2 = addToast({ message: 'Second', type: 'success', duration: 0 });
    const id3 = addToast({ message: 'Third', type: 'error', duration: 0 });

    useToastStore.getState().removeToast(id2);

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(2);
    expect(toasts.map((t) => t.id)).toEqual([id1, id3]);
  });

  it('clearAll removes all toasts', () => {
    const { addToast } = useToastStore.getState();
    addToast({ message: 'A', type: 'info', duration: 0 });
    addToast({ message: 'B', type: 'success', duration: 0 });
    addToast({ message: 'C', type: 'error', duration: 0 });
    expect(useToastStore.getState().toasts).toHaveLength(3);

    useToastStore.getState().clearAll();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});

describe('ToastContainer', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('renders nothing when no toasts', () => {
    const { container } = render(<ToastContainer />);
    expect(container.innerHTML).toBe('');
  });

  it('renders toast message', () => {
    useToastStore.getState().addToast({ message: 'Hello world', type: 'info', duration: 0 });
    render(<ToastContainer />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders undo button when undoAction provided', () => {
    useToastStore.getState().addToast({
      message: 'Deleted item',
      type: 'success',
      undoAction: vi.fn(),
      duration: 0,
    });
    render(<ToastContainer />);
    expect(screen.getByText('Undo')).toBeInTheDocument();
  });

  it('clicking undo calls undoAction and removes toast', () => {
    const undoFn = vi.fn();
    useToastStore.getState().addToast({
      message: 'Removed',
      type: 'info',
      undoAction: undoFn,
      duration: 0,
    });
    render(<ToastContainer />);

    fireEvent.click(screen.getByText('Undo'));

    expect(undoFn).toHaveBeenCalledOnce();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('clicking dismiss removes toast', () => {
    useToastStore.getState().addToast({ message: 'Bye', type: 'info', duration: 0 });
    render(<ToastContainer />);

    fireEvent.click(screen.getByLabelText('Dismiss'));

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('renders correct type styling', () => {
    useToastStore.setState({
      toasts: [
        { id: 'ts', message: 'Success msg', type: 'success' },
        { id: 'te', message: 'Error msg', type: 'error' },
        { id: 'ti', message: 'Info msg', type: 'info' },
      ],
    });
    render(<ToastContainer />);

    const successEl = screen.getByText('Success msg').closest('[role="status"]')!;
    const errorEl = screen.getByText('Error msg').closest('[role="status"]')!;
    const infoEl = screen.getByText('Info msg').closest('[role="status"]')!;

    expect(successEl.className).toContain('border-accent-olive/30');
    expect(errorEl.className).toContain('border-accent-destructive/30');
    expect(infoEl.className).toContain('border-sand-border');
  });
});
