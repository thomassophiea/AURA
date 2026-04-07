/**
 * Global Elements Framework — Type Definitions
 *
 * Supports org-level configuration templates with variable substitution.
 * Templates store config payloads containing {{token}} placeholders that
 * resolve differently at each scope level:
 *   Organization → Site Group → Site
 *
 * Builds on the variable model defined in siteVariables.ts.
 */

import type { VariableType, VariableScope, VariableSourceType } from './siteVariables';

// ---------------------------------------------------------------------------
// Element types
// ---------------------------------------------------------------------------

/** Configuration object types that can be templated. */
export type GlobalElementType =
  | 'service'
  | 'topology'
  | 'role'
  | 'aaa_policy'
  | 'cos_profile'
  | 'rate_limiter'
  | 'ap_profile'
  | 'rf_policy';

export const GLOBAL_ELEMENT_TYPE_LABELS: Record<GlobalElementType, string> = {
  service: 'Service (WLAN)',
  topology: 'Topology (VLAN)',
  role: 'Role',
  aaa_policy: 'AAA Policy',
  cos_profile: 'Class of Service',
  rate_limiter: 'Rate Limiter',
  ap_profile: 'AP Profile',
  rf_policy: 'RF Management Policy',
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface GlobalElementTemplate {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  element_type: GlobalElementType;
  /** JSON config body — string values may contain {{token}} placeholders. */
  config_payload: Record<string, unknown>;
  version: number;
  is_active: boolean;
  tags: string[];
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Variables — persisted form (extends siteVariables.ts concepts)
// ---------------------------------------------------------------------------

export interface PersistedVariableDefinition {
  id: string;
  org_id: string;
  name: string;
  /** Token used in templates, e.g. "employee_vlan" → {{employee_vlan}} */
  token: string;
  description?: string;
  type: VariableType;
  default_value?: string;
  validation_rules?: {
    pattern?: string;
    min?: number;
    max?: number;
    required?: boolean;
  };
  created_at?: string;
  updated_at?: string;
}

export interface VariableValue {
  id: string;
  org_id: string;
  variable_id: string;
  scope_type: VariableScope;
  /** org_id, site_group_id, or site_id depending on scope_type */
  scope_id: string;
  value: string;
  source_type: VariableSourceType;
  updated_by?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** One step in the inheritance chain for a single variable. */
export interface ResolutionChainEntry {
  scope: VariableScope;
  scope_id: string;
  scope_name: string;
  value: string | undefined;
  is_override: boolean;
}

/** Fully-resolved result for a single variable within a resolution context. */
export interface ResolvedVariable {
  token: string;
  value: string;
  /** The scope level that provided the winning value. */
  resolved_from: VariableScope;
  /** Full inheritance chain: org → siteGroup → site. */
  chain: ResolutionChainEntry[];
}

/** Identifies the scope at which a template should be resolved. */
export interface ResolutionContext {
  org_id: string;
  org_name?: string;
  site_group_id?: string;
  site_group_name?: string;
  site_id?: string;
  site_name?: string;
}

/** Output of resolving a template against a specific context. */
export interface ResolvedTemplate {
  template: GlobalElementTemplate;
  context: ResolutionContext;
  /** Config payload with all {{tokens}} substituted. */
  resolved_payload: Record<string, unknown>;
  /** Per-variable resolution details. */
  variables: ResolvedVariable[];
  /** Tokens found in the template that have no matching variable definition. */
  unresolved_tokens: string[];
  /** True when every token was successfully resolved. */
  is_fully_resolved: boolean;
}

// ---------------------------------------------------------------------------
// Template assignments
// ---------------------------------------------------------------------------

export interface TemplateAssignment {
  id: string;
  template_id: string;
  scope_type: VariableScope;
  scope_id: string;
  is_active: boolean;
  created_at?: string;
}
