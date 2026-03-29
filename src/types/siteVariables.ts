/**
 * Site Variables Data Model
 *
 * Defines types for the site-level variable system.
 * Variables are resolved hierarchically:
 *   Organization → Site Group → Site
 *
 * Token syntax: {{variable_name}}
 * Allowed characters in variable names: letters, numbers, underscores
 * Examples: {{employee_vlan}}, {{guest_subnet}}, {{site_name}}
 *
 * CSV import/export format:
 *   Variable,Value
 *   {{employee_vlan}},110
 *   {{guest_vlan}},210
 */

export type VariableType = 'string' | 'number' | 'ip' | 'subnet' | 'vlan' | 'hostname';
export type VariableScope = 'organization' | 'site_group' | 'site';
export type VariableSourceType = 'default' | 'override' | 'imported';

export interface VariableDefinition {
  id: string;
  name: string;
  /** Token used in templates, e.g. "employee_vlan" → renders as {{employee_vlan}} */
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
  scope: VariableScope;
  created_at?: string;
  updated_at?: string;
}

export interface SiteVariableValue {
  id: string;
  site_id: string;
  variable_id: string;
  /** Token string, e.g. "employee_vlan" */
  token: string;
  value: string;
  source_type: VariableSourceType;
  updated_at?: string;
  updated_by?: string;
}
