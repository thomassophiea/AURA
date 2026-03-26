import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Building2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Layers,
  Zap,
  RotateCcw,
  Upload
} from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';
import { ExportButton } from './ExportButton';

// ── Types ─────────────────────────────────────────────────────────────────────

type Deployment = 'indoor' | 'outdoor';
type PowerClass = 'sp' | 'lp';

interface FloorConfig {
  key: string;          // `${building}||${floor}`
  building: string;
  floor: string;
  floorNumber: number;  // parsed numeric (1-based; negatives = basement)
  heightOverride: number | null; // null = use global default
}

interface APHeightRecord {
  serialNumber: string;
  displayName: string;
  building: string;
  floor: string;
  floorNumber: number;
  calculatedHeight: number;
  deployment: Deployment;
  powerClass: PowerClass;
  selected: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SP_POWER: Record<string, number> = { '20': 36, '40': 39, '80': 42, '160': 45 };
const LP_POWER: Record<string, number> = { '20': 30, '40': 33, '80': 36, '160': 39 };

const CHANNEL_WIDTHS = ['20', '40', '80', '160'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseFloorNumber(floor: string): number {
  if (!floor) return 1;
  const f = floor.trim().toUpperCase();

  // Ground floor aliases
  if (['G', 'GF', 'GRD', 'GROUND', '0', 'L', 'LOBBY'].includes(f)) return 1;

  // Basement patterns: B1, B2, LB1, -1, -2
  const basementMatch = f.match(/^(?:LB|B)(\d+)$/) || f.match(/^-(\d+)$/);
  if (basementMatch) return -parseInt(basementMatch[1], 10);

  // L-prefix (L1, L2, …)
  const lMatch = f.match(/^L(\d+)$/);
  if (lMatch) return parseInt(lMatch[1], 10);

  // Plain number
  const n = parseInt(f, 10);
  if (!isNaN(n)) return n === 0 ? 1 : n;

  return 1;
}

function calcHeight(
  floorNumber: number,
  floorHeight: number,
  groundElevation: number,
  mountOffset: number
): number {
  return groundElevation + (floorNumber - 1) * floorHeight + mountOffset;
}

function getPower(powerClass: PowerClass): Record<string, number> {
  return powerClass === 'sp' ? SP_POWER : LP_POWER;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AFCRadioHeightCalculator() {
  // Global settings
  const [defaultFloorHeight, setDefaultFloorHeight] = useState<number>(3.5);
  const [groundElevation, setGroundElevation] = useState<number>(0);
  const [mountOffset, setMountOffset] = useState<number>(0.3);
  const [defaultDeployment, setDefaultDeployment] = useState<Deployment>('indoor');
  const [defaultPowerClass, setDefaultPowerClass] = useState<PowerClass>('sp');

  // Data
  const [apRecords, setApRecords] = useState<APHeightRecord[]>([]);
  const [floorConfigs, setFloorConfigs] = useState<FloorConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [activeTab, setActiveTab] = useState('aps');

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [aps, savedHeights] = await Promise.allSettled([
        apiService.getAccessPoints(),
        apiService.makeAuthenticatedRequest('/v1/afc/radio-heights').then(r =>
          r.ok ? r.json() : []
        ).catch(() => [])
      ]);

      const apList = aps.status === 'fulfilled' ? aps.value : [];
      const saved: Record<string, Partial<APHeightRecord>> = {};
      if (savedHeights.status === 'fulfilled' && Array.isArray(savedHeights.value)) {
        savedHeights.value.forEach((h: any) => {
          saved[h.serialNumber] = h;
        });
      }

      // Build unique floor configs
      const floorMap = new Map<string, FloorConfig>();
      apList.forEach(ap => {
        const building = ap.building || ap.hostSite || 'Unknown Building';
        const floor = ap.floor || ap.floorName || '1';
        const key = `${building}||${floor}`;
        if (!floorMap.has(key)) {
          floorMap.set(key, {
            key,
            building,
            floor,
            floorNumber: parseFloorNumber(floor),
            heightOverride: null
          });
        }
      });

      const floors = Array.from(floorMap.values()).sort((a, b) => {
        if (a.building !== b.building) return a.building.localeCompare(b.building);
        return a.floorNumber - b.floorNumber;
      });
      setFloorConfigs(floors);

      // Build AP records
      const records: APHeightRecord[] = apList.map(ap => {
        const building = ap.building || ap.hostSite || 'Unknown Building';
        const floor = ap.floor || ap.floorName || '1';
        const key = `${building}||${floor}`;
        const fc = floorMap.get(key);
        const floorNumber = fc?.floorNumber ?? parseFloorNumber(floor);
        const effectiveFloorHeight = fc?.heightOverride ?? defaultFloorHeight;

        const s = saved[ap.serialNumber] || {};
        return {
          serialNumber: ap.serialNumber,
          displayName: ap.displayName || ap.hostname || ap.serialNumber,
          building,
          floor,
          floorNumber,
          calculatedHeight: calcHeight(floorNumber, effectiveFloorHeight, groundElevation, mountOffset),
          deployment: (s.deployment as Deployment) ?? defaultDeployment,
          powerClass: (s.powerClass as PowerClass) ?? defaultPowerClass,
          selected: false
        };
      });

      setApRecords(records);
    } catch (error) {
      console.error('[AFCRadioHeightCalculator] Failed to load data:', error);
      toast.error('Failed to load access point data');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Recalculate heights whenever global settings or floor overrides change
  const recalculate = useCallback(() => {
    const floorMap = new Map(floorConfigs.map(fc => [fc.key, fc]));
    setApRecords(prev => prev.map(ap => {
      const key = `${ap.building}||${ap.floor}`;
      const fc = floorMap.get(key);
      const effectiveFloorHeight = fc?.heightOverride ?? defaultFloorHeight;
      return {
        ...ap,
        calculatedHeight: calcHeight(ap.floorNumber, effectiveFloorHeight, groundElevation, mountOffset)
      };
    }));
  }, [floorConfigs, defaultFloorHeight, groundElevation, mountOffset]);

  useEffect(() => {
    recalculate();
  }, [recalculate]);

  // ── Selection helpers ───────────────────────────────────────────────────────

  const selectedCount = apRecords.filter(r => r.selected).length;
  const allSelected = apRecords.length > 0 && selectedCount === apRecords.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleAll = () => {
    const next = !allSelected;
    setApRecords(prev => prev.map(r => ({ ...r, selected: next })));
  };

  const toggleOne = (sn: string) => {
    setApRecords(prev => prev.map(r => r.serialNumber === sn ? { ...r, selected: !r.selected } : r));
  };

  // ── Bulk actions ────────────────────────────────────────────────────────────

  const bulkSetDeployment = (d: Deployment) => {
    setApRecords(prev => prev.map(r => {
      if (!r.selected) return r;
      // LP is indoor-only; if switching to outdoor, force SP
      const powerClass = d === 'outdoor' && r.powerClass === 'lp' ? 'sp' : r.powerClass;
      return { ...r, deployment: d, powerClass };
    }));
  };

  const bulkSetPowerClass = (pc: PowerClass) => {
    setApRecords(prev => prev.map(r => {
      if (!r.selected) return r;
      // Cannot set LP for outdoor APs
      if (pc === 'lp' && r.deployment === 'outdoor') return r;
      return { ...r, powerClass: pc };
    }));
  };

  const updateAPField = (sn: string, field: 'deployment' | 'powerClass', value: string) => {
    setApRecords(prev => prev.map(r => {
      if (r.serialNumber !== sn) return r;
      if (field === 'deployment') {
        const d = value as Deployment;
        const powerClass = d === 'outdoor' && r.powerClass === 'lp' ? 'sp' : r.powerClass;
        return { ...r, deployment: d, powerClass };
      }
      return { ...r, [field]: value };
    }));
  };

  // ── Floor override ──────────────────────────────────────────────────────────

  const updateFloorHeight = (key: string, value: string) => {
    const num = parseFloat(value);
    setFloorConfigs(prev => prev.map(fc =>
      fc.key === key ? { ...fc, heightOverride: isNaN(num) ? null : num } : fc
    ));
  };

  const resetFloorHeight = (key: string) => {
    setFloorConfigs(prev => prev.map(fc =>
      fc.key === key ? { ...fc, heightOverride: null } : fc
    ));
  };

  // ── Apply ───────────────────────────────────────────────────────────────────

  const handleApply = async () => {
    const toApply = apRecords.filter(r => r.selected);
    if (toApply.length === 0) {
      toast.error('Select at least one AP to apply');
      return;
    }

    setApplying(true);
    try {
      const payload = toApply.map(r => ({
        serialNumber: r.serialNumber,
        displayName: r.displayName,
        height: parseFloat(r.calculatedHeight.toFixed(2)),
        deployment: r.deployment,
        powerClass: r.powerClass
      }));

      const response = await apiService.makeAuthenticatedRequest('/v1/afc/radio-heights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const result = await response.json();
      toast.success(`Saved ${result.saved ?? toApply.length} radio height record(s)`);
    } catch (error) {
      console.error('[AFC Heights] Apply failed:', error);
      toast.error('Failed to save radio height settings');
    } finally {
      setApplying(false);
    }
  };

  // ── Export data ─────────────────────────────────────────────────────────────

  const exportData = useMemo(() =>
    apRecords.map(r => ({
      serialNumber: r.serialNumber,
      displayName: r.displayName,
      building: r.building,
      floor: r.floor,
      floorNumber: r.floorNumber,
      calculatedHeight: r.calculatedHeight.toFixed(2),
      deployment: r.deployment,
      powerClass: r.powerClass.toUpperCase(),
      maxEirp20MHz: getPower(r.powerClass)['20'],
      maxEirp80MHz: getPower(r.powerClass)['80'],
      maxEirp160MHz: getPower(r.powerClass)['160']
    })),
    [apRecords]
  );

  const exportColumns = [
    { key: 'serialNumber', label: 'Serial Number' },
    { key: 'displayName', label: 'AP Name' },
    { key: 'building', label: 'Building' },
    { key: 'floor', label: 'Floor' },
    { key: 'floorNumber', label: 'Floor #' },
    { key: 'calculatedHeight', label: 'Radio Height (m)' },
    { key: 'deployment', label: 'Deployment' },
    { key: 'powerClass', label: 'Power Class' },
    { key: 'maxEirp20MHz', label: 'Max EIRP 20 MHz (dBm)' },
    { key: 'maxEirp80MHz', label: 'Max EIRP 80 MHz (dBm)' },
    { key: 'maxEirp160MHz', label: 'Max EIRP 160 MHz (dBm)' }
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            AFC Radio Height Calculator
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Bulk-calculate and assign radio heights for AFC Standard Power compliance across all floors
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh APs
        </Button>
      </div>

      <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Standard Power (SP)</strong> devices — both indoor and outdoor — require AFC coordination for 6 GHz operation.
          Radio height above ground is a mandatory parameter submitted to the AFC service provider.
          <strong> Low Power (LP)</strong> devices operate indoors only and do not require AFC.
        </AlertDescription>
      </Alert>

      {/* Global Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Global Settings</CardTitle>
          <CardDescription>Defaults applied to all APs unless overridden per-floor below</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Default Floor Height (m)</Label>
              <Input
                type="number"
                step="0.1"
                min="1"
                max="20"
                value={defaultFloorHeight}
                onChange={e => setDefaultFloorHeight(parseFloat(e.target.value) || 3.5)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ground Elevation (m)</Label>
              <Input
                type="number"
                step="0.1"
                value={groundElevation}
                onChange={e => setGroundElevation(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mount Offset (m)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={mountOffset}
                onChange={e => setMountOffset(parseFloat(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">Height of radio above floor</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default Deployment</Label>
              <Select value={defaultDeployment} onValueChange={v => setDefaultDeployment(v as Deployment)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="indoor">Indoor</SelectItem>
                  <SelectItem value="outdoor">Outdoor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default Power Class</Label>
              <Select value={defaultPowerClass} onValueChange={v => setDefaultPowerClass(v as PowerClass)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
            <Badge variant="secondary" className="ml-1 text-xs">{apRecords.length}</Badge>
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
        <TabsContent value="aps" className="mt-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              {/* Bulk action bar */}
              {selectedCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 rounded-lg border">
                  <span className="text-sm font-medium text-muted-foreground">
                    {selectedCount} AP{selectedCount !== 1 ? 's' : ''} selected:
                  </span>
                  <Button size="sm" variant="outline" onClick={() => bulkSetDeployment('indoor')}>
                    Set Indoor
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => bulkSetDeployment('outdoor')}>
                    Set Outdoor
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => bulkSetPowerClass('sp')}>
                    Set SP
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => bulkSetPowerClass('lp')}>
                    Set LP (indoor only)
                  </Button>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    onClick={handleApply}
                    disabled={applying}
                    className="gap-1.5"
                  >
                    {applying
                      ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      : <Upload className="h-3.5 w-3.5" />
                    }
                    {applying ? 'Saving…' : 'Apply Selected'}
                  </Button>
                </div>
              )}

              {/* AP table */}
              {apRecords.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No access points found. Make sure you are connected to the controller and the AP list is not empty.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="overflow-x-auto">
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
                        <TableHead>Building</TableHead>
                        <TableHead>Floor</TableHead>
                        <TableHead className="text-right">Height (m)</TableHead>
                        <TableHead>Deployment</TableHead>
                        <TableHead>Power Class</TableHead>
                        <TableHead className="text-center">20 MHz</TableHead>
                        <TableHead className="text-center">80 MHz</TableHead>
                        <TableHead className="text-center">160 MHz</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apRecords.map(ap => {
                        const pwr = getPower(ap.powerClass);
                        return (
                          <TableRow
                            key={ap.serialNumber}
                            className={ap.selected ? 'bg-primary/5' : ''}
                          >
                            <TableCell>
                              <Checkbox
                                checked={ap.selected}
                                onCheckedChange={() => toggleOne(ap.serialNumber)}
                                aria-label={`Select ${ap.displayName}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{ap.displayName}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{ap.building}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{ap.floor}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {ap.calculatedHeight.toFixed(1)} m
                            </TableCell>
                            <TableCell>
                              <Select
                                value={ap.deployment}
                                onValueChange={v => updateAPField(ap.serialNumber, 'deployment', v)}
                              >
                                <SelectTrigger className="h-7 text-xs w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="indoor">Indoor</SelectItem>
                                  <SelectItem value="outdoor">Outdoor</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={ap.powerClass}
                                onValueChange={v => updateAPField(ap.serialNumber, 'powerClass', v)}
                              >
                                <SelectTrigger className="h-7 text-xs w-20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="sp">SP</SelectItem>
                                  <SelectItem value="lp" disabled={ap.deployment === 'outdoor'}>
                                    LP
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-center text-sm font-mono">{pwr['20']} dBm</TableCell>
                            <TableCell className="text-center text-sm font-mono">{pwr['80']} dBm</TableCell>
                            <TableCell className="text-center text-sm font-mono">{pwr['160']} dBm</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Footer actions */}
              {apRecords.length > 0 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">
                    Height = Ground Elevation + (Floor# − 1) × Floor Height + Mount Offset
                  </p>
                  <ExportButton
                    data={exportData}
                    columns={exportColumns}
                    filename="afc-radio-heights"
                    title="AFC Radio Heights"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Floor Overrides ─────────────────────────────────────── */}
        <TabsContent value="floors" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per-Floor Height Overrides</CardTitle>
              <CardDescription>
                Override the default floor-to-ceiling height for specific floors. Leave blank to use the global default ({defaultFloorHeight} m).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {floorConfigs.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>No floors found. Load APs first.</AlertDescription>
                </Alert>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Building</TableHead>
                      <TableHead>Floor Label</TableHead>
                      <TableHead className="text-center">Floor #</TableHead>
                      <TableHead>Floor Height (m)</TableHead>
                      <TableHead>APs on Floor</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {floorConfigs.map(fc => {
                      const apCount = apRecords.filter(
                        r => r.building === fc.building && r.floor === fc.floor
                      ).length;
                      return (
                        <TableRow key={fc.key}>
                          <TableCell className="font-medium">{fc.building}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{fc.floor}</Badge>
                          </TableCell>
                          <TableCell className="text-center font-mono">{fc.floorNumber}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                step="0.1"
                                min="1"
                                max="20"
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
                          <TableCell className="text-sm text-muted-foreground">{apCount} AP{apCount !== 1 ? 's' : ''}</TableCell>
                          <TableCell>
                            {fc.heightOverride !== null && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => resetFloorHeight(fc.key)}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Reset
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
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
              <CardDescription>
                Maximum EIRP limits for 6 GHz U-NII bands (U-NII-5, U-NII-7, U-NII-8)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Power Class</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>AFC Required</TableHead>
                    {CHANNEL_WIDTHS.map(w => (
                      <TableHead key={w} className="text-center">{w} MHz</TableHead>
                    ))}
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
                    <TableCell>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    </TableCell>
                    {CHANNEL_WIDTHS.map(w => (
                      <TableCell key={w} className="text-center font-mono font-semibold">
                        {SP_POWER[w]} dBm
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <Badge variant="secondary">Low Power (LP)</Badge>
                    </TableCell>
                    <TableCell className="text-sm">Indoor only</TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm">No</span>
                    </TableCell>
                    {CHANNEL_WIDTHS.map(w => (
                      <TableCell key={w} className="text-center font-mono text-muted-foreground">
                        {LP_POWER[w]} dBm
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm space-y-1">
                  <p>
                    <strong>U-NII-6 (6425–6525 MHz)</strong> is restricted to <strong>indoor use only</strong> at Low Power levels regardless of AFC approval.
                  </p>
                  <p>
                    Standard Power EIRP scales as: <code className="text-xs bg-muted px-1 rounded">36 + 10·log₁₀(BW/20) dBm</code>. AFC approval may further restrict these limits based on your specific location, height, and surrounding environment.
                  </p>
                  <p>
                    Always verify assignments with your AFC service provider before deployment.
                  </p>
                </AlertDescription>
              </Alert>

              <div>
                <h4 className="font-semibold text-sm mb-2">Height Calculation Formula</h4>
                <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-1">
                  <p>Radio Height (m) =</p>
                  <p className="pl-4">Ground Elevation (m)</p>
                  <p className="pl-4">+ (Floor Number − 1) × Floor Height (m)</p>
                  <p className="pl-4">+ Mount Offset (m)</p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Floor Number is 1-based (ground floor = 1). Basement floors use negative values (B1 = −1).
                  Mount Offset is the distance from floor to the radio antenna (typically 0.1–0.5 m for ceiling mounts, up to 3 m for wall mounts).
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
