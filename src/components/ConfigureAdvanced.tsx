import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';

import { Alert, AlertDescription } from './ui/alert';
import {
  Settings,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  AlertCircle,
  Network,
  Gauge,
  Layers,
  Cpu,
  Bluetooth,
  Globe,
  Shield,
  Cable,
  Loader2,
  Radio,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { apiService } from '../services/api';
import { DevEpicBadge } from './DevEpicBadge';
import { toast } from 'sonner';
import { useAppContext } from '@/contexts/AppContext';
import { Server } from 'lucide-react';

/** Shared multi-controller fetch helper for all Advanced tabs */
function useMultiControllerFetch() {
  const { navigationScope, siteGroups, orgSiteGroupFilter, navigateToTemplateCreation } =
    useAppContext();
  const isOrgScope = navigationScope === 'global';

  const fetchAll = async <T,>(fetcher: () => Promise<T[]>): Promise<T[]> => {
    if (isOrgScope && siteGroups.length > 0) {
      const originalBaseUrl = apiService.getBaseUrl();
      const all: T[] = [];
      for (const sg of siteGroups) {
        try {
          apiService.setBaseUrl(`${sg.controller_url}/management`);
          const data = await fetcher();
          const tagged = (data || []).map((item) => ({
            ...item,
            _siteGroupId: sg.id,
            _siteGroupName: sg.name,
          }));
          all.push(...tagged);
        } catch (err) {
          console.warn(`[ConfigureAdvanced] Failed to fetch from ${sg.name}:`, err);
        }
      }
      apiService.setBaseUrl(originalBaseUrl === '/api/management' ? null : originalBaseUrl);
      return all;
    }
    return (await fetcher()) || [];
  };

  const filterBySg = <T,>(items: T[]): T[] => {
    if (!orgSiteGroupFilter) return items;
    return items.filter((item: any) => item._siteGroupId === orgSiteGroupFilter);
  };

  return { isOrgScope, siteGroups, fetchAll, filterBySg, navigateToTemplateCreation };
}

// ==================== TOPOLOGIES TAB ====================
function TopologiesTab() {
  const { fetchAll, filterBySg, isOrgScope, siteGroups, navigateToTemplateCreation } =
    useMultiControllerFetch();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState({
    name: '',
    vlanid: 1,
    mode: 'BridgedAtAp',
    tagged: false,
    mtu: 1500,
    enableMgmtTraffic: false,
    dhcpMode: 'DHCPNone',
    l3Presence: false,
    ipAddress: '',
    cidr: 24,
    gateway: '',
    dhcpStartIpRange: '',
    dhcpEndIpRange: '',
    dhcpDnsServers: '',
    dhcpDomain: '',
    dhcpDefaultLease: 86400,
    dhcpMaxLease: 86400,
    dhcpServers: '',
    dhcpExclusions: '' as string,
    wins: '',
    fqdn: '',
    foreignIpAddress: '',
    apRegistration: false,
    isid: 0,
    vni: 0,
    remoteVtepIp: '',
    cert: 0,
    certCa: 0,
    multicastBridging: false,
  });

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAll(() => apiService.getTopologies());
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      vlanid: 1,
      mode: 'BridgedAtAp',
      tagged: false,
      mtu: 1500,
      enableMgmtTraffic: false,
      dhcpMode: 'DHCPNone',
      l3Presence: false,
      ipAddress: '',
      cidr: 24,
      gateway: '',
      dhcpStartIpRange: '',
      dhcpEndIpRange: '',
      dhcpDnsServers: '',
      dhcpDomain: '',
      dhcpDefaultLease: 86400,
      dhcpMaxLease: 86400,
      dhcpServers: '',
      dhcpExclusions: '',
      wins: '',
      fqdn: '',
      foreignIpAddress: '',
      apRegistration: false,
      isid: 0,
      vni: 0,
      remoteVtepIp: '',
      cert: 0,
      certCa: 0,
      multicastBridging: false,
    });
    setShowDialog(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setForm({
      name: item.name || '',
      vlanid: item.vlanid || 1,
      mode: item.mode || 'BridgedAtAp',
      tagged: item.tagged || false,
      mtu: item.mtu || 1500,
      enableMgmtTraffic: item.enableMgmtTraffic || false,
      dhcpMode: item.dhcpMode || 'DHCPNone',
      l3Presence: item.l3Presence || false,
      ipAddress: item.ipAddress || '',
      cidr: item.cidr || 24,
      gateway: item.gateway || '',
      dhcpStartIpRange: item.dhcpStartIpRange || '',
      dhcpEndIpRange: item.dhcpEndIpRange || '',
      dhcpDnsServers: item.dhcpDnsServers || '',
      dhcpDomain: item.dhcpDomain || '',
      dhcpDefaultLease: item.dhcpDefaultLease || 86400,
      dhcpMaxLease: item.dhcpMaxLease || 86400,
      dhcpServers: item.dhcpServers || '',
      dhcpExclusions: Array.isArray(item.dhcpExclusions)
        ? item.dhcpExclusions.map((e: any) => `${e.startIp}-${e.endIp}`).join(', ')
        : '',
      wins: item.wins || '',
      fqdn: item.fqdn || '',
      foreignIpAddress: item.foreignIpAddress || '',
      apRegistration: item.apRegistration || false,
      isid: item.isid || 0,
      vni: item.vni || 0,
      remoteVtepIp: item.remoteVtepIp || '',
      cert: item.cert || 0,
      certCa: item.certCa || 0,
      multicastBridging: item.multicastBridging || false,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (form.vlanid < 1 || form.vlanid > 4094) {
      toast.error('VLAN ID must be 1-4094');
      return;
    }
    setSaving(true);
    try {
      // Convert DHCP exclusions string to array format
      const dhcpExclusionsArray = form.dhcpExclusions
        ? form.dhcpExclusions
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((range) => {
              const [startIp, endIp] = range.split('-').map((s) => s.trim());
              return { startIp, endIp: endIp || startIp };
            })
        : [];
      const { dhcpExclusions: _excStr, ...rest } = form;
      const payload = { ...rest, name: form.name.trim(), dhcpExclusions: dhcpExclusionsArray };
      if (editing) {
        await apiService.updateTopology(editing.id, { ...editing, ...payload });
        toast.success('Topology updated');
      } else {
        await apiService.createTopology(payload);
        toast.success('Topology created');
      }
      setShowDialog(false);
      load();
    } catch (err: any) {
      toast.error('Failed to save topology', { description: err.message });
    }
    setSaving(false);
  };

  const handleDelete = async (item: any) => {
    if (item.canDelete === false) {
      toast.error('This topology cannot be deleted');
      return;
    }
    if (!confirm(`Delete topology "${item.name}"?`)) return;
    try {
      await apiService.deleteTopology(item.id);
      toast.success('Topology deleted');
      load();
    } catch (err: any) {
      toast.error('Failed to delete', { description: err.message });
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">VLAN/Topology definitions ({items.length})</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          {isOrgScope ? (
            <Button size="sm" onClick={() => navigateToTemplateCreation('topology')}>
              <Layers className="h-4 w-4 mr-1" />
              Create Template
            </Button>
          ) : (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Create
            </Button>
          )}
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {isOrgScope && siteGroups.length > 1 && (
                <TableHead>
                  <div className="flex items-center gap-1">
                    <Server className="h-3 w-3" />
                    <span>Site Group</span>
                  </div>
                </TableHead>
              )}
              <TableHead>Name</TableHead>
              <TableHead>VLAN ID</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Tagged</TableHead>
              <TableHead>DHCP</TableHead>
              <TableHead>L3</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filterBySg(items).map((item) => (
              <TableRow key={item.id}>
                {isOrgScope && siteGroups.length > 1 && (
                  <TableCell>
                    <Badge variant="outline" className="text-xs px-1.5 py-0 font-normal">
                      {item._siteGroupName || '—'}
                    </Badge>
                  </TableCell>
                )}
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.vlanid}</TableCell>
                <TableCell>
                  <Badge variant="outline">{item.mode}</Badge>
                </TableCell>
                <TableCell>{item.tagged ? 'Yes' : 'No'}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">
                    {item.dhcpMode || 'None'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {item.l3Presence ? `${item.ipAddress || ''}/${item.cidr || ''}` : 'No'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(item)}
                      disabled={item.canEdit === false}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(item)}
                      disabled={item.canDelete === false}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground/60">
                    <Layers className="h-10 w-10" />
                    <span className="text-sm font-medium text-muted-foreground">
                      No topologies configured
                    </span>
                    <span className="text-xs">
                      VLAN topologies defined on the controller will appear here.
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={showDialog} onOpenChange={setShowDialog}>
        <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit Topology' : 'Create Topology'}</SheetTitle>
            <SheetDescription>VLAN/Topology configuration</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            {/* Essential Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="VLAN name"
                />
              </div>
              <div>
                <Label>VLAN ID (1-4094)</Label>
                <Input
                  type="number"
                  value={form.vlanid}
                  onChange={(e) => setForm({ ...form, vlanid: parseInt(e.target.value) || 1 })}
                  min={1}
                  max={4094}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Mode</Label>
                <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BridgedAtAp">Bridged at AP</SelectItem>
                    <SelectItem value="BridgedAtAc">Bridged at Controller</SelectItem>
                    <SelectItem value="Physical">Physical</SelectItem>
                    <SelectItem value="Management">Management</SelectItem>
                    <SelectItem value="FabricAttach">Fabric Attach</SelectItem>
                    <SelectItem value="Vxlan">VXLAN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between pt-6">
                <Label>Tagged</Label>
                <Switch
                  checked={form.tagged}
                  onCheckedChange={(v) => setForm({ ...form, tagged: v })}
                />
              </div>
            </div>

            {/* Advanced Settings - collapsed by default */}
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-muted-foreground hover:text-foreground"
                >
                  Advanced Settings
                  {showAdvanced ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>MTU</Label>
                    <Input
                      type="number"
                      value={form.mtu}
                      onChange={(e) => setForm({ ...form, mtu: parseInt(e.target.value) || 1500 })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between">
                    <Label>Mgmt Traffic</Label>
                    <Switch
                      checked={form.enableMgmtTraffic}
                      onCheckedChange={(v) => setForm({ ...form, enableMgmtTraffic: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Multicast Bridge</Label>
                    <Switch
                      checked={form.multicastBridging}
                      onCheckedChange={(v) => setForm({ ...form, multicastBridging: v })}
                    />
                  </div>
                </div>
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Layer 3 Configuration</Label>
                    <Switch
                      checked={form.l3Presence}
                      onCheckedChange={(v) => setForm({ ...form, l3Presence: v })}
                    />
                  </div>
                  {form.l3Presence && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label>IP Address</Label>
                        <Input
                          value={form.ipAddress}
                          onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
                          placeholder="172.16.0.1"
                        />
                      </div>
                      <div>
                        <Label>CIDR</Label>
                        <Input
                          type="number"
                          value={form.cidr}
                          onChange={(e) =>
                            setForm({ ...form, cidr: parseInt(e.target.value) || 24 })
                          }
                          min={0}
                          max={32}
                        />
                      </div>
                      <div>
                        <Label>Gateway</Label>
                        <Input
                          value={form.gateway}
                          onChange={(e) => setForm({ ...form, gateway: e.target.value })}
                          placeholder="172.16.0.254"
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="border rounded-lg p-4 space-y-3">
                  <Label className="text-sm font-medium">DHCP Settings</Label>
                  <Select
                    value={form.dhcpMode}
                    onValueChange={(v) => setForm({ ...form, dhcpMode: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DHCPNone">None</SelectItem>
                      <SelectItem value="DHCPRelay">Relay</SelectItem>
                      <SelectItem value="DHCPLocal">Local Server</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.dhcpMode === 'DHCPRelay' && (
                    <div>
                      <Label>DHCP Relay Servers</Label>
                      <Input
                        value={form.dhcpServers}
                        onChange={(e) => setForm({ ...form, dhcpServers: e.target.value })}
                        placeholder="10.0.0.1"
                      />
                    </div>
                  )}
                  {form.dhcpMode === 'DHCPLocal' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Start IP</Label>
                          <Input
                            value={form.dhcpStartIpRange}
                            onChange={(e) => setForm({ ...form, dhcpStartIpRange: e.target.value })}
                            placeholder="172.16.0.100"
                          />
                        </div>
                        <div>
                          <Label>End IP</Label>
                          <Input
                            value={form.dhcpEndIpRange}
                            onChange={(e) => setForm({ ...form, dhcpEndIpRange: e.target.value })}
                            placeholder="172.16.0.200"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>DNS Servers</Label>
                          <Input
                            value={form.dhcpDnsServers}
                            onChange={(e) => setForm({ ...form, dhcpDnsServers: e.target.value })}
                            placeholder="8.8.8.8,8.8.4.4"
                          />
                        </div>
                        <div>
                          <Label>WINS Server</Label>
                          <Input
                            value={form.wins}
                            onChange={(e) => setForm({ ...form, wins: e.target.value })}
                            placeholder="10.0.0.5"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Domain</Label>
                          <Input
                            value={form.dhcpDomain}
                            onChange={(e) => setForm({ ...form, dhcpDomain: e.target.value })}
                            placeholder="corp.local"
                          />
                        </div>
                        <div>
                          <Label>FQDN</Label>
                          <Input
                            value={form.fqdn}
                            onChange={(e) => setForm({ ...form, fqdn: e.target.value })}
                            placeholder="vlan100.corp.local"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Default Lease (sec)</Label>
                          <Input
                            type="number"
                            value={form.dhcpDefaultLease}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                dhcpDefaultLease: parseInt(e.target.value) || 86400,
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>Max Lease (sec)</Label>
                          <Input
                            type="number"
                            value={form.dhcpMaxLease}
                            onChange={(e) =>
                              setForm({ ...form, dhcpMaxLease: parseInt(e.target.value) || 86400 })
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <Label>DHCP Exclusions (start-end, comma-separated)</Label>
                        <Input
                          value={form.dhcpExclusions}
                          onChange={(e) => setForm({ ...form, dhcpExclusions: e.target.value })}
                          placeholder="172.16.0.1-172.16.0.10, 172.16.0.250-172.16.0.254"
                        />
                      </div>
                    </div>
                  )}
                </div>
                {form.mode === 'Vxlan' && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <Label className="text-sm font-medium">VXLAN Settings</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>VNI (1-16777215)</Label>
                        <Input
                          type="number"
                          value={form.vni}
                          onChange={(e) => setForm({ ...form, vni: parseInt(e.target.value) || 0 })}
                          min={1}
                          max={16777215}
                        />
                      </div>
                      <div>
                        <Label>Remote VTEP IP</Label>
                        <Input
                          value={form.remoteVtepIp}
                          onChange={(e) => setForm({ ...form, remoteVtepIp: e.target.value })}
                          placeholder="10.0.0.1"
                        />
                      </div>
                    </div>
                  </div>
                )}
                {form.mode === 'FabricAttach' && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <Label className="text-sm font-medium">Fabric Attach / SPB</Label>
                    <div>
                      <Label>I-SID</Label>
                      <Input
                        type="number"
                        value={form.isid}
                        onChange={(e) => setForm({ ...form, isid: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                )}
                <div className="border rounded-lg p-4 space-y-3">
                  <Label className="text-sm font-medium">Advanced</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Foreign IP Address</Label>
                      <Input
                        value={form.foreignIpAddress}
                        onChange={(e) => setForm({ ...form, foreignIpAddress: e.target.value })}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>AP Registration VLAN</Label>
                      <Switch
                        checked={form.apRegistration}
                        onCheckedChange={(v) => setForm({ ...form, apRegistration: v })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Certificate ID</Label>
                      <Input
                        type="number"
                        value={form.cert}
                        onChange={(e) => setForm({ ...form, cert: parseInt(e.target.value) || 0 })}
                        placeholder="0 = none"
                      />
                    </div>
                    <div>
                      <Label>CA Certificate ID</Label>
                      <Input
                        type="number"
                        value={form.certCa}
                        onChange={(e) =>
                          setForm({ ...form, certCa: parseInt(e.target.value) || 0 })
                        }
                        placeholder="0 = none"
                      />
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ==================== CoS TAB ====================
function CoSTab() {
  const { fetchAll, filterBySg, isOrgScope, siteGroups, navigateToTemplateCreation } =
    useMultiControllerFetch();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    cosName: '',
    transmitQueue: 0,
    priority: 'notApplicable',
    tosDscp: 0,
    inboundRateLimiterId: '',
    outboundRateLimiterId: '',
  });
  const [rateLimiters, setRateLimiters] = useState<any[]>([]);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [cosData, rlData] = await Promise.allSettled([
        fetchAll(() => apiService.getCoSProfiles()),
        fetchAll(() => apiService.getRateLimiters()),
      ]);
      setItems(cosData.status === 'fulfilled' && Array.isArray(cosData.value) ? cosData.value : []);
      setRateLimiters(
        rlData.status === 'fulfilled' && Array.isArray(rlData.value) ? rlData.value : []
      );
    } catch {
      setItems([]);
    }
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      cosName: '',
      transmitQueue: 0,
      priority: 'notApplicable',
      tosDscp: 0,
      inboundRateLimiterId: '',
      outboundRateLimiterId: '',
    });
    setShowDialog(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setForm({
      cosName: item.cosName || '',
      transmitQueue: item.transmitQueue || 0,
      priority: item.cosQos?.priority || 'notApplicable',
      tosDscp: item.cosQos?.tosDscp || 0,
      inboundRateLimiterId: item.inboundRateLimiterId || '',
      outboundRateLimiterId: item.outboundRateLimiterId || '',
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.cosName.trim()) {
      toast.error('CoS name is required');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        cosName: form.cosName.trim(),
        transmitQueue: form.transmitQueue,
        cosQos: { priority: form.priority, tosDscp: form.tosDscp },
        inboundRateLimiterId: form.inboundRateLimiterId || null,
        outboundRateLimiterId: form.outboundRateLimiterId || null,
      };
      if (editing) {
        await apiService.updateCoSProfile(editing.id, { ...editing, ...payload });
        toast.success('CoS profile updated');
      } else {
        await apiService.createCoSProfile(payload);
        toast.success('CoS profile created');
      }
      setShowDialog(false);
      load();
    } catch (err: any) {
      toast.error('Failed to save', { description: err.message });
    }
    setSaving(false);
  };

  const handleDelete = async (item: any) => {
    if (item.predefined) {
      toast.error('Cannot delete predefined CoS profile');
      return;
    }
    if (!confirm(`Delete CoS "${item.cosName}"?`)) return;
    try {
      await apiService.deleteCoSProfile(item.id);
      toast.success('CoS profile deleted');
      load();
    } catch (err: any) {
      toast.error('Failed to delete', { description: err.message });
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Class of Service profiles ({items.length})</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          {isOrgScope ? (
            <Button size="sm" onClick={() => navigateToTemplateCreation('cos_profile')}>
              <Layers className="h-4 w-4 mr-1" />
              Create Template
            </Button>
          ) : (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Create
            </Button>
          )}
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Queue</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>ToS/DSCP</TableHead>
              <TableHead>Predefined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.cosName}</TableCell>
                <TableCell>{item.transmitQueue}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">
                    {item.cosQos?.priority || 'N/A'}
                  </Badge>
                </TableCell>
                <TableCell>{item.cosQos?.tosDscp ?? 'N/A'}</TableCell>
                <TableCell>
                  {item.predefined ? (
                    <Badge>System</Badge>
                  ) : (
                    <Badge variant="outline">Custom</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(item)}
                      disabled={item.predefined}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(item)}
                      disabled={item.predefined}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No CoS profiles found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={showDialog} onOpenChange={setShowDialog}>
        <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit CoS Profile' : 'Create CoS Profile'}</SheetTitle>
            <SheetDescription>QoS settings for traffic classification</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            <div>
              <Label>CoS Name</Label>
              <Input
                value={form.cosName}
                onChange={(e) => setForm({ ...form, cosName: e.target.value })}
                placeholder="My-CoS"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Transmit Queue</Label>
                <Input
                  type="number"
                  value={form.transmitQueue}
                  onChange={(e) =>
                    setForm({ ...form, transmitQueue: parseInt(e.target.value) || 0 })
                  }
                  min={0}
                  max={7}
                />
              </div>
              <div>
                <Label>802.1p Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="notApplicable">Not Applicable</SelectItem>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((p) => (
                      <SelectItem key={p} value={`priority${p}`}>
                        Priority {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>ToS/DSCP (0-255)</Label>
              <Input
                type="number"
                value={form.tosDscp}
                onChange={(e) => setForm({ ...form, tosDscp: parseInt(e.target.value) || 0 })}
                min={0}
                max={255}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Inbound Rate Limiter</Label>
                <Select
                  value={form.inboundRateLimiterId || 'none'}
                  onValueChange={(v) =>
                    setForm({ ...form, inboundRateLimiterId: v === 'none' ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {rateLimiters.map((rl) => (
                      <SelectItem key={rl.id} value={rl.id}>
                        {rl.name} ({rl.cirKbps} kbps)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Outbound Rate Limiter</Label>
                <Select
                  value={form.outboundRateLimiterId || 'none'}
                  onValueChange={(v) =>
                    setForm({ ...form, outboundRateLimiterId: v === 'none' ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {rateLimiters.map((rl) => (
                      <SelectItem key={rl.id} value={rl.id}>
                        {rl.name} ({rl.cirKbps} kbps)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ==================== RATE LIMITERS TAB ====================
function RateLimitersTab() {
  const { fetchAll, isOrgScope, navigateToTemplateCreation } = useMultiControllerFetch();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', cirKbps: 1000 });

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAll(() => apiService.getRateLimiters());
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', cirKbps: 1000 });
    setShowDialog(true);
  };
  const openEdit = (item: any) => {
    setEditing(item);
    setForm({ name: item.name || '', cirKbps: item.cirKbps || 1000 });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), cirKbps: form.cirKbps };
      if (editing) {
        await apiService.updateRateLimiter(editing.id, { ...editing, ...payload });
        toast.success('Rate limiter updated');
      } else {
        await apiService.createRateLimiter(payload);
        toast.success('Rate limiter created');
      }
      setShowDialog(false);
      load();
    } catch (err: any) {
      toast.error('Failed to save', { description: err.message });
    }
    setSaving(false);
  };

  const handleDelete = async (item: any) => {
    if (!confirm(`Delete rate limiter "${item.name}"?`)) return;
    try {
      await apiService.deleteRateLimiter(item.id);
      toast.success('Rate limiter deleted');
      load();
    } catch (err: any) {
      toast.error('Failed to delete', { description: err.message });
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Rate limiters ({items.length}). Max 8 ingress + 8 egress per station.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          {isOrgScope ? (
            <Button size="sm" onClick={() => navigateToTemplateCreation('rate_limiter')}>
              <Layers className="h-4 w-4 mr-1" />
              Create Template
            </Button>
          ) : (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Create
            </Button>
          )}
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Rate (CIR kbps)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.cirKbps === 0 ? 'Unlimited' : `${item.cirKbps} kbps`}</TableCell>
                <TableCell>
                  <Badge variant="outline">{item.predefined ? 'System' : 'Custom'}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(item)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No rate limiters found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={showDialog} onOpenChange={setShowDialog}>
        <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit Rate Limiter' : 'Create Rate Limiter'}</SheetTitle>
            <SheetDescription>Bandwidth rate limiting configuration</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            <div>
              <Label>Name (1-64 chars)</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Rate limiter name"
                maxLength={64}
              />
            </div>
            <div>
              <Label>Average Rate CIR (kbps, 128-25000, 0=unlimited)</Label>
              <Input
                type="number"
                value={form.cirKbps}
                onChange={(e) => setForm({ ...form, cirKbps: parseInt(e.target.value) || 0 })}
                min={0}
                max={25000}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ==================== AP PROFILES TAB ====================
function ProfilesTab() {
  const { fetchAll, isOrgScope, navigateToTemplateCreation } = useMultiControllerFetch();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    apPlatform: '',
    sshEnabled: false,
    bandPreference: false,
    sessionPersistence: false,
    secureTunnelMode: 'disabled',
    ledStatus: 'NORMAL',
    apLogLevel: 'Warnings',
    clientBalancing: false,
    mgmtVlanId: 1,
    mgmtVlanTagged: false,
    ge2mode: 'Backup',
    pollTimeout: 3,
    mtu: 1500,
  });

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAll(() => apiService.getProfiles());
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      apPlatform: '',
      sshEnabled: false,
      bandPreference: false,
      sessionPersistence: false,
      secureTunnelMode: 'disabled',
      ledStatus: 'NORMAL',
      apLogLevel: 'Warnings',
      clientBalancing: false,
      mgmtVlanId: 1,
      mgmtVlanTagged: false,
      ge2mode: 'Backup',
      pollTimeout: 3,
      mtu: 1500,
    });
    setShowDialog(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setForm({
      name: item.name || '',
      apPlatform: item.apPlatform || '',
      sshEnabled: item.sshEnabled || false,
      bandPreference: item.bandPreference || false,
      sessionPersistence: item.sessionPersistence || false,
      secureTunnelMode: item.secureTunnelMode || 'disabled',
      ledStatus: item.ledStatus || 'NORMAL',
      apLogLevel: item.apLogLevel || 'Warnings',
      clientBalancing: item.clientBalancing || false,
      mgmtVlanId: item.mgmtVlanId || 1,
      mgmtVlanTagged: item.mgmtVlanTagged || false,
      ge2mode: item.ge2mode || 'Backup',
      pollTimeout: item.pollTimeout || 3,
      mtu: item.mtu || 1500,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Profile name is required');
      return;
    }
    setSaving(true);
    try {
      const payload: any = { ...form, name: form.name.trim() };
      if (!payload.apPlatform) delete payload.apPlatform;
      if (editing) {
        await apiService.updateProfile(editing.id, { ...editing, ...payload });
        toast.success('Profile updated');
      } else {
        if (!form.apPlatform) {
          toast.error('AP Platform is required for new profiles');
          setSaving(false);
          return;
        }
        await apiService.createProfile(payload);
        toast.success('Profile created');
      }
      setShowDialog(false);
      load();
    } catch (err: any) {
      toast.error('Failed to save', { description: err.message });
    }
    setSaving(false);
  };

  const handleDelete = async (item: any) => {
    if (item.predefined) {
      toast.error('Cannot delete predefined profile');
      return;
    }
    if (!confirm(`Delete profile "${item.name}"?`)) return;
    try {
      await apiService.deleteProfile(item.id);
      toast.success('Profile deleted');
      load();
    } catch (err: any) {
      toast.error('Failed to delete', { description: err.message });
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">AP profiles ({items.length})</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          {isOrgScope ? (
            <Button size="sm" onClick={() => navigateToTemplateCreation('ap_profile')}>
              <Layers className="h-4 w-4 mr-1" />
              Create Template
            </Button>
          ) : (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Create
            </Button>
          )}
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Tunnel</TableHead>
              <TableHead>LED</TableHead>
              <TableHead>Mgmt VLAN</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{item.apPlatform || 'N/A'}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">
                    {item.secureTunnelMode || 'disabled'}
                  </Badge>
                </TableCell>
                <TableCell>{item.ledStatus || 'NORMAL'}</TableCell>
                <TableCell>
                  {item.mgmtVlanId || 1}
                  {item.mgmtVlanTagged ? ' (tagged)' : ''}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(item)}
                      disabled={item.predefined}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(item)}
                      disabled={item.predefined}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground/60">
                    <Settings className="h-10 w-10" />
                    <span className="text-sm font-medium text-muted-foreground">
                      No AP profiles configured
                    </span>
                    <span className="text-xs">
                      Create a profile to define radio and security settings for access points.
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={showDialog} onOpenChange={setShowDialog}>
        <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit AP Profile' : 'Create AP Profile'}</SheetTitle>
            <SheetDescription>AP device profile configuration</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Profile Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Profile name"
                />
              </div>
              <div>
                <Label>AP Platform</Label>
                <Input
                  value={form.apPlatform}
                  onChange={(e) => setForm({ ...form, apPlatform: e.target.value })}
                  placeholder="e.g. AP3000"
                  disabled={!!editing}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Secure Tunnel</Label>
                <Select
                  value={form.secureTunnelMode}
                  onValueChange={(v) => setForm({ ...form, secureTunnelMode: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="control">Control Only</SelectItem>
                    <SelectItem value="controlData">Control + Data</SelectItem>
                    <SelectItem value="debug">Debug</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>LED Status</Label>
                <Select
                  value={form.ledStatus}
                  onValueChange={(v) => setForm({ ...form, ledStatus: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OFF">Off</SelectItem>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="IDENTITY">Identity</SelectItem>
                    <SelectItem value="SOLID">Solid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Log Level</Label>
                <Select
                  value={form.apLogLevel}
                  onValueChange={(v) => setForm({ ...form, apLogLevel: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      'Emergencies',
                      'Alerts',
                      'Critical',
                      'Errors',
                      'Warnings',
                      'Notifications',
                      'Informational',
                      'Debugging',
                    ].map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>GE2 Mode</Label>
                <Select
                  value={form.ge2mode}
                  onValueChange={(v) => setForm({ ...form, ge2mode: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Backup">Backup</SelectItem>
                    <SelectItem value="LAG">LAG</SelectItem>
                    <SelectItem value="Client">Client Bridge</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Mgmt VLAN ID</Label>
                <Input
                  type="number"
                  value={form.mgmtVlanId}
                  onChange={(e) => setForm({ ...form, mgmtVlanId: parseInt(e.target.value) || 1 })}
                  min={1}
                  max={4094}
                />
              </div>
              <div>
                <Label>Poll Timeout (s)</Label>
                <Input
                  type="number"
                  value={form.pollTimeout}
                  onChange={(e) => setForm({ ...form, pollTimeout: parseInt(e.target.value) || 3 })}
                  min={3}
                  max={600}
                />
              </div>
              <div>
                <Label>MTU</Label>
                <Input
                  type="number"
                  value={form.mtu}
                  onChange={(e) => setForm({ ...form, mtu: parseInt(e.target.value) || 1500 })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <Label>SSH Enabled</Label>
                <Switch
                  checked={form.sshEnabled}
                  onCheckedChange={(v) => setForm({ ...form, sshEnabled: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Band Preference</Label>
                <Switch
                  checked={form.bandPreference}
                  onCheckedChange={(v) => setForm({ ...form, bandPreference: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Session Persistence</Label>
                <Switch
                  checked={form.sessionPersistence}
                  onCheckedChange={(v) => setForm({ ...form, sessionPersistence: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Client Balancing</Label>
                <Switch
                  checked={form.clientBalancing}
                  onCheckedChange={(v) => setForm({ ...form, clientBalancing: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Mgmt VLAN Tagged</Label>
                <Switch
                  checked={form.mgmtVlanTagged}
                  onCheckedChange={(v) => setForm({ ...form, mgmtVlanTagged: v })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ==================== IoT PROFILES TAB ====================
function IoTTab() {
  const { fetchAll } = useMultiControllerFetch();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    appId: 'iBeaconAdvertisement',
    interval: 1000,
    major: 0,
    minor: 0,
    uuid: '',
    measuredRssi: -47,
    destAddr: '',
    destPort: 0,
    window: 1000,
    minRSS: -70,
  });

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAll(() => apiService.getIoTProfiles());
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      appId: 'iBeaconAdvertisement',
      interval: 1000,
      major: 0,
      minor: 0,
      uuid: '',
      measuredRssi: -47,
      destAddr: '',
      destPort: 0,
      window: 1000,
      minRSS: -70,
    });
    setShowDialog(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    const sub =
      item.iBeaconAdvertisement ||
      item.iBeaconScan ||
      item.eddystoneAdvertisement ||
      item.eddystoneScan ||
      item.threadGateway ||
      {};
    setForm({
      name: item.name || '',
      appId: item.appId || 'iBeaconAdvertisement',
      interval: sub.interval || 1000,
      major: sub.major || 0,
      minor: sub.minor || 0,
      uuid: sub.uuid || '',
      measuredRssi: sub.measuredRssi || -47,
      destAddr: sub.destAddr || '',
      destPort: sub.destPort || 0,
      window: sub.window || 1000,
      minRSS: sub.minRSS || -70,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload: any = { name: form.name.trim(), appId: form.appId };
      if (form.appId === 'iBeaconAdvertisement') {
        payload.iBeaconAdvertisement = {
          interval: form.interval,
          major: form.major,
          minor: form.minor,
          uuid: form.uuid,
          measuredRssi: form.measuredRssi,
        };
      } else if (form.appId === 'iBeaconScan') {
        payload.iBeaconScan = {
          destAddr: form.destAddr,
          destPort: form.destPort,
          interval: form.interval,
          window: form.window,
          minRSS: form.minRSS,
          uuid: form.uuid,
        };
      } else if (form.appId === 'eddystoneAdvertisement') {
        payload.eddystoneAdvertisement = {
          interval: form.interval,
          measuredRssi: form.measuredRssi,
        };
      } else if (form.appId === 'eddystoneScan') {
        payload.eddystoneScan = {
          destAddr: form.destAddr,
          destPort: form.destPort,
          interval: form.interval,
          window: form.window,
          minRSS: form.minRSS,
        };
      }
      if (editing) {
        await apiService.updateIoTProfile(editing.id, { ...editing, ...payload });
        toast.success('IoT profile updated');
      } else {
        await apiService.createIoTProfile(payload);
        toast.success('IoT profile created');
      }
      setShowDialog(false);
      load();
    } catch (err: any) {
      toast.error('Failed to save', { description: err.message });
    }
    setSaving(false);
  };

  const handleDelete = async (item: any) => {
    if (!confirm(`Delete IoT profile "${item.name}"?`)) return;
    try {
      await apiService.deleteIoTProfile(item.id);
      toast.success('IoT profile deleted');
      load();
    } catch (err: any) {
      toast.error('Failed to delete', { description: err.message });
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">IoT profiles ({items.length})</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Create
          </Button>
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Application</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{item.appId}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(item)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  No IoT profiles found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={showDialog} onOpenChange={setShowDialog}>
        <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit IoT Profile' : 'Create IoT Profile'}</SheetTitle>
            <SheetDescription>BLE beacon and Thread gateway configuration</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="IoT profile name"
              />
            </div>
            <div>
              <Label>Application</Label>
              <Select value={form.appId} onValueChange={(v) => setForm({ ...form, appId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="iBeaconAdvertisement">iBeacon Advertisement</SelectItem>
                  <SelectItem value="iBeaconScan">iBeacon Scan</SelectItem>
                  <SelectItem value="eddystoneAdvertisement">Eddystone Advertisement</SelectItem>
                  <SelectItem value="eddystoneScan">Eddystone Scan</SelectItem>
                  <SelectItem value="threadGateway">Thread Gateway</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.appId === 'iBeaconAdvertisement' && (
              <div className="space-y-3 border rounded-lg p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Interval (ms)</Label>
                    <Input
                      type="number"
                      value={form.interval}
                      onChange={(e) =>
                        setForm({ ...form, interval: parseInt(e.target.value) || 1000 })
                      }
                    />
                  </div>
                  <div>
                    <Label>Measured RSSI</Label>
                    <Input
                      type="number"
                      value={form.measuredRssi}
                      onChange={(e) =>
                        setForm({ ...form, measuredRssi: parseInt(e.target.value) || -47 })
                      }
                    />
                  </div>
                  <div>
                    <Label>Major</Label>
                    <Input
                      type="number"
                      value={form.major}
                      onChange={(e) => setForm({ ...form, major: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label>Minor</Label>
                    <Input
                      type="number"
                      value={form.minor}
                      onChange={(e) => setForm({ ...form, minor: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div>
                  <Label>UUID</Label>
                  <Input
                    value={form.uuid}
                    onChange={(e) => setForm({ ...form, uuid: e.target.value })}
                    placeholder="Beacon UUID"
                  />
                </div>
              </div>
            )}
            {(form.appId === 'iBeaconScan' || form.appId === 'eddystoneScan') && (
              <div className="space-y-3 border rounded-lg p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Dest Address</Label>
                    <Input
                      value={form.destAddr}
                      onChange={(e) => setForm({ ...form, destAddr: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Dest Port</Label>
                    <Input
                      type="number"
                      value={form.destPort}
                      onChange={(e) =>
                        setForm({ ...form, destPort: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div>
                    <Label>Interval (ms)</Label>
                    <Input
                      type="number"
                      value={form.interval}
                      onChange={(e) =>
                        setForm({ ...form, interval: parseInt(e.target.value) || 1000 })
                      }
                    />
                  </div>
                  <div>
                    <Label>Window (ms)</Label>
                    <Input
                      type="number"
                      value={form.window}
                      onChange={(e) =>
                        setForm({ ...form, window: parseInt(e.target.value) || 1000 })
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Min RSS</Label>
                  <Input
                    type="number"
                    value={form.minRSS}
                    onChange={(e) => setForm({ ...form, minRSS: parseInt(e.target.value) || -70 })}
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ==================== MESHPOINTS TAB ====================
function MeshpointsTab() {
  const { fetchAll } = useMultiControllerFetch();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    meshId: '',
    status: 'enabled',
    neighborTimeout: 120,
    presharedKey: '',
  });

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAll(() => apiService.getMeshPoints());
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', meshId: '', status: 'enabled', neighborTimeout: 120, presharedKey: '' });
    setShowDialog(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setForm({
      name: item.name || '',
      meshId: item.meshId || '',
      status: item.status || 'enabled',
      neighborTimeout: item.neighborTimeout || 120,
      presharedKey: '',
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!form.meshId.trim()) {
      toast.error('Mesh ID is required');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        meshId: form.meshId.trim(),
        status: form.status,
        neighborTimeout: form.neighborTimeout,
      };
      if (form.presharedKey) {
        payload.privacy = { presharedKey: form.presharedKey };
      }
      if (editing) {
        await apiService.updateMeshPoint(editing.id, { ...editing, ...payload });
        toast.success('Meshpoint updated');
      } else {
        await apiService.createMeshPoint(payload);
        toast.success('Meshpoint created');
      }
      setShowDialog(false);
      load();
    } catch (err: any) {
      toast.error('Failed to save', { description: err.message });
    }
    setSaving(false);
  };

  const handleDelete = async (item: any) => {
    if (!confirm(`Delete meshpoint "${item.name}"?`)) return;
    try {
      await apiService.deleteMeshPoint(item.id);
      toast.success('Meshpoint deleted');
      load();
    } catch (err: any) {
      toast.error('Failed to delete', { description: err.message });
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Meshpoints / MeshConnex ({items.length})</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Create
          </Button>
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mesh ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Neighbor Timeout</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.meshId}</TableCell>
                <TableCell>
                  <Badge
                    className={
                      item.status === 'enabled'
                        ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                        : 'bg-muted text-muted-foreground'
                    }
                  >
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell>{item.neighborTimeout}s</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(item)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No meshpoints found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={showDialog} onOpenChange={setShowDialog}>
        <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit Meshpoint' : 'Create Meshpoint'}</SheetTitle>
            <SheetDescription>MeshConnex wireless mesh configuration</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Meshpoint name"
                />
              </div>
              <div>
                <Label>Mesh ID (1-32 chars)</Label>
                <Input
                  value={form.meshId}
                  onChange={(e) => setForm({ ...form, meshId: e.target.value })}
                  placeholder="Mesh identifier"
                  maxLength={32}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enabled">Enabled</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Neighbor Timeout (60-86400s)</Label>
                <Input
                  type="number"
                  value={form.neighborTimeout}
                  onChange={(e) =>
                    setForm({ ...form, neighborTimeout: parseInt(e.target.value) || 120 })
                  }
                  min={60}
                  max={86400}
                />
              </div>
            </div>
            <div>
              <Label>Pre-shared Key (optional)</Label>
              <Input
                type="password"
                value={form.presharedKey}
                onChange={(e) => setForm({ ...form, presharedKey: e.target.value })}
                placeholder="PSK for mesh encryption"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ==================== ACCESS CONTROL TAB ====================
function AccessControlTab() {
  const [macList, setMacList] = useState<string[]>([]);
  const [macMode, setMacMode] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newMac, setNewMac] = useState('');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiService.getAccessControl();
      if (data) {
        setMacList(Array.isArray(data.macList) ? data.macList : []);
        setMacMode(data.macMode || 1);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiService.updateAccessControl({ macMode, macList });
      toast.success('Access control updated');
    } catch (err: any) {
      toast.error('Failed to update access control', { description: err.message });
    }
    setSaving(false);
  };

  const addMac = () => {
    const mac = newMac.trim().toUpperCase();
    if (!mac) return;
    if (macList.includes(mac)) {
      toast.error('MAC already in list');
      return;
    }
    setMacList([...macList, mac]);
    setNewMac('');
  };

  const removeMac = (mac: string) => {
    setMacList(macList.filter((m) => m !== mac));
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Global MAC access control list ({macList.length} entries)
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <Label>MAC Mode</Label>
            <Select value={String(macMode)} onValueChange={(v) => setMacMode(parseInt(v))}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Whitelist (allow only listed)</SelectItem>
                <SelectItem value="2">Blacklist (deny listed)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Switching modes will clear the existing list
            </p>
          </div>

          <div className="flex gap-2">
            <Input
              value={newMac}
              onChange={(e) => setNewMac(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF"
              className="w-64"
              onKeyDown={(e) => e.key === 'Enter' && addMac()}
            />
            <Button variant="outline" onClick={addMac}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>

          {macList.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>MAC Address</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {macList.map((mac, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono">{mac}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => removeMac(mac)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No MAC addresses in the {macMode === 1 ? 'whitelist' : 'blacklist'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== LOCATION SERVICES TAB ====================
function LocationServicesTab() {
  const { fetchAll } = useMultiControllerFetch();
  const [xlocProfiles, setXlocProfiles] = useState<any[]>([]);
  const [rtlsProfiles, setRtlsProfiles] = useState<any[]>([]);
  const [posProfiles, setPosProfiles] = useState<any[]>([]);
  const [analyticsProfiles, setAnalyticsProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogType, setDialogType] = useState<'xloc' | 'rtls' | 'positioning' | 'analytics'>(
    'xloc'
  );
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [xloc, rtls, pos, an] = await Promise.allSettled([
        fetchAll(() => apiService.getXLocationProfiles()),
        fetchAll(() => apiService.getRTLSProfiles()),
        fetchAll(() => apiService.getPositioningProfiles()),
        fetchAll(() => apiService.getAnalyticsProfiles()),
      ]);
      setXlocProfiles(xloc.status === 'fulfilled' && Array.isArray(xloc.value) ? xloc.value : []);
      setRtlsProfiles(rtls.status === 'fulfilled' && Array.isArray(rtls.value) ? rtls.value : []);
      setPosProfiles(pos.status === 'fulfilled' && Array.isArray(pos.value) ? pos.value : []);
      setAnalyticsProfiles(an.status === 'fulfilled' && Array.isArray(an.value) ? an.value : []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  };

  const openDialog = (type: typeof dialogType, item?: any) => {
    setDialogType(type);
    setEditing(item || null);
    if (type === 'xloc')
      setForm({
        name: item?.name || '',
        svrAddr: item?.svrAddr || '',
        minRss: item?.minRss || -70,
        reportFreq: item?.reportFreq || 10,
        tenantId: item?.tenantId || '',
      });
    else if (type === 'rtls')
      setForm({
        name: item?.name || '',
        appId: item?.appId || 'AeroScout',
        ip: '',
        port: 12092,
        mcast: '01:18:8E:00:00:00',
      });
    else if (type === 'positioning')
      setForm({ name: item?.name || '', collection: item?.collection || 'Off' });
    else if (type === 'analytics')
      setForm({
        name: item?.name || '',
        destAddr: item?.destAddr || '',
        reportFreq: item?.reportFreq || 60,
      });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      if (dialogType === 'xloc') {
        if (editing) await apiService.updateXLocationProfile(editing.id, { ...editing, ...form });
        else await apiService.createXLocationProfile(form);
      } else if (dialogType === 'rtls') {
        const payload: any = { name: form.name, appId: form.appId };
        const sub = { ip: form.ip, port: form.port, mcast: form.mcast };
        payload[form.appId.charAt(0).toLowerCase() + form.appId.slice(1)] = sub;
        if (editing) await apiService.updateRTLSProfile(editing.id, { ...editing, ...payload });
        else await apiService.createRTLSProfile(payload);
      } else if (dialogType === 'positioning') {
        if (editing) await apiService.updatePositioningProfile(editing.id, { ...editing, ...form });
        else await apiService.createPositioningProfile(form);
      } else if (dialogType === 'analytics') {
        if (editing) await apiService.updateAnalyticsProfile(editing.id, { ...editing, ...form });
        else await apiService.createAnalyticsProfile(form);
      }
      toast.success(`${dialogType} profile ${editing ? 'updated' : 'created'}`);
      setShowDialog(false);
      load();
    } catch (err: any) {
      toast.error('Failed to save', { description: err.message });
    }
    setSaving(false);
  };

  const handleDelete = async (type: string, item: any) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    try {
      if (type === 'xloc') await apiService.deleteXLocationProfile(item.id);
      else if (type === 'rtls') await apiService.deleteRTLSProfile(item.id);
      else if (type === 'positioning') await apiService.deletePositioningProfile(item.id);
      else if (type === 'analytics') await apiService.deleteAnalyticsProfile(item.id);
      toast.success('Profile deleted');
      load();
    } catch (err: any) {
      toast.error('Failed to delete', { description: err.message });
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );

  const renderTable = (title: string, type: typeof dialogType, data: any[]) => (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <CardTitle className="text-base">
            {title} ({data.length})
          </CardTitle>
          <Button size="sm" onClick={() => openDialog(type)}>
            <Plus className="h-4 w-4 mr-1" />
            Create
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground/60">
            <Globe className="h-8 w-8" />
            <p className="text-sm font-medium text-muted-foreground">No profiles configured</p>
            <p className="text-xs">
              Use the Create button above to add a {title.toLowerCase()} profile.
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {type === 'xloc' && `Server: ${item.svrAddr || 'N/A'}`}
                      {type === 'rtls' && `App: ${item.appId || 'N/A'}`}
                      {type === 'positioning' && `Collection: ${item.collection || 'Off'}`}
                      {type === 'analytics' &&
                        `Dest: ${item.destAddr || 'N/A'}, Freq: ${item.reportFreq || 'N/A'}s`}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openDialog(type, item)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(type, item)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Location, RTLS, Analytics, and Positioning profiles
        </p>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh All
        </Button>
      </div>
      {renderTable('ExtremeLocation (XLocation)', 'xloc', xlocProfiles)}
      {renderTable('RTLS Profiles', 'rtls', rtlsProfiles)}
      {renderTable('Positioning Profiles', 'positioning', posProfiles)}
      {renderTable('Analytics Profiles', 'analytics', analyticsProfiles)}

      <Sheet open={showDialog} onOpenChange={setShowDialog}>
        <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editing ? 'Edit' : 'Create'}{' '}
              {dialogType === 'xloc'
                ? 'XLocation'
                : dialogType === 'rtls'
                  ? 'RTLS'
                  : dialogType === 'positioning'
                    ? 'Positioning'
                    : 'Analytics'}{' '}
              Profile
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            {dialogType === 'xloc' && (
              <>
                <div>
                  <Label>Server Address</Label>
                  <Input
                    value={form.svrAddr || ''}
                    onChange={(e) => setForm({ ...form, svrAddr: e.target.value })}
                    placeholder="feeds1.extremelocation.com"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Min RSS</Label>
                    <Input
                      type="number"
                      value={form.minRss || -70}
                      onChange={(e) => setForm({ ...form, minRss: parseInt(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Report Freq (s)</Label>
                    <Input
                      type="number"
                      value={form.reportFreq || 10}
                      onChange={(e) => setForm({ ...form, reportFreq: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Tenant ID</Label>
                  <Input
                    value={form.tenantId || ''}
                    onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                  />
                </div>
              </>
            )}
            {dialogType === 'rtls' && (
              <>
                <div>
                  <Label>Application</Label>
                  <Select
                    value={form.appId || 'AeroScout'}
                    onValueChange={(v) => setForm({ ...form, appId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AeroScout">AeroScout</SelectItem>
                      <SelectItem value="Ekahau">Ekahau</SelectItem>
                      <SelectItem value="Centrak">Centrak</SelectItem>
                      <SelectItem value="Sonitor">Sonitor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>IP Address</Label>
                    <Input
                      value={form.ip || ''}
                      onChange={(e) => setForm({ ...form, ip: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Port</Label>
                    <Input
                      type="number"
                      value={form.port || 12092}
                      onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Multicast MAC</Label>
                  <Input
                    value={form.mcast || ''}
                    onChange={(e) => setForm({ ...form, mcast: e.target.value })}
                  />
                </div>
              </>
            )}
            {dialogType === 'positioning' && (
              <div>
                <Label>Collection Mode</Label>
                <Select
                  value={form.collection || 'Off'}
                  onValueChange={(v) => setForm({ ...form, collection: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Off">Off</SelectItem>
                    <SelectItem value="ActiveClients">Active Clients</SelectItem>
                    <SelectItem value="AllClients">All Clients</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {dialogType === 'analytics' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Dest Address</Label>
                  <Input
                    value={form.destAddr || ''}
                    onChange={(e) => setForm({ ...form, destAddr: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Report Freq (s)</Label>
                  <Input
                    type="number"
                    value={form.reportFreq || 60}
                    onChange={(e) => setForm({ ...form, reportFreq: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ==================== RF MANAGEMENT TAB ====================
function RFManagementTab() {
  const { fetchAll, filterBySg, isOrgScope, siteGroups, navigateToTemplateCreation } =
    useMultiControllerFetch();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvancedRF] = useState(false);
  const [form, setForm] = useState<any>({
    name: '',
    type: 'SMARTRF',
    // SmartRF settings
    smartRfEnabled: true,
    smartMonitoring: true,
    ocsMonitoringAwareness: false,
    ocsMonitoringAwarenessThreshold: 50,
    // Per-band settings (2.4GHz)
    radio1Power: 'auto',
    radio1Channel: 'auto',
    radio1CoverageInterval: 60,
    radio1RecoveryInterval: 60,
    radio1PowerThreshold: -70,
    // Per-band settings (5GHz)
    radio2Power: 'auto',
    radio2Channel: 'auto',
    radio2CoverageInterval: 60,
    radio2RecoveryInterval: 60,
    radio2PowerThreshold: -70,
    // Neighbor recovery
    dynamicSample: true,
    sampleRetries: 3,
    sampleThreshold: -80,
    // Interference recovery
    selectShutdown: false,
    selectShutdownHighTh: 70,
    selectShutdownLowTh: 30,
  });

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAll(() => apiService.getRFManagementProfiles());
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      type: 'SMARTRF',
      smartRfEnabled: true,
      smartMonitoring: true,
      ocsMonitoringAwareness: false,
      ocsMonitoringAwarenessThreshold: 50,
      radio1Power: 'auto',
      radio1Channel: 'auto',
      radio1CoverageInterval: 60,
      radio1RecoveryInterval: 60,
      radio1PowerThreshold: -70,
      radio2Power: 'auto',
      radio2Channel: 'auto',
      radio2CoverageInterval: 60,
      radio2RecoveryInterval: 60,
      radio2PowerThreshold: -70,
      dynamicSample: true,
      sampleRetries: 3,
      sampleThreshold: -80,
      selectShutdown: false,
      selectShutdownHighTh: 70,
      selectShutdownLowTh: 30,
    });
    setShowDialog(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    const smartRf = item.smartRf || {};
    const scanning = smartRf.scanning || {};
    const neighbor = smartRf.neighborRecovery || {};
    const interference = smartRf.interferenceRecovery || {};
    setForm({
      name: item.name || '',
      type: item.type || 'SMARTRF',
      smartRfEnabled: smartRf.enabled !== false,
      smartMonitoring: scanning.smartMonitoring !== false,
      ocsMonitoringAwareness: scanning.ocsMonitoringAwareness || false,
      ocsMonitoringAwarenessThreshold: scanning.ocsMonitoringAwarenessThreshold || 50,
      radio1Power: smartRf.radio1?.power || 'auto',
      radio1Channel: smartRf.radio1?.channel || 'auto',
      radio1CoverageInterval: smartRf.radio1?.coverageInterval || 60,
      radio1RecoveryInterval: smartRf.radio1?.recoveryInterval || 60,
      radio1PowerThreshold: neighbor.radio1?.powerThreshold || -70,
      radio2Power: smartRf.radio2?.power || 'auto',
      radio2Channel: smartRf.radio2?.channel || 'auto',
      radio2CoverageInterval: smartRf.radio2?.coverageInterval || 60,
      radio2RecoveryInterval: smartRf.radio2?.recoveryInterval || 60,
      radio2PowerThreshold: neighbor.radio2?.powerThreshold || -70,
      dynamicSample: neighbor.dynamicSample !== false,
      sampleRetries: neighbor.sampleRetries || 3,
      sampleThreshold: neighbor.sampleThreshold || -80,
      selectShutdown: interference.selectShutdown || false,
      selectShutdownHighTh: interference.selectShutdownHighTh || 70,
      selectShutdownLowTh: interference.selectShutdownLowTh || 30,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        smartRf: {
          enabled: form.smartRfEnabled,
          scanning: {
            smartMonitoring: form.smartMonitoring,
            ocsMonitoringAwareness: form.ocsMonitoringAwareness,
            ocsMonitoringAwarenessThreshold: form.ocsMonitoringAwarenessThreshold,
          },
          radio1: {
            power: form.radio1Power,
            channel: form.radio1Channel,
            coverageInterval: form.radio1CoverageInterval,
            recoveryInterval: form.radio1RecoveryInterval,
          },
          radio2: {
            power: form.radio2Power,
            channel: form.radio2Channel,
            coverageInterval: form.radio2CoverageInterval,
            recoveryInterval: form.radio2RecoveryInterval,
          },
          neighborRecovery: {
            dynamicSample: form.dynamicSample,
            sampleRetries: form.sampleRetries,
            sampleThreshold: form.sampleThreshold,
            radio1: { powerThreshold: form.radio1PowerThreshold },
            radio2: { powerThreshold: form.radio2PowerThreshold },
          },
          interferenceRecovery: {
            selectShutdown: form.selectShutdown,
            selectShutdownHighTh: form.selectShutdownHighTh,
            selectShutdownLowTh: form.selectShutdownLowTh,
          },
        },
      };
      if (editing) {
        await apiService.updateRFManagementProfile(editing.id, { ...editing, ...payload });
        toast.success('RF policy updated');
      } else {
        await apiService.createRFManagementProfile(payload);
        toast.success('RF policy created');
      }
      setShowDialog(false);
      load();
    } catch (err: any) {
      toast.error('Failed to save RF policy', { description: err.message });
    }
    setSaving(false);
  };

  const handleDelete = async (item: any) => {
    if (!confirm(`Delete RF policy "${item.name}"?`)) return;
    try {
      await apiService.deleteRFManagementProfile(item.id);
      toast.success('Deleted');
      load();
    } catch (err: any) {
      toast.error('Failed to delete', { description: err.message });
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">RF Management policies ({items.length})</p>
          <DevEpicBadge
            epicKey="NVO-7299"
            epicTitle="Wireless RRM Configuration"
            jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-7299"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          {isOrgScope ? (
            <Button size="sm" onClick={() => navigateToTemplateCreation('rfmgmt')}>
              <Layers className="h-4 w-4 mr-1" />
              Create Template
            </Button>
          ) : (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Create
            </Button>
          )}
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {isOrgScope && siteGroups.length > 1 && (
              <TableHead>
                <div className="flex items-center gap-1">
                  <Server className="h-3 w-3" />
                  <span>Site Group</span>
                </div>
              </TableHead>
            )}
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>SmartRF</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filterBySg(items).map((item) => (
            <TableRow key={item.id}>
              {isOrgScope && siteGroups.length > 1 && (
                <TableCell>
                  <Badge variant="outline" className="text-xs px-1.5 py-0 font-normal">
                    {item._siteGroupName || '—'}
                  </Badge>
                </TableCell>
              )}
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{item.type || 'SMARTRF'}</Badge>
              </TableCell>
              <TableCell>{item.smartRf?.enabled !== false ? 'Enabled' : 'Disabled'}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(item)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                No RF management policies found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Sheet open={showDialog} onOpenChange={setShowDialog}>
        <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit' : 'Create'} RF Management Policy</SheetTitle>
            <SheetDescription>SmartRF and ACS configuration</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Policy name"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SMARTRF">SmartRF</SelectItem>
                    <SelectItem value="ACS">ACS (Manual)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.type === 'SMARTRF' && (
              <>
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>SmartRF Enabled</Label>
                    <Switch
                      checked={form.smartRfEnabled}
                      onCheckedChange={(v) => setForm({ ...form, smartRfEnabled: v })}
                    />
                  </div>
                </div>

                <div
                  className="flex items-center justify-between cursor-pointer py-2 border-t"
                  onClick={() => setShowAdvancedRF(!showAdvanced)}
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    Advanced RF Settings
                  </span>
                  {showAdvanced ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                {showAdvanced && (
                  <>
                    <div className="border rounded-lg p-4 space-y-3">
                      <Label className="text-sm font-medium">SmartRF Scanning</Label>
                      <div className="flex items-center justify-between">
                        <Label>Smart Monitoring</Label>
                        <Switch
                          checked={form.smartMonitoring}
                          onCheckedChange={(v) => setForm({ ...form, smartMonitoring: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label>OCS Monitoring Awareness</Label>
                        <Switch
                          checked={form.ocsMonitoringAwareness}
                          onCheckedChange={(v) => setForm({ ...form, ocsMonitoringAwareness: v })}
                        />
                      </div>
                      {form.ocsMonitoringAwareness && (
                        <div>
                          <Label>OCS Threshold (%)</Label>
                          <Input
                            type="number"
                            value={form.ocsMonitoringAwarenessThreshold}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                ocsMonitoringAwarenessThreshold: parseInt(e.target.value) || 50,
                              })
                            }
                            min={0}
                            max={100}
                          />
                        </div>
                      )}
                    </div>

                    <div className="border rounded-lg p-4 space-y-3">
                      <Label className="text-sm font-medium">Radio 1 (2.4 GHz)</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Power</Label>
                          <Input
                            value={form.radio1Power}
                            onChange={(e) => setForm({ ...form, radio1Power: e.target.value })}
                            placeholder="auto or dBm value"
                          />
                        </div>
                        <div>
                          <Label>Channel</Label>
                          <Input
                            value={form.radio1Channel}
                            onChange={(e) => setForm({ ...form, radio1Channel: e.target.value })}
                            placeholder="auto or channel #"
                          />
                        </div>
                        <div>
                          <Label>Coverage Interval (s)</Label>
                          <Input
                            type="number"
                            value={form.radio1CoverageInterval}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                radio1CoverageInterval: parseInt(e.target.value) || 60,
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>Recovery Interval (s)</Label>
                          <Input
                            type="number"
                            value={form.radio1RecoveryInterval}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                radio1RecoveryInterval: parseInt(e.target.value) || 60,
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4 space-y-3">
                      <Label className="text-sm font-medium">Radio 2 (5 GHz)</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Power</Label>
                          <Input
                            value={form.radio2Power}
                            onChange={(e) => setForm({ ...form, radio2Power: e.target.value })}
                            placeholder="auto or dBm value"
                          />
                        </div>
                        <div>
                          <Label>Channel</Label>
                          <Input
                            value={form.radio2Channel}
                            onChange={(e) => setForm({ ...form, radio2Channel: e.target.value })}
                            placeholder="auto or channel #"
                          />
                        </div>
                        <div>
                          <Label>Coverage Interval (s)</Label>
                          <Input
                            type="number"
                            value={form.radio2CoverageInterval}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                radio2CoverageInterval: parseInt(e.target.value) || 60,
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>Recovery Interval (s)</Label>
                          <Input
                            type="number"
                            value={form.radio2RecoveryInterval}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                radio2RecoveryInterval: parseInt(e.target.value) || 60,
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4 space-y-3">
                      <Label className="text-sm font-medium">Neighbor Recovery</Label>
                      <div className="flex items-center justify-between">
                        <Label>Dynamic Sample</Label>
                        <Switch
                          checked={form.dynamicSample}
                          onCheckedChange={(v) => setForm({ ...form, dynamicSample: v })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Sample Retries</Label>
                          <Input
                            type="number"
                            value={form.sampleRetries}
                            onChange={(e) =>
                              setForm({ ...form, sampleRetries: parseInt(e.target.value) || 3 })
                            }
                          />
                        </div>
                        <div>
                          <Label>Sample Threshold (dBm)</Label>
                          <Input
                            type="number"
                            value={form.sampleThreshold}
                            onChange={(e) =>
                              setForm({ ...form, sampleThreshold: parseInt(e.target.value) || -80 })
                            }
                          />
                        </div>
                        <div>
                          <Label>R1 Power Threshold (dBm)</Label>
                          <Input
                            type="number"
                            value={form.radio1PowerThreshold}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                radio1PowerThreshold: parseInt(e.target.value) || -70,
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>R2 Power Threshold (dBm)</Label>
                          <Input
                            type="number"
                            value={form.radio2PowerThreshold}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                radio2PowerThreshold: parseInt(e.target.value) || -70,
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4 space-y-3">
                      <Label className="text-sm font-medium">Interference Recovery</Label>
                      <div className="flex items-center justify-between">
                        <Label>Selective Shutdown</Label>
                        <Switch
                          checked={form.selectShutdown}
                          onCheckedChange={(v) => setForm({ ...form, selectShutdown: v })}
                        />
                      </div>
                      {form.selectShutdown && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>High Threshold (%)</Label>
                            <Input
                              type="number"
                              value={form.selectShutdownHighTh}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  selectShutdownHighTh: parseInt(e.target.value) || 70,
                                })
                              }
                            />
                          </div>
                          <div>
                            <Label>Low Threshold (%)</Label>
                            <Input
                              type="number"
                              value={form.selectShutdownLowTh}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  selectShutdownLowTh: parseInt(e.target.value) || 30,
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ==================== ADSP (AIR DEFENSE) TAB ====================
function ADSPTab() {
  const { fetchAll, filterBySg, isOrgScope, siteGroups, navigateToTemplateCreation } =
    useMultiControllerFetch();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    servers: [{ address: '', port: 443 }] as { address: string; port: number }[],
  });

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAll(() => apiService.getADSPProfiles());
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', servers: [{ address: '', port: 443 }] });
    setShowDialog(true);
  };
  const openEdit = (item: any) => {
    setEditing(item);
    setForm({
      name: item.name || '',
      servers: item.servers || [{ address: item.svrAddr?.[0] || '', port: 443 }],
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        servers: form.servers.filter((s) => s.address.trim()),
      };
      if (editing) {
        await apiService.updateADSPProfile(editing.id, { ...editing, ...payload });
        toast.success('ADSP profile updated');
      } else {
        await apiService.createADSPProfile(payload);
        toast.success('ADSP profile created');
      }
      setShowDialog(false);
      load();
    } catch (err: any) {
      toast.error('Failed to save ADSP profile', { description: err.message });
    }
    setSaving(false);
  };

  const handleDelete = async (item: any) => {
    if (!confirm(`Delete ADSP profile "${item.name}"?`)) return;
    try {
      await apiService.deleteADSPProfile(item.id);
      toast.success('Deleted');
      load();
    } catch (err: any) {
      toast.error('Failed', { description: err.message });
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Air Defense (ADSP) profiles ({items.length})
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          {isOrgScope ? (
            <Button size="sm" onClick={() => navigateToTemplateCreation('adsp')}>
              <Layers className="h-4 w-4 mr-1" />
              Create Template
            </Button>
          ) : (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Create
            </Button>
          )}
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {isOrgScope && siteGroups.length > 1 && (
              <TableHead>
                <div className="flex items-center gap-1">
                  <Server className="h-3 w-3" />
                  <span>Site Group</span>
                </div>
              </TableHead>
            )}
            <TableHead>Name</TableHead>
            <TableHead>Servers</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filterBySg(items).map((item) => (
            <TableRow key={item.id}>
              {isOrgScope && siteGroups.length > 1 && (
                <TableCell>
                  <Badge variant="outline" className="text-xs px-1.5 py-0 font-normal">
                    {item._siteGroupName || '—'}
                  </Badge>
                </TableCell>
              )}
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell>{item.servers?.length || item.svrAddr?.length || 0}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(item)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                No ADSP profiles found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Sheet open={showDialog} onOpenChange={setShowDialog}>
        <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit' : 'Create'} ADSP Profile</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Servers</Label>
              {form.servers.map((server, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_auto] gap-2">
                  <Input
                    value={server.address}
                    onChange={(e) => {
                      const s = [...form.servers];
                      s[i] = { ...s[i], address: e.target.value };
                      setForm({ ...form, servers: s });
                    }}
                    placeholder="IP address"
                  />
                  <Input
                    type="number"
                    value={server.port}
                    onChange={(e) => {
                      const s = [...form.servers];
                      s[i] = { ...s[i], port: parseInt(e.target.value) || 443 };
                      setForm({ ...form, servers: s });
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm({ ...form, servers: form.servers.filter((_, idx) => idx !== i) })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm({ ...form, servers: [...form.servers, { address: '', port: 443 }] })
                }
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Server
              </Button>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ==================== MAIN COMPONENT ====================
export function ConfigureAdvanced() {
  const [activeTab, setActiveTab] = useState('topologies');
  const [counts, setCounts] = useState({
    topologies: 0,
    cos: 0,
    rateLimiters: 0,
    profiles: 0,
    iot: 0,
    meshpoints: 0,
    location: 0,
  });

  useEffect(() => {
    const loadCounts = async () => {
      const results = await Promise.allSettled([
        apiService.getTopologies(),
        apiService.getCoSProfiles(),
        apiService.getRateLimiters(),
        apiService.getProfiles(),
        apiService.getIoTProfiles(),
        apiService.getMeshPoints(),
        apiService.getXLocationProfiles(),
      ]);
      setCounts({
        topologies:
          results[0].status === 'fulfilled' && Array.isArray(results[0].value)
            ? results[0].value.length
            : 0,
        cos:
          results[1].status === 'fulfilled' && Array.isArray(results[1].value)
            ? results[1].value.length
            : 0,
        rateLimiters:
          results[2].status === 'fulfilled' && Array.isArray(results[2].value)
            ? results[2].value.length
            : 0,
        profiles:
          results[3].status === 'fulfilled' && Array.isArray(results[3].value)
            ? results[3].value.length
            : 0,
        iot:
          results[4].status === 'fulfilled' && Array.isArray(results[4].value)
            ? results[4].value.length
            : 0,
        meshpoints:
          results[5].status === 'fulfilled' && Array.isArray(results[5].value)
            ? results[5].value.length
            : 0,
        location:
          results[6].status === 'fulfilled' && Array.isArray(results[6].value)
            ? results[6].value.length
            : 0,
      });
    };
    loadCounts();
  }, []);

  const statCards = [
    { label: 'Topologies', count: counts.topologies, desc: 'VLAN definitions', icon: Network },
    { label: 'CoS Profiles', count: counts.cos, desc: 'Quality of service', icon: Gauge },
    { label: 'AP Profiles', count: counts.profiles, desc: 'Access point configs', icon: Layers },
    {
      label: 'Rate Limiters',
      count: counts.rateLimiters,
      desc: 'Traffic shaping rules',
      icon: Gauge,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl tracking-tight">Advanced Configuration</h2>
          <p className="text-muted-foreground">
            Topologies, QoS, AP Profiles, IoT, Mesh, Access Control, and Location Services
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">{card.label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl">{card.count}</div>
                <p className="text-xs text-muted-foreground">{card.desc}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="topologies">
            <Network className="mr-2 h-4 w-4" />
            Topologies
          </TabsTrigger>
          <TabsTrigger value="cos">
            <Gauge className="mr-2 h-4 w-4" />
            Class of Service
          </TabsTrigger>
          <TabsTrigger value="ratelimiters">
            <Gauge className="mr-2 h-4 w-4" />
            Rate Limiters
          </TabsTrigger>
          <TabsTrigger value="profiles">
            <Layers className="mr-2 h-4 w-4" />
            AP Profiles
          </TabsTrigger>
          <TabsTrigger value="iot">
            <Bluetooth className="mr-2 h-4 w-4" />
            IoT
          </TabsTrigger>
          <TabsTrigger value="meshpoints">
            <Cable className="mr-2 h-4 w-4" />
            Mesh
          </TabsTrigger>
          <TabsTrigger value="accesscontrol">
            <Shield className="mr-2 h-4 w-4" />
            Access Control
          </TabsTrigger>
          <TabsTrigger value="rfmgmt">
            <Radio className="mr-2 h-4 w-4" />
            RF Management
          </TabsTrigger>
          <TabsTrigger value="adsp">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Air Defense
          </TabsTrigger>
          <TabsTrigger value="location">
            <Globe className="mr-2 h-4 w-4" />
            Location
          </TabsTrigger>
        </TabsList>

        <TabsContent value="topologies">
          <TopologiesTab />
        </TabsContent>
        <TabsContent value="cos">
          <CoSTab />
        </TabsContent>
        <TabsContent value="ratelimiters">
          <RateLimitersTab />
        </TabsContent>
        <TabsContent value="profiles">
          <ProfilesTab />
        </TabsContent>
        <TabsContent value="iot">
          <IoTTab />
        </TabsContent>
        <TabsContent value="meshpoints">
          <MeshpointsTab />
        </TabsContent>
        <TabsContent value="accesscontrol">
          <AccessControlTab />
        </TabsContent>
        <TabsContent value="rfmgmt">
          <RFManagementTab />
        </TabsContent>
        <TabsContent value="adsp">
          <ADSPTab />
        </TabsContent>
        <TabsContent value="location">
          <LocationServicesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
