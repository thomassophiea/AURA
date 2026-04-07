/**
 * useCompoundSearch — tokenized AND search with field config and session persistence.
 *
 * Splits the query into whitespace-separated tokens. A row matches only if
 * every token appears in at least one of the configured fields (AND behavior).
 * Case-insensitive, trims whitespace, handles multiple spaces.
 *
 * State is persisted to sessionStorage so it survives in-app navigation.
 */

import { useState, useMemo, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CompoundSearchConfig<T> {
  /** Unique key for sessionStorage persistence (e.g. 'ap-search', 'client-search') */
  storageKey: string;
  /** Functions that extract searchable string values from a row */
  fields: ((item: T) => string | undefined | null)[];
}

export interface CompoundSearchResult<T> {
  query: string;
  setQuery: (q: string) => void;
  filterRows: (rows: T[]) => T[];
  clearSearch: () => void;
  hasActiveSearch: boolean;
  tokens: string[];
}

// ── Tokenizer ──────────────────────────────────────────────────────────────

function tokenize(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useCompoundSearch<T>(config: CompoundSearchConfig<T>): CompoundSearchResult<T> {
  const { storageKey, fields } = config;

  const [query, setQueryState] = useState<string>(() => {
    try {
      return sessionStorage.getItem(storageKey) || '';
    } catch {
      return '';
    }
  });

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    try {
      sessionStorage.setItem(storageKey, q);
    } catch { /* quota exceeded or unavailable */ }
  }, [storageKey]);

  const clearSearch = useCallback(() => {
    setQuery('');
  }, [setQuery]);

  const tokens = useMemo(() => tokenize(query), [query]);
  const hasActiveSearch = tokens.length > 0;

  const filterRows = useCallback((rows: T[]): T[] => {
    if (!hasActiveSearch) return rows;

    return rows.filter(row => {
      // Build a single searchable string from all field extractors
      const haystack = fields
        .map(fn => fn(row) || '')
        .join(' ')
        .toLowerCase();

      // Every token must appear somewhere in the haystack
      return tokens.every(token => haystack.includes(token));
    });
  }, [tokens, hasActiveSearch, fields]);

  return { query, setQuery, filterRows, clearSearch, hasActiveSearch, tokens };
}
