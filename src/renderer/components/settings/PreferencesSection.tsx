/**
 * Preferences section in Settings.
 * Rescan-on-launch toggle + GitHub token for marketplace access.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { UserPreferences } from '@shared/types';
import { useToolStore } from '@renderer/stores/tool-store';

export function PreferencesSection() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [p, t] = await Promise.all([
          window.aiplughub.preferences.get(),
          window.aiplughub.secrets.hasGithubToken(),
        ]);
        setPrefs(p);
        setHasToken(t);
      } catch (err) {
        setLoadError((err as Error).message);
      }
    }
    load();
  }, []);

  // Fix M-3: disable toggle while in-flight to prevent stale-closure double-toggle
  const handleToggleRescan = useCallback(async () => {
    if (!prefs || toggling) return;
    setError(null);
    setToggling(true);
    try {
      const updated = await window.aiplughub.preferences.set({
        rescanOnLaunch: !prefs.rescanOnLaunch,
      });
      setPrefs(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setToggling(false);
    }
  }, [prefs, toggling]);

  const handleToggleAutoCheck = useCallback(async () => {
    if (!prefs || toggling) return;
    setError(null);
    setToggling(true);
    try {
      const updated = await window.aiplughub.preferences.set({
        autoCheckUpdates: !prefs.autoCheckUpdates,
      });
      setPrefs(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setToggling(false);
    }
  }, [prefs, toggling]);

  // Fix M-1: clear previous timer before setting new one
  const handleSaveToken = useCallback(async () => {
    setError(null);
    try {
      await window.aiplughub.secrets.setGithubToken(tokenInput);
      setHasToken(tokenInput.trim().length > 0);
      setTokenInput('');
      setTokenSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setTokenSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tokenInput]);

  const handleClearToken = useCallback(async () => {
    setError(null);
    try {
      await window.aiplughub.secrets.clearGithubToken();
      setHasToken(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  // Fix M-2: show load error even when prefs is null
  if (!prefs) {
    return (
      <section>
        <h2 className="text-sm font-semibold text-sand-text uppercase tracking-wider mb-3">
          Preferences
        </h2>
        {loadError ? (
          <div className="p-3 rounded-lg bg-accent-destructive/10 text-accent-destructive text-sm">
            Failed to load preferences: {loadError}
          </div>
        ) : (
          <p className="text-sm text-sand-secondary animate-pulse">Loading...</p>
        )}
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-sand-text uppercase tracking-wider mb-3">
        Preferences
      </h2>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-accent-destructive/10 text-accent-destructive text-sm">
          {error}
        </div>
      )}

      {/* Rescan on launch */}
      <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-sand-border bg-sand-surface/30 mb-3">
        <div>
          <p className="text-sm font-medium text-sand-text">Rescan on launch</p>
          <p className="text-xs text-sand-secondary">
            Automatically detect tools and scan components when the app starts
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.rescanOnLaunch}
          aria-label="Rescan on launch"
          disabled={toggling}
          onClick={handleToggleRescan}
          className={`relative w-10 h-5 rounded-full transition-colors ${
            prefs.rescanOnLaunch ? 'bg-accent-olive' : 'bg-sand-border'
          } ${toggling ? 'opacity-50' : ''}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              prefs.rescanOnLaunch ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Plugin updates (USR-06) */}
      <UpdateCheckSection
        prefs={prefs}
        toggling={toggling}
        onToggleAutoCheck={handleToggleAutoCheck}
      />

      {/* GitHub token */}
      <div className="px-4 py-3 rounded-lg border border-sand-border bg-sand-surface/30">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-medium text-sand-text">GitHub Token</p>
          {hasToken && (
            <span className="text-xs text-accent-olive font-medium">{'\u2713'} Configured</span>
          )}
        </div>
        <p className="text-xs text-sand-secondary mb-3">
          Optional. Increases GitHub API rate limits for marketplace browsing. Stored in OS
          keychain.
        </p>

        {hasToken ? (
          <button
            type="button"
            onClick={handleClearToken}
            className="text-xs text-sand-muted hover:text-accent-destructive"
          >
            Clear token
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="ghp_..."
              className="flex-1 px-3 py-1.5 rounded-lg bg-sand-surface/50 border border-sand-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent-olive/40"
              aria-label="GitHub token"
            />
            <button
              type="button"
              onClick={handleSaveToken}
              disabled={!tokenInput.trim()}
              className="px-3 py-1.5 rounded-lg bg-accent-olive text-white text-sm hover:bg-accent-olive/90 disabled:opacity-50"
            >
              {tokenSaved ? 'Saved!' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* App version */}
      <div className="mt-6 text-center">
        <AppVersion />
      </div>
    </section>
  );
}

function UpdateCheckSection({
  prefs,
  toggling,
  onToggleAutoCheck,
}: {
  prefs: UserPreferences;
  toggling: boolean;
  onToggleAutoCheck: () => void;
}) {
  const isCheckingUpdates = useToolStore((s) => s.isCheckingUpdates);
  const checkForUpdates = useToolStore((s) => s.checkForUpdates);
  const availableUpdates = useToolStore((s) => s.availableUpdates);
  const [checkDone, setCheckDone] = useState(false);

  const handleCheckNow = useCallback(async () => {
    setCheckDone(false);
    await checkForUpdates();
    setCheckDone(true);
  }, [checkForUpdates]);

  const lastChecked = prefs.lastUpdateCheck ? formatRelativeTime(prefs.lastUpdateCheck) : 'never';

  return (
    <div className="px-4 py-3 rounded-lg border border-sand-border bg-sand-surface/30 mb-3">
      <p className="text-sm font-medium text-sand-text mb-1">Plugin updates</p>
      <p className="text-xs text-sand-secondary mb-3">Last checked: {lastChecked}</p>

      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={handleCheckNow}
          disabled={isCheckingUpdates}
          className="px-3 py-1.5 rounded-lg bg-accent-olive text-white text-sm hover:bg-accent-olive/90 disabled:opacity-50"
        >
          {isCheckingUpdates ? 'Checking...' : 'Check now'}
        </button>
        {checkDone && availableUpdates.length > 0 && (
          <span className="text-xs text-accent-olive font-medium">
            {'\u2B06'} {availableUpdates.length} update{availableUpdates.length !== 1 ? 's' : ''}{' '}
            found
          </span>
        )}
        {checkDone && availableUpdates.length === 0 && (
          <span className="text-xs text-accent-olive font-medium">{'\u2713'} All up to date</span>
        )}
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!prefs.autoCheckUpdates}
          disabled={toggling}
          onChange={onToggleAutoCheck}
          className="accent-accent-olive"
        />
        <span className="text-sm text-sand-text">Auto-check on launch</span>
      </label>
      <p className="text-xs text-sand-muted ml-6 mt-0.5">
        Checks all marketplace sources on startup. May add a few seconds to launch time.
      </p>
    </div>
  );
}

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} minutes ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)} hours ago`;
  return `${Math.floor(diffMs / 86_400_000)} days ago`;
}

function AppVersion() {
  const [version, setVersion] = useState<string>('');
  const [versionError, setVersionError] = useState<string | null>(null);

  useEffect(() => {
    window.aiplughub.system
      .getAppVersion()
      .then(setVersion)
      .catch((err) => setVersionError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (versionError) {
    return (
      <p className="text-xs text-accent-destructive select-all">
        Could not read app version: {versionError}
      </p>
    );
  }
  if (!version) return null;
  return <p className="text-xs text-sand-muted">AI Plug Hub v{version}</p>;
}
