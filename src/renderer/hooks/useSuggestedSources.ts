/**
 * Hook to fetch the suggested sources manifest (local + remote).
 * Starts with the hardcoded fallback, replaces with remote data when available.
 * Source: 5A-specs/getting-started-spec.md §DATA-01
 */

import { useState, useEffect } from 'react';
import type { SuggestedSourcesManifest } from '@shared/types';
import { SUGGESTED_SOURCES_MANIFEST } from '@shared/constants';

/**
 * Returns the suggested sources manifest.
 * Initially returns the hardcoded fallback, then upgrades to the remote
 * version once it's fetched via IPC (main process handles caching + fallback).
 */
export function useSuggestedSources(): SuggestedSourcesManifest {
  const [manifest, setManifest] = useState<SuggestedSourcesManifest>(SUGGESTED_SOURCES_MANIFEST);

  useEffect(() => {
    let cancelled = false;

    window.aiplughub.browse
      .getSuggestedSources()
      .then((remote) => {
        if (!cancelled) setManifest(remote);
      })
      .catch(() => {
        // Silent fallback — hardcoded manifest already set
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return manifest;
}
