/**
 * Suggested sources manifest for onboarding (v1.8.0 — DATA-01).
 * Data lives in suggested-sources.json; this module re-exports it typed.
 * Source: 5A-specs/getting-started-spec.md §DATA-01
 */

import type { SuggestedSourcesManifest } from '../types';
import data from './suggested-sources.json';

export const SUGGESTED_SOURCES_MANIFEST: SuggestedSourcesManifest = data as SuggestedSourcesManifest;
