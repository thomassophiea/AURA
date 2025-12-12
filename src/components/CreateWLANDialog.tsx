import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, AlertCircle, Wifi, MapPin, Users } from 'lucide-react';
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
import type {
  Site,
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
    ssid: '',
    security: 'wpa2-psk',
    passphrase: '',
    vlan: null,
    band: 'dual',
    enabled: true,
    selectedSites: [],
    authenticatedUserDefaultRoleID: null
  });

  // Sites data
  const [sites, setSites] = useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);

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

  // Load sites and roles when dialog opens
  useEffect(() => {
    if (open) {
      loadSites();
      loadRoles();
      // Reset form
      setFormData({
        ssid: '',
        security: 'wpa2-psk',
        passphrase: '',
        vlan: null,
        band: 'dual',
        enabled: true,
        selectedSites: [],
        authenticatedUserDefaultRoleID: null // Will be set to 'accessing' after roles load
      });
      setSiteConfigs(new Map());
      setProfilesBySite(new Map());
      setEffectiveSets([]);
    }
  }, [open]);

  // Discover profiles when sites change
  useEffect(() => {
    if (formData.selectedSites.length > 0) {
      discoverProfiles();
    } else {
      setProfilesBySite(new Map());
      setEffectiveSets([]);
    }
  }, [formData.selectedSites]);

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

      // Auto-select "accessing" role if it exists
      const accessingRole = data.find(r =>
        r.name?.toLowerCase() === 'accessing'
      );

      if (accessingRole) {
        setFormData(prev => ({ ...prev, authenticatedUserDefaultRoleID: accessingRole.id }));
        console.log('[CreateWLAN] Auto-selected "accessing" role:', accessingRole.id);
      }
    } catch (error) {
      console.error('Failed to load roles:', error);
      // Don't show error toast - roles are optional
    } finally {
      setLoadingRoles(false);
    }
  };

  const discoverProfiles = async () => {
    console.log('=== PROFILE DISCOVERY START ===');
    console.log('Selected sites to discover:', formData.selectedSites);

    setDiscoveringProfiles(true);
    try {
      const assignmentService = new WLANAssignmentService();
      console.log('Calling discoverProfilesForSites...');
      const profileMap = await assignmentService.discoverProfilesForSites(formData.selectedSites);
      console.log('Profile Map Received:', profileMap);

      const newProfilesBySite = new Map<string, Profile[]>();
      const newSiteConfigs = new Map(siteConfigs);

      for (const siteId of formData.selectedSites) {
        const profiles = profileMap[siteId] || [];
        console.log(`Site ${siteId}: Found ${profiles.length} profiles`, profiles);
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
      console.log(`✅ Discovered profiles for ${formData.selectedSites.length} sites`);
      console.log('Final site configs:', Array.from(newSiteConfigs.entries()));
      console.log('=== PROFILE DISCOVERY END ===');
    } catch (error) {
      console.error('❌ Failed to discover profiles:', error);
      console.error('Error details:', error);
      toast.error('Failed to discover profiles');
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

  const handleSubmit = async () => {
    console.log('=== WLAN CREATION DEBUG START ===');
    console.log('1. Form Data:', formData);
    console.log('2. Selected Sites:', formData.selectedSites);
    console.log('3. Site Configs:', Array.from(siteConfigs.entries()));
    console.log('4. Profiles By Site:', Array.from(profilesBySite.entries()));
    console.log('5. Effective Sets:', effectiveSets);

    // Validation
    if (!formData.ssid.trim()) {
      toast.error('SSID is required');
      return;
    }

    if (formData.security !== 'open' && !formData.passphrase.trim()) {
      toast.error('Passphrase is required for secured networks');
      return;
    }

    if (formData.selectedSites.length === 0) {
      toast.error('Please select at least one site');
      return;
    }

    console.log('6. Validation passed, site configs count:', siteConfigs.size);

    // Validate site configurations
    for (const config of siteConfigs.values()) {
      console.log('7. Validating config for site:', config.siteName, config);
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

      // Prepare site assignments
      const siteAssignments = Array.from(siteConfigs.values()).map(config => ({
        siteId: config.siteId,
        siteName: config.siteName,
        deploymentMode: config.deploymentMode,
        includedProfiles: config.includedProfiles,
        excludedProfiles: config.excludedProfiles
      }));

      console.log('9. Site Assignments Prepared:', siteAssignments);
      console.log('10. Calling createWLANWithSiteCentricDeployment...');

      // Use new site-centric deployment method
      const result = await assignmentService.createWLANWithSiteCentricDeployment(
        {
          name: formData.ssid,
          ssid: formData.ssid,
          security: formData.security,
          passphrase: formData.passphrase || undefined,
          vlan: formData.vlan || undefined,
          band: formData.band,
          enabled: formData.enabled,
          sites: formData.selectedSites,
          authenticatedUserDefaultRoleID: formData.authenticatedUserDefaultRoleID || undefined
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

  const isValid = formData.ssid.trim() &&
    (formData.security === 'open' || formData.passphrase.trim()) &&
    formData.selectedSites.length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Wifi className="h-6 w-6" />
              Create Wireless Network
            </DialogTitle>
            <DialogDescription className="text-base">
              Configure a new WLAN with site-centric deployment
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-6 px-6 overflow-y-auto flex-1">
            {/* WLAN Configuration Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Network Configuration</CardTitle>
                <CardDescription className="text-xs">Basic WLAN settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

              <div className="grid gap-4">
                {/* SSID */}
                <div className="space-y-2">
                  <Label htmlFor="ssid">SSID *</Label>
                  <Input
                    id="ssid"
                    value={formData.ssid}
                    onChange={(e) => setFormData({ ...formData, ssid: e.target.value })}
                    placeholder="MyNetwork"
                  />
                </div>

                {/* Security Type */}
                <div className="space-y-2">
                  <Label htmlFor="security">Security *</Label>
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

                {/* Passphrase (conditional) */}
                {formData.security !== 'open' && (
                  <div className="space-y-2">
                    <Label htmlFor="passphrase">Passphrase *</Label>
                    <Input
                      id="passphrase"
                      type="password"
                      value={formData.passphrase}
                      onChange={(e) => setFormData({ ...formData, passphrase: e.target.value })}
                      placeholder="Enter passphrase"
                    />
                  </div>
                )}

                {/* Band */}
                <div className="space-y-2">
                  <Label htmlFor="band">Band *</Label>
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
                      <SelectItem value="dual">Dual Band (2.4 + 5 GHz)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* VLAN */}
                <div className="space-y-2">
                  <Label htmlFor="vlan">VLAN ID (Optional)</Label>
                  <Input
                    id="vlan"
                    type="number"
                    value={formData.vlan || ''}
                    onChange={(e) => setFormData({ ...formData, vlan: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="100"
                    min="1"
                    max="4094"
                  />
                </div>

                {/* Role */}
                <div className="space-y-2">
                  <Label htmlFor="role">User Role</Label>
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

            {/* Site Selection Section */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium">Site Assignment *</CardTitle>
                    <CardDescription className="text-xs mt-1">Select sites for deployment</CardDescription>
                  </div>
                  {discoveringProfiles && (
                    <Badge variant="secondary" className="gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Discovering profiles...
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Sites</Label>
                {loadingSites ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : sites.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    No sites available
                  </div>
                ) : (
                  <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                    {sites.map(site => (
                      <div
                        key={site.id}
                        className="flex items-center space-x-3 p-3 hover:bg-accent cursor-pointer"
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
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Deployment Configuration</CardTitle>
                  <CardDescription className="text-xs">Choose how WLANs are assigned to profiles</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4">
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

          <DialogFooter className="flex-shrink-0 px-6 py-4 border-t bg-muted/30">
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
    </>
  );
}
