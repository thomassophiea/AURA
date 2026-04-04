import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { AlertCircle, Save, Trash2, Wifi, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from './ui/dialog';
import { Checkbox } from './ui/checkbox';
import { Alert, AlertDescription } from './ui/alert';
import { apiService, Service, Role, Topology, AaaPolicy, ClassOfService } from '../services/api';
import { WLANAssignmentService } from '../services/wlanAssignment';
import type { Site, Profile } from '../types/network';

// Legacy manual site-grouping concept used by the WLAN assignment UI (local to this component).
// The canonical LegacySiteGroup (controller pair) lives in src/types/domain.ts.
interface LegacyLegacySiteGroup {
  id: string;
  name: string;
  description?: string;
  siteIds: string[];
  createdAt?: string;
  lastModified?: string;
  color?: string;
}
import { generateDefaultService, generatePrivacyConfig, validateServiceData } from '../utils/serviceDefaults';
import { toast } from 'sonner';

interface NetworkEditDetailProps {
  serviceId: string;
  onSave?: () => void;
  isInline?: boolean;
}

interface NetworkFormData {
  // Basic Settings
  name: string;
  ssid: string;
  description: string;
  enabled: boolean;

  // Security Configuration
  securityType: string; // open, wpa-personal, wpa2-personal, wpa3-personal, wpa-enterprise, etc.
  privacyType: string;
  authType: string;
  authMethod: string;
  encryption: string; // none, tkip, aes, tkip-aes
  passphrase: string;

  // WPA3-SAE Configuration
  pmfMode: string; // required, capable, disabled
  saeMethod: string; // SaeH2e, SaeLoop
  beaconProtection: boolean;

  // OWE (Enhanced Open)
  oweAutogen: boolean;
  oweCompanion: string;

  // Network Settings
  vlan: string;
  defaultTopology: string; // Topology UUID
  proxied: string; // Local, Centralized
  band: string;
  channel: string;
  broadcastSSID: boolean;
  hidden: boolean;

  // AAA/RADIUS
  aaaPolicyId: string;
  accountingEnabled: boolean;

  // Fast Transition (802.11r)
  fastTransitionEnabled: boolean;
  fastTransitionMdId: number;

  // Role Assignment
  authenticatedUserDefaultRoleID: string;
  unAuthenticatedUserDefaultRoleID: string;
  mbatimeoutRoleId: string;

  // 802.11k/v/r Support
  enabled11kSupport: boolean;
  rm11kBeaconReport: boolean;
  rm11kQuietIe: boolean;
  enable11mcSupport: boolean; // 802.11v

  // Band Steering
  bandSteering: boolean;
  mbo: boolean;

  // Access Control
  captivePortal: boolean;
  captivePortalType: string;
  eGuestPortalId: string;
  guestAccess: boolean;
  macBasedAuth: boolean;
  mbaAuthorization: boolean;
  macWhitelistEnabled: boolean;
  macBlacklistEnabled: boolean;

  // Client Management
  maxClients: number;
  maxClientsPer24: number;
  maxClientsPer5: number;
  sessionTimeout: number;
  preAuthenticatedIdleTimeout: number;
  postAuthenticatedIdleTimeout: number;
  idleTimeout: number; // For UI simplification
  clientToClientCommunication: boolean;
  flexibleClientAccess: boolean;
  purgeOnDisconnect: boolean;
  includeHostname: boolean;

  // Quality of Service
  defaultCoS: string; // CoS UUID
  bandwidthLimitEnabled: boolean;
  downloadLimit: number;
  uploadLimit: number;
  priorityLevel: string;
  uapsdEnabled: boolean;
  admissionControlVideo: boolean;
  admissionControlVoice: boolean;
  admissionControlBestEffort: boolean;
  admissionControlBackgroundTraffic: boolean;

  // Hotspot 2.0
  hotspotType: string; // Disabled, Hotspot20
  hotspot: boolean; // For UI toggle

  // Roaming
  roamingAssistPolicy: string;

  // Vendor Attributes
  vendorSpecificAttributes: string[]; // ["apName", "vnsName", "ssid"]

  // Mesh
  shutdownOnMeshpointLoss: boolean;

  // Advanced Settings
  defaultAuthRole: string; // Legacy field
  isolateClients: boolean; // Maps to !clientToClientCommunication
  fastRoaming: boolean; // Legacy field
  loadBalancing: boolean; // Legacy field
  radiusAccounting: boolean; // Maps to accountingEnabled
  customProperties: Record<string, string>;
}

export function NetworkEditDetail({ serviceId, onSave, isInline = false }: NetworkEditDetailProps) {
  const [service, setService] = useState<Service | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [topologies, setTopologies] = useState<Topology[]>([]);
  const [aaaPolicies, setAaaPolicies] = useState<AaaPolicy[]>([]);
  const [cosOptions, setCosOptions] = useState<ClassOfService[]>([]);
  const [eGuestProfiles, setEGuestProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('basic');
  
  // Site Assignment State
  const [sites, setSites] = useState<Site[]>([]);
  const [siteGroups, setLegacySiteGroups] = useState<LegacySiteGroup[]>([]);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [selectedLegacySiteGroups, setSelectedLegacySiteGroups] = useState<string[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [assigningSites, setAssigningSites] = useState(false);
  const [profilesBySite, setProfilesBySite] = useState<Map<string, Profile[]>>(new Map());
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [bottomTab, setBottomTab] = useState('advanced');
  const [formData, setFormData] = useState<NetworkFormData>({
    // Basic Settings
    name: '',
    ssid: '',
    description: '',
    enabled: true,

    // Security Configuration
    securityType: 'open',
    privacyType: '',
    authType: '',
    authMethod: '',
    encryption: 'none',
    passphrase: '',

    // WPA3-SAE Configuration
    pmfMode: 'disabled',
    saeMethod: 'SaeH2e',
    beaconProtection: false,

    // OWE (Enhanced Open)
    oweAutogen: false,
    oweCompanion: '',

    // Network Settings
    vlan: '',
    defaultTopology: '',
    proxied: 'Local',
    band: 'both',
    channel: 'auto',
    broadcastSSID: true,
    hidden: false,

    // AAA/RADIUS
    aaaPolicyId: '',
    accountingEnabled: false,

    // Fast Transition (802.11r)
    fastTransitionEnabled: false,
    fastTransitionMdId: 0,

    // Role Assignment
    authenticatedUserDefaultRoleID: '',
    unAuthenticatedUserDefaultRoleID: '',
    mbatimeoutRoleId: '',

    // 802.11k/v/r Support
    enabled11kSupport: false,
    rm11kBeaconReport: false,
    rm11kQuietIe: false,
    enable11mcSupport: false,

    // Band Steering
    bandSteering: false,
    mbo: false,

    // Access Control
    captivePortal: false,
    captivePortalType: '',
    eGuestPortalId: '',
    guestAccess: false,
    macBasedAuth: false,
    mbaAuthorization: false,
    macWhitelistEnabled: false,
    macBlacklistEnabled: false,

    // Client Management
    maxClients: 100,
    maxClientsPer24: 50,
    maxClientsPer5: 50,
    sessionTimeout: 0,
    preAuthenticatedIdleTimeout: 300,
    postAuthenticatedIdleTimeout: 1800,
    idleTimeout: 0,
    clientToClientCommunication: true,
    flexibleClientAccess: false,
    purgeOnDisconnect: false,
    includeHostname: false,

    // Quality of Service
    defaultCoS: '',
    bandwidthLimitEnabled: false,
    downloadLimit: 0,
    uploadLimit: 0,
    priorityLevel: 'normal',
    uapsdEnabled: true,
    admissionControlVideo: false,
    admissionControlVoice: false,
    admissionControlBestEffort: false,
    admissionControlBackgroundTraffic: false,

    // Hotspot 2.0
    hotspotType: 'Disabled',
    hotspot: false,

    // Roaming
    roamingAssistPolicy: '',

    // Vendor Attributes
    vendorSpecificAttributes: ['apName', 'vnsName', 'ssid'],

    // Mesh
    shutdownOnMeshpointLoss: false,

    // Schedule
    enabledSchedule: null as any,

    // Advanced Settings (Legacy)
    defaultAuthRole: 'none',
    isolateClients: false,
    fastRoaming: false,
    loadBalancing: false,
    radiusAccounting: false,
    customProperties: {}
  });

  useEffect(() => {
    loadNetworkData();
  }, [serviceId]);

  const loadNetworkData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all data sources in parallel — use nametoidmap for dropdown-only data
      const [serviceResponse, rolesResponse, topologiesResponse, aaaPoliciesResponse, cosResponse, eGuestResponse] = await Promise.allSettled([
        apiService.getServiceById(serviceId),
        apiService.getRoleNameToIdMap(),
        apiService.getTopologyNameToIdMap(),
        apiService.getAaaPolicyNameToIdMap(),
        apiService.getCoSNameToIdMap(),
        apiService.getEGuestNameToIdMap()
      ]);

      if (serviceResponse.status === 'fulfilled') {
        const serviceData = serviceResponse.value;
        setService(serviceData);

        console.log('Loading service data:', serviceData);

        // Get WPA3-SAE configuration
        const saeElement = serviceData.privacy?.WpaSaeElement || serviceData.WpaSaeElement;
        const pskElement = serviceData.privacy?.WpaPskElement || serviceData.WpaPskElement;
        const enterpriseElement = serviceData.privacy?.WpaEnterpriseElement || serviceData.WpaEnterpriseElement;

        // Detect security type from privacy elements
        let detectedSecurityType = 'open';
        let detectedEncryption = '';

        if (pskElement) {
          detectedSecurityType = 'wpa2-personal';
          detectedEncryption = pskElement.mode === 'aesOnly' ? 'aes' :
                              pskElement.mode === 'tkipOnly' ? 'tkip' :
                              pskElement.mode === 'mixed' ? 'tkip-aes' : 'aes';
        } else if (saeElement) {
          detectedSecurityType = 'wpa3-personal';
          detectedEncryption = 'aes';
        } else if (enterpriseElement) {
          const pmfRequired = enterpriseElement.pmfMode === 'required';
          detectedSecurityType = pmfRequired ? 'wpa3-enterprise' : 'wpa2-enterprise';
          detectedEncryption = enterpriseElement.mode === 'aesOnly' ? 'aes' :
                              enterpriseElement.mode === 'tkipOnly' ? 'tkip' :
                              enterpriseElement.mode === 'mixed' ? 'tkip-aes' : 'aes';
        }

        // Map service data to comprehensive form data with ALL Extreme Platform ONE fields
        const mappedFormData = {
          // Basic Settings
          name: serviceData.serviceName || serviceData.name || serviceData.ssid || 'Unnamed Network',
          ssid: serviceData.ssid || serviceData.name || '',
          description: serviceData.description || '',
          enabled: serviceData.enabled !== false && serviceData.status !== 'disabled',

          // Security Configuration
          securityType: detectedSecurityType,
          privacyType: serviceData.security?.privacyType || serviceData.privacyType || '',
          authType: serviceData.security?.authType || serviceData.authType || '',
          authMethod: serviceData.security?.authMethod || serviceData.authMethod || '',
          encryption: detectedEncryption || serviceData.security?.encryption || serviceData.encryption || '',
          passphrase: pskElement?.presharedKey || saeElement?.presharedKey || serviceData.security?.passphrase || serviceData.passphrase || '',

          // WPA3-SAE Configuration
          pmfMode: saeElement?.pmfMode || pskElement?.pmfMode || enterpriseElement?.pmfMode || 'disabled',
          saeMethod: saeElement?.saeMethod || 'SaeH2e',
          beaconProtection: serviceData.beaconProtection || false,

          // OWE (Enhanced Open)
          oweAutogen: serviceData.oweAutogen || false,
          oweCompanion: serviceData.oweCompanion || 'none',

          // Network Settings
          vlan: (serviceData.vlan || serviceData.dot1dPortNumber || '').toString(),
          defaultTopology: serviceData.defaultTopology || 'none',
          proxied: serviceData.proxied || 'Local',
          band: serviceData.band || 'both',
          channel: serviceData.channel?.toString() || 'auto',
          broadcastSSID: !serviceData.suppressSsid && serviceData.broadcastSSID !== false,
          hidden: serviceData.suppressSsid || serviceData.hidden || false,

          // AAA/RADIUS
          aaaPolicyId: serviceData.aaaPolicyId || 'none',
          accountingEnabled: serviceData.accountingEnabled || false,

          // Fast Transition (802.11r)
          fastTransitionEnabled: enterpriseElement?.fastTransitionEnabled || false,
          fastTransitionMdId: enterpriseElement?.fastTransitionMdId || 0,

          // Role Assignment
          authenticatedUserDefaultRoleID: serviceData.authenticatedUserDefaultRoleID || 'none',
          unAuthenticatedUserDefaultRoleID: serviceData.unAuthenticatedUserDefaultRoleID || 'none',
          mbatimeoutRoleId: serviceData.mbatimeoutRoleId || 'none',

          // 802.11k/v/r Support
          enabled11kSupport: serviceData.enabled11kSupport || false,
          rm11kBeaconReport: serviceData.rm11kBeaconReport || false,
          rm11kQuietIe: serviceData.rm11kQuietIe || false,
          enable11mcSupport: serviceData.enable11mcSupport || false,

          // Band Steering
          bandSteering: serviceData.bandSteering || false,
          mbo: serviceData.mbo || false,

          // Access Control
          captivePortal: serviceData.captivePortal || serviceData.enableCaptivePortal || false,
          captivePortalType: serviceData.captivePortalType || 'none',
          eGuestPortalId: serviceData.eGuestPortalId || 'none',
          guestAccess: serviceData.guestAccess || false,
          macBasedAuth: serviceData.macBasedAuth || false,
          mbaAuthorization: serviceData.mbaAuthorization || false,
          macWhitelistEnabled: serviceData.macWhitelistEnabled || false,
          macBlacklistEnabled: serviceData.macBlacklistEnabled || false,

          // Client Management
          maxClients: serviceData.maxClients || 100,
          maxClientsPer24: serviceData.maxClientsPer24 || 50,
          maxClientsPer5: serviceData.maxClientsPer5 || 50,
          sessionTimeout: serviceData.sessionTimeout || 0,
          preAuthenticatedIdleTimeout: serviceData.preAuthenticatedIdleTimeout || 300,
          postAuthenticatedIdleTimeout: serviceData.postAuthenticatedIdleTimeout || 1800,
          idleTimeout: serviceData.idleTimeout || 0,
          clientToClientCommunication: serviceData.clientToClientCommunication !== false,
          flexibleClientAccess: serviceData.flexibleClientAccess || false,
          purgeOnDisconnect: serviceData.purgeOnDisconnect || false,
          includeHostname: serviceData.includeHostname || false,

          // Quality of Service
          defaultCoS: serviceData.defaultCoS || 'none',
          bandwidthLimitEnabled: serviceData.bandwidthLimitEnabled || false,
          downloadLimit: serviceData.downloadLimit || 0,
          uploadLimit: serviceData.uploadLimit || 0,
          priorityLevel: serviceData.priorityLevel || 'normal',
          uapsdEnabled: serviceData.uapsdEnabled !== false,
          admissionControlVideo: serviceData.admissionControlVideo || false,
          admissionControlVoice: serviceData.admissionControlVoice || false,
          admissionControlBestEffort: serviceData.admissionControlBestEffort || false,
          admissionControlBackgroundTraffic: serviceData.admissionControlBackgroundTraffic || false,

          // Hotspot 2.0
          hotspotType: serviceData.hotspotType || 'Disabled',
          hotspot: serviceData.hotspotType !== 'Disabled' && serviceData.hotspotType !== undefined,

          // Roaming
          roamingAssistPolicy: serviceData.roamingAssistPolicy || 'none',

          // Vendor Attributes
          vendorSpecificAttributes: serviceData.vendorSpecificAttributes || ['apName', 'vnsName', 'ssid'],

          // Mesh
          shutdownOnMeshpointLoss: serviceData.shutdownOnMeshpointLoss || false,
          enabledSchedule: serviceData.enabledSchedule || null,

          // Advanced Settings (Legacy fields for backward compatibility)
          defaultAuthRole: serviceData.defaultAuthRole || 'none',
          isolateClients: !serviceData.clientToClientCommunication,
          fastRoaming: enterpriseElement?.fastTransitionEnabled || false,
          loadBalancing: serviceData.loadBalancing || false,
          radiusAccounting: serviceData.accountingEnabled || false,
          customProperties: serviceData.customProperties || {}
        };

        console.log('Mapped form data:', mappedFormData);
        setFormData(mappedFormData);
      } else {
        throw new Error('Failed to load service details');
      }

      // Convert name-to-id maps into {id, name} arrays for dropdown rendering
      const mapToArray = (map: Record<string, string>) =>
        Object.entries(map).map(([name, id]) => ({ id, name }));

      if (rolesResponse.status === 'fulfilled') {
        setRoles(mapToArray(rolesResponse.value));
      } else {
        setRoles([]);
      }

      if (topologiesResponse.status === 'fulfilled') {
        setTopologies(mapToArray(topologiesResponse.value));
      } else {
        setTopologies([]);
      }

      if (aaaPoliciesResponse.status === 'fulfilled') {
        setAaaPolicies(mapToArray(aaaPoliciesResponse.value));
      } else {
        setAaaPolicies([]);
      }

      if (cosResponse.status === 'fulfilled') {
        setCosOptions(mapToArray(cosResponse.value));
      } else {
        setCosOptions([]);
      }

      if (eGuestResponse.status === 'fulfilled') {
        const val = eGuestResponse.value;
        setEGuestProfiles(typeof val === 'object' && !Array.isArray(val) ? mapToArray(val) : []);
      } else {
        setEGuestProfiles([]);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load network data';
      setError(errorMessage);
      toast.error('Failed to load network data', {
        description: errorMessage
      });
    } finally {
      setLoading(false);
    }
  };

  // Load sites and site groups for assignment
  const loadSitesData = async () => {
    setLoadingSites(true);
    try {
      const [sitesResponse, savedGroups] = await Promise.all([
        apiService.getSites(),
        Promise.resolve(localStorage.getItem('siteGroups'))
      ]);
      
      setSites(sitesResponse);
      
      if (savedGroups) {
        try {
          setLegacySiteGroups(JSON.parse(savedGroups));
        } catch {
          setLegacySiteGroups([]);
        }
      }
    } catch (err) {
      console.error('Failed to load sites:', err);
    } finally {
      setLoadingSites(false);
    }
  };

  // Discover profiles for selected sites
  const discoverProfilesForSites = async (siteIds: string[]) => {
    if (siteIds.length === 0) {
      setProfilesBySite(new Map());
      return;
    }

    try {
      const assignmentService = new WLANAssignmentService();
      const profileMap = await assignmentService.discoverProfilesForSites(siteIds);
      
      const newProfilesBySite = new Map<string, Profile[]>();
      for (const siteId of siteIds) {
        newProfilesBySite.set(siteId, profileMap[siteId] || []);
      }
      setProfilesBySite(newProfilesBySite);
    } catch (err) {
      console.error('Failed to discover profiles:', err);
    }
  };

  // Get all site IDs including those from site groups
  const getExpandedSiteIds = (): string[] => {
    const siteIdsFromGroups = selectedLegacySiteGroups.flatMap(groupId => {
      const group = siteGroups.find(g => g.id === groupId);
      return group?.siteIds || [];
    });
    return [...new Set([...selectedSites, ...siteIdsFromGroups])];
  };

  // Toggle site selection
  const toggleSite = (siteId: string) => {
    setSelectedSites(prev => 
      prev.includes(siteId) 
        ? prev.filter(id => id !== siteId)
        : [...prev, siteId]
    );
  };

  // Toggle site group selection
  const toggleLegacySiteGroup = (groupId: string) => {
    setSelectedLegacySiteGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  // Assign WLAN to selected sites
  const handleAssignToSites = async () => {
    const expandedSiteIds = getExpandedSiteIds();
    if (expandedSiteIds.length === 0) {
      toast.error('Please select at least one site or site group');
      return;
    }

    setAssigningSites(true);
    try {
      const assignmentService = new WLANAssignmentService();
      
      // Discover profiles for all selected sites
      const profileMap = await assignmentService.discoverProfilesForSites(expandedSiteIds);
      const allProfiles = Object.values(profileMap).flat();
      
      // Deduplicate profiles
      const uniqueProfiles = allProfiles.filter((profile, index, self) =>
        index === self.findIndex(p => p.id === profile.id)
      );

      if (uniqueProfiles.length === 0) {
        toast.error('No profiles found at selected sites', {
          description: 'Ensure sites have device groups with profiles configured'
        });
        return;
      }

      // Assign to each profile
      let successCount = 0;
      let failCount = 0;
      
      for (const profile of uniqueProfiles) {
        try {
          await apiService.assignServiceToProfile(serviceId, profile.id);
          successCount++;
        } catch (err) {
          console.error(`Failed to assign to profile ${profile.id}:`, err);
          failCount++;
        }
      }

      // Sync profiles
      for (const profile of uniqueProfiles) {
        try {
          await apiService.syncProfile(profile.id);
        } catch (err) {
          console.error(`Failed to sync profile ${profile.id}:`, err);
        }
      }

      if (successCount > 0) {
        toast.success(`Assigned to ${successCount} profile(s)`, {
          description: failCount > 0 ? `${failCount} failed` : `Across ${expandedSiteIds.length} site(s)`
        });
      } else {
        toast.error('Failed to assign to any profiles');
      }
    } catch (err) {
      console.error('Assignment failed:', err);
      toast.error('Failed to assign WLAN to sites');
    } finally {
      setAssigningSites(false);
    }
  };

  // Load sites when Sites tab is activated
  useEffect(() => {
    if (activeTab === 'sites' && sites.length === 0) {
      loadSitesData();
    }
  }, [activeTab]);

  // Discover profiles when site selection changes
  useEffect(() => {
    const expandedSites = getExpandedSiteIds();
    if (expandedSites.length > 0 && activeTab === 'sites') {
      discoverProfilesForSites(expandedSites);
    }
  }, [selectedSites, selectedLegacySiteGroups, activeTab]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      if (!service) {
        throw new Error('Service data not loaded');
      }

      // Validate required fields
      if (!formData.name || !formData.name.trim()) {
        throw new Error('Network name is required');
      }
      if (!formData.ssid || !formData.ssid.trim()) {
        throw new Error('SSID is required');
      }

      console.log('=== SERVICE UPDATE DEBUG INFO ===');
      console.log('Service ID:', serviceId);
      console.log('Form data to save:', formData);

      // === CONSTRUCT PRIVACY CONFIGURATION ===
      let privacyConfig = service.privacy;

      // Build privacy object based on security type
      if (formData.securityType === 'wpa3-personal' || formData.securityType === 'wpa23-personal') {
        // WPA3-SAE (Simultaneous Authentication of Equals)
        privacyConfig = {
          type: formData.securityType === 'wpa3-personal' ? 'WPA3-SAE' : 'WPA2/3-SAE',
          WpaSaeElement: {
            pmfMode: formData.pmfMode,
            saeMethod: formData.saeMethod,
            presharedKey: formData.passphrase || service.privacy?.WpaSaeElement?.presharedKey || '',
            keyHexEncoded: false,
            encryption: formData.encryption === 'aes' ? 'AES' : formData.encryption === 'tkip-aes' ? 'TKIP_AES' : 'AES',
            akmSuiteSelector: 'SAE'
          }
        };
      } else if (formData.securityType === 'wpa2-personal' || formData.securityType === 'wpa-personal') {
        // WPA2-Personal (PSK)
        privacyConfig = {
          type: formData.securityType === 'wpa2-personal' ? 'WPA2' : 'WPA',
          WpaPskElement: {
            mode: formData.securityType === 'wpa2-personal' ? 'WPA2' : 'WPA',
            pmfMode: formData.pmfMode || 'disabled',
            presharedKey: formData.passphrase || service.privacy?.WpaPskElement?.presharedKey || '',
            keyHexEncoded: false,
            encryption: formData.encryption === 'aes' ? 'AES' : formData.encryption === 'tkip' ? 'TKIP' : formData.encryption === 'tkip-aes' ? 'TKIP_AES' : 'AES'
          }
        };
      } else if (formData.securityType.includes('enterprise')) {
        // WPA-Enterprise / WPA2-Enterprise / WPA3-Enterprise
        const mode = formData.securityType === 'wpa3-enterprise' ? 'WPA3' :
                     formData.securityType === 'wpa2-enterprise' ? 'WPA2' :
                     formData.securityType === 'wpa23-enterprise' ? 'WPA2/3' : 'WPA';

        privacyConfig = {
          type: mode,
          WpaEnterpriseElement: {
            mode: mode,
            pmfMode: formData.pmfMode || (formData.securityType === 'wpa3-enterprise' ? 'required' : 'disabled'),
            encryption: formData.encryption === 'aes' ? 'AES' : formData.encryption === 'tkip' ? 'TKIP' : formData.encryption === 'tkip-aes' ? 'TKIP_AES' : 'AES',
            fastTransitionEnabled: formData.fastTransitionEnabled,
            fastTransitionMdId: formData.fastTransitionMdId || 0
          }
        };
      } else if (formData.securityType === 'owe') {
        // OWE (Opportunistic Wireless Encryption)
        privacyConfig = {
          type: 'OWE',
          OweElement: {
            encryption: 'AES'
          }
        };
      } else if (formData.securityType === 'open') {
        // Open network
        privacyConfig = {
          type: 'Open'
        };
      } else if (formData.passphrase && formData.passphrase.trim()) {
        // Fallback: use existing privacy config generator
        privacyConfig = generatePrivacyConfig(formData.securityType, formData.passphrase);
      }

      console.log('Generated privacy config:', privacyConfig);

      // === BUILD COMPLETE SERVICE PAYLOAD ===
      const completeServiceData: Partial<Service> = {
        ...generateDefaultService(), // Start with all defaults
        ...service, // Overlay existing service data to preserve everything

        // === BASIC SETTINGS ===
        id: serviceId,
        serviceName: formData.name.trim(),
        ssid: formData.ssid.trim(),
        status: formData.enabled ? 'enabled' : 'disabled',
        enabled: formData.enabled,
        description: formData.description?.trim() || '',

        // === SECURITY CONFIGURATION ===
        privacy: privacyConfig,
        suppressSsid: formData.hidden,

        // WPA3-SAE specific fields
        beaconProtection: formData.beaconProtection,

        // OWE specific fields
        oweAutogen: formData.oweAutogen,
        oweCompanion: formData.oweCompanion === 'none' ? null : formData.oweCompanion,

        // === AAA/RADIUS CONFIGURATION ===
        aaaPolicyId: formData.aaaPolicyId === 'none' ? null : formData.aaaPolicyId,
        accountingEnabled: formData.accountingEnabled,

        // === ROLE ASSIGNMENT ===
        authenticatedUserDefaultRoleID: formData.authenticatedUserDefaultRoleID || 'none',
        unAuthenticatedUserDefaultRoleID: formData.unAuthenticatedUserDefaultRoleID || 'none',
        mbatimeoutRoleId: formData.mbatimeoutRoleId === 'none' ? null : formData.mbatimeoutRoleId,

        // === NETWORK SETTINGS ===
        defaultTopology: formData.defaultTopology === 'none' ? null : formData.defaultTopology,
        proxied: formData.proxied,
        vlan: formData.vlan ? parseInt(formData.vlan) : undefined,
        band: formData.band,
        channel: formData.channel === 'auto' ? undefined : parseInt(formData.channel),

        // === 802.11k/v/r SUPPORT ===
        enabled11kSupport: formData.enabled11kSupport,
        rm11kBeaconReport: formData.rm11kBeaconReport,
        rm11kQuietIe: formData.rm11kQuietIe,
        enable11mcSupport: formData.enable11mcSupport,

        // === BAND STEERING ===
        bandSteering: formData.bandSteering,
        mbo: formData.mbo,

        // === QUALITY OF SERVICE ===
        defaultCoS: formData.defaultCoS === 'none' ? null : formData.defaultCoS,
        bandwidthLimitEnabled: formData.bandwidthLimitEnabled,
        downloadLimit: formData.bandwidthLimitEnabled ? formData.downloadLimit : 0,
        uploadLimit: formData.bandwidthLimitEnabled ? formData.uploadLimit : 0,
        uapsdEnabled: formData.uapsdEnabled,
        admissionControlVideo: formData.admissionControlVideo,
        admissionControlVoice: formData.admissionControlVoice,
        admissionControlBestEffort: formData.admissionControlBestEffort,
        admissionControlBackgroundTraffic: formData.admissionControlBackgroundTraffic,

        // === CAPTIVE PORTAL & HOTSPOT ===
        captivePortal: formData.captivePortal,
        enableCaptivePortal: formData.captivePortal,
        captivePortalType: formData.captivePortalType || '',
        eGuestPortalId: formData.eGuestPortalId || '',
        hotspotType: formData.hotspotType,

        // === ACCESS CONTROL ===
        guestAccess: formData.guestAccess,
        macBasedAuth: formData.macBasedAuth,
        mbaAuthorization: formData.mbaAuthorization,

        // === CLIENT MANAGEMENT ===
        maxClients: formData.maxClients,
        maxClientsPer24: formData.maxClientsPer24,
        maxClientsPer5: formData.maxClientsPer5,
        sessionTimeout: formData.sessionTimeout,
        preAuthenticatedIdleTimeout: formData.preAuthenticatedIdleTimeout,
        postAuthenticatedIdleTimeout: formData.postAuthenticatedIdleTimeout,
        clientToClientCommunication: formData.clientToClientCommunication,
        flexibleClientAccess: formData.flexibleClientAccess,
        purgeOnDisconnect: formData.purgeOnDisconnect,
        includeHostname: formData.includeHostname,

        // === ROAMING & OPTIMIZATION ===
        roamingAssistPolicy: formData.roamingAssistPolicy === 'none' ? null : formData.roamingAssistPolicy,
        loadBalancing: formData.loadBalancing,

        // === RADIUS VENDOR ATTRIBUTES ===
        vendorSpecificAttributes: formData.vendorSpecificAttributes,

        // === MESH SETTINGS ===
        shutdownOnMeshpointLoss: formData.shutdownOnMeshpointLoss,
        enabledSchedule: formData.enabledSchedule,
      };

      // Remove undefined values to avoid API issues
      Object.keys(completeServiceData).forEach(key => {
        if (completeServiceData[key as keyof Service] === undefined) {
          delete completeServiceData[key as keyof Service];
        }
      });

      console.log('=== COMPLETE SERVICE PAYLOAD ===');
      console.log(JSON.stringify(completeServiceData, null, 2));

      // Validate the complete payload
      const validation = validateServiceData(completeServiceData);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Send the complete service update
      const updatedService = await apiService.updateService(serviceId, completeServiceData);
      console.log('Service update successful!');

      // Update local service state with response
      setService(updatedService);

      toast.success('Network configuration saved successfully', {
        description: `Settings for ${formData.name} have been updated with all controller features.`
      });

      // Call onSave callback to refresh parent component
      if (onSave) {
        onSave();
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save network configuration';
      setError(errorMessage);

      // Enhanced error logging for debugging
      console.error('=== COMPREHENSIVE ERROR ANALYSIS ===');
      console.error('Error message:', errorMessage);
      console.error('Error type:', typeof err);
      console.error('Error constructor:', err?.constructor?.name);
      console.error('Service ID:', serviceId);
      console.error('Original service structure:', Object.keys(service || {}));
      console.error('Form data structure:', formData);

      // Log specific Extreme Platform ONE API expectations
      console.error('Extreme Platform ONE API debugging hints:');
      console.error('- Check if service ID exists:', serviceId);
      console.error('- Verify field names match API expectations');
      console.error('- Check for required fields that might be missing');
      console.error('- Privacy object structure:', service.privacy);
      console.error('- Security type:', formData.securityType);

      if (err && typeof err === 'object') {
        console.error('Error object properties:', Object.getOwnPropertyNames(err));
        console.error('Error object values:', Object.fromEntries(
          Object.getOwnPropertyNames(err).map(prop => [prop, (err as any)[prop]])
        ));
      }

      // Provide actionable error message to user
      let userFriendlyError = errorMessage;
      if (errorMessage.includes('422')) {
        userFriendlyError = 'Validation failed. The controller rejected the update. Check that all field values are valid (e.g., valid VLAN range, proper passphrase length, valid UUIDs for roles/topologies).';
      } else if (errorMessage.includes('404')) {
        userFriendlyError = 'Service not found. The network configuration may have been deleted by another user.';
      } else if (errorMessage.includes('403')) {
        userFriendlyError = 'Access denied. You may not have permission to modify this network configuration.';
      }

      toast.error('Failed to save network configuration', {
        description: userFriendlyError,
        duration: 10000 // Longer duration for error messages
      });
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof NetworkFormData, value: string | boolean | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  // Helper: is this an enterprise auth type?
  const isEnterprise = ['wpa2-enterprise', 'wpa3-enterprise', 'wpa23-enterprise'].includes(formData.securityType);
  // Helper: is this a PSK auth type that needs passphrase config?
  const isPsk = ['wep', 'wpa-personal', 'wpa2-personal', 'wpa3-personal', 'wpa3-compatibility'].includes(formData.securityType);
  // Helper: show 6E WPA Compliance badge?
  const show6eBadge = ['owe', 'wpa3-personal', 'wpa3-enterprise', 'wpa3-compatibility', 'wpa23-enterprise'].includes(formData.securityType);

  return (
    <div className={isInline ? 'p-0' : 'p-6'}>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ========== TOP BAR ========== */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Wifi className="h-5 w-5" />
          Edit WLAN
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" disabled={saving}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* ========== MAIN FORM (single scrollable column, label-left input-right) ========== */}
      <div className="space-y-5 max-w-3xl">

        {/* Network Name */}
        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label htmlFor="network-name" className="text-sm font-medium text-right">Network Name</Label>
          <Input
            id="network-name"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="Enter network name"
          />
        </div>

        {/* SSID */}
        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label htmlFor="ssid" className="text-sm font-medium text-right">SSID</Label>
          <Input
            id="ssid"
            value={formData.ssid}
            onChange={(e) => handleInputChange('ssid', e.target.value)}
            placeholder="Enter SSID"
          />
        </div>

        {/* Status */}
        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label className="text-sm font-medium text-right">Status</Label>
          <Select
            value={formData.enabled ? 'enabled' : 'disabled'}
            onValueChange={(v) => handleInputChange('enabled', v === 'enabled')}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="enabled">Enabled</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Hotspot */}
        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label className="text-sm font-medium text-right">Hotspot</Label>
          <Select
            value={formData.hotspot ? 'enabled' : 'disabled'}
            onValueChange={(v) => {
              handleInputChange('hotspot', v === 'enabled');
              handleInputChange('hotspotType', v === 'enabled' ? 'Hotspot20' : 'Disabled');
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="disabled">Disabled</SelectItem>
              <SelectItem value="enabled">Enabled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Auth Type + Edit Privacy button + 6E badge */}
        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label className="text-sm font-medium text-right">Auth Type</Label>
          <div className="flex items-center gap-2">
            <Select
              value={formData.securityType}
              onValueChange={(v) => handleInputChange('securityType', v)}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="owe">OWE (Enhanced Open)</SelectItem>
                <SelectItem value="wep">WEP</SelectItem>
                <SelectItem value="wpa-personal">WPA-Personal</SelectItem>
                <SelectItem value="wpa2-personal">WPA2-Personal</SelectItem>
                <SelectItem value="wpa3-personal">WPA3-Personal</SelectItem>
                <SelectItem value="wpa3-compatibility">WPA3-Compatibility</SelectItem>
                <SelectItem value="wpa2-enterprise">WPA2-Enterprise</SelectItem>
                <SelectItem value="wpa3-enterprise">WPA3-Enterprise</SelectItem>
                <SelectItem value="wpa23-enterprise">WPA2/3-Enterprise</SelectItem>
              </SelectContent>
            </Select>

            {/* Edit Privacy button (for PSK types) */}
            {isPsk && (
              <Dialog open={privacyDialogOpen} onOpenChange={setPrivacyDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Lock className="h-3.5 w-3.5 mr-1" />
                    Edit Privacy
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Privacy Settings</DialogTitle>
                    <DialogDescription>Configure passphrase and encryption for this WLAN.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {/* Passphrase */}
                    <div className="space-y-2">
                      <Label htmlFor="passphrase">Passphrase</Label>
                      <div className="relative">
                        <Input
                          id="passphrase"
                          type={showPassphrase ? 'text' : 'password'}
                          value={formData.passphrase}
                          onChange={(e) => handleInputChange('passphrase', e.target.value)}
                          placeholder="Enter passphrase"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowPassphrase(!showPassphrase)}
                        >
                          {showPassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formData.securityType === 'wep' ? '10 or 26 hex characters' : '8-63 characters'}
                      </p>
                    </div>

                    {/* Encryption */}
                    <div className="space-y-2">
                      <Label>Encryption</Label>
                      <Select
                        value={formData.encryption}
                        onValueChange={(v) => handleInputChange('encryption', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {formData.securityType === 'wep' ? (
                            <SelectItem value="wep">WEP</SelectItem>
                          ) : (
                            <>
                              <SelectItem value="aes">AES (CCMP)</SelectItem>
                              <SelectItem value="tkip">TKIP</SelectItem>
                              <SelectItem value="tkip-aes">TKIP + AES</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* PMF Mode */}
                    <div className="space-y-2">
                      <Label>Protected Management Frames (PMF)</Label>
                      <Select
                        value={formData.pmfMode}
                        onValueChange={(v) => handleInputChange('pmfMode', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disabled">Disabled</SelectItem>
                          <SelectItem value="capable">Capable (Optional)</SelectItem>
                          <SelectItem value="required">Required</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button>Apply</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {/* 6E WPA Compliance badge */}
            {show6eBadge && (
              <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50 dark:bg-green-950/30">
                6E WPA Compliance
              </Badge>
            )}
          </div>
        </div>

        {/* Enable Captive Portal */}
        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label className="text-sm font-medium text-right">Enable Captive Portal</Label>
          <div className="flex items-center gap-2">
            <Checkbox
              id="captive-portal"
              checked={formData.captivePortal}
              onCheckedChange={(v) => handleInputChange('captivePortal', !!v)}
            />
            <Label htmlFor="captive-portal" className="text-sm cursor-pointer">
              {formData.captivePortal ? 'Enabled' : 'Disabled'}
            </Label>
          </div>
        </div>

        {/* Captive Portal Type (only when captive portal enabled) */}
        {formData.captivePortal && (
          <>
            <div className="grid grid-cols-[200px_1fr] items-center gap-4">
              <Label className="text-sm font-medium text-right">Portal Type</Label>
              <Select
                value={formData.captivePortalType || 'none'}
                onValueChange={(v) => handleInputChange('captivePortalType', v)}
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="eGuest">eGuest</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.captivePortalType === 'eGuest' && eGuestProfiles.length > 0 && (
              <div className="grid grid-cols-[200px_1fr] items-center gap-4">
                <Label className="text-sm font-medium text-right">eGuest Profile</Label>
                <Select
                  value={formData.eGuestPortalId || 'none'}
                  onValueChange={(v) => handleInputChange('eGuestPortalId', v)}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {eGuestProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}

        {/* MAC-based Authentication (MBA) */}
        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label className="text-sm font-medium text-right">MAC-based Auth (MBA)</Label>
          <div className="flex items-center gap-2">
            <Checkbox
              id="mac-auth"
              checked={formData.macBasedAuth}
              onCheckedChange={(v) => handleInputChange('macBasedAuth', !!v)}
            />
            <Label htmlFor="mac-auth" className="text-sm cursor-pointer">
              {formData.macBasedAuth ? 'Enabled' : 'Disabled'}
            </Label>
          </div>
        </div>

        <Separator className="my-4" />

        {/* ========== ENTERPRISE-ONLY SECTION ========== */}
        {isEnterprise && (
          <div className="space-y-5">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Enterprise AAA Configuration</h3>

            {/* AAA Policy */}
            <div className="grid grid-cols-[200px_1fr] items-center gap-4">
              <Label className="text-sm font-medium text-right">AAA Policy</Label>
              <Select
                value={formData.aaaPolicyId || 'none'}
                onValueChange={(v) => handleInputChange('aaaPolicyId', v)}
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {aaaPolicies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Authentication Method */}
            <div className="grid grid-cols-[200px_1fr] items-center gap-4">
              <Label className="text-sm font-medium text-right">Authentication Method</Label>
              <Select
                value={formData.authMethod || 'radius'}
                onValueChange={(v) => handleInputChange('authMethod', v)}
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="radius">RADIUS</SelectItem>
                  <SelectItem value="ldap">LDAP</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Default AAA Auth Method */}
            <div className="grid grid-cols-[200px_1fr] items-center gap-4">
              <Label className="text-sm font-medium text-right">Default AAA Auth Method</Label>
              <Input value="RADIUS" disabled className="w-64 bg-muted" />
            </div>

            {/* Encryption (Enterprise) */}
            <div className="grid grid-cols-[200px_1fr] items-center gap-4">
              <Label className="text-sm font-medium text-right">Encryption</Label>
              <Select
                value={formData.encryption || 'aes'}
                onValueChange={(v) => handleInputChange('encryption', v)}
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aes">AES (CCMP)</SelectItem>
                  <SelectItem value="tkip">TKIP</SelectItem>
                  <SelectItem value="tkip-aes">TKIP + AES</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* PMF (Enterprise) */}
            <div className="grid grid-cols-[200px_1fr] items-center gap-4">
              <Label className="text-sm font-medium text-right">PMF Mode</Label>
              <Select
                value={formData.pmfMode || 'disabled'}
                onValueChange={(v) => handleInputChange('pmfMode', v)}
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="capable">Capable (Optional)</SelectItem>
                  <SelectItem value="required">Required</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Fast Transition */}
            <div className="grid grid-cols-[200px_1fr] items-center gap-4">
              <Label className="text-sm font-medium text-right">Fast Transition (802.11r)</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.fastTransitionEnabled}
                  onCheckedChange={(v) => handleInputChange('fastTransitionEnabled', v)}
                />
                <span className="text-sm text-muted-foreground">{formData.fastTransitionEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>

            <Separator className="my-2" />
          </div>
        )}

        {/* ========== DEFAULT AUTH ROLE & VLAN (always shown) ========== */}
        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label className="text-sm font-medium text-right">Default Auth Role</Label>
          <Select
            value={formData.authenticatedUserDefaultRoleID || 'none'}
            onValueChange={(v) => handleInputChange('authenticatedUserDefaultRoleID', v)}
          >
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label className="text-sm font-medium text-right">Default VLAN / Topology</Label>
          <Select
            value={formData.defaultTopology || 'none'}
            onValueChange={(v) => handleInputChange('defaultTopology', v)}
          >
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {topologies.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ========== BOTTOM SECTION TABS: ADVANCED | SCHEDULING ========== */}
      <Separator className="my-6" />

      <Tabs value={bottomTab} onValueChange={setBottomTab} className="w-full max-w-3xl">
        <TabsList>
          <TabsTrigger value="advanced">ADVANCED</TabsTrigger>
          <TabsTrigger value="scheduling">SCHEDULING</TabsTrigger>
        </TabsList>

        {/* ===== ADVANCED TAB ===== */}
        <TabsContent value="advanced" className="pt-4 space-y-4">

          {/* MultiBand Operation */}
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">MultiBand Operation</Label>
            <Switch
              checked={formData.bandSteering}
              onCheckedChange={(v) => handleInputChange('bandSteering', v)}
            />
          </div>

          {/* RADIUS Accounting */}
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">RADIUS Accounting</Label>
            <Switch
              checked={formData.accountingEnabled}
              onCheckedChange={(v) => {
                handleInputChange('accountingEnabled', v);
                handleInputChange('radiusAccounting', v);
              }}
            />
          </div>

          {/* Hide SSID */}
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">Hide SSID</Label>
            <Switch
              checked={formData.hidden}
              onCheckedChange={(v) => {
                handleInputChange('hidden', v);
                handleInputChange('broadcastSSID', !v);
              }}
            />
          </div>

          {/* Include Hostname */}
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">Include Hostname</Label>
            <Switch
              checked={formData.includeHostname}
              onCheckedChange={(v) => handleInputChange('includeHostname', v)}
            />
          </div>

          {/* FTM (11mc) responder support */}
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">FTM (11mc) Responder Support</Label>
            <Switch
              checked={formData.enable11mcSupport}
              onCheckedChange={(v) => handleInputChange('enable11mcSupport', v)}
            />
          </div>

          {/* Radio Management (11k) support */}
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">Radio Management (11k) Support</Label>
            <Switch
              checked={formData.enabled11kSupport}
              onCheckedChange={(v) => handleInputChange('enabled11kSupport', v)}
            />
          </div>

          {/* U-APSD (WMM-PS) */}
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">U-APSD (WMM-PS)</Label>
            <Switch
              checked={formData.uapsdEnabled}
              onCheckedChange={(v) => handleInputChange('uapsdEnabled', v)}
            />
          </div>

          {/* Admission Control toggles */}
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">Admission Control - Voice (VO)</Label>
            <Switch
              checked={formData.admissionControlVoice}
              onCheckedChange={(v) => handleInputChange('admissionControlVoice', v)}
            />
          </div>
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">Admission Control - Video (VI)</Label>
            <Switch
              checked={formData.admissionControlVideo}
              onCheckedChange={(v) => handleInputChange('admissionControlVideo', v)}
            />
          </div>
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">Admission Control - Best Effort (BE)</Label>
            <Switch
              checked={formData.admissionControlBestEffort}
              onCheckedChange={(v) => handleInputChange('admissionControlBestEffort', v)}
            />
          </div>
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">Admission Control - Background (BK)</Label>
            <Switch
              checked={formData.admissionControlBackgroundTraffic}
              onCheckedChange={(v) => handleInputChange('admissionControlBackgroundTraffic', v)}
            />
          </div>

          {/* Client To Client Communication */}
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">Client-to-Client Communication</Label>
            <Switch
              checked={formData.clientToClientCommunication}
              onCheckedChange={(v) => {
                handleInputChange('clientToClientCommunication', v);
                handleInputChange('isolateClients', !v);
              }}
            />
          </div>

          {/* Clear Session on Disconnect */}
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">Clear Session on Disconnect</Label>
            <Switch
              checked={formData.purgeOnDisconnect}
              onCheckedChange={(v) => handleInputChange('purgeOnDisconnect', v)}
            />
          </div>

          {/* Beacon Protection */}
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">Beacon Protection</Label>
            <Switch
              checked={formData.beaconProtection}
              onCheckedChange={(v) => handleInputChange('beaconProtection', v)}
            />
          </div>

          <Separator className="my-2" />

          {/* Timeout inputs */}
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">Pre-Auth Idle Timeout (sec)</Label>
            <Input
              type="number"
              className="w-48"
              value={formData.preAuthenticatedIdleTimeout}
              onChange={(e) => handleInputChange('preAuthenticatedIdleTimeout', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">Post-Auth Idle Timeout (sec)</Label>
            <Input
              type="number"
              className="w-48"
              value={formData.postAuthenticatedIdleTimeout}
              onChange={(e) => handleInputChange('postAuthenticatedIdleTimeout', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">Max Session Duration (sec)</Label>
            <Input
              type="number"
              className="w-48"
              value={formData.sessionTimeout}
              onChange={(e) => handleInputChange('sessionTimeout', parseInt(e.target.value) || 0)}
            />
          </div>

          {/* QOS/DSCP button */}
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-sm font-medium text-right">QoS / DSCP</Label>
            <Select
              value={formData.defaultCoS || 'none'}
              onValueChange={(v) => handleInputChange('defaultCoS', v)}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select Class of Service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {cosOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </TabsContent>

        {/* ===== SCHEDULING TAB ===== */}
        <TabsContent value="scheduling" className="pt-4">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Configure weekly schedule for this WLAN. Set both start and stop to 00:00 to disable a day.
            </p>
            {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
              const schedule = formData.enabledSchedule || {};
              const daySchedule = schedule[day] || { start: { hour: 0, minute: 0 }, stop: { hour: 0, minute: 0 } };
              const startH = daySchedule.start?.hour ?? 0;
              const startM = daySchedule.start?.minute ?? 0;
              const stopH = daySchedule.stop?.hour ?? 0;
              const stopM = daySchedule.stop?.minute ?? 0;
              const isDisabled = startH === 0 && startM === 0 && stopH === 0 && stopM === 0;

              return (
                <div key={day} className="grid grid-cols-[200px_1fr] items-center gap-4">
                  <Label className="text-sm font-medium text-right capitalize">{day}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={`${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`}
                      onChange={(e) => {
                        const [h, m] = e.target.value.split(':').map(Number);
                        const updated = { ...formData.enabledSchedule, [day]: { ...daySchedule, start: { hour: h, minute: m } } };
                        handleInputChange('enabledSchedule' as any, updated as any);
                      }}
                      className="h-8 w-32 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={`${String(stopH).padStart(2, '0')}:${String(stopM).padStart(2, '0')}`}
                      onChange={(e) => {
                        const [h, m] = e.target.value.split(':').map(Number);
                        const updated = { ...formData.enabledSchedule, [day]: { ...daySchedule, stop: { hour: h, minute: m } } };
                        handleInputChange('enabledSchedule' as any, updated as any);
                      }}
                      className="h-8 w-32 text-xs"
                    />
                    <Badge variant={isDisabled ? 'secondary' : 'default'} className="text-xs w-14 justify-center">
                      {isDisabled ? 'Off' : 'Active'}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
