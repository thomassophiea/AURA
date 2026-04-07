/**
 * useDriftDetection — React hook for drift detection between
 * org-level templates and live controller state.
 */

import { useState, useCallback } from 'react';
import { driftDetectionService } from '../services/driftDetectionService';
import type {
  GlobalElementTemplate,
  PersistedVariableDefinition,
  VariableValue,
  TemplateAssignment,
} from '../types/globalElements';
import type { SiteGroup } from '../types/domain';
import type { DriftSummary, DriftCheckResult } from '../types/deployment';

interface UseDriftDetectionReturn {
  summary: DriftSummary | null;
  loading: boolean;
  error: string | null;
  /** Check drift for all active templates */
  checkAll: () => Promise<void>;
  /** Check drift for a single template */
  checkTemplate: (template: GlobalElementTemplate) => Promise<DriftCheckResult[]>;
}

export function useDriftDetection(
  templates: GlobalElementTemplate[],
  definitions: PersistedVariableDefinition[],
  values: VariableValue[],
  assignments: TemplateAssignment[],
  siteGroups: SiteGroup[]
): UseDriftDetectionReturn {
  const [summary, setSummary] = useState<DriftSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await driftDetectionService.checkAll(
        templates, definitions, values, assignments, siteGroups
      );
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Drift check failed');
    } finally {
      setLoading(false);
    }
  }, [templates, definitions, values, assignments, siteGroups]);

  const checkTemplate = useCallback(async (template: GlobalElementTemplate) => {
    setLoading(true);
    setError(null);
    try {
      const results = await driftDetectionService.checkTemplate(
        template, definitions, values, assignments, siteGroups
      );
      // Merge into existing summary
      setSummary(prev => {
        if (!prev) {
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
        // Replace results for this template, keep others
        const otherResults = prev.results.filter(r => r.template_id !== template.id);
        const allResults = [...otherResults, ...results];
        return {
          total: allResults.length,
          in_sync: allResults.filter(r => r.status === 'in_sync').length,
          drifted: allResults.filter(r => r.status === 'drifted').length,
          missing: allResults.filter(r => r.status === 'missing').length,
          errors: allResults.filter(r => r.status === 'error').length,
          results: allResults,
          checked_at: new Date().toISOString(),
        };
      });
      return results;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Drift check failed');
      return [];
    } finally {
      setLoading(false);
    }
  }, [definitions, values, assignments, siteGroups]);

  return { summary, loading, error, checkAll, checkTemplate };
}
