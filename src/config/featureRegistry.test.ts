/**
 * Drift guards: the feature registry is the single source of truth for the
 * Configure taxonomy. These tests fail the moment the Feature Catalog, the
 * navigation scope sets, or the legacy aliases disagree with it — the exact
 * failure mode this registry exists to prevent.
 */
import { describe, it, expect } from 'vitest';
import {
  ALL_CONFIGURE_FEATURES,
  CONFIGURE_NAV_GROUPS,
  CONFIGURE_PAGE_IDS,
  CONFIGURE_ROOT_ITEMS,
  CONFIGURE_TAIL_ITEMS,
  LEGACY_CONFIGURE_ALIASES,
} from './featureRegistry';
import { ORG_PAGES } from './navigationScopes';
import { ARCH_LAYERS, CATALOG_GROUPS } from '../components/configure/catalog/catalogData';

describe('featureRegistry structure', () => {
  it('has no duplicate feature ids', () => {
    const ids = ALL_CONFIGURE_FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every feature carries a label, description, icon, scope and aliases', () => {
    for (const f of ALL_CONFIGURE_FEATURES) {
      expect(f.id).toMatch(/^configure-/);
      expect(f.label).toBeTruthy();
      expect(f.description).toBeTruthy();
      expect(f.icon).toBeTruthy();
      expect(['gateway', 'organization', 'site', 'appliance']).toContain(f.scope);
      expect(Array.isArray(f.aliases)).toBe(true);
    }
  });

  it('root, group and tail items do not overlap', () => {
    const rootIds = new Set(CONFIGURE_ROOT_ITEMS.map((f) => f.id));
    const tailIds = new Set(CONFIGURE_TAIL_ITEMS.map((f) => f.id));
    for (const group of CONFIGURE_NAV_GROUPS) {
      for (const item of group.items) {
        expect(rootIds.has(item.id)).toBe(false);
        expect(tailIds.has(item.id)).toBe(false);
      }
    }
  });

  it('legacy aliases resolve to canonical feature ids', () => {
    const ids = new Set(ALL_CONFIGURE_FEATURES.map((f) => f.id));
    for (const [alias, target] of Object.entries(LEGACY_CONFIGURE_ALIASES)) {
      expect(ids.has(alias)).toBe(false);
      expect(ids.has(target)).toBe(true);
    }
  });
});

describe('featureRegistry ↔ navigationScopes', () => {
  it('every Configure page id (including legacy aliases) is an ORG page', () => {
    for (const id of CONFIGURE_PAGE_IDS) {
      expect(ORG_PAGES.has(id), `${id} missing from ORG_PAGES`).toBe(true);
    }
  });
});

describe('featureRegistry ↔ Feature Catalog', () => {
  const registryIds = new Set(ALL_CONFIGURE_FEATURES.map((f) => f.id));
  const catalogCards = CATALOG_GROUPS.flatMap((g) => g.items);

  it('every navigable catalog card resolves to a registered feature', () => {
    for (const card of catalogCards) {
      if (card.viewId === null) continue;
      expect(registryIds.has(card.viewId), `card ${card.id} → unknown view ${card.viewId}`).toBe(
        true
      );
    }
  });

  it('every registered feature is discoverable from the catalog (except the catalog itself)', () => {
    const cardTargets = new Set(catalogCards.map((c) => c.viewId).filter(Boolean));
    for (const f of ALL_CONFIGURE_FEATURES) {
      if (f.id === 'configure-catalog') continue;
      expect(cardTargets.has(f.id), `feature ${f.id} has no catalog card`).toBe(true);
    }
  });

  it('catalog card ids are unique', () => {
    const ids = catalogCards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every Architecture node points at a registered feature', () => {
    for (const layer of ARCH_LAYERS) {
      for (const node of layer.nodes) {
        expect(registryIds.has(node.viewId), `arch node ${node.id} → ${node.viewId}`).toBe(true);
      }
    }
  });
});
