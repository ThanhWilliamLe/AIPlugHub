/**
 * Slide-out detail panel for a selected component.
 * Opens from the right, ~40% width. Shows full details + actions.
 */

import { useState, useEffect, useCallback } from 'react';
import type { Component, ComponentId } from '@shared/types';
import { isMcpServer, isSkill, isCommand, isHook, isAgent, isPrompt } from '@shared/types';
import { TOOL_META } from '@shared/constants';
import { useToolStore } from '@renderer/stores/tool-store';
import { useToastStore } from '@renderer/stores/toast-store';
import { useUiStore } from '@renderer/stores/ui-store';
import { TypeBadge } from '@renderer/components/shared/TypeBadge';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/utils';

type DetailPanelProps = {
  component: Component;
  onClose: () => void;
  onToggle: (id: ComponentId) => void;
  onUninstall: (id: ComponentId) => void;
};

/** Keys that suggest the value is a secret and should be masked */
const SECRET_KEY_PATTERNS = /SECRET|TOKEN|KEY|PASSWORD|API/i;

function maskValue(key: string, value: string): string {
  return SECRET_KEY_PATTERNS.test(key) ? '••••••••' : value;
}

/** Header names whose values should be masked (case-insensitive) */
const SENSITIVE_HEADERS = /^(authorization|x-api-key|proxy-authorization)$/i;

