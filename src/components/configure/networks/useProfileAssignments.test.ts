/**
 * Associated-Profiles radioIfList math: seeding from the real /v3/profiles
 * binding shape ({ serviceId, index }), toggling, and minimal write-back.
 */
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ApProfile } from '../../../types/configure';
import { useProfileAssignments } from './useProfileAssignments';
import { LAB_6GHZ, SKYNET } from './wlanFixtures';

/** Real AP4020X-default binding shape from api/profiles.json (trimmed). */
function makeProfile(overrides: Partial<ApProfile>): ApProfile {
  return {
    id: 'profile-1',
    name: 'AP4020X-default',
    predefined: true,
    apPlatform: 'AP4020X',
    radios: [
      { radioIndex: 1, radioName: 'Radio 1 - 2.4 GHz', mode: 'gnxbe' },
      { radioIndex: 2, radioName: 'Radio 2 - 5 GHz', mode: 'ancxbe' },
      { radioIndex: 3, radioName: 'Radio 3 - 6 GHz', mode: 'ax6be' },
    ] as ApProfile['radios'],
    radioIfList: [
      { serviceId: SKYNET.id, index: 1 },
      { serviceId: SKYNET.id, index: 2 },
    ],
    features: ['WPA3-192'],
    ...overrides,
  } as ApProfile;
}

/**
 * The reseed effect keys on the profiles array identity (stable state in
 * useWlanRefs) — the render callback must not rebuild the array each render.
 */
function renderAssignments(wlanId: string | null, profiles: ApProfile[]) {
  return renderHook(() => useProfileAssignments(wlanId, profiles));
}

describe('useProfileAssignments', () => {
  it('seeds the matrix from radioIfList entries of the target WLAN only', () => {
    const profiles = [makeProfile({})];
    const { result } = renderAssignments(SKYNET.id, profiles);
    expect(result.current.matrix['profile-1']).toEqual({ 1: true, 2: true });
    expect(result.current.dirty).toBe(false);

    const other = renderAssignments(LAB_6GHZ.id, profiles);
    expect(other.result.current.matrix['profile-1']).toEqual({});
  });

  it('returns no updates when nothing changed', () => {
    const { result } = renderAssignments(SKYNET.id, [makeProfile({})]);
    expect(result.current.buildUpdates()).toEqual([]);
  });

  it('adds a binding and preserves other services entries', () => {
    const profiles = [
      makeProfile({
        radioIfList: [
          { serviceId: SKYNET.id, index: 1 },
          { serviceId: LAB_6GHZ.id, index: 3 },
        ],
      }),
    ];
    const { result } = renderAssignments(SKYNET.id, profiles);
    act(() => result.current.toggle('profile-1', 2));
    const updates = result.current.buildUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].radioIfList).toEqual(
      expect.arrayContaining([
        { serviceId: LAB_6GHZ.id, index: 3 },
        { serviceId: SKYNET.id, index: 1 },
        { serviceId: SKYNET.id, index: 2 },
      ])
    );
    expect(updates[0].radioIfList).toHaveLength(3);
  });

  it('removes a binding when unchecked', () => {
    const { result } = renderAssignments(SKYNET.id, [makeProfile({})]);
    act(() => result.current.toggle('profile-1', 1));
    act(() => result.current.toggle('profile-1', 2));
    const updates = result.current.buildUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].radioIfList).toEqual([]);
  });

  it('toggling on and back off yields no update for that profile', () => {
    const { result } = renderAssignments(SKYNET.id, [makeProfile({})]);
    act(() => result.current.toggle('profile-1', 3));
    act(() => result.current.toggle('profile-1', 3));
    expect(result.current.buildUpdates()).toEqual([]);
  });

  it('builds nothing in create mode (no WLAN id yet)', () => {
    const { result } = renderAssignments(null, [makeProfile({})]);
    act(() => result.current.toggle('profile-1', 1));
    expect(result.current.buildUpdates()).toEqual([]);
  });
});
