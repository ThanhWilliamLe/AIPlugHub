/**
 * Tests for suggested sources manifest (DATA-01).
 */

import { describe, it, expect } from 'vitest';
import { SUGGESTED_SOURCES_MANIFEST } from '../constants/suggested-sources';

describe('SuggestedSourcesManifest', () => {
  it('has version 1', () => {
    expect(SUGGESTED_SOURCES_MANIFEST.version).toBe(1);
  });

  it('has at least one suggested source', () => {
    expect(SUGGESTED_SOURCES_MANIFEST.sources.length).toBeGreaterThan(0);
  });

  it('all source URLs are HTTPS', () => {
    for (const source of SUGGESTED_SOURCES_MANIFEST.sources) {
      expect(source.url).toMatch(/^https:\/\//);
    }
  });

  it('all source IDs are unique', () => {
    const ids = SUGGESTED_SOURCES_MANIFEST.sources.map((s) => s.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each source has required fields', () => {
    for (const source of SUGGESTED_SOURCES_MANIFEST.sources) {
      expect(source.sourceId).toBeTruthy();
      expect(source.url).toBeTruthy();
      expect(source.displayName).toBeTruthy();
      expect(source.description).toBeTruthy();
      expect(['git-marketplace', 'url-index']).toContain(source.sourceType);
      expect(source.tools.length).toBeGreaterThan(0);
      expect(typeof source.defaultChecked).toBe('boolean');
    }
  });

  it('has at least one featured plugin', () => {
    expect(SUGGESTED_SOURCES_MANIFEST.featured.length).toBeGreaterThan(0);
  });

  it('each featured plugin has required fields', () => {
    for (const plugin of SUGGESTED_SOURCES_MANIFEST.featured) {
      expect(plugin.name).toBeTruthy();
      expect(plugin.description).toBeTruthy();
      expect(plugin.sourceId).toBeTruthy();
      expect(plugin.ref).toBeTruthy();
      expect(plugin.tools.length).toBeGreaterThan(0);
    }
  });

  it('featured plugin sourceIds reference a known source', () => {
    const sourceIds = new Set(SUGGESTED_SOURCES_MANIFEST.sources.map((s) => s.sourceId));
    for (const plugin of SUGGESTED_SOURCES_MANIFEST.featured) {
      expect(sourceIds.has(plugin.sourceId)).toBe(true);
    }
  });
});
