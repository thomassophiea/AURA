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

  // Reusable form row component for consistent layout
  const FormRow = ({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) => (
    <div className={`grid grid-cols-[180px_1fr] items-center gap-x-8 min-h-[44px] ${className}`}>
      <Label className="text-sm text-muted-foreground text-right whitespace-nowrap">{label}</Label>
      <div>{children}</div>
    </div>
  );

  // Section header component
  const SectionHeader = ({ title, icon: Icon }: { title: string; icon?: any }) => (
    <div className="flex items-center gap-2 pb-3 mb-1 border-b">
      {Icon && <Icon className="h-4 w-4 text-primary" />}
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
    </div>
  );

  return (
    <div className={isInline ? 'px-8 py-6 bg-card/50' : 'p-8'}>
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ========== TOP BAR ========== */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-lg font-semibold">{formData.name || 'Edit WLAN'}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">SSID: {formData.ssid || '—'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={saving} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm" className="px-6">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="max-w-3xl space-y-8">

        {/* ========== GENERAL ========== */}
        <section>
          <SectionHeader title="General" icon={Wifi} />
          <div className="space-y-0 divide-y divide-border/40">
            <FormRow label="Network Name">
              <Input value={formData.name} onChange={(e) => handleInputChange('name', e.target.value)} placeholder="Enter network name" className="max-w-sm" />
            </FormRow>
            <FormRow label="SSID">
              <Input value={formData.ssid} onChange={(e) => handleInputChange('ssid', e.target.value)} placeholder="Enter SSID" className="max-w-sm" />
            </FormRow>
            <FormRow label="Status">
              <Select value={formData.enabled ? 'enabled' : 'disabled'} onValueChange={(v) => handleInputChange('enabled', v === 'enabled')}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="enabled">Enabled</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </FormRow>
            <FormRow label="Hotspot">
              <Select value={formData.hotspot ? 'enabled' : 'disabled'} onValueChange={(v) => { handleInputChange('hotspot', v === 'enabled'); handleInputChange('hotspotType', v === 'enabled' ? 'Hotspot20' : 'Disabled'); }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="enabled">Enabled</SelectItem>
                </SelectContent>
              </Select>
            </FormRow>
          </div>
        </section>

        {/* ========== SECURITY ========== */}
        <section>
          <SectionHeader title="Security" icon={Lock} />
          <div className="space-y-0 divide-y divide-border/40">
            <FormRow label="Auth Type">
              <div className="flex items-center gap-3">
                <Select value={formData.securityType} onValueChange={(v) => handleInputChange('securityType', v)}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="owe">OWE (Enhanced Open)</SelectItem>
                    <SelectItem value="wep">WEP</SelectItem>
                    <SelectItem value="wpa2-personal">WPA2-Personal (PSK)</SelectItem>
                    <SelectItem value="wpa3-personal">WPA3-Personal</SelectItem>
                    <SelectItem value="wpa3-compatibility">WPA3-Compatibility</SelectItem>
                    <SelectItem value="wpa2-enterprise">WPA2-Enterprise (802.1X)</SelectItem>
                    <SelectItem value="wpa3-enterprise">WPA3-Enterprise</SelectItem>
                    <SelectItem value="wpa23-enterprise">WPA2/3-Enterprise</SelectItem>
                  </SelectContent>
                </Select>
                {isPsk && (
                  <Dialog open={privacyDialogOpen} onOpenChange={setPrivacyDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="secondary" size="sm" className="shrink-0">
                        <Lock className="h-3.5 w-3.5 mr-1.5" />
                        Edit Privacy
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Privacy Settings</DialogTitle>
                        <DialogDescription>Configure passphrase and encryption.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-5 py-4">
                        <div className="space-y-2">
                          <Label>Passphrase</Label>
                          <div className="relative">
                            <Input
                              type={showPassphrase ? 'text' : 'password'}
                              value={formData.passphrase}
                              onChange={(e) => handleInputChange('passphrase', e.target.value)}
                              placeholder={formData.securityType === 'wep' ? '10 or 26 hex characters' : '8-63 characters'}
                            />
                            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowPassphrase(!showPassphrase)}>
                              {showPassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Encryption</Label>
                          <Select value={formData.encryption} onValueChange={(v) => handleInputChange('encryption', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {formData.securityType === 'wep' ? <SelectItem value="wep">WEP</SelectItem> : (<>
                                <SelectItem value="aes">AES (CCMP)</SelectItem>
                                <SelectItem value="tkip">TKIP</SelectItem>
                                <SelectItem value="tkip-aes">TKIP + AES</SelectItem>
                              </>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Protected Management Frames</Label>
                          <Select value={formData.pmfMode} onValueChange={(v) => handleInputChange('pmfMode', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="disabled">Disabled</SelectItem>
                              <SelectItem value="capable">Capable</SelectItem>
                              <SelectItem value="required">Required</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <DialogClose asChild><Button>Apply</Button></DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
                {show6eBadge && <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium">6E WPA Compliance</Badge>}
              </div>
            </FormRow>
            <FormRow label="Captive Portal">
              <div className="flex items-center gap-3">
                <Switch checked={formData.captivePortal} onCheckedChange={(v) => handleInputChange('captivePortal', !!v)} />
                <span className="text-sm text-muted-foreground">{formData.captivePortal ? 'Enabled' : 'Disabled'}</span>
              </div>
            </FormRow>
            {formData.captivePortal && (
              <>
                <FormRow label="Portal Type">
                  <Select value={formData.captivePortalType || 'none'} onValueChange={(v) => handleInputChange('captivePortalType', v)}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="eGuest">eGuest</SelectItem>
                      <SelectItem value="external">External</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>
                {formData.captivePortalType === 'eGuest' && eGuestProfiles.length > 0 && (
                  <FormRow label="eGuest Profile">
                    <Select value={formData.eGuestPortalId || 'none'} onValueChange={(v) => handleInputChange('eGuestPortalId', v)}>
                      <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {eGuestProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormRow>
                )}
              </>
            )}
            <FormRow label="MAC-based Auth (MBA)">
              <div className="flex items-center gap-3">
                <Switch checked={formData.macBasedAuth} onCheckedChange={(v) => handleInputChange('macBasedAuth', !!v)} />
                <span className="text-sm text-muted-foreground">{formData.macBasedAuth ? 'Enabled' : 'Disabled'}</span>
              </div>
            </FormRow>
          </div>
        </section>

        {/* ========== ENTERPRISE AAA (conditional) ========== */}
        {isEnterprise && (
          <section>
            <SectionHeader title="Enterprise AAA" icon={Shield} />
            <div className="space-y-0 divide-y divide-border/40">
              <FormRow label="AAA Policy">
                <Select value={formData.aaaPolicyId || 'none'} onValueChange={(v) => handleInputChange('aaaPolicyId', v)}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {aaaPolicies.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow label="Auth Method">
                <Select value={formData.authMethod || 'radius'} onValueChange={(v) => handleInputChange('authMethod', v)}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="radius">RADIUS</SelectItem>
                    <SelectItem value="ldap">LDAP</SelectItem>
                    <SelectItem value="local">Local</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow label="Encryption">
                <Select value={formData.encryption || 'aes'} onValueChange={(v) => handleInputChange('encryption', v)}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aes">AES (CCMP)</SelectItem>
                    <SelectItem value="tkip">TKIP</SelectItem>
                    <SelectItem value="tkip-aes">TKIP + AES</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow label="PMF Mode">
                <Select value={formData.pmfMode || 'disabled'} onValueChange={(v) => handleInputChange('pmfMode', v)}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="capable">Capable</SelectItem>
                    <SelectItem value="required">Required</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow label="Fast Transition (802.11r)">
                <div className="flex items-center gap-3">
                  <Switch checked={formData.fastTransitionEnabled} onCheckedChange={(v) => handleInputChange('fastTransitionEnabled', v)} />
                  <span className="text-sm text-muted-foreground">{formData.fastTransitionEnabled ? 'Enabled' : 'Disabled'}</span>
                </div>
              </FormRow>
            </div>
          </section>
        )}

        {/* ========== ROLE & VLAN ========== */}
        <section>
          <SectionHeader title="Role & VLAN" icon={Network} />
          <div className="space-y-0 divide-y divide-border/40">
            <FormRow label="Default Auth Role">
              <Select value={formData.authenticatedUserDefaultRoleID || 'none'} onValueChange={(v) => handleInputChange('authenticatedUserDefaultRoleID', v)}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormRow>
            <FormRow label="Default VLAN / Topology">
              <Select value={formData.defaultTopology || 'none'} onValueChange={(v) => handleInputChange('defaultTopology', v)}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {topologies.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormRow>
          </div>
        </section>

        {/* ========== ADVANCED | SCHEDULING ========== */}
        <section>
          <Tabs value={bottomTab} onValueChange={setBottomTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="advanced" className="text-xs uppercase tracking-wider px-4">Advanced</TabsTrigger>
              <TabsTrigger value="scheduling" className="text-xs uppercase tracking-wider px-4">Scheduling</TabsTrigger>
            </TabsList>

            <TabsContent value="advanced">
              <div className="space-y-0 divide-y divide-border/40">
                <FormRow label="MultiBand Operation"><Switch checked={formData.bandSteering} onCheckedChange={(v) => handleInputChange('bandSteering', v)} /></FormRow>
                <FormRow label="RADIUS Accounting"><Switch checked={formData.accountingEnabled} onCheckedChange={(v) => { handleInputChange('accountingEnabled', v); handleInputChange('radiusAccounting', v); }} /></FormRow>
                <FormRow label="Hide SSID"><Switch checked={formData.hidden} onCheckedChange={(v) => { handleInputChange('hidden', v); handleInputChange('broadcastSSID', !v); }} /></FormRow>
                <FormRow label="Include Hostname"><Switch checked={formData.includeHostname} onCheckedChange={(v) => handleInputChange('includeHostname', v)} /></FormRow>
                <FormRow label="FTM (11mc) Responder"><Switch checked={formData.enable11mcSupport} onCheckedChange={(v) => handleInputChange('enable11mcSupport', v)} /></FormRow>
                <FormRow label="Radio Mgmt (11k)"><Switch checked={formData.enabled11kSupport} onCheckedChange={(v) => handleInputChange('enabled11kSupport', v)} /></FormRow>
                <FormRow label="U-APSD (WMM-PS)"><Switch checked={formData.uapsdEnabled} onCheckedChange={(v) => handleInputChange('uapsdEnabled', v)} /></FormRow>
                <FormRow label="Admission Ctrl — Voice"><Switch checked={formData.admissionControlVoice} onCheckedChange={(v) => handleInputChange('admissionControlVoice', v)} /></FormRow>
                <FormRow label="Admission Ctrl — Video"><Switch checked={formData.admissionControlVideo} onCheckedChange={(v) => handleInputChange('admissionControlVideo', v)} /></FormRow>
                <FormRow label="Admission Ctrl — BE"><Switch checked={formData.admissionControlBestEffort} onCheckedChange={(v) => handleInputChange('admissionControlBestEffort', v)} /></FormRow>
                <FormRow label="Admission Ctrl — BK"><Switch checked={formData.admissionControlBackgroundTraffic} onCheckedChange={(v) => handleInputChange('admissionControlBackgroundTraffic', v)} /></FormRow>
                <FormRow label="Client-to-Client"><Switch checked={formData.clientToClientCommunication} onCheckedChange={(v) => { handleInputChange('clientToClientCommunication', v); handleInputChange('isolateClients', !v); }} /></FormRow>
                <FormRow label="Clear on Disconnect"><Switch checked={formData.purgeOnDisconnect} onCheckedChange={(v) => handleInputChange('purgeOnDisconnect', v)} /></FormRow>
                <FormRow label="Beacon Protection"><Switch checked={formData.beaconProtection} onCheckedChange={(v) => handleInputChange('beaconProtection', v)} /></FormRow>
                <FormRow label="Pre-Auth Timeout (s)"><Input type="number" className="w-32" value={formData.preAuthenticatedIdleTimeout} onChange={(e) => handleInputChange('preAuthenticatedIdleTimeout', parseInt(e.target.value) || 0)} /></FormRow>
                <FormRow label="Post-Auth Timeout (s)"><Input type="number" className="w-32" value={formData.postAuthenticatedIdleTimeout} onChange={(e) => handleInputChange('postAuthenticatedIdleTimeout', parseInt(e.target.value) || 0)} /></FormRow>
                <FormRow label="Max Session (s)"><Input type="number" className="w-32" value={formData.sessionTimeout} onChange={(e) => handleInputChange('sessionTimeout', parseInt(e.target.value) || 0)} /></FormRow>
                <FormRow label="QoS / DSCP">
                  <Select value={formData.defaultCoS || 'none'} onValueChange={(v) => handleInputChange('defaultCoS', v)}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Select Class of Service" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {cosOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormRow>
              </div>
            </TabsContent>

            <TabsContent value="scheduling">
              <div className="space-y-0 divide-y divide-border/40">
                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                  const schedule = formData.enabledSchedule || {};
                  const daySchedule = schedule[day] || { start: { hour: 0, minute: 0 }, stop: { hour: 0, minute: 0 } };
                  const startH = daySchedule.start?.hour ?? 0;
                  const startM = daySchedule.start?.minute ?? 0;
                  const stopH = daySchedule.stop?.hour ?? 0;
                  const stopM = daySchedule.stop?.minute ?? 0;
                  const isOff = startH === 0 && startM === 0 && stopH === 0 && stopM === 0;
                  return (
                    <FormRow key={day} label={day.charAt(0).toUpperCase() + day.slice(1)}>
                      <div className="flex items-center gap-3">
                        <Input type="time" value={`${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); handleInputChange('enabledSchedule' as any, { ...formData.enabledSchedule, [day]: { ...daySchedule, start: { hour: h, minute: m } } } as any); }} className="w-28" />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input type="time" value={`${String(stopH).padStart(2, '0')}:${String(stopM).padStart(2, '0')}`} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); handleInputChange('enabledSchedule' as any, { ...formData.enabledSchedule, [day]: { ...daySchedule, stop: { hour: h, minute: m } } } as any); }} className="w-28" />
                        <Badge variant={isOff ? 'secondary' : 'default'} className="text-[10px] w-12 justify-center">{isOff ? 'Off' : 'On'}</Badge>
                      </div>
                    </FormRow>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        </section>

      </div>
    </div>
  );
}
