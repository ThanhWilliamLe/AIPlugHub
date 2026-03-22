/**
 * My Setup tab — tool sections with component list, search, filters, detail panel.
 * The primary view where users manage their installed components.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useToastStore } from '@renderer/stores/toast-store';
import { useToolStore } from '@renderer/stores/tool-store';
import type { PluginGroup, ProjectGroup } from './ToolSection';
import { useUiStore } from '@renderer/stores/ui-store';
import { useComponents } from '@renderer/hooks/useComponents';
import { componentIdEquals, componentIdKey } from '@shared/utils';
import { ToolSection } from './ToolSection';
import { SearchBar } from './SearchBar';
import { FilterPills } from './FilterPills';
import { DetailPanel } from './DetailPanel';
import { UninstallDialog } from './UninstallDialog';
import { BulkActionBar } from './BulkActionBar';
import { BulkUninstallDialog } from './BulkUninstallDialog';
import { UpdateToolbarPill } from './UpdateToolbarPill';
import { UpdateReviewPanel } from './UpdateReviewPanel';
import { EmptyState } from '@renderer/components/shared/EmptyState';
import { Button } from '@renderer/components/ui/button';
import { useWizardStore } from '@renderer/stores/wizard-store';
import { cn } from '@renderer/lib/utils';
import type { ComponentId } from '@shared/types';

export function MySetupTab() {
  // Zustand selectors for minimal re-renders
  const components = useToolStore((s) => s.components);
  const toggleComponent = useToolStore((s) => s.toggleComponent);
  const uninstallComponent = useToolStore((s) => s.uninstallComponent);
  const selectedComponentId = useUiStore((s) => s.selectedComponentId);
  const selectComponent = useUiStore((s) => s.selectComponent);
  const showUninstallConfirm = useUiStore((s) => s.showUninstallConfirm);
  const setShowUninstallConfirm = useUiStore((s) => s.setShowUninstallConfirm);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const setShowSettings = useUiStore((s) => s.setShowSettings);
  const selectionMode = useUiStore((s) => s.selectionMode);
  const selectedIds = useUiStore((s) => s.selectedIds);
  const enterSelectionMode = useUiStore((s) => s.enterSelectionMode);
  const exitSelectionMode = useUiStore((s) => s.exitSelectionMode);
  const toggleSelectId = useUiStore((s) => s.toggleSelectId);
  const setSelectedIds = useUiStore((s) => s.setSelectedIds);
  const clearSelection = useUiStore((s) => s.clearSelection);

  const startExportWithSelection = useWizardStore((s) => s.startExportWithSelection);
  const addToast = useToastStore((s) => s.addToast);

  const {
    toolGroups,
    hasTools,
    hasComponents,
    filteredCount,
    filteredComponents,
    isFiltered,
    scanning,
  } = useComponents();

  const [showBulkUninstall, setShowBulkUninstall] = useState<ComponentId[] | null>(null);

  const selectedComponent = useMemo(
    () =>
      selectedComponentId
        ? components.find((c) => componentIdEquals(c.id, selectedComponentId))
        : undefined,
    [components, selectedComponentId],
  );

  const uninstallTarget = useMemo(
    () =>
      showUninstallConfirm
        ? components.find((c) => componentIdEquals(c.id, showUninstallConfirm))
        : undefined,
    [components, showUninstallConfirm],
  );

  const handleSelectComponent = useCallback(
    (id: ComponentId) => {
      if (selectedComponentId && componentIdEquals(selectedComponentId, id)) {
        selectComponent(null);
      } else {
        selectComponent(id);
      }
    },
    [selectedComponentId, selectComponent],
  );

  const handleClosePanel = useCallback(() => selectComponent(null), [selectComponent]);

  const togglePlugin = useToolStore((s) => s.togglePlugin);

  const handleTogglePlugin = useCallback(
    (pluginKey: string) => {
      togglePlugin(pluginKey);
    },
    [togglePlugin],
  );

  const handleToggleWithToast = useCallback(
    async (id: ComponentId) => {
      const comp = components.find((c) => componentIdEquals(c.id, id));
      if (!comp) return;
      const wasEnabled = comp.enabled;
      await toggleComponent(id);
      addToast({
        message: `${comp.displayName ?? comp.id.name} ${wasEnabled ? 'disabled' : 'enabled'}`,
        type: 'success',
        undoAction: () => toggleComponent(id),
      });
    },
    [components, toggleComponent, addToast],
  );

  const handleUninstallRequest = useCallback(
    (id: ComponentId) => setShowUninstallConfirm(id),
    [setShowUninstallConfirm],
  );

  const handleConfirmUninstall = useCallback(
    async (id: ComponentId) => {
      await uninstallComponent(id);
      setShowUninstallConfirm(null);
      selectComponent(null);
    },
    [uninstallComponent, setShowUninstallConfirm, selectComponent],
  );

  // Escape + Ctrl+A key handlers
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectionMode && !showBulkUninstall && !showUninstallConfirm) {
        exitSelectionMode();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && selectionMode) {
        e.preventDefault();
        const visibleIds = filteredComponents.map((c) => c.id);
        const hiddenSelected = selectedIds.filter(
          (id) => !filteredComponents.some((c) => componentIdEquals(c.id, id)),
        );
        setSelectedIds([...hiddenSelected, ...visibleIds]);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [
    selectionMode,
    showBulkUninstall,
    showUninstallConfirm,
    exitSelectionMode,
    filteredComponents,
    selectedIds,
    setSelectedIds,
  ]);

  const handleCheckChange = useCallback(
    (id: ComponentId) => {
      if (!selectionMode) enterSelectionMode();
      toggleSelectId(id);
    },
    [selectionMode, enterSelectionMode, toggleSelectId],
  );

  const handleCheckGroup = useCallback(
    (ids: ComponentId[], checked: boolean) => {
      if (!selectionMode) enterSelectionMode();
      const currentKeys = new Set(selectedIds.map(componentIdKey));
      if (checked) {
        const toAdd = ids.filter((id) => !currentKeys.has(componentIdKey(id)));
        setSelectedIds([...selectedIds, ...toAdd]);
      } else {
        const removeKeys = new Set(ids.map(componentIdKey));
        setSelectedIds(selectedIds.filter((id) => !removeKeys.has(componentIdKey(id))));
      }
    },
    [selectionMode, enterSelectionMode, selectedIds, setSelectedIds],
  );

  const handleBulkExport = useCallback(() => {
    startExportWithSelection(selectedIds);
    exitSelectionMode();
    setActiveTab('transfer');
  }, [selectedIds, startExportWithSelection, exitSelectionMode, setActiveTab]);

  const handleBulkToggle = useCallback(async () => {
    const applicable = selectedIds.filter((id) => {
      const c = components.find((comp) => componentIdEquals(comp.id, id));
      return c?.enabled !== undefined;
    });
    for (const id of applicable) {
      await toggleComponent(id);
    }
    addToast({
      message: `${applicable.length} plugin${applicable.length !== 1 ? 's' : ''} toggled`,
      type: 'success',
    });
  }, [selectedIds, components, toggleComponent, addToast]);

  const handleBulkUpdate = useCallback(() => {
    // USR-06 update integration — wired when update bulk action is implemented
  }, []);

  const handleBulkUninstall = useCallback(() => {
    setShowBulkUninstall(selectedIds);
  }, [selectedIds]);

  const handleConfirmBulkUninstall = useCallback(
    async (ids: ComponentId[]) => {
      for (const id of ids) {
        await uninstallComponent(id);
      }
      setShowBulkUninstall(null);
      exitSelectionMode();
    },
    [uninstallComponent, exitSelectionMode],
  );

  // Empty state: no tools detected
  if (!hasTools && !scanning) {
    return (
      <EmptyState
        icon="\u{1F50D}"
        title="No AI tools found"
        description="We couldn't detect any installed AI tools. Check your tool installations or try rescanning in Settings."
        action={
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
            Open Settings
          </Button>
        }
      />
    );
  }

  // Empty state: tools detected but no components
  if (hasTools && !hasComponents && !scanning) {
    return (
      <EmptyState
        icon="\u{1F4E6}"
        title="No plugins yet"
        description="Your AI tools are installed but have no plugins configured. Browse the marketplace to get started!"
        action={
          <Button
            className="bg-accent-olive text-white hover:bg-accent-olive/90"
            size="sm"
            onClick={() => setActiveTab('browse')}
          >
            Browse plugins
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-3 space-y-2 border-b border-sand-border">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <SearchBar />
          </div>
          <UpdateToolbarPill />
          <button
            type="button"
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
              selectionMode
                ? 'bg-[#4A7FB5] text-white border-[#4A7FB5]'
                : 'text-sand-secondary border-sand-border hover:bg-sand-surface/60',
            )}
            onClick={() => (selectionMode ? exitSelectionMode() : enterSelectionMode())}
          >
            {selectionMode ? '\u2611 Selecting' : '\u2610 Select'}
          </button>
        </div>
        <FilterPills />
        {selectionMode && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[#4A7FB5] font-medium" aria-live="polite">
              {selectedIds.length} selected
            </span>
            <button
              type="button"
              className="text-accent-olive hover:underline"
              onClick={() => {
                const visibleIds = filteredComponents.map((c) => c.id);
                const hiddenSelected = selectedIds.filter(
                  (id) => !filteredComponents.some((c) => componentIdEquals(c.id, id)),
                );
                setSelectedIds([...hiddenSelected, ...visibleIds]);
              }}
            >
              Select all visible
            </button>
            {selectedIds.length > 0 && (
              <button
                type="button"
                className="text-sand-muted hover:underline"
                onClick={clearSelection}
              >
                Deselect all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Component list */}
      <div className="flex-1 overflow-y-auto px-2 py-3 relative">
        {scanning && (
          <div className="text-center py-8 text-sm text-sand-secondary">Scanning your tools...</div>
        )}

        {!scanning && filteredCount === 0 && isFiltered && (
          <EmptyState
            icon="\u{1F50E}"
            title="No matches"
            description="No plugins match your current filters. Try adjusting your search or clearing filters."
          />
        )}

        {toolGroups.map((group) => (
          <ToolSection
            key={group.toolId}
            toolId={group.toolId}
            components={group.components}
            pluginGroups={(group as unknown as { pluginGroups?: PluginGroup[] }).pluginGroups}
            projectGroups={(group as unknown as { projectGroups?: ProjectGroup[] }).projectGroups}
            selectedComponentId={selectedComponentId}
            onSelectComponent={handleSelectComponent}
            onToggleComponent={handleToggleWithToast}
            onTogglePlugin={handleTogglePlugin}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onCheckChange={handleCheckChange}
            onCheckGroup={handleCheckGroup}
          />
        ))}

        {selectionMode && selectedIds.length > 0 && (
          <BulkActionBar
            selectedIds={selectedIds}
            components={components}
            filteredComponents={filteredComponents}
            onExport={handleBulkExport}
            onToggle={handleBulkToggle}
            onUpdate={handleBulkUpdate}
            onUninstall={handleBulkUninstall}
            onCancel={exitSelectionMode}
          />
        )}
      </div>

      {/* Detail panel */}
      {selectedComponent && (
        <DetailPanel
          component={selectedComponent}
          onClose={handleClosePanel}
          onToggle={handleToggleWithToast}
          onUninstall={handleUninstallRequest}
        />
      )}

      {/* Update review panel */}
      <UpdateReviewPanel />

      {/* Uninstall confirmation */}
      {uninstallTarget && showUninstallConfirm && (
        <UninstallDialog
          componentId={showUninstallConfirm}
          componentName={uninstallTarget.displayName ?? uninstallTarget.id.name}
          onConfirm={handleConfirmUninstall}
          onCancel={() => setShowUninstallConfirm(null)}
        />
      )}

      {showBulkUninstall && (
        <BulkUninstallDialog
          componentIds={showBulkUninstall}
          components={components}
          onConfirm={handleConfirmBulkUninstall}
          onCancel={() => setShowBulkUninstall(null)}
        />
      )}
    </div>
  );
}
