/**
 * Shared shapes for XCC Configure resources.
 *
 * All interfaces in src/types/configure are derived from REAL controller
 * records captured from a live XCC gateway (see the EPB-125 port brief),
 * not from speculative Swagger docs. Fields observed as `null` on the wire
 * are typed `<T> | null`; fields whose populated shape was never observed
 * are typed `unknown` and must be narrowed before use.
 */

/** Flags the controller sets on nearly every configuration record. */
export interface ResourceFlags {
  canEdit?: boolean | null;
  canDelete?: boolean | null;
}

/** Common identity + flags for list-style resources. */
export interface ResourceBase extends ResourceFlags {
  id: string;
}

/** Records proxied from a Local vs remote availability peer. */
export type ProxiedScope = string; // observed: 'Local'

/** Feature tags, e.g. 'CENTRALIZED-SITE'. */
export type FeatureTag = string;

/** Map returned by the various /nametoidmap endpoints. */
export type NameToIdMap = Record<string, string>;
