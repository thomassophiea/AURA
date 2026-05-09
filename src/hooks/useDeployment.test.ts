import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const deploymentMock = vi.hoisted((): { deploymentService: any } => ({
  deploymentService: {
    deployTemplate: vi.fn(),
    saveRecord: vi.fn(),
    getHistory: vi.fn(),
  },
}));

vi.mock('../services/deploymentService', () => deploymentMock);

beforeEach(() => {
  deploymentMock.deploymentService.deployTemplate.mockReset();
  deploymentMock.deploymentService.saveRecord.mockReset();
  deploymentMock.deploymentService.getHistory.mockReset();
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { useDeployTemplate, useDeploymentHistory } from './useDeployment';

const baseTemplate = {
  id: 't-1',
  name: 'My Template',
  element_type: 'service',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const baseSiteGroup = {
  id: 'sg-1',
  name: 'HQ',
  controller_url: 'https://controller.local',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const baseContext = {
  org_id: 'org-1',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('useDeployTemplate', () => {
  it('initial state: not deploying, no result, no error', () => {
    const { result } = renderHook(() => useDeployTemplate());
    expect(result.current.isDeploying).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('successful deploy: stores the result + clears error', async () => {
    const deployResult = {
      status: 'success' as const,
      scope_type: 'site_group',
      scope_id: 'sg-1',
      scope_name: 'HQ',
      response_data: {},
      completed_at: '2026-05-09T00:00:00Z',
    };
    deploymentMock.deploymentService.deployTemplate.mockResolvedValue(deployResult);
    deploymentMock.deploymentService.saveRecord.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeployTemplate());
    await act(async () => {
      await result.current.deploy(baseTemplate, [], [], baseContext, baseSiteGroup, 'org-1');
    });
    expect(result.current.result).toEqual(deployResult);
    expect(result.current.error).toBeNull();
    expect(result.current.isDeploying).toBe(false);
  });

  it('saves a deployment record after a successful deploy', async () => {
    deploymentMock.deploymentService.deployTemplate.mockResolvedValue({
      status: 'success' as const,
      scope_type: 'site_group',
      scope_id: 'sg-1',
      scope_name: 'HQ',
      response_data: {},
      completed_at: '2026-05-09T00:00:00Z',
    });
    deploymentMock.deploymentService.saveRecord.mockResolvedValue(undefined);
    localStorage.setItem('user_email', 'me@example.com');

    const { result } = renderHook(() => useDeployTemplate());
    await act(async () => {
      await result.current.deploy(baseTemplate, [], [], baseContext, baseSiteGroup, 'org-1');
    });
    expect(deploymentMock.deploymentService.saveRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        template_id: 't-1',
        org_id: 'org-1',
        deployed_by: 'me@example.com',
      })
    );
  });

  it('failed deploy result sets error message', async () => {
    deploymentMock.deploymentService.deployTemplate.mockResolvedValue({
      status: 'failed' as const,
      scope_type: 'site_group',
      scope_id: 'sg-1',
      scope_name: 'HQ',
      error_message: 'Controller offline',
      response_data: {},
      completed_at: '2026-05-09T00:00:00Z',
    });
    deploymentMock.deploymentService.saveRecord.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeployTemplate());
    await act(async () => {
      await result.current.deploy(baseTemplate, [], [], baseContext, baseSiteGroup, 'org-1');
    });
    expect(result.current.error).toBe('Controller offline');
  });

  it('failed deploy with no error_message uses the fallback message', async () => {
    deploymentMock.deploymentService.deployTemplate.mockResolvedValue({
      status: 'failed' as const,
      scope_type: 'site_group',
      scope_id: 'sg-1',
      scope_name: 'HQ',
      response_data: {},
      completed_at: '2026-05-09T00:00:00Z',
    });
    deploymentMock.deploymentService.saveRecord.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeployTemplate());
    await act(async () => {
      await result.current.deploy(baseTemplate, [], [], baseContext, baseSiteGroup, 'org-1');
    });
    expect(result.current.error).toBe('Deployment failed');
  });

  it('thrown error: sets error string and re-throws', async () => {
    deploymentMock.deploymentService.deployTemplate.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useDeployTemplate());
    await act(async () => {
      await expect(
        result.current.deploy(baseTemplate, [], [], baseContext, baseSiteGroup, 'org-1')
      ).rejects.toThrow('boom');
    });
    expect(result.current.error).toBe('boom');
    expect(result.current.isDeploying).toBe(false);
  });
});

describe('useDeploymentHistory', () => {
  it('initial state: empty records, not loading', async () => {
    deploymentMock.deploymentService.getHistory.mockResolvedValue([]);
    const { result } = renderHook(() => useDeploymentHistory('org-1'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.records).toEqual([]);
  });

  it('loads history records when orgId is provided', async () => {
    const records = [
      { id: 'r-1', template_name: 'A' },
      { id: 'r-2', template_name: 'B' },
    ];
    deploymentMock.deploymentService.getHistory.mockResolvedValue(records);
    const { result } = renderHook(() => useDeploymentHistory('org-1'));
    await waitFor(() => {
      expect(result.current.records.length).toBe(2);
    });
    expect(deploymentMock.deploymentService.getHistory).toHaveBeenCalledWith('org-1');
  });

  it('does NOT call getHistory when orgId is undefined', async () => {
    const { result } = renderHook(() => useDeploymentHistory(undefined));
    // Allow effect to run
    await act(async () => {
      await Promise.resolve();
    });
    expect(deploymentMock.deploymentService.getHistory).not.toHaveBeenCalled();
    expect(result.current.records).toEqual([]);
  });

  it('refresh() re-fetches the list', async () => {
    deploymentMock.deploymentService.getHistory.mockResolvedValueOnce([{ id: '1' }]);
    deploymentMock.deploymentService.getHistory.mockResolvedValueOnce([{ id: '1' }, { id: '2' }]);
    const { result } = renderHook(() => useDeploymentHistory('org-1'));
    await waitFor(() => {
      expect(result.current.records.length).toBe(1);
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.records.length).toBe(2);
  });

  it('silently swallows errors from getHistory', async () => {
    deploymentMock.deploymentService.getHistory.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useDeploymentHistory('org-1'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.records).toEqual([]);
  });
});
