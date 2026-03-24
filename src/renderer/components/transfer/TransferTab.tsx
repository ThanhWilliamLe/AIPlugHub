/**
 * Transfer tab — landing page with Export/Import entry points + wizard modals.
 */

import { useCallback } from 'react';
import { useWizardStore } from '@renderer/stores/wizard-store';
import { ExportWizard } from './ExportWizard';
import { ImportWizard } from './ImportWizard';
import { Button } from '@renderer/components/ui/button';

export function TransferTab() {
  const activeWizard = useWizardStore((s) => s.activeWizard);
  const startExport = useWizardStore((s) => s.startExport);
  const startImport = useWizardStore((s) => s.startImport);
  const loadBundle = useWizardStore((s) => s.loadBundle);

  const handleImport = useCallback(async () => {
    startImport();
    let filePath: string | null = null;
    try {
      filePath = await window.aiplughub.system.openFileDialog({
        title: 'Open a bundle file',
        filters: [{ name: 'AI Bundle', extensions: ['aibundle', 'json'] }],
      });
    } catch {
      // Dialog itself failed — close wizard silently
      useWizardStore.getState().closeWizard();
      return;
    }
    if (!filePath) {
      useWizardStore.getState().closeWizard();
      return;
    }
    // loadBundle handles its own errors (sets wizard error state)
    await loadBundle(filePath);
  }, [startImport, loadBundle]);

  return (
    <div className="flex items-center justify-center h-full px-8">
      <div className="flex gap-6 max-w-2xl w-full">
        {/* Export card */}
        <div className="flex-1 rounded-xl border border-sand-border bg-sand-surface/30 p-8 text-center hover:scale-[1.01] transition-transform">
          <h2 className="text-lg font-semibold text-sand-text mb-2">Export your setup</h2>
          <p className="text-sm text-sand-secondary mb-6">
            Select plugins and create a shareable bundle
          </p>
          <Button
            className="bg-accent-olive text-white hover:bg-accent-olive/90"
            onClick={startExport}
          >
            {'Export \u2192'}
          </Button>
        </div>

        {/* Import card */}
        <div className="flex-1 rounded-xl border border-sand-border bg-sand-surface/30 p-8 text-center hover:scale-[1.01] transition-transform">
          <h2 className="text-lg font-semibold text-sand-text mb-2">Import a bundle</h2>
          <p className="text-sm text-sand-secondary mb-6">
            Open a bundle file from a teammate or another machine
          </p>
          <Button
            className="bg-accent-olive text-white hover:bg-accent-olive/90"
            onClick={handleImport}
          >
            {'Import \u2192'}
          </Button>
        </div>
      </div>

      {/* Wizard modals */}
      {activeWizard === 'export' && <ExportWizard />}
      {activeWizard === 'import' && <ImportWizard />}
    </div>
  );
}
