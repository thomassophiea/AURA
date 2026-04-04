import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { AlertCircle, Save, Trash2, Wifi, Lock, Eye, EyeOff, Loader2, Network, Shield } from 'lucide-react';
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

  // ── Reusable Components ─────────────────────────────────────────────

  /** Floating card section wrapper — rounded, elevated, with inner padding */
  const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  );

  /** Section header inside a card */
  const CardHeader = ({ title, icon: Icon }: { title: string; icon: any }) => (
    <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>
    </div>
  );

  /** Form row — label left, control right, full-width hover, iOS Settings style */
  const FormRow = ({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40 min-h-[52px]">
      <div className="shrink-0">
        <span className="text-sm text-foreground">{label}</span>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );

  /** Toggle row — label + switch, full width, like iOS */
  const ToggleRow = ({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <FormRow label={label} description={description}>
      <Switch checked={checked} onCheckedChange={onChange} />
    </FormRow>
  );

  /** Select row — label + dropdown */
  const SelectRow = ({ label, description, value, onChange, options, placeholder }: { label: string; description?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) => (
    <FormRow label={label} description={description}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[200px] h-9 text-sm"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </FormRow>
  );

  /** Input row — label + text/number input */
  const InputRow = ({ label, description, value, onChange, type = 'text', placeholder }: { label: string; description?: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string }) => (
    <FormRow label={label} description={description}>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-[200px] h-9 text-sm" />
    </FormRow>
  );

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className={isInline ? 'py-6 px-4 sm:px-8 bg-muted/20' : 'p-8'}>
      {error && (
        <Alert variant="destructive" className="mb-6 rounded-xl">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ═══ TOP BAR — frosted glass sticky header ═══ */}
      <div className="flex items-center justify-between mb-6 pb-4 sticky top-0 z-10 backdrop-blur-md bg-background/80 -mx-4 sm:-mx-8 px-4 sm:px-8 pt-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20">
            <Wifi className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-tight">{formData.name || 'Untitled WLAN'}</h2>
            <p className="text-xs text-muted-foreground">SSID: {formData.ssid || '—'} · {formData.enabled ? 'Active' : 'Disabled'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" disabled={saving} className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm" className="h-9 px-5 rounded-lg font-medium shadow-sm">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto space-y-5">

        {/* ═══ GENERAL ═══ */}
        <Card>
          <CardHeader title="General" icon={Wifi} />
          <div className="divide-y divide-border/40">
            <InputRow label="Network Name" value={formData.name} onChange={(v) => handleInputChange('name', v)} placeholder="e.g. Corporate WiFi" />
            <InputRow label="SSID" value={formData.ssid} onChange={(v) => handleInputChange('ssid', v)} placeholder="Broadcast name" />
            <SelectRow label="Status" value={formData.enabled ? 'enabled' : 'disabled'} onChange={(v) => handleInputChange('enabled', v === 'enabled')} options={[{ value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }]} />
            <SelectRow label="Hotspot" value={formData.hotspot ? 'enabled' : 'disabled'} onChange={(v) => { handleInputChange('hotspot', v === 'enabled'); handleInputChange('hotspotType', v === 'enabled' ? 'Hotspot20' : 'Disabled'); }} options={[{ value: 'disabled', label: 'Disabled' }, { value: 'enabled', label: 'Enabled' }]} />
          </div>
        </Card>

        {/* ═══ SECURITY ═══ */}
        <Card>
          <CardHeader title="Security" icon={Lock} />
          <div className="divide-y divide-border/40">
            {/* Auth Type with Edit Privacy + 6E badge */}
            <div className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40">
              <span className="text-sm text-foreground shrink-0">Auth Type</span>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Select value={formData.securityType} onValueChange={(v) => handleInputChange('securityType', v)}>
                  <SelectTrigger className="w-[200px] h-9 text-sm"><SelectValue /></SelectTrigger>
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
                      <Button variant="outline" size="sm" className="h-9 rounded-lg border-primary/30 text-primary hover:bg-primary/10 transition-all">
                        <Lock className="h-3.5 w-3.5 mr-1.5" />
                        Edit Privacy
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg rounded-2xl">
                      <DialogHeader className="pb-2">
                        <DialogTitle className="text-lg">Privacy Settings</DialogTitle>
                        <DialogDescription>Configure encryption and passphrase for this WLAN.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-5 py-2">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Passphrase</Label>
                          <div className="relative">
                            <Input
                              type={showPassphrase ? 'text' : 'password'}
                              value={formData.passphrase}
                              onChange={(e) => handleInputChange('passphrase', e.target.value)}
                              placeholder={formData.securityType === 'wep' ? '10 or 26 hex characters' : '8–63 characters'}
                              className="h-11 pr-10 text-sm rounded-lg"
                            />
                            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowPassphrase(!showPassphrase)}>
                              {showPassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Encryption</Label>
                            <Select value={formData.encryption} onValueChange={(v) => handleInputChange('encryption', v)}>
                              <SelectTrigger className="h-11 rounded-lg"><SelectValue /></SelectTrigger>
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
                            <Label className="text-sm font-medium">PMF</Label>
                            <Select value={formData.pmfMode} onValueChange={(v) => handleInputChange('pmfMode', v)}>
                              <SelectTrigger className="h-11 rounded-lg"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="disabled">Disabled</SelectItem>
                                <SelectItem value="capable">Capable</SelectItem>
                                <SelectItem value="required">Required</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      <DialogFooter className="pt-2">
                        <DialogClose asChild><Button variant="ghost" className="rounded-lg">Cancel</Button></DialogClose>
                        <DialogClose asChild><Button className="rounded-lg px-6">Apply</Button></DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
                {show6eBadge && <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 text-[10px] font-medium px-2 py-0.5">6E WPA Compliance</Badge>}
              </div>
            </div>
            <ToggleRow label="Captive Portal" description="Redirect clients to a login page" checked={formData.captivePortal} onChange={(v) => handleInputChange('captivePortal', v)} />
            {formData.captivePortal && (
              <>
                <SelectRow label="Portal Type" value={formData.captivePortalType || 'none'} onChange={(v) => handleInputChange('captivePortalType', v)} options={[{ value: 'none', label: 'None' }, { value: 'eGuest', label: 'eGuest' }, { value: 'external', label: 'External' }]} />
                {formData.captivePortalType === 'eGuest' && eGuestProfiles.length > 0 && (
                  <SelectRow label="eGuest Profile" value={formData.eGuestPortalId || 'none'} onChange={(v) => handleInputChange('eGuestPortalId', v)} options={[{ value: 'none', label: 'None' }, ...eGuestProfiles.map(p => ({ value: p.id, label: p.name }))]} />
                )}
              </>
            )}
            <ToggleRow label="MAC-based Auth (MBA)" description="Authenticate clients by MAC address" checked={formData.macBasedAuth} onChange={(v) => handleInputChange('macBasedAuth', v)} />
          </div>
        </Card>

        {/* ═══ ENTERPRISE AAA (conditional) ═══ */}
        {isEnterprise && (
          <Card>
            <CardHeader title="Enterprise AAA" icon={Shield} />
            <div className="divide-y divide-border/40">
              <SelectRow label="AAA Policy" value={formData.aaaPolicyId || 'none'} onChange={(v) => handleInputChange('aaaPolicyId', v)} options={[{ value: 'none', label: 'None' }, ...aaaPolicies.map(p => ({ value: p.id, label: p.name }))]} />
              <SelectRow label="Auth Method" value={formData.authMethod || 'radius'} onChange={(v) => handleInputChange('authMethod', v)} options={[{ value: 'radius', label: 'RADIUS' }, { value: 'ldap', label: 'LDAP' }, { value: 'local', label: 'Local' }]} />
              <SelectRow label="Encryption" value={formData.encryption || 'aes'} onChange={(v) => handleInputChange('encryption', v)} options={[{ value: 'aes', label: 'AES (CCMP)' }, { value: 'tkip', label: 'TKIP' }, { value: 'tkip-aes', label: 'TKIP + AES' }]} />
              <SelectRow label="PMF Mode" value={formData.pmfMode || 'disabled'} onChange={(v) => handleInputChange('pmfMode', v)} options={[{ value: 'disabled', label: 'Disabled' }, { value: 'capable', label: 'Capable' }, { value: 'required', label: 'Required' }]} />
              <ToggleRow label="Fast Transition (802.11r)" description="Enable fast BSS transition for roaming" checked={formData.fastTransitionEnabled} onChange={(v) => handleInputChange('fastTransitionEnabled', v)} />
            </div>
          </Card>
        )}

        {/* ═══ ROLE & VLAN ═══ */}
        <Card>
          <CardHeader title="Role & VLAN" icon={Network} />
          <div className="divide-y divide-border/40">
            <SelectRow label="Default Auth Role" value={formData.authenticatedUserDefaultRoleID || 'none'} onChange={(v) => handleInputChange('authenticatedUserDefaultRoleID', v)} options={[{ value: 'none', label: 'None' }, ...roles.map(r => ({ value: r.id, label: r.name }))]} />
            <SelectRow label="Default VLAN / Topology" value={formData.defaultTopology || 'none'} onChange={(v) => handleInputChange('defaultTopology', v)} options={[{ value: 'none', label: 'None' }, ...topologies.map(t => ({ value: t.id, label: t.name }))]} />
          </div>
        </Card>

        {/* ═══ ADVANCED | SCHEDULING ═══ */}
        <Card>
          <Tabs value={bottomTab} onValueChange={setBottomTab}>
            <div className="px-5 pt-4 pb-0">
              <TabsList className="h-9 p-0.5 bg-muted/60 rounded-lg w-full grid grid-cols-2">
                <TabsTrigger value="advanced" className="text-xs font-medium rounded-md data-[state=active]:shadow-sm">Advanced</TabsTrigger>
                <TabsTrigger value="scheduling" className="text-xs font-medium rounded-md data-[state=active]:shadow-sm">Scheduling</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="advanced" className="mt-0">
              <div className="divide-y divide-border/40">
                <ToggleRow label="MultiBand Operation" checked={formData.bandSteering} onChange={(v) => handleInputChange('bandSteering', v)} />
                <ToggleRow label="RADIUS Accounting" checked={formData.accountingEnabled} onChange={(v) => { handleInputChange('accountingEnabled', v); handleInputChange('radiusAccounting', v); }} />
                <ToggleRow label="Hide SSID" checked={formData.hidden} onChange={(v) => { handleInputChange('hidden', v); handleInputChange('broadcastSSID', !v); }} />
                <ToggleRow label="Include Hostname" checked={formData.includeHostname} onChange={(v) => handleInputChange('includeHostname', v)} />
                <ToggleRow label="FTM (11mc) Responder" checked={formData.enable11mcSupport} onChange={(v) => handleInputChange('enable11mcSupport', v)} />
                <ToggleRow label="Radio Mgmt (11k)" checked={formData.enabled11kSupport} onChange={(v) => handleInputChange('enabled11kSupport', v)} />
                <ToggleRow label="U-APSD (WMM-PS)" checked={formData.uapsdEnabled} onChange={(v) => handleInputChange('uapsdEnabled', v)} />
                <ToggleRow label="Admission Ctrl — Voice" checked={formData.admissionControlVoice} onChange={(v) => handleInputChange('admissionControlVoice', v)} />
                <ToggleRow label="Admission Ctrl — Video" checked={formData.admissionControlVideo} onChange={(v) => handleInputChange('admissionControlVideo', v)} />
                <ToggleRow label="Admission Ctrl — BE" checked={formData.admissionControlBestEffort} onChange={(v) => handleInputChange('admissionControlBestEffort', v)} />
                <ToggleRow label="Admission Ctrl — BK" checked={formData.admissionControlBackgroundTraffic} onChange={(v) => handleInputChange('admissionControlBackgroundTraffic', v)} />
                <ToggleRow label="Client-to-Client" checked={formData.clientToClientCommunication} onChange={(v) => { handleInputChange('clientToClientCommunication', v); handleInputChange('isolateClients', !v); }} />
                <ToggleRow label="Clear on Disconnect" checked={formData.purgeOnDisconnect} onChange={(v) => handleInputChange('purgeOnDisconnect', v)} />
                <ToggleRow label="Beacon Protection" checked={formData.beaconProtection} onChange={(v) => handleInputChange('beaconProtection', v)} />
                <div className="px-5 py-2">
                  <Separator className="opacity-40" />
                </div>
                <InputRow label="Pre-Auth Timeout" description="Seconds" type="number" value={formData.preAuthenticatedIdleTimeout} onChange={(v) => handleInputChange('preAuthenticatedIdleTimeout', parseInt(v) || 0)} />
                <InputRow label="Post-Auth Timeout" description="Seconds" type="number" value={formData.postAuthenticatedIdleTimeout} onChange={(v) => handleInputChange('postAuthenticatedIdleTimeout', parseInt(v) || 0)} />
                <InputRow label="Max Session" description="Seconds (0 = unlimited)" type="number" value={formData.sessionTimeout} onChange={(v) => handleInputChange('sessionTimeout', parseInt(v) || 0)} />
                <SelectRow label="QoS / DSCP" value={formData.defaultCoS || 'none'} onChange={(v) => handleInputChange('defaultCoS', v)} options={[{ value: 'none', label: 'None' }, ...cosOptions.map(c => ({ value: c.id, label: c.name }))]} placeholder="Class of Service" />
              </div>
            </TabsContent>

            <TabsContent value="scheduling" className="mt-0">
              <div className="divide-y divide-border/40">
                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                  const schedule = formData.enabledSchedule || {};
                  const daySchedule = schedule[day] || { start: { hour: 0, minute: 0 }, stop: { hour: 0, minute: 0 } };
                  const startH = daySchedule.start?.hour ?? 0;
                  const startM = daySchedule.start?.minute ?? 0;
                  const stopH = daySchedule.stop?.hour ?? 0;
                  const stopM = daySchedule.stop?.minute ?? 0;
                  const isOff = startH === 0 && startM === 0 && stopH === 0 && stopM === 0;
                  return (
                    <div key={day} className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40">
                      <span className="text-sm capitalize w-24">{day}</span>
                      <div className="flex items-center gap-2">
                        <Input type="time" value={`${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); handleInputChange('enabledSchedule' as any, { ...formData.enabledSchedule, [day]: { ...daySchedule, start: { hour: h, minute: m } } } as any); }} className="w-28 h-9 text-sm" />
                        <span className="text-xs text-muted-foreground">→</span>
                        <Input type="time" value={`${String(stopH).padStart(2, '0')}:${String(stopM).padStart(2, '0')}`} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); handleInputChange('enabledSchedule' as any, { ...formData.enabledSchedule, [day]: { ...daySchedule, stop: { hour: h, minute: m } } } as any); }} className="w-28 h-9 text-sm" />
                        <div className={`w-2 h-2 rounded-full ${isOff ? 'bg-muted-foreground/30' : 'bg-emerald-500'}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        </Card>

      </div>
    </div>
  );
}
