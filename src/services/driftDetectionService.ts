/**
 * Drift Detection Service
 *
 * Compares resolved template payloads against live controller state.
 * For each deployed template + scope, re-resolves the template with current
 * variables, fetches live config from the controller, and diffs field-by-field.
 */

import { apiService } from './api';
import { templateResolver } from './templateResolver';
import type {
  GlobalElementTemplate,
  GlobalElementType,
  PersistedVariableDefinition,
  VariableValue,
  ResolutionContext,
} from '../types/globalElements';
import type { TemplateAssignment } from '../types/globalElements';
import type { SiteGroup } from '../types/domain';
import type { DriftCheckResult, DriftSummary, FieldDiff, DriftStatus } from '../types/deployment';

// Name fields used to match resources on controllers
const NAME_FIELDS: Record<GlobalElementType, string> = {
  service: 'serviceName',
  topology: 'name',
  role: 'name',
  aaa_policy: 'name',
  cos_profile: 'name',
  rate_limiter: 'name',
  ap_profile: 'name',
  rf_policy: 'name',
};

// Fetch methods per element type
const FETCH_METHODS: Record<GlobalElementType, (() => Promise<unknown[]>) | null> = {
  service: () => apiService.getServices(),
  topology: () => apiService.getTopologies(),
  role: () => apiService.getRoles(),
  aaa_policy: () => apiService.getAaaPolicies(),
  cos_profile: () => apiService.getCoSProfiles(),
  rate_limiter: async () => [],
  ap_profile: () => apiService.getProfiles(),
  rf_policy: () => apiService.getRFManagementProfiles(),
};

// Fields to ignore when comparing (controller-generated, not template-defined)
const IGNORE_FIELDS = new Set([
  'id', 'createdAt', 'updatedAt', 'created_at', 'updated_at',
  'lastModified', 'version', '_etag', 'href', 'links',
]);

