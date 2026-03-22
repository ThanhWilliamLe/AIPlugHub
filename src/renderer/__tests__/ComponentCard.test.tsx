import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ComponentCard } from '../components/my-setup/ComponentCard';
import type { Component } from '@shared/types';

const mockComponent: Component = {
  id: { tool: 'claude-code', type: 'skill', name: 'code-review', scope: 'user' },
  enabled: true,
  tracking: 'detected',
  displayName: 'Code Review',
  description: 'Reviews code for quality',
  version: '1.0.0',
  core: { description: 'Reviews code', content: '# Code Review' },
};

const mockComponentNoToggle: Component = {
  ...mockComponent,
  id: { tool: 'claude-code', type: 'mcp-server', name: 'sqlite', scope: 'user' },
  enabled: undefined,
  core: { transport: 'stdio' as const, command: 'sqlite-mcp' },
};

describe('ComponentCard', () => {
  it('renders component name and type badge', () => {
    render(
      <ComponentCard
        component={mockComponent}
        selected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('Code Review')).toBeInTheDocument();
    expect(screen.getByText('Skill')).toBeInTheDocument();
  });

  it('renders version when available', () => {
    render(
      <ComponentCard
        component={mockComponent}
        selected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
  });

  it('renders scope tag', () => {
    render(
      <ComponentCard
        component={mockComponent}
        selected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('Available everywhere')).toBeInTheDocument();
  });

  it('shows toggle for components with enabled state', () => {
    render(
      <ComponentCard
        component={mockComponent}
        selected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('hides toggle for components without enabled state', () => {
    render(
      <ComponentCard
        component={mockComponentNoToggle}
        selected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('calls onSelect when card is clicked', () => {
    const onSelect = vi.fn();
    render(
      <ComponentCard
        component={mockComponent}
        selected={false}
        onSelect={onSelect}
        onToggle={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Code Review'));
    expect(onSelect).toHaveBeenCalledWith(mockComponent.id);
  });

  it('calls onToggle when toggle is clicked', () => {
    const onToggle = vi.fn();
    render(
      <ComponentCard
        component={mockComponent}
        selected={false}
        onSelect={vi.fn()}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith(mockComponent.id);
  });

  it('does not propagate click to onSelect when toggle is clicked', () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(
      <ComponentCard
        component={mockComponent}
        selected={false}
        onSelect={onSelect}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('calls onSelect when Enter key is pressed on the card', () => {
    const onSelect = vi.fn();
    render(
      <ComponentCard
        component={mockComponent}
        selected={false}
        onSelect={onSelect}
        onToggle={vi.fn()}
      />,
    );
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(mockComponent.id);
  });

  it('calls onSelect when Space key is pressed on the card', () => {
    const onSelect = vi.fn();
    render(
      <ComponentCard
        component={mockComponent}
        selected={false}
        onSelect={onSelect}
        onToggle={vi.fn()}
      />,
    );
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith(mockComponent.id);
  });

  it('does not call onSelect for other keys', () => {
    const onSelect = vi.fn();
    render(
      <ComponentCard
        component={mockComponent}
        selected={false}
        onSelect={onSelect}
        onToggle={vi.fn()}
      />,
    );
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Escape' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('applies selected styling when selected=true', () => {
    const { container } = render(
      <ComponentCard
        component={mockComponent}
        selected={true}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    expect(container.querySelector('[aria-current="true"]')).toBeInTheDocument();
  });

  it('applies opacity when component is disabled (enabled=false)', () => {
    const disabledComponent = { ...mockComponent, enabled: false };
    const { container } = render(
      <ComponentCard
        component={disabledComponent}
        selected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const card = container.querySelector('[role="button"]');
    expect(card?.className).toContain('opacity-50');
  });

  it('renders component name from id.name when displayName is absent', () => {
    const noDisplayName = { ...mockComponent, displayName: undefined };
    render(
      <ComponentCard
        component={noDisplayName}
        selected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('code-review')).toBeInTheDocument();
  });
});
