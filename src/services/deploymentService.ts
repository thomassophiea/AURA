/**
 * Deployment Service
 *
 * Deploys resolved templates to controllers by mapping element types
 * to the correct apiService CRUD methods. Handles create-vs-update
 * detection and controller URL switching.
 */

import { apiService } from './api';
import { supabase } from './supabaseClient';
import { templateResolver } from './templateResolver';
import type {
  GlobalElementTemplate,
  GlobalElementType,
  PersistedVariableDefinition,
  VariableValue,
  ResolvedTemplate,
  ResolutionContext,
} from '../types/globalElements';
import type { SiteGroup } from '../types/domain';
import type { DeploymentResult, DeploymentRecord, DeploymentStatus } from '../types/deployment';

// Name fields used to detect existing resources per element type
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

// Fetch methods to get existing resources for create-vs-update detection
const FETCH_METHODS: Record<GlobalElementType, (() => Promise<unknown[]>) | null> = {
  service: () => apiService.getServices(),
  topology: () => apiService.getTopologies(),
  role: () => apiService.getRoles(),
  aaa_policy: () => apiService.getAaaPolicies(),
  cos_profile: () => apiService.getCoSProfiles(),
  rate_limiter: async () => [], // No list method available; always create
  ap_profile: () => apiService.getProfiles(),
  rf_policy: () => apiService.getRFManagementProfiles(),
};

class DeploymentServiceClass {
  // Serialize deployments to avoid concurrent setBaseUrl conflicts
  private _queue: Promise<void> = Promise.resolve();

  /**
   * Deploy a single resolved template to a controller.
   */
  async deployTemplate(
    template: GlobalElementTemplate,
    definitions: PersistedVariableDefinition[],
    values: VariableValue[],
    context: ResolutionContext,
    siteGroup: SiteGroup
  ): Promise<DeploymentResult> {
    const startedAt = new Date().toISOString();

    // Resolve the template
    const resolved = templateResolver.resolveTemplate(template, definitions, values, context);
    const validation = templateResolver.validateResolution(resolved, definitions);

    if (!resolved.is_fully_resolved) {
      return this._failResult(template, context, siteGroup, startedAt,
        `Unresolved tokens: ${resolved.unresolved_tokens.map(t => `{{${t}}}`).join(', ')}`);
    }

    if (!validation.valid) {
      return this._failResult(template, context, siteGroup, startedAt,
        `Validation errors: ${validation.errors.join('; ')}`);
    }

    // Enqueue to serialize controller switching
    return new Promise<DeploymentResult>((resolve) => {
      this._queue = this._queue.then(async () => {
        resolve(await this._executeDeploy(template, resolved, siteGroup, startedAt));
      }).catch(() => {
        resolve(this._failResult(template, context, siteGroup, startedAt, 'Deployment queue error'));
      });
    });
  }

  private async _executeDeploy(
    template: GlobalElementTemplate,
    resolved: ResolvedTemplate,
    siteGroup: SiteGroup,
    startedAt: string
  ): Promise<DeploymentResult> {
    const previousUrl = apiService.getBaseUrl();
    const payload = resolved.resolved_payload;

    try {
      // Switch to target controller
      apiService.setBaseUrl(siteGroup.controller_url);

      // Detect create vs update
      const existingId = await this._findExistingId(template.element_type, payload);

      let responseData: unknown;
      if (existingId) {
        responseData = await this._callUpdate(template.element_type, existingId, payload);
      } else {
        responseData = await this._callCreate(template.element_type, payload);
      }

      const result: DeploymentResult = {
        template_id: template.id,
        template_name: template.name,
        element_type: template.element_type,
        scope_type: resolved.context.site_group_id ? (resolved.context.site_id ? 'site' : 'site_group') : 'organization',
        scope_id: resolved.context.site_id ?? resolved.context.site_group_id ?? resolved.context.org_id,
        scope_name: resolved.context.site_name ?? resolved.context.site_group_name ?? resolved.context.org_name ?? '',
        status: 'success',
        controller_url: siteGroup.controller_url,
        response_data: responseData,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      };

      return result;
    } catch (err) {
      return {
        template_id: template.id,
        template_name: template.name,
        element_type: template.element_type,
        scope_type: resolved.context.site_group_id ? 'site_group' : 'organization',
        scope_id: resolved.context.site_group_id ?? resolved.context.org_id,
        scope_name: resolved.context.site_group_name ?? resolved.context.org_name ?? '',
        status: 'failed',
        controller_url: siteGroup.controller_url,
        error_message: err instanceof Error ? err.message : String(err),
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      };
    } finally {
      // Restore previous URL
      apiService.setBaseUrl(previousUrl === '/api/management' ? null : previousUrl);
    }
  }

