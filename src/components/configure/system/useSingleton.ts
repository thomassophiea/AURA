/**
 * GET/PUT state machine for the Configure singleton settings documents
 * (accesscontrol, snmp, globalsettings). The kit's useResourceCrud is
 * list-oriented; singleton services expose only get()/update(payload), so this
 * hook fills the gap with the same sonner + errorHandler conventions.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getUserFriendlyMessage } from '../../../services/errorHandler';
import { ConfigureApiError } from '../../../services/configure';

export interface SingletonService<T> {
  get(): Promise<T>;
  update(payload: T): Promise<T>;
}

function errorMessage(error: unknown): string {
  if (error instanceof ConfigureApiError && error.body) {
    return error.body.length > 200 ? getUserFriendlyMessage(error) : error.body;
  }
  return getUserFriendlyMessage(error);
}

export function useSingleton<T>(service: SingletonService<T>, resourceLabel: string) {
  const [record, setRecord] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await service.get();
      if (mountedRef.current) setRecord(data);
    } catch (err) {
      const message = errorMessage(err);
      if (mountedRef.current) {
        setError(message);
        setRecord(null);
      }
      toast.error(`Failed to load ${resourceLabel}`, { description: message });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [service, resourceLabel]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (payload: T): Promise<T | null> => {
      setSaving(true);
      try {
        const saved = await service.update(payload);
        // Some controllers answer PUT with 204/empty; keep the sent payload then.
        const next = saved ?? payload;
        if (mountedRef.current) setRecord(next);
        toast.success(`Saved ${resourceLabel}`);
        return next;
      } catch (err) {
        toast.error(`Failed to save ${resourceLabel}`, { description: errorMessage(err) });
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [service, resourceLabel]
  );

  return { record, loading, saving, error, refresh, save };
}
