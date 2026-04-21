// Public Information Lookup — demo provider for Radio Height Calculator.
//
// Returns structured building metadata and estimated floor-by-floor heights for
// a known set of campuses. Today this is a local mock that only knows about
// Comcast; it is deliberately shaped to let a future provider drop in a real
// public-data integration without touching callers.

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface EstimatedFloorHeight {
  floor: number;
  estimatedHeightAboveGroundFt: number;
  overriddenHeightAboveGroundFt?: number;
  isOverridden?: boolean;
}

export interface PublicLookupBuilding {
  id: string;
  buildingName: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  campusName?: string;
  buildingType?: string;
  estimatedFloorsAboveGround: number;
  overriddenFloorsAboveGround?: number;
  estimatedTypicalFloorHeightFt: number;
  overriddenTypicalFloorHeightFt?: number;
  estimatedSourceConfidence: ConfidenceLevel;
  lookupSource: string;
  notes?: string;
  estimatedFloors: EstimatedFloorHeight[];
  isConfirmed?: boolean;
  isSelected?: boolean;
  isCommitted?: boolean;
}

export interface PublicLookupResult {
  query: string;
  organizationName: string;
  resultType: 'campus_buildings';
  buildings: PublicLookupBuilding[];
  isDemoData: boolean;
  requiresUserValidation: boolean;
}

export function normalizePublicLookupQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function generateEstimatedFloorHeights(
  floors: number,
  floorHeightFt: number
): EstimatedFloorHeight[] {
  const out: EstimatedFloorHeight[] = [];
  const count = Math.max(0, Math.floor(floors));
  for (let i = 1; i <= count; i++) {
    out.push({
      floor: i,
      estimatedHeightAboveGroundFt: Math.round((i - 1) * floorHeightFt * 100) / 100,
    });
  }
  return out;
}

// ── Demo dataset ─────────────────────────────────────────────────────────────

type BuildingSeed = Omit<PublicLookupBuilding, 'estimatedFloors'>;

const COMCAST_BUILDING_SEEDS: BuildingSeed[] = [
  {
    id: 'comcast-center',
    buildingName: 'Comcast Center',
    addressLine1: '1701 John F. Kennedy Blvd',
    city: 'Philadelphia',
    state: 'PA',
    postalCode: '19103',
    estimatedFloorsAboveGround: 57,
    estimatedTypicalFloorHeightFt: 15.0,
    estimatedSourceConfidence: 'high',
    buildingType: 'highrise_office',
    campusName: 'Comcast Center Campus',
    lookupSource: 'public_information_demo',
    notes:
      'Public-information estimate for demo. User should confirm actual floor heights or elevations before AFC use.',
  },
  {
    id: 'comcast-technology-center',
    buildingName: 'Comcast Technology Center',
    addressLine1: '1800 Arch St',
    city: 'Philadelphia',
    state: 'PA',
    postalCode: '19103',
    estimatedFloorsAboveGround: 59,
    estimatedTypicalFloorHeightFt: 14.5,
    estimatedSourceConfidence: 'high',
    buildingType: 'highrise_mixed_use',
    campusName: 'Comcast Center Campus',
    lookupSource: 'public_information_demo',
    notes:
      'Public-information estimate for demo. User should confirm actual floor heights or elevations before AFC use.',
  },
];

function hydrateBuildings(seeds: BuildingSeed[]): PublicLookupBuilding[] {
  return seeds.map((seed) => ({
    ...seed,
    estimatedFloors: generateEstimatedFloorHeights(
      seed.estimatedFloorsAboveGround,
      seed.estimatedTypicalFloorHeightFt
    ),
    isSelected: true,
    isConfirmed: false,
    isCommitted: false,
  }));
}

interface DemoEntry {
  aliases: string[];
  organizationName: string;
  seeds: BuildingSeed[];
}

const MTCC_BUILDING_SEEDS: BuildingSeed[] = [
  {
    id: 'mtcc-north-building',
    buildingName: 'Metro Toronto Convention Centre - North Building',
    addressLine1: '255 Front St W',
    city: 'Toronto',
    state: 'ON',
    postalCode: 'M5V 2W6',
    country: 'Canada',
    estimatedFloorsAboveGround: 3,
    estimatedTypicalFloorHeightFt: 18,
    estimatedSourceConfidence: 'medium',
    buildingType: 'convention_center',
    campusName: 'Metro Toronto Convention Centre',
    lookupSource: 'public_information_demo',
    notes:
      'Large convention halls with high ceilings. Estimate uses higher-than-office floor height.',
  },
  {
    id: 'mtcc-south-building',
    buildingName: 'Metro Toronto Convention Centre - South Building',
    addressLine1: '222 Bremner Blvd',
    city: 'Toronto',
    state: 'ON',
    postalCode: 'M5V 3L9',
    country: 'Canada',
    estimatedFloorsAboveGround: 3,
    estimatedTypicalFloorHeightFt: 20,
    estimatedSourceConfidence: 'medium',
    buildingType: 'convention_center',
    campusName: 'Metro Toronto Convention Centre',
    lookupSource: 'public_information_demo',
    notes: 'Includes exhibit halls and large open spaces. Floor heights vary significantly.',
  },
];

const DEMO_REGISTRY: DemoEntry[] = [
  {
    aliases: ['comcast', 'comcast center', 'comcast center campus', 'comcast philadelphia'],
    organizationName: 'Comcast Center Campus',
    seeds: COMCAST_BUILDING_SEEDS,
  },
  {
    aliases: [
      'mtcc',
      'toronto metro convention centre',
      'metro toronto convention centre',
      'metro toronto convention',
    ],
    organizationName: 'Metro Toronto Convention Centre',
    seeds: MTCC_BUILDING_SEEDS,
  },
];

export function getMockPublicLookupResults(query: string): PublicLookupResult | null {
  const normalized = normalizePublicLookupQuery(query);
  if (!normalized) return null;

  const entry = DEMO_REGISTRY.find((e) =>
    e.aliases.some((alias) => normalized === alias || normalized.includes(alias))
  );
  if (!entry) return null;

  return {
    query,
    organizationName: entry.organizationName,
    resultType: 'campus_buildings',
    buildings: hydrateBuildings(entry.seeds),
    isDemoData: true,
    requiresUserValidation: true,
  };
}

// Public API. Async so a real HTTP provider can replace this without touching
// callers.
export async function searchPublicLookup(query: string): Promise<PublicLookupResult | null> {
  return getMockPublicLookupResults(query);
}

// ── Effective value helpers ──────────────────────────────────────────────────

export function effectiveFloorsAboveGround(b: PublicLookupBuilding): number {
  return b.overriddenFloorsAboveGround ?? b.estimatedFloorsAboveGround;
}

export function effectiveTypicalFloorHeightFt(b: PublicLookupBuilding): number {
  return b.overriddenTypicalFloorHeightFt ?? b.estimatedTypicalFloorHeightFt;
}

export function effectiveFloorHeightAboveGroundFt(f: EstimatedFloorHeight): number {
  return f.overriddenHeightAboveGroundFt ?? f.estimatedHeightAboveGroundFt;
}
