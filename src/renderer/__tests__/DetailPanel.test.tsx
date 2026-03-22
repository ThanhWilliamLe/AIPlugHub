import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DetailPanel } from '../components/my-setup/DetailPanel';
import type { Component } from '@shared/types';

const mockComponent: Component = {
  id: { tool: 'claude-code', type: 'skill', name: 'code-review', scope: 'user' },
  enabled: true,
  tracking: 'detected',
  displayName: 'Code Review',
  description: 'Reviews code for quality and best practices',
  version: '2.0.0',
  core: { description: 'Reviews code', content: '# Code Review' },
  configPath: '/home/user/.claude/skills/code-review.md',
};

describe('DetailPanel', () => {
  it('renders component name and type', () => {
    render(
      <DetailPanel
        component={mockComponent}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    expect(screen.getByText('Code Review')).toBeInTheDocument();
    expect(screen.getByText('Skill')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(
      <DetailPanel
        component={mockComponent}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    expect(screen.getByText('Reviews code for quality and best practices')).toBeInTheDocument();
  });

  it('renders metadata: tool, scope, source', () => {
    render(
      <DetailPanel
        component={mockComponent}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    expect(screen.getByText(/Claude Code/)).toBeInTheDocument();
    expect(screen.getByText('Available everywhere')).toBeInTheDocument();
    expect(screen.getByText('Already on your machine')).toBeInTheDocument();
  });

  it('renders toggle when canToggle', () => {
    render(
      <DetailPanel
        component={mockComponent}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <DetailPanel
        component={mockComponent}
        onClose={onClose}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close panel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(
      <DetailPanel
        component={mockComponent}
        onClose={onClose}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders uninstall button', () => {
    render(
      <DetailPanel
        component={mockComponent}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    expect(screen.getByText('Uninstall')).toBeInTheDocument();
  });

  it('renders Show in Explorer when configPath exists', () => {
    render(
      <DetailPanel
        component={mockComponent}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    expect(screen.getByText('Show in Explorer')).toBeInTheDocument();
  });

  it('renders Configuration section with skill content preview', async () => {
    render(
      <DetailPanel
        component={mockComponent}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    expect(screen.getByText('Technical details')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText('# Code Review')).toBeInTheDocument();
  });

  it('renders MCP server command and args in Configuration', async () => {
    const mcpComponent: Component = {
      id: { tool: 'claude-code', type: 'mcp-server', name: 'my-server', scope: 'user' },
      enabled: true,
      tracking: 'managed',
      core: { transport: 'stdio', command: 'npx', args: ['-y', 'my-server'] },
      configPath: '/home/user/.claude/config.json',
    };
    render(
      <DetailPanel
        component={mcpComponent}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText('npx')).toBeInTheDocument();
    expect(screen.getByText('-y my-server')).toBeInTheDocument();
  });

  it('masks secret env values in MCP server config', async () => {
    const mcpComponent: Component = {
      id: { tool: 'claude-code', type: 'mcp-server', name: 'my-server', scope: 'user' },
      enabled: true,
      tracking: 'managed',
      core: {
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: { SAFE_VAR: 'visible', MY_API_KEY: 'super-secret-123' },
      },
    };
    render(
      <DetailPanel
        component={mcpComponent}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText(/SAFE_VAR=visible/)).toBeInTheDocument();
    expect(screen.getByText(/MY_API_KEY=••••••••/)).toBeInTheDocument();
    expect(screen.queryByText(/super-secret-123/)).not.toBeInTheDocument();
  });

  it('renders hook event and handler in Configuration', async () => {
    const hookComponent: Component = {
      id: { tool: 'claude-code', type: 'hook', name: 'pre-commit', scope: 'project' },
      enabled: true,
      tracking: 'detected',
      core: { event: 'pre-commit', handler: { type: 'command', command: 'npm test' } },
    };
    render(
      <DetailPanel
        component={hookComponent}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Technical details'));
    // "pre-commit" appears as both name (header) and event — verify at least one config instance
    const eventMatches = screen.getAllByText('pre-commit');
    expect(eventMatches.length).toBeGreaterThanOrEqual(2); // header + event field
    expect(screen.getByText(/command: npm test/)).toBeInTheDocument();
  });

  it('renders scope tooltip info icon', () => {
    render(
      <DetailPanel
        component={mockComponent}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Scope info')).toBeInTheDocument();
    const tooltips = screen.getAllByRole('tooltip');
    expect(tooltips.length).toBeGreaterThanOrEqual(1);
  });
});
