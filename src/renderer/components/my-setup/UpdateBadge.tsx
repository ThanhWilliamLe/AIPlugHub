/**
 * Small inline badge indicating an update is available for a specific plugin.
 * Renders nothing if the plugin has no pending update.
 */

import { useToolStore } from '@renderer/stores/tool-store';
import { useUiStore } from '@renderer/stores/ui-store';

type UpdateBadgeProps = {
  pluginKey: string;
};

export function UpdateBadge({ pluginKey }: UpdateBadgeProps) {
  const hasUpdate = useToolStore((s) =>
    s.availableUpdates.some((u) => u.pluginKey === pluginKey),
  );
  const openUpdatePanel = useUiStore((s) => s.openUpdatePanel);

  if (!hasUpdate) return null;

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#6B7D5E]/10 text-[#6B7D5E] hover:bg-[#6B7D5E]/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B7D5E]/40"
      onClick={(e) => {
        e.stopPropagation();
        openUpdatePanel(pluginKey);
      }}
    >
      {'\u2B06'} Update
    </button>
  );
}
