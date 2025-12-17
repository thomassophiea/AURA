import { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle, AlertCircle, Wifi, MapPin, Users, GripVertical, Settings, Info, ChevronDown, ChevronUp, Folder, FolderOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Skeleton } from './ui/skeleton';
import { toast } from 'sonner';
import { apiService } from '../services/api';
import { WLANAssignmentService } from '../services/wlanAssignment';
import { effectiveSetCalculator } from '../services/effectiveSetCalculator';
import { DeploymentModeSelector } from './wlans/DeploymentModeSelector';
import { ProfilePicker } from './wlans/ProfilePicker';
import { EffectiveSetPreview } from './wlans/EffectiveSetPreview';
import { SiteGroupManagementDialog } from './SiteGroupManagementDialog';
import type {
  Site,
  SiteGroup,
  Profile,
  AutoAssignmentResponse,
  WLANFormData,
  DeploymentMode,
  EffectiveProfileSet
} from '../types/network';

interface CreateWLANDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (result: AutoAssignmentResponse) => void;
}

interface SiteDeploymentConfig {
  siteId: string;
  siteName: string;
  deploymentMode: DeploymentMode;
  includedProfiles: string[];
  excludedProfiles: string[];
  profiles: Profile[];
}

export function CreateWLANDialog({ open, onOpenChange, onSuccess }: CreateWLANDialogProps) {
  // Form state
  const [formData, setFormData] = useState<WLANFormData>({
    serviceName: '',
    ssid: '',
    security: 'wpa2-psk',
    passphrase: '',
    vlan: 1,
    band: 'dual',
    enabled: true,
    selectedSites: [],
    selectedSiteGroups: [],
    authenticatedUserDefaultRoleID: null,
    // Advanced options defaults
    hidden: false,
    maxClients: undefined,
    description: ''
  });

  // Sites data
  const [sites, setSites] = useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);

  // Site groups
  const [siteGroups, setSiteGroups] = useState<SiteGroup[]>([]);
  const [siteGroupDialogOpen, setSiteGroupDialogOpen] = useState(false);

  // Roles
  const [roles, setRoles] = useState<any[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);

  // Site deployment configurations
  const [siteConfigs, setSiteConfigs] = useState<Map<string, SiteDeploymentConfig>>(new Map());

  // Profile data per site
  const [profilesBySite, setProfilesBySite] = useState<Map<string, Profile[]>>(new Map());
  const [discoveringProfiles, setDiscoveringProfiles] = useState(false);

  // Profile picker state
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);
  const [profilePickerSite, setProfilePickerSite] = useState<{ siteId: string; siteName: string; mode: 'INCLUDE_ONLY' | 'EXCLUDE_SOME' } | null>(null);

  // Effective sets for preview
  const [effectiveSets, setEffectiveSets] = useState<EffectiveProfileSet[]>([]);

  // Submission state
  const [submitting, setSubmitting] = useState(false);

  // Draggable state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const dialogRef = useRef<HTMLDivElement>(null);

  // Advanced options state
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load site groups from localStorage
  useEffect(() => {
    const savedGroups = localStorage.getItem('siteGroups');
    if (savedGroups) {
      try {
        setSiteGroups(JSON.parse(savedGroups));
      } catch (error) {
        console.error('Failed to load site groups:', error);
      }
    }
  }, []);

  // Load sites and roles when dialog opens
  useEffect(() => {
    if (open) {
      loadSites();
      loadRoles();
      // Reset form and position
      setFormData({
        serviceName: '',
        ssid: '',
        security: 'wpa2-psk',
        passphrase: '',
        vlan: null,
        band: 'dual',
        enabled: true,
        selectedSites: [],
        selectedSiteGroups: [],
        authenticatedUserDefaultRoleID: null // Will be set to 'bridged' after roles load
      });
      setSiteConfigs(new Map());
      setProfilesBySite(new Map());
      setEffectiveSets([]);
      setPosition({ x: 0, y: 0 }); // Reset position when opening
    }
  }, [open]);

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

  // Discover profiles when sites or site groups change
  useEffect(() => {
    const expandedSites = getExpandedSiteIds();
    if (expandedSites.length > 0) {
      discoverProfiles(expandedSites);
    } else {
      setProfilesBySite(new Map());
      setEffectiveSets([]);
    }
  }, [formData.selectedSites, formData.selectedSiteGroups]);

  // Recalculate effective sets when site configs change
  useEffect(() => {
    if (siteConfigs.size > 0) {
      calculateEffectiveSets();
    }
  }, [siteConfigs, profilesBySite]);

  const loadSites = async () => {
    setLoadingSites(true);
    try {
      const data = await apiService.getSites();
      setSites(data);
    } catch (error) {
      console.error('Failed to load sites:', error);
      toast.error('Failed to load sites');
    } finally {
      setLoadingSites(false);
    }
  };

  const loadRoles = async () => {
    setLoadingRoles(true);
    try {
      const data = await apiService.getRoles();
      setRoles(data);

      // Auto-select "bridged" role if it exists
      const bridgedRole = data.find(r =>
        r.name?.toLowerCase() === 'bridged'
      );

      if (bridgedRole) {
        setFormData(prev => ({ ...prev, authenticatedUserDefaultRoleID: bridgedRole.id }));
        console.log('[CreateWLAN] Auto-selected "bridged" role:', bridgedRole.id);
      }
    } catch (error) {
      console.error('Failed to load roles:', error);
      // Don't show error toast - roles are optional
    } finally {
      setLoadingRoles(false);
    }
  };

  const discoverProfiles = async (siteIds?: string[]) => {
    const sitesToDiscover = siteIds || formData.selectedSites;
    console.log('=== PROFILE DISCOVERY START ===');
    console.log('Selected sites to discover:', sitesToDiscover);

    if (sitesToDiscover.length === 0) {
      console.warn('⚠️ No sites to discover profiles for');
      return;
    }

    setDiscoveringProfiles(true);
    try {
      const assignmentService = new WLANAssignmentService();
      console.log('Calling discoverProfilesForSites...');
      const profileMap = await assignmentService.discoverProfilesForSites(sitesToDiscover);
      console.log('Profile Map Received:', profileMap);

      const newProfilesBySite = new Map<string, Profile[]>();
      const newSiteConfigs = new Map(siteConfigs);
      let totalProfilesFound = 0;

      for (const siteId of sitesToDiscover) {
        const profiles = profileMap[siteId] || [];
        totalProfilesFound += profiles.length;
        console.log(`Site ${siteId}: Found ${profiles.length} profiles`, profiles);

        if (profiles.length === 0) {
          console.warn(`⚠️ No profiles found for site ${siteId}. This site may not have device groups or profiles configured.`);
        }

        newProfilesBySite.set(siteId, profiles);

        // Initialize site config if not exists (default to ALL_PROFILES_AT_SITE)
        if (!newSiteConfigs.has(siteId)) {
          const site = sites.find(s => s.id === siteId);
          const config = {
            siteId,
            siteName: site?.name || site?.siteName || siteId,
            deploymentMode: 'ALL_PROFILES_AT_SITE' as const,
            includedProfiles: [],
            excludedProfiles: [],
            profiles
          };
          console.log(`Creating new site config for ${siteId}:`, config);
          newSiteConfigs.set(siteId, config);
        } else {
          // Update profiles for existing config
          const config = newSiteConfigs.get(siteId)!;
          newSiteConfigs.set(siteId, { ...config, profiles });
          console.log(`Updated existing site config for ${siteId}:`, { ...config, profiles });
        }
      }

      setProfilesBySite(newProfilesBySite);
      setSiteConfigs(newSiteConfigs);

      if (totalProfilesFound === 0) {
        console.error(`❌ No profiles found across ${sitesToDiscover.length} site(s)`);
        toast.warning('No Profiles Found', {
          description: `No profiles were discovered at the selected site(s). Please ensure the site(s) have device groups with profiles configured.`
        });
      } else {
        console.log(`✅ Discovered ${totalProfilesFound} total profiles across ${sitesToDiscover.length} sites`);
      }

      console.log('Final site configs:', Array.from(newSiteConfigs.entries()));
      console.log('=== PROFILE DISCOVERY END ===');
    } catch (error) {
      console.error('❌ Failed to discover profiles:', error);
      console.error('Error details:', error);
      toast.error('Failed to discover profiles', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setDiscoveringProfiles(false);
    }
  };

  const calculateEffectiveSets = () => {
    const sets: EffectiveProfileSet[] = [];

    for (const config of siteConfigs.values()) {
      const effectiveSet = effectiveSetCalculator.calculateEffectiveSet(
        config,
        config.profiles
      );
      sets.push(effectiveSet);
    }

    setEffectiveSets(sets);
  };

  // Get all sites from selected site groups
  const getExpandedSiteIds = (): string[] => {
    const groupSites = formData.selectedSiteGroups.flatMap(groupId => {
      const group = siteGroups.find(g => g.id === groupId);
      return group?.siteIds || [];
    });
    return [...new Set([...formData.selectedSites, ...groupSites])];
  };

  // Save site groups to localStorage
  const handleSaveSiteGroups = (groups: SiteGroup[]) => {
    setSiteGroups(groups);
    localStorage.setItem('siteGroups', JSON.stringify(groups));
  };

  const toggleSite = (siteId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedSites: prev.selectedSites.includes(siteId)
        ? prev.selectedSites.filter(id => id !== siteId)
        : [...prev.selectedSites, siteId]
    }));

    // Remove site config if unselecting
    if (formData.selectedSites.includes(siteId)) {
      const newConfigs = new Map(siteConfigs);
      newConfigs.delete(siteId);
      setSiteConfigs(newConfigs);
    }
  };

  const toggleSiteGroup = (groupId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedSiteGroups: prev.selectedSiteGroups.includes(groupId)
        ? prev.selectedSiteGroups.filter(id => id !== groupId)
        : [...prev.selectedSiteGroups, groupId]
    }));
  };

  const handleModeChange = (siteId: string, mode: DeploymentMode) => {
    const config = siteConfigs.get(siteId);
    if (!config) return;

    const newConfigs = new Map(siteConfigs);
    newConfigs.set(siteId, {
      ...config,
      deploymentMode: mode,
      includedProfiles: mode === 'INCLUDE_ONLY' ? config.includedProfiles : [],
      excludedProfiles: mode === 'EXCLUDE_SOME' ? config.excludedProfiles : []
    });
    setSiteConfigs(newConfigs);
  };

  const openProfilePicker = (siteId: string, mode: 'INCLUDE_ONLY' | 'EXCLUDE_SOME') => {
    const config = siteConfigs.get(siteId);
    if (!config) return;

    setProfilePickerSite({ siteId, siteName: config.siteName, mode });
    setProfilePickerOpen(true);
  };

  const handleProfileSelection = (selectedIds: string[]) => {
    if (!profilePickerSite) return;

    const config = siteConfigs.get(profilePickerSite.siteId);
    if (!config) return;

    const newConfigs = new Map(siteConfigs);
    if (profilePickerSite.mode === 'INCLUDE_ONLY') {
      newConfigs.set(profilePickerSite.siteId, {
        ...config,
        includedProfiles: selectedIds,
        excludedProfiles: []
      });
    } else {
      newConfigs.set(profilePickerSite.siteId, {
        ...config,
        includedProfiles: [],
        excludedProfiles: selectedIds
      });
    }

    setSiteConfigs(newConfigs);
  };

  // Check if form has all required fields filled
  const isFormValid = () => {
    if (!formData.serviceName?.trim()) return false;
    if (!formData.ssid?.trim()) return false;
    if (!formData.security) return false;
    if (!formData.band) return false;
    if (formData.security !== 'open' && !formData.passphrase?.trim()) return false;
    // At least one site or site group must be selected
    const expandedSites = getExpandedSiteIds();
    if (expandedSites.length === 0) return false;
    return true;
  };

  const handleSubmit = async () => {
    console.log('=== WLAN CREATION DEBUG START ===');
    console.log('1. Form Data:', formData);
    console.log('2. Selected Sites:', formData.selectedSites);
    console.log('3. Site Configs:', Array.from(siteConfigs.entries()));
    console.log('4. Profiles By Site:', Array.from(profilesBySite.entries()));
    console.log('5. Effective Sets:', effectiveSets);

    // Comprehensive validation - check all required fields
    const errors: string[] = [];

    if (!formData.serviceName?.trim()) {
      errors.push('Service Name is required');
    }

    if (!formData.ssid?.trim()) {
      errors.push('SSID is required');
    }

    if (!formData.security) {
      errors.push('Security type is required');
    }

    if (!formData.band) {
      errors.push('Band is required');
    }

    if (formData.security !== 'open' && !formData.passphrase?.trim()) {
      errors.push('Passphrase is required for secured networks');
    }

    const expandedSites = getExpandedSiteIds();
    if (expandedSites.length === 0) {
      errors.push('At least one site or site group must be selected');
    }

    // If there are validation errors, show them all
    if (errors.length > 0) {
      toast.error('Please fix the following errors:', {
        description: errors.join('\n• '),
        duration: 5000,
      });
      return;
    }

    console.log('6. Validation passed, site configs count:', siteConfigs.size);

    // Ensure site configs exist for all selected sites
    if (siteConfigs.size === 0) {
      toast.error('No site configurations found', {
        description: 'Please wait for profile discovery to complete before creating the WLAN'
      });
      return;
    }

    // Validate site configurations
    for (const config of siteConfigs.values()) {
      console.log('7. Validating config for site:', config.siteName, config);

      // Check if profiles were discovered
      if (!config.profiles || config.profiles.length === 0) {
        toast.error(`No profiles found at site "${config.siteName}"`, {
          description: 'Cannot deploy WLAN to a site with no profiles. Please check if this site has device groups with profiles configured.'
        });
        return;
      }

      const validation = effectiveSetCalculator.validateSiteAssignment(config);
      console.log('8. Validation result:', validation);
      if (!validation.valid) {
        toast.error(`Invalid configuration for ${config.siteName}`, {
          description: validation.errors.join(', ')
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      const assignmentService = new WLANAssignmentService();
      const expandedSites = getExpandedSiteIds();

      // Prepare site assignments
      const siteAssignments = Array.from(siteConfigs.values()).map(config => ({
        siteId: config.siteId,
        siteName: config.siteName,
        deploymentMode: config.deploymentMode,
        includedProfiles: config.includedProfiles,
        excludedProfiles: config.excludedProfiles
      }));

      console.log('9. Site Assignments Prepared:', siteAssignments);
      console.log('10. Expanded Sites (from groups + individual):', expandedSites);
      console.log('11. Calling createWLANWithSiteCentricDeployment...');

      // Use new site-centric deployment method
      const result = await assignmentService.createWLANWithSiteCentricDeployment(
        {
          name: formData.serviceName,
          serviceName: formData.serviceName,
          ssid: formData.ssid,
          security: formData.security,
          passphrase: formData.passphrase || undefined,
          vlan: formData.vlan || undefined,
          band: formData.band,
          enabled: formData.enabled,
          sites: expandedSites, // Use expanded site IDs (includes both individual sites and sites from groups)
          authenticatedUserDefaultRoleID: formData.authenticatedUserDefaultRoleID || undefined,
          // Advanced options
          hidden: formData.hidden || undefined,
          maxClients: formData.maxClients || undefined,
          description: formData.description || undefined
        },
        siteAssignments
      );

      console.log('11. WLAN Creation Result:', result);
      console.log('=== WLAN CREATION DEBUG END ===');

      toast.success('WLAN Created Successfully', {
        description: `Assigned to ${result.profilesAssigned} profile(s) across ${result.sitesProcessed} site(s)`
      });

      onSuccess(result);
      onOpenChange(false);

    } catch (error) {
      console.error('!!! WLAN Creation Failed:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        error
      });
      toast.error('Failed to create WLAN', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Use the comprehensive validation function
  const isValid = isFormValid();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          ref={dialogRef}
          className="max-w-7xl w-[95vw] h-[90vh] p-0 flex flex-col overflow-hidden pointer-events-auto resize"
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
            cursor: isDragging ? 'grabbing' : 'auto',
            minWidth: '800px',
            minHeight: '500px',
            maxHeight: '90vh'
          }}
          onMouseDown={handleMouseDown}
        >
          <DialogHeader className="px-6 py-4 border-b" data-drag-handle style={{ cursor: 'grab' }}>
            <DialogTitle className="flex items-center gap-2">
              <GripVertical className="h-5 w-5 text-muted-foreground" />
              <Wifi className="h-5 w-5" />
              Create Wireless Network
            </DialogTitle>
            <DialogDescription>
              Configure a new WLAN with site-centric deployment (drag to move)
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto hide-scrollbar px-6 py-6 space-y-6">
            {/* WLAN Configuration Section */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Network Configuration</CardTitle>
                <CardDescription className="text-xs">
                  Basic WLAN settings • <span className="text-red-500 font-medium">* Required fields</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Service Name */}
                <div className="space-y-2">
                  <Label htmlFor="serviceName">
                    Service Name {!formData.serviceName?.trim() && <span className="text-red-500">*</span>}
                  </Label>
                  <Input
                    id="serviceName"
                    value={formData.serviceName || ''}
                    onChange={(e) => setFormData({ ...formData, serviceName: e.target.value })}
                    placeholder="Service identifier (required)"
                    className={!formData.serviceName?.trim() ? 'border-red-300 focus-visible:border-red-500' : ''}
                  />
                </div>

                {/* SSID */}
                <div className="space-y-2">
                  <Label htmlFor="ssid">
                    SSID {!formData.ssid?.trim() && <span className="text-red-500">*</span>}
                  </Label>
                  <Input
                    id="ssid"
                    value={formData.ssid || ''}
                    onChange={(e) => setFormData({ ...formData, ssid: e.target.value })}
                    placeholder="MyNetwork (required)"
                    className={!formData.ssid?.trim() ? 'border-red-300 focus-visible:border-red-500' : ''}
                  />
                </div>

                {/* Security Type */}
                <div className="space-y-2">
                  <Label htmlFor="security">
                    Security
                  </Label>
                  <Select
                    value={formData.security}
                    onValueChange={(value: any) => setFormData({ ...formData, security: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open (No Security)</SelectItem>
                      <SelectItem value="wpa2-psk">WPA2-PSK</SelectItem>
                      <SelectItem value="wpa3-sae">WPA3-SAE</SelectItem>
                      <SelectItem value="wpa2-enterprise">WPA2-Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Band */}
                <div className="space-y-2">
                  <Label htmlFor="band">
                    Band
                  </Label>
                  <Select
                    value={formData.band}
                    onValueChange={(value: any) => setFormData({ ...formData, band: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2.4GHz">2.4 GHz</SelectItem>
                      <SelectItem value="5GHz">5 GHz</SelectItem>
                      <SelectItem value="6GHz">6 GHz (WiFi 6E)</SelectItem>
                      <SelectItem value="dual">Dual Band (2.4 + 5 GHz)</SelectItem>
                      <SelectItem value="all">All Bands (2.4 + 5 + 6 GHz)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Passphrase (conditional) */}
                {formData.security !== 'open' && (
                  <div className="space-y-2">
                    <Label htmlFor="passphrase">
                      Passphrase {formData.security !== 'open' && !formData.passphrase?.trim() && <span className="text-red-500">*</span>}
                    </Label>
                    <Input
                      id="passphrase"
                      type="password"
                      value={formData.passphrase || ''}
                      onChange={(e) => setFormData({ ...formData, passphrase: e.target.value })}
                      placeholder="Enter passphrase (required)"
                      className={!formData.passphrase?.trim() ? 'border-red-300 focus-visible:border-red-500' : ''}
                    />
                  </div>
                )}

                {/* VLAN */}
                <div className="space-y-2">
                  <Label htmlFor="vlan">VLAN ID (Default: 1)</Label>
                  <Input
                    id="vlan"
                    type="number"
                    value={formData.vlan || ''}
                    onChange={(e) => setFormData({ ...formData, vlan: e.target.value ? parseInt(e.target.value) : 1 })}
                    placeholder="1"
                    min="1"
                    max="4094"
                  />
                </div>

                {/* Role */}
                <div className="space-y-2">
                  <Label htmlFor="role">User Role (Default: bridged)</Label>
                  <Select
                    value={formData.authenticatedUserDefaultRoleID || 'none'}
                    onValueChange={(value) => setFormData({ ...formData, authenticatedUserDefaultRoleID: value === 'none' ? null : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingRoles ? "Loading roles..." : "Select role..."} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Role</SelectItem>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              </CardContent>
            </Card>

            {/* Advanced Options Section */}
            <Card>
              <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowAdvanced(!showAdvanced)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    <CardTitle className="text-sm font-medium">Advanced Options</CardTitle>
                  </div>
                  {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
                <CardDescription className="text-xs mt-0.5">Optional advanced settings</CardDescription>
              </CardHeader>
              {showAdvanced && (
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Hide SSID */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="hideSSID" className="cursor-pointer">Hide SSID</Label>
                      </div>
                      <input
                        id="hideSSID"
                        type="checkbox"
                        checked={formData.hidden || false}
                        onChange={(e) => setFormData({ ...formData, hidden: e.target.checked })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* Max Clients */}
                    <div className="space-y-2">
                      <Label htmlFor="maxClients">Max Clients (Optional)</Label>
                      <Input
                        id="maxClients"
                        type="number"
                        value={formData.maxClients || ''}
                        onChange={(e) => setFormData({ ...formData, maxClients: e.target.value ? parseInt(e.target.value) : undefined })}
                        placeholder="Unlimited"
                        min="1"
                        max="1000"
                      />
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                      <Label htmlFor="description">Description (Optional)</Label>
                      <Input
                        id="description"
                        value={formData.description || ''}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Network description..."
                      />
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Site Selection Section */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium">
                      Site Assignment {getExpandedSiteIds().length === 0 && <span className="text-red-500">*</span>}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Select sites or site groups ({getExpandedSiteIds().length} total sites selected)
                    </CardDescription>
                  </div>
                  {discoveringProfiles && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Discovering...
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
              <div className="space-y-3">
                {/* Site Groups Section */}
                {siteGroups.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Folder className="h-4 w-4" />
                        Site Groups
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setSiteGroupDialogOpen(true)}
                      >
                        <Settings className="h-3 w-3 mr-1" />
                        Manage
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {siteGroups.map(group => (
                        <div
                          key={group.id}
                          className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                            formData.selectedSiteGroups.includes(group.id)
                              ? 'border-primary bg-primary/5'
                              : 'hover:bg-accent/50'
                          }`}
                          onClick={() => toggleSiteGroup(group.id)}
                        >
                          <input
                            type="checkbox"
                            checked={formData.selectedSiteGroups.includes(group.id)}
                            onChange={() => {}}
                            className="h-4 w-4"
                          />
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: group.color }}
                          />
                          <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{group.name}</span>
                            {group.description && (
                              <p className="text-xs text-muted-foreground truncate">{group.description}</p>
                            )}
                          </div>
                          <Badge variant="secondary" className="text-xs flex-shrink-0">
                            {group.siteIds.length} {group.siteIds.length === 1 ? 'site' : 'sites'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manage Site Groups Button (when no groups exist) */}
                {siteGroups.length === 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setSiteGroupDialogOpen(true)}
                  >
                    <Folder className="h-4 w-4 mr-2" />
                    Create Site Groups
                  </Button>
                )}

                {/* Individual Sites Section */}
                <div className="flex items-center justify-between">
                  <Label>Individual Sites</Label>
                  {sites.length > 0 && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setFormData({ ...formData, selectedSites: sites.map(s => s.id) })}
                        disabled={formData.selectedSites.length === sites.length}
                      >
                        Select All
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setFormData({ ...formData, selectedSites: [] })}
                        disabled={formData.selectedSites.length === 0}
                      >
                        Clear All
                      </Button>
                    </div>
                  )}
                </div>
                {loadingSites ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : sites.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    No sites available
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sites.map(site => (
                      <div
                        key={site.id}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          formData.selectedSites.includes(site.id)
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-accent/50'
                        }`}
                        onClick={() => toggleSite(site.id)}
                      >
                        <input
                          type="checkbox"
                          checked={formData.selectedSites.includes(site.id)}
                          onChange={() => {}}
                          className="h-4 w-4"
                        />
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1">{site.name || site.siteName || site.id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </CardContent>
            </Card>

            {/* Deployment Mode Selectors */}
            {formData.selectedSites.length > 0 && !discoveringProfiles && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Deployment Configuration</CardTitle>
                  <CardDescription className="text-xs">Choose how WLANs are assigned to profiles</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Array.from(siteConfigs.values()).map((config) => (
                      <DeploymentModeSelector
                        key={config.siteId}
                        siteId={config.siteId}
                        siteName={config.siteName}
                        profileCount={config.profiles.length}
                        selectedMode={config.deploymentMode}
                        onModeChange={(mode) => handleModeChange(config.siteId, mode)}
                        onConfigureProfiles={
                          config.deploymentMode === 'ALL_PROFILES_AT_SITE'
                            ? undefined
                            : () => openProfilePicker(config.siteId, config.deploymentMode as any)
                        }
                        selectedProfilesCount={config.includedProfiles.length}
                        excludedProfilesCount={config.excludedProfiles.length}
                      />
                    ))}
                  </div>

                  {/* Effective Set Preview */}
                  <EffectiveSetPreview effectiveSets={effectiveSets} />
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t mt-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isValid || submitting || discoveringProfiles}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Create & Deploy WLAN
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile Picker Dialog */}
      {profilePickerSite && (
        <ProfilePicker
          open={profilePickerOpen}
          onOpenChange={setProfilePickerOpen}
          mode={profilePickerSite.mode}
          profiles={siteConfigs.get(profilePickerSite.siteId)?.profiles || []}
          siteName={profilePickerSite.siteName}
          selectedProfileIds={
            profilePickerSite.mode === 'INCLUDE_ONLY'
              ? siteConfigs.get(profilePickerSite.siteId)?.includedProfiles || []
              : siteConfigs.get(profilePickerSite.siteId)?.excludedProfiles || []
          }
          onConfirm={handleProfileSelection}
        />
      )}

      {/* Site Group Management Dialog */}
      <SiteGroupManagementDialog
        open={siteGroupDialogOpen}
        onOpenChange={setSiteGroupDialogOpen}
        sites={sites}
        siteGroups={siteGroups}
        onSave={handleSaveSiteGroups}
      />
    </>
  );
}