function maskHeader(name: string, value: string): string {
  return SENSITIVE_HEADERS.test(name) ? '••••••••' : value;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function ConfigSection({ component }: { component: Component }) {
  if (isMcpServer(component)) {
    const core = component.core;
    if (core.transport === 'stdio') {
      return (
        <div className="space-y-1.5">
          <div>
            <span className="text-sand-secondary text-xs">Transport: </span>
            <code className="font-mono text-xs text-sand-text">stdio</code>
          </div>
          <div>
            <span className="text-sand-secondary text-xs">Command: </span>
            <code className="font-mono text-xs text-sand-text">{core.command}</code>
          </div>
          {core.args && core.args.length > 0 && (
            <div>
              <span className="text-sand-secondary text-xs">Args: </span>
              <code className="font-mono text-xs text-sand-text">{core.args.join(' ')}</code>
            </div>
          )}
          {core.env && Object.keys(core.env).length > 0 && (
            <div>
              <span className="text-sand-secondary text-xs block mb-1">Environment:</span>
              <pre className="font-mono text-xs text-sand-text bg-sand-base rounded px-2 py-1.5 overflow-x-auto">
                {Object.entries(core.env)
                  .map(([k, v]) => `${k}=${maskValue(k, v)}`)
                  .join('\n')}
              </pre>
            </div>
          )}
        </div>
      );
    }
    // http or sse
    return (
      <div className="space-y-1.5">
        <div>
          <span className="text-sand-secondary text-xs">Transport: </span>
          <code className="font-mono text-xs text-sand-text">{core.transport}</code>
        </div>
        <div>
          <span className="text-sand-secondary text-xs">URL: </span>
          <code className="font-mono text-xs text-sand-text break-all">{core.url}</code>
        </div>
        {core.headers && Object.keys(core.headers).length > 0 && (
          <div>
            <span className="text-sand-secondary text-xs block mb-1">Headers:</span>
            <pre className="font-mono text-xs text-sand-text bg-sand-base rounded px-2 py-1.5 overflow-x-auto">
              {Object.entries(core.headers)
                .map(([k, v]) => `${k}: ${maskHeader(k, v)}`)
                .join('\n')}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (isSkill(component)) {
    return (
      <div className="space-y-1.5">
        <div>
          <span className="text-sand-secondary text-xs block mb-1">Content preview:</span>
          <pre className="font-mono text-xs text-sand-text bg-sand-base rounded px-2 py-1.5 whitespace-pre-wrap break-words">
            {truncate(component.core.content, 200)}
          </pre>
        </div>
      </div>
    );
  }

  if (isCommand(component)) {
    return (
      <div className="space-y-1.5">
        <div>
          <span className="text-sand-secondary text-xs block mb-1">Content preview:</span>
          <pre className="font-mono text-xs text-sand-text bg-sand-base rounded px-2 py-1.5 whitespace-pre-wrap break-words">
            {truncate(component.core.content, 200)}
          </pre>
        </div>
      </div>
    );
  }

  if (isHook(component)) {
    const { event, handler } = component.core;
    return (
      <div className="space-y-1.5">
        <div>
          <span className="text-sand-secondary text-xs">Event: </span>
          <code className="font-mono text-xs text-sand-text">{event}</code>
        </div>
        <div>
          <span className="text-sand-secondary text-xs">Handler: </span>
          <code className="font-mono text-xs text-sand-text">
            {handler.type === 'command' ? `command: ${handler.command}` : `http: ${handler.url}`}
          </code>
        </div>
      </div>
    );
  }

  if (isAgent(component)) {
    const { model, tools, disallowedTools, maxTurns } = component.core;
    return (
      <div className="space-y-1.5">
        {model && (
          <div>
            <span className="text-sand-secondary text-xs">Model: </span>
            <code className="font-mono text-xs text-sand-text">{model}</code>
          </div>
        )}
        {maxTurns && (
          <div>
            <span className="text-sand-secondary text-xs">Max turns: </span>
            <code className="font-mono text-xs text-sand-text">{maxTurns}</code>
          </div>
        )}
        {tools && tools.length > 0 && (
          <div>
            <span className="text-sand-secondary text-xs block mb-1">Allowed tools:</span>
            <div className="flex flex-wrap gap-1">
              {tools.map((t) => (
                <span
                  key={t}
                  className="font-mono text-xs bg-sand-base rounded px-1.5 py-0.5 text-sand-text"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
        {disallowedTools && disallowedTools.length > 0 && (
          <div>
            <span className="text-sand-secondary text-xs block mb-1">Disallowed tools:</span>
            <div className="flex flex-wrap gap-1">
              {disallowedTools.map((t) => (
                <span
                  key={t}
                  className="font-mono text-xs bg-sand-base rounded px-1.5 py-0.5 text-sand-muted line-through"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isPrompt(component)) {
    return (
      <div className="space-y-1.5">
        <div>
          <span className="text-sand-secondary text-xs block mb-1">Prompt:</span>
          <pre className="font-mono text-xs text-sand-text bg-sand-base rounded px-2 py-1.5 whitespace-pre-wrap break-words">
            {truncate(component.core.content, 200)}
          </pre>
        </div>
        {component.core.arguments && component.core.arguments.length > 0 && (
          <div>
            <span className="text-sand-secondary text-xs block mb-1">Arguments:</span>
            {component.core.arguments.map((arg) => (
              <div key={arg.name} className="ml-2 text-xs">
                <code className="font-mono text-sand-text">{arg.name}</code>
                {arg.description && (
                  <span className="text-sand-muted ml-1">— {arg.description}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Skeleton / unknown types
  return <p className="text-sm text-sand-muted italic">No detailed config available</p>;
}

function TechnicalDetails({ component }: { component: Component }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left group"
      >
        <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider">
          Technical details
        </h3>
        <span
          className={cn('text-xs text-sand-muted transition-transform', expanded && 'rotate-90')}
        >
          {'\u25B8'}
        </span>
      </button>
      {expanded && (
        <div className="mt-2">
          <ConfigSection component={component} />
        </div>
      )}
    </section>
  );
}

export function DetailPanel({ component, onClose, onToggle, onUninstall }: DetailPanelProps) {
  const { id, enabled, displayName, description, version, tracking, configPath } = component;
  const canToggle = enabled !== undefined;
  const toolMeta = TOOL_META[id.tool];

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <aside
        className={cn(
          'fixed top-0 right-0 z-40 h-full w-[40%] min-w-[320px] max-w-[560px]',
          'bg-sand-paper border-l border-sand-border shadow-lg',
          'animate-slide-in-right overflow-y-auto',
        )}
        role="dialog"
        aria-modal="true"
        aria-label={`Details for ${displayName ?? id.name}`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-sand-paper border-b border-sand-border px-6 py-4 flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="font-mono text-lg font-semibold text-sand-text truncate">
              {displayName ?? id.name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <TypeBadge type={id.type} />
              {version && <span className="text-xs text-sand-muted">v{version}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sand-muted hover:text-sand-text transition-colors p-1 -mr-1"
            aria-label="Close panel"
          >
            {'\u2715'}
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Description */}
          {description && (
            <section>
              <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider mb-2">
                Description
              </h3>
              <p className="text-sm text-sand-text leading-relaxed">{description}</p>
            </section>
          )}

          {/* Metadata */}
          <section>
            <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider mb-2">
              Details
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-sand-secondary">Tool</dt>
                <dd className="text-sand-text">
                  {toolMeta.emoji} {toolMeta.label}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sand-secondary flex items-center gap-1">
                  Scope
                  <span className="relative group cursor-help">
                    <span className="text-sand-muted text-xs" aria-label="Scope info">
                      ⓘ
                    </span>
                    <span
                      className={cn(
                        'absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5',
                        'hidden group-hover:block',
                        'bg-sand-text text-sand-paper text-xs rounded px-2 py-1.5',
                        'w-56 text-center leading-snug shadow-md z-50',
                      )}
                      role="tooltip"
                    >
                      Scope determines where this plugin is active. &quot;Available everywhere&quot;
                      means it works in all contexts. &quot;This project only&quot; limits it to one
                      project folder.
                    </span>
                  </span>
                </dt>
                <dd className="text-sand-text">
                  {id.scope === 'user'
                    ? 'Available everywhere'
                    : id.scope === 'project'
                      ? 'This project only'
                      : id.scope === 'plugin'
                        ? 'From plugin'
                        : id.scope}
                  {component.projectPath && (
                    <span className="text-xs text-sand-muted ml-1" title={component.projectPath}>
                      {' \u2014 '}
                      {component.projectPath
                        .replace(/[\\/]+$/, '')
                        .split(/[\\/]/)
                        .pop()}
                    </span>
                  )}
                </dd>
              </div>
              {component.projectPath && (
                <div className="flex justify-between items-start gap-4">
                  <dt className="text-sand-secondary shrink-0">Project</dt>
                  <dd
                    className="font-mono text-xs text-sand-muted truncate text-right"
                    title={component.projectPath}
                  >
                    {component.projectPath}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-sand-secondary">Source</dt>
                <dd className="text-sand-text">
                  {tracking === 'managed'
                    ? 'Installed via AI Plug Hub'
                    : tracking === 'detected'
                      ? 'Already on your machine'
                      : tracking === 'imported'
                        ? 'From a shared bundle'
                        : tracking}
                </dd>
              </div>
              {component.installedFrom && (
                <div className="flex justify-between items-start gap-4">
                  <dt className="text-sand-secondary shrink-0">Installed from</dt>
                  <dd
                    className="font-mono text-xs text-accent-olive truncate text-right"
                    title={`${component.installedFrom.sourceId} / ${component.installedFrom.ref}`}
                  >
                    {component.installedFrom.ref}
                  </dd>
                </div>
              )}
              {configPath && (
                <div className="flex justify-between items-start gap-4">
                  <dt className="text-sand-secondary shrink-0">Config</dt>
                  <dd className="font-mono text-xs text-sand-muted truncate text-right">
                    {configPath}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Configuration (read-only) — collapsible for non-technical users */}
          <TechnicalDetails component={component} />

          {/* Update available (USR-06) */}
          <DetailPanelUpdateSection component={component} />

          {/* Toggle */}
          {canToggle && (
            <section>
              <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider mb-2">
                Status
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-sm text-sand-text">{enabled ? 'Enabled' : 'Disabled'}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${enabled ? 'Disable' : 'Enable'} ${displayName ?? id.name}`}
                  className={cn(
                    'relative inline-flex h-6 w-11 rounded-full transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-olive/40',
                    enabled ? 'bg-accent-olive' : 'bg-sand-muted/40',
                  )}
                  onClick={() => onToggle(id)}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                      'translate-y-0.5',
                      enabled ? 'translate-x-[22px]' : 'translate-x-0.5',
                    )}
                  />
                </button>
              </div>
            </section>
          )}

          {/* Actions */}
          <section className="pt-2 border-t border-sand-border">
            <div className="flex gap-2">
              {configPath && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.aiplughub.system.showInExplorer(configPath)}
                >
                  Show in Explorer
                </Button>
              )}
              {configPath && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(configPath)
                      .then(() =>
                        useToastStore
                          .getState()
                          .addToast({ message: 'Path copied', type: 'success' }),
                      )
                      .catch((err) =>
                        useToastStore.getState().addToast({
                          message: `Copy failed: ${err instanceof Error ? err.message : String(err)}`,
                          type: 'error',
                        }),
                      )
                  }
                  title="Copy config path to clipboard"
                >
                  Copy path
                </Button>
              )}
              <Button
                size="sm"
                className="bg-accent-destructive text-white hover:bg-accent-destructive/90"
                onClick={() => onUninstall(id)}
              >
                Uninstall
              </Button>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}

/** Shows update info in the detail panel when an update is available for the component's plugin */
function DetailPanelUpdateSection({ component }: { component: Component }) {
  const availableUpdates = useToolStore((s) => s.availableUpdates);
  const applyUpdate = useToolStore((s) => s.applyUpdate);
  const updateStatuses = useToolStore((s) => s.updateStatuses);
  const openUpdatePanel = useUiStore((s) => s.openUpdatePanel);

  // Match component to its plugin update via the changes array
  const update = availableUpdates.find((u) =>
    u.changes.some((c) => c.name === component.id.name && c.type === component.id.type),
  );

  if (!update) return null;

  const status = updateStatuses[update.pluginKey];
  const isUpdating = status?.state === 'updating';
  const isSuccess = status?.state === 'success';

  const versionText =
    update.currentVersion && update.availableVersion
      ? `v${update.currentVersion} \u2192 v${update.availableVersion}`
      : 'Content changed';

  return (
    <section className="p-3 rounded-lg bg-[#6B7D5E]/5 border border-[#6B7D5E]/20">
      <h3 className="text-xs font-medium text-[#6B7D5E] uppercase tracking-wider mb-2">
        {'\u2B06'} Update available
      </h3>
      <p className="text-sm text-sand-text">{versionText}</p>
      <p className="text-xs text-sand-muted mt-0.5">
        {update.modifiedCount} modified, {update.addedCount} added, {update.removedCount} removed
      </p>

      <div className="flex items-center gap-2 mt-3">
        {!isUpdating && !isSuccess && (
          <>
            <Button
              size="xs"
              className="bg-[#6B7D5E] text-white hover:bg-[#6B7D5E]/90"
              onClick={() => applyUpdate(update.pluginKey)}
            >
              Update now
            </Button>
            <button
              type="button"
              className="text-xs text-sand-secondary hover:text-sand-text transition-colors"
              onClick={() => openUpdatePanel(update.pluginKey)}
            >
              View changes
            </button>
          </>
        )}
        {isUpdating && (
          <span className="text-xs text-sand-secondary">
            <span className="inline-block size-3 border-2 border-sand-muted border-t-[#6B7D5E] rounded-full animate-spin mr-1" />
            Updating...
          </span>
        )}
        {isSuccess && (
          <span className="text-xs text-[#6B7D5E] font-medium">
            {'\u2713'} Updated{status.newVersion ? ` to v${status.newVersion}` : ''}
          </span>
        )}
      </div>
    </section>
  );
}
