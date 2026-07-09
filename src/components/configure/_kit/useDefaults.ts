/**
 * Fetch-and-cache the controller's /default template for a resource so Add
 * forms are seeded with the controller's own new-object semantics instead of
 * hand-maintained constants.
 */
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getUserFriendlyMessage } from '../../../services/errorHandler';

export function useDefaults<T>(fetchDefault: () => Promise<T>, resourceLabel: string) {
  const [loading, setLoading] = useState(false);
  const seedRef = useRef<T | null>(null);

  /**
   * Resolve the default template (cached after first success). Returns null
   * on failure — callers should keep the Add form closed and rely on the
   * toast rather than opening an editor with a hollow record.
   */
  const load = useCallback(async (): Promise<T | null> => {
    if (seedRef.current !== null) {
      // Deep-clone so successive Add forms can't share mutated state.
      return structuredClone(seedRef.current);
    }
    setLoading(true);
    try {
      const seed = await fetchDefault();
      seedRef.current = seed;
      return structuredClone(seed);
    } catch (error) {
      toast.error(`Failed to load ${resourceLabel} defaults`, {
        description: getUserFriendlyMessage(error),
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchDefault, resourceLabel]);

  const reset = useCallback(() => {
    seedRef.current = null;
  }, []);

  return { load, loading, reset };
}
