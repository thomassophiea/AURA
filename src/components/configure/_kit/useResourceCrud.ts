/**
 * List/save/delete state machine over a Configure resource service.
 * House conventions: sonner toasts, manual reload after mutation (no
 * optimistic updates), errors surfaced via errorHandler's friendly messages.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getUserFriendlyMessage } from '../../../services/errorHandler';
import { ConfigureApiError } from '../../../services/configure';

export interface ResourceCrudService<T> {
  list(): Promise<T[]>;
  create(payload: Partial<T>): Promise<T>;
  update(id: string, payload: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface UseResourceCrudOptions<T> {
  /** Singular label for toasts, e.g. 'role', 'WLAN'. */
  resourceLabel: string;
  getId: (item: T) => string;
  /** Display name for toasts; falls back to the id. */
  getName?: (item: T) => string;
  /** Skip the initial auto-load (e.g. gated tabs). */
  autoLoad?: boolean;
}

function errorMessage(error: unknown): string {
  if (error instanceof ConfigureApiError && error.body) {
    // Controller validation bodies are usually short JSON or plain text.
    return error.body.length > 200 ? getUserFriendlyMessage(error) : error.body;
  }
  return getUserFriendlyMessage(error);
}

export function useResourceCrud<T>(
  service: ResourceCrudService<T>,
  options: UseResourceCrudOptions<T>
) {
  const { resourceLabel, getId, getName, autoLoad = true } = options;
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(autoLoad);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
      const data = await service.list();
      if (mountedRef.current) setItems(data);
    } catch (err) {
      const message = errorMessage(err);
      if (mountedRef.current) {
        setError(message);
        setItems([]);
      }
      toast.error(`Failed to load ${resourceLabel}s`, { description: message });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [service, resourceLabel]);

  useEffect(() => {
    if (autoLoad) void refresh();
  }, [autoLoad, refresh]);

  /** Create when `id` is absent, update when present. Returns the saved record or null. */
  const save = useCallback(
    async (payload: Partial<T>, id?: string): Promise<T | null> => {
      setSaving(true);
      try {
        const saved = id ? await service.update(id, payload) : await service.create(payload);
        const label = saved ? (getName?.(saved) ?? getId(saved)) : resourceLabel;
        toast.success(id ? `Updated ${resourceLabel} "${label}"` : `Created ${resourceLabel} "${label}"`);
        await refresh();
        return saved;
      } catch (err) {
        toast.error(`Failed to save ${resourceLabel}`, { description: errorMessage(err) });
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [service, resourceLabel, getId, getName, refresh]
  );

  const remove = useCallback(
    async (id: string, name?: string): Promise<boolean> => {
      setDeleting(true);
      try {
        await service.remove(id);
        toast.success(`Deleted ${resourceLabel} "${name ?? id}"`);
        await refresh();
        return true;
      } catch (err) {
        toast.error(`Failed to delete ${resourceLabel}`, { description: errorMessage(err) });
        return false;
      } finally {
        if (mountedRef.current) setDeleting(false);
      }
    },
    [service, resourceLabel, refresh]
  );

  return { items, loading, saving, deleting, error, refresh, save, remove };
}
