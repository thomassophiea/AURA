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
import { ProfilePickerDialog } from './wlans/ProfilePickerDialog';
import { EffectiveSetPreview } from './wlans/EffectiveSetPreview';
import { SiteGroupManagementDialog } from './SiteGroupManagementDialog';
import { ProfileInterfaceAssignmentDialog, type ProfileWithInterfaces } from './wlans/ProfileInterfaceAssignmentDialog';
import type {
  Site,
  SiteGroup,
  Profile,
  AutoAssignmentResponse,
  WLANFormData,
  DeploymentMode,
  EffectiveProfileSet,
  SecurityType,
  PMFMode
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
  // Form state - defaults for easy WLAN creation
  const [formData, setFormData] = useState<WLANFormData>({
    serviceName: 'New WLAN',
    ssid: 'New WLAN',
    security: 'wpa2-psk',
    passphrase: '',
    vlan: 1,
    band: 'dual',
    enabled: true,
    selectedSites: [],
    selectedSiteGroups: [],
    authenticatedUserDefaultRoleID: null,
    // Basic options
    hidden: false,
    maxClients: undefined,
    description: '',
    // Advanced options (controller defaults)
    mbo: true,
    accountingEnabled: false,
    includeHostname: false,
    enable11mcSupport: false,
    enabled11kSupport: false,
    uapsdEnabled: true,
    admissionControlVoice: false,
    admissionControlVideo: false,
    admissionControlBestEffort: false,
    admissionControlBackgroundTraffic: false,
    clientToClientCommunication: true,
    purgeOnDisconnect: false,
    beaconProtection: false,
    preAuthenticatedIdleTimeout: 300,
    postAuthenticatedIdleTimeout: 1800,
    sessionTimeout: 0
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

  // AAA Policies (for enterprise auth)
  const [aaaPolicies, setAaaPolicies] = useState<any[]>([]);
  const [loadingAaaPolicies, setLoadingAaaPolicies] = useState(false);

  // Topologies
  const [topologies, setTopologies] = useState<any[]>([]);
  const [loadingTopologies, setLoadingTopologies] = useState(false);

  // Class of Service
  const [cosProfiles, setCosProfiles] = useState<any[]>([]);
  const [loadingCos, setLoadingCos] = useState(false);

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

  // Track if SSID has been manually edited (to stop auto-sync from Network Name)
  const [ssidManuallyEdited, setSsidManuallyEdited] = useState(false);

  // Draggable state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const dialogRef = useRef<HTMLDivElement>(null);

  // Advanced options state
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Interface assignment dialog state (for granular radio/port selection)
  const [interfaceAssignmentOpen, setInterfaceAssignmentOpen] = useState(false);
  const [createdServiceId, setCreatedServiceId] = useState<string | null>(null);
  const [createdServiceName, setCreatedServiceName] = useState<string>('');

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

  // Load sites, roles, and AAA policies when dialog opens
  useEffect(() => {
    if (open) {
      loadSites();
      loadRoles();
      loadAaaPolicies();
      loadTopologies();
      loadCosProfiles();
      // Reset form and position with easy-to-use defaults
      setFormData({
        serviceName: 'New WLAN',
        ssid: 'New WLAN',
        security: 'wpa2-psk',
        passphrase: '',
        vlan: 1,
        band: 'dual',
        enabled: true,
        selectedSites: [], // Will be populated with all sites after load
        selectedSiteGroups: [],
        authenticatedUserDefaultRoleID: null, // Will be set to 'bridged' after roles load
        // Basic options
        hidden: false,
        maxClients: undefined,
        description: '',
        // Advanced options (controller defaults)
        mbo: true,
        accountingEnabled: false,
        includeHostname: false,
        enable11mcSupport: false,
        enabled11kSupport: false,
        uapsdEnabled: true,
        admissionControlVoice: false,
        admissionControlVideo: false,
        admissionControlBestEffort: false,
        admissionControlBackgroundTraffic: false,
        clientToClientCommunication: true,
        purgeOnDisconnect: false,
        beaconProtection: false,
        preAuthenticatedIdleTimeout: 300,
        postAuthenticatedIdleTimeout: 1800,
        sessionTimeout: 0
      });
      setSiteConfigs(new Map());
      setProfilesBySite(new Map());
      setEffectiveSets([]);
      setSsidManuallyEdited(false); // Reset SSID sync tracking
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
      // Auto-select all sites by default for easy deployment
      if (data.length > 0) {
        const allSiteIds = data.map((s: any) => s.id);
        setFormData(prev => ({ ...prev, selectedSites: allSiteIds }));
        console.log('[CreateWLAN] Auto-selected all sites:', allSiteIds.length);
      }
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

  const loadAaaPolicies = async () => {
    setLoadingAaaPolicies(true);
    try {
      const data = await apiService.getAAAPolicies();
      setAaaPolicies(data);
      console.log(`[CreateWLAN] Loaded ${data.length} AAA policies`);
    } catch (error) {
      console.error('Failed to load AAA policies:', error);
    } finally {
      setLoadingAaaPolicies(false);
    }
  };

  const loadTopologies = async () => {
    setLoadingTopologies(true);
    try {
      const data = await apiService.getTopologies();
      setTopologies(data);
      console.log(`[CreateWLAN] Loaded ${data.length} topologies`);
    } catch (error) {
      console.error('Failed to load topologies:', error);
    } finally {
      setLoadingTopologies(false);
    }
  };

  const loadCosProfiles = async () => {
    setLoadingCos(true);
    try {
      const data = await apiService.getClassOfService();
      setCosProfiles(data);
      console.log(`[CreateWLAN] Loaded ${data.length} CoS profiles`);
    } catch (error) {
      console.error('Failed to load CoS profiles:', error);
    } finally {
      setLoadingCos(false);
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
    
    // Passphrase required only for PSK/Personal modes
    const pskModes: SecurityType[] = ['wpa2-psk', 'wpa3-personal', 'wpa3-compatibility'];
    if (pskModes.includes(formData.security) && !formData.passphrase?.trim()) return false;
    
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

    // Passphrase required only for PSK/Personal modes
    const pskModes: SecurityType[] = ['wpa2-psk', 'wpa3-personal', 'wpa3-compatibility'];
    if (pskModes.includes(formData.security) && !formData.passphrase?.trim()) {
      errors.push('Passphrase is required for WPA Personal networks');
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
          // Security-specific configuration (enterprise auth, PMF, etc.)
          securityConfig: formData.securityConfig,
          // Basic options
          hidden: formData.hidden,
          maxClients: formData.maxClients,
          description: formData.description || undefined,
          // Advanced options (from controller form)
          mbo: formData.mbo,
          accountingEnabled: formData.accountingEnabled,
          includeHostname: formData.includeHostname,
          enable11mcSupport: formData.enable11mcSupport,
          enabled11kSupport: formData.enabled11kSupport,
          uapsdEnabled: formData.uapsdEnabled,
          admissionControlVoice: formData.admissionControlVoice,
          admissionControlVideo: formData.admissionControlVideo,
          admissionControlBestEffort: formData.admissionControlBestEffort,
          admissionControlBackgroundTraffic: formData.admissionControlBackgroundTraffic,
          clientToClientCommunication: formData.clientToClientCommunication,
          purgeOnDisconnect: formData.purgeOnDisconnect,
          beaconProtection: formData.beaconProtection,
          preAuthenticatedIdleTimeout: formData.preAuthenticatedIdleTimeout,
          postAuthenticatedIdleTimeout: formData.postAuthenticatedIdleTimeout,
          sessionTimeout: formData.sessionTimeout,
          topologyId: formData.topologyId,
          cosId: formData.cosId
        },
        siteAssignments
      );

      console.log('11. WLAN Creation Result:', result);
      console.log('=== WLAN CREATION DEBUG END ===');

      // Calculate success/failure counts
      const successfulAssignments = result.assignments?.filter(a => a.success) || [];
      const failedAssignments = result.assignments?.filter(a => !a.success) || [];

      if (failedAssignments.length === 0) {
        // Complete success
        toast.success('WLAN Created Successfully', {
          description: `Assigned to ${result.profilesAssigned} profile(s) across ${result.sitesProcessed} site(s)`
        });
      } else if (successfulAssignments.length > 0) {
        // Partial success - some profiles succeeded, some failed
        toast.warning('WLAN Created with Partial Deployment', {
          description: `✓ ${successfulAssignments.length} profile(s) succeeded, ✗ ${failedAssignments.length} failed. Check console for details.`,
          duration: 8000
        });
        console.warn('[WLAN Deployment] Failed profiles:', failedAssignments.map(a => ({
          profile: a.profileName,
          error: a.error
        })));
      } else {
        // All assignments failed
        toast.error('WLAN Created but Deployment Failed', {
          description: `WLAN was created but could not be assigned to any profiles. Check console for details.`,
          duration: 8000
        });
        console.error('[WLAN Deployment] All profile assignments failed:', failedAssignments);
      }

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

  // Handler for interface assignment dialog - assigns service to profiles with specific interfaces
  const handleInterfaceAssignment = async (assignments: ProfileWithInterfaces[]) => {
    if (!createdServiceId) {
      toast.error('No service ID available for assignment');
      return;
    }

    console.log('[InterfaceAssignment] Saving assignments for service:', createdServiceId);
    console.log('[InterfaceAssignment] Profile assignments:', assignments);

    let successCount = 0;
    let failCount = 0;

    for (const assignment of assignments) {
      try {
        // Build interface configuration from the assignment
        const interfaces = {
          radio1: assignment.interfaces.radio1?.enabled ?? false,
          radio2: assignment.interfaces.radio2?.enabled ?? false,
          radio3: assignment.interfaces.radio3?.enabled ?? false,
          port1: assignment.interfaces.port1?.enabled ?? false,
          port2: assignment.interfaces.port2?.enabled ?? false,
          port3: assignment.interfaces.port3?.enabled ?? false,
        };

        await apiService.assignServiceToProfileWithInterfaces(
          createdServiceId,
          assignment.id,
          interfaces
        );
        successCount++;
      } catch (error) {
        console.error(`[InterfaceAssignment] Failed to assign to profile ${assignment.name}:`, error);
        failCount++;
      }
    }

    if (failCount === 0) {
      toast.success('Interface Assignments Saved', {
        description: `Successfully configured ${successCount} profile(s)`
      });
    } else if (successCount > 0) {
      toast.warning('Partial Assignment Success', {
        description: `${successCount} succeeded, ${failCount} failed`
      });
    } else {
      toast.error('Assignment Failed', {
        description: 'Could not assign interfaces to any profiles'
      });
    }

    // Trigger sync for assigned profiles
    try {
      const profileIds = assignments.map(a => a.id);
      await apiService.syncMultipleProfiles(profileIds);
    } catch (error) {
      console.warn('[InterfaceAssignment] Sync failed:', error);
    }

    // Close dialogs and notify success
    setInterfaceAssignmentOpen(false);
    setCreatedServiceId(null);
    setCreatedServiceName('');
    onOpenChange(false);

    onSuccess({
      serviceId: createdServiceId,
      sitesProcessed: siteConfigs.size,
      deviceGroupsFound: 0,
      profilesAssigned: successCount,
      assignments: assignments.map(a => ({
        profileId: a.id,
        profileName: a.name,
        success: true
      })),
      success: true
    });
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
                {/* Network Name - auto-syncs to SSID unless SSID is manually edited */}
                <div className="space-y-2">
                  <Label htmlFor="serviceName">
                    Network Name {!formData.serviceName?.trim() && <span className="text-red-500">*</span>}
                  </Label>
                  <Input
                    id="serviceName"
                    value={formData.serviceName || ''}
                    onChange={(e) => {
                      const newName = e.target.value;
                      // Sync SSID unless user has manually edited it
                      if (!ssidManuallyEdited) {
                        setFormData({ ...formData, serviceName: newName, ssid: newName });
                      } else {
                        setFormData({ ...formData, serviceName: newName });
                      }
                    }}
                    placeholder="New WLAN"
                    className={!formData.serviceName?.trim() ? 'border-red-300 focus-visible:border-red-500' : ''}
                  />
                </div>

                {/* SSID - can be different from Network Name */}
                <div className="space-y-2">
                  <Label htmlFor="ssid">
                    SSID {!formData.ssid?.trim() && <span className="text-red-500">*</span>}
                  </Label>
                  <Input
                    id="ssid"
                    value={formData.ssid || ''}
                    onChange={(e) => {
                      setSsidManuallyEdited(true); // User edited SSID, stop auto-sync
                      setFormData({ ...formData, ssid: e.target.value });
                    }}
                    placeholder="Broadcast name"
                    className={!formData.ssid?.trim() ? 'border-red-300 focus-visible:border-red-500' : ''}
                  />
                </div>

                {/* Security Type */}
                <div className="space-y-2">
                  <Label htmlFor="security">
                    Auth Type
                  </Label>
                  <Select
                    value={formData.security}
                    onValueChange={(value: any) => setFormData({ ...formData, security: value, securityConfig: undefined })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="owe">OWE (Enhanced Open)</SelectItem>
                      <SelectItem value="wep">WEP (Legacy)</SelectItem>
                      <SelectItem value="wpa2-psk">WPA2-Personal</SelectItem>
                      <SelectItem value="wpa2-enterprise">WPA2-Enterprise</SelectItem>
                      <SelectItem value="wpa3-personal">WPA3-Personal</SelectItem>
                      <SelectItem value="wpa3-compatibility">WPA3-Compatibility</SelectItem>
                      <SelectItem value="wpa3-enterprise-transition">WPA3-Enterprise Transition</SelectItem>
                      <SelectItem value="wpa3-enterprise-192">WPA3-Enterprise 192-bit</SelectItem>
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

                {/* Passphrase - for PSK/Personal modes */}
                {['wpa2-psk', 'wpa3-personal', 'wpa3-compatibility'].includes(formData.security) && (
                  <div className="space-y-2">
                    <Label htmlFor="passphrase">
                      {formData.security === 'wpa3-personal' ? 'WPA3 Key' : 'WPA2 Key'} 
                      {!formData.passphrase?.trim() && <span className="text-red-500">*</span>}
                    </Label>
                    <Input
                      id="passphrase"
                      type="password"
                      value={formData.passphrase || ''}
                      onChange={(e) => setFormData({ ...formData, passphrase: e.target.value })}
                      placeholder="Enter passphrase (8-63 characters)"
                      className={!formData.passphrase?.trim() ? 'border-red-300 focus-visible:border-red-500' : ''}
                    />
                  </div>
                )}

                {/* PMF Mode - for WPA2/WPA3 */}
                {['wpa2-psk', 'wpa2-enterprise', 'wpa3-compatibility'].includes(formData.security) && (
                  <div className="space-y-2">
                    <Label htmlFor="pmfMode">Protected Management Frames</Label>
                    <Select
                      value={formData.securityConfig?.pmfMode || 'disabled'}
                      onValueChange={(value: PMFMode) => setFormData({
                        ...formData,
                        securityConfig: { ...formData.securityConfig, pmfMode: value }
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="disabled">Disabled</SelectItem>
                        <SelectItem value="optional">Optional (Capable)</SelectItem>
                        <SelectItem value="required">Required</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* WPA3 SAE Method - only for WPA3-Personal */}
                {formData.security === 'wpa3-personal' && (
                  <div className="space-y-2">
                    <Label htmlFor="saeMethod">SAE Method</Label>
                    <Select
                      value={formData.securityConfig?.saeMethod || 'both'}
                      onValueChange={(value: any) => setFormData({
                        ...formData,
                        securityConfig: { ...formData.securityConfig, saeMethod: value }
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sae">SAE Only (2.4/5 GHz)</SelectItem>
                        <SelectItem value="h2e">H2E Only (Required for 6 GHz)</SelectItem>
                        <SelectItem value="both">SAE/H2E (Default, backwards compatible)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* 6E WPA Compliance - for WPA3/OWE */}
                {['owe', 'wpa3-personal', 'wpa3-enterprise-transition'].includes(formData.security) && (
                  <div className="flex items-center justify-between py-2">
                    <Label htmlFor="sixECompliance" className="cursor-pointer">6E WPA Compliance</Label>
                    <input
                      id="sixECompliance"
                      type="checkbox"
                      checked={formData.securityConfig?.sixECompliance ?? false}
                      onChange={(e) => setFormData({
                        ...formData,
                        securityConfig: { ...formData.securityConfig, sixECompliance: e.target.checked }
                      })}
                      className="h-4 w-4 cursor-pointer"
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

                {/* Topology */}
                <div className="space-y-2">
                  <Label htmlFor="topology">Topology</Label>
                  <Select
                    value={formData.topologyId || 'none'}
                    onValueChange={(value) => setFormData({ ...formData, topologyId: value === 'none' ? undefined : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingTopologies ? "Loading topologies..." : "Select topology..."} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default Topology</SelectItem>
                      {topologies.map((topology) => (
                        <SelectItem key={topology.id} value={topology.id}>
                          {topology.name || topology.topologyName || topology.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Class of Service */}
                <div className="space-y-2">
                  <Label htmlFor="cos">Class of Service</Label>
                  <Select
                    value={formData.cosId || 'none'}
                    onValueChange={(value) => setFormData({ ...formData, cosId: value === 'none' ? undefined : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingCos ? "Loading CoS..." : "Select CoS..."} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default CoS</SelectItem>
                      {cosProfiles.map((cos) => (
                        <SelectItem key={cos.id} value={cos.id}>
                          {cos.name || cos.cosName || cos.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

            {/* Enterprise Authentication Section - Only for enterprise modes */}
            {['wpa2-enterprise', 'wpa3-enterprise-transition', 'wpa3-enterprise-192'].includes(formData.security) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Enterprise Authentication</CardTitle>
                  <CardDescription className="text-xs">
                    RADIUS/802.1X configuration
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Enable MBA */}
                    <div className="flex items-center justify-between py-2 md:col-span-2">
                      <Label htmlFor="mbaEnabled" className="cursor-pointer">MAC-Based Authentication (MBA)</Label>
                      <input
                        id="mbaEnabled"
                        type="checkbox"
                        checked={formData.securityConfig?.mbaEnabled ?? false}
                        onChange={(e) => setFormData({
                          ...formData,
                          securityConfig: { ...formData.securityConfig, mbaEnabled: e.target.checked }
                        })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* AAA Policy Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="aaaPolicyId">AAA Policy</Label>
                      <Select
                        value={formData.securityConfig?.aaaPolicyId || 'none'}
                        onValueChange={(value) => setFormData({
                          ...formData,
                          securityConfig: { ...formData.securityConfig, aaaPolicyId: value === 'none' ? undefined : value }
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={loadingAaaPolicies ? "Loading policies..." : "Select AAA Policy..."} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None (Use WLAN-level RADIUS)</SelectItem>
                          {aaaPolicies.map((policy) => (
                            <SelectItem key={policy.id} value={policy.id}>
                              {policy.name || policy.policyName || policy.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Authentication Method */}
                    <div className="space-y-2">
                      <Label htmlFor="wlanAuthMethod">Authentication Method</Label>
                      <Select
                        value={formData.securityConfig?.wlanAuthMethod || 'RADIUS'}
                        onValueChange={(value: any) => setFormData({
                          ...formData,
                          securityConfig: { ...formData.securityConfig, wlanAuthMethod: value }
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="RADIUS">RADIUS</SelectItem>
                          <SelectItem value="Proxy RADIUS">Proxy RADIUS</SelectItem>
                          <SelectItem value="Local">Local</SelectItem>
                          <SelectItem value="LDAP">LDAP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Primary RADIUS Server */}
                    <div className="space-y-2">
                      <Label htmlFor="primaryRadius">Primary RADIUS Server</Label>
                      <Input
                        id="primaryRadius"
                        value={formData.securityConfig?.primaryRadiusServer || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          securityConfig: { ...formData.securityConfig, primaryRadiusServer: e.target.value }
                        })}
                        placeholder="IP address or hostname"
                      />
                    </div>

                    {/* Backup RADIUS Server */}
                    <div className="space-y-2">
                      <Label htmlFor="backupRadius">Backup RADIUS Server</Label>
                      <Input
                        id="backupRadius"
                        value={formData.securityConfig?.backupRadiusServer || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          securityConfig: { ...formData.securityConfig, backupRadiusServer: e.target.value }
                        })}
                        placeholder="IP address or hostname (optional)"
                      />
                    </div>

                    {/* Fast Transition */}
                    <div className="flex items-center justify-between py-2 md:col-span-2">
                      <Label htmlFor="fastTransition" className="cursor-pointer">Fast Transition (802.11r)</Label>
                      <input
                        id="fastTransition"
                        type="checkbox"
                        checked={formData.securityConfig?.fastTransition ?? false}
                        onChange={(e) => setFormData({
                          ...formData,
                          securityConfig: { ...formData.securityConfig, fastTransition: e.target.checked }
                        })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* Default Auth Role */}
                    <div className="space-y-2">
                      <Label htmlFor="defaultAuthRole">Default Auth Role</Label>
                      <Select
                        value={formData.securityConfig?.defaultAuthRoleId || 'none'}
                        onValueChange={(value) => setFormData({
                          ...formData,
                          securityConfig: { ...formData.securityConfig, defaultAuthRoleId: value === 'none' ? undefined : value }
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select role..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {roles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Default VLAN */}
                    <div className="space-y-2">
                      <Label htmlFor="defaultVlan">Default VLAN</Label>
                      <Input
                        id="defaultVlan"
                        value={formData.securityConfig?.defaultVlanId || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          securityConfig: { ...formData.securityConfig, defaultVlanId: e.target.value }
                        })}
                        placeholder="VLAN ID (optional)"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

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
                <CardContent className="space-y-6">
                  {/* Toggle Options - Grid Layout */}
                  <div className="space-y-3">
                    {/* MultiBand Operation */}
                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="mbo" className="cursor-pointer">MultiBand Operation</Label>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <input
                        id="mbo"
                        type="checkbox"
                        checked={formData.mbo ?? true}
                        onChange={(e) => setFormData({ ...formData, mbo: e.target.checked })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* RADIUS Accounting */}
                    <div className="flex items-center justify-between py-1">
                      <Label htmlFor="accountingEnabled" className="cursor-pointer">RADIUS Accounting</Label>
                      <input
                        id="accountingEnabled"
                        type="checkbox"
                        checked={formData.accountingEnabled ?? false}
                        onChange={(e) => setFormData({ ...formData, accountingEnabled: e.target.checked })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* Hide SSID */}
                    <div className="flex items-center justify-between py-1">
                      <Label htmlFor="hideSSID" className="cursor-pointer">Hide SSID</Label>
                      <input
                        id="hideSSID"
                        type="checkbox"
                        checked={formData.hidden ?? false}
                        onChange={(e) => setFormData({ ...formData, hidden: e.target.checked })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* Include Hostname */}
                    <div className="flex items-center justify-between py-1">
                      <Label htmlFor="includeHostname" className="cursor-pointer">Include Hostname</Label>
                      <input
                        id="includeHostname"
                        type="checkbox"
                        checked={formData.includeHostname ?? false}
                        onChange={(e) => setFormData({ ...formData, includeHostname: e.target.checked })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* FTM (11mc) responder support */}
                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="enable11mcSupport" className="cursor-pointer">FTM (11mc) responder support</Label>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <input
                        id="enable11mcSupport"
                        type="checkbox"
                        checked={formData.enable11mcSupport ?? false}
                        onChange={(e) => setFormData({ ...formData, enable11mcSupport: e.target.checked })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* Radio Management (11k) support */}
                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="enabled11kSupport" className="cursor-pointer">Radio Management (11k) support</Label>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <input
                        id="enabled11kSupport"
                        type="checkbox"
                        checked={formData.enabled11kSupport ?? false}
                        onChange={(e) => setFormData({ ...formData, enabled11kSupport: e.target.checked })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* U-APSD (WMM-PS) */}
                    <div className="flex items-center justify-between py-1">
                      <Label htmlFor="uapsdEnabled" className="cursor-pointer">U-APSD (WMM-PS)</Label>
                      <input
                        id="uapsdEnabled"
                        type="checkbox"
                        checked={formData.uapsdEnabled ?? true}
                        onChange={(e) => setFormData({ ...formData, uapsdEnabled: e.target.checked })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* Admission Control for Voice */}
                    <div className="flex items-center justify-between py-1">
                      <Label htmlFor="admissionControlVoice" className="cursor-pointer">Use Admission Control for Voice (VO)</Label>
                      <input
                        id="admissionControlVoice"
                        type="checkbox"
                        checked={formData.admissionControlVoice ?? false}
                        onChange={(e) => setFormData({ ...formData, admissionControlVoice: e.target.checked })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* Admission Control for Video */}
                    <div className="flex items-center justify-between py-1">
                      <Label htmlFor="admissionControlVideo" className="cursor-pointer">Use Admission Control for Video (VI)</Label>
                      <input
                        id="admissionControlVideo"
                        type="checkbox"
                        checked={formData.admissionControlVideo ?? false}
                        onChange={(e) => setFormData({ ...formData, admissionControlVideo: e.target.checked })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* Admission Control for Best Effort */}
                    <div className="flex items-center justify-between py-1">
                      <Label htmlFor="admissionControlBestEffort" className="cursor-pointer">Use Admission Control for Best Effort (BE)</Label>
                      <input
                        id="admissionControlBestEffort"
                        type="checkbox"
                        checked={formData.admissionControlBestEffort ?? false}
                        onChange={(e) => setFormData({ ...formData, admissionControlBestEffort: e.target.checked })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* Admission Control for Background */}
                    <div className="flex items-center justify-between py-1">
                      <Label htmlFor="admissionControlBackgroundTraffic" className="cursor-pointer">Use Global Admission Control for Background (BK)</Label>
                      <input
                        id="admissionControlBackgroundTraffic"
                        type="checkbox"
                        checked={formData.admissionControlBackgroundTraffic ?? false}
                        onChange={(e) => setFormData({ ...formData, admissionControlBackgroundTraffic: e.target.checked })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* Client To Client Communication */}
                    <div className="flex items-center justify-between py-1">
                      <Label htmlFor="clientToClientCommunication" className="cursor-pointer">Client To Client Communication</Label>
                      <input
                        id="clientToClientCommunication"
                        type="checkbox"
                        checked={formData.clientToClientCommunication ?? true}
                        onChange={(e) => setFormData({ ...formData, clientToClientCommunication: e.target.checked })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* Clear Session on Disconnect */}
                    <div className="flex items-center justify-between py-1">
                      <Label htmlFor="purgeOnDisconnect" className="cursor-pointer">Clear Session on Disconnect</Label>
                      <input
                        id="purgeOnDisconnect"
                        type="checkbox"
                        checked={formData.purgeOnDisconnect ?? false}
                        onChange={(e) => setFormData({ ...formData, purgeOnDisconnect: e.target.checked })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* Beacon Protection */}
                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="beaconProtection" className="cursor-pointer">Beacon Protection</Label>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <input
                        id="beaconProtection"
                        type="checkbox"
                        checked={formData.beaconProtection ?? false}
                        onChange={(e) => setFormData({ ...formData, beaconProtection: e.target.checked })}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Timeout Settings */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Timeout Settings</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Pre-Authenticated Idle Timeout */}
                      <div className="space-y-2">
                        <Label htmlFor="preAuthenticatedIdleTimeout" className="text-xs">Pre-Authenticated idle timeout (seconds)</Label>
                        <Input
                          id="preAuthenticatedIdleTimeout"
                          type="number"
                          value={formData.preAuthenticatedIdleTimeout ?? 300}
                          onChange={(e) => setFormData({ ...formData, preAuthenticatedIdleTimeout: parseInt(e.target.value) || 300 })}
                          min="5"
                          max="999999"
                        />
                      </div>

                      {/* Post-Authenticated Idle Timeout */}
                      <div className="space-y-2">
                        <Label htmlFor="postAuthenticatedIdleTimeout" className="text-xs">Post-Authenticated idle timeout (seconds)</Label>
                        <Input
                          id="postAuthenticatedIdleTimeout"
                          type="number"
                          value={formData.postAuthenticatedIdleTimeout ?? 1800}
                          onChange={(e) => setFormData({ ...formData, postAuthenticatedIdleTimeout: parseInt(e.target.value) || 1800 })}
                          min="0"
                          max="999999"
                        />
                      </div>

                      {/* Maximum Session Duration */}
                      <div className="space-y-2">
                        <Label htmlFor="sessionTimeout" className="text-xs">Maximum session duration (seconds)</Label>
                        <Input
                          id="sessionTimeout"
                          type="number"
                          value={formData.sessionTimeout ?? 0}
                          onChange={(e) => setFormData({ ...formData, sessionTimeout: parseInt(e.target.value) || 0 })}
                          min="0"
                          max="999999"
                          placeholder="0 = unlimited"
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

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
        <ProfilePickerDialog
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

      {/* Profile Interface Assignment Dialog - for granular radio/port selection */}
      {createdServiceId && (
        <ProfileInterfaceAssignmentDialog
          open={interfaceAssignmentOpen}
          onOpenChange={(open) => {
            setInterfaceAssignmentOpen(open);
            if (!open) {
              // User cancelled - clear state
              setCreatedServiceId(null);
              setCreatedServiceName('');
            }
          }}
          serviceId={createdServiceId}
          serviceName={createdServiceName}
          onSave={handleInterfaceAssignment}
        />
      )}
    </>
  );
}
