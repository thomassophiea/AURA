import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { CortexContextProvider, useCortexContext } from './CortexContext';
import type { CortexPageContext } from '../types/cortex';

// Mock agentService singleton — expose all methods used by CortexContext
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

// Mock cortexApiClient
vi.mock('../services/cortexApiClient', () => ({
  createCortexSession: vi.fn(() => Promise.resolve({ sessionId: 'sess-1' })),
  sendCortexMessage: vi.fn(() =>
    Promise.resolve({
      id: 'agent-1',
      role: 'agent',
      content: 'Hello from Cortex',
      timestamp: new Date(),
    })
  ),
  queryCortexWireless: vi.fn(() => Promise.resolve(null)),
}));

// Mock AppContext — provide a minimal org object
vi.mock('./AppContext', () => ({
  useAppContext: () => ({
    organization: { id: 'org-1', name: 'Test Org' },
  }),
}));

const pageContext: Partial<CortexPageContext> = {
  route: '/test',
  pageName: 'Test',
  pageType: 'unknown',
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <CortexContextProvider pageContext={pageContext}>{children}</CortexContextProvider>;
}

describe('CortexContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provides default values on mount', () => {
    const { result } = renderHook(() => useCortexContext(), { wrapper });
    expect(result.current.messages).toEqual([]);
    expect(result.current.isThinking).toBe(false);
    expect(result.current.isOpen).toBe(false);
    expect(result.current.auditEntries).toEqual([]);
    expect(result.current.apiTimeline).toEqual([]);
    expect(result.current.pendingPlan).toBeNull();
    expect(result.current.sessionId).toBeNull();
  });

  it('openCortex sets isOpen to true', () => {
    const { result } = renderHook(() => useCortexContext(), { wrapper });

    act(() => {
      result.current.openCortex();
    });
    expect(result.current.isOpen).toBe(true);
  });

  it('closeCortex sets isOpen to false after opening', () => {
    const { result } = renderHook(() => useCortexContext(), { wrapper });

    act(() => {
      result.current.openCortex();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.closeCortex();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('openCortex and closeCortex flip isOpen state', () => {
    const { result } = renderHook(() => useCortexContext(), { wrapper });

    act(() => {
      result.current.openCortex();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.closeCortex();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('addFeedback on non-existent id is a no-op', () => {
    const { result } = renderHook(() => useCortexContext(), { wrapper });

    expect(typeof result.current.addFeedback).toBe('function');
    act(() => {
      result.current.addFeedback('nonexistent', 'up');
    });
    expect(result.current.messages).toEqual([]);
  });

  it('toggleReasoning on non-existent id is a no-op', () => {
    const { result } = renderHook(() => useCortexContext(), { wrapper });

    expect(typeof result.current.toggleReasoning).toBe('function');
    act(() => {
      result.current.toggleReasoning('nonexistent');
    });
    expect(result.current.messages).toEqual([]);
  });

  it('clearConversation resets messages and pendingPlan', () => {
    const { result } = renderHook(() => useCortexContext(), { wrapper });

    act(() => {
      result.current.clearConversation();
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.pendingPlan).toBeNull();
  });

  it('rejectPlan is callable without crashing (no pending plan)', () => {
    const { result } = renderHook(() => useCortexContext(), { wrapper });
    expect(typeof result.current.rejectPlan).toBe('function');
    // rejectPlan calls agentService.rejectPlan which throws if plan not found
    // but the context catches nothing — test that it doesn't throw from React side
    act(() => {
      result.current.rejectPlan('plan-nonexistent');
    });
  });

  it('cortexContext merges pageContext with org data', () => {
    const { result } = renderHook(() => useCortexContext(), { wrapper });
    expect(result.current.cortexContext.route).toBe('/test');
    expect(result.current.cortexContext.pageName).toBe('Test');
    expect(result.current.cortexContext.pageType).toBe('unknown');
    expect(result.current.cortexContext.orgId).toBe('org-1');
    expect(result.current.cortexContext.orgName).toBe('Test Org');
  });

  it('setSelectedObject updates cortexContext.selectedObject', () => {
    const { result } = renderHook(() => useCortexContext(), { wrapper });
    const obj = { id: 'ap-42', name: 'AP-42' };

    act(() => {
      result.current.setSelectedObject(obj);
    });
    expect(result.current.cortexContext.selectedObject).toEqual(obj);
  });

  it('setSelectedRows updates cortexContext.selectedRows', () => {
    const { result } = renderHook(() => useCortexContext(), { wrapper });
    const rows = [{ id: 'row-1' }, { id: 'row-2' }];

    act(() => {
      result.current.setSelectedRows(rows);
    });
    expect(result.current.cortexContext.selectedRows).toEqual(rows);
  });

  it('resetCortexContext clears selectedObject and selectedRows', () => {
    const { result } = renderHook(() => useCortexContext(), { wrapper });

    act(() => {
      result.current.setSelectedObject({ id: 'some-obj' });
      result.current.setSelectedRows([{ id: 'r1' }]);
    });
    act(() => {
      result.current.resetCortexContext();
    });
    expect(result.current.cortexContext.selectedObject).toBeUndefined();
    expect(result.current.cortexContext.selectedRows).toEqual([]);
  });

  it('setWirelessContext updates wireless fields in cortexContext', () => {
    const { result } = renderHook(() => useCortexContext(), { wrapper });

    act(() => {
      result.current.setWirelessContext({
        clientMac: 'aa:bb:cc:dd:ee:ff',
        apSerial: 'SN-12345',
        apName: 'AP-Floor1',
        ssid: 'CorpWifi',
      });
    });
    expect(result.current.cortexContext.clientMac).toBe('aa:bb:cc:dd:ee:ff');
    expect(result.current.cortexContext.apSerial).toBe('SN-12345');
    expect(result.current.cortexContext.apName).toBe('AP-Floor1');
    expect(result.current.cortexContext.ssid).toBe('CorpWifi');
  });

  it('useCortexContext throws when used outside provider', () => {
    // renderHook without a wrapper — no provider
    expect(() => renderHook(() => useCortexContext())).toThrow(
      'useCortexContext must be used within CortexContextProvider'
    );
  });
});
