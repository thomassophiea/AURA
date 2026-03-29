/**
 * React hooks for the Global Elements framework.
 *
 * Wraps globalElementsService and templateResolver with React state,
 * loading/error management, and automatic refresh on context changes.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { globalElementsService } from '../services/globalElementsService';
import { templateResolver } from '../services/templateResolver';
import type {
  GlobalElementTemplate,
  GlobalElementType,
  PersistedVariableDefinition,
  VariableValue,
  ResolvedTemplate,
  ResolutionContext,
  TemplateAssignment,
} from '../types/globalElements';
import type { VariableScope } from '../types/siteVariables';

// ---------------------------------------------------------------------------
// useTemplates
// ---------------------------------------------------------------------------

export function useTemplates(orgId: string | undefined, elementType?: GlobalElementType) {
  const [templates, setTemplates] = useState<GlobalElementTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await globalElementsService.getTemplates(orgId, elementType);
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [orgId, elementType]);

  useEffect(() => { refresh(); }, [refresh]);

  const createTemplate = useCallback(
    async (template: Omit<GlobalElementTemplate, 'id' | 'created_at' | 'updated_at' | 'version'>) => {
      const created = await globalElementsService.createTemplate(template);
      await refresh();
      return created;
    },
    [refresh]
  );

  const updateTemplate = useCallback(
    async (id: string, updates: Partial<GlobalElementTemplate>) => {
      const updated = await globalElementsService.updateTemplate(id, updates);
      await refresh();
      return updated;
    },
    [refresh]
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      await globalElementsService.deleteTemplate(id);
      await refresh();
    },
    [refresh]
  );

  const duplicateTemplate = useCallback(
    async (id: string, newName: string) => {
      const dup = await globalElementsService.duplicateTemplate(id, newName);
      await refresh();
      return dup;
    },
    [refresh]
  );

  return { templates, loading, error, refresh, createTemplate, updateTemplate, deleteTemplate, duplicateTemplate };
}

// ---------------------------------------------------------------------------
// useVariableDefinitions
// ---------------------------------------------------------------------------

export function useVariableDefinitions(orgId: string | undefined) {
  const [definitions, setDefinitions] = useState<PersistedVariableDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await globalElementsService.getVariableDefinitions(orgId);
      setDefinitions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load variable definitions');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { refresh(); }, [refresh]);

  const createDefinition = useCallback(
    async (def: Omit<PersistedVariableDefinition, 'id' | 'created_at' | 'updated_at'>) => {
      const created = await globalElementsService.createVariableDefinition(def);
      await refresh();
      return created;
    },
    [refresh]
  );

  const updateDefinition = useCallback(
    async (id: string, updates: Partial<PersistedVariableDefinition>) => {
      const updated = await globalElementsService.updateVariableDefinition(id, updates);
      await refresh();
      return updated;
    },
    [refresh]
  );

  const deleteDefinition = useCallback(
    async (id: string) => {
      await globalElementsService.deleteVariableDefinition(id);
      await refresh();
    },
    [refresh]
  );

  return { definitions, loading, error, refresh, createDefinition, updateDefinition, deleteDefinition };
}

// ---------------------------------------------------------------------------
// useVariableValues
// ---------------------------------------------------------------------------

export function useVariableValues(
  orgId: string | undefined,
  scopeType?: VariableScope,
  scopeId?: string
) {
  const [values, setValues] = useState<VariableValue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await globalElementsService.getVariableValues(orgId, scopeType, scopeId);
      setValues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load variable values');
    } finally {
      setLoading(false);
    }
  }, [orgId, scopeType, scopeId]);

  useEffect(() => { refresh(); }, [refresh]);

  const setValue = useCallback(
    async (value: Omit<VariableValue, 'id' | 'updated_at'>) => {
      const saved = await globalElementsService.setVariableValue(value);
      await refresh();
      return saved;
    },
    [refresh]
  );

  const deleteValue = useCallback(
    async (id: string) => {
      await globalElementsService.deleteVariableValue(id);
      await refresh();
    },
    [refresh]
  );

  const bulkSetValues = useCallback(
    async (vals: Omit<VariableValue, 'id' | 'updated_at'>[]) => {
      await globalElementsService.bulkSetVariableValues(vals);
      await refresh();
    },
    [refresh]
  );

  return { values, loading, error, refresh, setValue, deleteValue, bulkSetValues };
}

// ---------------------------------------------------------------------------
// useTemplateAssignments
// ---------------------------------------------------------------------------

export function useTemplateAssignments(orgId: string | undefined) {
  const [assignments, setAssignments] = useState<(TemplateAssignment & { template_name?: string; element_type?: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await globalElementsService.getAssignmentsByOrg(orgId);
      setAssignments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { refresh(); }, [refresh]);

  const assign = useCallback(
    async (assignment: Omit<TemplateAssignment, 'id' | 'created_at'>) => {
      const created = await globalElementsService.assignTemplate(assignment);
      await refresh();
      return created;
    },
    [refresh]
  );

  const unassign = useCallback(
    async (assignmentId: string) => {
      await globalElementsService.unassignTemplate(assignmentId);
      await refresh();
    },
    [refresh]
  );

  const toggleActive = useCallback(
    async (assignmentId: string, isActive: boolean) => {
      // Re-upsert with toggled is_active
      const existing = assignments.find(a => a.id === assignmentId);
      if (!existing) return;
      await globalElementsService.assignTemplate({
        template_id: existing.template_id,
        scope_type: existing.scope_type,
        scope_id: existing.scope_id,
        is_active: isActive,
      });
      await refresh();
    },
    [assignments, refresh]
  );

  return { assignments, loading, error, refresh, assign, unassign, toggleActive };
}

// ---------------------------------------------------------------------------
// useResolvedTemplate
// ---------------------------------------------------------------------------

export function useResolvedTemplate(
  template: GlobalElementTemplate | null,
  definitions: PersistedVariableDefinition[],
  values: VariableValue[],
  context: ResolutionContext | null
) {
  const [resolved, setResolved] = useState<ResolvedTemplate | null>(null);

  // Use a ref to avoid re-triggering on every array reference change
  const defsRef = useRef(definitions);
  const valsRef = useRef(values);
  defsRef.current = definitions;
  valsRef.current = values;

  useEffect(() => {
    if (!template || !context) {
      setResolved(null);
      return;
    }

    const result = templateResolver.resolveTemplate(
      template,
      defsRef.current,
      valsRef.current,
      context
    );
    setResolved(result);
  }, [template, context, definitions, values]);

  return resolved;
}
