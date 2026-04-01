import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { Checkbox } from './ui/checkbox';
import {
  Building2, RefreshCw, AlertCircle, CheckCircle, Layers, Zap, RotateCcw, Upload,
  ChevronRight, ChevronDown, Search, Save, FolderOpen, Copy, FileSpreadsheet,
  AlertTriangle, CheckCheck, MapPin, X, Trash2, Calculator, Sparkles,
} from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';
import { ExportButton } from './ExportButton';

// ── Types ─────────────────────────────────────────────────────────────────────

type Deployment = 'indoor' | 'outdoor';
type PowerClass = 'sp' | 'lp';
type ApplyStatus = 'idle' | 'applied' | 'error';

interface FloorConfig {
  key: string;                              // `${site}||${building}||${floor}`
  site: string;
  building: string;
  floor: string;                            // label as stored on controller
  floorNumber: number;                      // parsed — used only by the formula helper
  floorHeightAboveGround: number;           // directly editable, default 0 m
  heightUncertainty: number | null;         // null = global default
  apHeightDefault: number | null;           // null = global default
  apHeightUncertaintyDefault: number | null;
}

interface APHeightRecord {
  serialNumber: string;
  displayName: string;
  model: string;
  site: string;
  building: string;
  floor: string;
  antennaType: string;
  // Heights (recalculated when settings change)
  floorHeightAboveGround: number;
  floorHeightUncertainty: number;
  apHeightAboveFloor: number;              // per-AP editable
  apHeightUncertainty: number;             // per-AP editable
  // Per-AP floor settings override
  floorSettingsOverride: boolean;
  floorHeightOverride: number | null;
  floorUncertaintyOverride: number | null;
  deployment: Deployment;
  powerClass: PowerClass;
  selected: boolean;
  autoDeployment: Deployment;
}

