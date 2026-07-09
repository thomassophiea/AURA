/**
 * Draft-form state for the AP override editor: deep-cloned initial record,
 * dot-path get/set (e.g. `radios.0.dfsRevert`, `ftm.wgs84.latitude`) and a
 * dirty flag. Editors remount per record via a React key, so no reset is
 * needed. Mirrors the Policy suite's useDraft, kept local to the aps tree.
 */
import { useCallback, useState } from 'react';

/** Read a nested value by dot-path (array indices as numeric segments). */
export function getIn(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Immutably set a nested value by dot-path, cloning each touched level. */
export function setIn<T extends object>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const root: Record<string, unknown> = Array.isArray(obj)
    ? ([...(obj as unknown[])] as unknown as Record<string, unknown>)
    : { ...(obj as Record<string, unknown>) };
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const next = cur[keys[i]];
    cur[keys[i]] = Array.isArray(next)
      ? [...(next as unknown[])]
      : next && typeof next === 'object'
        ? { ...(next as object) }
        : {};
    cur = cur[keys[i]] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  return root as T;
}

export function useApDraft<T extends object>(initial: T) {
  const [form, setForm] = useState<T>(() => structuredClone(initial));
  const [dirty, setDirty] = useState(false);

  const upd = useCallback((path: string, value: unknown) => {
    setForm((prev) => setIn(prev, path, value));
    setDirty(true);
  }, []);

  /** Replace the whole draft (modal apply of a sub-document). */
  const replace = useCallback((next: T) => {
    setForm(structuredClone(next));
    setDirty(true);
  }, []);

  return { form, upd, replace, dirty };
}
