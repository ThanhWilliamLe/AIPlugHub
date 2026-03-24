/**
 * Tool and component type constants.
 * Source: 4B-architecture/data-model.md §2, 4A-design/interaction-model.md §1
 */

import type { ToolId, ComponentType } from '../types';

/** Which component types each tool supports */
export const TOOL_COMPONENTS: Record<ToolId, ComponentType[]> = {
  'claude-code': [
    'mcp-server',
    'skill',
    'command',
    'hook',
    'agent',
    'context-file',
    'lsp-server',
    'output-style',
    'unknown',
  ],
  'claude-desktop': ['mcp-server', 'prompt', 'unknown'],
  'gemini-cli': ['mcp-server', 'skill', 'command', 'hook', 'agent', 'context-file', 'unknown'],
  antigravity: ['mcp-server', 'skill', 'command', 'context-file', 'unknown'],
};

/** Display metadata for each component type */
export const COMPONENT_TYPE_META: Record<
  ComponentType,
  { label: string; color: string; tooltip: string }
> = {
  'mcp-server': {
    label: 'MCP Server',
    color: '#3B8A7A',
    tooltip: 'Connects your AI to an external tool',
  },
  skill: {
    label: 'Skill',
    color: '#7B6CB5',
    tooltip: 'Teaches your AI a specific capability',
  },
  command: {
    label: 'Command',
    color: '#4A7FB5',
    tooltip: 'A slash command you can type',
  },
  hook: {
    label: 'Hook',
    color: '#D4713B',
    tooltip: 'Automation that runs on AI events',
  },
  agent: {
    label: 'Agent',
    color: '#9B6E8A',
    tooltip: 'A specialized AI for a specific job',
  },
  'context-file': {
    label: 'Context File',
    color: '#7A8B6E',
    tooltip: 'Background info the AI reads',
  },
  'lsp-server': {
    label: 'LSP Server',
    color: '#8C857C',
    tooltip: 'A language server providing code intelligence features',
  },
  'output-style': {
    label: 'Output Style',
    color: '#8C857C',
    tooltip: 'Controls how your AI tool formats its responses',
  },
  prompt: {
    label: 'Prompt',
    color: '#8C857C',
    tooltip: 'A reusable prompt template for common tasks',
  },
  unknown: {
    label: 'Unknown',
    color: '#8C857C',
    tooltip: 'A plugin type not yet recognized by AI Plug Hub',
  },
};

/** Display metadata for each tool */
export const TOOL_META: Record<ToolId, { label: string; emoji: string }> = {
  'claude-code': { label: 'Claude Code', emoji: '\u{1F916}' },
  'claude-desktop': { label: 'Claude Desktop', emoji: '\u{1F5A5}\u{FE0F}' },
  'gemini-cli': { label: 'Gemini CLI', emoji: '\u2728' },
  antigravity: { label: 'Antigravity', emoji: '\u{1F680}' },
};

/** All supported tool IDs */
export const ALL_TOOL_IDS: ToolId[] = [
  'claude-code',
  'claude-desktop',
  'gemini-cli',
  'antigravity',
];

/** Display metadata for plugin groups (not a ComponentType, used for UI grouping) */
export const PLUGIN_GROUP_META = {
  label: 'Plugin',
  color: '#C4556A', // Ruby/Rose
};

/** Maximum number of project folders that can be registered (USR-03) */
export const MAX_PROJECT_FOLDERS = 20;

/** All component types */
export const ALL_COMPONENT_TYPES: ComponentType[] = [
  'mcp-server',
  'skill',
  'command',
  'hook',
  'agent',
  'context-file',
  'lsp-server',
  'output-style',
  'prompt',
  'unknown',
];
