/**
 * Coverage push for DetailPanel.tsx — http/sse MCP servers, command, hook with http handler,
 * skeleton types, no configPath, maskHeader for sensitive headers.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DetailPanel } from '../components/my-setup/DetailPanel';
import type { Component } from '@shared/types';

describe('DetailPanel — http/sse MCP server ConfigSection', () => {
  it('renders http transport with URL', async () => {
    const component: Component = {
      id: { tool: 'claude-code', type: 'mcp-server', name: 'http-server', scope: 'user' },
      enabled: true,
      tracking: 'managed',
      core: {
        transport: 'http',
        url: 'https://api.example.com/mcp',
      },
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText('http')).toBeInTheDocument();
    expect(screen.getByText('https://api.example.com/mcp')).toBeInTheDocument();
  });

  it('renders sse transport with URL', async () => {
    const component: Component = {
      id: { tool: 'claude-code', type: 'mcp-server', name: 'sse-server', scope: 'user' },
      enabled: true,
      tracking: 'managed',
      core: {
        transport: 'sse',
        url: 'https://stream.example.com/sse',
      },
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText('sse')).toBeInTheDocument();
    expect(screen.getByText('https://stream.example.com/sse')).toBeInTheDocument();
  });

  it('renders headers section for http transport', async () => {
    const component: Component = {
      id: { tool: 'claude-code', type: 'mcp-server', name: 'http-with-headers', scope: 'user' },
      enabled: true,
      tracking: 'managed',
      core: {
        transport: 'http',
        url: 'https://api.example.com/mcp',
        headers: { 'X-Custom-Header': 'value123', 'Content-Type': 'application/json' },
      },
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText(/X-Custom-Header: value123/)).toBeInTheDocument();
    expect(screen.getByText(/Content-Type: application\/json/)).toBeInTheDocument();
  });

  it('masks Authorization header value', async () => {
    const component: Component = {
      id: { tool: 'claude-code', type: 'mcp-server', name: 'secure-http', scope: 'user' },
      enabled: true,
      tracking: 'managed',
      core: {
        transport: 'http',
        url: 'https://api.example.com/mcp',
        headers: { Authorization: 'Bearer super-secret-token', 'X-Normal': 'visible' },
      },
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Technical details'));
    // Authorization value should be masked
    expect(screen.getByText(/Authorization: ••••••••/)).toBeInTheDocument();
    expect(screen.queryByText(/super-secret-token/)).not.toBeInTheDocument();
    // Non-sensitive header visible
    expect(screen.getByText(/X-Normal: visible/)).toBeInTheDocument();
  });

  it('masks x-api-key header value', async () => {
    const component: Component = {
      id: { tool: 'claude-code', type: 'mcp-server', name: 'api-key-http', scope: 'user' },
      enabled: true,
      tracking: 'managed',
      core: {
        transport: 'http',
        url: 'https://api.example.com/mcp',
        headers: { 'x-api-key': 'my-secret-key' },
      },
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText(/x-api-key: ••••••••/)).toBeInTheDocument();
    expect(screen.queryByText(/my-secret-key/)).not.toBeInTheDocument();
  });
});

describe('DetailPanel — command ConfigSection', () => {
  it('renders command content preview', async () => {
    const component: Component = {
      id: { tool: 'claude-code', type: 'command', name: 'lint-cmd', scope: 'user' },
      enabled: true,
      tracking: 'detected',
      core: {
        content: 'Run linting on the codebase',
        description: 'Lint command',
      },
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText('Run linting on the codebase')).toBeInTheDocument();
    expect(screen.getByText('Content preview:')).toBeInTheDocument();
  });

  it('truncates content preview longer than 200 chars', async () => {
    const longContent = 'A'.repeat(250);
    const component: Component = {
      id: { tool: 'claude-code', type: 'command', name: 'long-cmd', scope: 'user' },
      enabled: true,
      tracking: 'detected',
      core: { content: longContent },
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Technical details'));
    // Should truncate to 200 chars + '...'
    expect(screen.getByText(`${'A'.repeat(200)}...`)).toBeInTheDocument();
  });
});

describe('DetailPanel — hook with http handler', () => {
  it('renders hook http handler with URL', async () => {
    const component: Component = {
      id: { tool: 'claude-code', type: 'hook', name: 'PostToolUse::0::0', scope: 'user' },
      enabled: true,
      tracking: 'detected',
      core: {
        event: 'PostToolUse',
        handler: { type: 'http', url: 'https://hooks.example.com/notify' },
      },
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText(/http: https:\/\/hooks\.example\.com\/notify/)).toBeInTheDocument();
  });
});

describe('DetailPanel — skeleton / unknown type', () => {
  it('renders "No detailed config available" for skeleton types', async () => {
    const component: Component = {
      id: { tool: 'claude-code', type: 'context-file', name: 'my-ctx', scope: 'user' },
      enabled: undefined,
      tracking: 'detected',
      core: { rawConfig: { path: '/tmp' }, rawTypeName: 'context-file' },
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText('No detailed config available')).toBeInTheDocument();
  });

  it('renders agent detail view with model and tools', async () => {
    const component: Component = {
      id: { tool: 'claude-code', type: 'agent', name: 'my-agent', scope: 'user' },
      enabled: undefined,
      tracking: 'detected',
      core: { description: 'Reviews code', model: 'sonnet', tools: ['Read', 'Grep'] },
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText('sonnet')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.getByText('Grep')).toBeInTheDocument();
  });
});

describe('DetailPanel — component without configPath', () => {
  it('does not render Show in Explorer when configPath is absent', () => {
    const component: Component = {
      id: { tool: 'claude-code', type: 'skill', name: 'no-path', scope: 'user' },
      enabled: true,
      tracking: 'detected',
      core: { description: 'No path skill', content: '# Skill content' },
      // configPath intentionally omitted
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    expect(screen.queryByText('Show in Explorer')).not.toBeInTheDocument();
  });

  it('does not render Config path row when configPath is absent', () => {
    const component: Component = {
      id: { tool: 'claude-code', type: 'skill', name: 'no-path', scope: 'user' },
      enabled: true,
      tracking: 'detected',
      core: { description: 'No path', content: '# Content' },
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    expect(screen.queryByText('Config')).not.toBeInTheDocument();
  });
});

describe('DetailPanel — disabled toggle', () => {
  it('renders "Disabled" label when enabled is false', () => {
    const component: Component = {
      id: { tool: 'claude-desktop', type: 'mcp-server', name: 'disabled-srv', scope: 'user' },
      enabled: false,
      tracking: 'detected',
      core: { transport: 'stdio', command: 'test' },
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('does not render toggle section when enabled is undefined', () => {
    const component: Component = {
      id: { tool: 'claude-code', type: 'mcp-server', name: 'no-toggle', scope: 'user' },
      enabled: undefined,
      tracking: 'detected',
      core: { transport: 'stdio', command: 'server' },
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});

describe('DetailPanel — fallback display name', () => {
  it('uses id.name when displayName is absent', () => {
    const component: Component = {
      id: { tool: 'claude-code', type: 'mcp-server', name: 'raw-name', scope: 'user' },
      enabled: true,
      tracking: 'detected',
      core: { transport: 'stdio', command: 'srv' },
      // displayName omitted
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    const headings = screen.getAllByText('raw-name');
    expect(headings.length).toBeGreaterThan(0);
  });
});

describe('DetailPanel — backdrop click', () => {
  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const component: Component = {
      id: { tool: 'claude-code', type: 'skill', name: 'test', scope: 'user' },
      enabled: true,
      tracking: 'detected',
      core: { description: 'test', content: '# test' },
    };
    render(
      <DetailPanel
        component={component}
        onClose={onClose}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    // The backdrop div is aria-hidden
    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('DetailPanel — MCP stdio without args', () => {
  it('does not render args row when args array is empty', () => {
    const component: Component = {
      id: { tool: 'claude-code', type: 'mcp-server', name: 'no-args', scope: 'user' },
      enabled: true,
      tracking: 'detected',
      core: { transport: 'stdio', command: 'node', args: [] },
    };
    render(
      <DetailPanel
        component={component}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    expect(screen.queryByText('Args:')).not.toBeInTheDocument();
  });
});
