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
  AlertTriangle, CheckCheck, MapPin, X, Trash2,
} from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';
import { ExportButton } from './ExportButton';

// ── Types ─────────────────────────────────────────────────────────────────────

type Deployment = 'indoor' | 'outdoor';
type PowerClass = 'sp' | 'lp';
type ApplyStatus = 'idle' | 'applied' | 'error';

interface FloorConfig {
  key: string;          // `${site}||${building}||${floor}`
  site: string;
  building: string;
  floor: string;
  floorNumber: number;
  heightOverride: number | null;
}

interface APHeightRecord {
  serialNumber: string;
  displayName: string;
  model: string;
  site: string;
  building: string;
  floor: string;
  floorNumber: number;
  calculatedHeight: number;
  deployment: Deployment;
  powerClass: PowerClass;
  selected: boolean;
  autoDeployment: Deployment;
}

interface ConfigProfile {
  name: string;
  createdAt: string;
  defaultFloorHeight: number;
  defaultGroundElevation: number;
  mountOffset: number;
  defaultDeployment: Deployment;
  defaultPowerClass: PowerClass;
  siteElevations: Record<string, number>;
  floorOverrides: Record<string, number | null>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SP_POWER: Record<string, number> = { '20': 36, '40': 39, '80': 42, '160': 45 };
const LP_POWER: Record<string, number> = { '20': 30, '40': 33, '80': 36, '160': 39 };
const CHANNEL_WIDTHS = ['20', '40', '80', '160'] as const;

const OUTDOOR_MODEL_PATTERNS = ['AP460C', 'AP460S', 'AP560H', 'AP360E'];

const BUILDING_PRESETS = [
  { label: 'Office', height: 3.5 },
  { label: 'Warehouse', height: 8.0 },
  { label: 'Hospital', height: 4.0 },
  { label: 'Retail', height: 3.0 },
  { label: 'Data Center', height: 2.5 },
] as const;

const PROFILES_KEY = 'afc-radio-height-profiles';

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
  if (!isNaN(n)) return n === 0 ? 1 : n;
  return 1;
}

function calcHeight(floorNumber: number, floorHeight: number, groundElevation: number, mountOffset: number): number {
  return groundElevation + (floorNumber - 1) * floorHeight + mountOffset;
}

function getPower(pc: PowerClass): Record<string, number> {
  return pc === 'sp' ? SP_POWER : LP_POWER;
}

function detectDeployment(model: string): Deployment {
  const m = model.toUpperCase();
  return OUTDOOR_MODEL_PATTERNS.some(p => m.includes(p)) ? 'outdoor' : 'indoor';
}

function parseFloorCsv(text: string): { building: string; floor: string; height: number }[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const start = (lines[0] ?? '').toLowerCase().includes('building') ? 1 : 0;
  const result: { building: string; floor: string; height: number }[] = [];
  for (let i = start; i < lines.length; i++) {
    const parts = (lines[i] ?? '').split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    if (parts.length >= 3) {
      const height = parseFloat(parts[2] ?? '');
      if (!isNaN(height) && height > 0) {
        result.push({ building: parts[0] ?? '', floor: parts[1] ?? '', height });
      }
    }
  }
  return result;
}

// ── Status badge sub-component ────────────────────────────────────────────────