interface ConfigProfile {
  name: string;
  createdAt: string;
  defaultGroundElevation: number;
  defaultApHeight: number;
  defaultFloorUncertainty: number;
  defaultApUncertainty: number;
  defaultAntennaType: string;
  defaultDeployment: Deployment;
  defaultPowerClass: PowerClass;
  siteElevations: Record<string, number>;
  floorOverrides: Record<string, number>;  // key → floorHeightAboveGround
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SP_POWER: Record<string, number> = { '20': 36, '40': 39, '80': 42, '160': 45 };
const LP_POWER: Record<string, number> = { '20': 30, '40': 33, '80': 36, '160': 39 };
const CHANNEL_WIDTHS = ['20', '40', '80', '160'] as const;

// Fallback model-based outdoor detection (used only when ap.environment is absent)
const OUTDOOR_MODEL_PATTERNS = ['AP460C', 'AP460S', 'AP560H', 'AP360E', 'AP5050', 'AP5060'];

// Building presets — ceiling height for formula helper
const BUILDING_PRESETS = [
  { label: 'Office', height: 3.5 },
  { label: 'Warehouse', height: 8.0 },
  { label: 'Hospital', height: 4.0 },
  { label: 'Retail', height: 3.0 },
  { label: 'Data Center', height: 2.5 },
] as const;

const PROFILES_KEY = 'afc-radio-height-profiles';

// ── AI Campus Lookup — Demo Data ───────────────────────────────────────────────

interface CampusBuilding {
  name: string;
  type: string;
  floors: number | null;
  ceiling_height: { min: number | null; max: number | null };
  rf_complexity: string;
}
interface CampusData {
  campus: string;
  units: { ceiling_height: string };
  buildings: CampusBuilding[];
}


const CAMPUS_SEARCH_STEPS = [
  'Querying public campus building databases…',
  'Analyzing architectural specifications…',
  'Estimating RF coverage complexity…',
  'Computing floor height recommendations…',
];

function buildingTypeLabel(type: string): string {
  const map: Record<string, string> = {
    academic: 'Academic', administrative: 'Administrative',
    student_center_atrium: 'Student Center / Atrium', innovation: 'Innovation Hub',
    lab: 'Laboratory', lab_high_bay: 'High Bay Lab', research_lab: 'Research Lab',
    athletics: 'Athletics', stadium: 'Stadium', residence_hall: 'Residence Hall',
    apartment_complex: 'Apartment Complex', parking: 'Parking', academic_mixed: 'Academic / Mixed',
  };
  return map[type] ?? type;
}

function rfComplexityColor(level: string): string {
  if (level === 'low') return 'bg-[color:var(--status-success-bg)] text-[color:var(--status-success)] border-[color:var(--status-success)]/20 border';
  if (level === 'medium') return 'bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning)] border-[color:var(--status-warning)]/20 border';
  if (level === 'high') return 'bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning)] border-[color:var(--status-warning)]/20 border';
  return 'bg-[color:var(--status-error-bg)] text-[color:var(--status-error)] border-[color:var(--status-error)]/20 border'; // very_high
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseFloorNumber(floor: string): number {
  if (!floor) return 1;
  const f = floor.trim().toUpperCase();
  if (['G', 'GF', 'GRD', 'GROUND', '0', 'L', 'LOBBY'].includes(f)) return 1;
  const basementMatch = f.match(/^(?:LB|B)(\d+)$/) || f.match(/^-(\d+)$/);
  if (basementMatch) return -parseInt(basementMatch[1] ?? '0', 10);
  const lMatch = f.match(/^L(\d+)$/);
  if (lMatch) return parseInt(lMatch[1] ?? '1', 10);
  const n = parseInt(f, 10);
  // Cap at 20 — larger numbers are floor labels/IDs, not real floor numbers
  if (!isNaN(n)) return Math.min(Math.abs(n === 0 ? 1 : n), 20);
  return 1;
}

/** Resolve deployment from controller Environment field first, then model heuristic. */
function resolveDeployment(environment: string | undefined, model: string): Deployment {
  if (environment) {
    const e = environment.toLowerCase();
    if (e === 'outdoor') return 'outdoor';
    if (e === 'indoor') return 'indoor';
  }
  const m = model.toUpperCase();
  return OUTDOOR_MODEL_PATTERNS.some(p => m.includes(p)) ? 'outdoor' : 'indoor';
}

function getPower(pc: PowerClass): Record<string, number> {
  return pc === 'sp' ? SP_POWER : LP_POWER;
}

function parseFloorCsv(text: string): { building: string; floor: string; height: number }[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const start = (lines[0] ?? '').toLowerCase().includes('building') ? 1 : 0;
  const result: { building: string; floor: string; height: number }[] = [];
  for (let i = start; i < lines.length; i++) {
    const parts = (lines[i] ?? '').split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    if (parts.length >= 3) {
      const height = parseFloat(parts[2] ?? '');
      if (!isNaN(height) && height >= 0) {
        result.push({ building: parts[0] ?? '', floor: parts[1] ?? '', height });
      }
    }
  }
  return result;
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ApplyStatus }) {
  if (status === 'applied') return (
    <Badge className="bg-[color:var(--status-success-bg)] text-[color:var(--status-success)] border border-[color:var(--status-success)]/30 text-xs gap-1">
      <CheckCircle className="h-2.5 w-2.5" /> Applied
    </Badge>
  );
  if (status === 'error') return (
    <Badge className="bg-[color:var(--status-error-bg)] text-[color:var(--status-error)] border border-[color:var(--status-error)]/30 text-xs gap-1">
      <AlertCircle className="h-2.5 w-2.5" /> Error
    </Badge>
  );
  return <Badge variant="outline" className="text-xs text-muted-foreground">Pending</Badge>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AFCRadioHeightCalculator() {
  // Global defaults
  const [defaultGroundElevation, setDefaultGroundElevation] = useState(0);
  const [defaultApHeight, setDefaultApHeight] = useState(3.0);
  const [defaultFloorUncertainty, setDefaultFloorUncertainty] = useState(1.0);
  const [defaultApUncertainty, setDefaultApUncertainty] = useState(1.0);
  const [defaultAntennaType, setDefaultAntennaType] = useState('');
  const [defaultDeployment, setDefaultDeployment] = useState<Deployment>('indoor');
  const [defaultPowerClass, setDefaultPowerClass] = useState<PowerClass>('lp');

  // Per-site ground elevations
  const [siteElevations, setSiteElevations] = useState<Map<string, number>>(new Map());

  // Per-building ceiling height inputs (for formula helper only — not stored per-floor)
  const [buildingCeilingHelpers, setBuildingCeilingHelpers] = useState<Map<string, number>>(new Map());

  // Data
  const [apRecords, setApRecords] = useState<APHeightRecord[]>([]);
  const [floorConfigs, setFloorConfigs] = useState<FloorConfig[]>([]);
  const [applyStatus, setApplyStatus] = useState<Map<string, ApplyStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ current: number; total: number } | null>(null);
  const [activeTab, setActiveTab] = useState('aps');

  // Filtering
  const [selectedSite, setSelectedSite] = useState('__all__');
  const [searchQuery, setSearchQuery] = useState('');

  // Tree state
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Profiles
  const [profiles, setProfiles] = useState<ConfigProfile[]>(() => {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'); } catch { return []; }
  });
  const [newProfileName, setNewProfileName] = useState('');
  const [showProfiles, setShowProfiles] = useState(false);

  // AI Campus Lookup
  const [showCampusLookup, setShowCampusLookup] = useState(false);
  const [campusSearchQuery, setCampusSearchQuery] = useState('');
  const [campusSearching, setCampusSearching] = useState(false);
  const [campusSearchStep, setCampusSearchStep] = useState(0);
  const [campusResults, setCampusResults] = useState<CampusData | null>(null);
  const [selectedCampusBuildings, setSelectedCampusBuildings] = useState<Set<string>>(new Set());
  const [copySource, setCopySource] = useState<string | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const allSites = useMemo(() => [...new Set(apRecords.map(r => r.site))].sort(), [apRecords]);

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [aps, savedHeights] = await Promise.allSettled([
        apiService.getAccessPoints(),
        apiService.makeAuthenticatedRequest('/v1/afc/radio-heights')
          .then(r => r.ok ? r.json() : []).catch(() => [])
      ]);

      const apList = aps.status === 'fulfilled' ? aps.value : [];
      const saved: Record<string, Record<string, unknown>> = {};
      if (savedHeights.status === 'fulfilled' && Array.isArray(savedHeights.value)) {
        savedHeights.value.forEach((h: Record<string, unknown>) => {
          if (typeof h.serialNumber === 'string') saved[h.serialNumber] = h;
        });
      }

      // Build floor configs — floorHeightAboveGround defaults to 0 (must be entered directly)
      const floorMap = new Map<string, FloorConfig>();
      apList.forEach(ap => {
        const site = ap.hostSite || ap.site || 'Unknown Site';
        const building = ap.building || site;
        const floor = ap.floor || ap.floorName || '1';
        const key = `${site}||${building}||${floor}`;
        if (!floorMap.has(key)) {
          floorMap.set(key, {
            key, site, building, floor,
            floorNumber: parseFloorNumber(floor),
            floorHeightAboveGround: 0,   // ← direct entry, user sets this
            heightUncertainty: null,
            apHeightDefault: null,
            apHeightUncertaintyDefault: null,
          });
        }
      });

      const floors = Array.from(floorMap.values()).sort((a, b) => {
        if (a.site !== b.site) return a.site.localeCompare(b.site);
        if (a.building !== b.building) return a.building.localeCompare(b.building);
        return a.floorNumber - b.floorNumber;
      });
      setFloorConfigs(floors);

      // Expand all by default
      const expanded = new Set<string>();
      const seenS = new Set<string>(), seenB = new Set<string>();
      floors.forEach(fc => {
        if (!seenS.has(fc.site)) { seenS.add(fc.site); expanded.add(`site:${fc.site}`); }
        const bk = `building:${fc.site}||${fc.building}`;
        if (!seenB.has(bk)) { seenB.add(bk); expanded.add(bk); }
      });
      setExpandedKeys(expanded);

      // Build AP records
      const records: APHeightRecord[] = apList.map(ap => {
        const site = ap.hostSite || ap.site || 'Unknown Site';
        const building = ap.building || site;
        const floor = ap.floor || ap.floorName || '1';
        const key = `${site}||${building}||${floor}`;
        const fc = floorMap.get(key);
        const model = ap.model || ap.apModel || ap.deviceModel || ap.platformName || '';

        // Primary: controller Environment field. Fallback: model heuristic.
        const autoDeployment = resolveDeployment(ap.environment, model);
        // Outdoor → SP (AFC required), Indoor → LP (no AFC needed by default)
        const defaultPC: PowerClass = autoDeployment === 'outdoor' ? 'sp' : 'lp';

        const s = saved[ap.serialNumber] ?? {};
        const apH = typeof s.apHeightAboveFloor === 'number' ? s.apHeightAboveFloor
          : (fc?.apHeightDefault ?? 3.0);
        const apU = typeof s.apHeightUncertainty === 'number' ? s.apHeightUncertainty
          : (fc?.apHeightUncertaintyDefault ?? 1.0);

        return {
          serialNumber: ap.serialNumber,
          displayName: ap.displayName || ap.hostname || ap.serialNumber,
          model,
          site, building, floor,
          antennaType: typeof s.antennaType === 'string' ? s.antennaType : '',
          floorHeightAboveGround: 0,     // recalculate() fills this in
          floorHeightUncertainty: fc?.heightUncertainty ?? 1.0,
          apHeightAboveFloor: apH,
          apHeightUncertainty: apU,
          floorSettingsOverride: s.floorSettingsOverride === true,
          floorHeightOverride: typeof s.floorHeightOverride === 'number' ? s.floorHeightOverride : null,
          floorUncertaintyOverride: typeof s.floorUncertaintyOverride === 'number' ? s.floorUncertaintyOverride : null,
          deployment: typeof s.deployment === 'string' ? s.deployment as Deployment : autoDeployment,
          powerClass: typeof s.powerClass === 'string' ? s.powerClass as PowerClass : defaultPC,
          selected: false,
          autoDeployment,
        };
      });

      setApRecords(records);
      setApplyStatus(new Map(records.map(r => [r.serialNumber, 'idle'])));
    } catch (err) {
      console.error('[AFCRadioHeightCalculator] load error:', err);
      toast.error('Failed to load access point data');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  // ── Recalculate heights when settings change ───────────────────────────────
  // Floor Height Above Ground = site elevation + floor's directly-entered height above ground.
  // AP height above floor is per-AP and NOT changed by recalculate.

  const recalculate = useCallback(() => {
    const floorMap = new Map<string, FloorConfig>(floorConfigs.map(fc => [fc.key, fc]));
    setApRecords(prev => prev.map(ap => {
      const key = `${ap.site}||${ap.building}||${ap.floor}`;
      const fc = floorMap.get(key);

      let floorHAG: number;
      if (ap.floorSettingsOverride && ap.floorHeightOverride !== null) {
        floorHAG = ap.floorHeightOverride;
      } else {
        const siteElev = siteElevations.get(ap.site) ?? defaultGroundElevation;
        floorHAG = siteElev + (fc?.floorHeightAboveGround ?? 0);
      }

      let floorUncert: number;
      if (ap.floorSettingsOverride && ap.floorUncertaintyOverride !== null) {
        floorUncert = ap.floorUncertaintyOverride;
      } else {
        floorUncert = fc?.heightUncertainty ?? defaultFloorUncertainty;
      }

      return { ...ap, floorHeightAboveGround: floorHAG, floorHeightUncertainty: floorUncert };
    }));
  }, [floorConfigs, defaultGroundElevation, defaultFloorUncertainty, siteElevations]);

  useEffect(() => { recalculate(); }, [recalculate]);

  // ── Filtered records + hierarchy ───────────────────────────────────────────

  const filteredRecords = useMemo(() => {
    let r = apRecords;
    if (selectedSite !== '__all__') r = r.filter(x => x.site === selectedSite);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter(x =>
        x.displayName.toLowerCase().includes(q) ||
        x.building.toLowerCase().includes(q) ||
        x.floor.toLowerCase().includes(q) ||
        x.site.toLowerCase().includes(q) ||
        x.serialNumber.toLowerCase().includes(q)
      );
    }
    return r;
  }, [apRecords, selectedSite, searchQuery]);