  /**
   * Check if a resource with the same name already exists on the controller.
   */
  private async _findExistingId(
    elementType: GlobalElementType,
    payload: Record<string, unknown>
  ): Promise<string | null> {
    const fetchFn = FETCH_METHODS[elementType];
    if (!fetchFn) return null;

    const nameField = NAME_FIELDS[elementType];
    const name = payload[nameField];
    if (!name) return null;

    try {
      const existing = await fetchFn();
      const match = (existing as Record<string, unknown>[]).find(
        (item) => item[nameField] === name || item.name === name
      );
      return match ? String(match.id ?? '') : null;
    } catch {
      return null; // Can't determine; will attempt create
    }
  }

  private async _callCreate(
    elementType: GlobalElementType,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    switch (elementType) {
      case 'service': return apiService.createService(payload);
      case 'topology': return apiService.createTopology(payload);
      case 'role': return apiService.createRole(payload);
      case 'aaa_policy': return apiService.createAAAPolicy(payload);
      case 'cos_profile': return apiService.createCoSProfile(payload);
      case 'rate_limiter': return apiService.createRateLimiter(payload);
      case 'rf_policy': return apiService.createRFManagementProfile(payload);
      case 'ap_profile': return apiService.createProfile(payload);
      default: throw new Error(`Unsupported element type: ${elementType}`);
    }
  }

  private async _callUpdate(
    elementType: GlobalElementType,
    id: string,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    switch (elementType) {
      case 'service': return apiService.updateService(id, payload);
      case 'topology': return apiService.updateTopology(id, payload);
      case 'role': return apiService.updateRole(id, payload);
      case 'aaa_policy': return apiService.updateAAAPolicy(id, payload);
      case 'cos_profile': return apiService.updateCoSProfile(id, payload);
      case 'rate_limiter': return apiService.updateRateLimiter(id, payload);
      case 'rf_policy': return apiService.updateRFManagementProfile(id, payload);
      case 'ap_profile': return apiService.updateProfile(id, payload);
      default: throw new Error(`Unsupported element type: ${elementType}`);
    }
  }

  private _failResult(
    template: GlobalElementTemplate,
    context: ResolutionContext,
    siteGroup: SiteGroup,
    startedAt: string,
    error: string
  ): DeploymentResult {
    return {
      template_id: template.id,
      template_name: template.name,
      element_type: template.element_type,
      scope_type: context.site_group_id ? 'site_group' : 'organization',
      scope_id: context.site_group_id ?? context.org_id,
      scope_name: context.site_group_name ?? context.org_name ?? '',
      status: 'failed',
      controller_url: siteGroup.controller_url,
      error_message: error,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  }

  // -----------------------------------------------------------------------
  // Deployment history
  // -----------------------------------------------------------------------

  async saveRecord(record: Omit<DeploymentRecord, 'id'>): Promise<void> {
    const { error } = await supabase
      .from('deployment_history')
      .insert(record);

    if (error) {
      console.error('[Deployment] Failed to save record:', error);
    }
  }

  async getHistory(orgId: string, limit = 50): Promise<DeploymentRecord[]> {
    const { data, error } = await supabase
      .from('deployment_history')
      .select('*')
      .eq('org_id', orgId)
      .order('deployed_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Deployment] Failed to fetch history:', error);
      return [];
    }
    return (data ?? []) as DeploymentRecord[];
  }
}

export const deploymentService = new DeploymentServiceClass();
