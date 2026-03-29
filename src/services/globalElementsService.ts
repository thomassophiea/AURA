/**
 * Global Elements Service
 *
 * CRUD operations for configuration templates and variables stored in Supabase.
 * Follows the tenantService pattern: Supabase as source of truth with
 * localStorage fallback for offline / fast-reload support.
 */

import { supabase } from './supabaseClient';
import type {
  GlobalElementTemplate,
  GlobalElementType,
  PersistedVariableDefinition,
  VariableValue,
  TemplateAssignment,
} from '../types/globalElements';
import type { VariableScope } from '../types/siteVariables';

// ---------------------------------------------------------------------------
// localStorage keys
// ---------------------------------------------------------------------------
const STORAGE_KEYS = {
  TEMPLATES: 'ge_templates',
  VARIABLE_DEFS: 'ge_variable_defs',
  VARIABLE_VALS: 'ge_variable_vals',
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class GlobalElementsService {
  // -----------------------------------------------------------------------
  // Templates
  // -----------------------------------------------------------------------

  async getTemplates(
    orgId: string,
    elementType?: GlobalElementType
  ): Promise<GlobalElementTemplate[]> {
    try {
      let query = supabase
        .from('global_element_templates')
        .select('*')
        .eq('org_id', orgId)
        .order('name');

      if (elementType) {
        query = query.eq('element_type', elementType);
      }

      const { data, error } = await query;
      if (error) throw error;

      const templates = (data ?? []) as GlobalElementTemplate[];
      this._cacheTemplates(orgId, templates);
      return templates;
    } catch (err) {
      console.warn('[GlobalElements] Supabase templates fetch failed, trying cache:', err);
      return this._getCachedTemplates(orgId, elementType);
    }
  }

  async getTemplate(templateId: string): Promise<GlobalElementTemplate | null> {
    const { data, error } = await supabase
      .from('global_element_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (error) {
      console.error('[GlobalElements] Failed to fetch template:', error);
      return null;
    }
    return data as GlobalElementTemplate;
  }

  async createTemplate(
    template: Omit<GlobalElementTemplate, 'id' | 'created_at' | 'updated_at' | 'version'>
  ): Promise<GlobalElementTemplate> {
    const { data, error } = await supabase
      .from('global_element_templates')
      .insert({ ...template, version: 1 })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as GlobalElementTemplate;
  }

  async updateTemplate(
    templateId: string,
    updates: Partial<GlobalElementTemplate>
  ): Promise<GlobalElementTemplate> {
    const { data, error } = await supabase
      .from('global_element_templates')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', templateId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as GlobalElementTemplate;
  }

  async deleteTemplate(templateId: string): Promise<void> {
    const { error } = await supabase
      .from('global_element_templates')
      .delete()
      .eq('id', templateId);

    if (error) throw new Error(error.message);
  }

  async duplicateTemplate(
    templateId: string,
    newName: string
  ): Promise<GlobalElementTemplate> {
    const original = await this.getTemplate(templateId);
    if (!original) throw new Error('Template not found');

    return this.createTemplate({
      org_id: original.org_id,
      name: newName,
      description: original.description,
      element_type: original.element_type,
      config_payload: original.config_payload,
      is_active: original.is_active,
      tags: original.tags,
      created_by: original.created_by,
    });
  }

  // -----------------------------------------------------------------------
  // Variable Definitions
  // -----------------------------------------------------------------------

  async getVariableDefinitions(
    orgId: string
  ): Promise<PersistedVariableDefinition[]> {
    try {
      const { data, error } = await supabase
        .from('variable_definitions')
        .select('*')
        .eq('org_id', orgId)
        .order('name');

      if (error) throw error;

      const defs = (data ?? []) as PersistedVariableDefinition[];
      this._cacheVariableDefs(orgId, defs);
      return defs;
    } catch (err) {
      console.warn('[GlobalElements] Supabase variable defs fetch failed, trying cache:', err);
      return this._getCachedVariableDefs(orgId);
    }
  }

  async createVariableDefinition(
    def: Omit<PersistedVariableDefinition, 'id' | 'created_at' | 'updated_at'>
  ): Promise<PersistedVariableDefinition> {
    const { data, error } = await supabase
      .from('variable_definitions')
      .insert(def)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as PersistedVariableDefinition;
  }

  async updateVariableDefinition(
    defId: string,
    updates: Partial<PersistedVariableDefinition>
  ): Promise<PersistedVariableDefinition> {
    const { data, error } = await supabase
      .from('variable_definitions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', defId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as PersistedVariableDefinition;
  }

  async deleteVariableDefinition(defId: string): Promise<void> {
    const { error } = await supabase
      .from('variable_definitions')
      .delete()
      .eq('id', defId);

    if (error) throw new Error(error.message);
  }

  // -----------------------------------------------------------------------
  // Variable Values
  // -----------------------------------------------------------------------

  async getVariableValues(
    orgId: string,
    scopeType?: VariableScope,
    scopeId?: string
  ): Promise<VariableValue[]> {
    try {
      let query = supabase
        .from('variable_values')
        .select('*')
        .eq('org_id', orgId);

      if (scopeType) query = query.eq('scope_type', scopeType);
      if (scopeId) query = query.eq('scope_id', scopeId);

      const { data, error } = await query;
      if (error) throw error;

      const vals = (data ?? []) as VariableValue[];
      this._cacheVariableVals(orgId, vals);
      return vals;
    } catch (err) {
      console.warn('[GlobalElements] Supabase variable vals fetch failed, trying cache:', err);
      return this._getCachedVariableVals(orgId);
    }
  }

  async setVariableValue(
    value: Omit<VariableValue, 'id' | 'updated_at'>
  ): Promise<VariableValue> {
    // Upsert by (variable_id, scope_type, scope_id)
    const { data, error } = await supabase
      .from('variable_values')
      .upsert(value, { onConflict: 'variable_id,scope_type,scope_id' })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as VariableValue;
  }

  async deleteVariableValue(valueId: string): Promise<void> {
    const { error } = await supabase
      .from('variable_values')
      .delete()
      .eq('id', valueId);

    if (error) throw new Error(error.message);
  }

  async bulkSetVariableValues(
    values: Omit<VariableValue, 'id' | 'updated_at'>[]
  ): Promise<void> {
    if (values.length === 0) return;
    const { error } = await supabase
      .from('variable_values')
      .upsert(values, { onConflict: 'variable_id,scope_type,scope_id' });

    if (error) throw new Error(error.message);
  }

  // -----------------------------------------------------------------------
  // Template Assignments
  // -----------------------------------------------------------------------

  async getAssignmentsByOrg(orgId: string): Promise<(TemplateAssignment & { template_name?: string; element_type?: string })[]> {
    const { data, error } = await supabase
      .from('template_assignments')
      .select('*, global_element_templates!inner(name, element_type, org_id)')
      .eq('global_element_templates.org_id', orgId);

    if (error) {
      console.error('[GlobalElements] Failed to fetch org assignments:', error);
      return [];
    }
    return (data ?? []).map((row: Record<string, unknown>) => {
      const tpl = row.global_element_templates as Record<string, unknown> | undefined;
      return {
        ...row,
        template_name: tpl?.name as string | undefined,
        element_type: tpl?.element_type as string | undefined,
        global_element_templates: undefined,
      } as TemplateAssignment & { template_name?: string; element_type?: string };
    });
  }

  async getAssignments(templateId: string): Promise<TemplateAssignment[]> {
    const { data, error } = await supabase
      .from('template_assignments')
      .select('*')
      .eq('template_id', templateId);

    if (error) {
      console.error('[GlobalElements] Failed to fetch assignments:', error);
      return [];
    }
    return (data ?? []) as TemplateAssignment[];
  }

  async assignTemplate(
    assignment: Omit<TemplateAssignment, 'id' | 'created_at'>
  ): Promise<TemplateAssignment> {
    const { data, error } = await supabase
      .from('template_assignments')
      .upsert(assignment, { onConflict: 'template_id,scope_type,scope_id' })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as TemplateAssignment;
  }

  async unassignTemplate(assignmentId: string): Promise<void> {
    const { error } = await supabase
      .from('template_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) throw new Error(error.message);
  }

  // -----------------------------------------------------------------------
  // CSV Import / Export
  // -----------------------------------------------------------------------

  /**
   * Export variable values as CSV.
   * Format: Variable,Token,Value
   */
  exportVariablesCsv(
    definitions: PersistedVariableDefinition[],
    values: VariableValue[]
  ): string {
    const defMap = new Map(definitions.map(d => [d.id, d]));
    const lines = ['Variable,Token,Value'];

    for (const val of values) {
      const def = defMap.get(val.variable_id);
      if (!def) continue;
      const escapedValue = val.value.includes(',') ? `"${val.value}"` : val.value;
      lines.push(`${def.name},{{${def.token}}},${escapedValue}`);
    }

    return lines.join('\n');
  }

  /**
   * Parse a CSV string into variable values for import.
   * Expected format: Variable,Token,Value (header row required)
   */
  parseCsvImport(
    csv: string,
    definitions: PersistedVariableDefinition[],
    orgId: string,
    scopeType: VariableScope,
    scopeId: string
  ): { values: Omit<VariableValue, 'id' | 'updated_at'>[]; errors: string[] } {
    const defByToken = new Map(definitions.map(d => [d.token, d]));
    const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
    const errors: string[] = [];
    const values: Omit<VariableValue, 'id' | 'updated_at'>[] = [];

    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const parts = this._parseCsvLine(lines[i]);
      if (parts.length < 3) {
        errors.push(`Line ${i + 1}: expected 3 columns, got ${parts.length}`);
        continue;
      }
      const tokenRaw = parts[1].replace(/^\{\{|\}\}$/g, '').trim();
      const def = defByToken.get(tokenRaw);
      if (!def) {
        errors.push(`Line ${i + 1}: unknown variable token "{{${tokenRaw}}}"`);
        continue;
      }

      values.push({
        org_id: orgId,
        variable_id: def.id,
        scope_type: scopeType,
        scope_id: scopeId,
        value: parts[2],
        source_type: 'imported',
        updated_by: undefined,
      });
    }

    return { values, errors };
  }

  /** Simple CSV line parser that handles quoted values. */
  private _parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  // -----------------------------------------------------------------------
  // localStorage cache helpers
  // -----------------------------------------------------------------------

  private _cacheTemplates(orgId: string, templates: GlobalElementTemplate[]) {
    try {
      localStorage.setItem(
        `${STORAGE_KEYS.TEMPLATES}:${orgId}`,
        JSON.stringify(templates)
      );
    } catch { /* quota exceeded — ignore */ }
  }

  private _getCachedTemplates(
    orgId: string,
    elementType?: GlobalElementType
  ): GlobalElementTemplate[] {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEYS.TEMPLATES}:${orgId}`);
      if (!raw) return [];
      const all: GlobalElementTemplate[] = JSON.parse(raw);
      return elementType ? all.filter(t => t.element_type === elementType) : all;
    } catch {
      return [];
    }
  }

  private _cacheVariableDefs(orgId: string, defs: PersistedVariableDefinition[]) {
    try {
      localStorage.setItem(
        `${STORAGE_KEYS.VARIABLE_DEFS}:${orgId}`,
        JSON.stringify(defs)
      );
    } catch { /* quota exceeded — ignore */ }
  }

  private _getCachedVariableDefs(orgId: string): PersistedVariableDefinition[] {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEYS.VARIABLE_DEFS}:${orgId}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private _cacheVariableVals(orgId: string, vals: VariableValue[]) {
    try {
      localStorage.setItem(
        `${STORAGE_KEYS.VARIABLE_VALS}:${orgId}`,
        JSON.stringify(vals)
      );
    } catch { /* quota exceeded — ignore */ }
  }

  private _getCachedVariableVals(orgId: string): VariableValue[] {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEYS.VARIABLE_VALS}:${orgId}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

/** Singleton instance. */
export const globalElementsService = new GlobalElementsService();
