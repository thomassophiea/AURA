/**
 * Availability (HA pair) + Mobility singletons — `/platformmanager/v1/availability`
 * and `/platformmanager/v1/mobility`, GET/PUT (verified live on the lab pair).
 * Shapes are wire-faithful; the Gateway uses the string '0.0.0.0' as the
 * "not set" sentinel on the mobility manager addresses (mapped to empty fields
 * by the Availability editor, never here).
 *
 * Also exports the cached `isPaired()` gate the VLAN editor's Peer Address
 * block hangs on — `availabilityEnabled === true`, exactly the condition the
 * Gateway gates its own peer-address block with.
 */
import { configureRequest, createSingletonClient, unwrapList } from './resourceClient';

export type AvailabilityRole = 'PRIMARY' | 'BACKUP';
export type MobilityRole = 'Manager' | 'Agent';
export type DiscoveryMethod = 'SLPD' | 'StaticConfiguration';

export interface AvailabilitySettings {
  availabilityEnabled: boolean;
  availabilityRole: AvailabilityRole;
  availabilityPairAddr: string;
  balanceAps: boolean;
  secureConnection: boolean;
  staticMtu: number;
}

export interface MobilityAgent {
  ip: string;
  state?: string | null;
}

export interface MobilitySettings {
  role: MobilityRole;
  mobilityEnabled: boolean;
  /** Appliance interface IP the mobility service binds to ('0.0.0.0' = unset). */
  physicalIfIp: string;
  discoveryMethod: DiscoveryMethod;
  /** '0.0.0.0' = unset. */
  mobilityManagerIp: string;
  /** '0.0.0.0' = unset. */
  mobilityBackupManagerIp: string;
  securityMode: string | null;
  agents: MobilityAgent[] | null;
  heartbeat: number;
}

/** Appliance interface (subset) — feeds the mobility Port select. */
export interface PlatformInterface {
  id: string;
  name: string;
  mode?: string;
  layer3?: boolean;
  ipAddress?: string;
}

export const availabilityService = createSingletonClient<AvailabilitySettings>({
  resource: 'availability',
  path: '/platformmanager/v1/availability',
});

export const mobilityService = createSingletonClient<MobilitySettings>({
  resource: 'mobility',
  path: '/platformmanager/v1/mobility',
});

/** Appliance interfaces (`/platformmanager/v1/interfaces`, read-only here). */
export async function listPlatformInterfaces(): Promise<PlatformInterface[]> {
  const payload = await configureRequest<unknown>('/platformmanager/v1/interfaces');
  return unwrapList<PlatformInterface>(payload);
}

let pairedPromise: Promise<boolean> | null = null;

/**
 * Cached "is this appliance HA-paired?" gate (availabilityEnabled === true).
 * One GET per session; a failed probe resolves false without poisoning the
 * cache so the next caller retries.
 */
export function isPaired(): Promise<boolean> {
  if (!pairedPromise) {
    pairedPromise = availabilityService.get().then(
      (a) => a.availabilityEnabled === true,
      () => {
        pairedPromise = null;
        return false;
      }
    );
  }
  return pairedPromise;
}

/** Drop the cached pairing state (call after saving availability settings). */
export function invalidatePairedCache(): void {
  pairedPromise = null;
}
