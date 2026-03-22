import { describe, it, expect } from 'vitest';
import {
  TOOL_COMPONENTS,
  COMPONENT_TYPE_META,
  TOOL_META,
  ALL_TOOL_IDS,
  ALL_COMPONENT_TYPES,
} from '../constants';
import { isMcpServer, isSkill, isCommand, isHook } from '../types';
import type { Component, ToolId, ComponentType } from '../types';

describe('shared constants', () => {
  it('TOOL_COMPONENTS covers all tools', () => {
    for (const tool of ALL_TOOL_IDS) {
      expect(TOOL_COMPONENTS[tool]).toBeDefined();
      expect(TOOL_COMPONENTS[tool].length).toBeGreaterThan(0);
    }
  });

  it('all component types in TOOL_COMPONENTS have metadata', () => {
    const allTypes = new Set(Object.values(TOOL_COMPONENTS).flat());
    for (const type of allTypes) {
      expect(COMPONENT_TYPE_META[type]).toBeDefined();
      expect(COMPONENT_TYPE_META[type].label).toBeTruthy();
      expect(COMPONENT_TYPE_META[type].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('all tools have display metadata', () => {
    for (const tool of ALL_TOOL_IDS) {
      expect(TOOL_META[tool]).toBeDefined();
      expect(TOOL_META[tool].label).toBeTruthy();
      expect(TOOL_META[tool].emoji).toBeTruthy();
    }
  });

  it('ALL_COMPONENT_TYPES matches COMPONENT_TYPE_META keys', () => {
    const metaKeys = Object.keys(COMPONENT_TYPE_META).sort();
    const allTypes = [...ALL_COMPONENT_TYPES].sort();
    expect(allTypes).toEqual(metaKeys);
  });

  it('every tool includes mcp-server and unknown', () => {
    for (const tool of ALL_TOOL_IDS) {
      expect(TOOL_COMPONENTS[tool]).toContain('mcp-server');
      expect(TOOL_COMPONENTS[tool]).toContain('unknown');
    }
  });
});

describe('type guards', () => {
  const makeComponent = (type: ComponentType, core: unknown): Component => ({
    id: { tool: 'claude-code' as ToolId, type, name: 'test', scope: 'user' },
    tracking: 'detected',
    core: core as Component['core'],
  });

  it('isMcpServer narrows correctly', () => {
    const mcp = makeComponent('mcp-server', {
      transport: 'stdio',
      command: 'node',
      args: ['server.js'],
    });
    expect(isMcpServer(mcp)).toBe(true);
    expect(isSkill(mcp)).toBe(false);
  });

  it('isSkill narrows correctly', () => {
    const skill = makeComponent('skill', {
      description: 'A skill',
      content: '# Skill',
    });
    expect(isSkill(skill)).toBe(true);
    expect(isMcpServer(skill)).toBe(false);
  });

  it('isCommand narrows correctly', () => {
    const cmd = makeComponent('command', { content: 'do something' });
    expect(isCommand(cmd)).toBe(true);
  });

  it('isHook narrows correctly', () => {
    const hook = makeComponent('hook', {
      event: 'PreToolUse',
      handler: { type: 'command', command: 'echo hi' },
    });
    expect(isHook(hook)).toBe(true);
  });
});
