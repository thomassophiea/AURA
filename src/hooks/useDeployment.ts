/**
 * Deployment hooks for the Global Elements framework.
 */

import { useState, useCallback, useEffect } from 'react';
import { deploymentService } from '../services/deploymentService';
import type {
  GlobalElementTemplate,
  PersistedVariableDefinition,
  VariableValue,
  ResolutionContext,
} from '../types/globalElements';
import type { SiteGroup } from '../types/domain';
import type { DeploymentResult, DeploymentRecord } from '../types/deployment';

// ---------------------------------------------------------------------------
// useDeployTemplate — single deployment
// ---------------------------------------------------------------------------

export function useDeployTemplate() {
  const [isDeploying, setIsDeploying] = useState(false);
  const [result, setResult] = useState<DeploymentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deploy = useCallback(async (
    template: GlobalElementTemplate,
    definitions: PersistedVariableDefinition[],
    values: VariableValue[],
    context: ResolutionContext,
    siteGroup: SiteGroup,
    orgId: string
  ): Promise<DeploymentResult> => {
    setIsDeploying(true);
    setError(null);
    setResult(null);

    try {
      const deployResult = await deploymentService.deployTemplate(
        template, definitions, values, context, siteGroup
      );
      setResult(deployResult);

      // Save to history
      await deploymentService.saveRecord({
        org_id: orgId,
        template_id: template.id,
        template_name: template.name,
        element_type: template.element_type,
        scope_type: deployResult.scope_type,
        scope_id: deployResult.scope_id,
        scope_name: deployResult.scope_name,
        status: deployResult.status,
        result_payload: deployResult.response_data,
        error_message: deployResult.error_message,
        deployed_by: localStorage.getItem('user_email') ?? undefined,
        deployed_at: deployResult.completed_at,
      });

      if (deployResult.status === 'failed') {
        setError(deployResult.error_message ?? 'Deployment failed');
      }

      return deployResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deployment failed';
      setError(msg);
      throw err;
    } finally {
      setIsDeploying(false);
    }
  }, []);

  return { deploy, isDeploying, result, error };
}

// ---------------------------------------------------------------------------
// useDeploymentHistory
// ---------------------------------------------------------------------------

export function useDeploymentHistory(orgId: string | undefined) {
  const [records, setRecords] = useState<DeploymentRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await deploymentService.getHistory(orgId);
      setRecords(data);
    } catch {
      // Silent fail — history is non-critical
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { records, loading, refresh };
}