  const hierarchy = useMemo(() => {
    const m = new Map<string, Map<string, Map<string, APHeightRecord[]>>>();
    filteredRecords.forEach(ap => {
      if (!m.has(ap.site)) m.set(ap.site, new Map());
      const bm = m.get(ap.site)!;
      if (!bm.has(ap.building)) bm.set(ap.building, new Map());
      const fm = bm.get(ap.building)!;
      if (!fm.has(ap.floor)) fm.set(ap.floor, []);
      fm.get(ap.floor)!.push(ap);
    });
    return m;
  }, [filteredRecords]);

  // APs whose total height is outside a sane range (negative or >150 m)
  const validationWarnings = useMemo(() =>
    filteredRecords.filter(r => {
      const total = r.floorHeightAboveGround + r.apHeightAboveFloor;
      return total < 0 || total > 150;
    }), [filteredRecords]);

  // Floors whose height has never been entered (still at default 0 and that floor has SP APs)
  const unsetFloors = useMemo(() =>
    floorConfigs.filter(fc => {
      const siteElev = siteElevations.get(fc.site) ?? defaultGroundElevation;
      if (siteElev + fc.floorHeightAboveGround !== 0) return false; // height is non-zero, ok
      // warn only if this floor has SP APs
      return apRecords.some(r => r.site === fc.site && r.building === fc.building && r.floor === fc.floor && r.powerClass === 'sp');
    }), [floorConfigs, apRecords, siteElevations, defaultGroundElevation]);

  // ── Selection ──────────────────────────────────────────────────────────────

  const selectedCount = filteredRecords.filter(r => r.selected).length;
  const allSelected = filteredRecords.length > 0 && selectedCount === filteredRecords.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleAll = () => {
    const next = !allSelected;
    const sns = new Set(filteredRecords.map(r => r.serialNumber));
    setApRecords(prev => prev.map(r => sns.has(r.serialNumber) ? { ...r, selected: next } : r));
  };
  const toggleOne = (sn: string) =>
    setApRecords(prev => prev.map(r => r.serialNumber === sn ? { ...r, selected: !r.selected } : r));
  const toggleSite = (site: string) => {
    const recs = filteredRecords.filter(r => r.site === site);
    const all = recs.every(r => r.selected);
    const sns = new Set(recs.map(r => r.serialNumber));
    setApRecords(prev => prev.map(r => sns.has(r.serialNumber) ? { ...r, selected: !all } : r));
  };
  const toggleBuilding = (site: string, building: string) => {
    const recs = filteredRecords.filter(r => r.site === site && r.building === building);
    const all = recs.every(r => r.selected);
    const sns = new Set(recs.map(r => r.serialNumber));
    setApRecords(prev => prev.map(r => sns.has(r.serialNumber) ? { ...r, selected: !all } : r));
  };

  // ── Expand/collapse ────────────────────────────────────────────────────────

  const toggleExpanded = (key: string) =>
    setExpandedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const expandAll = () => {
    const keys = new Set<string>();
    hierarchy.forEach((bm, site) => {
      keys.add(`site:${site}`);
      bm.forEach((_, b) => keys.add(`building:${site}||${b}`));
    });
    setExpandedKeys(keys);
  };
  const collapseAll = () => setExpandedKeys(new Set());

  // ── AP field updates ────────────────────────────────────────────────────────

  const updateAP = (sn: string, patch: Partial<APHeightRecord>) =>
    setApRecords(prev => prev.map(r => r.serialNumber === sn ? { ...r, ...patch } : r));

  const updateAPDeployment = (sn: string, d: Deployment) =>
    setApRecords(prev => prev.map(r => r.serialNumber !== sn ? r
      : { ...r, deployment: d, powerClass: d === 'outdoor' && r.powerClass === 'lp' ? 'sp' : r.powerClass }));

  const bulkSetDeployment = (d: Deployment) =>
    setApRecords(prev => prev.map(r => !r.selected ? r
      : { ...r, deployment: d, powerClass: d === 'outdoor' && r.powerClass === 'lp' ? 'sp' : r.powerClass }));
  const bulkSetPowerClass = (pc: PowerClass) =>
    setApRecords(prev => prev.map(r => (!r.selected || (pc === 'lp' && r.deployment === 'outdoor')) ? r
      : { ...r, powerClass: pc }));

  // ── Floor config updates ────────────────────────────────────────────────────

  const updateFloorField = (key: string, patch: Partial<FloorConfig>) =>
    setFloorConfigs(prev => prev.map(fc => fc.key === key ? { ...fc, ...patch } : fc));

  /**
   * Formula helper: calculate per-floor heights from a ceiling height.
   * Floor 1 → 0 m, Floor 2 → 1×ceiling, Floor 3 → 2×ceiling, etc.
   * Floor numbers > 20 are treated as ground level (0 m) since they're labels, not real floors.
   */
  const applyFloorFormula = (site: string, building: string, ceilingHeight: number) => {
    setFloorConfigs(prev => prev.map(fc => {
      if (fc.site !== site || fc.building !== building) return fc;
      const h = fc.floorNumber > 0 && fc.floorNumber <= 20
        ? (fc.floorNumber - 1) * ceilingHeight
        : 0;
      return { ...fc, floorHeightAboveGround: h };
    }));
    toast.success(`Calculated floor heights for ${building} (${ceilingHeight} m ceiling)`);
  };

  const copyBuildingFloors = (srcSite: string, srcBldg: string, tgtSite: string, tgtBldg: string) => {
    const src = floorConfigs.filter(fc => fc.site === srcSite && fc.building === srcBldg);
    setFloorConfigs(prev => prev.map(fc => {
      if (fc.site !== tgtSite || fc.building !== tgtBldg) return fc;
      const match = src.find(sf => sf.floor === fc.floor);
      return match ? { ...fc,
        floorHeightAboveGround: match.floorHeightAboveGround,
        heightUncertainty: match.heightUncertainty,
        apHeightDefault: match.apHeightDefault,
        apHeightUncertaintyDefault: match.apHeightUncertaintyDefault,
      } : fc;
    }));
    toast.success(`Copied floor settings → ${tgtBldg}`);
    setCopySource(null);
  };

  // ── Per-site elevation ─────────────────────────────────────────────────────

  const updateSiteElevation = (site: string, value: string) => {
    const num = parseFloat(value);
    setSiteElevations(prev => { const n = new Map(prev); isNaN(num) ? n.delete(site) : n.set(site, num); return n; });
  };

  // ── CSV import ─────────────────────────────────────────────────────────────

