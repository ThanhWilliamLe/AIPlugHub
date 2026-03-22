import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ComponentCard } from '../components/my-setup/ComponentCard';
import type { Component, ComponentId } from '@shared/types';

function makeComponent(overrides: Partial<Component> = {}): Component {
  return {
    id: { tool: 'claude-code', type: 'mcp-server', name: 'test-mcp', scope: 'user' },
    enabled: true,
    ...overrides,
  };
}

describe('ComponentCard — selection mode', () => {
  it('renders checkbox when selectionMode is true', () => {
    render(
      <ComponentCard
        component={makeComponent()}
        selected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        selectionMode={true}
        checked={false}
        onCheckChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('does not render checkbox when selectionMode is false', () => {
    render(
      <ComponentCard
        component={makeComponent()}
        selected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        selectionMode={false}
        checked={false}
        onCheckChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('card click calls onCheckChange instead of onSelect in selection mode', () => {
    const onSelect = vi.fn();
    const onCheckChange = vi.fn();
    render(
      <ComponentCard
        component={makeComponent()}
        selected={false}
        onSelect={onSelect}
        onToggle={vi.fn()}
        selectionMode={true}
        checked={false}
        onCheckChange={onCheckChange}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onCheckChange).toHaveBeenCalledWith(makeComponent().id);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('toggle switch still works independently in selection mode', () => {
    const onToggle = vi.fn();
    const onCheckChange = vi.fn();
    render(
      <ComponentCard
        component={makeComponent()}
        selected={false}
        onSelect={vi.fn()}
        onToggle={onToggle}
        selectionMode={true}
        checked={false}
        onCheckChange={onCheckChange}
      />,
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith(makeComponent().id);
    expect(onCheckChange).not.toHaveBeenCalled();
  });

  it('applies checked highlight background when checked is true', () => {
    const { container } = render(
      <ComponentCard
        component={makeComponent()}
        selected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        selectionMode={true}
        checked={true}
        onCheckChange={vi.fn()}
      />,
    );
    const card = container.querySelector('[role="button"]');
    expect(card?.className).toContain('bg-[#4A7FB5]/10');
  });
});
