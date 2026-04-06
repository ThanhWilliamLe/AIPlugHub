import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { BrowseResultCard } from '@renderer/components/browse/BrowseResultCard';
import type { MarketplaceEntry, MarketplaceRef } from '@shared/types';

const MOCK_ENTRY: MarketplaceEntry = {
  name: 'sqlite-mcp',
  sourceId: 'claude-official',
  ref: 'sqlite-mcp',
  displayName: 'SQLite MCP Server',
  description: 'SQLite database MCP server for Claude Code',
  author: 'Anthropic',
  version: '1.2.0',
  tools: ['claude-code'],
  componentCounts: { 'mcp-server': 1 },
  keywords: ['database', 'sql'],
};

describe('BrowseResultCard', () => {
  it('renders plugin name and description', () => {
    render(<BrowseResultCard entry={MOCK_ENTRY} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('SQLite MCP Server')).toBeInTheDocument();
    expect(screen.getByText('SQLite database MCP server for Claude Code')).toBeInTheDocument();
  });

  it('renders version when present', () => {
    render(<BrowseResultCard entry={MOCK_ENTRY} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('v1.2.0')).toBeInTheDocument();
  });

  it('renders author when present', () => {
    render(<BrowseResultCard entry={MOCK_ENTRY} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('by Anthropic')).toBeInTheDocument();
  });

  it('renders tool badge', () => {
    render(<BrowseResultCard entry={MOCK_ENTRY} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
  });

  it('renders type badge from componentCounts', () => {
    render(<BrowseResultCard entry={MOCK_ENTRY} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('MCP Server')).toBeInTheDocument();
  });

  it('calls onSelect with correct ref on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<BrowseResultCard entry={MOCK_ENTRY} selected={false} onSelect={onSelect} />);

    await user.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith({
      sourceId: 'claude-official',
      ref: 'sqlite-mcp',
    } satisfies MarketplaceRef);
  });

  it('calls onSelect on Enter key', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<BrowseResultCard entry={MOCK_ENTRY} selected={false} onSelect={onSelect} />);

    const card = screen.getByRole('button');
    card.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalled();
  });

  it('applies selected styling', () => {
    render(<BrowseResultCard entry={MOCK_ENTRY} selected={true} onSelect={vi.fn()} />);
    const card = screen.getByRole('button');
    expect(card).toHaveAttribute('aria-current', 'true');
  });

  it('falls back to name when displayName is absent', () => {
    const entry = { ...MOCK_ENTRY, displayName: undefined };
    render(<BrowseResultCard entry={entry} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('sqlite-mcp')).toBeInTheDocument();
  });

  it('handles entry with no version or author', () => {
    const entry = { ...MOCK_ENTRY, version: undefined, author: undefined };
    render(<BrowseResultCard entry={entry} selected={false} onSelect={vi.fn()} />);
    expect(screen.queryByText(/^v/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^by /)).not.toBeInTheDocument();
  });

  it('renders multiple tool badges', () => {
    const entry = { ...MOCK_ENTRY, tools: ['claude-code' as const, 'claude-desktop' as const] };
    render(<BrowseResultCard entry={entry} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('Claude Desktop')).toBeInTheDocument();
  });
});
