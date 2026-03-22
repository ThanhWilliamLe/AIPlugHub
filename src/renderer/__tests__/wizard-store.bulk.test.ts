import { describe, it, expect, beforeEach } from 'vitest';
import { useWizardStore } from '../stores/wizard-store';
import type { ComponentId } from '@shared/types';

function makeId(overrides: Partial<ComponentId> = {}): ComponentId {
  return { tool: 'claude-code', type: 'mcp-server', name: 'test', scope: 'user', ...overrides };
}

beforeEach(() => {
  useWizardStore.getState().closeWizard();
});

describe('startExportWithSelection', () => {
  it('sets activeWizard to export with pre-populated selectedIds', () => {
    const ids = [makeId({ name: 'a' }), makeId({ name: 'b' })];
    useWizardStore.getState().startExportWithSelection(ids);
    const s = useWizardStore.getState();
    expect(s.activeWizard).toBe('export');
    expect(s.exportStep).toBe(1);
    expect(s.selectedIds).toEqual(ids);
    expect(s.exportOptions).toEqual({});
    expect(s.exportedJson).toBeNull();
    expect(s.error).toBeNull();
  });

  it('does not clear selectedIds like startExport does', () => {
    const ids = [makeId({ name: 'x' })];
    useWizardStore.getState().startExportWithSelection(ids);
    expect(useWizardStore.getState().selectedIds).toHaveLength(1);
    useWizardStore.getState().startExport();
    expect(useWizardStore.getState().selectedIds).toEqual([]);
  });
});
