import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import {
  AlertCircle,
  Save,
  Trash2,
  Wifi,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Network,
  Shield,
  ChevronDown,
  ChevronUp,
  Clock,
  Settings,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from './ui/dialog';
import { Checkbox } from './ui/checkbox';
import { Alert, AlertDescription } from './ui/alert';
import { apiService, Service, Role, Topology, AaaPolicy, ClassOfService } from '../services/api';
import { WLANAssignmentService } from '../services/wlanAssignment';
import type { Site, Profile } from '../types/network';

// Legacy manual site-grouping concept used by the WLAN assignment UI (local to this component).
// The canonical LegacySiteGroup (controller pair) lives in src/types/domain.ts.
interface LegacySiteGroup {
  id: string;
  name: string;
  description?: string;
  siteIds: string[];
  createdAt?: string;
  lastModified?: string;
  color?: string;
}
import {
  generateDefaultService,
  generatePrivacyConfig,
  validateServiceData,
} from '../utils/serviceDefaults';
import { validateEnterpriseAuthRequirements, isEnterpriseAuth } from '../utils/wlanAuthValidation';
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
  enabledSchedule?: string;
}

export function NetworkEditDetail({ serviceId, onSave, isInline = false }: NetworkEditDetailProps) {
  const [service, setService] = useState<Service | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [topologies, setTopologies] = useState<Topology[]>([]);
  const [aaaPolicies, setAaaPolicies] = useState<AaaPolicy[]>([]);
  const [cosOptions, setCosOptions] = useState<
    Array<{ id: string; name: string; [key: string]: any }>
  >([]);
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
  const [showAdvancedCard, setShowAdvancedCard] = useState(false);
  const [showSchedulingCard, setShowSchedulingCard] = useState(false);
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
    customProperties: {},
  });

  // Baseline snapshot of formData taken on first load. Used for dirty-state
  // detection and Cancel/Revert without re-fetching from the API.
  const baselineFormDataRef = useRef<NetworkFormData | null>(null);

  // Active section anchor for the sticky nav (purely cosmetic).
  const [activeSection, setActiveSection] = useState<string>('ssid');

  // Dirty when current formData diverges from the baseline snapshot.
  const isDirty = useMemo(() => {
    if (!baselineFormDataRef.current) return false;
    return JSON.stringify(formData) !== JSON.stringify(baselineFormDataRef.current);
  }, [formData]);

  const handleCancel = () => {
    if (baselineFormDataRef.current) {
      setFormData(baselineFormDataRef.current);
      setError(null);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(`section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(id);
    }
  };

  useEffect(() => {
    loadNetworkData();
  }, [serviceId]);

  const loadNetworkData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all data sources in parallel — use nametoidmap for dropdown-only data
      const [
        serviceResponse,
        rolesResponse,
        topologiesResponse,
        aaaPoliciesResponse,
        cosResponse,
        eGuestResponse,
      ] = await Promise.allSettled([
        apiService.getServiceById(serviceId),
        apiService.getRoleNameToIdMap(),
        apiService.getTopologyNameToIdMap(),
        apiService.getAaaPolicyNameToIdMap(),
        apiService.getCoSNameToIdMap(),
        apiService.getEGuestNameToIdMap(),
      ]);

      if (serviceResponse.status === 'fulfilled') {
        const serviceData = serviceResponse.value;
        setService(serviceData);

        console.log('Loading service data:', serviceData);

        // Get WPA3-SAE configuration
        const saeElement = serviceData.privacy?.WpaSaeElement || serviceData.WpaSaeElement;
        const pskElement = serviceData.privacy?.WpaPskElement || serviceData.WpaPskElement;
        const enterpriseElement =
          serviceData.privacy?.WpaEnterpriseElement || serviceData.WpaEnterpriseElement;

        // Detect security type from privacy elements
        let detectedSecurityType = 'open';
        let detectedEncryption = '';

        if (pskElement) {
          detectedSecurityType = 'wpa2-personal';
          detectedEncryption =
            pskElement.mode === 'aesOnly'
              ? 'aes'
              : pskElement.mode === 'tkipOnly'
                ? 'tkip'
                : pskElement.mode === 'mixed'
                  ? 'tkip-aes'
                  : 'aes';
        } else if (saeElement) {
          detectedSecurityType = 'wpa3-personal';
          detectedEncryption = 'aes';
        } else if (enterpriseElement) {
          const pmfRequired = enterpriseElement.pmfMode === 'required';
          detectedSecurityType = pmfRequired ? 'wpa3-enterprise' : 'wpa2-enterprise';
          detectedEncryption =
            enterpriseElement.mode === 'aesOnly'
              ? 'aes'
              : enterpriseElement.mode === 'tkipOnly'
                ? 'tkip'
                : enterpriseElement.mode === 'mixed'
                  ? 'tkip-aes'
                  : 'aes';
        }

        // Map service data to comprehensive form data with ALL Extreme Platform ONE fields
        const mappedFormData = {
          // Basic Settings
          name:
            serviceData.serviceName || serviceData.name || serviceData.ssid || 'Unnamed Network',
          ssid: serviceData.ssid || serviceData.name || '',
          description: serviceData.description || '',
          enabled: serviceData.enabled !== false && serviceData.status !== 'disabled',

          // Security Configuration
          securityType: detectedSecurityType,
          privacyType: serviceData.security?.privacyType || serviceData.privacyType || '',
          authType: serviceData.security?.authType || serviceData.authType || '',
          authMethod: serviceData.security?.authMethod || serviceData.authMethod || '',
          encryption:
            detectedEncryption || serviceData.security?.encryption || serviceData.encryption || '',
          passphrase:
            pskElement?.presharedKey ||
            saeElement?.presharedKey ||
            serviceData.security?.passphrase ||
            serviceData.passphrase ||
            '',

          // WPA3-SAE Configuration
          pmfMode:
            saeElement?.pmfMode || pskElement?.pmfMode || enterpriseElement?.pmfMode || 'disabled',
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
          vendorSpecificAttributes: serviceData.vendorSpecificAttributes || [
            'apName',
            'vnsName',
            'ssid',
          ],

          // Mesh
          shutdownOnMeshpointLoss: serviceData.shutdownOnMeshpointLoss || false,
          enabledSchedule: serviceData.enabledSchedule || null,

          // Advanced Settings (Legacy fields for backward compatibility)
          defaultAuthRole: serviceData.defaultAuthRole || 'none',
          isolateClients: !serviceData.clientToClientCommunication,
          fastRoaming: enterpriseElement?.fastTransitionEnabled || false,
          loadBalancing: serviceData.loadBalancing || false,
          radiusAccounting: serviceData.accountingEnabled || false,
          customProperties: serviceData.customProperties || {},
        };

        console.log('Mapped form data:', mappedFormData);
        setFormData(mappedFormData);
        baselineFormDataRef.current = mappedFormData;
      } else {
        throw new Error('Failed to load service details');
      }

      // Convert name-to-id maps into {id, name} arrays for dropdown rendering
      const mapToArray = (map: Record<string, string>) =>
        Object.entries(map).map(([name, id]) => ({ id, name }));

      if (rolesResponse.status === 'fulfilled') {
        setRoles(mapToArray(rolesResponse.value) as any);
      } else {
        setRoles([]);
      }

      if (topologiesResponse.status === 'fulfilled') {
        setTopologies(mapToArray(topologiesResponse.value) as any);
      } else {
        setTopologies([]);
      }

      if (aaaPoliciesResponse.status === 'fulfilled') {
        setAaaPolicies(mapToArray(aaaPoliciesResponse.value));
      } else {
        setAaaPolicies([]);
      }

      if (cosResponse.status === 'fulfilled') {
        setCosOptions(mapToArray(cosResponse.value) as any);
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
        description: errorMessage,
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
        Promise.resolve(localStorage.getItem('siteGroups')),
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
    const siteIdsFromGroups = selectedLegacySiteGroups.flatMap((groupId) => {
      const group = siteGroups.find((g) => g.id === groupId);
      return group?.siteIds || [];
    });
    return [...new Set([...selectedSites, ...siteIdsFromGroups])];
  };

  // Toggle site selection
  const toggleSite = (siteId: string) => {
    setSelectedSites((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId]
    );
  };

  // Toggle site group selection
  const toggleLegacySiteGroup = (groupId: string) => {
    setSelectedLegacySiteGroups((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
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
      const uniqueProfiles = allProfiles.filter(
        (profile, index, self) => index === self.findIndex((p) => p.id === profile.id)
      );

      if (uniqueProfiles.length === 0) {
        toast.error('No profiles found at selected sites', {
          description: 'Ensure sites have device groups with profiles configured',
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
          description:
            failCount > 0 ? `${failCount} failed` : `Across ${expandedSiteIds.length} site(s)`,
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

      // Validate enterprise AAA requirements
      const effectiveAaaPolicyId =
        formData.aaaPolicyId === 'none' ? '' : formData.aaaPolicyId || '';
      const authError = validateEnterpriseAuthRequirements(
        formData.securityType,
        effectiveAaaPolicyId
      );
      if (authError) {
        toast.error('Authentication Configuration Error', { description: authError });
        setActiveTab('basic');
        setSaving(false);
        return;
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
            encryption:
              formData.encryption === 'aes'
                ? 'AES'
                : formData.encryption === 'tkip-aes'
                  ? 'TKIP_AES'
                  : 'AES',
            akmSuiteSelector: 'SAE',
          },
        };
      } else if (
        formData.securityType === 'wpa2-personal' ||
        formData.securityType === 'wpa-personal'
      ) {
        // WPA2-Personal (PSK)
        privacyConfig = {
          type: formData.securityType === 'wpa2-personal' ? 'WPA2' : 'WPA',
          WpaPskElement: {
            mode: formData.securityType === 'wpa2-personal' ? 'WPA2' : 'WPA',
            pmfMode: formData.pmfMode || 'disabled',
            presharedKey: formData.passphrase || service.privacy?.WpaPskElement?.presharedKey || '',
            keyHexEncoded: false,
            encryption:
              formData.encryption === 'aes'
                ? 'AES'
                : formData.encryption === 'tkip'
                  ? 'TKIP'
                  : formData.encryption === 'tkip-aes'
                    ? 'TKIP_AES'
                    : 'AES',
          },
        };
      } else if (formData.securityType.includes('enterprise')) {
        // WPA-Enterprise / WPA2-Enterprise / WPA3-Enterprise
        const mode =
          formData.securityType === 'wpa3-enterprise'
            ? 'WPA3'
            : formData.securityType === 'wpa2-enterprise'
              ? 'WPA2'
              : formData.securityType === 'wpa23-enterprise'
                ? 'WPA2/3'
                : 'WPA';

        privacyConfig = {
          type: mode,
          WpaEnterpriseElement: {
            mode: mode,
            pmfMode:
              formData.pmfMode ||
              (formData.securityType === 'wpa3-enterprise' ? 'required' : 'disabled'),
            encryption:
              formData.encryption === 'aes'
                ? 'AES'
                : formData.encryption === 'tkip'
                  ? 'TKIP'
                  : formData.encryption === 'tkip-aes'
                    ? 'TKIP_AES'
                    : 'AES',
            fastTransitionEnabled: formData.fastTransitionEnabled,
            fastTransitionMdId: formData.fastTransitionMdId || 0,
          },
        };
      } else if (formData.securityType === 'owe') {
        // OWE (Opportunistic Wireless Encryption)
        privacyConfig = {
          type: 'OWE',
          OweElement: {
            encryption: 'AES',
          },
        };
      } else if (formData.securityType === 'open') {
        // Open network
        privacyConfig = {
          type: 'Open',
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
        mbatimeoutRoleId:
          formData.mbatimeoutRoleId === 'none' ? undefined : formData.mbatimeoutRoleId,

        // === NETWORK SETTINGS ===
        defaultTopology: formData.defaultTopology === 'none' ? undefined : formData.defaultTopology,
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
        defaultCoS: formData.defaultCoS === 'none' ? undefined : formData.defaultCoS,
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
        roamingAssistPolicy:
          formData.roamingAssistPolicy === 'none' ? null : formData.roamingAssistPolicy,
        loadBalancing: formData.loadBalancing,

        // === RADIUS VENDOR ATTRIBUTES ===
        vendorSpecificAttributes: formData.vendorSpecificAttributes,

        // === MESH SETTINGS ===
        shutdownOnMeshpointLoss: formData.shutdownOnMeshpointLoss,
        enabledSchedule: formData.enabledSchedule,
      };

      // Remove undefined values to avoid API issues
      Object.keys(completeServiceData).forEach((key) => {
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

      // Refresh dirty-state baseline so the form is no longer marked dirty.
      baselineFormDataRef.current = formData;

      toast.success('Network configuration saved successfully', {
        description: `Settings for ${formData.name} have been updated with all controller features.`,
      });

      // Call onSave callback to refresh parent component
      if (onSave) {
        onSave();
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to save network configuration';
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
      console.error('- Privacy object structure:', service?.privacy);
      console.error('- Security type:', formData.securityType);

      if (err && typeof err === 'object') {
        console.error('Error object properties:', Object.getOwnPropertyNames(err));
        console.error(
          'Error object values:',
          Object.fromEntries(
            Object.getOwnPropertyNames(err).map((prop) => [prop, (err as any)[prop]])
          )
        );
      }

      // Provide actionable error message to user
      let userFriendlyError = errorMessage;
      if (errorMessage.includes('422')) {
        userFriendlyError =
          'Validation failed. The controller rejected the update. Check that all field values are valid (e.g., valid VLAN range, proper passphrase length, valid UUIDs for roles/topologies).';
      } else if (errorMessage.includes('404')) {
        userFriendlyError =
          'Service not found. The network configuration may have been deleted by another user.';
      } else if (errorMessage.includes('403')) {
        userFriendlyError =
          'Access denied. You may not have permission to modify this network configuration.';
      }

      toast.error('Failed to save network configuration', {
        description: userFriendlyError,
        duration: 10000, // Longer duration for error messages
      });
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof NetworkFormData, value: string | boolean | number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
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
  const isEnterprise = isEnterpriseAuth(formData.securityType || '');
  // Helper: is this a PSK auth type that needs passphrase config?
  const isPsk = [
    'wep',
    'wpa-personal',
    'wpa2-personal',
    'wpa3-personal',
    'wpa3-compatibility',
  ].includes(formData.securityType);
  // Helper: show 6E WPA Compliance badge?
  const show6eBadge = [
    'owe',
    'wpa3-personal',
    'wpa3-enterprise',
    'wpa3-compatibility',
    'wpa23-enterprise',
  ].includes(formData.securityType);

  // ── Reusable Components ─────────────────────────────────────────────

  /** Settings card — readable header + roomy body. Anchor `id` enables jump nav. */
  const SettingsCard = ({
    id,
    title,
    description,
    children,
    className = '',
  }: {
    id?: string;
    title: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <section
      id={id ? `section-${id}` : undefined}
      className={`rounded-lg border border-border/50 bg-card ${className}`}
      style={{ scrollMarginTop: 124 }}
    >
      <header className="px-5 py-3 border-b border-border/50">
        <h3 className="text-sm font-semibold leading-none">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );

  /**
   * Field row — label + optional helper, control on the right at desktop widths.
   * On a single column (no `inline`), the control sits below the label.
   */
  const Field = ({
    label,
    helper,
    children,
    inline = true,
  }: {
    label: string;
    helper?: string;
    children: React.ReactNode;
    inline?: boolean;
  }) =>
    inline ? (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(160px, 220px) 1fr',
          gap: '20px',
          alignItems: 'center',
        }}
      >
        <div>
          <Label className="text-sm font-medium text-foreground">{label}</Label>
          {helper && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{helper}</p>}
        </div>
        <div>{children}</div>
      </div>
    ) : (
      <div>
        <Label className="text-sm font-medium text-foreground block mb-2">{label}</Label>
        {children}
        {helper && <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{helper}</p>}
      </div>
    );

  /** Toggle row — label/description left, status pill + switch right. */
  const Toggle = ({
    label,
    description,
    checked,
    onChange,
  }: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border/40 last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span
          className={`text-xs font-semibold ${checked ? 'text-emerald-500' : 'text-muted-foreground/60'}`}
          style={{ minWidth: 28, textAlign: 'right' }}
        >
          {checked ? 'ON' : 'OFF'}
        </span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );

  // Section navigation pills — order matches scroll order. Enterprise AAA
  // appears only when the auth type is enterprise.
  const navSections: Array<{ id: string; label: string }> = [
    { id: 'ssid', label: 'SSID' },
    { id: 'security', label: 'Security' },
    { id: 'role-vlan', label: 'Role & VLAN' },
    { id: 'captive', label: 'Captive Portal' },
    ...(isEnterprise ? [{ id: 'aaa', label: 'Enterprise AAA' }] : []),
    { id: 'schedule', label: 'Schedule' },
    { id: 'qos', label: 'QoS & Timeouts' },
    { id: 'advanced', label: 'Advanced' },
  ];

  // Determine which Advanced accordion contains a validation error so it can
  // auto-expand. Today the only enterprise-AAA validation lives in its own
  // section, but this hook keeps the door open for future Advanced errors.
  const advancedErrorSection: string | undefined = undefined;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className={isInline ? 'bg-muted/10' : 'bg-background'}>
      {/* ═══ STICKY HEADER — title + dirty indicator + Cancel/Save ═══ */}
      <div
        className="border-b border-border/50 bg-card"
        style={{ position: 'sticky', top: 0, zIndex: 50 }}
      >
        <div className="px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <h2 className="text-base font-semibold truncate">
                  {formData.name || 'Untitled WLAN'}
                </h2>
                <p className="text-xs text-muted-foreground truncate">
                  SSID: {formData.ssid || '—'}
                </p>
              </div>
              {isDirty && (
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs font-medium shrink-0"
                >
                  Unsaved changes
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                disabled={saving}
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                title="Delete WLAN"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!isDirty || saving}
                onClick={handleCancel}
                className="h-9 px-4"
              >
                <X className="h-4 w-4 mr-1.5" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !isDirty}
                size="sm"
                className="h-9 px-4 font-medium"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1.5" />
                )}
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>

        {/* Section nav pills */}
        <div
          className="border-t border-border/30 bg-card/50"
          style={{
            overflowX: 'auto',
            scrollbarWidth: 'thin',
          }}
        >
          <div className="px-5 py-2 flex items-center gap-1" style={{ whiteSpace: 'nowrap' }}>
            {navSections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollToSection(s.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeSection === s.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ PAGE CONTENT ═══ */}
      <div className="px-5 py-5 space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* ── SSID ── */}
        <SettingsCard
          id="ssid"
          title="SSID"
          description="Identity, broadcast name, and operational status."
        >
          <div className="space-y-3">
            <Field label="Network Name" helper="Display name shown in lists and reports.">
              <Input
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g. Corporate WiFi"
                className="h-10 text-sm"
              />
            </Field>
            <Field
              label="SSID"
              helper="Broadcast name. Supports variable substitution, e.g. {{site_name}}."
            >
              <Input
                value={formData.ssid}
                onChange={(e) => handleInputChange('ssid', e.target.value)}
                placeholder="Broadcast name"
                className="h-10 text-sm"
              />
            </Field>
            <Field label="WLAN Status">
              <Select
                value={formData.enabled ? 'enabled' : 'disabled'}
                onValueChange={(v) => handleInputChange('enabled', v === 'enabled')}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enabled">Enabled</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Hotspot 2.0"
              helper="Enables Passpoint/Hotspot 2.0 service advertisement."
            >
              <Select
                value={formData.hotspot ? 'enabled' : 'disabled'}
                onValueChange={(v) => {
                  handleInputChange('hotspot', v === 'enabled');
                  handleInputChange('hotspotType', v === 'enabled' ? 'Hotspot20' : 'Disabled');
                }}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="enabled">Enabled</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </SettingsCard>

        {/* ── Security ── */}
        <SettingsCard
          id="security"
          title="Security"
          description="Authentication and encryption applied to client associations."
        >
          <div className="space-y-3">
            <Field
              label="Auth Type"
              helper="Use Edit Privacy to set passphrase, encryption, and PMF for personal/PSK modes."
            >
              <div className="flex items-center gap-2">
                <Select
                  value={formData.securityType}
                  onValueChange={(v) => handleInputChange('securityType', v)}
                >
                  <SelectTrigger className="h-10 text-sm flex-1">
                    <SelectValue />
                  </SelectTrigger>
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
                      <Button variant="outline" size="sm" className="h-10 shrink-0 text-xs">
                        <Lock className="h-3.5 w-3.5 mr-1.5" />
                        Edit Privacy
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Privacy Settings</DialogTitle>
                        <DialogDescription>Configure encryption and passphrase.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-3">
                        <Field label="Passphrase" inline={false}>
                          <div className="relative">
                            <Input
                              type={showPassphrase ? 'text' : 'password'}
                              value={formData.passphrase}
                              onChange={(e) => handleInputChange('passphrase', e.target.value)}
                              placeholder={
                                formData.securityType === 'wep'
                                  ? '10 or 26 hex characters'
                                  : '8–63 characters'
                              }
                              className="h-10 pr-10 text-sm"
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowPassphrase(!showPassphrase)}
                            >
                              {showPassphrase ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </Field>
                        <div className="grid grid-cols-2 gap-4">
                          <Field label="Encryption" inline={false}>
                            <Select
                              value={formData.encryption}
                              onValueChange={(v) => handleInputChange('encryption', v)}
                            >
                              <SelectTrigger className="h-10">
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
                          </Field>
                          <Field label="PMF" inline={false}>
                            <Select
                              value={formData.pmfMode}
                              onValueChange={(v) => handleInputChange('pmfMode', v)}
                            >
                              <SelectTrigger className="h-10">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="disabled">Disabled</SelectItem>
                                <SelectItem value="capable">Capable</SelectItem>
                                <SelectItem value="required">Required</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="ghost">Cancel</Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button>Apply</Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </Field>
            {show6eBadge && (
              <Field label="Wi-Fi 6E">
                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 text-xs font-medium">
                  6E WPA Compliance
                </Badge>
              </Field>
            )}
            <Toggle
              label="MAC-based Auth (MBA)"
              description="Authenticate clients by MAC address before applying network access policy."
              checked={formData.macBasedAuth}
              onChange={(v) => handleInputChange('macBasedAuth', v)}
            />
          </div>
        </SettingsCard>

        {/* ── Role & VLAN ── */}
        <SettingsCard
          id="role-vlan"
          title="Role & VLAN"
          description="Default access role and topology for authenticated clients."
        >
          <div className="space-y-3">
            <Field
              label="Default Auth Role"
              helper="Role applied to clients after successful authentication."
            >
              <Select
                value={formData.authenticatedUserDefaultRoleID || 'none'}
                onValueChange={(v) => handleInputChange('authenticatedUserDefaultRoleID', v)}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Default VLAN / Topology"
              helper="Topology determines the VLAN ID used by clients on this WLAN."
            >
              <Select
                value={formData.defaultTopology || 'none'}
                onValueChange={(v) => handleInputChange('defaultTopology', v)}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {topologies.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </SettingsCard>

        {/* ── Captive Portal ── */}
        <SettingsCard
          id="captive"
          title="Captive Portal"
          description="Splash page for guest onboarding."
        >
          <div className="space-y-3">
            <Toggle
              label="Enable Captive Portal"
              description="Redirect new clients to a splash page before granting access."
              checked={formData.captivePortal}
              onChange={(v) => handleInputChange('captivePortal', v)}
            />
            {formData.captivePortal && (
              <>
                <Field label="Portal Type">
                  <Select
                    value={formData.captivePortalType || 'none'}
                    onValueChange={(v) => handleInputChange('captivePortalType', v)}
                  >
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="eGuest">eGuest</SelectItem>
                      <SelectItem value="external">External</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {formData.captivePortalType === 'eGuest' && eGuestProfiles.length > 0 && (
                  <Field label="eGuest Profile">
                    <Select
                      value={formData.eGuestPortalId || 'none'}
                      onValueChange={(v) => handleInputChange('eGuestPortalId', v)}
                    >
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {eGuestProfiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </>
            )}
          </div>
        </SettingsCard>

        {/* ── Enterprise AAA (conditional) ── */}
        {isEnterprise && (
          <SettingsCard
            id="aaa"
            title="Enterprise AAA"
            description="RADIUS / 802.1X policy for enterprise authentication."
          >
            <div className="space-y-3">
              <Field
                label="AAA Policy"
                helper="Required for enterprise authentication. Defines RADIUS servers and behavior."
              >
                <Select
                  value={formData.aaaPolicyId || 'none'}
                  onValueChange={(v) => handleInputChange('aaaPolicyId', v)}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {aaaPolicies.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isEnterpriseAuth(formData.securityType) &&
                  (!formData.aaaPolicyId || formData.aaaPolicyId === 'none') && (
                    <p
                      role="alert"
                      className="text-xs text-destructive flex items-center gap-1.5 mt-2"
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      AAA policy is required for enterprise authentication
                    </p>
                  )}
              </Field>
              <Field label="Auth Method">
                <Select
                  value={formData.authMethod || 'radius'}
                  onValueChange={(v) => handleInputChange('authMethod', v)}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="radius">RADIUS</SelectItem>
                    <SelectItem value="ldap">LDAP</SelectItem>
                    <SelectItem value="local">Local</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Encryption">
                <Select
                  value={formData.encryption || 'aes'}
                  onValueChange={(v) => handleInputChange('encryption', v)}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aes">AES (CCMP)</SelectItem>
                    <SelectItem value="tkip">TKIP</SelectItem>
                    <SelectItem value="tkip-aes">TKIP + AES</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="PMF Mode" helper="Protected Management Frames (802.11w).">
                <Select
                  value={formData.pmfMode || 'disabled'}
                  onValueChange={(v) => handleInputChange('pmfMode', v)}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="capable">Capable</SelectItem>
                    <SelectItem value="required">Required</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Toggle
                label="Fast Transition (802.11r)"
                description="Reduces roaming latency between APs in the same mobility domain."
                checked={formData.fastTransitionEnabled}
                onChange={(v) => handleInputChange('fastTransitionEnabled', v)}
              />
            </div>
          </SettingsCard>
        )}

        {/* ── SSID Scheduling ── */}
        <section
          id="section-schedule"
          className="rounded-lg border border-border/50 bg-card"
          style={{ scrollMarginTop: 124 }}
        >
          <button
            type="button"
            onClick={() => setShowSchedulingCard(!showSchedulingCard)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="text-left">
                <h3 className="text-sm font-semibold leading-none">SSID Scheduling</h3>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Define daily availability windows. Set both times to 00:00 to disable a day.
                </p>
              </div>
            </div>
            {showSchedulingCard ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </button>
          {showSchedulingCard && (
            <div className="border-t border-border/50 px-6 py-4">
              <div className="divide-y divide-border/40">
                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(
                  (day) => {
                    const schedule = formData.enabledSchedule || {};
                    const ds = schedule[day] || {
                      start: { hour: 0, minute: 0 },
                      stop: { hour: 0, minute: 0 },
                    };
                    const sH = ds.start?.hour ?? 0,
                      sM = ds.start?.minute ?? 0,
                      eH = ds.stop?.hour ?? 0,
                      eM = ds.stop?.minute ?? 0;
                    const isOff = sH === 0 && sM === 0 && eH === 0 && eM === 0;
                    return (
                      <div
                        key={day}
                        className="flex items-center justify-between py-3"
                        style={{ minHeight: 48 }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`rounded-full ${isOff ? 'bg-muted-foreground/30' : 'bg-emerald-500'}`}
                            style={{ width: 8, height: 8 }}
                          />
                          <span className="text-sm font-medium capitalize" style={{ width: 96 }}>
                            {day}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {isOff ? 'Off' : 'Active'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={`${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}`}
                            onChange={(e) => {
                              const [h, m] = e.target.value.split(':').map(Number);
                              handleInputChange(
                                'enabledSchedule' as any,
                                {
                                  ...((formData.enabledSchedule as any) || {}),
                                  [day]: { ...ds, start: { hour: h, minute: m } },
                                } as any
                              );
                            }}
                            className="h-9 text-sm"
                            style={{ width: 110 }}
                          />
                          <span className="text-xs text-muted-foreground">→</span>
                          <Input
                            type="time"
                            value={`${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}`}
                            onChange={(e) => {
                              const [h, m] = e.target.value.split(':').map(Number);
                              handleInputChange(
                                'enabledSchedule' as any,
                                {
                                  ...((formData.enabledSchedule as any) || {}),
                                  [day]: { ...ds, stop: { hour: h, minute: m } },
                                } as any
                              );
                            }}
                            className="h-9 text-sm"
                            style={{ width: 110 }}
                          />
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── QoS & Timeouts ── */}
        <SettingsCard
          id="qos"
          title="QoS & Timeouts"
          description="Class of service and idle/session timeouts (seconds)."
        >
          <div className="space-y-3">
            <Field label="Class of Service" helper="Default CoS profile applied to clients.">
              <Select
                value={formData.defaultCoS || 'none'}
                onValueChange={(v) => handleInputChange('defaultCoS', v)}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Select CoS" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {cosOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Pre-Auth Idle Timeout"
              helper="Seconds. Disconnect inactive clients before authentication."
            >
              <Input
                type="number"
                value={formData.preAuthenticatedIdleTimeout}
                onChange={(e) =>
                  handleInputChange('preAuthenticatedIdleTimeout', parseInt(e.target.value) || 0)
                }
                className="h-10 text-sm"
              />
            </Field>
            <Field
              label="Post-Auth Idle Timeout"
              helper="Seconds. Disconnect inactive authenticated clients."
            >
              <Input
                type="number"
                value={formData.postAuthenticatedIdleTimeout}
                onChange={(e) =>
                  handleInputChange('postAuthenticatedIdleTimeout', parseInt(e.target.value) || 0)
                }
                className="h-10 text-sm"
              />
            </Field>
            <Field label="Max Session" helper="Seconds. Maximum total session duration.">
              <Input
                type="number"
                value={formData.sessionTimeout}
                onChange={(e) => handleInputChange('sessionTimeout', parseInt(e.target.value) || 0)}
                className="h-10 text-sm"
              />
            </Field>
          </div>
        </SettingsCard>

        {/* ── Advanced ── grouped accordions */}
        <section
          id="section-advanced"
          className="rounded-lg border border-border/50 bg-card"
          style={{ scrollMarginTop: 124 }}
        >
          <header className="px-6 py-4 border-b border-border/50 flex items-center gap-3">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-semibold leading-none">Advanced</h3>
              <p className="text-xs text-muted-foreground mt-1.5">
                Detailed radio, RADIUS, QoS admission control, and client behavior settings.
              </p>
            </div>
          </header>
          <Accordion
            type="multiple"
            defaultValue={advancedErrorSection ? [advancedErrorSection] : []}
            className="px-6"
          >
            <AccordionItem value="radio">
              <AccordionTrigger className="text-sm font-medium">
                Radio &amp; Steering
              </AccordionTrigger>
              <AccordionContent>
                <div>
                  <Toggle
                    label="MultiBand Operation"
                    description="Steer dual-band capable clients to the optimal band."
                    checked={formData.bandSteering}
                    onChange={(v) => handleInputChange('bandSteering', v)}
                  />
                  <Toggle
                    label="Hide SSID"
                    description="Suppress SSID broadcast in beacons."
                    checked={formData.hidden}
                    onChange={(v) => {
                      handleInputChange('hidden', v);
                      handleInputChange('broadcastSSID', !v);
                    }}
                  />
                  <Toggle
                    label="FTM (11mc) Responder"
                    description="Enable Fine Timing Measurement responder for indoor positioning."
                    checked={formData.enable11mcSupport}
                    onChange={(v) => handleInputChange('enable11mcSupport', v)}
                  />
                  <Toggle
                    label="Radio Mgmt (11k)"
                    description="Advertise neighbor reports to assist client roaming decisions."
                    checked={formData.enabled11kSupport}
                    onChange={(v) => handleInputChange('enabled11kSupport', v)}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="privacy-radius">
              <AccordionTrigger className="text-sm font-medium">
                Privacy &amp; RADIUS
              </AccordionTrigger>
              <AccordionContent>
                <div>
                  <Toggle
                    label="Beacon Protection"
                    description="WPA3 protection of beacon frames against forgery."
                    checked={formData.beaconProtection}
                    onChange={(v) => handleInputChange('beaconProtection', v)}
                  />
                  <Toggle
                    label="RADIUS Accounting"
                    description="Send accounting records (Start/Interim/Stop) to RADIUS."
                    checked={formData.accountingEnabled}
                    onChange={(v) => {
                      handleInputChange('accountingEnabled', v);
                      handleInputChange('radiusAccounting', v);
                    }}
                  />
                  <Toggle
                    label="Include Hostname"
                    description="Include client hostname in RADIUS attributes."
                    checked={formData.includeHostname}
                    onChange={(v) => handleInputChange('includeHostname', v)}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="qos-admission">
              <AccordionTrigger className="text-sm font-medium">
                QoS Admission Control
              </AccordionTrigger>
              <AccordionContent>
                <div>
                  <Toggle
                    label="U-APSD (WMM-PS)"
                    description="Unscheduled Automatic Power Save Delivery for battery-powered clients."
                    checked={formData.uapsdEnabled}
                    onChange={(v) => handleInputChange('uapsdEnabled', v)}
                  />
                  <Toggle
                    label="Admission Control — Voice"
                    description="Enforce CAC for voice access category."
                    checked={formData.admissionControlVoice}
                    onChange={(v) => handleInputChange('admissionControlVoice', v)}
                  />
                  <Toggle
                    label="Admission Control — Video"
                    description="Enforce CAC for video access category."
                    checked={formData.admissionControlVideo}
                    onChange={(v) => handleInputChange('admissionControlVideo', v)}
                  />
                  <Toggle
                    label="Admission Control — Best Effort"
                    description="Enforce CAC for best-effort access category."
                    checked={formData.admissionControlBestEffort}
                    onChange={(v) => handleInputChange('admissionControlBestEffort', v)}
                  />
                  <Toggle
                    label="Admission Control — Background"
                    description="Enforce CAC for background access category."
                    checked={formData.admissionControlBackgroundTraffic}
                    onChange={(v) => handleInputChange('admissionControlBackgroundTraffic', v)}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="client-behavior">
              <AccordionTrigger className="text-sm font-medium">Client Behavior</AccordionTrigger>
              <AccordionContent>
                <div>
                  <Toggle
                    label="Client-to-Client"
                    description="Allow wireless clients to communicate with each other on this WLAN."
                    checked={formData.clientToClientCommunication}
                    onChange={(v) => {
                      handleInputChange('clientToClientCommunication', v);
                      handleInputChange('isolateClients', !v);
                    }}
                  />
                  <Toggle
                    label="Clear on Disconnect"
                    description="Purge cached client data when the client disconnects."
                    checked={formData.purgeOnDisconnect}
                    onChange={(v) => handleInputChange('purgeOnDisconnect', v)}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      </div>
    </div>
  );
}
