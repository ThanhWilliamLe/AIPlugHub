/**
 * Root application component.
 * Manages initialization, first-run detection, tab routing, and drag-and-drop.
 */

import { useEffect, useRef } from 'react';
import { useToolStore } from '@renderer/stores/tool-store';
import { useUiStore } from '@renderer/stores/ui-store';
import { useWizardStore } from '@renderer/stores/wizard-store';
import { AppShell } from '@renderer/components/layout/AppShell';
import { MySetupTab } from '@renderer/components/my-setup/MySetupTab';
import { FirstRunFlow } from '@renderer/components/first-run/FirstRunFlow';
import { TransferTab } from '@renderer/components/transfer/TransferTab';
import { BrowseTab } from '@renderer/components/browse/BrowseTab';
import { ErrorBanner } from '@renderer/components/shared/ErrorBanner';
import { ErrorBoundary } from '@renderer/components/shared/ErrorBoundary';
import { SettingsOverlay } from '@renderer/components/settings/SettingsOverlay';
import { ToastContainer } from '@renderer/components/shared/ToastContainer';

function App(): React.JSX.Element {
  const loading = useToolStore((s) => s.loading);
  const error = useToolStore((s) => s.error);
  const activeTab = useUiStore((s) => s.activeTab);
  const showFirstRun = useUiStore((s) => s.showFirstRun);
  const setShowFirstRun = useUiStore((s) => s.setShowFirstRun);
  const initialized = useRef(false);

  // Initialize once — detect tools, decide first-run vs direct scan
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    async function init() {
      const { detectTools, scanAll } = useToolStore.getState();
      await detectTools();
      const tools = useToolStore.getState().tools;
      const detectedCount = tools.filter((t) => t.detected).length;

      if (detectedCount > 0) {
        await scanAll();
      } else {
        setShowFirstRun(true);
      }
    }
    init();
  }, [setShowFirstRun]);

  // Drag-and-drop: any tab → triggers import wizard (H2: DOM-based with webUtils)
  useEffect(() => {
    const ALLOWED_EXTENSIONS = ['.aibundle', '.json'];

    const handleDragOver = (e: DragEvent): void => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (e: DragEvent): void => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (!file) return;

      const filePath = window.aiplughub.system.getPathForFile(file);
      const lower = filePath.toLowerCase();
      if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return;

      // Trigger import wizard with the dropped file
      // loadBundle sets wizard-store error on failure; ImportWizard renders the error state.
      // Do NOT closeWizard on error — that would clear the error before ImportWizard can show it.
      useWizardStore.getState().startImport();
      useWizardStore
        .getState()
        .loadBundle(filePath)
        .catch(() => {
          // Error already stored in wizard-store — ImportWizard will display it
        });
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, []);

  // First-run flow takes over the entire screen
  if (showFirstRun) {
    return (
      <ErrorBoundary>
        <FirstRunFlow />
      </ErrorBoundary>
    );
  }

  // Loading state
  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-sand-secondary animate-pulse">Loading...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell>
        {error && <ErrorBanner />}
        {activeTab === 'my-setup' && <MySetupTab />}
        {activeTab === 'browse' && <BrowseTab />}
        {activeTab === 'transfer' && <TransferTab />}
      </AppShell>
      <SettingsOverlay />
      <ToastContainer />
    </ErrorBoundary>
  );
}

export default App;