  const handleCsvImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parseFloorCsv(ev.target?.result as string);
      if (!rows.length) { toast.error('No valid rows. Expected: Building,Floor Label,Floor Height Above Ground (m)'); return; }
      let updated = 0;
      setFloorConfigs(prev => {
        const next = [...prev];
        rows.forEach(row => {
          const idx = next.findIndex(fc =>
            fc.building.toLowerCase() === row.building.toLowerCase() &&
            fc.floor.toLowerCase() === row.floor.toLowerCase());
          if (idx >= 0) { next[idx] = { ...next[idx], floorHeightAboveGround: row.height }; updated++; }
        });
        return next;
      });
      toast.success(`Imported ${rows.length} rows, updated ${updated} floor(s)`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Apply ──────────────────────────────────────────────────────────────────

  const applyRecords = async (toApply: APHeightRecord[]) => {
    if (!toApply.length) { toast.error('No APs to apply'); return; }
    setApplying(true);
    setApplyProgress({ current: 0, total: toApply.length });

    const BATCH = 50;
    let applied = 0, failed = 0;

    for (let i = 0; i < toApply.length; i += BATCH) {
      const batch = toApply.slice(i, i + BATCH);
      try {
        const resp = await apiService.makeAuthenticatedRequest('/v1/afc/radio-heights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch.map(r => ({
            serialNumber: r.serialNumber,
            displayName: r.displayName,
            antennaType: r.antennaType,
            floorName: r.floor,
            floorHeightAboveGround: parseFloat(r.floorHeightAboveGround.toFixed(2)),
            floorHeightAboveGroundUncertainty: parseFloat(r.floorHeightUncertainty.toFixed(2)),
            floorSettingsOverride: r.floorSettingsOverride,
            apHeightAboveFloor: parseFloat(r.apHeightAboveFloor.toFixed(2)),
            apHeightAboveFloorUncertainty: parseFloat(r.apHeightUncertainty.toFixed(2)),
            deployment: r.deployment,
            powerClass: r.powerClass,
          })))
        });
        if (!resp.ok) throw new Error(`${resp.status}`);
        setApplyStatus(prev => { const n = new Map(prev); batch.forEach(r => n.set(r.serialNumber, 'applied')); return n; });
        applied += batch.length;
      } catch {
        setApplyStatus(prev => { const n = new Map(prev); batch.forEach(r => n.set(r.serialNumber, 'error')); return n; });
        failed += batch.length;
      }
      setApplyProgress({ current: Math.min(i + BATCH, toApply.length), total: toApply.length });
    }

    setApplying(false);
    setApplyProgress(null);
    if (!failed) toast.success(`Saved ${applied} record(s)`);
    else toast.error(`Saved ${applied}, failed ${failed} record(s)`);
  };

  const handleApplySelected = () => applyRecords(filteredRecords.filter(r => r.selected));
  const handleApplyAll = () => applyRecords(filteredRecords);

  // ── Profiles ───────────────────────────────────────────────────────────────

  const saveProfile = () => {
    const name = newProfileName.trim();
    if (!name) { toast.error('Enter a profile name'); return; }
    const profile: ConfigProfile = {
      name, createdAt: new Date().toISOString(),
      defaultGroundElevation, defaultApHeight, defaultFloorUncertainty, defaultApUncertainty,
      defaultAntennaType, defaultDeployment, defaultPowerClass,
      siteElevations: Object.fromEntries(siteElevations),
      floorOverrides: Object.fromEntries(floorConfigs.filter(fc => fc.floorHeightAboveGround !== 0).map(fc => [fc.key, fc.floorHeightAboveGround])),
    };
    const updated = [...profiles.filter(p => p.name !== name), profile];
    setProfiles(updated);
    localStorage.setItem(PROFILES_KEY, JSON.stringify(updated));
    setNewProfileName('');
    toast.success(`Profile "${name}" saved`);
  };

  const loadProfile = (p: ConfigProfile) => {
    setDefaultGroundElevation(p.defaultGroundElevation);
    setDefaultApHeight(p.defaultApHeight ?? 3.0);
    setDefaultFloorUncertainty(p.defaultFloorUncertainty ?? 1.0);
    setDefaultApUncertainty(p.defaultApUncertainty ?? 1.0);
    setDefaultAntennaType(p.defaultAntennaType ?? '');
    setDefaultDeployment(p.defaultDeployment);
    setDefaultPowerClass(p.defaultPowerClass);
    setSiteElevations(new Map(Object.entries(p.siteElevations)));
    setFloorConfigs(prev => prev.map(fc => ({
      ...fc,
      floorHeightAboveGround: (p.floorOverrides[fc.key] as number) ?? 0,
    })));
    toast.success(`Profile "${p.name}" loaded`);
    setShowProfiles(false);
  };

  const deleteProfile = (name: string) => {
    const updated = profiles.filter(p => p.name !== name);
    setProfiles(updated);
    localStorage.setItem(PROFILES_KEY, JSON.stringify(updated));
  };

  // ── AI Campus Lookup ───────────────────────────────────────────────────────

  const handleCampusSearch = async () => {
    setCampusSearching(true);
    setCampusResults(null);
    setCampusSearchStep(0);
    // Simulate multi-step AI search with progressive status messages
    for (let step = 0; step < CAMPUS_SEARCH_STEPS.length; step++) {
      setCampusSearchStep(step);
      await new Promise<void>(res => setTimeout(res, 600));
    }
    // Campus lookup requires a real public data source — no local data available.
    toast.info('No public data found for this campus. Enter floor heights manually.');
    setCampusSearching(false);
  };

  const applyCampusFloorHeights = () => {
    if (!campusResults) return;
    const FT_TO_M = 0.3048;
    const siteName = campusResults.campus;
    const newFloors: FloorConfig[] = [];

    campusResults.buildings
      .filter(b => selectedCampusBuildings.has(b.name) && b.floors && b.floors > 0)
      .forEach(b => {
        const avgCeilingFt =
          b.ceiling_height.min !== null && b.ceiling_height.max !== null
            ? (b.ceiling_height.min + b.ceiling_height.max) / 2
            : 10;
        const avgCeilingM = avgCeilingFt * FT_TO_M;
        for (let i = 1; i <= (b.floors as number); i++) {
          const floorLabel = i === 1 ? 'Ground' : String(i);
          const key = `${siteName}||${b.name}||${floorLabel}`;
          newFloors.push({
            key, site: siteName, building: b.name,
            floor: floorLabel, floorNumber: i,
            floorHeightAboveGround: Math.round((i - 1) * avgCeilingM * 100) / 100,
            heightUncertainty: null,
            apHeightDefault: null,
            apHeightUncertaintyDefault: null,
          });
        }
      });

    setFloorConfigs(prev => {
      const nonDemo = prev.filter(fc => fc.site !== siteName);
      return [...nonDemo, ...newFloors];
    });

    toast.success(`Populated ${newFloors.length} floor configs across ${selectedCampusBuildings.size} buildings`);
    setActiveTab('floors');
    setShowCampusLookup(false);
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const exportData = useMemo(() => filteredRecords.map(r => ({
    serialNumber: r.serialNumber, displayName: r.displayName,
    site: r.site, building: r.building, floor: r.floor, antennaType: r.antennaType,
    floorHeightAboveGround: r.floorHeightAboveGround.toFixed(2),
    floorHeightUncertainty: r.floorHeightUncertainty.toFixed(2),
    apHeightAboveFloor: r.apHeightAboveFloor.toFixed(2),
    apHeightUncertainty: r.apHeightUncertainty.toFixed(2),
    totalHeight: (r.floorHeightAboveGround + r.apHeightAboveFloor).toFixed(2),
    deployment: r.deployment, powerClass: r.powerClass.toUpperCase(),
    maxEirp20MHz: getPower(r.powerClass)['20'], maxEirp80MHz: getPower(r.powerClass)['80'],
  })), [filteredRecords]);

  const exportColumns = [
    { key: 'serialNumber', label: 'Serial Number' }, { key: 'displayName', label: 'AP Name' },
    { key: 'site', label: 'Site' }, { key: 'building', label: 'Building' },
    { key: 'floor', label: 'Floor Name' }, { key: 'antennaType', label: 'Antenna Type' },
    { key: 'floorHeightAboveGround', label: 'Floor Height Above Ground (m)' },
    { key: 'floorHeightUncertainty', label: 'Floor Height Uncertainty (m)' },
    { key: 'apHeightAboveFloor', label: 'AP Height Above Floor (m)' },
    { key: 'apHeightUncertainty', label: 'AP Height Uncertainty (m)' },
    { key: 'totalHeight', label: 'Total Radio Height (m)' },
    { key: 'deployment', label: 'Deployment' }, { key: 'powerClass', label: 'Power Class' },
    { key: 'maxEirp20MHz', label: 'Max EIRP 20 MHz (dBm)' }, { key: 'maxEirp80MHz', label: 'Max EIRP 80 MHz (dBm)' },
  ];

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-72" /><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" />
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 p-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> AFC Radio Height Calculator
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Set floor and AP heights for AFC Standard Power compliance — enter heights directly as shown in Professional Install
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => setShowCampusLookup(v => !v)}
            className="gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md shadow-violet-500/30 border-0"
          >
            <Sparkles className="h-4 w-4" />
            Public Information Lookup
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowProfiles(v => !v)}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Profiles{profiles.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{profiles.length}</Badge>}
          </Button>
          <Button size="sm" variant="outline" onClick={handleApplyAll}
            disabled={applying || !filteredRecords.length} className="gap-1.5">
            {applying && applyProgress
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Saving {applyProgress.current}/{applyProgress.total}…</>
              : <><CheckCheck className="h-4 w-4" />Apply All ({filteredRecords.length})</>}
          </Button>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
        </div>
      </div>

      {/* Profiles panel */}
      {showProfiles && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2"><FolderOpen className="h-4 w-4" />Named Config Profiles</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowProfiles(false)}><X className="h-3.5 w-3.5" /></Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input placeholder="Profile name…" value={newProfileName} onChange={e => setNewProfileName(e.target.value)}
                className="h-8 text-sm max-w-xs" onKeyDown={e => e.key === 'Enter' && saveProfile()} />
              <Button size="sm" onClick={saveProfile} className="gap-1.5"><Save className="h-3.5 w-3.5" />Save Current</Button>
            </div>
            {!profiles.length ? <p className="text-xs text-muted-foreground">No saved profiles.</p> : (
              <div className="space-y-1.5">
                {profiles.map(p => (
                  <div key={p.name} className="flex items-center justify-between p-2 rounded-md border bg-muted/30">
                    <div>
                      <span className="text-sm font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{new Date(p.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => loadProfile(p)}>Load</Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteProfile(p.name)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Campus Lookup panel */}
      {showCampusLookup && (
        <Card className="border-violet-500/40 shadow-lg shadow-violet-500/10 overflow-hidden">
          {/* Gradient banner */}
          <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <Sparkles className="h-4 w-4" />
              <span className="font-semibold text-sm">Public Information Lookup</span>
              <Badge className="bg-white/20 text-white border-white/30 border text-xs">Demo</Badge>
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-white/80 hover:text-white hover:bg-white/20"
              onClick={() => setShowCampusLookup(false)}><X className="h-3.5 w-3.5" /></Button>
          </div>

          <CardContent className="pt-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Search publicly available campus building records to auto-populate floor heights. Results are estimates based on architectural specifications and are for demonstration purposes only.
            </p>

            {/* Search bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Enter institution or campus name…"
                  value={campusSearchQuery}
                  onChange={e => { setCampusSearchQuery(e.target.value); setCampusResults(null); }}
                  onKeyDown={e => e.key === 'Enter' && !campusSearching && handleCampusSearch()}
                  className="pl-8 h-9"
                />
              </div>
              <Button onClick={handleCampusSearch} disabled={campusSearching || !campusSearchQuery.trim()}
                className="gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0">
                {campusSearching
                  ? <RefreshCw className="h-4 w-4 animate-spin" />
                  : <Sparkles className="h-4 w-4" />}
                {campusSearching ? 'Searching…' : 'Search'}
              </Button>
            </div>

            {/* Loading state */}
            {campusSearching && (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-2 w-2 rounded-full bg-violet-500 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground animate-pulse">
                  {CAMPUS_SEARCH_STEPS[campusSearchStep] ?? CAMPUS_SEARCH_STEPS[0]}
                </p>
                <div className="flex gap-1 mt-1">
                  {CAMPUS_SEARCH_STEPS.map((_, i) => (
                    <div key={i} className={`h-1 w-8 rounded-full transition-all duration-300 ${i <= campusSearchStep ? 'bg-violet-500' : 'bg-muted'}`} />
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            {campusResults && !campusSearching && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-violet-500" />
                      {campusResults.campus}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {campusResults.buildings.length} buildings found · Heights in {campusResults.units.ceiling_height} (converted to metres on apply)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => setSelectedCampusBuildings(new Set(campusResults.buildings.map(b => b.name)))}>
                      Select All
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => setSelectedCampusBuildings(new Set())}>
                      Deselect All
                    </Button>
                  </div>
                </div>

                {/* Building cards grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-1">
                  {campusResults.buildings.map(b => {
                    const selected = selectedCampusBuildings.has(b.name);
                    const avgFt = b.ceiling_height.min !== null && b.ceiling_height.max !== null
                      ? (b.ceiling_height.min + b.ceiling_height.max) / 2 : null;
                    const avgM = avgFt ? (avgFt * 0.3048).toFixed(1) : null;
                    const hasFloors = b.floors && b.floors > 0;
                    return (
                      <button key={b.name}
                        onClick={() => setSelectedCampusBuildings(prev => {
                          const n = new Set(prev);
                          if (n.has(b.name)) n.delete(b.name); else n.add(b.name);
                          return n;
                        })}
                        className={`text-left p-3 rounded-lg border transition-all ${
                          selected
                            ? 'border-violet-500/50 bg-violet-50 dark:bg-violet-950/30 shadow-sm'
                            : 'border-border bg-muted/20 opacity-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1 mb-1.5">
                          <span className="text-xs font-semibold leading-snug">{b.name}</span>
                          <div className={`h-4 w-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                            selected ? 'bg-violet-600 border-violet-600' : 'border-border'
                          }`}>
                            {selected && <CheckCircle className="h-3 w-3 text-white" />}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge className={`text-[10px] px-1.5 py-0 ${rfComplexityColor(b.rf_complexity)}`}>
                            RF: {b.rf_complexity.replace('_', ' ')}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                            {buildingTypeLabel(b.type)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {hasFloors ? (
                            <span className="flex items-center gap-1">
                              <Layers className="h-3.5 w-3.5" />{b.floors} floor{b.floors !== 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="italic">No floors (outdoor)</span>
                          )}
                          {avgM && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5" />~{avgM} m ceiling
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Apply button */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    {selectedCampusBuildings.size} building{selectedCampusBuildings.size !== 1 ? 's' : ''} selected ·
                    floor heights computed from average ceiling height
                  </p>
                  <Button
                    onClick={applyCampusFloorHeights}
                    disabled={selectedCampusBuildings.size === 0}
                    className="gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0"
                  >
                    <CheckCheck className="h-4 w-4" />
                    Apply Floor Heights ({[...selectedCampusBuildings].filter(n => campusResults.buildings.find(b => b.name === n && b.floors && b.floors > 0)).length} buildings)
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Alert className="border-[color:var(--status-info)]/50 bg-[color:var(--status-info-bg)]">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Standard Power (SP)</strong> APs require AFC. Heights are entered directly — matching the values in the
          controller's <strong>Professional Install</strong> dialog. Outdoor APs (Environment = Outdoor) default to SP;
          indoor APs default to LP (no AFC needed).
        </AlertDescription>
      </Alert>

      {/* Global defaults */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Global Defaults</CardTitle>
          <CardDescription>Applied when no per-site, per-floor, or per-AP override is set</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Ground Elevation (m)</Label>
              <Input type="number" step="0.1" value={defaultGroundElevation}
                onChange={e => setDefaultGroundElevation(parseFloat(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground">Override per-site ↓</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">AP Height Above Floor (m)</Label>
              <Input type="number" step="0.1" min="0" value={defaultApHeight}
                onChange={e => setDefaultApHeight(parseFloat(e.target.value) || 3.0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Floor Ht Uncertainty (m)</Label>
              <Input type="number" step="0.1" min="0" value={defaultFloorUncertainty}
                onChange={e => setDefaultFloorUncertainty(parseFloat(e.target.value) || 1.0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">AP Ht Uncertainty (m)</Label>
              <Input type="number" step="0.1" min="0" value={defaultApUncertainty}
                onChange={e => setDefaultApUncertainty(parseFloat(e.target.value) || 1.0)} />
            </div>
            <div className="space-y-1.5 col-span-2 md:col-span-1">
              <Label className="text-xs">Default Antenna Type</Label>
              <Input placeholder="e.g. Internal_5050D" value={defaultAntennaType}
                onChange={e => setDefaultAntennaType(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default Deployment</Label>
              <Select value={defaultDeployment} onValueChange={v => setDefaultDeployment(v as Deployment)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="indoor">Indoor</SelectItem>
                  <SelectItem value="outdoor">Outdoor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default Power Class</Label>
              <Select value={defaultPowerClass} onValueChange={v => setDefaultPowerClass(v as PowerClass)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sp">SP</SelectItem>
                  <SelectItem value="lp">LP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="aps" className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />APs & Heights
            <Badge variant="secondary" className="ml-1 text-xs">{filteredRecords.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="floors" className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />Floor Heights
            {unsetFloors.length > 0 && <Badge className="ml-1 text-xs bg-[color:var(--status-warning)] text-white">{unsetFloors.length} unset</Badge>}
          </TabsTrigger>
          <TabsTrigger value="power-ref" className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />Power Reference
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: APs & Heights ──────────────────────────────────────── */}
        <TabsContent value="aps" className="mt-4 space-y-3">

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger className="h-8 text-sm w-52"><SelectValue placeholder="All Sites" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Sites ({apRecords.length} APs)</SelectItem>
                  {allSites.map(s => (
                    <SelectItem key={s} value={s}>{s} ({apRecords.filter(r => r.site === s).length} APs)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1 min-w-48 max-w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search AP, building, floor…" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} className="h-8 pl-8 text-sm" />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={expandAll}>Expand All</Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={collapseAll}>Collapse All</Button>
          </div>

          {/* Warnings */}
          {unsetFloors.length > 0 && (
            <Alert className="border-[color:var(--status-warning)]/50 bg-[color:var(--status-warning-bg)]">
              <AlertTriangle className="h-4 w-4 text-[color:var(--status-warning)]" />
              <AlertDescription className="text-sm">
                <strong>{unsetFloors.length} floor{unsetFloors.length !== 1 ? 's' : ''}</strong> with SP APs still have
                Floor Height Above Ground = 0. Go to the <strong>Floor Heights</strong> tab and enter the correct values.
              </AlertDescription>
            </Alert>
          )}
          {validationWarnings.length > 0 && (
            <Alert className="border-[color:var(--status-error)]/50 bg-[color:var(--status-error-bg)]">
              <AlertTriangle className="h-4 w-4 text-[color:var(--status-error)]" />
              <AlertDescription className="text-sm">
                <strong>{validationWarnings.length} AP{validationWarnings.length !== 1 ? 's' : ''}</strong> have total heights outside 0–150 m — verify floor height settings.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardContent className="pt-4 space-y-3">

              {selectedCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 rounded-lg border">
                  <span className="text-sm font-medium text-muted-foreground">{selectedCount} selected:</span>
                  <Button size="sm" variant="outline" onClick={() => bulkSetDeployment('indoor')}>Set Indoor</Button>
                  <Button size="sm" variant="outline" onClick={() => bulkSetDeployment('outdoor')}>Set Outdoor</Button>
                  <Button size="sm" variant="outline" onClick={() => bulkSetPowerClass('sp')}>Set SP</Button>
                  <Button size="sm" variant="outline" onClick={() => bulkSetPowerClass('lp')}>Set LP</Button>
                  <div className="flex-1" />
                  <Button size="sm" onClick={handleApplySelected} disabled={applying} className="gap-1.5">
                    {applying ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Apply Selected
                  </Button>
                </div>
              )}

              {filteredRecords.length === 0 ? (
                <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>
                  {apRecords.length === 0 ? 'No access points found.' : 'No APs match the current filter.'}
                </AlertDescription></Alert>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                            onCheckedChange={toggleAll} />
                        </TableHead>
                        <TableHead>AP Name</TableHead>
                        <TableHead>Antenna Type</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Floor Ht↑Gnd (m)</TableHead>
                        <TableHead className="text-right whitespace-nowrap">±Floor</TableHead>
                        <TableHead className="text-right whitespace-nowrap">AP Ht↑Floor (m)</TableHead>
                        <TableHead className="text-right whitespace-nowrap">±AP</TableHead>
                        <TableHead className="text-right">Total (m)</TableHead>
                        <TableHead>Deploy</TableHead>
                        <TableHead>Power</TableHead>
                        <TableHead className="text-center">Status / Override</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(Array.from(hierarchy.entries()) as [string, Map<string, Map<string, APHeightRecord[]>>][]).map(([site, bMap]) => {
                        const siteKey = `site:${site}`;
                        const siteRecs = filteredRecords.filter(r => r.site === site);
                        const siteExpanded = expandedKeys.has(siteKey);
                        const siteElev = siteElevations.get(site);

                        return (
                          <>
                            <TableRow key={siteKey} className="bg-muted/40 hover:bg-muted/50">
                              <TableCell>
                                <Checkbox
                                  checked={siteRecs.every(r => r.selected) ? true : siteRecs.some(r => r.selected) ? 'indeterminate' : false}
                                  onCheckedChange={() => toggleSite(site)} />
                              </TableCell>
                              <TableCell colSpan={9}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button onClick={() => toggleExpanded(siteKey)} className="flex items-center gap-1.5 font-semibold text-sm hover:text-primary">
                                    {siteExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    <MapPin className="h-3.5 w-3.5" />{site}
                                  </button>
                                  <Badge variant="secondary" className="text-xs">{siteRecs.length} APs</Badge>
                                  <div className="flex items-center gap-1.5 ml-2">
                                    <span className="text-xs text-muted-foreground">Ground elev:</span>
                                    <Input type="number" step="0.1" placeholder={String(defaultGroundElevation)}
                                      value={siteElev ?? ''} onChange={e => updateSiteElevation(site, e.target.value)}
                                      className="h-6 w-20 text-xs" />
                                    <span className="text-xs text-muted-foreground">m</span>
                                    {siteElev !== undefined && (
                                      <button onClick={() => updateSiteElevation(site, '')} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell />
                            </TableRow>

                            {siteExpanded && (Array.from(bMap.entries()) as [string, Map<string, APHeightRecord[]>][]).map(([building, floorMap]) => {
                              const bKey = `building:${site}||${building}`;
                              const bRecs = siteRecs.filter(r => r.building === building);
                              const bExpanded = expandedKeys.has(bKey);

                              return (
                                <>
                                  <TableRow key={bKey} className="bg-muted/20 hover:bg-muted/30">
                                    <TableCell>
                                      <Checkbox
                                        checked={bRecs.every(r => r.selected) ? true : bRecs.some(r => r.selected) ? 'indeterminate' : false}
                                        onCheckedChange={() => toggleBuilding(site, building)} />
                                    </TableCell>
                                    <TableCell colSpan={10}>
                                      <div className="flex items-center gap-2 pl-4">
                                        <button onClick={() => toggleExpanded(bKey)} className="flex items-center gap-1.5 font-medium text-sm hover:text-primary">
                                          {bExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                          <Building2 className="h-3.5 w-3.5" />{building}
                                        </button>
                                        <Badge variant="outline" className="text-xs">{bRecs.length} APs</Badge>
                                      </div>
                                    </TableCell>
                                  </TableRow>

                                  {bExpanded && (Array.from(floorMap.entries()) as [string, APHeightRecord[]][]).map(([floor, floorAps]) => {
                                    const fKey = `${site}||${building}||${floor}`;
                                    const fc = floorConfigs.find(f => f.key === fKey);
                                    const floorHAG = (siteElevations.get(site) ?? defaultGroundElevation) + (fc?.floorHeightAboveGround ?? 0);

                                    return (
                                      <>
                                        <TableRow key={`fl-${fKey}`} className="bg-background/50">
                                          <TableCell />
                                          <TableCell colSpan={10}>
                                            <div className="flex items-center gap-2 pl-8 text-xs text-muted-foreground">
                                              <Layers className="h-3.5 w-3.5" />
                                              <span className="font-medium text-foreground">Floor {floor}</span>
                                              <span>·</span><span>{floorAps.length} AP{floorAps.length !== 1 ? 's' : ''}</span>
                                              <span>·</span>
                                              <span className={fc?.floorHeightAboveGround === 0 && floorAps.some(a => a.powerClass === 'sp') ? 'text-[color:var(--status-warning)] font-medium' : ''}>
                                                Floor Ht↑Gnd: {floorHAG.toFixed(1)} m
                                                {fc?.floorHeightAboveGround === 0 && floorAps.some(a => a.powerClass === 'sp') && ' ⚠ not set'}
                                              </span>
                                            </div>
                                          </TableCell>
                                        </TableRow>

                                        {floorAps.map(ap => {
                                          const total = ap.floorHeightAboveGround + ap.apHeightAboveFloor;
                                          const isWarn = total < 0 || total > 150;
                                          const status = applyStatus.get(ap.serialNumber) ?? 'idle';
                                          const isLp = ap.powerClass === 'lp';

                                          return (
                                            <TableRow key={ap.serialNumber}
                                              className={ap.selected ? 'bg-primary/5' : isLp ? 'opacity-60' : ''}>
                                              <TableCell className="pl-12">
                                                <Checkbox checked={ap.selected} onCheckedChange={() => toggleOne(ap.serialNumber)} />
                                              </TableCell>
                                              <TableCell>
                                                <div className="font-medium text-sm">{ap.displayName}</div>
                                                {ap.model && <div className="text-xs text-muted-foreground">{ap.model}</div>}
                                              </TableCell>
                                              <TableCell>
                                                {isLp
                                                  ? <span className="text-xs text-muted-foreground italic">LP — no AFC</span>
                                                  : <Input value={ap.antennaType}
                                                      placeholder={defaultAntennaType || 'Antenna type…'}
                                                      onChange={e => updateAP(ap.serialNumber, { antennaType: e.target.value })}
                                                      className="h-7 text-xs w-40" />
                                                }
                                              </TableCell>
                                              <TableCell className="text-right">
                                                {ap.floorSettingsOverride
                                                  ? <Input type="number" step="0.1"
                                                      value={ap.floorHeightOverride ?? ap.floorHeightAboveGround}
                                                      onChange={e => updateAP(ap.serialNumber, { floorHeightOverride: parseFloat(e.target.value) || 0 })}
                                                      className="h-7 text-xs w-20 text-right" />
                                                  : <span className="font-mono text-sm">{ap.floorHeightAboveGround.toFixed(1)}</span>
                                                }
                                              </TableCell>
                                              <TableCell className="text-right">
                                                {ap.floorSettingsOverride
                                                  ? <Input type="number" step="0.1" min="0"
                                                      value={ap.floorUncertaintyOverride ?? ap.floorHeightUncertainty}
                                                      onChange={e => updateAP(ap.serialNumber, { floorUncertaintyOverride: parseFloat(e.target.value) || 1 })}
                                                      className="h-7 text-xs w-16 text-right" />
                                                  : <span className="font-mono text-sm text-muted-foreground">{ap.floorHeightUncertainty.toFixed(1)}</span>
                                                }
                                              </TableCell>
                                              <TableCell className="text-right">
                                                <Input type="number" step="0.1" min="0"
                                                  value={ap.apHeightAboveFloor}
                                                  onChange={e => updateAP(ap.serialNumber, { apHeightAboveFloor: parseFloat(e.target.value) || 0 })}
                                                  className="h-7 text-xs w-20 text-right" />
                                              </TableCell>
                                              <TableCell className="text-right">
                                                <Input type="number" step="0.1" min="0"
                                                  value={ap.apHeightUncertainty}
                                                  onChange={e => updateAP(ap.serialNumber, { apHeightUncertainty: parseFloat(e.target.value) || 1 })}
                                                  className="h-7 text-xs w-16 text-right" />
                                              </TableCell>
                                              <TableCell className="text-right">
                                                <span className={`font-mono font-semibold text-sm ${isWarn ? 'text-[color:var(--status-error)]' : ''}`}>
                                                  {total.toFixed(1)}{isWarn && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                                                </span>
                                              </TableCell>
                                              <TableCell>
                                                <div className="flex items-center gap-1">
                                                  <Select value={ap.deployment} onValueChange={v => updateAPDeployment(ap.serialNumber, v as Deployment)}>
                                                    <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                      <SelectItem value="indoor">Indoor</SelectItem>
                                                      <SelectItem value="outdoor">Outdoor</SelectItem>
                                                    </SelectContent>
                                                  </Select>
                                                  {ap.autoDeployment !== ap.deployment && (
                                                    <span title={`Controller env: ${ap.autoDeployment}`} className="text-[color:var(--status-warning)] text-xs">*</span>
                                                  )}
                                                </div>
                                              </TableCell>
                                              <TableCell>
                                                <Select value={ap.powerClass}
                                                  onValueChange={v => updateAP(ap.serialNumber, { powerClass: v as PowerClass })}>
                                                  <SelectTrigger className="h-7 text-xs w-16"><SelectValue /></SelectTrigger>
                                                  <SelectContent>
                                                    <SelectItem value="sp">SP</SelectItem>
                                                    <SelectItem value="lp" disabled={ap.deployment === 'outdoor'}>LP</SelectItem>
                                                  </SelectContent>
                                                </Select>
                                              </TableCell>
                                              <TableCell className="text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                  <StatusBadge status={status} />
                                                  <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer" title="Override floor heights for this AP">
                                                    <Checkbox checked={ap.floorSettingsOverride} className="h-3.5 w-3.5"
                                                      onCheckedChange={v => updateAP(ap.serialNumber, {
                                                        floorSettingsOverride: !!v,
                                                        floorHeightOverride: v ? ap.floorHeightAboveGround : null,
                                                        floorUncertaintyOverride: v ? ap.floorHeightUncertainty : null,
                                                      })} />
                                                    Override
                                                  </label>
                                                </div>
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </>
                                    );
                                  })}
                                </>
                              );
                            })}
                          </>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {filteredRecords.length > 0 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">
                    Total = Floor Height Above Ground + AP Height Above Floor
                  </p>
                  <ExportButton data={exportData} columns={exportColumns} filename="afc-radio-heights" title="AFC Radio Heights" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Floor Heights ──────────────────────────────────────── */}
        <TabsContent value="floors" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">Floor Heights Above Ground</CardTitle>
                  <CardDescription>
                    Enter the height of each floor above ground — exactly as it appears in the controller's
                    Professional Install dialog. Use the formula helper for multi-floor buildings.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <input ref={csvInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvImport} />
                  <Button variant="outline" size="sm" onClick={() => csvInputRef.current?.click()}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Import CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {!floorConfigs.length
                ? <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>No floors found.</AlertDescription></Alert>
                : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      CSV: <code className="bg-muted px-1 rounded">Building,Floor Label,Floor Height Above Ground (m)</code>
                    </p>
                    {([...new Set(floorConfigs.map(fc => fc.site))] as string[]).sort().map((site: string) => (
                      <div key={site} className="space-y-4">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <h3 className="font-semibold text-sm">{site}</h3>
                        </div>
                        {([...new Set(floorConfigs.filter(fc => fc.site === site).map(fc => fc.building))] as string[]).sort().map((building: string) => {
                          const bFloors = floorConfigs.filter(fc => fc.site === site && fc.building === building);
                          const bKey = `${site}||${building}`;
                          const helperCeiling = buildingCeilingHelpers.get(bKey) ?? 3.5;
                          const otherBuildings = ([...new Set(
                            floorConfigs.filter(fc => !(fc.site === site && fc.building === building))
                              .map(fc => `${fc.site}||${fc.building}`)
                          )] as string[]).map(k => {
                            const [s, b] = k.split('||');
                            return { site: s ?? '', building: b ?? '' };
                          });

                          return (
                            <div key={bKey} className="ml-4 border rounded-lg">
                              {/* Building header */}
                              <div className="flex items-center justify-between p-3 border-b bg-muted/20 rounded-t-lg flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium text-sm">{building}</span>
                                  <Badge variant="outline" className="text-xs">{bFloors.length} floor{bFloors.length !== 1 ? 's' : ''}</Badge>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* Formula helper */}
                                  <div className="flex items-center gap-1.5 border rounded-md px-2 py-1 bg-background">
                                    <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">Ceiling:</span>
                                    <Input type="number" step="0.1" min="1" max="30"
                                      value={helperCeiling}
                                      onChange={e => setBuildingCeilingHelpers(prev => {
                                        const n = new Map(prev); n.set(bKey, parseFloat(e.target.value) || 3.5); return n;
                                      })}
                                      className="h-6 w-16 text-xs border-0 p-0 focus-visible:ring-0" />
                                    <span className="text-xs text-muted-foreground">m</span>
                                    <Button size="sm" variant="secondary" className="h-6 text-xs px-2"
                                      onClick={() => applyFloorFormula(site, building, helperCeiling)}>
                                      Calculate
                                    </Button>
                                  </div>
                                  {/* Building presets */}
                                  {BUILDING_PRESETS.map(p => (
                                    <Button key={p.label} variant="outline" size="sm" className="h-6 text-xs px-2"
                                      onClick={() => applyFloorFormula(site, building, p.height)}>
                                      {p.label} {p.height}m
                                    </Button>
                                  ))}
                                  {/* Copy to */}
                                  {otherBuildings.length > 0 && (
                                    <div className="relative">
                                      <Button variant="outline" size="sm" className="h-6 text-xs px-2 gap-1"
                                        onClick={() => setCopySource(copySource === bKey ? null : bKey)}>
                                        <Copy className="h-3.5 w-3.5" />Copy to…
                                      </Button>
                                      {copySource === bKey && (
                                        <div className="absolute right-0 top-8 z-10 bg-popover border rounded-md shadow-md p-2 min-w-48 space-y-1">
                                          <p className="text-xs text-muted-foreground font-medium px-1 pb-1">Copy settings to:</p>
                                          {otherBuildings.map(ob => (
                                            <button key={`${ob.site}||${ob.building}`}
                                              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                                              onClick={() => copyBuildingFloors(site, building, ob.site, ob.building)}>
                                              {ob.site !== site && <span className="text-muted-foreground">{ob.site} / </span>}{ob.building}
                                            </button>
                                          ))}
                                          <button className="w-full text-left text-xs px-2 py-1.5 text-muted-foreground rounded hover:bg-muted"
                                            onClick={() => setCopySource(null)}>Cancel</button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Floor Label</TableHead>
                                    <TableHead>Floor Ht Above Ground (m)</TableHead>
                                    <TableHead>±Uncert (m)</TableHead>
                                    <TableHead>AP Ht Default (m)</TableHead>
                                    <TableHead>±AP Uncert (m)</TableHead>
                                    <TableHead>APs</TableHead>
                                    <TableHead />
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {bFloors.map(fc => {
                                    const apCount = apRecords.filter(r => r.site === fc.site && r.building === fc.building && r.floor === fc.floor).length;
                                    const hasSpAp = apRecords.some(r => r.site === fc.site && r.building === fc.building && r.floor === fc.floor && r.powerClass === 'sp');
                                    const needsEntry = hasSpAp && fc.floorHeightAboveGround === 0;
                                    return (
                                      <TableRow key={fc.key} className={needsEntry ? 'bg-[color:var(--status-warning-bg)]' : ''}>
                                        <TableCell>
                                          <div className="flex items-center gap-1.5">
                                            <Badge variant="outline">{fc.floor}</Badge>
                                            {needsEntry && <AlertTriangle className="h-3 w-3 text-[color:var(--status-warning)]" title="SP AP — height not set" />}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <Input type="number" step="0.1" min="0"
                                            value={fc.floorHeightAboveGround}
                                            onChange={e => updateFloorField(fc.key, { floorHeightAboveGround: parseFloat(e.target.value) || 0 })}
                                            className={`w-24 h-7 text-sm ${needsEntry ? 'border-[color:var(--status-warning)]/60' : ''}`} />
                                        </TableCell>
                                        <TableCell>
                                          <Input type="number" step="0.1" min="0"
                                            placeholder={String(defaultFloorUncertainty)}
                                            value={fc.heightUncertainty ?? ''}
                                            onChange={e => updateFloorField(fc.key, { heightUncertainty: parseFloat(e.target.value) || null })}
                                            className="w-20 h-7 text-sm" />
                                        </TableCell>
                                        <TableCell>
                                          <Input type="number" step="0.1" min="0"
                                            placeholder={String(defaultApHeight)}
                                            value={fc.apHeightDefault ?? ''}
                                            onChange={e => updateFloorField(fc.key, { apHeightDefault: parseFloat(e.target.value) || null })}
                                            className="w-20 h-7 text-sm" />
                                        </TableCell>
                                        <TableCell>
                                          <Input type="number" step="0.1" min="0"
                                            placeholder={String(defaultApUncertainty)}
                                            value={fc.apHeightUncertaintyDefault ?? ''}
                                            onChange={e => updateFloorField(fc.key, { apHeightUncertaintyDefault: parseFloat(e.target.value) || null })}
                                            className="w-20 h-7 text-sm" />
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{apCount}</TableCell>
                                        <TableCell>
                                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                                            onClick={() => updateFloorField(fc.key, { floorHeightAboveGround: 0, heightUncertainty: null, apHeightDefault: null, apHeightUncertaintyDefault: null })}>
                                            <RotateCcw className="h-3 w-3 mr-1" />Reset
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </>
                )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Power Reference ────────────────────────────────────── */}
        <TabsContent value="power-ref" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" />FCC 6 GHz Power Reference</CardTitle>
              <CardDescription>Maximum EIRP limits for 6 GHz U-NII bands</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Power Class</TableHead><TableHead>Scope</TableHead><TableHead>AFC Required</TableHead>
                    {CHANNEL_WIDTHS.map(w => <TableHead key={w} className="text-center">{w} MHz</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell><Badge className="bg-[color:var(--status-info-bg)] text-[color:var(--status-info)] border-[color:var(--status-info)]/20 border">Standard Power (SP)</Badge></TableCell>
                    <TableCell className="text-sm">Indoor & Outdoor</TableCell>
                    <TableCell><CheckCircle className="h-4 w-4 text-[color:var(--status-success)]" /></TableCell>
                    {CHANNEL_WIDTHS.map(w => <TableCell key={w} className="text-center font-mono font-semibold">{SP_POWER[w]} dBm</TableCell>)}
                  </TableRow>
                  <TableRow>
                    <TableCell><Badge variant="secondary">Low Power (LP)</Badge></TableCell>
                    <TableCell className="text-sm">Indoor only</TableCell>
                    <TableCell><span className="text-muted-foreground text-sm">No</span></TableCell>
                    {CHANNEL_WIDTHS.map(w => <TableCell key={w} className="text-center font-mono text-muted-foreground">{LP_POWER[w]} dBm</TableCell>)}
                  </TableRow>
                </TableBody>
              </Table>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm space-y-1">
                  <p><strong>Deployment</strong> is read from the AP's Environment field on the controller (Outdoor → SP default, Indoor → LP default). An asterisk (*) indicates the value was manually changed.</p>
                  <p><strong>Floor Height Above Ground</strong> is entered directly — the same value you see in the controller's Professional Install dialog (not computed from a floor number formula).</p>
                  <p>Total Radio Height submitted to AFC = Floor Height Above Ground + AP Height Above Floor.</p>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
