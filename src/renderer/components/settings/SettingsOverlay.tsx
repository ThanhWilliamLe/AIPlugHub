/**
 * Settings overlay — full-page overlay with tabbed layout (General / Backups).
 */

import { useEffect, useState } from 'react';
import { useUiStore } from '@renderer/stores/ui-store';
import { ToolDetectionSection } from './ToolDetectionSection';
import { ProjectFoldersSection } from './ProjectFoldersSection';
import { MarketplaceSourcesSection } from './MarketplaceSourcesSection';
import { PreferencesSection } from './PreferencesSection';
import { BackupsTab } from './BackupsTab';

export function SettingsOverlay() {
  const showSettings = useUiStore((s) => s.showSettings);
  const setShowSettings = useUiStore((s) => s.setShowSettings);
  const [tab, setTab] = useState<'general' | 'backups'>('general');

  // Close on Escape
  useEffect(() => {
    if (!showSettings) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSettings(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSettings, setShowSettings]);

  if (!showSettings) return null;

  return (
    <div className="fixed inset-0 z-40 bg-sand-paper flex flex-col animate-bounce-in">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-sand-border">
        <h1 className="text-lg font-semibold text-sand-text">Settings</h1>
        <button
          type="button"
          onClick={() => setShowSettings(false)}
          className="text-sand-muted hover:text-sand-text p-1"
          aria-label="Close settings"
        >
          {'\u2715'}
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-sand-border px-6">
        <button
          type="button"
          onClick={() => setTab('general')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'general'
              ? 'text-sand-text border-b-2 border-accent-olive'
              : 'text-sand-muted hover:text-sand-text'
          }`}
        >
          General
        </button>
        <button
          type="button"
          onClick={() => setTab('backups')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'backups'
              ? 'text-sand-text border-b-2 border-accent-olive'
              : 'text-sand-muted hover:text-sand-text'
          }`}
        >
          Backups
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 max-w-2xl mx-auto w-full">
        {tab === 'general' && (
          <>
            <ToolDetectionSection />
            <ProjectFoldersSection />
            <MarketplaceSourcesSection />
            <PreferencesSection />
          </>
        )}
        {tab === 'backups' && <BackupsTab />}
      </div>
    </div>
  );
}
