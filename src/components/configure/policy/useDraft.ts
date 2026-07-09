/**
 * Local draft-form hook for Policy editors: deep-cloned initial state, dot-path
 * updates (upd('cosQos.priority', v)), and a dirty flag that gates Save.
 * Editors remount per record via a React key, so no reset plumbing is needed.
 */
import { useCallback, useState } from 'react';
import { setIn } from './policyUtils';

export function useDraft<T extends object>(initial: T) {
  const [form, setForm] = useState<T>(() => structuredClone(initial));
  const [dirty, setDirty] = useState(false);

  const upd = useCallback((path: string, value: unknown) => {
    setForm((prev) => setIn(prev, path, value));
    setDirty(true);
  }, []);

  /** Replace the whole draft (bulk operations like "use existing settings"). */
  const replace = useCallback((next: T) => {
    setForm(structuredClone(next));
    setDirty(true);
  }, []);

  return { form, upd, replace, dirty };
}
