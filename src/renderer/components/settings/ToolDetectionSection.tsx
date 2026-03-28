/**
 * Tool Detection section in Settings.
 * Shows detected tools with paths and rescan button.
 * Undetected tools are collapsed by default to reduce noise for single-tool users.
 */

import { useState, useCallback } from 'react';
import { useToolStore } from '@renderer/stores/tool-store';
import { TOOL_META, ALL_TOOL_IDS } from '@shared/constants';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/utils';

function ToolRow({
  toolId,
  tools,
}: {
  toolId: (typeof ALL_TOOL_IDS)[number];
  tools: ReturnType<typeof useToolStore>['tools'];
}) {
  const meta = TOOL_META[toolId];
  const tool = tools.find((t) => t.toolId === toolId);
  const detected = tool?.detected ?? false;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-sand-border bg-sand-surface/30">
      <span className="text-base">{meta.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sand-text">{meta.label}</span>
          {detected ? (
            <span className="text-xs text-accent-olive font-medium">{'\u2713'} Detected</span>
          ) : (
            <span className="text-xs text-sand-muted">Not found</span>
          )}
        </div>
        {detected && tool?.path && (
          <p className="text-xs text-sand-secondary font-mono truncate mt-0.5">{tool.path}</p>
        )}
        {detected && tool?.version && (
          <p className="text-xs text-sand-muted mt-0.5">v{tool.version}</p>
        )}
        {detected && tool?.cliAvailable === false && (
          <p className="text-xs text-amber-600 mt-1">
            CLI not found on PATH — install/uninstall operations will fail. Make sure the
            command-line tool is installed.
          </p>
        )}
      </div>
    </div>
  );
}

export function ToolDetectionSection() {
  const tools = useToolStore((s) => s.tools);
  const detectTools = useToolStore((s) => s.detectTools);
  const scanAll = useToolStore((s) => s.scanAll);
  const [rescanning, setRescanning] = useState(false);
  const [showOtherTools, setShowOtherTools] = useState(false);

  const handleRescan = useCallback(async () => {
    setRescanning(true);
    try {
      await detectTools();
      await scanAll();
    } finally {
      setRescanning(false);
    }
  }, [detectTools, scanAll]);

  const detectedToolIds = ALL_TOOL_IDS.filter((toolId) => {
    const tool = tools.find((t) => t.toolId === toolId);
    return tool?.detected ?? false;
  });
  const undetectedToolIds = ALL_TOOL_IDS.filter((toolId) => {
    const tool = tools.find((t) => t.toolId === toolId);
    return !(tool?.detected ?? false);
  });

  return (
    <section>
      <h2 className="text-sm font-semibold text-sand-text uppercase tracking-wider mb-3">
        Tool Detection
      </h2>

      {/* Detected tools — always visible */}
      <div className="space-y-2">
        {detectedToolIds.map((toolId) => (
          <ToolRow key={toolId} toolId={toolId} tools={tools} />
        ))}
      </div>

      {/* Undetected tools — collapsed by default */}
      {undetectedToolIds.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowOtherTools(!showOtherTools)}
            className="text-xs text-sand-muted hover:text-sand-secondary transition-colors flex items-center gap-1"
          >
            <span className={cn('transition-transform', showOtherTools && 'rotate-90')}>
              {'\u25B8'}
            </span>
            {undetectedToolIds.length} other supported tool
            {undetectedToolIds.length !== 1 ? 's' : ''}
          </button>
          {showOtherTools && (
            <div className="mt-2 space-y-2">
              {undetectedToolIds.map((toolId) => (
                <ToolRow key={toolId} toolId={toolId} tools={tools} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-3">
        <Button variant="outline" size="sm" onClick={handleRescan} disabled={rescanning}>
          {rescanning ? 'Scanning...' : 'Rescan'}
        </Button>
      </div>
    </section>
  );
}
