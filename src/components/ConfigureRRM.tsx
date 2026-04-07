import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from './ui/sheet';
import { Plus, Search, Edit2, Trash2, Radio, RefreshCw } from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';
import { DevEpicBadge } from './DevEpicBadge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RRMProfile {
  id: string;
  name: string;
  type?: string;
  smartRf?: {
    enabled?: boolean;
    sensitivity?: string;
    aiRrm?: boolean;
    interferenceRecoveryEnabled?: boolean;
    coverageHoleRecoveryEnabled?: boolean;
    neighborRecoveryEnabled?: boolean;
    ocsMonitoringAwarenessOverride?: boolean;
    ocsThresholdAwarenessHits?: number;
    channelAndPower?: {
      radio1?: RadioBand;
      radio2?: RadioBand;
      radio3?: RadioBand;
    };
    scanning?: {
      radio1?: ScanBand;
      radio2?: ScanBand;
    };
    recovery?: RecoveryConfig;
  };
}

interface RadioBand {
  channelWidth?: string;
  minTxPower?: number;
  maxTxPower?: number;
  channelPlan?: string;
  customChannels?: string;
}

interface ScanBand {
  scanDuration?: number;
  scanPeriod?: number;
  extScanFreq?: number;
  scanSampleCount?: number;
  clientAwareScanning?: boolean;
  powerSaveAwareScanning?: string;
  txLoadAwareScanning?: boolean;
}

interface RecoveryConfig {
  powerHoldTime?: number;
  channelHoldTime?: number;
  radio1NeighborPowerThreshold?: number;
  radio2NeighborPowerThreshold?: number;
  radio3NeighborPowerThreshold?: number;
  dynamicSampleEnabled?: boolean;
  dynamicSampleNoise?: number;
  dynamicSampleNoiseFactor?: number;
  dynamicSampleClientThreshold?: number;
  radio1ChannelSwitchDelta?: number;
  radio2ChannelSwitchDelta?: number;
  cciEnabled?: boolean;
  cciHighThreshold?: number;
  cciLowThreshold?: number;
  cciFrequency?: number;
  cciFrequencyLimiter?: number;
  selectShutdownEnabled?: boolean;
  selectShutdownCciHigh?: number;
  selectShutdownCciLow?: number;
  selectShutdownFrequency?: number;
  selectShutdownFrequencyLimiter?: number;
}

// ─── Default form state ───────────────────────────────────────────────────────

const DEFAULT_RRM_FORM = {
  name: '',
  type: 'SMARTRF',
  // Basic
  smartRfEnabled: true,
  sensitivity: 'MEDIUM',
  interferenceRecoveryEnabled: true,
  coverageHoleRecoveryEnabled: true,
  neighborRecoveryEnabled: true,
  ocsMonitoringAwarenessOverride: false,
  ocsThresholdAwarenessHits: '3',
  aiRrmEnabled: false,
  // Channel+Power — 2.4 GHz
  radio1ChannelWidth: 'auto',
  radio1MinTxPower: '-10',
  radio1MaxTxPower: '20',
  radio1ChannelPlan: '3CHANNEL',
  radio1CustomChannels: '',
  // Channel+Power — 5 GHz
  radio2ChannelWidth: 'auto',
  radio2MinTxPower: '-10',
  radio2MaxTxPower: '20',
  radio2ChannelPlan: 'ALL',
  radio2CustomChannels: '',
  // Channel+Power — 6 GHz
  radio3ChannelWidth: 'auto',
  radio3MinTxPower: '-10',
  radio3MaxTxPower: '20',
  radio3ChannelPlan: 'ALL',
  radio3CustomChannels: '',
  // Scanning
  radio1ScanDuration: '50',
  radio1ScanPeriod: '60',
  radio1ExtScanFreq: '5',
  radio1ScanSampleCount: '5',
  radio1ClientAwareScanning: true,
  radio1PowerSaveAwareScanning: 'DYNAMIC',
  radio1TxLoadAwareScanning: false,
  radio2ScanDuration: '50',
  radio2ScanPeriod: '60',
  radio2ExtScanFreq: '5',
  radio2ScanSampleCount: '5',
  radio2ClientAwareScanning: true,
  radio2PowerSaveAwareScanning: 'DYNAMIC',
  radio2TxLoadAwareScanning: false,
  // Recovery — Hold Timers
  powerHoldTime: '60',
  channelHoldTime: '120',
  // Recovery — Neighbor
  radio1NeighborPowerThreshold: '-70',
  radio2NeighborPowerThreshold: '-70',
  radio3NeighborPowerThreshold: '-70',
  // Recovery — Dynamic Sample
  dynamicSampleEnabled: true,
  dynamicSampleNoise: '-85',
  dynamicSampleNoiseFactor: '1.5',
  dynamicSampleClientThreshold: '5',
  // Recovery — Interference
  radio1ChannelSwitchDelta: '15',
  radio2ChannelSwitchDelta: '15',
  // Recovery — CCI
  cciEnabled: false,
  cciHighThreshold: '70',
  cciLowThreshold: '30',
  cciFrequency: '60',
  cciFrequencyLimiter: '3',
  // Select Shutdown
  selectShutdownEnabled: false,
  selectShutdownCciHigh: '80',
  selectShutdownCciLow: '40',
  selectShutdownFrequency: '120',
  selectShutdownFrequencyLimiter: '2',
};

