/**
 * Tests for the XIQ migration service — locks in the behavior of the
 * skip-existing, retry, cancel, and conversion paths so future refactors
 * can't silently break them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the global apiService that xiqMigrationService.ts imports.
const mockMakeRequest = vi.fn();
const mockUpdateService = vi.fn();
vi.mock('../../services/api', () => ({
  apiService: {
    makeAuthenticatedRequest: mockMakeRequest,
    updateService: mockUpdateService,
  },
}));

// xiqService is referenced for token typing only, but we still mock to avoid side effects.
vi.mock('../../services/xiqService', () => ({
  xiqService: {
    getToken: vi.fn(),
    clearToken: vi.fn(),
    login: vi.fn(),
  },
  XIQ_REGION_LABELS: {} as Record<string, string>,
  XIQ_REGION_ORDER: [] as string[],
}));

const { convertToControllerFormat, executeMigration, fetchExistingServices } =
  await import('../../services/xiqMigrationService');
import type { XIQMigrationData, MigrationSelections } from '../../services/xiqMigrationService';

function makeData(): XIQMigrationData {
  return {
    ssids: [
      {
        id: 'ssid-1',
        name: 'corp-wifi',
        enabled: true,
        broadcast_ssid: true,
        vlan_id: 100,
        fast_roaming: true,
        security: {
          type: 'psk',
          psk: undefined,
          wpa_version: 'WPA2',
          pmf: 'optional',
          encryption: 'aes',
          key_management: 'WPA2-PSK',
        },
      },
      {
        id: 'ssid-2',
        name: 'GUEST',
        enabled: true,
        broadcast_ssid: true,
        vlan_id: 200,
        fast_roaming: false,
        security: {
          type: 'open',
          wpa_version: 'WPA2',
          pmf: 'disabled',
          encryption: 'none',
          key_management: '',
        },
      },
    ],
    vlans: [
      { id: 'v-1', name: 'Corp', vlan_id: 100, user_profile_name: 'corp', user_profile_id: 'up-1' },
      {
        id: 'v-2',
        name: 'Guest',
        vlan_id: 200,
        user_profile_name: 'guest',
        user_profile_id: 'up-2',
      },
    ],
    radius: [],
    devices: [],
  };
}

const allSelected: MigrationSelections = {
  ssidIds: new Set(['ssid-1', 'ssid-2']),
  vlanIds: new Set(['v-1', 'v-2']),
  radiusIds: new Set(),
};

beforeEach(() => {
  mockMakeRequest.mockReset();
  mockUpdateService.mockReset();
});

describe('convertToControllerFormat — skip existing services', () => {
  it('returns all SSIDs as new when no existing services exist', () => {
    const config = convertToControllerFormat(makeData(), allSelected, [], []);
    expect(config.services).toHaveLength(2);
    expect(config.skippedExistingServices).toEqual([]);
  });

  it('skips an SSID when a service with the same serviceName already exists (case-insensitive)', () => {
    const existing = [{ id: 'svc-x', serviceName: 'CORP-WIFI', ssid: 'CORP-WIFI' }];
    const config = convertToControllerFormat(makeData(), allSelected, [], existing);
    expect(config.services).toHaveLength(1);
    expect(config.services[0].serviceName).toBe('GUEST');
    expect(config.skippedExistingServices).toEqual(['corp-wifi']);
  });

  it('skips when only the ssid field matches (regardless of serviceName)', () => {
    const existing = [{ id: 'svc-y', serviceName: 'something-else', ssid: 'guest' }];
    const config = convertToControllerFormat(makeData(), allSelected, [], existing);
    expect(config.services.map((s) => s.serviceName)).toEqual(['corp-wifi']);
    expect(config.skippedExistingServices).toEqual(['GUEST']);
  });

  it('flags PSK SSIDs missing a key as needing the placeholder password', () => {
    const config = convertToControllerFormat(makeData(), allSelected, [], []);
    expect(config.pskPlaceholders).toContain('corp-wifi');
  });
});

describe('executeMigration — skip-existing reflected in result', () => {
  it('returns the skipped names verbatim and emits a warn-level log', async () => {
    const config = convertToControllerFormat(
      makeData(),
      allSelected,
      [],
      [{ id: 'svc-x', serviceName: 'corp-wifi' }]
    );
    const log = vi.fn();
    // No services to create after skip → no controller calls expected.
    const result = await executeMigration(
      config,
      0,
      [],
      { dryRun: true, enableAfterMigration: false, profileAssignmentMode: 'none' },
      log
    );
    expect(result.services.skipped).toEqual(['corp-wifi']);
    const warnings = log.mock.calls.filter(([, level]) => level === 'warn').map(([m]) => m);
    expect(warnings.some((m: string) => m.includes('Skipping 1 SSID'))).toBe(true);
  });
});

describe('executeMigration — abort signal', () => {
  it('returns aborted=true and stops mid-flight when the signal fires before work begins', async () => {
    const config = convertToControllerFormat(makeData(), allSelected, [], []);
    const controller = new AbortController();
    controller.abort(); // Abort up front; no controllerPost calls should fire.
    const log = vi.fn();
    const result = await executeMigration(
      config,
      0,
      [],
      {
        dryRun: false,
        enableAfterMigration: false,
        profileAssignmentMode: 'none',
        signal: controller.signal,
      },
      log
    );
    expect(result.aborted).toBe(true);
    expect(mockMakeRequest).not.toHaveBeenCalled();
  });

  it('returns aborted=true after partial work when the signal fires mid-stream', async () => {
    const config = convertToControllerFormat(makeData(), allSelected, [], []);
    const controller = new AbortController();
    // Succeed the first POST, then abort before the second goes out.
    let calls = 0;
    mockMakeRequest.mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        // After the first successful response, schedule an abort.
        queueMicrotask(() => controller.abort());
        return new Response(JSON.stringify({ id: 'topo-1' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    const log = vi.fn();
    const result = await executeMigration(
      config,
      0,
      [],
      {
        dryRun: false,
        enableAfterMigration: false,
        profileAssignmentMode: 'none',
        signal: controller.signal,
        retryAttempts: 1,
      },
      log
    );
    expect(result.aborted).toBe(true);
    // First topology should have made it through before the abort.
    expect(result.topologies.succeeded).toBe(1);
  });
});

describe('executeMigration — retry on 5xx', () => {
  it('retries a 503 once and reports the attempt count when it eventually succeeds', async () => {
    // Convert with a single VLAN topology to keep the test focused.
    const config = {
      topologies: [{ name: 'Corp', vlanid: 100 }],
      aaaPolicies: [],
      services: [],
      pskPlaceholders: [],
      ppskWarnings: [],
      radiusSecretWarnings: [],
      skippedExistingServices: [],
    };
    let calls = 0;
    mockMakeRequest.mockImplementation(async () => {
      calls++;
      if (calls === 1) return new Response('Service Unavailable', { status: 503 });
      return new Response(JSON.stringify({ id: 'topo-ok' }), { status: 200 });
    });
    const log = vi.fn();
    const result = await executeMigration(
      config,
      0,
      [],
      {
        dryRun: false,
        enableAfterMigration: false,
        profileAssignmentMode: 'none',
        retryAttempts: 3,
      },
      log
    );
    expect(result.topologies.succeeded).toBe(1);
    expect(result.topologies.failed).toBe(0);
    expect(calls).toBe(2);
  });

  it('does NOT retry a 4xx response', async () => {
    const config = {
      topologies: [{ name: 'Corp', vlanid: 100 }],
      aaaPolicies: [],
      services: [],
      pskPlaceholders: [],
      ppskWarnings: [],
      radiusSecretWarnings: [],
      skippedExistingServices: [],
    };
    let calls = 0;
    mockMakeRequest.mockImplementation(async () => {
      calls++;
      return new Response('Bad Request', { status: 400 });
    });
    const log = vi.fn();
    const result = await executeMigration(
      config,
      0,
      [],
      {
        dryRun: false,
        enableAfterMigration: false,
        profileAssignmentMode: 'none',
        retryAttempts: 3,
      },
      log
    );
    expect(result.topologies.succeeded).toBe(0);
    expect(result.topologies.failed).toBe(1);
    expect(calls).toBe(1); // One attempt only — 4xx should not retry.
  });
});

describe('fetchExistingServices', () => {
  it('returns the parsed array on 200', async () => {
    mockMakeRequest.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: '1' }, { id: '2' }]), { status: 200 })
    );
    const services = await fetchExistingServices();
    expect(services).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('returns [] on non-200 instead of throwing', async () => {
    mockMakeRequest.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const services = await fetchExistingServices();
    expect(services).toEqual([]);
  });

  it('returns [] when the request itself rejects', async () => {
    mockMakeRequest.mockRejectedValueOnce(new Error('network'));
    const services = await fetchExistingServices();
    expect(services).toEqual([]);
  });
});
