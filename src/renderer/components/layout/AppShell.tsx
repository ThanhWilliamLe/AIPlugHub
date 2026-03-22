/**
 * App shell — titlebar, tab bar, content area.
 * 3 tabs: My Setup | Browse | Transfer + Settings gear.
 */

import { useCallback, useEffect } from 'react';
import type { Tab } from '@renderer/stores/ui-store';
import { useUiStore } from '@renderer/stores/ui-store';
import { cn } from '@renderer/lib/utils';

const TABS: { id: Tab; label: string }[] = [
  { id: 'my-setup', label: 'My Setup' },
  { id: 'browse', label: 'Browse' },
  { id: 'transfer', label: 'Transfer' },
];

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const setShowSettings = useUiStore((s) => s.setShowSettings);

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = TABS.findIndex((t) => t.id === activeTab);
      let nextIndex: number | null = null;

      if (e.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % TABS.length;
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
      } else if (e.key === 'Home') {
        nextIndex = 0;
      } else if (e.key === 'End') {
        nextIndex = TABS.length - 1;
      }

      if (nextIndex !== null) {
        e.preventDefault();
        setActiveTab(TABS[nextIndex].id);
        // Focus the new tab
        const el = document.getElementById(`tab-${TABS[nextIndex].id}`);
        el?.focus();
      }
    },
    [activeTab, setActiveTab],
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        // But allow Ctrl+K even in inputs (standard search shortcut)
        if (!((e.ctrlKey || e.metaKey) && e.key === 'k')) return;
      }

      // Ctrl+1/2/3 for tab switching
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '3') {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        if (tabIndex < TABS.length) {
          setActiveTab(TABS[tabIndex].id);
        }
      }

      // Ctrl+, for Settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }

      // Ctrl+K for search focus
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        // Dispatch a custom event that SearchBar listens for
        document.dispatchEvent(new CustomEvent('plughub:focus-search'));
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setActiveTab, setShowSettings]);

  return (
    <div className="flex flex-col h-screen bg-sand-paper text-sand-text font-sans">
      {/* Titlebar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-sand-border bg-sand-surface/50 app-drag-region">
        <h1 className="text-sm font-semibold select-none">AI Plug Hub</h1>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className={cn(
            'text-sand-secondary hover:text-sand-text transition-colors p-1.5 rounded-md',
            'hover:bg-sand-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-olive/40',
            'app-no-drag',
          )}
          aria-label="Settings"
          title="Settings (Ctrl+,)"
        >
          {'\u2699\uFE0F'}
        </button>
      </header>

      {/* Tab bar */}
      <nav className="flex gap-1 px-4 py-1.5 border-b border-sand-border" role="tablist">
        {TABS.map((tab, idx) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            title={`${tab.label} (Ctrl+${idx + 1})`}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-olive/40',
              activeTab === tab.id
                ? 'bg-sand-surface text-sand-text'
                : 'text-sand-secondary hover:text-sand-text hover:bg-sand-surface/40',
            )}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={handleTabKeyDown}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main
        className="flex-1 overflow-hidden"
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {children}
      </main>
    </div>
  );
}