function StatusBadge({ status }: { status: ApplyStatus }) {
  if (status === 'applied') return (
    <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/30 text-xs gap-1">
      <CheckCircle className="h-2.5 w-2.5" /> Applied
    </Badge>
  );
  if (status === 'error') return (
    <Badge className="bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/30 text-xs gap-1">
      <AlertCircle className="h-2.5 w-2.5" /> Error
    </Badge>
  );
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">Pending</Badge>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AFCRadioHeightCalculator() {
  // Global settings
  const [defaultFloorHeight, setDefaultFloorHeight] = useState(3.5);
  const [defaultGroundElevation, setDefaultGroundElevation] = useState(0);
  const [mountOffset, setMountOffset] = useState(0.3);
  const [defaultDeployment, setDefaultDeployment] = useState<Deployment>('indoor');
  const [defaultPowerClass, setDefaultPowerClass] = useState<PowerClass>('sp');

  // Per-site ground elevations
  const [siteElevations, setSiteElevations] = useState<Map<string, number>>(new Map());

  // Data
  const [apRecords, setApRecords] = useState<APHeightRecord[]>([]);
  const [floorConfigs, setFloorConfigs] = useState<FloorConfig[]>([]);
  const [applyStatus, setApplyStatus] = useState<Map<string, ApplyStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ current: number; total: number } | null>(null);
  const [activeTab, setActiveTab] = useState('aps');

  // Filtering / scoping
  const [selectedSite, setSelectedSite] = useState('__all__');
  const [searchQuery, setSearchQuery] = useState('');

  // Tree collapse state
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Profiles
  const [profiles, setProfiles] = useState<ConfigProfile[]>(() => {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'); } catch { return []; }
  });
  const [newProfileName, setNewProfileName] = useState('');
  const [showProfiles, setShowProfiles] = useState(false);

  // Copy-building state (building key -> show dropdown)
  const [copySource, setCopySource] = useState<string | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);

  // ── Derived: unique sites ──────────────────────────────────────────────────

  const allSites = useMemo(() => {
    const s = new Set(apRecords.map(r => r.site));
    return Array.from(s).sort();
  }, [apRecords]);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [aps, savedHeights] = await Promise.allSettled([
        apiService.getAccessPoints(),
        apiService.makeAuthenticatedRequest('/v1/afc/radio-heights')
          .then(r => r.ok ? r.json() : []).catch(() => [])
      ]);

      const apList = aps.status === 'fulfilled' ? aps.value : [];
      const saved: Record<string, Partial<APHeightRecord>> = {};
      if (savedHeights.status === 'fulfilled' && Array.isArray(savedHeights.value)) {
        savedHeights.value.forEach((h: any) => { saved[h.serialNumber] = h; });
      }

      // Build unique floor configs
      const floorMap = new Map<string, FloorConfig>();
      apList.forEach(ap => {
        const site = ap.hostSite || ap.site || 'Unknown Site';
        const building = ap.building || site;
        const floor = ap.floor || ap.floorName || '1';
        const key = `${site}||${building}||${floor}`;
        if (!floorMap.has(key)) {
          floorMap.set(key, { key, site, building, floor, floorNumber: parseFloorNumber(floor), heightOverride: null });
        }
      });

      const floors = Array.from(floorMap.values()).sort((a, b) => {
        if (a.site !== b.site) return a.site.localeCompare(b.site);
        if (a.building !== b.building) return a.building.localeCompare(b.building);
        return a.floorNumber - b.floorNumber;
      });
      setFloorConfigs(floors);

      // Default: expand all sites and buildings
      const initialExpanded = new Set<string>();
      const seenSites = new Set<string>();
      const seenBuildings = new Set<string>();
      floors.forEach(fc => {
        if (!seenSites.has(fc.site)) { seenSites.add(fc.site); initialExpanded.add(`site:${fc.site}`); }
        const bk = `building:${fc.site}||${fc.building}`;
        if (!seenBuildings.has(bk)) { seenBuildings.add(bk); initialExpanded.add(bk); }
      });
      setExpandedKeys(initialExpanded);

      // Build AP records
      const records: APHeightRecord[] = apList.map(ap => {
        const site = ap.hostSite || ap.site || 'Unknown Site';
        const building = ap.building || site;
        const floor = ap.floor || ap.floorName || '1';
        const key = `${site}||${building}||${floor}`;
        const fc = floorMap.get(key);
        const floorNumber = fc?.floorNumber ?? parseFloorNumber(floor);
        const model = ap.model || ap.apModel || ap.deviceModel || ap.platformName || '';
        const autoDeployment = detectDeployment(model);
        const s = saved[ap.serialNumber] || {};
        return {
          serialNumber: ap.serialNumber,
          displayName: ap.displayName || ap.hostname || ap.serialNumber,
          model,
          site,
          building,
          floor,
          floorNumber,
          calculatedHeight: calcHeight(floorNumber, fc?.heightOverride ?? 3.5, 0, 0.3),
          deployment: (s.deployment as Deployment) ?? autoDeployment,
          powerClass: (s.powerClass as PowerClass) ?? 'sp',
          selected: false,
          autoDeployment,
        };
      });

      setApRecords(records);
      setApplyStatus(new Map(records.map(r => [r.serialNumber, 'idle'])));
    } catch (error) {
      console.error('[AFCRadioHeightCalculator] Failed to load data:', error);
      toast.error('Failed to load access point data');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  // Recalculate heights when any setting changes
  const recalculate = useCallback(() => {
    const floorMap = new Map<string, FloorConfig>(floorConfigs.map(fc => [fc.key, fc]));
    setApRecords(prev => prev.map(ap => {
      const key = `${ap.site}||${ap.building}||${ap.floor}`;
      const fc = floorMap.get(key);
      const effectiveFloorHeight = fc?.heightOverride ?? defaultFloorHeight;
      const elevation = siteElevations.get(ap.site) ?? defaultGroundElevation;
      return { ...ap, calculatedHeight: calcHeight(ap.floorNumber, effectiveFloorHeight, elevation, mountOffset) };
    }));
  }, [floorConfigs, defaultFloorHeight, defaultGroundElevation, mountOffset, siteElevations]);

  useEffect(() => { recalculate(); }, [recalculate]);

  // ── Filtered records ───────────────────────────────────────────────────────

  const filteredRecords = useMemo(() => {
    let records = apRecords;
    if (selectedSite !== '__all__') records = records.filter(r => r.site === selectedSite);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      records = records.filter(r =>
        r.displayName.toLowerCase().includes(q) ||
        r.building.toLowerCase().includes(q) ||
        r.floor.toLowerCase().includes(q) ||
        r.site.toLowerCase().includes(q) ||
        r.serialNumber.toLowerCase().includes(q)
      );
    }
    return records;
  }, [apRecords, selectedSite, searchQuery]);

  // ── Hierarchy ──────────────────────────────────────────────────────────────

  const hierarchy = useMemo(() => {
    const siteMap = new Map<string, Map<string, Map<string, APHeightRecord[]>>>();
    filteredRecords.forEach(ap => {
      if (!siteMap.has(ap.site)) siteMap.set(ap.site, new Map());
      const bMap = siteMap.get(ap.site)!;
      if (!bMap.has(ap.building)) bMap.set(ap.building, new Map());
      const fMap = bMap.get(ap.building)!;
      if (!fMap.has(ap.floor)) fMap.set(ap.floor, []);
      fMap.get(ap.floor)!.push(ap);
    });
    return siteMap;
  }, [filteredRecords]);

  // ── Validation warnings ────────────────────────────────────────────────────

  const validationWarnings = useMemo(() =>
    filteredRecords.filter(r => r.calculatedHeight < 0 || r.calculatedHeight > 150),
    [filteredRecords]
  );

  // ── Selection ──────────────────────────────────────────────────────────────

  const selectedCount = filteredRecords.filter(r => r.selected).length;
  const allSelected = filteredRecords.length > 0 && selectedCount === filteredRecords.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleAll = () => {
    const next = !allSelected;
    const sns = new Set(filteredRecords.map(r => r.serialNumber));
    setApRecords(prev => prev.map(r => sns.has(r.serialNumber) ? { ...r, selected: next } : r));
  };

  const toggleOne = (sn: string) => {
    setApRecords(prev => prev.map(r => r.serialNumber === sn ? { ...r, selected: !r.selected } : r));
  };

  const toggleSite = (site: string) => {
    const siteRecs = filteredRecords.filter(r => r.site === site);
    const allSel = siteRecs.every(r => r.selected);
    const sns = new Set(siteRecs.map(r => r.serialNumber));
    setApRecords(prev => prev.map(r => sns.has(r.serialNumber) ? { ...r, selected: !allSel } : r));
  };

  const toggleBuilding = (site: string, building: string) => {
    const bRecs = filteredRecords.filter(r => r.site === site && r.building === building);
    const allSel = bRecs.every(r => r.selected);
    const sns = new Set(bRecs.map(r => r.serialNumber));
    setApRecords(prev => prev.map(r => sns.has(r.serialNumber) ? { ...r, selected: !allSel } : r));
  };

  // ── Expand / collapse ──────────────────────────────────────────────────────

  const toggleExpanded = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    const keys = new Set<string>();
    hierarchy.forEach((bMap, site) => {
      keys.add(`site:${site}`);
      bMap.forEach((_, building) => keys.add(`building:${site}||${building}`));
    });
    setExpandedKeys(keys);
  };

  const collapseAll = () => setExpandedKeys(new Set());

  // ── Bulk actions ───────────────────────────────────────────────────────────

  const bulkSetDeployment = (d: Deployment) => {
    setApRecords(prev => prev.map(r => {
      if (!r.selected) return r;
      const powerClass = d === 'outdoor' && r.powerClass === 'lp' ? 'sp' : r.powerClass;
      return { ...r, deployment: d, powerClass };
    }));
  };

  const bulkSetPowerClass = (pc: PowerClass) => {
    setApRecords(prev => prev.map(r => {
      if (!r.selected) return r;
      if (pc === 'lp' && r.deployment === 'outdoor') return r;
      return { ...r, powerClass: pc };
    }));
  };

  const updateAPField = (sn: string, field: 'deployment' | 'powerClass', value: string) => {
    setApRecords(prev => prev.map(r => {
      if (r.serialNumber !== sn) return r;
      if (field === 'deployment') {
        const d = value as Deployment;
        return { ...r, deployment: d, powerClass: d === 'outdoor' && r.powerClass === 'lp' ? 'sp' : r.powerClass };
      }
      return { ...r, [field]: value };
    }));
  };

  // ── Floor overrides ────────────────────────────────────────────────────────

  const updateFloorHeight = (key: string, value: string) => {
    const num = parseFloat(value);
    setFloorConfigs(prev => prev.map(fc => fc.key === key ? { ...fc, heightOverride: isNaN(num) ? null : num } : fc));
  };

  const resetFloorHeight = (key: string) => {
    setFloorConfigs(prev => prev.map(fc => fc.key === key ? { ...fc, heightOverride: null } : fc));
  };

  const applyBuildingPreset = (site: string, building: string, height: number) => {
    setFloorConfigs(prev => prev.map(fc =>
      fc.site === site && fc.building === building ? { ...fc, heightOverride: height } : fc
    ));
    toast.success(`Applied ${height}m floor height to all floors in ${building}`);
  };

  const copyBuildingFloors = (sourceSite: string, sourceBuilding: string, targetSite: string, targetBuilding: string) => {
    const srcFloors = floorConfigs.filter(fc => fc.site === sourceSite && fc.building === sourceBuilding);
    setFloorConfigs(prev => prev.map(fc => {
      if (fc.site !== targetSite || fc.building !== targetBuilding) return fc;
      const match = srcFloors.find(sf => sf.floor === fc.floor);
      return match ? { ...fc, heightOverride: match.heightOverride } : fc;
    }));
    toast.success(`Copied floor heights from ${sourceBuilding} → ${targetBuilding}`);
    setCopySource(null);
  };

  // ── CSV import ─────────────────────────────────────────────────────────────

  const handleCsvImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseFloorCsv(ev.target?.result as string);
      if (rows.length === 0) {
        toast.error('No valid rows found. Expected columns: Building, Floor Label, Height (m)');
        return;
      }
      let updated = 0;
      setFloorConfigs(prev => {
        const next = [...prev];
        rows.forEach(row => {
          const idx = next.findIndex(fc =>
            fc.building.toLowerCase() === row.building.toLowerCase() &&
            fc.floor.toLowerCase() === row.floor.toLowerCase()
          );
          if (idx >= 0) { next[idx] = { ...next[idx], heightOverride: row.height }; updated++; }
        });
        return next;
      });
      toast.success(`Imported ${rows.length} rows, updated ${updated} floor(s)`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Per-site elevation ─────────────────────────────────────────────────────

  const updateSiteElevation = (site: string, value: string) => {
    const num = parseFloat(value);
    setSiteElevations(prev => {
      const next = new Map(prev);
      if (isNaN(num)) next.delete(site); else next.set(site, num);
      return next;
    });
  };

  // ── Apply (batched with progress) ─────────────────────────────────────────

  const applyRecords = async (toApply: APHeightRecord[]) => {
    if (toApply.length === 0) { toast.error('No APs to apply'); return; }
    setApplying(true);
    setApplyProgress({ current: 0, total: toApply.length });

    const BATCH = 50;
    let applied = 0;
    let failed = 0;

    for (let i = 0; i < toApply.length; i += BATCH) {
      const batch = toApply.slice(i, i + BATCH);
      try {
        const response = await apiService.makeAuthenticatedRequest('/v1/afc/radio-heights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch.map(r => ({
            serialNumber: r.serialNumber,
            displayName: r.displayName,
            height: parseFloat(r.calculatedHeight.toFixed(2)),
            deployment: r.deployment,
            powerClass: r.powerClass,
          })))
        });
        if (!response.ok) throw new Error(`${response.status}`);
        setApplyStatus(prev => {
          const next = new Map(prev);
          batch.forEach(r => next.set(r.serialNumber, 'applied'));
          return next;
        });
        applied += batch.length;
      } catch {
        setApplyStatus(prev => {
          const next = new Map(prev);
          batch.forEach(r => next.set(r.serialNumber, 'error'));
          return next;
        });
        failed += batch.length;
      }
      setApplyProgress({ current: Math.min(i + BATCH, toApply.length), total: toApply.length });
    }

    setApplying(false);
    setApplyProgress(null);
    if (failed === 0) toast.success(`Saved ${applied} radio height record(s)`);
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
      defaultFloorHeight, defaultGroundElevation, mountOffset, defaultDeployment, defaultPowerClass,
      siteElevations: Object.fromEntries(siteElevations),
      floorOverrides: Object.fromEntries(floorConfigs.filter(fc => fc.heightOverride !== null).map(fc => [fc.key, fc.heightOverride])),
    };
    const updated = [...profiles.filter(p => p.name !== name), profile];
    setProfiles(updated);
    localStorage.setItem(PROFILES_KEY, JSON.stringify(updated));
    setNewProfileName('');
    toast.success(`Profile "${name}" saved`);
  };

  const loadProfile = (profile: ConfigProfile) => {
    setDefaultFloorHeight(profile.defaultFloorHeight);
    setDefaultGroundElevation(profile.defaultGroundElevation);
    setMountOffset(profile.mountOffset);
    setDefaultDeployment(profile.defaultDeployment);
    setDefaultPowerClass(profile.defaultPowerClass);
    setSiteElevations(new Map(Object.entries(profile.siteElevations)));
    setFloorConfigs(prev => prev.map(fc => ({ ...fc, heightOverride: (profile.floorOverrides[fc.key] as number) ?? null })));
    toast.success(`Profile "${profile.name}" loaded`);
    setShowProfiles(false);
  };

  const deleteProfile = (name: string) => {
    const updated = profiles.filter(p => p.name !== name);
    setProfiles(updated);
    localStorage.setItem(PROFILES_KEY, JSON.stringify(updated));
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const exportData = useMemo(() =>
    filteredRecords.map(r => ({
      serialNumber: r.serialNumber, displayName: r.displayName,
      site: r.site, building: r.building, floor: r.floor, floorNumber: r.floorNumber,
      calculatedHeight: r.calculatedHeight.toFixed(2), deployment: r.deployment,
      powerClass: r.powerClass.toUpperCase(),
      maxEirp20MHz: getPower(r.powerClass)['20'],
      maxEirp80MHz: getPower(r.powerClass)['80'],
      maxEirp160MHz: getPower(r.powerClass)['160'],
    })), [filteredRecords]);

  const exportColumns = [
    { key: 'serialNumber', label: 'Serial Number' }, { key: 'displayName', label: 'AP Name' },
    { key: 'site', label: 'Site' }, { key: 'building', label: 'Building' },
    { key: 'floor', label: 'Floor' }, { key: 'floorNumber', label: 'Floor #' },
    { key: 'calculatedHeight', label: 'Radio Height (m)' }, { key: 'deployment', label: 'Deployment' },
    { key: 'powerClass', label: 'Power Class' }, { key: 'maxEirp20MHz', label: 'Max EIRP 20 MHz (dBm)' },
    { key: 'maxEirp80MHz', label: 'Max EIRP 80 MHz (dBm)' }, { key: 'maxEirp160MHz', label: 'Max EIRP 160 MHz (dBm)' },
  ];

  // ── Render: loading ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // ── Render: main ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 p-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            AFC Radio Height Calculator
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Bulk-calculate and assign radio heights for AFC Standard Power compliance
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowProfiles(v => !v)}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Profiles {profiles.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{profiles.length}</Badge>}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleApplyAll}
            disabled={applying || filteredRecords.length === 0}
            className="gap-1.5"
          >
            {applying && applyProgress
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving {applyProgress.current}/{applyProgress.total}…</>
              : <><CheckCheck className="h-4 w-4" /> Apply All ({filteredRecords.length})</>
            }
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Profiles panel */}
      {showProfiles && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2"><FolderOpen className="h-4 w-4" /> Named Config Profiles</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowProfiles(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Profile name…"
                value={newProfileName}
                onChange={e => setNewProfileName(e.target.value)}
                className="h-8 text-sm max-w-xs"
                onKeyDown={e => e.key === 'Enter' && saveProfile()}
              />
              <Button size="sm" onClick={saveProfile} className="gap-1.5">
                <Save className="h-3.5 w-3.5" /> Save Current
              </Button>
            </div>
            {profiles.length === 0 ? (
              <p className="text-xs text-muted-foreground">No saved profiles yet.</p>
            ) : (
              <div className="space-y-1.5">
                {profiles.map(p => (
                  <div key={p.name} className="flex items-center justify-between p-2 rounded-md border bg-muted/30">
                    <div>
                      <span className="text-sm font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        Saved {new Date(p.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => loadProfile(p)}>
                        Load
                      </Button>
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

      <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Standard Power (SP)</strong> devices require AFC coordination for 6 GHz operation. Radio height above
          ground is a mandatory parameter submitted to the AFC service provider.{' '}
          <strong>Low Power (LP)</strong> devices operate indoors only and do not require AFC.
        </AlertDescription>
      </Alert>

      {/* Global Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Global Settings</CardTitle>
          <CardDescription>Defaults applied to all APs unless overridden per-site or per-floor</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Default Floor Height (m)</Label>
              <Input type="number" step="0.1" min="1" max="20" value={defaultFloorHeight}
                onChange={e => setDefaultFloorHeight(parseFloat(e.target.value) || 3.5)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default Ground Elevation (m)</Label>
              <Input type="number" step="0.1" value={defaultGroundElevation}
                onChange={e => setDefaultGroundElevation(parseFloat(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground">Override per-site below</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mount Offset (m)</Label>
              <Input type="number" step="0.1" min="0" max="5" value={mountOffset}
                onChange={e => setMountOffset(parseFloat(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground">Radio height above floor</p>
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
                  <SelectItem value="sp">Standard Power (SP)</SelectItem>
                  <SelectItem value="lp">Low Power (LP)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="aps" className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            APs & Heights
            <Badge variant="secondary" className="ml-1 text-xs">{filteredRecords.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="floors" className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Floor Overrides
            <Badge variant="secondary" className="ml-1 text-xs">{floorConfigs.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="power-ref" className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Power Reference
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: APs & Heights ───────────────────────────────────────── */}
        <TabsContent value="aps" className="mt-4 space-y-3">

          {/* Toolbar: site filter + search + expand controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger className="h-8 text-sm w-52">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Sites ({apRecords.length} APs)</SelectItem>
                  {allSites.map(s => (
                    <SelectItem key={s} value={s}>
                      {s} ({apRecords.filter(r => r.site === s).length} APs)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1 min-w-48 max-w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search AP name, building, floor…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={expandAll}>Expand All</Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={collapseAll}>Collapse All</Button>
            </div>
          </div>

          {/* Validation warnings */}
          {validationWarnings.length > 0 && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm">
                <strong>{validationWarnings.length} AP{validationWarnings.length !== 1 ? 's' : ''} have unusual heights:</strong>{' '}
                {validationWarnings.map(r => (
                  <span key={r.serialNumber} className="inline-block mr-2 text-amber-700 dark:text-amber-400">
                    {r.displayName} ({r.calculatedHeight.toFixed(1)} m)
                  </span>
                ))}
                — verify ground elevation and floor configuration.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardContent className="pt-4 space-y-3">

              {/* Bulk action bar */}
              {selectedCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 rounded-lg border">
                  <span className="text-sm font-medium text-muted-foreground">
                    {selectedCount} AP{selectedCount !== 1 ? 's' : ''} selected:
                  </span>
                  <Button size="sm" variant="outline" onClick={() => bulkSetDeployment('indoor')}>Set Indoor</Button>
                  <Button size="sm" variant="outline" onClick={() => bulkSetDeployment('outdoor')}>Set Outdoor</Button>
                  <Button size="sm" variant="outline" onClick={() => bulkSetPowerClass('sp')}>Set SP</Button>
                  <Button size="sm" variant="outline" onClick={() => bulkSetPowerClass('lp')}>Set LP (indoor)</Button>
                  <div className="flex-1" />
                  <Button size="sm" onClick={handleApplySelected} disabled={applying} className="gap-1.5">
                    {applying
                      ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      : <Upload className="h-3.5 w-3.5" />
                    }
                    Apply Selected
                  </Button>
                </div>
              )}

              {/* Hierarchical AP table */}
              {filteredRecords.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {apRecords.length === 0
                      ? 'No access points found. Make sure you are connected to the controller.'
                      : 'No access points match the current filter.'}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                            onCheckedChange={toggleAll}
                            aria-label="Select all"
                          />
                        </TableHead>
                        <TableHead>AP Name</TableHead>
                        <TableHead>Floor</TableHead>
                        <TableHead className="text-right">Height (m)</TableHead>
                        <TableHead>Deployment</TableHead>
                        <TableHead>Power</TableHead>
                        <TableHead className="text-center">20 MHz</TableHead>
                        <TableHead className="text-center">80 MHz</TableHead>
                        <TableHead className="text-center">160 MHz</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(Array.from(hierarchy.entries()) as [string, Map<string, Map<string, APHeightRecord[]>>][]).map(([site, bMap]) => {
                        const siteKey = `site:${site}`;
                        const siteRecs = filteredRecords.filter(r => r.site === site);
                        const siteExpanded = expandedKeys.has(siteKey);
                        const siteElevation = siteElevations.get(site);

                        return (
                          <>
                            {/* Site header row */}
                            <TableRow key={siteKey} className="bg-muted/40 hover:bg-muted/50">
                              <TableCell>
                                <Checkbox
                                  checked={siteRecs.every(r => r.selected) ? true : siteRecs.some(r => r.selected) ? 'indeterminate' : false}
                                  onCheckedChange={() => toggleSite(site)}
                                />
                              </TableCell>
                              <TableCell colSpan={8}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button onClick={() => toggleExpanded(siteKey)} className="flex items-center gap-1.5 font-semibold text-sm hover:text-primary transition-colors">
                                    {siteExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    <MapPin className="h-3.5 w-3.5" />
                                    {site}
                                  </button>
                                  <Badge variant="secondary" className="text-xs">{siteRecs.length} APs</Badge>
                                  <div className="flex items-center gap-1.5 ml-2">
                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">Elevation:</span>
                                    <Input
                                      type="number"
                                      step="0.1"
                                      placeholder={String(defaultGroundElevation)}
                                      value={siteElevation ?? ''}
                                      onChange={e => updateSiteElevation(site, e.target.value)}
                                      className="h-6 w-20 text-xs"
                                    />
                                    <span className="text-xs text-muted-foreground">m</span>
                                    {siteElevation !== undefined && (
                                      <button onClick={() => updateSiteElevation(site, '')} className="text-muted-foreground hover:text-foreground">
                                        <X className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell />
                            </TableRow>

                            {/* Buildings */}
                            {siteExpanded && (Array.from(bMap.entries()) as [string, Map<string, APHeightRecord[]>][]).map(([building, floorMap]) => {
                              const bKey = `building:${site}||${building}`;
                              const bRecs = siteRecs.filter(r => r.building === building);
                              const bExpanded = expandedKeys.has(bKey);

                              return (
                                <>
                                  {/* Building header row */}
                                  <TableRow key={bKey} className="bg-muted/20 hover:bg-muted/30">
                                    <TableCell>
                                      <Checkbox
                                        checked={bRecs.every(r => r.selected) ? true : bRecs.some(r => r.selected) ? 'indeterminate' : false}
                                        onCheckedChange={() => toggleBuilding(site, building)}
                                      />
                                    </TableCell>
                                    <TableCell colSpan={9}>
                                      <div className="flex items-center gap-2 flex-wrap pl-4">
                                        <button onClick={() => toggleExpanded(bKey)} className="flex items-center gap-1.5 font-medium text-sm hover:text-primary transition-colors">
                                          {bExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                          <Building2 className="h-3.5 w-3.5" />
                                          {building}
                                        </button>
                                        <Badge variant="outline" className="text-xs">{bRecs.length} APs</Badge>
                                      </div>
                                    </TableCell>
                                  </TableRow>

                                  {/* APs grouped by floor */}
                                  {bExpanded && (Array.from(floorMap.entries()) as [string, APHeightRecord[]][]).map(([floor, floorAps]) => {
                                    const fKey = `${site}||${building}||${floor}`;
                                    const fc = floorConfigs.find(f => f.key === fKey);
                                    const effHeight = fc?.heightOverride ?? defaultFloorHeight;

                                    return (
                                      <>
                                        {/* Floor label row */}
                                        <TableRow key={`floor-${fKey}`} className="bg-background/50">
                                          <TableCell />
                                          <TableCell colSpan={9}>
                                            <div className="flex items-center gap-2 pl-8 text-xs text-muted-foreground">
                                              <Layers className="h-3 w-3" />
                                              <span className="font-medium text-foreground">Floor {floor}</span>
                                              <span>·</span>
                                              <span>{floorAps.length} AP{floorAps.length !== 1 ? 's' : ''}</span>
                                              <span>·</span>
                                              <span>Floor height: {effHeight}m{fc?.heightOverride ? ' (override)' : ' (default)'}</span>
                                            </div>
                                          </TableCell>
                                        </TableRow>

                                        {/* AP rows */}
                                        {floorAps.map(ap => {
                                          const pwr = getPower(ap.powerClass);
                                          const status = applyStatus.get(ap.serialNumber) ?? 'idle';
                                          const isWarning = ap.calculatedHeight < 0 || ap.calculatedHeight > 150;
                                          return (
                                            <TableRow
                                              key={ap.serialNumber}
                                              className={ap.selected ? 'bg-primary/5' : isWarning ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}
                                            >
                                              <TableCell className="pl-12">
                                                <Checkbox
                                                  checked={ap.selected}
                                                  onCheckedChange={() => toggleOne(ap.serialNumber)}
                                                  aria-label={`Select ${ap.displayName}`}
                                                />
                                              </TableCell>
                                              <TableCell>
                                                <div className="font-medium text-sm">{ap.displayName}</div>
                                                {ap.model && <div className="text-xs text-muted-foreground">{ap.model}</div>}
                                              </TableCell>
                                              <TableCell>
                                                <Badge variant="outline" className="text-xs">{ap.floor}</Badge>
                                              </TableCell>
                                              <TableCell className="text-right font-mono font-semibold">
                                                <span className={isWarning ? 'text-amber-600' : ''}>
                                                  {ap.calculatedHeight.toFixed(1)} m
                                                </span>
                                                {isWarning && <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />}
                                              </TableCell>
                                              <TableCell>
                                                <div className="flex items-center gap-1">
                                                  <Select value={ap.deployment} onValueChange={v => updateAPField(ap.serialNumber, 'deployment', v)}>
                                                    <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                      <SelectItem value="indoor">Indoor</SelectItem>
                                                      <SelectItem value="outdoor">Outdoor</SelectItem>
                                                    </SelectContent>
                                                  </Select>
                                                  {ap.autoDeployment !== ap.deployment && (
                                                    <span title={`Auto-detected: ${ap.autoDeployment}`} className="text-amber-500 cursor-help text-xs">*</span>
                                                  )}
                                                </div>
                                              </TableCell>
                                              <TableCell>
                                                <Select value={ap.powerClass} onValueChange={v => updateAPField(ap.serialNumber, 'powerClass', v)}>
                                                  <SelectTrigger className="h-7 text-xs w-16"><SelectValue /></SelectTrigger>
                                                  <SelectContent>
                                                    <SelectItem value="sp">SP</SelectItem>
                                                    <SelectItem value="lp" disabled={ap.deployment === 'outdoor'}>LP</SelectItem>
                                                  </SelectContent>
                                                </Select>
                                              </TableCell>
                                              <TableCell className="text-center text-sm font-mono">{pwr['20']}</TableCell>
                                              <TableCell className="text-center text-sm font-mono">{pwr['80']}</TableCell>
                                              <TableCell className="text-center text-sm font-mono">{pwr['160']}</TableCell>
                                              <TableCell className="text-center">
                                                <StatusBadge status={status} />
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

              {/* Footer */}
              {filteredRecords.length > 0 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">
                    Height = Ground Elevation + (Floor# − 1) × Floor Height + Mount Offset
                  </p>
                  <ExportButton data={exportData} columns={exportColumns} filename="afc-radio-heights" title="AFC Radio Heights" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Floor Overrides ─────────────────────────────────────── */}
        <TabsContent value="floors" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">Per-Floor Height Overrides</CardTitle>
                  <CardDescription>
                    Override floor-to-ceiling height per floor. Default: {defaultFloorHeight} m.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={handleCsvImport}
                  />
                  <Button variant="outline" size="sm" onClick={() => csvInputRef.current?.click()}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Import CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {floorConfigs.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>No floors found. Load APs first.</AlertDescription>
                </Alert>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    CSV format: <code className="bg-muted px-1 rounded text-xs">Building,Floor Label,Height (m)</code>
                  </p>

                  {/* Group by site → building */}
                  {([...new Set(floorConfigs.map(fc => fc.site))] as string[]).sort().map((site: string) => (
                    <div key={site} className="space-y-4">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-semibold text-sm">{site}</h3>
                      </div>

                      {([...new Set(floorConfigs.filter(fc => fc.site === site).map(fc => fc.building))] as string[]).sort().map((building: string) => {
                        const bFloors = floorConfigs.filter(fc => fc.site === site && fc.building === building);
                        const bKey = `${site}||${building}`;
                        const otherBuildings = floorConfigs
                          .filter(fc => !(fc.site === site && fc.building === building))
                          .map(fc => ({ site: fc.site, building: fc.building }))
                          .filter((v, i, a) => a.findIndex(x => x.site === v.site && x.building === v.building) === i);

                        return (
                          <div key={bKey} className="ml-4 border rounded-lg">
                            <div className="flex items-center justify-between p-3 border-b bg-muted/20 rounded-t-lg flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm">{building}</span>
                                <Badge variant="outline" className="text-xs">{bFloors.length} floor{bFloors.length !== 1 ? 's' : ''}</Badge>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs text-muted-foreground">Preset:</span>
                                {BUILDING_PRESETS.map(p => (
                                  <Button
                                    key={p.label}
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-xs px-2"
                                    onClick={() => applyBuildingPreset(site, building, p.height)}
                                  >
                                    {p.label} {p.height}m
                                  </Button>
                                ))}
                                {otherBuildings.length > 0 && (
                                  <div className="relative">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 text-xs px-2 gap-1"
                                      onClick={() => setCopySource(copySource === bKey ? null : bKey)}
                                    >
                                      <Copy className="h-3 w-3" /> Copy to…
                                    </Button>
                                    {copySource === bKey && (
                                      <div className="absolute right-0 top-8 z-10 bg-popover border rounded-md shadow-md p-2 min-w-48 space-y-1">
                                        <p className="text-xs text-muted-foreground font-medium px-1 pb-1">Copy floors to:</p>
                                        {otherBuildings.map(ob => (
                                          <button
                                            key={`${ob.site}||${ob.building}`}
                                            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted flex items-center gap-1.5"
                                            onClick={() => copyBuildingFloors(site, building, ob.site, ob.building)}
                                          >
                                            {ob.site !== site && <span className="text-muted-foreground">{ob.site} /</span>}
                                            {ob.building}
                                          </button>
                                        ))}
                                        <button
                                          className="w-full text-left text-xs px-2 py-1.5 text-muted-foreground rounded hover:bg-muted"
                                          onClick={() => setCopySource(null)}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Floor</TableHead>
                                  <TableHead className="text-center">Floor #</TableHead>
                                  <TableHead>Height (m)</TableHead>
                                  <TableHead>APs</TableHead>
                                  <TableHead />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {bFloors.map(fc => {
                                  const apCount = apRecords.filter(r => r.building === fc.building && r.floor === fc.floor && r.site === fc.site).length;
                                  return (
                                    <TableRow key={fc.key}>
                                      <TableCell><Badge variant="outline">{fc.floor}</Badge></TableCell>
                                      <TableCell className="text-center font-mono">{fc.floorNumber}</TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          <Input
                                            type="number" step="0.1" min="1" max="20"
                                            placeholder={String(defaultFloorHeight)}
                                            value={fc.heightOverride ?? ''}
                                            onChange={e => updateFloorHeight(fc.key, e.target.value)}
                                            className="w-24 h-7 text-sm"
                                          />
                                          {fc.heightOverride !== null && (
                                            <span className="text-xs text-primary font-medium">overridden</span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-sm text-muted-foreground">{apCount}</TableCell>
                                      <TableCell>
                                        {fc.heightOverride !== null && (
                                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => resetFloorHeight(fc.key)}>
                                            <RotateCcw className="h-3 w-3 mr-1" /> Reset
                                          </Button>
                                        )}
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

        {/* ── Tab 3: Power Reference ─────────────────────────────────────── */}
        <TabsContent value="power-ref" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4" />
                FCC 6 GHz Power Reference
              </CardTitle>
              <CardDescription>Maximum EIRP limits for 6 GHz U-NII bands (U-NII-5, U-NII-7, U-NII-8)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Power Class</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>AFC Required</TableHead>
                    {CHANNEL_WIDTHS.map(w => <TableHead key={w} className="text-center">{w} MHz</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>
                      <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 border">
                        Standard Power (SP)
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">Indoor & Outdoor</TableCell>
                    <TableCell><CheckCircle className="h-4 w-4 text-green-500" /></TableCell>
                    {CHANNEL_WIDTHS.map(w => (
                      <TableCell key={w} className="text-center font-mono font-semibold">{SP_POWER[w]} dBm</TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell><Badge variant="secondary">Low Power (LP)</Badge></TableCell>
                    <TableCell className="text-sm">Indoor only</TableCell>
                    <TableCell><span className="text-muted-foreground text-sm">No</span></TableCell>
                    {CHANNEL_WIDTHS.map(w => (
                      <TableCell key={w} className="text-center font-mono text-muted-foreground">{LP_POWER[w]} dBm</TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>

              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Auto-detected Outdoor Models</h4>
                <div className="flex flex-wrap gap-2">
                  {OUTDOOR_MODEL_PATTERNS.map(m => (
                    <Badge key={m} variant="outline" className="text-xs font-mono">{m}</Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  APs matching these model prefixes are automatically set to Outdoor deployment. An asterisk (*) in the AP table
                  indicates the deployment was manually changed from the auto-detected value.
                </p>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm space-y-1">
                  <p>
                    <strong>U-NII-6 (6425–6525 MHz)</strong> is restricted to <strong>indoor use only</strong> at Low Power levels
                    regardless of AFC approval.
                  </p>
                  <p>
                    Standard Power EIRP scales as:{' '}
                    <code className="text-xs bg-muted px-1 rounded">36 + 10·log₁₀(BW/20) dBm</code>.
                    AFC approval may further restrict these limits based on location, height, and surroundings.
                  </p>
                  <p>Always verify assignments with your AFC service provider before deployment.</p>
                </AlertDescription>
              </Alert>

              <div>
                <h4 className="font-semibold text-sm mb-2">Height Calculation Formula</h4>
                <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-1">
                  <p>Radio Height (m) =</p>
                  <p className="pl-4">Ground Elevation (m) <span className="text-muted-foreground">← per-site or global default</span></p>
                  <p className="pl-4">+ (Floor Number − 1) × Floor Height (m) <span className="text-muted-foreground">← per-floor override or global default</span></p>
                  <p className="pl-4">+ Mount Offset (m) <span className="text-muted-foreground">← distance from floor to antenna</span></p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Floor Number is 1-based (ground floor = 1). Basement floors use negative values (B1 = −1).
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
