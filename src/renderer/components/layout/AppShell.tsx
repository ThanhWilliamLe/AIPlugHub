/**
 * App shell — titlebar, tab bar, content area.
 * 3 tabs: Browse | My Setup | Transfer + Settings gear.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Tab } from '@renderer/stores/ui-store';
import { useUiStore } from '@renderer/stores/ui-store';
import { useBrowseStore } from '@renderer/stores/browse-store';
import { GETTING_STARTED_EXPAND_EVENT } from '@renderer/components/browse/GettingStarted';
import { cn } from '@renderer/lib/utils';

const TABS: { id: Tab; label: string }[] = [
  { id: 'browse', label: 'Browse' },
  { id: 'my-setup', label: 'My Setup' },
  { id: 'transfer', label: 'Transfer' },
];

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const setShowSettings = useUiStore((s) => s.setShowSettings);

  // Launch pulse: only bounce on first-ever session (before user has seen the guide)
  const [launchPulse, setLaunchPulse] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    window.aiplughub.preferences
      .get()
      .then((prefs) => {
        if (!prefs.guideViewed) {
          setLaunchPulse(true);
          timer = setTimeout(() => setLaunchPulse(false), 4000);
        }
      })
      .catch(() => {});
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  const handleGettingStarted = useCallback(() => {
    setActiveTab('browse');
    // Persist that the user has seen the guide (stops bounce on future launches)
    window.aiplughub.preferences.set({ guideViewed: true }).catch(() => {});
    setLaunchPulse(false);
    // Defer event dispatch to ensure GettingStarted is mounted and listening
    // (setActiveTab causes BrowseTab mount which registers the listener in useEffect)
    requestAnimationFrame(() => {
      document.dispatchEvent(new CustomEvent(GETTING_STARTED_EXPAND_EVENT));
    });
  }, [setActiveTab]);

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
        // But allow Ctrl+K/Ctrl+F even in inputs (standard search shortcut)
        if (!((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'f'))) return;
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

      // Ctrl+K / Ctrl+F for search focus
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'f')) {
        e.preventDefault();
        // Dispatch a custom event that SearchBar listens for
        document.dispatchEvent(new CustomEvent('plughub:focus-search'));
      }

      // Ctrl+Shift+S for selection mode toggle
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        const activeTab = useUiStore.getState().activeTab;
        if (activeTab === 'browse') {
          const bs = useBrowseStore.getState();
          if (bs.browseSelectionMode) bs.exitBrowseSelectionMode();
          else bs.enterBrowseSelectionMode();
        } else if (activeTab === 'my-setup') {
          const ui = useUiStore.getState();
          if (ui.selectionMode) ui.exitSelectionMode();
          else ui.enterSelectionMode();
        }
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
      <nav
        className="flex items-center gap-1 px-4 py-1.5 border-b border-sand-border"
        role="tablist"
      >
        {TABS.map((tab, idx) => (
          <div key={tab.id} className="relative">
            <button
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
            {/* Superscript "Getting Started" button on Browse tab (UX-10) */}
            {tab.id === 'browse' && (
              <button
                type="button"
                onClick={handleGettingStarted}
                className={cn(
                  'absolute -top-2 -right-2 px-2 py-0.5 rounded-full',
                  'bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400',
                  'text-white font-semibold text-[10px] leading-none tracking-wide',
                  'shadow-sm shadow-orange-300/40',
                  'hover:from-amber-500 hover:via-orange-500 hover:to-rose-500',
                  'hover:shadow-md hover:shadow-orange-400/40 hover:scale-110',
                  'transition-all duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60',
                  launchPulse && 'animate-bounce',
                )}
                aria-label="Open Getting Started guide"
                title="Getting Started"
              >
                Get Started
              </button>
            )}
          </div>
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
