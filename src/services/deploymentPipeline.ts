/**
 * Deployment Pipeline Service
 *
 * Orchestrates batch deployment of a template across multiple scopes.
 * Resolves per-target, validates, and deploys sequentially.
 */

import { deploymentService } from './deploymentService';
import { templateResolver } from './templateResolver';
import type {
  GlobalElementTemplate,
  PersistedVariableDefinition,
  VariableValue,
  ResolutionContext,
} from '../types/globalElements';
import type {
  DeploymentTarget,
  DeploymentResult,
  PipelineOptions,
  PipelineProgress,
  PipelineResult,
} from '../types/deployment';

class DeploymentPipelineService {
  private _cancelled = false;

  /**
   * Execute a deployment pipeline across multiple targets.
   */
  async executePipeline(
    template: GlobalElementTemplate,
    definitions: PersistedVariableDefinition[],
    values: VariableValue[],
    targets: DeploymentTarget[],
    options: PipelineOptions,
    onProgress?: (progress: PipelineProgress) => void
  ): Promise<PipelineResult> {
    this._cancelled = false;
    const pipelineId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const results: DeploymentResult[] = [];
    let skipRemaining = false;

    for (let i = 0; i < targets.length; i++) {
      if (this._cancelled || skipRemaining) {
        results.push(this._skippedResult(template, targets[i], 'Pipeline cancelled or stopped'));
        continue;
      }

      const target = targets[i];

      // Emit progress
      onProgress?.({
        completed: i,
        total: targets.length,
        current_target: target,
        results: [...results],
      });

      // Build resolution context for this target
      const context: ResolutionContext = {
        org_id: template.org_id,
        site_group_id: target.site_group.id,
        site_group_name: target.site_group.name,
        site_id: target.scope_type === 'site' ? target.scope_id : undefined,
        site_name: target.scope_type === 'site' ? target.scope_name : undefined,
      };

      if (options.dry_run) {
        // Dry run: resolve and validate only
        const resolved = templateResolver.resolveTemplate(template, definitions, values, context);
        const validation = templateResolver.validateResolution(resolved, definitions);

        results.push({
          template_id: template.id,
          template_name: template.name,
          element_type: template.element_type,
          scope_type: target.scope_type,
          scope_id: target.scope_id,
          scope_name: target.scope_name,
          status: resolved.is_fully_resolved && validation.valid ? 'success' : 'failed',
          controller_url: target.site_group.controller_url,
          error_message: !resolved.is_fully_resolved
            ? `Unresolved: ${resolved.unresolved_tokens.join(', ')}`
            : !validation.valid
            ? validation.errors.join('; ')
            : undefined,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });
      } else {
        // Real deployment
        const result = await deploymentService.deployTemplate(
          template, definitions, values, context, target.site_group
        );
        results.push(result);

        // Save to history
        await deploymentService.saveRecord({
          org_id: template.org_id,
          template_id: template.id,
          template_name: template.name,
          element_type: template.element_type,
          scope_type: result.scope_type,
          scope_id: result.scope_id,
          scope_name: result.scope_name,
          status: result.status,
          result_payload: result.response_data,
          error_message: result.error_message,
          deployed_by: localStorage.getItem('user_email') ?? undefined,
          deployed_at: result.completed_at,
        });

        if (result.status === 'failed' && options.stop_on_failure) {
          skipRemaining = true;
        }
      }
    }

    // Final progress
    onProgress?.({
      completed: targets.length,
      total: targets.length,
      current_target: null,
      results,
    });

    const completedAt = new Date().toISOString();

    return {
      pipeline_id: pipelineId,
      template_id: template.id,
      template_name: template.name,
      started_at: startedAt,
      completed_at: completedAt,
      total_targets: targets.length,
      succeeded: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      results,
    };
  }

  cancel() {
    this._cancelled = true;
  }

  private _skippedResult(
    template: GlobalElementTemplate,
    target: DeploymentTarget,
    reason: string
  ): DeploymentResult {
    const now = new Date().toISOString();
    return {
      template_id: template.id,
      template_name: template.name,
      element_type: template.element_type,
      scope_type: target.scope_type,
      scope_id: target.scope_id,
      scope_name: target.scope_name,
      status: 'skipped',
      controller_url: target.site_group.controller_url,
      error_message: reason,
      started_at: now,
      completed_at: now,
    };
  }
}

export const deploymentPipeline = new DeploymentPipelineService();
