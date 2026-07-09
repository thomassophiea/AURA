/**
 * Local (view-layer) types for the full-depth Device Profiles editor. The wire
 * type (ApProfile) leaves several arrays as `unknown[]` because their populated
 * shape was never observed on the captured records; these narrow them for the
 * editor, matching the shapes proven by the golden api/profiles.json fixtures.
 */
import type { ApProfile, ProfileRadio } from '../../../types/configure';

/** { id, label } option shape used by every select in the editor. */
export interface Opt {
  id: string;
  label: string;
}

/** radioIfList / wiredIfList entry — service bound to a radio/port index. */
export interface IfEntry {
  serviceId: string;
  index: number;
}

/** meshpointIfList entry — meshpoint bound to a radio index. */
export interface MeshIfEntry {
  meshpointId: string;
  index: number;
}

/** Per-band ACS row inside a profile meshpoint. */
export interface MeshBandSetting {
  bandId: string;
  txPower: number;
  acsPlan: string;
  acsList: Array<number | string>;
  pathMin: number;
  pathThreshold: number;
  tolerancePeriod: number;
}

/** Per-profile meshpoint advanced record (profile.meshpoints[]). */
export interface ProfileMesh {
  meshpointId: string;
  pathSelectionMethod: string;
  monitorCrm: boolean;
  monitorPrimaryLink: boolean;
  preferredNeighbor: string | null;
  preferredRoot: string | null;
  preferredBand: string;
  hysteresisMinTh: number;
  hysteresisPeriod: number;
  hysteresisDelta: number;
  hysteresisSNRDelta: number;
  excludeWiredPeer: boolean;
  meshRoot: boolean;
  meshRootOvr: boolean;
  costRoot: boolean;
  rootSelectionMethod: string;
  bandSettings: MeshBandSetting[];
}

/** Dropdown source pools loaded once and shared by every tab. */
export interface RefPools {
  services: Opt[];
  roles: Opt[];
  topologies: Opt[];
  meshpoints: Opt[];
  airdefense: Opt[];
  iot: Opt[];
  esl: Opt[];
  rtls: Opt[];
  positioning: Opt[];
  analytics: Opt[];
}

/** Shape passed to every tab component from the editor sheet. */
export interface ProfileTabContext {
  form: ApProfile;
  radios: ProfileRadio[];
  /** Feature-tag predicate: F('MLO') === profile.features includes 'MLO'. */
  F: (tag: string) => boolean;
  pools: RefPools;
  setField: (key: string, value: unknown) => void;
  setPath: (path: string, value: unknown) => void;
  updRadio: (index: number, key: string, value: unknown) => void;
  toggleInArr: (key: string, id: string) => void;
  /** Deep-clone mutate escape hatch for array edits. */
  mut: (fn: (draft: ApProfile) => void) => void;
  openRadioAdvanced: (index: number) => void;
  openClientBridge: () => void;
  openMeshAdvanced: (meshpointId: string) => void;
}