class DriftDetectionServiceClass {
  /**
   * Check drift for a single template across all its assigned scopes.
   */
  async checkTemplate(
    template: GlobalElementTemplate,
    definitions: PersistedVariableDefinition[],
    values: VariableValue[],
    assignments: TemplateAssignment[],
    siteGroups: SiteGroup[]
  ): Promise<DriftCheckResult[]> {
    const templateAssignments = assignments.filter(
      a => a.template_id === template.id && a.is_active
    );

    const results: DriftCheckResult[] = [];

    for (const assignment of templateAssignments) {
      const sg = siteGroups.find(g => g.id === assignment.scope_id);
      if (!sg) continue;

      const result = await this._checkSingleScope(
        template, definitions, values, sg, assignment
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Check drift across all templates.
   */
  async checkAll(
    templates: GlobalElementTemplate[],
    definitions: PersistedVariableDefinition[],
    values: VariableValue[],
    assignments: TemplateAssignment[],
    siteGroups: SiteGroup[]
  ): Promise<DriftSummary> {
    const results: DriftCheckResult[] = [];

    for (const template of templates.filter(t => t.is_active)) {
      const templateResults = await this.checkTemplate(
        template, definitions, values, assignments, siteGroups
      );
      results.push(...templateResults);
    }

    return {
      total: results.length,
      in_sync: results.filter(r => r.status === 'in_sync').length,
      drifted: results.filter(r => r.status === 'drifted').length,
      missing: results.filter(r => r.status === 'missing').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
      checked_at: new Date().toISOString(),
    };
  }

  /**
   * Check drift for one template at one scope (site group).
   */
  private async _checkSingleScope(
    template: GlobalElementTemplate,
    definitions: PersistedVariableDefinition[],
    values: VariableValue[],
    siteGroup: SiteGroup,
    assignment: TemplateAssignment
  ): Promise<DriftCheckResult> {
    const checkedAt = new Date().toISOString();
    const previousUrl = apiService.getBaseUrl();

    try {
      // 1. Re-resolve the template with current variables
      const context: ResolutionContext = {
        org_id: template.org_id,
        site_group_id: siteGroup.id,
        site_group_name: siteGroup.name,
      };
      const resolved = templateResolver.resolveTemplate(template, definitions, values, context);

      if (!resolved.is_fully_resolved) {
        return {
          template_id: template.id,
          template_name: template.name,
          element_type: template.element_type,
          scope_id: assignment.scope_id,
          scope_name: siteGroup.name,
          controller_url: siteGroup.controller_url,
          status: 'error',
          diffs: [],
          checked_at: checkedAt,
          error_message: `Unresolved tokens: ${resolved.unresolved_tokens.join(', ')}`,
        };
      }

      const expectedPayload = resolved.resolved_payload;

      // 2. Fetch live state from controller
      apiService.setBaseUrl(`${siteGroup.controller_url}/management`);
      const liveResource = await this._findLiveResource(
        template.element_type, expectedPayload
      );

      if (!liveResource) {
        return {
          template_id: template.id,
          template_name: template.name,
          element_type: template.element_type,
          scope_id: assignment.scope_id,
          scope_name: siteGroup.name,
          controller_url: siteGroup.controller_url,
          status: 'missing',
          diffs: [],
          checked_at: checkedAt,
          error_message: 'Resource not found on controller',
        };
      }

      // 3. Diff expected vs actual
      const diffs = this._diffPayloads(expectedPayload, liveResource);

      const status: DriftStatus = diffs.length === 0 ? 'in_sync' : 'drifted';

      return {
        template_id: template.id,
        template_name: template.name,
        element_type: template.element_type,
        scope_id: assignment.scope_id,
        scope_name: siteGroup.name,
        controller_url: siteGroup.controller_url,
        status,
        diffs,
        checked_at: checkedAt,
      };
    } catch (err) {
      return {
        template_id: template.id,
        template_name: template.name,
        element_type: template.element_type,
        scope_id: assignment.scope_id,
        scope_name: siteGroup.name,
        controller_url: siteGroup.controller_url,
        status: 'error',
        diffs: [],
        checked_at: checkedAt,
        error_message: err instanceof Error ? err.message : String(err),
      };
    } finally {
      apiService.setBaseUrl(previousUrl === '/api/management' ? null : previousUrl);
    }
  }

  /**
   * Find the matching live resource by name field.
   */
  private async _findLiveResource(
    elementType: GlobalElementType,
    expectedPayload: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    const fetchFn = FETCH_METHODS[elementType];
    if (!fetchFn) return null;

    const nameField = NAME_FIELDS[elementType];
    const expectedName = expectedPayload[nameField];
    if (!expectedName) return null;

    try {
      const resources = await fetchFn();
      return (resources as Record<string, unknown>[]).find(
        r => r[nameField] === expectedName || r.name === expectedName
      ) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Diff two payloads, returning field-level differences.
   * Only compares fields present in the expected payload (template-defined fields).
   */
  private _diffPayloads(
    expected: Record<string, unknown>,
    actual: Record<string, unknown>
  ): FieldDiff[] {
    const diffs: FieldDiff[] = [];
    this._diffRecursive(expected, actual, '', diffs);
    return diffs;
  }

  private _diffRecursive(
    expected: unknown,
    actual: unknown,
    path: string,
    diffs: FieldDiff[]
  ): void {
    if (expected === actual) return;

    // Normalize number/string comparisons (API may return "1" vs 1)
    if (typeof expected === 'number' && typeof actual === 'string') {
      if (expected === Number(actual)) return;
    }
    if (typeof expected === 'string' && typeof actual === 'number') {
      if (Number(expected) === actual) return;
    }

    if (
      expected !== null && actual !== null &&
      typeof expected === 'object' && typeof actual === 'object' &&
      !Array.isArray(expected) && !Array.isArray(actual)
    ) {
      // Compare object fields (only fields defined in expected)
      const expectedObj = expected as Record<string, unknown>;
      const actualObj = actual as Record<string, unknown>;
      for (const key of Object.keys(expectedObj)) {
        if (IGNORE_FIELDS.has(key)) continue;
        const childPath = path ? `${path}.${key}` : key;
        this._diffRecursive(expectedObj[key], actualObj[key], childPath, diffs);
      }
      return;
    }

    if (Array.isArray(expected) && Array.isArray(actual)) {
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        diffs.push({ path: path || '(root)', expected, actual });
      }
      return;
    }

    // Primitive mismatch or type mismatch
    diffs.push({ path: path || '(root)', expected, actual });
  }
}

export const driftDetectionService = new DriftDetectionServiceClass();