type RRMFormKey = keyof typeof DEFAULT_RRM_FORM;

// ─── Band descriptors ─────────────────────────────────────────────────────────

const CHANNEL_PLAN_OPTIONS: Record<string, { value: string; label: string }[]> = {
  '2.4': [
    { value: '3CHANNEL', label: '3-Channel' },
    { value: '4CHANNEL', label: '4-Channel' },
    { value: 'AUTO', label: 'Auto' },
    { value: 'CUSTOM', label: 'Custom' },
  ],
  '5': [
    { value: 'ALL', label: 'All Channels' },
    { value: 'EXTWEATHER', label: 'Ext Weather' },
    { value: 'NONDFS', label: 'Non-DFS' },
    { value: 'CUSTOM', label: 'Custom' },
  ],
  '6': [
    { value: 'ALL', label: 'All Channels' },
    { value: 'PSC', label: 'PSC Only' },
    { value: 'CUSTOM', label: 'Custom' },
  ],
};

const CHANNEL_WIDTH_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '20', label: '20 MHz' },
  { value: '40', label: '40 MHz' },
  { value: '80', label: '80 MHz' },
  { value: '160', label: '160 MHz' },
];

const POWER_SAVE_OPTIONS = [
  { value: 'DISABLED', label: 'Disabled' },
  { value: 'DYNAMIC', label: 'Dynamic' },
  { value: 'ENABLED', label: 'Enabled' },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function s(v: number | string | undefined, fallback = ''): string {
  return v !== undefined && v !== null ? String(v) : fallback;
}

function b(v: boolean | undefined, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ConfigureRRM() {
  const [profiles, setProfiles] = useState<RRMProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...DEFAULT_RRM_FORM });

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.getRFManagementProfiles();
      setProfiles(Array.isArray(data) ? (data as RRMProfile[]) : []);
    } catch {
      toast.error('Failed to load RRM profiles');
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // ── Form helpers ──────────────────────────────────────────────────────────

  const setField = (key: RRMFormKey, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  // ── Open create / edit ────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...DEFAULT_RRM_FORM });
    setSheetOpen(true);
  };

  const openEdit = (profile: RRMProfile) => {
    setEditingId(profile.id);
    const sr = profile.smartRf ?? {};
    const cp = sr.channelAndPower ?? {};
    const r1cp = cp.radio1 ?? {};
    const r2cp = cp.radio2 ?? {};
    const r3cp = cp.radio3 ?? {};
    const sc = sr.scanning ?? {};
    const r1sc = sc.radio1 ?? {};
    const r2sc = sc.radio2 ?? {};
    const rc = sr.recovery ?? {};

    setForm({
      name: s(profile.name),
      type: s(profile.type, 'SMARTRF'),
      // Basic
      smartRfEnabled: b(sr.enabled, true),
      sensitivity: s(sr.sensitivity, 'MEDIUM'),
      interferenceRecoveryEnabled: b(sr.interferenceRecoveryEnabled, true),
      coverageHoleRecoveryEnabled: b(sr.coverageHoleRecoveryEnabled, true),
      neighborRecoveryEnabled: b(sr.neighborRecoveryEnabled, true),
      ocsMonitoringAwarenessOverride: b(sr.ocsMonitoringAwarenessOverride),
      ocsThresholdAwarenessHits: s(sr.ocsThresholdAwarenessHits, '3'),
      aiRrmEnabled: b(sr.aiRrm),
      // Channel+Power — 2.4 GHz
      radio1ChannelWidth: s(r1cp.channelWidth, 'auto'),
      radio1MinTxPower: s(r1cp.minTxPower, '-10'),
      radio1MaxTxPower: s(r1cp.maxTxPower, '20'),
      radio1ChannelPlan: s(r1cp.channelPlan, '3CHANNEL'),
      radio1CustomChannels: s(r1cp.customChannels),
      // Channel+Power — 5 GHz
      radio2ChannelWidth: s(r2cp.channelWidth, 'auto'),
      radio2MinTxPower: s(r2cp.minTxPower, '-10'),
      radio2MaxTxPower: s(r2cp.maxTxPower, '20'),
      radio2ChannelPlan: s(r2cp.channelPlan, 'ALL'),
      radio2CustomChannels: s(r2cp.customChannels),
      // Channel+Power — 6 GHz
      radio3ChannelWidth: s(r3cp.channelWidth, 'auto'),
      radio3MinTxPower: s(r3cp.minTxPower, '-10'),
      radio3MaxTxPower: s(r3cp.maxTxPower, '20'),
      radio3ChannelPlan: s(r3cp.channelPlan, 'ALL'),
      radio3CustomChannels: s(r3cp.customChannels),
      // Scanning
      radio1ScanDuration: s(r1sc.scanDuration, '50'),
      radio1ScanPeriod: s(r1sc.scanPeriod, '60'),
      radio1ExtScanFreq: s(r1sc.extScanFreq, '5'),
      radio1ScanSampleCount: s(r1sc.scanSampleCount, '5'),
      radio1ClientAwareScanning: b(r1sc.clientAwareScanning, true),
      radio1PowerSaveAwareScanning: s(r1sc.powerSaveAwareScanning, 'DYNAMIC'),
      radio1TxLoadAwareScanning: b(r1sc.txLoadAwareScanning),
      radio2ScanDuration: s(r2sc.scanDuration, '50'),
      radio2ScanPeriod: s(r2sc.scanPeriod, '60'),
      radio2ExtScanFreq: s(r2sc.extScanFreq, '5'),
      radio2ScanSampleCount: s(r2sc.scanSampleCount, '5'),
      radio2ClientAwareScanning: b(r2sc.clientAwareScanning, true),
      radio2PowerSaveAwareScanning: s(r2sc.powerSaveAwareScanning, 'DYNAMIC'),
      radio2TxLoadAwareScanning: b(r2sc.txLoadAwareScanning),
      // Recovery — Hold Timers
      powerHoldTime: s(rc.powerHoldTime, '60'),
      channelHoldTime: s(rc.channelHoldTime, '120'),
      // Recovery — Neighbor
      radio1NeighborPowerThreshold: s(rc.radio1NeighborPowerThreshold, '-70'),
      radio2NeighborPowerThreshold: s(rc.radio2NeighborPowerThreshold, '-70'),
      radio3NeighborPowerThreshold: s(rc.radio3NeighborPowerThreshold, '-70'),
      // Recovery — Dynamic Sample
      dynamicSampleEnabled: b(rc.dynamicSampleEnabled, true),
      dynamicSampleNoise: s(rc.dynamicSampleNoise, '-85'),
      dynamicSampleNoiseFactor: s(rc.dynamicSampleNoiseFactor, '1.5'),
      dynamicSampleClientThreshold: s(rc.dynamicSampleClientThreshold, '5'),
      // Recovery — Interference
      radio1ChannelSwitchDelta: s(rc.radio1ChannelSwitchDelta, '15'),
      radio2ChannelSwitchDelta: s(rc.radio2ChannelSwitchDelta, '15'),
      // Recovery — CCI
      cciEnabled: b(rc.cciEnabled),
      cciHighThreshold: s(rc.cciHighThreshold, '70'),
      cciLowThreshold: s(rc.cciLowThreshold, '30'),
      cciFrequency: s(rc.cciFrequency, '60'),
      cciFrequencyLimiter: s(rc.cciFrequencyLimiter, '3'),
      // Select Shutdown
      selectShutdownEnabled: b(rc.selectShutdownEnabled),
      selectShutdownCciHigh: s(rc.selectShutdownCciHigh, '80'),
      selectShutdownCciLow: s(rc.selectShutdownCciLow, '40'),
      selectShutdownFrequency: s(rc.selectShutdownFrequency, '120'),
      selectShutdownFrequencyLimiter: s(rc.selectShutdownFrequencyLimiter, '2'),
    });
    setSheetOpen(true);
  };

  // ── Build API payload ─────────────────────────────────────────────────────

  const buildPayload = () => ({
    name: form.name,
    type: form.type,
    smartRf: {
      enabled: form.smartRfEnabled,
      sensitivity: form.sensitivity,
      aiRrm: form.aiRrmEnabled,
      interferenceRecoveryEnabled: form.interferenceRecoveryEnabled,
      coverageHoleRecoveryEnabled: form.coverageHoleRecoveryEnabled,
      neighborRecoveryEnabled: form.neighborRecoveryEnabled,
      ocsMonitoringAwarenessOverride: form.ocsMonitoringAwarenessOverride,
      ocsThresholdAwarenessHits: Number(form.ocsThresholdAwarenessHits),
      channelAndPower: {
        radio1: {
          channelWidth: form.radio1ChannelWidth,
          minTxPower: Number(form.radio1MinTxPower),
          maxTxPower: Number(form.radio1MaxTxPower),
          channelPlan: form.radio1ChannelPlan,
          ...(form.radio1ChannelPlan === 'CUSTOM' ? { customChannels: form.radio1CustomChannels } : {}),
        },
        radio2: {
          channelWidth: form.radio2ChannelWidth,
          minTxPower: Number(form.radio2MinTxPower),
          maxTxPower: Number(form.radio2MaxTxPower),
          channelPlan: form.radio2ChannelPlan,
          ...(form.radio2ChannelPlan === 'CUSTOM' ? { customChannels: form.radio2CustomChannels } : {}),
        },
        radio3: {
          channelWidth: form.radio3ChannelWidth,
          minTxPower: Number(form.radio3MinTxPower),
          maxTxPower: Number(form.radio3MaxTxPower),
          channelPlan: form.radio3ChannelPlan,
          ...(form.radio3ChannelPlan === 'CUSTOM' ? { customChannels: form.radio3CustomChannels } : {}),
        },
      },
      scanning: {
        radio1: {
          scanDuration: Number(form.radio1ScanDuration),
          scanPeriod: Number(form.radio1ScanPeriod),
          extScanFreq: Number(form.radio1ExtScanFreq),
          scanSampleCount: Number(form.radio1ScanSampleCount),
          clientAwareScanning: form.radio1ClientAwareScanning,
          powerSaveAwareScanning: form.radio1PowerSaveAwareScanning,
          txLoadAwareScanning: form.radio1TxLoadAwareScanning,
        },
        radio2: {
          scanDuration: Number(form.radio2ScanDuration),
          scanPeriod: Number(form.radio2ScanPeriod),
          extScanFreq: Number(form.radio2ExtScanFreq),
          scanSampleCount: Number(form.radio2ScanSampleCount),
          clientAwareScanning: form.radio2ClientAwareScanning,
          powerSaveAwareScanning: form.radio2PowerSaveAwareScanning,
          txLoadAwareScanning: form.radio2TxLoadAwareScanning,
        },
      },
      recovery: {
        powerHoldTime: Number(form.powerHoldTime),
        channelHoldTime: Number(form.channelHoldTime),
        radio1NeighborPowerThreshold: Number(form.radio1NeighborPowerThreshold),
        radio2NeighborPowerThreshold: Number(form.radio2NeighborPowerThreshold),
        radio3NeighborPowerThreshold: Number(form.radio3NeighborPowerThreshold),
        dynamicSampleEnabled: form.dynamicSampleEnabled,
        dynamicSampleNoise: Number(form.dynamicSampleNoise),
        dynamicSampleNoiseFactor: Number(form.dynamicSampleNoiseFactor),
        dynamicSampleClientThreshold: Number(form.dynamicSampleClientThreshold),
        radio1ChannelSwitchDelta: Number(form.radio1ChannelSwitchDelta),
        radio2ChannelSwitchDelta: Number(form.radio2ChannelSwitchDelta),
        cciEnabled: form.cciEnabled,
        cciHighThreshold: Number(form.cciHighThreshold),
        cciLowThreshold: Number(form.cciLowThreshold),
        cciFrequency: Number(form.cciFrequency),
        cciFrequencyLimiter: Number(form.cciFrequencyLimiter),
        selectShutdownEnabled: form.selectShutdownEnabled,
        selectShutdownCciHigh: Number(form.selectShutdownCciHigh),
        selectShutdownCciLow: Number(form.selectShutdownCciLow),
        selectShutdownFrequency: Number(form.selectShutdownFrequency),
        selectShutdownFrequencyLimiter: Number(form.selectShutdownFrequencyLimiter),
      },
    },
  });

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Profile name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editingId) {
        await apiService.updateRFManagementProfile(editingId, payload);
        toast.success(`Updated "${form.name}"`);
      } else {
        await apiService.createRFManagementProfile(payload);
        toast.success(`Created "${form.name}"`);
      }
      setSheetOpen(false);
      await loadProfiles();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to save: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (profileId: string, profileName: string) => {
    if (!confirm(`Delete RRM profile "${profileName}"?`)) return;
    try {
      await apiService.deleteRFManagementProfile(profileId);
      toast.success(`Deleted "${profileName}"`);
      await loadProfiles();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to delete: ${msg}`);
    }
  };

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = profiles.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">RF Management</h1>
            <DevEpicBadge
              epicKey="NVO-7299"
              epicTitle="Wireless RRM Configuration"
              jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-7299"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Manage RRM profiles controlling channel, power, scanning, and recovery behaviour.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadProfiles} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />New RRM Profile
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search profiles..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>SmartRF</TableHead>
                <TableHead>Sensitivity</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Loading profiles...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? 'No profiles match your search' : 'No RRM profiles configured'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(profile => (
                  <TableRow key={profile.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Radio className="h-4 w-4 text-muted-foreground" />
                        {profile.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{profile.type ?? '—'}</Badge>
                    </TableCell>
                    <TableCell>
                      {profile.smartRf?.enabled ? (
                        <Badge variant="default">Enabled</Badge>
                      ) : (
                        <Badge variant="outline">Disabled</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {profile.smartRf?.sensitivity ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(profile)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(profile.id, profile.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Inline Edit Sheet ─────────────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[700px] sm:max-w-[700px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>{editingId ? 'Edit RRM Profile' : 'New RRM Profile'}</SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="basic" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="chanpower">Channel+Power</TabsTrigger>
              <TabsTrigger value="scanning">Scanning</TabsTrigger>
              <TabsTrigger value="recovery">Recovery</TabsTrigger>
            </TabsList>

            {/* ── Basic tab ─────────────────────────────────────────── */}
            <TabsContent value="basic" className="space-y-5">
              {/* Profile Name */}
              <div className="space-y-1.5">
                <Label htmlFor="rrm-name">Profile Name</Label>
                <Input
                  id="rrm-name"
                  value={form.name}
                  onChange={e => setField('name', e.target.value)}
                  placeholder="e.g. Default RRM"
                />
              </div>

              {/* Smart Monitoring */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>Smart Monitoring (SmartRF)</Label>
                  <p className="text-xs text-muted-foreground">Enable automated channel/power optimization</p>
                </div>
                <Switch
                  checked={form.smartRfEnabled}
                  onCheckedChange={v => setField('smartRfEnabled', v)}
                />
              </div>

              {/* Sensitivity */}
              <div className="space-y-1.5">
                <Label>Sensitivity</Label>
                <Select value={form.sensitivity} onValueChange={v => setField('sensitivity', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Recovery toggles */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Recovery Toggles</Label>
                <div className="space-y-2 pl-1">
                  <div className="flex items-center justify-between">
                    <Label className="font-normal">Interference Recovery</Label>
                    <Switch
                      checked={form.interferenceRecoveryEnabled}
                      onCheckedChange={v => setField('interferenceRecoveryEnabled', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="font-normal">Coverage Hole Recovery</Label>
                    <Switch
                      checked={form.coverageHoleRecoveryEnabled}
                      onCheckedChange={v => setField('coverageHoleRecoveryEnabled', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="font-normal">Neighbor Recovery</Label>
                    <Switch
                      checked={form.neighborRecoveryEnabled}
                      onCheckedChange={v => setField('neighborRecoveryEnabled', v)}
                    />
                  </div>
                </div>
              </div>

              {/* OCS Monitoring Awareness Override */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>OCS Monitoring Awareness Override</Label>
                    <p className="text-xs text-muted-foreground">Override default OCS monitoring awareness</p>
                  </div>
                  <Switch
                    checked={form.ocsMonitoringAwarenessOverride}
                    onCheckedChange={v => setField('ocsMonitoringAwarenessOverride', v)}
                  />
                </div>
                {form.ocsMonitoringAwarenessOverride && (
                  <div className="space-y-1.5 pl-1">
                    <Label htmlFor="ocs-hits">Threshold Hits</Label>
                    <Input
                      id="ocs-hits"
                      type="number"
                      value={form.ocsThresholdAwarenessHits}
                      onChange={e => setField('ocsThresholdAwarenessHits', e.target.value)}
                      className="w-32"
                    />
                  </div>
                )}
              </div>

              {/* AI-RRM */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>AI-RRM</Label>
                  <p className="text-xs text-muted-foreground">Enable AI-driven radio resource management</p>
                </div>
                <Switch
                  checked={form.aiRrmEnabled}
                  onCheckedChange={v => setField('aiRrmEnabled', v)}
                />
              </div>
            </TabsContent>

            {/* ── Channel+Power tab ──────────────────────────────────── */}
            <TabsContent value="chanpower" className="space-y-6">
              {(
                [
                  { band: '2.4', label: '2.4 GHz', prefix: 'radio1' },
                  { band: '5', label: '5 GHz', prefix: 'radio2' },
                  { band: '6', label: '6 GHz', prefix: 'radio3' },
                ] as const
              ).map(({ band, label, prefix }) => {
                const widthKey = `${prefix}ChannelWidth` as RRMFormKey;
                const minKey = `${prefix}MinTxPower` as RRMFormKey;
                const maxKey = `${prefix}MaxTxPower` as RRMFormKey;
                const planKey = `${prefix}ChannelPlan` as RRMFormKey;
                const customKey = `${prefix}CustomChannels` as RRMFormKey;
                const currentPlan = form[planKey] as string;

                return (
                  <div key={band} className="space-y-3">
                    <h3 className="text-sm font-semibold border-b pb-1">{label}</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Channel Width</Label>
                        <Select value={form[widthKey] as string} onValueChange={v => setField(widthKey, v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CHANNEL_WIDTH_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Channel Plan</Label>
                        <Select value={currentPlan} onValueChange={v => setField(planKey, v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CHANNEL_PLAN_OPTIONS[band].map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Min Tx Power (dBm)</Label>
                        <Input
                          type="number"
                          value={form[minKey] as string}
                          onChange={e => setField(minKey, e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Max Tx Power (dBm)</Label>
                        <Input
                          type="number"
                          value={form[maxKey] as string}
                          onChange={e => setField(maxKey, e.target.value)}
                        />
                      </div>
                    </div>
                    {currentPlan === 'CUSTOM' && (
                      <div className="space-y-1.5">
                        <Label>Custom Channels</Label>
                        <Input
                          value={form[customKey] as string}
                          onChange={e => setField(customKey, e.target.value)}
                          placeholder="e.g. 1,6,11"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </TabsContent>

            {/* ── Scanning tab ───────────────────────────────────────── */}
            <TabsContent value="scanning" className="space-y-6">
              {(
                [
                  { label: '2.4 GHz', prefix: 'radio1' },
                  { label: '5 GHz', prefix: 'radio2' },
                ] as const
              ).map(({ label, prefix }) => {
                const durKey = `${prefix}ScanDuration` as RRMFormKey;
                const perKey = `${prefix}ScanPeriod` as RRMFormKey;
                const extKey = `${prefix}ExtScanFreq` as RRMFormKey;
                const cntKey = `${prefix}ScanSampleCount` as RRMFormKey;
                const clientKey = `${prefix}ClientAwareScanning` as RRMFormKey;
                const psKey = `${prefix}PowerSaveAwareScanning` as RRMFormKey;
                const txKey = `${prefix}TxLoadAwareScanning` as RRMFormKey;

                return (
                  <div key={prefix} className="space-y-3">
                    <h3 className="text-sm font-semibold border-b pb-1">{label}</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Scan Duration (ms)</Label>
                        <Input
                          type="number"
                          value={form[durKey] as string}
                          onChange={e => setField(durKey, e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Scan Period (s)</Label>
                        <Input
                          type="number"
                          value={form[perKey] as string}
                          onChange={e => setField(perKey, e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Ext Scan Frequency</Label>
                        <Input
                          type="number"
                          value={form[extKey] as string}
                          onChange={e => setField(extKey, e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Sample Count</Label>
                        <Input
                          type="number"
                          value={form[cntKey] as string}
                          onChange={e => setField(cntKey, e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5 col-span-2">
                        <Label>Power Save Aware Scanning</Label>
                        <Select
                          value={form[psKey] as string}
                          onValueChange={v => setField(psKey, v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {POWER_SAVE_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <Label className="font-normal">Client Aware Scanning</Label>
                        <Switch
                          checked={form[clientKey] as boolean}
                          onCheckedChange={v => setField(clientKey, v)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="font-normal">Tx Load Aware Scanning</Label>
                        <Switch
                          checked={form[txKey] as boolean}
                          onCheckedChange={v => setField(txKey, v)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </TabsContent>

            {/* ── Recovery tab ───────────────────────────────────────── */}
            <TabsContent value="recovery" className="space-y-6">
              {/* Hold Timers */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold border-b pb-1">Hold Timers</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Power Hold Time (s)</Label>
                    <Input
                      type="number"
                      value={form.powerHoldTime}
                      onChange={e => setField('powerHoldTime', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Channel Hold Time (s)</Label>
                    <Input
                      type="number"
                      value={form.channelHoldTime}
                      onChange={e => setField('channelHoldTime', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Neighbor Recovery */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold border-b pb-1">Neighbor Recovery Thresholds</h3>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      { label: '2.4 GHz', key: 'radio1NeighborPowerThreshold' },
                      { label: '5 GHz', key: 'radio2NeighborPowerThreshold' },
                      { label: '6 GHz', key: 'radio3NeighborPowerThreshold' },
                    ] as const
                  ).map(({ label, key }) => (
                    <div key={key} className="space-y-1.5">
                      <Label>{label} (dBm)</Label>
                      <Input
                        type="number"
                        value={form[key]}
                        onChange={e => setField(key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Dynamic Sample Recovery */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-1">
                  <h3 className="text-sm font-semibold">Dynamic Sample Recovery</h3>
                  <Switch
                    checked={form.dynamicSampleEnabled}
                    onCheckedChange={v => setField('dynamicSampleEnabled', v)}
                  />
                </div>
                {form.dynamicSampleEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Noise Floor (dBm)</Label>
                      <Input
                        type="number"
                        value={form.dynamicSampleNoise}
                        onChange={e => setField('dynamicSampleNoise', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Noise Factor</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.dynamicSampleNoiseFactor}
                        onChange={e => setField('dynamicSampleNoiseFactor', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Client Threshold</Label>
                      <Input
                        type="number"
                        value={form.dynamicSampleClientThreshold}
                        onChange={e => setField('dynamicSampleClientThreshold', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Interference Channel Switch Delta */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold border-b pb-1">Interference Recovery Channel Switch Delta</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>2.4 GHz Delta</Label>
                    <Input
                      type="number"
                      value={form.radio1ChannelSwitchDelta}
                      onChange={e => setField('radio1ChannelSwitchDelta', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>5 GHz Delta</Label>
                    <Input
                      type="number"
                      value={form.radio2ChannelSwitchDelta}
                      onChange={e => setField('radio2ChannelSwitchDelta', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* CCI */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-1">
                  <h3 className="text-sm font-semibold">CCI (Co-Channel Interference)</h3>
                  <Switch
                    checked={form.cciEnabled}
                    onCheckedChange={v => setField('cciEnabled', v)}
                  />
                </div>
                {form.cciEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>High Threshold (%)</Label>
                      <Input
                        type="number"
                        value={form.cciHighThreshold}
                        onChange={e => setField('cciHighThreshold', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Low Threshold (%)</Label>
                      <Input
                        type="number"
                        value={form.cciLowThreshold}
                        onChange={e => setField('cciLowThreshold', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Frequency (s)</Label>
                      <Input
                        type="number"
                        value={form.cciFrequency}
                        onChange={e => setField('cciFrequency', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Frequency Limiter</Label>
                      <Input
                        type="number"
                        value={form.cciFrequencyLimiter}
                        onChange={e => setField('cciFrequencyLimiter', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Select Shutdown */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-1">
                  <h3 className="text-sm font-semibold">Select Shutdown</h3>
                  <Switch
                    checked={form.selectShutdownEnabled}
                    onCheckedChange={v => setField('selectShutdownEnabled', v)}
                  />
                </div>
                {form.selectShutdownEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>CCI High (%)</Label>
                      <Input
                        type="number"
                        value={form.selectShutdownCciHigh}
                        onChange={e => setField('selectShutdownCciHigh', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>CCI Low (%)</Label>
                      <Input
                        type="number"
                        value={form.selectShutdownCciLow}
                        onChange={e => setField('selectShutdownCciLow', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Frequency (s)</Label>
                      <Input
                        type="number"
                        value={form.selectShutdownFrequency}
                        onChange={e => setField('selectShutdownFrequency', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Frequency Limiter</Label>
                      <Input
                        type="number"
                        value={form.selectShutdownFrequencyLimiter}
                        onChange={e => setField('selectShutdownFrequencyLimiter', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <SheetFooter className="mt-6 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update Profile' : 'Create Profile'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
