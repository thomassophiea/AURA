import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { AlertCircle, Save, RefreshCw, Plus, Trash2, Network, Shield, Wifi, Settings, Radio, Users, Globe, Lock, Unlock, Eye, EyeOff, Info } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Skeleton } from './ui/skeleton';
import { ScrollArea } from './ui/scroll-area';
import { apiService, Service, Role, Topology, AaaPolicy, ClassOfService } from '../services/api';
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

      // Load all data sources in parallel
      const [serviceResponse, rolesResponse, topologiesResponse, aaaPoliciesResponse, cosResponse, eGuestResponse] = await Promise.allSettled([
        apiService.getServiceById(serviceId),
        apiService.getRoles(),
        apiService.getTopologies(),
        apiService.getAaaPolicies(),
        apiService.getClassOfService(),
        apiService.getEGuestProfiles()
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

      // Set all optional data sources
      if (rolesResponse.status === 'fulfilled') {
        setRoles(rolesResponse.value);
      } else {
        setRoles([]);
      }

      if (topologiesResponse.status === 'fulfilled') {
        setTopologies(topologiesResponse.value);
      } else {
        setTopologies([]);
      }

      if (aaaPoliciesResponse.status === 'fulfilled') {
        setAaaPolicies(aaaPoliciesResponse.value);
      } else {
        setAaaPolicies([]);
      }

      if (cosResponse.status === 'fulfilled') {
        setCosOptions(cosResponse.value);
      } else {
        setCosOptions([]);
      }

      if (eGuestResponse.status === 'fulfilled') {
        setEGuestProfiles(Array.isArray(eGuestResponse.value) ? eGuestResponse.value : []);
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
        description: `Settings for ${formData.name} have been updated with all Extreme Platform ONE features.`
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
        userFriendlyError = 'Validation failed. Extreme Platform ONE rejected the update. Check that all field values are valid (e.g., valid VLAN range, proper passphrase length, valid UUIDs for roles/topologies).';
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
      <div className="space-y-6 p-6">
        <div className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="space-y-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={isInline ? "space-y-6 p-6" : "space-y-6 p-6"}>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        {/* Basic Settings Tab */}
        <TabsContent value="basic" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Network className="h-5 w-5" />
                <span>Basic Configuration</span>
              </CardTitle>
              <CardDescription>
                Fundamental network settings and identification
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="network-name">Network Name</Label>
                  <Input
                    id="network-name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="Enter network name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="ssid">SSID</Label>
                  <Input
                    id="ssid"
                    value={formData.ssid}
                    onChange={(e) => handleInputChange('ssid', e.target.value)}
                    placeholder="Enter SSID"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Optional network description"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Network Status</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable or disable this network
                  </p>
                </div>
                <Switch
                  checked={formData.enabled}
                  onCheckedChange={(checked) => handleInputChange('enabled', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings Tab */}
        <TabsContent value="security" className="space-y-6">
          {/* Basic Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>Security Configuration</span>
              </CardTitle>
              <CardDescription>
                Configure authentication and encryption settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="security-type">Security Type</Label>
                  <Select value={formData.securityType} onValueChange={(value) => handleInputChange('securityType', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select security type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="owe">OWE (Enhanced Open)</SelectItem>
                      <SelectItem value="wep">WEP</SelectItem>
                      <SelectItem value="wpa-personal">WPA-Personal</SelectItem>
                      <SelectItem value="wpa2-personal">WPA2-Personal</SelectItem>
                      <SelectItem value="wpa3-personal">WPA3-Personal (SAE)</SelectItem>
                      <SelectItem value="wpa23-personal">WPA2/WPA3-Personal (Transition)</SelectItem>
                      <SelectItem value="wpa-enterprise">WPA-Enterprise</SelectItem>
                      <SelectItem value="wpa2-enterprise">WPA2-Enterprise</SelectItem>
                      <SelectItem value="wpa3-enterprise">WPA3-Enterprise</SelectItem>
                      <SelectItem value="wpa23-enterprise">WPA2/WPA3-Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="encryption">Encryption</Label>
                  <Select value={formData.encryption} onValueChange={(value) => handleInputChange('encryption', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select encryption" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="tkip">TKIP</SelectItem>
                      <SelectItem value="aes">AES</SelectItem>
                      <SelectItem value="tkip-aes">TKIP + AES</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.securityType !== 'open' && formData.securityType !== 'owe' && (
                <div className="space-y-2">
                  <Label htmlFor="passphrase">Passphrase</Label>
                  <Input
                    id="passphrase"
                    type="password"
                    value={formData.passphrase}
                    onChange={(e) => handleInputChange('passphrase', e.target.value)}
                    placeholder="Enter network passphrase (8-63 characters)"
                    minLength={8}
                    maxLength={63}
                  />
                  <p className="text-xs text-muted-foreground">8-63 characters for WPA/WPA2/WPA3</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* WPA3-SAE Configuration */}
          {(formData.securityType === 'wpa3-personal' || formData.securityType === 'wpa23-personal') && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">WPA3-SAE Configuration</CardTitle>
                <CardDescription>WPA3 Simultaneous Authentication of Equals settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pmf-mode">Protected Management Frames (PMF)</Label>
                    <Select value={formData.pmfMode} onValueChange={(value) => handleInputChange('pmfMode', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="required">Required (WPA3 only)</SelectItem>
                        <SelectItem value="capable">Capable (WPA2/WPA3 transition)</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Required for WPA3, prevents deauth attacks</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sae-method">SAE Method</Label>
                    <Select value={formData.saeMethod} onValueChange={(value) => handleInputChange('saeMethod', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SaeH2e">Hash-to-Element (Recommended)</SelectItem>
                        <SelectItem value="SaeLoop">Hunting-and-Pecking (Legacy)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">H2E provides better security</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Beacon Protection</Label>
                    <p className="text-sm text-muted-foreground">Enhanced WPA3 security feature</p>
                  </div>
                  <Switch
                    checked={formData.beaconProtection}
                    onCheckedChange={(checked) => handleInputChange('beaconProtection', checked)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* OWE Configuration */}
          {formData.securityType === 'owe' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">OWE (Opportunistic Wireless Encryption)</CardTitle>
                <CardDescription>Enhanced Open - encryption without password</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Auto-generate OWE Transition SSID</Label>
                    <p className="text-sm text-muted-foreground">Create hidden SSID for legacy device compatibility</p>
                  </div>
                  <Switch
                    checked={formData.oweAutogen}
                    onCheckedChange={(checked) => handleInputChange('oweAutogen', checked)}
                  />
                </div>

                {formData.oweAutogen && (
                  <div className="space-y-2">
                    <Label htmlFor="owe-companion">OWE Companion SSID (Optional)</Label>
                    <Input
                      id="owe-companion"
                      value={formData.oweCompanion}
                      onChange={(e) => handleInputChange('oweCompanion', e.target.value)}
                      placeholder="Leave empty for auto-generated name"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* AAA/RADIUS Configuration */}
          {(formData.securityType.includes('enterprise')) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">AAA/RADIUS Configuration</CardTitle>
                <CardDescription>Enterprise authentication settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="aaa-policy">AAA Policy</Label>
                  <Select value={formData.aaaPolicyId} onValueChange={(value) => handleInputChange('aaaPolicyId', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select AAA policy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {aaaPolicies.map(policy => (
                        <SelectItem key={policy.id} value={policy.id}>
                          {policy.name || policy.policyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {aaaPolicies.length === 0 && (
                    <p className="text-xs text-muted-foreground">No AAA policies configured</p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>RADIUS Accounting</Label>
                    <p className="text-sm text-muted-foreground">Track user session and usage data</p>
                  </div>
                  <Switch
                    checked={formData.accountingEnabled}
                    onCheckedChange={(checked) => handleInputChange('accountingEnabled', checked)}
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">802.11r Fast Transition</h4>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Enable Fast Roaming (802.11r)</Label>
                      <p className="text-sm text-muted-foreground">Faster handoff between APs</p>
                    </div>
                    <Switch
                      checked={formData.fastTransitionEnabled}
                      onCheckedChange={(checked) => handleInputChange('fastTransitionEnabled', checked)}
                    />
                  </div>

                  {formData.fastTransitionEnabled && (
                    <div className="space-y-2">
                      <Label htmlFor="ft-mdid">Mobility Domain ID</Label>
                      <Input
                        id="ft-mdid"
                        type="number"
                        value={formData.fastTransitionMdId}
                        onChange={(e) => handleInputChange('fastTransitionMdId', parseInt(e.target.value) || 0)}
                        placeholder="0-65535"
                        min="0"
                        max="65535"
                      />
                      <p className="text-xs text-muted-foreground">Unique ID for this mobility domain</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Role Assignment */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Role Assignment</CardTitle>
              <CardDescription>Default user roles for authentication states</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="unauth-role">Unauthenticated User Role</Label>
                <Select value={formData.unAuthenticatedUserDefaultRoleID} onValueChange={(value) => handleInputChange('unAuthenticatedUserDefaultRoleID', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select default role before authentication" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {roles.map(role => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Applied before user authenticates</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auth-role">Authenticated User Role</Label>
                <Select value={formData.authenticatedUserDefaultRoleID} onValueChange={(value) => handleInputChange('authenticatedUserDefaultRoleID', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select default role after authentication" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {roles.map(role => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Applied after successful authentication</p>
              </div>

              {formData.macBasedAuth && (
                <div className="space-y-2">
                  <Label htmlFor="mba-timeout-role">MAC-Based Auth Timeout Role</Label>
                  <Select value={formData.mbatimeoutRoleId} onValueChange={(value) => handleInputChange('mbatimeoutRoleId', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role after MBA timeout" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {roles.map(role => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {roles.length === 0 && (
                <p className="text-xs text-muted-foreground">No roles configured</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Network Settings Tab */}
        <TabsContent value="network" className="space-y-6">
          {/* Basic Network Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Wifi className="h-5 w-5" />
                <span>Network Settings</span>
              </CardTitle>
              <CardDescription>
                Configure VLAN, topology, band, and broadcast settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="topology">Network Topology (VLAN)</Label>
                  <Select value={formData.defaultTopology} onValueChange={(value) => handleInputChange('defaultTopology', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select topology" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {topologies.map(topo => (
                        <SelectItem key={topo.id} value={topo.id}>
                          {topo.name} (VLAN {topo.vlanid})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {topologies.length === 0 && (
                    <p className="text-xs text-muted-foreground">No topologies configured</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="proxied">Traffic Forwarding Mode</Label>
                  <Select value={formData.proxied} onValueChange={(value) => handleInputChange('proxied', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Local">Local (Bridged at AP)</SelectItem>
                      <SelectItem value="Centralized">Centralized (Tunneled)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {formData.proxied === 'Local' ? 'Traffic bridged locally at AP' : 'Traffic tunneled to Extreme Platform ONE'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="band">Frequency Band</Label>
                  <Select value={formData.band} onValueChange={(value) => handleInputChange('band', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select band" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2.4GHz">2.4GHz only</SelectItem>
                      <SelectItem value="5GHz">5GHz only</SelectItem>
                      <SelectItem value="both">Both 2.4GHz + 5GHz</SelectItem>
                      <SelectItem value="6GHz">6GHz only</SelectItem>
                      <SelectItem value="all">All bands</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="channel">Channel</Label>
                  <Select value={formData.channel} onValueChange={(value) => handleInputChange('channel', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="6">6</SelectItem>
                      <SelectItem value="11">11</SelectItem>
                      <SelectItem value="36">36</SelectItem>
                      <SelectItem value="40">40</SelectItem>
                      <SelectItem value="44">44</SelectItem>
                      <SelectItem value="48">48</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vlan">VLAN ID (Manual Override)</Label>
                  <Input
                    id="vlan"
                    type="number"
                    value={formData.vlan}
                    onChange={(e) => handleInputChange('vlan', e.target.value)}
                    placeholder="Use topology"
                    min="1"
                    max="4094"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Broadcast SSID</Label>
                    <p className="text-sm text-muted-foreground">Make network visible to clients</p>
                  </div>
                  <Switch
                    checked={formData.broadcastSSID}
                    onCheckedChange={(checked) => {
                      handleInputChange('broadcastSSID', checked);
                      handleInputChange('hidden', !checked);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Hidden Network</Label>
                    <p className="text-sm text-muted-foreground">Don't broadcast SSID</p>
                  </div>
                  <Switch
                    checked={formData.hidden}
                    onCheckedChange={(checked) => {
                      handleInputChange('hidden', checked);
                      handleInputChange('broadcastSSID', !checked);
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 802.11k/v/r Support */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">802.11k/v/r Support</CardTitle>
              <CardDescription>Radio resource management and roaming optimization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>802.11k (Radio Resource Management)</Label>
                  <p className="text-sm text-muted-foreground">Help clients find best AP</p>
                </div>
                <Switch
                  checked={formData.enabled11kSupport}
                  onCheckedChange={(checked) => handleInputChange('enabled11kSupport', checked)}
                />
              </div>

              {formData.enabled11kSupport && (
                <>
                  <div className="flex items-center justify-between pl-6">
                    <div className="space-y-1">
                      <Label>Beacon Report</Label>
                      <p className="text-sm text-muted-foreground">Request neighbor AP info from clients</p>
                    </div>
                    <Switch
                      checked={formData.rm11kBeaconReport}
                      onCheckedChange={(checked) => handleInputChange('rm11kBeaconReport', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between pl-6">
                    <div className="space-y-1">
                      <Label>Quiet IE</Label>
                      <p className="text-sm text-muted-foreground">Coordinate spectrum measurements</p>
                    </div>
                    <Switch
                      checked={formData.rm11kQuietIe}
                      onCheckedChange={(checked) => handleInputChange('rm11kQuietIe', checked)}
                    />
                  </div>
                </>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>802.11v (BSS Transition Management)</Label>
                  <p className="text-sm text-muted-foreground">Suggest better APs to clients</p>
                </div>
                <Switch
                  checked={formData.enable11mcSupport}
                  onCheckedChange={(checked) => handleInputChange('enable11mcSupport', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Band Steering */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Band Steering & Optimization</CardTitle>
              <CardDescription>Optimize client band selection</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Band Steering</Label>
                  <p className="text-sm text-muted-foreground">Steer dual-band clients to 5GHz</p>
                </div>
                <Switch
                  checked={formData.bandSteering}
                  onCheckedChange={(checked) => handleInputChange('bandSteering', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>MBO (Multi-Band Operation)</Label>
                  <p className="text-sm text-muted-foreground">Enhanced 802.11k/v features</p>
                </div>
                <Switch
                  checked={formData.mbo}
                  onCheckedChange={(checked) => handleInputChange('mbo', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Access Control Tab */}
        <TabsContent value="access" className="space-y-6">
          {/* QoS & Admission Control */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quality of Service (QoS)</CardTitle>
              <CardDescription>Traffic prioritization and admission control</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cos">Class of Service (CoS)</Label>
                <Select value={formData.defaultCoS} onValueChange={(value) => handleInputChange('defaultCoS', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select CoS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Best Effort)</SelectItem>
                    {cosOptions.map(cos => (
                      <SelectItem key={cos.id} value={cos.id}>
                        {cos.cosName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cosOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">No CoS options configured</p>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Bandwidth Limits</h4>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Enable Bandwidth Limiting</Label>
                    <p className="text-sm text-muted-foreground">Apply per-client bandwidth restrictions</p>
                  </div>
                  <Switch
                    checked={formData.bandwidthLimitEnabled}
                    onCheckedChange={(checked) => handleInputChange('bandwidthLimitEnabled', checked)}
                  />
                </div>

                {formData.bandwidthLimitEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="download-limit">Download Limit (Kbps)</Label>
                      <Input
                        id="download-limit"
                        type="number"
                        value={formData.downloadLimit}
                        onChange={(e) => handleInputChange('downloadLimit', parseInt(e.target.value) || 0)}
                        min="0"
                        max="1000000"
                      />
                      <p className="text-xs text-muted-foreground">0 = unlimited</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="upload-limit">Upload Limit (Kbps)</Label>
                      <Input
                        id="upload-limit"
                        type="number"
                        value={formData.uploadLimit}
                        onChange={(e) => handleInputChange('uploadLimit', parseInt(e.target.value) || 0)}
                        min="0"
                        max="1000000"
                      />
                      <p className="text-xs text-muted-foreground">0 = unlimited</p>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Admission Control</h4>
                <p className="text-xs text-muted-foreground">Require channel capacity before admitting traffic</p>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Video Traffic</Label>
                    <p className="text-sm text-muted-foreground">Require admission for video (AC_VI)</p>
                  </div>
                  <Switch
                    checked={formData.admissionControlVideo}
                    onCheckedChange={(checked) => handleInputChange('admissionControlVideo', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Voice Traffic</Label>
                    <p className="text-sm text-muted-foreground">Require admission for voice (AC_VO)</p>
                  </div>
                  <Switch
                    checked={formData.admissionControlVoice}
                    onCheckedChange={(checked) => handleInputChange('admissionControlVoice', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Best Effort Traffic</Label>
                    <p className="text-sm text-muted-foreground">Require admission for best effort (AC_BE)</p>
                  </div>
                  <Switch
                    checked={formData.admissionControlBestEffort}
                    onCheckedChange={(checked) => handleInputChange('admissionControlBestEffort', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Background Traffic</Label>
                    <p className="text-sm text-muted-foreground">Require admission for background (AC_BK)</p>
                  </div>
                  <Switch
                    checked={formData.admissionControlBackgroundTraffic}
                    onCheckedChange={(checked) => handleInputChange('admissionControlBackgroundTraffic', checked)}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>U-APSD (WMM Power Save)</Label>
                  <p className="text-sm text-muted-foreground">Unscheduled Automatic Power Save Delivery</p>
                </div>
                <Switch
                  checked={formData.uapsdEnabled}
                  onCheckedChange={(checked) => handleInputChange('uapsdEnabled', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Captive Portal & Hotspot */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Captive Portal & Guest Access</CardTitle>
              <CardDescription>Web authentication and guest portal settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Enable Captive Portal</Label>
                  <p className="text-sm text-muted-foreground">Require web authentication</p>
                </div>
                <Switch
                  checked={formData.captivePortal}
                  onCheckedChange={(checked) => handleInputChange('captivePortal', checked)}
                />
              </div>

              {formData.captivePortal && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="cp-type">Captive Portal Type</Label>
                    <Select value={formData.captivePortalType} onValueChange={(value) => handleInputChange('captivePortalType', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select portal type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="internal">Internal Portal</SelectItem>
                        <SelectItem value="external">External Portal</SelectItem>
                        <SelectItem value="custom">Custom Portal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="eguest-portal">eGuest Portal</Label>
                    <Select value={formData.eGuestPortalId || 'none'} onValueChange={(value) => handleInputChange('eGuestPortalId', value === 'none' ? '' : value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select eGuest portal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {eGuestProfiles.map(portal => (
                          <SelectItem key={portal.id} value={portal.id}>
                            {portal.name || portal.portalName || portal.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {eGuestProfiles.length === 0 && (
                      <p className="text-xs text-muted-foreground">No eGuest portals configured. Create one in Guest Access.</p>
                    )}
                  </div>
                </>
              )}

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Hotspot 2.0 / Passpoint</h4>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Enable Hotspot 2.0</Label>
                    <p className="text-sm text-muted-foreground">Standards-based guest access</p>
                  </div>
                  <Switch
                    checked={formData.hotspot}
                    onCheckedChange={(checked) => {
                      handleInputChange('hotspot', checked);
                      handleInputChange('hotspotType', checked ? 'Hotspot20' : 'Disabled');
                    }}
                  />
                </div>

                {formData.hotspot && (
                  <div className="space-y-2">
                    <Label htmlFor="hotspot-type">Hotspot Type</Label>
                    <Select value={formData.hotspotType} onValueChange={(value) => handleInputChange('hotspotType', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Disabled">Disabled</SelectItem>
                        <SelectItem value="Hotspot20">Hotspot 2.0 (Passpoint)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Guest Access</Label>
                  <p className="text-sm text-muted-foreground">Allow limited guest network access</p>
                </div>
                <Switch
                  checked={formData.guestAccess}
                  onCheckedChange={(checked) => handleInputChange('guestAccess', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* MAC-Based Auth & Client Limits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">MAC-Based Authentication & Client Limits</CardTitle>
              <CardDescription>Device authentication and connection limits</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>MAC-based Authentication</Label>
                  <p className="text-sm text-muted-foreground">Authenticate by MAC address</p>
                </div>
                <Switch
                  checked={formData.macBasedAuth}
                  onCheckedChange={(checked) => handleInputChange('macBasedAuth', checked)}
                />
              </div>

              {formData.macBasedAuth && (
                <div className="flex items-center justify-between pl-6">
                  <div className="space-y-1">
                    <Label>MAC-Based Authorization</Label>
                    <p className="text-sm text-muted-foreground">Require RADIUS authorization</p>
                  </div>
                  <Switch
                    checked={formData.mbaAuthorization}
                    onCheckedChange={(checked) => handleInputChange('mbaAuthorization', checked)}
                  />
                </div>
              )}

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Client Connection Limits</h4>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="max-clients">Max Clients (Total)</Label>
                    <Input
                      id="max-clients"
                      type="number"
                      value={formData.maxClients}
                      onChange={(e) => handleInputChange('maxClients', parseInt(e.target.value) || 0)}
                      min="1"
                      max="1000"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max-clients-24">2.4GHz Band</Label>
                    <Input
                      id="max-clients-24"
                      type="number"
                      value={formData.maxClientsPer24}
                      onChange={(e) => handleInputChange('maxClientsPer24', parseInt(e.target.value) || 0)}
                      min="1"
                      max="500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max-clients-5">5GHz Band</Label>
                    <Input
                      id="max-clients-5"
                      type="number"
                      value={formData.maxClientsPer5}
                      onChange={(e) => handleInputChange('maxClientsPer5', parseInt(e.target.value) || 0)}
                      min="1"
                      max="500"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Session Timeouts</h4>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pre-auth-timeout">Pre-Auth Idle (seconds)</Label>
                    <Input
                      id="pre-auth-timeout"
                      type="number"
                      value={formData.preAuthenticatedIdleTimeout}
                      onChange={(e) => handleInputChange('preAuthenticatedIdleTimeout', parseInt(e.target.value) || 0)}
                      min="0"
                      max="999999"
                    />
                    <p className="text-xs text-muted-foreground">Before authentication (default: 300)</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="post-auth-timeout">Post-Auth Idle (seconds)</Label>
                    <Input
                      id="post-auth-timeout"
                      type="number"
                      value={formData.postAuthenticatedIdleTimeout}
                      onChange={(e) => handleInputChange('postAuthenticatedIdleTimeout', parseInt(e.target.value) || 0)}
                      min="0"
                      max="999999"
                    />
                    <p className="text-xs text-muted-foreground">After authentication (default: 1800)</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="session-timeout">Session Timeout (seconds)</Label>
                    <Input
                      id="session-timeout"
                      type="number"
                      value={formData.sessionTimeout}
                      onChange={(e) => handleInputChange('sessionTimeout', parseInt(e.target.value) || 0)}
                      min="0"
                      max="999999"
                    />
                    <p className="text-xs text-muted-foreground">Max session duration (0 = unlimited)</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Settings Tab */}
        <TabsContent value="advanced" className="space-y-6">
          {/* Extreme Platform ONE Advanced Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Advanced Settings</CardTitle>
              <CardDescription>Extreme Platform ONE advanced WLAN configuration options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* MultiBand Operation */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label>MultiBand Operation</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-medium">MBO (Multi-Band Operation)</p>
                        <p className="text-xs opacity-80">Part of Wi-Fi Agile Multiband. Enables enhanced 802.11k/v features that help clients make better roaming decisions across 2.4GHz, 5GHz, and 6GHz bands.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-sm text-muted-foreground">Enhanced 802.11k/v features for multi-band steering</p>
                </div>
                <Switch
                  checked={formData.mbo}
                  onCheckedChange={(checked) => handleInputChange('mbo', checked)}
                />
              </div>

              {/* RADIUS Accounting */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>RADIUS Accounting</Label>
                  <p className="text-sm text-muted-foreground">Track user session and usage data via RADIUS</p>
                </div>
                <Switch
                  checked={formData.accountingEnabled}
                  onCheckedChange={(checked) => handleInputChange('accountingEnabled', checked)}
                />
              </div>

              {/* Hide SSID */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Hide SSID</Label>
                  <p className="text-sm text-muted-foreground">Do not broadcast SSID in beacons</p>
                </div>
                <Switch
                  checked={formData.hidden}
                  onCheckedChange={(checked) => {
                    handleInputChange('hidden', checked);
                    handleInputChange('broadcastSSID', !checked);
                  }}
                />
              </div>

              {/* Include Hostname */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Include Hostname</Label>
                  <p className="text-sm text-muted-foreground">Send client hostname to RADIUS server</p>
                </div>
                <Switch
                  checked={formData.includeHostname}
                  onCheckedChange={(checked) => handleInputChange('includeHostname', checked)}
                />
              </div>

              {/* FTM (11mc) responder support */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label>FTM (11mc) Responder Support</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-medium">Fine Timing Measurement (802.11mc)</p>
                        <p className="text-xs opacity-80">Enables Wi-Fi Round Trip Time (RTT) for indoor positioning. Allows clients to measure their distance from the AP with sub-meter accuracy for location-based services.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-sm text-muted-foreground">Enable 802.11mc location services</p>
                </div>
                <Switch
                  checked={formData.enable11mcSupport}
                  onCheckedChange={(checked) => handleInputChange('enable11mcSupport', checked)}
                />
              </div>

              {/* Radio Management (11k) support */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label>Radio Management (11k) Support</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-medium">Radio Resource Management (802.11k)</p>
                        <p className="text-xs opacity-80">Provides neighbor AP reports to clients, helping them discover nearby APs and make faster, smarter roaming decisions without scanning all channels.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-sm text-muted-foreground">Help clients find the best AP via neighbor reports</p>
                </div>
                <Switch
                  checked={formData.enabled11kSupport}
                  onCheckedChange={(checked) => handleInputChange('enabled11kSupport', checked)}
                />
              </div>

              {/* U-APSD (WMM-PS) */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label>U-APSD (WMM-PS)</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-medium">Unscheduled Automatic Power Save Delivery</p>
                        <p className="text-xs opacity-80">WMM Power Save feature that allows devices to sleep longer while maintaining quality for voice/video. Reduces battery drain on mobile devices without impacting real-time applications.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-sm text-muted-foreground">Unscheduled Automatic Power Save Delivery</p>
                </div>
                <Switch
                  checked={formData.uapsdEnabled}
                  onCheckedChange={(checked) => handleInputChange('uapsdEnabled', checked)}
                />
              </div>

              <Separator />

              {/* Admission Control Section */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Admission Control</h4>

                {/* Voice (VO) */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Use Admission Control for Voice (VO)</Label>
                    <p className="text-sm text-muted-foreground">Require channel capacity for voice traffic (AC_VO)</p>
                  </div>
                  <Switch
                    checked={formData.admissionControlVoice}
                    onCheckedChange={(checked) => handleInputChange('admissionControlVoice', checked)}
                  />
                </div>

                {/* Video (VI) */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Use Admission Control for Video (VI)</Label>
                    <p className="text-sm text-muted-foreground">Require channel capacity for video traffic (AC_VI)</p>
                  </div>
                  <Switch
                    checked={formData.admissionControlVideo}
                    onCheckedChange={(checked) => handleInputChange('admissionControlVideo', checked)}
                  />
                </div>

                {/* Best Effort (BE) */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Use Admission Control for Best Effort (BE)</Label>
                    <p className="text-sm text-muted-foreground">Require channel capacity for best effort traffic (AC_BE)</p>
                  </div>
                  <Switch
                    checked={formData.admissionControlBestEffort}
                    onCheckedChange={(checked) => handleInputChange('admissionControlBestEffort', checked)}
                  />
                </div>

                {/* Background (BK) */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Use Global Admission Control for Background (BK)</Label>
                    <p className="text-sm text-muted-foreground">Require channel capacity for background traffic (AC_BK)</p>
                  </div>
                  <Switch
                    checked={formData.admissionControlBackgroundTraffic}
                    onCheckedChange={(checked) => handleInputChange('admissionControlBackgroundTraffic', checked)}
                  />
                </div>
              </div>

              <Separator />

              {/* Client To Client Communication */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Client To Client Communication</Label>
                  <p className="text-sm text-muted-foreground">Allow wireless clients to communicate with each other</p>
                </div>
                <Switch
                  checked={formData.clientToClientCommunication}
                  onCheckedChange={(checked) => {
                    handleInputChange('clientToClientCommunication', checked);
                    handleInputChange('isolateClients', !checked);
                  }}
                />
              </div>

              {/* Clear Session on Disconnect */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Clear Session on Disconnect</Label>
                  <p className="text-sm text-muted-foreground">Purge client session data when disconnected</p>
                </div>
                <Switch
                  checked={formData.purgeOnDisconnect}
                  onCheckedChange={(checked) => handleInputChange('purgeOnDisconnect', checked)}
                />
              </div>

              {/* Beacon Protection */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label>Beacon Protection</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-medium">Beacon Protection (WPA3)</p>
                        <p className="text-xs opacity-80">Protects beacon frames from spoofing and tampering. Part of WPA3 security enhancements that prevents attackers from forging management frames.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-sm text-muted-foreground">Enhanced WPA3 security feature for beacon frames</p>
                </div>
                <Switch
                  checked={formData.beaconProtection}
                  onCheckedChange={(checked) => handleInputChange('beaconProtection', checked)}
                />
              </div>

              <Separator />

              {/* Timeout Settings */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Session Timeouts</h4>

                <div className="grid grid-cols-3 gap-4">
                  {/* Pre-Authenticated idle timeout */}
                  <div className="space-y-2">
                    <Label htmlFor="pre-auth-idle-timeout">Pre-Authenticated idle timeout (seconds)</Label>
                    <Input
                      id="pre-auth-idle-timeout"
                      type="number"
                      value={formData.preAuthenticatedIdleTimeout}
                      onChange={(e) => handleInputChange('preAuthenticatedIdleTimeout', parseInt(e.target.value) || 300)}
                      min="0"
                      max="999999"
                    />
                    <p className="text-xs text-muted-foreground">Default: 300</p>
                  </div>

                  {/* Post-Authenticated idle timeout */}
                  <div className="space-y-2">
                    <Label htmlFor="post-auth-idle-timeout">Post-Authenticated idle timeout (seconds)</Label>
                    <Input
                      id="post-auth-idle-timeout"
                      type="number"
                      value={formData.postAuthenticatedIdleTimeout}
                      onChange={(e) => handleInputChange('postAuthenticatedIdleTimeout', parseInt(e.target.value) || 1800)}
                      min="0"
                      max="999999"
                    />
                    <p className="text-xs text-muted-foreground">Default: 1800</p>
                  </div>

                  {/* Maximum session duration */}
                  <div className="space-y-2">
                    <Label htmlFor="max-session-duration">Maximum session duration (seconds)</Label>
                    <Input
                      id="max-session-duration"
                      type="number"
                      value={formData.sessionTimeout}
                      onChange={(e) => handleInputChange('sessionTimeout', parseInt(e.target.value) || 0)}
                      min="0"
                      max="999999"
                    />
                    <p className="text-xs text-muted-foreground">0 = unlimited</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Additional Client Management */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Additional Client Settings</CardTitle>
              <CardDescription>Extra client communication and behavior settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Client Isolation</Label>
                  <p className="text-sm text-muted-foreground">Prevent wireless client-to-client communication</p>
                </div>
                <Switch
                  checked={formData.isolateClients}
                  onCheckedChange={(checked) => {
                    handleInputChange('isolateClients', checked);
                    handleInputChange('clientToClientCommunication', !checked);
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Flexible Client Access</Label>
                  <p className="text-sm text-muted-foreground">Dynamic client access control</p>
                </div>
                <Switch
                  checked={formData.flexibleClientAccess}
                  onCheckedChange={(checked) => handleInputChange('flexibleClientAccess', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Roaming & Optimization */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Roaming & Optimization</CardTitle>
              <CardDescription>Client roaming and load distribution settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="roaming-policy">Roaming Assist Policy</Label>
                <Input
                  id="roaming-policy"
                  value={formData.roamingAssistPolicy}
                  onChange={(e) => handleInputChange('roamingAssistPolicy', e.target.value)}
                  placeholder="Roaming policy UUID (optional)"
                />
                <p className="text-xs text-muted-foreground">Advanced roaming optimization policy</p>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Load Balancing</Label>
                  <p className="text-sm text-muted-foreground">Distribute clients across APs</p>
                </div>
                <Switch
                  checked={formData.loadBalancing}
                  onCheckedChange={(checked) => handleInputChange('loadBalancing', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* RADIUS Vendor Attributes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">RADIUS Vendor-Specific Attributes</CardTitle>
              <CardDescription>Customize RADIUS attributes sent with authentication</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Vendor Attributes (comma-separated)</Label>
                <Input
                  value={formData.vendorSpecificAttributes.join(', ')}
                  onChange={(e) => {
                    const attrs = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                    handleInputChange('vendorSpecificAttributes', attrs);
                  }}
                  placeholder="apName, vnsName, ssid, etc."
                />
                <p className="text-xs text-muted-foreground">
                  Common attributes: apName, vnsName, ssid, apMac, apLocation
                </p>
              </div>

              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">
                  <strong>Current attributes:</strong> {formData.vendorSpecificAttributes.length > 0 ? formData.vendorSpecificAttributes.join(', ') : 'None'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Mesh & Special Features */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Mesh & Special Features</CardTitle>
              <CardDescription>Mesh networking and advanced features</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Shutdown on Meshpoint Loss</Label>
                  <p className="text-sm text-muted-foreground">Disable service if mesh backhaul is lost</p>
                </div>
                <Switch
                  checked={formData.shutdownOnMeshpointLoss}
                  onCheckedChange={(checked) => handleInputChange('shutdownOnMeshpointLoss', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end space-x-2 pt-4 border-t">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-2"
        >
          <Save className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
          <span>{saving ? 'Saving...' : 'Save Changes'}</span>
        </Button>
      </div>
    </div>
  );
}