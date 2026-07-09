/**
 * Associated-Profiles assignment state: which profile radios broadcast this
 * WLAN, read from and written back to each profile's radioIfList
 * ({ serviceId, index } bindings, the real /v3/profiles shape).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApProfile, RadioIfEntry } from '../../../types/configure';

export type AssignmentMatrix = Record<string, Record<number, boolean>>;

export interface ProfileUpdate {
  profile: ApProfile;
  radioIfList: RadioIfEntry[];
}

function isRadioIfEntry(value: unknown): value is RadioIfEntry {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as RadioIfEntry).serviceId === 'string' &&
    typeof (value as RadioIfEntry).index === 'number'
  );
}

function seedMatrix(wlanId: string | null, profiles: ApProfile[]): AssignmentMatrix {
  const matrix: AssignmentMatrix = {};
  if (!wlanId) return matrix;
  for (const profile of profiles) {
    const row: Record<number, boolean> = {};
    for (const entry of (profile.radioIfList ?? []) as unknown[]) {
      if (isRadioIfEntry(entry) && entry.serviceId === wlanId) row[entry.index] = true;
    }
    matrix[profile.id] = row;
  }
  return matrix;
}

export function useProfileAssignments(wlanId: string | null, profiles: ApProfile[]) {
  const [matrix, setMatrix] = useState<AssignmentMatrix>({});
  const [dirty, setDirty] = useState(false);

  // Reseed whenever the target WLAN or the loaded profiles change.
  useEffect(() => {
    setMatrix(seedMatrix(wlanId, profiles));
    setDirty(false);
  }, [wlanId, profiles]);

  const toggle = useCallback((profileId: string, radioIndex: number) => {
    setMatrix((prev) => ({
      ...prev,
      [profileId]: { ...prev[profileId], [radioIndex]: !prev[profileId]?.[radioIndex] },
    }));
    setDirty(true);
  }, []);

  /** Profiles whose radioIfList must change to reflect the edited matrix. */
  const buildUpdates = useCallback((): ProfileUpdate[] => {
    if (!wlanId || !dirty) return [];
    const updates: ProfileUpdate[] = [];
    for (const profile of profiles) {
      const wanted = matrix[profile.id] ?? {};
      const current = ((profile.radioIfList ?? []) as unknown[]).filter(isRadioIfEntry);
      const others = current.filter((entry) => entry.serviceId !== wlanId);
      const mine = current.filter((entry) => entry.serviceId === wlanId);
      const wantedIndexes = Object.keys(wanted)
        .filter((key) => wanted[Number(key)])
        .map(Number)
        .sort((a, b) => a - b);
      const currentIndexes = mine.map((entry) => entry.index).sort((a, b) => a - b);
      if (JSON.stringify(wantedIndexes) === JSON.stringify(currentIndexes)) continue;
      updates.push({
        profile,
        radioIfList: [...others, ...wantedIndexes.map((index) => ({ serviceId: wlanId, index }))],
      });
    }
    return updates;
  }, [wlanId, dirty, profiles, matrix]);

  return useMemo(
    () => ({ matrix, dirty, toggle, buildUpdates }),
    [matrix, dirty, toggle, buildUpdates]
  );
}
