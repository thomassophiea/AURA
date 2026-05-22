import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { UltronContextProvider, useUltronContext } from './UltronContext';
import type { UltronPageContext } from '../types/ultron';

// Mock agentService singleton — expose all methods used by UltronContext
vi.mock('../services/agentService', () => ({
  agentService: {
    clearHistory: vi.fn(),
    getAuditHistory: vi.fn(() => []),
    getAPITimeline: vi.fn(() => []),
    parseIntent: vi.fn(() => Promise.resolve(null)),
    buildExecutionPlan: vi.fn(() =>
      Promise.resolve({
        id: 'plan-1',
        title: 'Test Plan',
        description: 'A plan',
        status: 'pending',
        steps: [],
        impactedObjects: [{ type: 'ap', id: 'ap-1', name: 'AP-1' }],
        createdAt: new Date(),
      })
    ),
    executeApprovedPlan: vi.fn(() =>
      Promise.resolve({ planId: 'plan-1', success: true, completedSteps: 0 })
    ),
    rejectPlan: vi.fn(),
    rollbackOperation: vi.fn(() => Promise.resolve()),
  },
}));

// Mock ultr0nApiClient
vi.mock('../services/ultr0nApiClient', () => ({
  createUltr0nSession: vi.fn(() => Promise.resolve({ sessionId: 'sess-1' })),
  sendUltr0nMessage: vi.fn(() =>
    Promise.resolve({
      id: 'agent-1',
      role: 'agent',
      content: 'Hello from Ultr0n',
      timestamp: new Date(),
    })
  ),
  queryUltr0nWireless: vi.fn(() => Promise.resolve(null)),
}));

// Mock AppContext — provide a minimal org object
vi.mock('./AppContext', () => ({
  useAppContext: () => ({
    organization: { id: 'org-1', name: 'Test Org' },
  }),
}));

const pageContext: Partial<UltronPageContext> = {
  route: '/test',
  pageName: 'Test',
  pageType: 'unknown',
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <UltronContextProvider pageContext={pageContext}>{children}</UltronContextProvider>;
}

describe('UltronContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provides default values on mount', () => {
    const { result } = renderHook(() => useUltronContext(), { wrapper });
    expect(result.current.messages).toEqual([]);
    expect(result.current.isThinking).toBe(false);
    expect(result.current.isOpen).toBe(false);
    expect(result.current.auditEntries).toEqual([]);
    expect(result.current.apiTimeline).toEqual([]);
    expect(result.current.pendingPlan).toBeNull();
    expect(result.current.sessionId).toBeNull();
  });

  it('openUltr0n sets isOpen to true', () => {
    const { result } = renderHook(() => useUltronContext(), { wrapper });

    act(() => {
      result.current.openUltr0n();
    });
    expect(result.current.isOpen).toBe(true);
  });

  it('closeUltr0n sets isOpen to false after opening', () => {
    const { result } = renderHook(() => useUltronContext(), { wrapper });

    act(() => {
      result.current.openUltr0n();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.closeUltr0n();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('toggleUltr0n flips isOpen state', () => {
    const { result } = renderHook(() => useUltronContext(), { wrapper });

    act(() => {
      result.current.toggleUltr0n();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.toggleUltr0n();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('addFeedback on non-existent id is a no-op', () => {
    const { result } = renderHook(() => useUltronContext(), { wrapper });

    expect(typeof result.current.addFeedback).toBe('function');
    act(() => {
      result.current.addFeedback('nonexistent', 'up');
    });
    expect(result.current.messages).toEqual([]);
  });

  it('toggleReasoning on non-existent id is a no-op', () => {
    const { result } = renderHook(() => useUltronContext(), { wrapper });

    expect(typeof result.current.toggleReasoning).toBe('function');
    act(() => {
      result.current.toggleReasoning('nonexistent');
    });
    expect(result.current.messages).toEqual([]);
  });

  it('clearConversation resets messages and pendingPlan', () => {
    const { result } = renderHook(() => useUltronContext(), { wrapper });

    act(() => {
      result.current.clearConversation();
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.pendingPlan).toBeNull();
  });

  it('rejectPlan is callable without crashing (no pending plan)', () => {
    const { result } = renderHook(() => useUltronContext(), { wrapper });
    expect(typeof result.current.rejectPlan).toBe('function');
    // rejectPlan calls agentService.rejectPlan which throws if plan not found
    // but the context catches nothing — test that it doesn't throw from React side
    act(() => {
      result.current.rejectPlan('plan-nonexistent');
    });
  });

  it('ultronContext merges pageContext with org data', () => {
    const { result } = renderHook(() => useUltronContext(), { wrapper });
    expect(result.current.ultronContext.route).toBe('/test');
    expect(result.current.ultronContext.pageName).toBe('Test');
    expect(result.current.ultronContext.pageType).toBe('unknown');
    expect(result.current.ultronContext.orgId).toBe('org-1');
    expect(result.current.ultronContext.orgName).toBe('Test Org');
  });

  it('setSelectedObject updates ultronContext.selectedObject', () => {
    const { result } = renderHook(() => useUltronContext(), { wrapper });
    const obj = { id: 'ap-42', name: 'AP-42' };

    act(() => {
      result.current.setSelectedObject(obj);
    });
    expect(result.current.ultronContext.selectedObject).toEqual(obj);
  });

  it('setSelectedRows updates ultronContext.selectedRows', () => {
    const { result } = renderHook(() => useUltronContext(), { wrapper });
    const rows = [{ id: 'row-1' }, { id: 'row-2' }];

    act(() => {
      result.current.setSelectedRows(rows);
    });
    expect(result.current.ultronContext.selectedRows).toEqual(rows);
  });

  it('resetUltronContext clears selectedObject and selectedRows', () => {
    const { result } = renderHook(() => useUltronContext(), { wrapper });

    act(() => {
      result.current.setSelectedObject({ id: 'some-obj' });
      result.current.setSelectedRows([{ id: 'r1' }]);
    });
    act(() => {
      result.current.resetUltronContext();
    });
    expect(result.current.ultronContext.selectedObject).toBeUndefined();
    expect(result.current.ultronContext.selectedRows).toEqual([]);
  });

  it('setWirelessContext updates wireless fields in ultronContext', () => {
    const { result } = renderHook(() => useUltronContext(), { wrapper });

    act(() => {
      result.current.setWirelessContext({
        clientMac: 'aa:bb:cc:dd:ee:ff',
        apSerial: 'SN-12345',
        apName: 'AP-Floor1',
        ssid: 'CorpWifi',
      });
    });
    expect(result.current.ultronContext.clientMac).toBe('aa:bb:cc:dd:ee:ff');
    expect(result.current.ultronContext.apSerial).toBe('SN-12345');
    expect(result.current.ultronContext.apName).toBe('AP-Floor1');
    expect(result.current.ultronContext.ssid).toBe('CorpWifi');
  });

  it('useUltronContext throws when used outside provider', () => {
    // renderHook without a wrapper — no provider
    expect(() => renderHook(() => useUltronContext())).toThrow(
      'useUltronContext must be used within UltronContextProvider'
    );
  });
});
