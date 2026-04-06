/**
 * First-run flow: tool detection → scan results → exit paths.
 * Shown on first launch. Two screens max.
 *
 * Does NOT re-trigger detection — consumes store state populated by App init.
 * Only triggers scanAll if tools were detected but not yet scanned.
 */

import { useState, useEffect } from 'react';
import { useToolStore } from '@renderer/stores/tool-store';
import { useUiStore } from '@renderer/stores/ui-store';
import { TOOL_META, ENABLED_TOOL_IDS } from '@shared/constants';
import { Button } from '@renderer/components/ui/button';
import type { ToolDetectionResult, ToolId } from '@shared/types';

export function FirstRunFlow() {
  const [showResults, setShowResults] = useState(false);
  const tools = useToolStore((s) => s.tools);
  const components = useToolStore((s) => s.components);
  const loading = useToolStore((s) => s.loading);
  const scanning = useToolStore((s) => s.scanning);
  const setShowFirstRun = useUiStore((s) => s.setShowFirstRun);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  // Scan detected tools, then show results. Runs once on mount.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const detected = useToolStore.getState().tools.filter((t) => t.detected);
      if (detected.length > 0) {
        await useToolStore.getState().scanAll();
      }
      if (!cancelled) setShowResults(true);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const detectedTools = tools.filter((t) => t.detected);
  const detectedCount = detectedTools.length;
  const componentCount = components.length;

  const handleGoToSetup = () => {
    setShowFirstRun(false);
    setActiveTab('my-setup');
  };

  const handleBrowse = () => {
    setShowFirstRun(false);
    setActiveTab('browse');
  };

  const handleImport = () => {
    setShowFirstRun(false);
    setActiveTab('transfer');
  };

  if (!showResults) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-sand-paper px-8">
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-semibold text-sand-text mb-2">
            {"Let's find your AI tools! \u{1F50D}"}
          </h1>
          <p className="text-sm text-sand-secondary mb-8">
            {"We'll scan your machine for installed AI tools and their plugins"}
          </p>

          <div className="space-y-3 text-left">
            {tools.length > 0
              ? tools.map((tool: ToolDetectionResult) => (
                  <ToolDetectionRow key={tool.instanceId} tool={tool} />
                ))
              : /* Show placeholder rows while detecting */
                ENABLED_TOOL_IDS.map(
                  (toolId) => (
                    <div
                      key={toolId}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg bg-sand-surface/50"
                    >
                      <span className="text-lg">{TOOL_META[toolId].emoji}</span>
                      <span className="text-sm text-sand-secondary">{TOOL_META[toolId].label}</span>
                      <span className="ml-auto text-xs text-sand-muted animate-pulse">
                        scanning...
                      </span>
                    </div>
                  ),
                )}
          </div>

          {loading && (
            <p className="text-xs text-sand-muted mt-6 animate-pulse">
              Detecting installed tools...
            </p>
          )}
          {!loading && scanning && (
            <p className="text-xs text-sand-muted mt-6 animate-pulse">Scanning plugins...</p>
          )}
        </div>
      </div>
    );
  }

  // Step 2: Results
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-sand-paper px-8">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-semibold text-sand-text mb-2">
          {"You're all set! \u{1F389}"}
        </h1>
        <p className="text-sm text-sand-secondary mb-8">
          {componentCount > 0
            ? `Found ${componentCount} plugin${componentCount !== 1 ? 's' : ''} across ${detectedCount} tool${detectedCount !== 1 ? 's' : ''} \u2014 nice collection!`
            : detectedCount > 0
              ? `Found ${detectedCount} tool${detectedCount !== 1 ? 's' : ''} but no plugins yet. Let's fix that!`
              : 'No AI tools detected. You can add them manually in Settings.'}
        </p>

        {/* Per-tool summary */}
        {detectedTools.length > 0 && (
          <div className="space-y-2 text-left mb-8">
            {detectedTools.map((tool) => {
              const toolComponents = components.filter((c) => c.id.tool === tool.toolId);
              return (
                <div
                  key={tool.instanceId}
                  className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-sand-surface/50"
                >
                  <span className="text-sm text-sand-text">
                    {TOOL_META[tool.toolId].emoji} {TOOL_META[tool.toolId].label}
                  </span>
                  <span className="text-sm text-sand-secondary">
                    {toolComponents.length} plugin{toolComponents.length !== 1 ? 's' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Exit paths */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleGoToSetup}>
              Go to My Setup
            </Button>
            <Button
              className="bg-accent-olive text-white hover:bg-accent-olive/90"
              onClick={handleBrowse}
            >
              {'Browse plugins \u2192'}
            </Button>
          </div>
          <button
            type="button"
            onClick={handleImport}
            className="text-sm text-sand-secondary hover:text-sand-text transition-colors underline-offset-2 hover:underline"
          >
            Have a bundle from a teammate? Import it
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolDetectionRow({ tool }: { tool: ToolDetectionResult }) {
  const meta = TOOL_META[tool.toolId];
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-sand-surface/50">
      <span className="text-lg">{meta.emoji}</span>
      <span className="text-sm text-sand-text">{meta.label}</span>
      <span className="ml-auto text-xs">
        {tool.detected ? (
          <span className="text-accent-olive">
            {'\u2713'} {tool.path}
          </span>
        ) : (
          <span className="text-sand-muted">{'\u2717'} not found</span>
        )}
      </span>
    </div>
  );
}
