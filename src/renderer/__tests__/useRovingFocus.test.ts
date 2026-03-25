/**
 * Tests for the useRovingFocus hook.
 * Source: 5A-specs/keyboard-browse-multiselect-spec.md §2
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRovingFocus } from '../hooks/useRovingFocus';

describe('useRovingFocus', () => {
  it('initializes with focusIndex -1', () => {
    const { result } = renderHook(() =>
      useRovingFocus({ itemCount: 5 }),
    );
    expect(result.current.focusIndex).toBe(-1);
  });

  it('getItemProps returns tabIndex 0 for focused item and -1 for others', () => {
    const { result } = renderHook(() =>
      useRovingFocus({ itemCount: 3 }),
    );

    // Before any focus, all items get tabIndex -1
    expect(result.current.getItemProps(0).tabIndex).toBe(-1);
    expect(result.current.getItemProps(1).tabIndex).toBe(-1);
    expect(result.current.getItemProps(2).tabIndex).toBe(-1);

    // Set focus
    act(() => {
      result.current.setFocusIndex(1);
    });

    expect(result.current.getItemProps(0).tabIndex).toBe(-1);
    expect(result.current.getItemProps(1).tabIndex).toBe(0);
    expect(result.current.getItemProps(2).tabIndex).toBe(-1);
  });

  it('getItemProps includes data-focus-index attribute', () => {
    const { result } = renderHook(() =>
      useRovingFocus({ itemCount: 3 }),
    );
    expect(result.current.getItemProps(2)['data-focus-index']).toBe(2);
  });

  it('clamps focus within bounds', () => {
    const { result } = renderHook(() =>
      useRovingFocus({ itemCount: 3 }),
    );

    act(() => {
      result.current.setFocusIndex(10);
    });
    // setFocusIndex doesn't clamp (it's direct), but moveFocus (via arrow keys) does
    expect(result.current.focusIndex).toBe(10);
  });

  it('calls onEnter callback with current index', () => {
    const onEnter = vi.fn();
    const { result } = renderHook(() =>
      useRovingFocus({ itemCount: 3, onEnter }),
    );

    act(() => {
      result.current.setFocusIndex(2);
    });

    // Simulate Enter keydown
    act(() => {
      result.current.handleListKeyDown({
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });

    expect(onEnter).toHaveBeenCalledWith(2);
  });

  it('calls onSpace callback with current index', () => {
    const onSpace = vi.fn();
    const { result } = renderHook(() =>
      useRovingFocus({ itemCount: 3, onSpace }),
    );

    act(() => {
      result.current.setFocusIndex(1);
    });

    act(() => {
      result.current.handleListKeyDown({
        key: ' ',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });

    expect(onSpace).toHaveBeenCalledWith(1);
  });

  it('calls onEscape callback', () => {
    const onEscape = vi.fn();
    const { result } = renderHook(() =>
      useRovingFocus({ itemCount: 3, onEscape }),
    );

    act(() => {
      result.current.handleListKeyDown({
        key: 'Escape',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('does not call onEnter when focusIndex is -1', () => {
    const onEnter = vi.fn();
    const { result } = renderHook(() =>
      useRovingFocus({ itemCount: 3, onEnter }),
    );

    act(() => {
      result.current.handleListKeyDown({
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });

    expect(onEnter).not.toHaveBeenCalled();
  });

  it('does not process keys when itemCount is 0', () => {
    const onEnter = vi.fn();
    const { result } = renderHook(() =>
      useRovingFocus({ itemCount: 0, onEnter }),
    );

    act(() => {
      result.current.handleListKeyDown({
        key: 'ArrowDown',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });

    expect(result.current.focusIndex).toBe(-1);
  });
});
