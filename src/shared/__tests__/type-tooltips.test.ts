/**
 * Tests that TypeBadge tooltip text matches spec one-liners (UX-11a).
 */

import { describe, it, expect } from 'vitest';
import { COMPONENT_TYPE_META } from '../constants/tools';

describe('Component type tooltips (UX-11a)', () => {
  const SPEC_TOOLTIPS: Record<string, string> = {
    skill: 'Teaches your AI a specific capability',
    command: 'A slash command you can type',
    agent: 'A specialized AI for a specific job',
    'mcp-server': 'Connects your AI to an external tool',
    hook: 'Automation that runs on AI events',
    'context-file': 'Background info the AI reads',
  };

  for (const [type, expected] of Object.entries(SPEC_TOOLTIPS)) {
    it(`${type} tooltip matches spec: "${expected}"`, () => {
      const meta = COMPONENT_TYPE_META[type as keyof typeof COMPONENT_TYPE_META];
      expect(meta).toBeDefined();
      expect(meta.tooltip).toBe(expected);
    });
  }

  // Niche types should still have tooltips (not empty)
  const NICHE_TYPES = ['lsp-server', 'output-style', 'prompt', 'unknown'] as const;

  for (const type of NICHE_TYPES) {
    it(`${type} tooltip exists and is non-empty`, () => {
      const meta = COMPONENT_TYPE_META[type];
      expect(meta).toBeDefined();
      expect(meta.tooltip.length).toBeGreaterThan(0);
    });
  }
});
