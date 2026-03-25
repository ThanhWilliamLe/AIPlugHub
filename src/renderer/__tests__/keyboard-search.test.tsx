/**
 * Tests for Ctrl+F search focus alias and Esc-to-clear behavior.
 * Source: 5A-specs/keyboard-browse-multiselect-spec.md §1
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppShell } from '../components/layout/AppShell';
import { useUiStore } from '@renderer/stores/ui-store';

beforeEach(() => {
  useUiStore.setState({
    activeTab: 'browse',
    showSettings: false,
  });
});

describe('Ctrl+F search focus', () => {
  it('dispatches plughub:focus-search on Ctrl+F', () => {
    const listener = vi.fn();
    document.addEventListener('plughub:focus-search', listener);

    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );

    fireEvent.keyDown(document, { key: 'f', ctrlKey: true });
    expect(listener).toHaveBeenCalledTimes(1);

    document.removeEventListener('plughub:focus-search', listener);
  });

  it('dispatches plughub:focus-search on Ctrl+K (existing behavior)', () => {
    const listener = vi.fn();
    document.addEventListener('plughub:focus-search', listener);

    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(listener).toHaveBeenCalledTimes(1);

    document.removeEventListener('plughub:focus-search', listener);
  });

  it('allows Ctrl+F from within input elements', () => {
    const listener = vi.fn();
    document.addEventListener('plughub:focus-search', listener);

    render(
      <AppShell>
        <input type="text" data-testid="inner-input" />
      </AppShell>,
    );

    const input = screen.getByTestId('inner-input');
    fireEvent.keyDown(input, { key: 'f', ctrlKey: true });
    expect(listener).toHaveBeenCalledTimes(1);

    document.removeEventListener('plughub:focus-search', listener);
  });
});
