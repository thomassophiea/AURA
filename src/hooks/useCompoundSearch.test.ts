import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCompoundSearch } from './useCompoundSearch';

describe('useCompoundSearch Hook', () => {
  const mockItems = [
    { id: '1', name: 'Access Point 1', status: 'online' },
    { id: '2', name: 'Access Point 2', status: 'offline' },
    { id: '3', name: 'Device 1', status: 'online' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('search functionality', () => {
    it('should filter items by name', () => {
      const { result } = renderHook(() => useCompoundSearch(mockItems, ['name']));
      
      act(() => {
        result.current.search('Access Point');
      });

      expect(result.current.results).toHaveLength(2);
    });

    it('should perform case-insensitive search', () => {
      const { result } = renderHook(() => useCompoundSearch(mockItems, ['name']));
      
      act(() => {
        result.current.search('access point');
      });

      expect(result.current.results.length).toBeGreaterThan(0);
    });

    it('should reset search results', () => {
      const { result } = renderHook(() => useCompoundSearch(mockItems, ['name']));
      
      act(() => {
        result.current.search('test');
      });
      
      act(() => {
        result.current.reset();
      });

      expect(result.current.results).toEqual(mockItems);
    });

    it('should return empty array for no matches', () => {
      const { result } = renderHook(() => useCompoundSearch(mockItems, ['name']));
      
      act(() => {
        result.current.search('nonexistent');
      });

      expect(result.current.results).toHaveLength(0);
    });
  });

  describe('multi-field search', () => {
    it('should search across multiple fields', () => {
      const { result } = renderHook(() => useCompoundSearch(mockItems, ['name', 'status']));
      
      act(() => {
        result.current.search('online');
      });

      expect(result.current.results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('advanced filters', () => {
    it('should apply custom filter predicate', () => {
      const { result } = renderHook(() => 
        useCompoundSearch(mockItems, ['name'], {
          customFilter: (item) => item.status === 'online'
        })
      );
      
      act(() => {
        result.current.search('');
      });

      expect(result.current.results.every((item: any) => item.status === 'online')).toBe(true);
    });
  });
});
