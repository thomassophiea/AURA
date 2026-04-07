import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { apiService, Role, ClassOfService, Topology } from '../services/api';
import { buildDefaultL2Filter, buildDefaultL3SrcDestFilter, type L2Filter, type L3SrcDestFilter } from '../utils/roleFilterValidation';
import { Settings, Shield, Network, Globe, Layers, Plus, Trash2, Lock, Unlock, RefreshCw, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

interface RoleEditDialogProps {
  role: Role | null; // null for creating new role
  isOpen: boolean;
  onClose: () => void;
  onSave: (roleData: Partial<Role>) => Promise<void>;
  isInline?: boolean; // If true, render inline without Dialog wrapper
}

export function RoleEditDialog({ role, isOpen, onClose, onSave, isInline = false }: RoleEditDialogProps) {
  const isEditing = !!role;
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');

  // Draggable state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reference data
  const [cosOptions, setCosOptions] = useState<ClassOfService[]>([]);
  const [topologyOptions, setTopologyOptions] = useState<Topology[]>([]);

  // Basic Information
  const [name, setName] = useState('');
  const [defaultAction, setDefaultAction] = useState<'allow' | 'deny'>('allow');
  const [topology, setTopology] = useState<string | null>(null);
  const [defaultCos, setDefaultCos] = useState<string | null>(null);

  // Captive Portal
  const [cpRedirect, setCpRedirect] = useState('');
  const [cpIdentity, setCpIdentity] = useState('');
  const [cpSharedKey, setCpSharedKey] = useState('');
  const [cpHttp, setCpHttp] = useState(false);
  const [cpUseFQDN, setCpUseFQDN] = useState(false);
  const [cpRedirectPorts, setCpRedirectPorts] = useState<number[]>([80, 443]);

  // Advanced Settings
  const [features, setFeatures] = useState<string[]>(['CENTRALIZED-SITE']);
  const [profiles, setProfiles] = useState<string[]>([]);

  // L3 Filters
  const [l3Filters, setL3Filters] = useState<any[]>([]); // TODO: type these when L3/L7 filter shapes are defined in types/
  const [l7Filters, setL7Filters] = useState<any[]>([]); // TODO: type these when L3/L7 filter shapes are defined in types/
  const [l2Filters, setL2Filters] = useState<L2Filter[]>([]);
  const [l3SrcDestFilters, setL3SrcDestFilters] = useState<L3SrcDestFilter[]>([]);
  const [bandwidthLimitEnabled, setBandwidthLimitEnabled] = useState(false);
  const [bandwidthLimitKbps, setBandwidthLimitKbps] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Reset position when opening
      setPosition({ x: 0, y: 0 });

      // Load reference data when dialog opens
      loadReferenceData();
      
      if (role) {
        // Populate form with existing role data
        setName(role.name || '');
        setDefaultAction(role.defaultAction === 'deny' ? 'deny' : 'allow');
        setTopology(role.topology);
        setDefaultCos(role.defaultCos);
        
        setCpRedirect(role.cpRedirect || '');
        setCpIdentity(role.cpIdentity || '');
        setCpSharedKey(role.cpSharedKey || '');
        setCpHttp(role.cpHttp || false);
        setCpUseFQDN(role.cpUseFQDN || false);
        setCpRedirectPorts(role.cpRedirectPorts || [80, 443]);
        
        setFeatures(role.features || ['CENTRALIZED-SITE']);
        setProfiles(role.profiles || []);
        setL3Filters(role.l3Filters || []);
        setL7Filters(role.l7Filters || []);
        setL2Filters(role.l2Filters || []);
        setL3SrcDestFilters(role.l3SrcDestFilters || []);
        setBandwidthLimitEnabled(!!role.bandwidthLimitEnabled);
        setBandwidthLimitKbps(String(role.bandwidthLimitKbps || ''));
      } else {
        // Reset form for new role
        resetForm();
      }
    }
  }, [role, isOpen]);

  const loadReferenceData = async () => {
    setIsLoading(true);
    try {
      // Load CoS and Topology options in parallel - these are optional features
      const [cos, topologies] = await Promise.all([
        apiService.getClassOfService().catch(err => {
          console.log('CoS data unavailable, using manual input:', err.message);
          return [];
        }),
        apiService.getTopologies().catch(err => {
          console.log('Topology data unavailable, using manual input:', err.message);
          return [];
        })
      ]);
      
      setCosOptions(cos);
      setTopologyOptions(topologies);
      
      if (cos.length > 0 || topologies.length > 0) {
        console.log(`✓ Loaded ${cos.length} CoS options and ${topologies.length} topologies`);
      } else {
        console.log('⚠️ Reference data unavailable - using manual ID entry for CoS and Topology');
      }
    } catch (error) {
      console.warn('Error loading reference data:', error);
      // Don't show error toast - these are optional features
      // User can still enter IDs manually
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDefaultAction('allow');
    setTopology(null);
    setDefaultCos(null);
    setCpRedirect('');
    setCpIdentity('');
    setCpSharedKey('');
    setCpHttp(false);
    setCpUseFQDN(false);
    setCpRedirectPorts([80, 443]);
    setFeatures(['CENTRALIZED-SITE']);
    setProfiles([]);
    setL3Filters([]);
    setL7Filters([]);
    setL2Filters([]);
    setL3SrcDestFilters([]);
    setBandwidthLimitEnabled(false);
    setBandwidthLimitKbps('');
    setActiveTab('basic');
  };

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      toast.error('Validation Error', {
        description: 'Role name is required'
      });
      return;
    }

    if (bandwidthLimitEnabled) {
      const kbps = parseInt(bandwidthLimitKbps);
      if (isNaN(kbps) || kbps <= 0) {
        toast.error('Bandwidth limit must be a positive number');
        return;
      }
    }

    // Build role data object
    const roleData: Partial<Role> = {
      name: name.trim(),
      defaultAction,
      topology,
      defaultCos,
      cpRedirect: cpRedirect.trim(),
      cpIdentity: cpIdentity.trim(),
      cpSharedKey: cpSharedKey.trim(),
      cpHttp,
      cpUseFQDN,
      cpRedirectPorts,
      features,
      profiles,
      l3Filters,
      l7Filters,
      l2Filters,
      l3SrcDestFilters,
      bandwidthLimitEnabled,
      bandwidthLimitKbps: bandwidthLimitEnabled ? parseInt(bandwidthLimitKbps) || 0 : undefined,
      cpTopologyId: role?.cpTopologyId || null,
      cpDefaultRedirectUrl: role?.cpDefaultRedirectUrl || '',
      cpRedirectUrlSelect: role?.cpRedirectUrlSelect || 'URLTARGET',
      cpAddIpAndPort: role?.cpAddIpAndPort ?? true,
      cpAddApNameAndSerial: role?.cpAddApNameAndSerial ?? true,
      cpAddBssid: role?.cpAddBssid ?? true,
      cpAddVnsName: role?.cpAddVnsName ?? true,
      cpAddSsid: role?.cpAddSsid ?? true,
      cpAddMac: role?.cpAddMac ?? true,
      cpAddRole: role?.cpAddRole ?? true,
      cpAddVlan: role?.cpAddVlan ?? true,
      cpAddTime: role?.cpAddTime ?? true,
      cpAddSign: role?.cpAddSign ?? true,
      cpOauthUseGoogle: role?.cpOauthUseGoogle || false,
      cpOauthUseFacebook: role?.cpOauthUseFacebook || false,
      cpOauthUseMicrosoft: role?.cpOauthUseMicrosoft || false,
    };

    // If editing, preserve the ID and flags
    if (role) {
      roleData.id = role.id;
      roleData.canEdit = role.canEdit;
      roleData.canDelete = role.canDelete;
      roleData.predefined = role.predefined;
    }

    setIsSaving(true);
    try {
      await onSave(roleData);
      resetForm();
      onClose();
    } catch (error) {
      console.error('Error saving role:', error);
      // Error toast is handled by parent component
    } finally {
      setIsSaving(false);
    }
  };

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-drag-handle]')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  const addL3Filter = () => {
    setL3Filters([...l3Filters, {
      name: '',
      intoNetwork: 'destAddr',
      outFromNetwork: 'sourceAddr',
      action: 'FILTERACTION_ALLOW',
      topologyId: null,
      cosId: null,
      subnetType: 'anyIpAddress',
      ipAddressRange: '0.0.0.0/0',
      port: 'any',
      portLow: 0,
      portHigh: 0,
      protocol: 'any',
      protocolNumber: 0,
      tosDscp: null,
      mask: null
    }]);
  };

  const removeL3Filter = (index: number) => {
    setL3Filters(l3Filters.filter((_, i) => i !== index));
  };

  const updateL3Filter = (index: number, field: string, value: any) => {
    const updated = [...l3Filters];
    updated[index] = { ...updated[index], [field]: value };
    setL3Filters(updated);
  };

  const addL7Filter = () => {
    setL7Filters([...l7Filters, {
      name: '',
      intoNetwork: 'destAddr',
      outFromNetwork: 'destAddr',
      action: 'FILTERACTION_DENY',
      topologyId: null,
      cosId: null,
      applicationId: 0,
      appGroupId: 0,
      appDisplayId: 0
    }]);
  };

  const removeL7Filter = (index: number) => {
    setL7Filters(l7Filters.filter((_, i) => i !== index));
  };

  const updateL7Filter = (index: number, field: string, value: any) => {
    const updated = [...l7Filters];
    updated[index] = { ...updated[index], [field]: value };
    setL7Filters(updated);
  };

  const updateL2Filter = (index: number, field: keyof L2Filter, value: string) => {
    setL2Filters(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
  };

  const updateL3SrcDestFilter = (index: number, field: keyof L3SrcDestFilter, value: string | null) => {
    setL3SrcDestFilters(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
  };

  // Render content (shared between dialog and inline modes)
  const renderContent = () => (
    <div className={isInline ? "space-y-4" : "flex-1 overflow-y-auto hide-scrollbar px-6 py-6"}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Basic
              </TabsTrigger>
              <TabsTrigger value="firewall" className="flex items-center gap-2">
                <Network className="h-4 w-4" />
                Firewall
              </TabsTrigger>
              <TabsTrigger value="captive-portal" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Captive Portal
              </TabsTrigger>
              <TabsTrigger value="advanced" className="flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Advanced
              </TabsTrigger>
            </TabsList>

            {/* Basic Information Tab */}
            <TabsContent value="basic" className="space-y-6 mt-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="role-name" className="text-base">
                    Role Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="role-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter role name"
                    disabled={role?.predefined}
                    className="max-w-md"
                  />
                  {role?.predefined && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      Predefined system roles cannot be renamed
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default-action" className="text-base">Default Access Control</Label>
                  <Select value={defaultAction} onValueChange={(value: 'allow' | 'deny') => setDefaultAction(value)}>
                    <SelectTrigger id="default-action" className="max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="allow">
                        <div className="flex items-center gap-2">
                          <Unlock className="h-4 w-4 text-success" />
                          <span>Allow - Permit all traffic by default</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="deny">
                        <div className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-destructive" />
                          <span>Deny - Block all traffic by default</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {defaultAction === 'allow' 
                      ? 'Traffic is allowed unless explicitly blocked by firewall rules'
                      : 'Traffic is blocked unless explicitly allowed by firewall rules'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="topology" className="text-base">VLAN / Topology</Label>
                  {topologyOptions.length > 0 ? (
                    <Select 
                      value={topology || 'default'} 
                      onValueChange={(value) => setTopology(value === 'default' ? null : value)}
                      disabled={isLoading}
                    >
                      <SelectTrigger id="topology" className="max-w-md">
                        <SelectValue placeholder={isLoading ? 'Loading topologies...' : 'Select VLAN/Topology'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">
                          <span className="text-muted-foreground">Use default network VLAN</span>
                        </SelectItem>
                        {topologyOptions.map((topo) => (
                          <SelectItem key={topo.id} value={topo.id}>
                            <div className="flex items-center gap-2">
                              <span>{topo.name}</span>
                              <Badge variant="outline" className="text-xs">
                                VLAN {topo.vlanid}
                              </Badge>
                              {topo.tagged && (
                                <Badge variant="secondary" className="text-xs">Tagged</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="topology"
                      value={topology || ''}
                      onChange={(e) => setTopology(e.target.value || null)}
                      placeholder="Enter Topology ID (leave blank for default)"
                      className="max-w-md"
                      disabled={isLoading}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {topologyOptions.length > 0 
                      ? 'Assign clients to a specific VLAN/network topology (optional)'
                      : 'Enter topology ID directly or leave blank for default VLAN'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default-cos" className="text-base">Default Class of Service (CoS)</Label>
                  {cosOptions.length > 0 ? (
                    <Select 
                      value={defaultCos || 'default'} 
                      onValueChange={(value) => setDefaultCos(value === 'default' ? null : value)}
                      disabled={isLoading}
                    >
                      <SelectTrigger id="default-cos" className="max-w-md">
                        <SelectValue placeholder={isLoading ? 'Loading CoS options...' : 'Select Class of Service'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">
                          <span className="text-muted-foreground">No CoS (default)</span>
                        </SelectItem>
                        {cosOptions.map((cos) => (
                          <SelectItem key={cos.id} value={cos.id}>
                            <div className="flex items-center gap-2">
                              <span>{cos.cosName}</span>
                              <Badge variant="outline" className="text-xs">
                                {cos.cosQos.priority !== 'notApplicable' ? cos.cosQos.priority : 'None'}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="default-cos"
                      value={defaultCos || ''}
                      onChange={(e) => setDefaultCos(e.target.value || null)}
                      placeholder="Enter CoS ID (leave blank for default)"
                      className="max-w-md"
                      disabled={isLoading}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {cosOptions.length > 0
                      ? 'Assign a Class of Service for QoS and bandwidth management (optional)'
                      : 'Enter CoS ID directly or leave blank for default (no CoS)'}
                  </p>
                </div>

                <div className="space-y-2 border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <Label>Bandwidth Limit</Label>
                    <Switch checked={bandwidthLimitEnabled} onCheckedChange={setBandwidthLimitEnabled} />
                  </div>
                  {bandwidthLimitEnabled && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={bandwidthLimitKbps}
                        onChange={e => setBandwidthLimitKbps(e.target.value)}
                        placeholder="e.g. 10000"
                        className="max-w-[160px]"
                      />
                      <span className="text-sm text-muted-foreground">Kbps</span>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Firewall Rules Tab */}
            <TabsContent value="firewall" className="space-y-4 mt-6">
              <Tabs defaultValue="l3" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="l2">L2 (MAC)</TabsTrigger>
                  <TabsTrigger value="l3">L3/L4</TabsTrigger>
                  <TabsTrigger value="l3srcdst">L3/L4 Src/Dst</TabsTrigger>
                  <TabsTrigger value="l7">L7 (App)</TabsTrigger>
                </TabsList>

                {/* L2 MAC Filters Sub-tab */}
                <TabsContent value="l2" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">Layer 2 MAC Filters</h3>
                        <p className="text-sm text-muted-foreground">
                          Define MAC address-based firewall rules
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setL2Filters([...l2Filters, buildDefaultL2Filter()])}
                        className="flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        Add L2 Filter
                      </Button>
                    </div>

                    {l2Filters.length === 0 ? (
                      <Card className="p-6 text-center text-muted-foreground">
                        No Layer 2 filters configured. Click "Add L2 Filter" to create one.
                      </Card>
                    ) : (
                      <div className="space-y-3">
                        {l2Filters.map((filter, index) => (
                          <Card key={index} className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label className="text-sm">MAC Filter #{index + 1}</Label>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setL2Filters(l2Filters.filter((_, i) => i !== index))}
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                  <Label className="text-xs">Rule Name</Label>
                                  <Input
                                    value={filter.name}
                                    onChange={(e) => updateL2Filter(index, 'name', e.target.value)}
                                    placeholder="e.g., Block Device"
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Action</Label>
                                  <Select
                                    value={filter.action}
                                    onValueChange={(value) => updateL2Filter(index, 'action', value)}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="FILTERACTION_ALLOW">Allow</SelectItem>
                                      <SelectItem value="FILTERACTION_DENY">Deny</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">MAC Address</Label>
                                  <Input
                                    value={filter.macAddress}
                                    onChange={(e) => updateL2Filter(index, 'macAddress', e.target.value)}
                                    placeholder="e.g., 00:1A:2B:3C:4D:5E"
                                    className="mt-1"
                                  />
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* L3/L4 Filters Sub-tab (existing content) */}
                <TabsContent value="l3" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">Layer 3 IP Filters</h3>
                        <p className="text-sm text-muted-foreground">
                          Define IP-based firewall rules for specific ports and protocols
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addL3Filter}
                        className="flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        Add L3 Filter
                      </Button>
                    </div>

                    {l3Filters.length === 0 ? (
                      <Card className="p-6 text-center text-muted-foreground">
                        No Layer 3 filters configured. Click "Add L3 Filter" to create one.
                      </Card>
                    ) : (
                      <div className="space-y-3">
                        {l3Filters.map((filter, index) => (
                          <Card key={index} className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label className="text-sm">Filter #{index + 1}</Label>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeL3Filter(index)}
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                  <Label className="text-xs">Rule Name</Label>
                                  <Input
                                    value={filter.name}
                                    onChange={(e) => updateL3Filter(index, 'name', e.target.value)}
                                    placeholder="e.g., Allow DNS"
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Action</Label>
                                  <Select
                                    value={filter.action}
                                    onValueChange={(value) => updateL3Filter(index, 'action', value)}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="FILTERACTION_ALLOW">Allow</SelectItem>
                                      <SelectItem value="FILTERACTION_DENY">Deny</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Protocol</Label>
                                  <Select
                                    value={filter.protocol}
                                    onValueChange={(value) => updateL3Filter(index, 'protocol', value)}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="any">Any</SelectItem>
                                      <SelectItem value="tcp">TCP</SelectItem>
                                      <SelectItem value="udp">UDP</SelectItem>
                                      <SelectItem value="icmp">ICMP</SelectItem>
                                      <SelectItem value="gre">GRE</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Port</Label>
                                  <Input
                                    value={filter.port}
                                    onChange={(e) => updateL3Filter(index, 'port', e.target.value)}
                                    placeholder="e.g., dns, http, 80"
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">IP Address Range</Label>
                                  <Input
                                    value={filter.ipAddressRange}
                                    onChange={(e) => updateL3Filter(index, 'ipAddressRange', e.target.value)}
                                    placeholder="0.0.0.0/0"
                                    className="mt-1"
                                  />
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* L3/L4 Src/Dst Filters Sub-tab */}
                <TabsContent value="l3srcdst" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">L3/L4 Source/Destination Filters</h3>
                        <p className="text-sm text-muted-foreground">
                          Define rules based on source and destination IP addresses and ports
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setL3SrcDestFilters([...l3SrcDestFilters, buildDefaultL3SrcDestFilter()])}
                        className="flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        Add Src/Dst Filter
                      </Button>
                    </div>

                    {l3SrcDestFilters.length === 0 ? (
                      <Card className="p-6 text-center text-muted-foreground">
                        No source/destination filters configured. Click "Add Src/Dst Filter" to create one.
                      </Card>
                    ) : (
                      <div className="space-y-3">
                        {l3SrcDestFilters.map((filter, index) => (
                          <Card key={index} className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label className="text-sm">Src/Dst Filter #{index + 1}</Label>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setL3SrcDestFilters(l3SrcDestFilters.filter((_, i) => i !== index))}
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                  <Label className="text-xs">Rule Name</Label>
                                  <Input
                                    value={filter.name}
                                    onChange={(e) => updateL3SrcDestFilter(index, 'name', e.target.value)}
                                    placeholder="e.g., Block External"
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Action</Label>
                                  <Select
                                    value={filter.action}
                                    onValueChange={(value) => updateL3SrcDestFilter(index, 'action', value)}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="FILTERACTION_ALLOW">Allow</SelectItem>
                                      <SelectItem value="FILTERACTION_DENY">Deny</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Protocol</Label>
                                  <Select
                                    value={filter.protocol}
                                    onValueChange={(value) => updateL3SrcDestFilter(index, 'protocol', value)}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="any">Any</SelectItem>
                                      <SelectItem value="tcp">TCP</SelectItem>
                                      <SelectItem value="udp">UDP</SelectItem>
                                      <SelectItem value="icmp">ICMP</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Source IP</Label>
                                  <Input
                                    value={filter.srcIp}
                                    onChange={(e) => updateL3SrcDestFilter(index, 'srcIp', e.target.value)}
                                    placeholder="e.g., 192.168.1.0/24"
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Source Port</Label>
                                  <Input
                                    value={filter.srcPort}
                                    onChange={(e) => updateL3SrcDestFilter(index, 'srcPort', e.target.value)}
                                    placeholder="any"
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Destination IP</Label>
                                  <Input
                                    value={filter.dstIp}
                                    onChange={(e) => updateL3SrcDestFilter(index, 'dstIp', e.target.value)}
                                    placeholder="e.g., 10.0.0.0/8"
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Destination Port</Label>
                                  <Input
                                    value={filter.dstPort}
                                    onChange={(e) => updateL3SrcDestFilter(index, 'dstPort', e.target.value)}
                                    placeholder="any"
                                    className="mt-1"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">CoS ID (optional)</Label>
                                  <Input
                                    value={filter.cosId ?? ''}
                                    onChange={e => updateL3SrcDestFilter(index, 'cosId', e.target.value || null)}
                                    placeholder="CoS policy ID"
                                  />
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* L7 App Filters Sub-tab (existing content) */}
                <TabsContent value="l7" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">Layer 7 Application Filters</h3>
                        <p className="text-sm text-muted-foreground">
                          Control access to specific applications and application groups
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addL7Filter}
                        className="flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        Add L7 Filter
                      </Button>
                    </div>

                    {l7Filters.length === 0 ? (
                      <Card className="p-6 text-center text-muted-foreground">
                        No Layer 7 filters configured. Click "Add L7 Filter" to create one.
                      </Card>
                    ) : (
                      <div className="space-y-3">
                        {l7Filters.map((filter, index) => (
                          <Card key={index} className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label className="text-sm">Application Filter #{index + 1}</Label>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeL7Filter(index)}
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                  <Label className="text-xs">Rule Name</Label>
                                  <Input
                                    value={filter.name}
                                    onChange={(e) => updateL7Filter(index, 'name', e.target.value)}
                                    placeholder="e.g., Deny Peer to Peer"
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Action</Label>
                                  <Select
                                    value={filter.action}
                                    onValueChange={(value) => updateL7Filter(index, 'action', value)}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="FILTERACTION_ALLOW">Allow</SelectItem>
                                      <SelectItem value="FILTERACTION_DENY">Deny</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">App Group ID</Label>
                                  <Input
                                    type="number"
                                    value={filter.appGroupId}
                                    onChange={(e) => updateL7Filter(index, 'appGroupId', parseInt(e.target.value) || 0)}
                                    placeholder="e.g., 7, 12, 22"
                                    className="mt-1"
                                  />
                                  <p className="text-xs text-muted-foreground mt-1">
                                    7=P2P, 12=VPN, 22=Restricted
                                  </p>
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Captive Portal Tab */}
            <TabsContent value="captive-portal" className="space-y-6 mt-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-1">Captive Portal Configuration</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure captive portal redirect and authentication settings
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cp-redirect">Redirect URL</Label>
                  <Input
                    id="cp-redirect"
                    value={cpRedirect}
                    onChange={(e) => setCpRedirect(e.target.value)}
                    placeholder="https://portal.example.com/login"
                  />
                  <p className="text-xs text-muted-foreground">
                    URL to redirect users for captive portal authentication
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cp-identity">Identity</Label>
                    <Input
                      id="cp-identity"
                      value={cpIdentity}
                      onChange={(e) => setCpIdentity(e.target.value)}
                      placeholder="Portal identity"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cp-shared-key">Shared Secret Key</Label>
                    <Input
                      id="cp-shared-key"
                      type="password"
                      value={cpSharedKey}
                      onChange={(e) => setCpSharedKey(e.target.value)}
                      placeholder="Shared secret for validation"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div>
                      <Label htmlFor="cp-http">Enable HTTP Redirect</Label>
                      <p className="text-xs text-muted-foreground">
                        Redirect HTTP traffic to captive portal
                      </p>
                    </div>
                    <Switch
                      id="cp-http"
                      checked={cpHttp}
                      onCheckedChange={setCpHttp}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div>
                      <Label htmlFor="cp-fqdn">Use Fully Qualified Domain Name</Label>
                      <p className="text-xs text-muted-foreground">
                        Use FQDN instead of IP address
                      </p>
                    </div>
                    <Switch
                      id="cp-fqdn"
                      checked={cpUseFQDN}
                      onCheckedChange={setCpUseFQDN}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Redirect Ports</Label>
                  <div className="flex gap-2">
                    {cpRedirectPorts.map((port, index) => (
                      <Badge key={index} variant="secondary">
                        {port}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Common ports: 80 (HTTP), 443 (HTTPS)
                  </p>
                </div>

                <div className="space-y-3 pt-2 border-t">
                  <Label className="text-sm font-medium">Social Login (OAuth)</Label>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <Label>Google Login</Label>
                    <Switch
                      checked={role?.cpOauthUseGoogle || false}
                      disabled={!role}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <Label>Facebook Login</Label>
                    <Switch
                      checked={role?.cpOauthUseFacebook || false}
                      disabled={!role}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <Label>Microsoft Login</Label>
                    <Switch
                      checked={role?.cpOauthUseMicrosoft || false}
                      disabled={!role}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Advanced Tab */}
            <TabsContent value="advanced" className="space-y-6 mt-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-1">Advanced Configuration</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure features and profile associations
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Features</Label>
                  <div className="flex flex-wrap gap-2">
                    {features.map((feature, index) => (
                      <Badge key={index} variant="outline">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Default: CENTRALIZED-SITE
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Associated Profiles</Label>
                  <Textarea
                    value={profiles.join('\n')}
                    onChange={(e) => setProfiles(e.target.value.split('\n').filter(p => p.trim()))}
                    placeholder="Enter profile IDs (one per line)"
                    rows={6}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {profiles.length} profile(s) associated with this role
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
    </div>
  );

  // Render footer buttons (shared between dialog and inline modes)
  const renderFooter = () => (
    <div className={isInline ? "flex justify-end space-x-2 pt-4 border-t" : "flex justify-end space-x-2"}>
      <Button
        variant="outline"
        onClick={handleCancel}
        disabled={isSaving}
      >
        Cancel
      </Button>
      <Button
        onClick={handleSave}
        disabled={isSaving || !name.trim()}
        className="flex items-center gap-2"
      >
        {isSaving ? (
          <>
            <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Shield className="h-4 w-4" />
            {isEditing ? 'Save Changes' : 'Create Role'}
          </>
        )}
      </Button>
    </div>
  );

  // Render header (for inline mode)
  const renderHeader = () => (
    <div className="space-y-2 pb-4">
      <div className="flex items-center gap-3">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">
          {isEditing ? `Edit Role: ${role?.name}` : 'Create New Role'}
        </h3>
        {isLoading && (
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {isEditing
          ? 'Modify network policy role configuration and access rules'
          : 'Create a new network policy role with custom access rules and settings'}
      </p>
    </div>
  );

  // Return inline or dialog mode
  if (isInline) {
    if (!isOpen) return null;

    return (
      <div className="space-y-6 p-6 border-t bg-muted/30">
        {renderHeader()}
        {renderContent()}
        {renderFooter()}
      </div>
    );
  }

  // Dialog mode (original behavior)
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent
        ref={dialogRef}
        className="max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col overflow-hidden pointer-events-auto resize"
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
          cursor: isDragging ? 'grabbing' : 'auto',
          minWidth: '800px',
          minHeight: '600px',
          maxHeight: '90vh'
        }}
        onMouseDown={handleMouseDown}
      >
        <DialogHeader className="px-6 py-4 border-b" data-drag-handle style={{ cursor: 'grab' }}>
          <DialogTitle className="flex items-center gap-3">
            <GripVertical className="h-5 w-5 text-muted-foreground" />
            <Shield className="h-5 w-5 text-primary" />
            {isEditing ? `Edit Role: ${role?.name}` : 'Create New Role'}
            {isLoading && (
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Modify network policy role configuration and access rules (drag to move)'
              : 'Create a new network policy role with custom access rules and settings (drag to move)'}
          </DialogDescription>
        </DialogHeader>

        {renderContent()}

        <DialogFooter className="px-6 py-4 border-t mt-auto">
          {renderFooter()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
