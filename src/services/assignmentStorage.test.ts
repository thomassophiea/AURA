import { describe, it, expect, beforeEach, vi } from 'vitest';
import { assignmentStorageService } from './assignmentStorage';
import type { WLANProfileAssignment, WLANSiteAssignment } from '../types/network';

function installLocalStorageStub() {
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
  return store;
}

const siteAssignment = (
  wlanId: string,
  siteId: string,
  overrides: Partial<WLANSiteAssignment> = {}
) =>
  ({
    wlanId,
    siteId,
    siteName: `Site ${siteId}`,
    deploymentMode: 'ALL_PROFILES_AT_SITE',
    includedProfiles: [],
    excludedProfiles: [],
    ...overrides,
  }) as unknown as WLANSiteAssignment;

const profileAssignment = (
  wlanId: string,
  profileId: string,
  overrides: Partial<WLANProfileAssignment> = {}
) =>
  ({
    wlanId,
    profileId,
    profileName: `Profile ${profileId}`,
    desiredState: 'ASSIGNED',
    actualState: 'UNKNOWN',
    syncStatus: 'PENDING',
    ...overrides,
  }) as unknown as WLANProfileAssignment;

beforeEach(() => {
  installLocalStorageStub();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('assignmentStorageService — site assignments', () => {
  it('saves a site assignment and stamps lastModified', () => {
    assignmentStorageService.saveWLANSiteAssignment(siteAssignment('w1', 's1'));
    const all = assignmentStorageService.getWLANSiteAssignments('w1');
    expect(all).toHaveLength(1);
    expect(all[0].siteId).toBe('s1');
    expect(typeof all[0].lastModified).toBe('string');
  });

  it('overwrites the same wlan/site key on resave', () => {
    assignmentStorageService.saveWLANSiteAssignment(
      siteAssignment('w1', 's1', { deploymentMode: 'ALL_PROFILES_AT_SITE' })
    );
    assignmentStorageService.saveWLANSiteAssignment(
      siteAssignment('w1', 's1', { deploymentMode: 'INCLUDE_ONLY', includedProfiles: ['p1'] })
    );
    const all = assignmentStorageService.getWLANSiteAssignments('w1');
    expect(all).toHaveLength(1);
    expect(all[0].deploymentMode).toBe('INCLUDE_ONLY');
    expect(all[0].includedProfiles).toEqual(['p1']);
  });

  it('returns only assignments for the queried wlanId', () => {
    assignmentStorageService.saveWLANSiteAssignment(siteAssignment('w1', 's1'));
    assignmentStorageService.saveWLANSiteAssignment(siteAssignment('w1', 's2'));
    assignmentStorageService.saveWLANSiteAssignment(siteAssignment('w2', 's1'));
    const w1 = assignmentStorageService.getWLANSiteAssignments('w1');
    const w2 = assignmentStorageService.getWLANSiteAssignments('w2');
    expect(w1.map((a) => a.siteId).sort()).toEqual(['s1', 's2']);
    expect(w2.map((a) => a.siteId)).toEqual(['s1']);
  });

  it('returns empty when storage is empty', () => {
    expect(assignmentStorageService.getWLANSiteAssignments('any')).toEqual([]);
  });

  it('survives malformed JSON in localStorage by returning empty', () => {
    localStorage.setItem('wlan_site_assignments', '{broken');
    expect(assignmentStorageService.getWLANSiteAssignments('any')).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('assignmentStorageService — profile assignments', () => {
  it('saves a profile assignment and stamps lastReconciled when missing', () => {
    assignmentStorageService.saveWLANProfileAssignment(profileAssignment('w1', 'p1'));
    const got = assignmentStorageService.getProfileAssignment('w1', 'p1');
    expect(got).not.toBeNull();
    expect(got!.profileId).toBe('p1');
    expect(typeof got!.lastReconciled).toBe('string');
  });

  it('preserves caller-provided lastReconciled', () => {
    const custom = '2025-01-01T00:00:00Z';
    assignmentStorageService.saveWLANProfileAssignment(
      profileAssignment('w1', 'p1', { lastReconciled: custom })
    );
    const got = assignmentStorageService.getProfileAssignment('w1', 'p1');
    expect(got!.lastReconciled).toBe(custom);
  });

  it('batch save creates multiple entries in one localStorage write path', () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem');
    assignmentStorageService.saveWLANProfileAssignmentsBatch([
      profileAssignment('w1', 'p1'),
      profileAssignment('w1', 'p2'),
      profileAssignment('w1', 'p3'),
    ]);
    expect(assignmentStorageService.getWLANProfileAssignments('w1')).toHaveLength(3);
    // batch path should write the profile-assignments key once.
    const profileWrites = setItemSpy.mock.calls.filter(
      (c) => c[0] === 'wlan_profile_assignments'
    ).length;
    expect(profileWrites).toBe(1);
  });

  it('getProfileAssignment returns null when missing', () => {
    expect(assignmentStorageService.getProfileAssignment('w1', 'nope')).toBeNull();
  });

  it('updateProfileAssignmentActualState merges actual + mismatch onto existing record', () => {
    assignmentStorageService.saveWLANProfileAssignment(profileAssignment('w1', 'p1'));
    assignmentStorageService.updateProfileAssignmentActualState(
      'w1',
      'p1',
      'ASSIGNED',
      'MISSING_ASSIGNMENT'
    );
    const got = assignmentStorageService.getProfileAssignment('w1', 'p1');
    expect(got!.actualState).toBe('ASSIGNED');
  });

  it('updateProfileAssignmentActualState warns and is a no-op when record missing', () => {
    assignmentStorageService.updateProfileAssignmentActualState(
      'w1',
      'nope',
      'ASSIGNED',
      'MISSING_ASSIGNMENT'
    );
    expect(console.warn).toHaveBeenCalled();
    expect(assignmentStorageService.getProfileAssignment('w1', 'nope')).toBeNull();
  });

  it('updateProfileAssignmentSyncStatus updates syncStatus + syncError', () => {
    assignmentStorageService.saveWLANProfileAssignment(profileAssignment('w1', 'p1'));
    assignmentStorageService.updateProfileAssignmentSyncStatus('w1', 'p1', 'FAILED', 'oops');
    const got = assignmentStorageService.getProfileAssignment('w1', 'p1');
    expect(got!.syncStatus).toBe('FAILED');
    expect(got!.syncError).toBe('oops');
  });
});

describe('assignmentStorageService — bulk', () => {
  it('getAllTrackedWLANs returns the union of site + profile wlanIds, deduped', () => {
    assignmentStorageService.saveWLANSiteAssignment(siteAssignment('w1', 's1'));
    assignmentStorageService.saveWLANSiteAssignment(siteAssignment('w2', 's1'));
    assignmentStorageService.saveWLANProfileAssignment(profileAssignment('w2', 'p1'));
    assignmentStorageService.saveWLANProfileAssignment(profileAssignment('w3', 'p1'));
    expect(assignmentStorageService.getAllTrackedWLANs().sort()).toEqual(['w1', 'w2', 'w3']);
  });

  it('getStorageStats reports counts', () => {
    assignmentStorageService.saveWLANSiteAssignment(siteAssignment('w1', 's1'));
    assignmentStorageService.saveWLANSiteAssignment(siteAssignment('w1', 's2'));
    assignmentStorageService.saveWLANProfileAssignment(profileAssignment('w1', 'p1'));
    const s = assignmentStorageService.getStorageStats();
    expect(s.siteAssignmentCount).toBe(2);
    expect(s.profileAssignmentCount).toBe(1);
    expect(s.trackedWLANCount).toBe(1);
  });

  it('clearAll wipes both storage keys', () => {
    assignmentStorageService.saveWLANSiteAssignment(siteAssignment('w1', 's1'));
    assignmentStorageService.saveWLANProfileAssignment(profileAssignment('w1', 'p1'));
    assignmentStorageService.clearAll();
    expect(assignmentStorageService.getStorageStats()).toEqual({
      siteAssignmentCount: 0,
      profileAssignmentCount: 0,
      trackedWLANCount: 0,
    });
  });
});

describe('assignmentStorageService — quota errors', () => {
  it('translates DOMException QuotaExceededError to a user-friendly message', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        const e = new DOMException('storage full', 'QuotaExceededError');
        throw e;
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    });
    expect(() =>
      assignmentStorageService.saveWLANSiteAssignment(siteAssignment('w1', 's1'))
    ).toThrow(/quota exceeded/i);
  });
});
