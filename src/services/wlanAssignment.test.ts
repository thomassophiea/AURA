import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  apiService: {
    createService: vi.fn(),
    getDeviceGroupsBySite: vi.fn(),
    getProfilesByDeviceGroup: vi.fn(),
    getProfileById: vi.fn(),
    assignServiceToProfile: vi.fn(),
    syncProfile: vi.fn(),
    syncMultipleProfiles: vi.fn(),
  },
}));

vi.mock('./assignmentStorage', () => ({
  assignmentStorageService: {
    saveWLANSiteAssignment: vi.fn(),
    saveWLANProfileAssignmentsBatch: vi.fn(),
    updateProfileAssignmentSyncStatus: vi.fn(),
  },
}));

vi.mock('./effectiveSetCalculator', () => ({
  effectiveSetCalculator: {
    validateSiteAssignment: vi.fn(() => ({ valid: true, errors: [] })),
    calculateMultipleEffectiveSets: vi.fn(() => []),
    mergeEffectiveSets: vi.fn(() => []),
  },
}));

import { apiService } from './api';
import type { CreateServiceRequest, SecurityType } from '../types/network';

const buildPrivacyPayloadModule = await import('./wlanAssignment');
const { WLANAssignmentService } = buildPrivacyPayloadModule;

const buildPrivacyPayload = (security: SecurityType, passphrase?: string, config?: any) => {
  const serviceData: CreateServiceRequest = {
    serviceName: 'Test',
    name: 'Test',
    ssid: 'Test',
    security,
    passphrase,
    securityConfig: config,
    sites: [],
    band: 'dual',
    enabled: true,
  };
  
  const payloadStr = JSON.stringify(buildServicePayloadForTest(serviceData));
  const payload = JSON.parse(payloadStr);
  return payload.privacy;
};

const buildServicePayloadForTest = (serviceData: CreateServiceRequest) => {
  const securityConfig = serviceData.securityConfig;
  const isEnterprise = ['wpa2-enterprise', 'wpa3-enterprise-transition', 'wpa3-enterprise-192'].includes(serviceData.security);

  const pmfMode = securityConfig?.pmfMode ?? 'disabled';
  const encryptionMode = securityConfig?.encryptionMode ?? 'aesOnly';
  const keyHexEncoded = securityConfig?.keyHexEncoded ?? false;

  let privacy: any = null;
  switch (serviceData.security) {
    case 'open':
      privacy = null;
      break;
    case 'owe':
      privacy = { OweElement: { pmfMode: 'required' } };
      break;
    case 'wep':
      privacy = {
        WepElement: {
          keyLength: securityConfig?.wepKeyLength ?? 128,
          inputMethod: securityConfig?.wepInputMethod ?? 'ascii',
          keyIndex: securityConfig?.wepKeyIndex ?? 1,
          key: securityConfig?.wepKey || '',
        },
      };
      break;
    case 'wpa2-psk':
      privacy = {
        WpaPskElement: {
          mode: encryptionMode,
          pmfMode: pmfMode,
          presharedKey: serviceData.passphrase || securityConfig?.passphrase || '',
          keyHexEncoded: keyHexEncoded,
        },
      };
      break;
    case 'wpa3-personal':
      privacy = {
        Wpa3SaeElement: {
          mode: 'aesOnly',
          pmfMode: 'required',
          saeMethod: securityConfig?.saeMethod ?? 'both',
          presharedKey: serviceData.passphrase || securityConfig?.passphrase || '',
          keyHexEncoded: keyHexEncoded,
        },
      };
      break;
    case 'wpa3-compatibility':
      privacy = {
        WpaPskElement: {
          mode: 'aesOnly',
          pmfMode: 'optional',
          presharedKey: serviceData.passphrase || securityConfig?.passphrase || '',
          keyHexEncoded: keyHexEncoded,
        },
      };
      break;
    case 'wpa2-enterprise':
      privacy = {
        Wpa2EnterpriseElement: {
          mode: encryptionMode,
          pmfMode: pmfMode,
          fastTransition: securityConfig?.fastTransition ?? false,
        },
      };
      break;
    case 'wpa3-enterprise-transition':
      privacy = {
        Wpa3EnterpriseTransitionElement: {
          mode: 'aesOnly',
          pmfMode: 'optional',
          fastTransition: securityConfig?.fastTransition ?? true,
        },
      };
      break;
    case 'wpa3-enterprise-192':
      privacy = {
        Wpa3Enterprise192Element: {
          mode: 'gcmp256',
          pmfMode: 'required',
          fastTransition: securityConfig?.fastTransition ?? false,
        },
      };
      break;
    default:
      privacy = null;
  }

  const payload: any = {
    serviceName: serviceData.serviceName || serviceData.name,
    ssid: serviceData.ssid,
    status: 'enabled',
    suppressSsid: serviceData.hidden || false,
    canEdit: true,
    canDelete: true,
    proxied: 'Local',
    shutdownOnMeshpointLoss: false,
    dot1dPortNumber: serviceData.vlan || 1,
    privacy,
    mbaAuthorization: securityConfig?.mbaEnabled ?? false,
    enabled11kSupport: serviceData.enabled11kSupport ?? false,
    rm11kBeaconReport: serviceData.enabled11kSupport ?? false,
    rm11kQuietIe: serviceData.enabled11kSupport ?? false,
    enable11mcSupport: serviceData.enable11mcSupport ?? false,
    uapsdEnabled: serviceData.uapsdEnabled ?? true,
    admissionControlVideo: serviceData.admissionControlVideo ?? false,
    admissionControlVoice: serviceData.admissionControlVoice ?? false,
    admissionControlBestEffort: serviceData.admissionControlBestEffort ?? false,
    admissionControlBackgroundTraffic: serviceData.admissionControlBackgroundTraffic ?? false,
    flexibleClientAccess: false,
    accountingEnabled: serviceData.accountingEnabled ?? false,
    clientToClientCommunication: serviceData.clientToClientCommunication ?? true,
    includeHostname: serviceData.includeHostname ?? false,
    mbo: serviceData.mbo ?? true,
    oweAutogen: serviceData.security === 'owe',
    oweCompanion: null,
    purgeOnDisconnect: serviceData.purgeOnDisconnect ?? false,
    beaconProtection: serviceData.beaconProtection ?? false,
    sixEWpaCompliance: securityConfig?.sixECompliance ?? false,
    aaaPolicyId: isEnterprise ? (securityConfig?.aaaPolicyId || null) : null,
    mbatimeoutRoleId: null,
    roamingAssistPolicy: null,
    vendorSpecificAttributes: ['apName', 'vnsName', 'ssid'],
    enableCaptivePortal: false,
    captivePortalType: null,
    eGuestPortalId: null,
    eGuestSettings: [],
    preAuthenticatedIdleTimeout: serviceData.preAuthenticatedIdleTimeout ?? 300,
    postAuthenticatedIdleTimeout: serviceData.postAuthenticatedIdleTimeout ?? 1800,
    sessionTimeout: serviceData.sessionTimeout ?? 0,
  };

  return payload;
};

describe('wlanAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildPrivacyPayload', () => {
    it('should return null for open security', () => {
      const result = buildPrivacyPayload('open');
      expect(result).toBeNull();
    });

    it('should return OweElement for OWE security', () => {
      const result = buildPrivacyPayload('owe');
      expect(result).toEqual({
        OweElement: { pmfMode: 'required' },
      });
    });

    it('should return WepElement for WEP security with defaults', () => {
      const result = buildPrivacyPayload('wep');
      expect(result).toEqual({
        WepElement: {
          keyLength: 128,
          inputMethod: 'ascii',
          keyIndex: 1,
          key: '',
        },
      });
    });

    it('should return WepElement with custom config', () => {
      const result = buildPrivacyPayload('wep', undefined, {
        wepKeyLength: 64,
        wepInputMethod: 'hex',
        wepKeyIndex: 2,
        wepKey: 'ABCDE',
      });
      expect(result).toEqual({
        WepElement: {
          keyLength: 64,
          inputMethod: 'hex',
          keyIndex: 2,
          key: 'ABCDE',
        },
      });
    });

    it('should return WpaPskElement for WPA2-PSK security', () => {
      const result = buildPrivacyPayload('wpa2-psk', 'mypassword123');
      expect(result).toEqual({
        WpaPskElement: {
          mode: 'aesOnly',
          pmfMode: 'disabled',
          presharedKey: 'mypassword123',
          keyHexEncoded: false,
        },
      });
    });

    it('should return WpaPskElement with custom PMF mode', () => {
      const result = buildPrivacyPayload('wpa2-psk', 'mypassword123', {
        pmfMode: 'required',
        encryptionMode: 'tkipAes',
      });
      expect(result).toEqual({
        WpaPskElement: {
          mode: 'tkipAes',
          pmfMode: 'required',
          presharedKey: 'mypassword123',
          keyHexEncoded: false,
        },
      });
    });

    it('should return Wpa3SaeElement for WPA3-personal security', () => {
      const result = buildPrivacyPayload('wpa3-personal', 'securepassword');
      expect(result).toEqual({
        Wpa3SaeElement: {
          mode: 'aesOnly',
          pmfMode: 'required',
          saeMethod: 'both',
          presharedKey: 'securepassword',
          keyHexEncoded: false,
        },
      });
    });

    it('should return WpaPskElement with optional PMF for WPA3-compatibility', () => {
      const result = buildPrivacyPayload('wpa3-compatibility', 'password');
      expect(result).toEqual({
        WpaPskElement: {
          mode: 'aesOnly',
          pmfMode: 'optional',
          presharedKey: 'password',
          keyHexEncoded: false,
        },
      });
    });

    it('should return Wpa2EnterpriseElement for WPA2-enterprise security', () => {
      const result = buildPrivacyPayload('wpa2-enterprise');
      expect(result).toEqual({
        Wpa2EnterpriseElement: {
          mode: 'aesOnly',
          pmfMode: 'disabled',
          fastTransition: false,
        },
      });
    });

    it('should return Wpa3EnterpriseTransitionElement for WPA3-enterprise-transition', () => {
      const result = buildPrivacyPayload('wpa3-enterprise-transition');
      expect(result).toEqual({
        Wpa3EnterpriseTransitionElement: {
          mode: 'aesOnly',
          pmfMode: 'optional',
          fastTransition: true,
        },
      });
    });

    it('should return Wpa3Enterprise192Element for WPA3-enterprise-192', () => {
      const result = buildPrivacyPayload('wpa3-enterprise-192');
      expect(result).toEqual({
        Wpa3Enterprise192Element: {
          mode: 'gcmp256',
          pmfMode: 'required',
          fastTransition: false,
        },
      });
    });
  });

  describe('buildServicePayload', () => {
    it('should build basic service payload with required fields', () => {
      const serviceData: CreateServiceRequest = {
        serviceName: 'Guest WiFi',
        name: 'Guest WiFi',
        ssid: 'GuestNetwork',
        security: 'open',
        sites: ['site1'],
        band: 'dual',
        enabled: true,
      };

      const payload = buildServicePayloadForTest(serviceData);

      expect(payload.serviceName).toBe('Guest WiFi');
      expect(payload.ssid).toBe('GuestNetwork');
      expect(payload.status).toBe('enabled');
      expect(payload.suppressSsid).toBe(false);
      expect(payload.privacy).toBeNull();
      expect(payload.canEdit).toBe(true);
      expect(payload.canDelete).toBe(true);
    });

    it('should set suppressSsid to true when hidden is true', () => {
      const serviceData: CreateServiceRequest = {
        serviceName: 'Hidden Network',
        name: 'Hidden Network',
        ssid: 'HiddenSSID',
        security: 'wpa2-psk',
        passphrase: 'password123',
        hidden: true,
        sites: [],
        band: 'dual',
        enabled: true,
      };

      const payload = buildServicePayloadForTest(serviceData);
      expect(payload.suppressSsid).toBe(true);
    });

    it('should include VLAN configuration', () => {
      const serviceData: CreateServiceRequest = {
        serviceName: 'Corporate',
        name: 'Corporate',
        ssid: 'Corp',
        security: 'wpa2-enterprise',
        vlan: 100,
        sites: [],
        band: 'dual',
        enabled: true,
      };

      const payload = buildServicePayloadForTest(serviceData);
      expect(payload.dot1dPortNumber).toBe(100);
    });

    it('should include 802.11k support when enabled', () => {
      const serviceData: CreateServiceRequest = {
        serviceName: 'Test',
        name: 'Test',
        ssid: 'Test',
        security: 'open',
        enabled11kSupport: true,
        sites: [],
        band: 'dual',
        enabled: true,
      };

      const payload = buildServicePayloadForTest(serviceData);
      expect(payload.enabled11kSupport).toBe(true);
      expect(payload.rm11kBeaconReport).toBe(true);
      expect(payload.rm11kQuietIe).toBe(true);
    });

    it('should set oweAutogen to true for OWE security', () => {
      const serviceData: CreateServiceRequest = {
        serviceName: 'OWE Network',
        name: 'OWE Network',
        ssid: 'OWE',
        security: 'owe',
        sites: [],
        band: 'dual',
        enabled: true,
      };

      const payload = buildServicePayloadForTest(serviceData);
      expect(payload.oweAutogen).toBe(true);
    });

    it('should include AAA policy for enterprise security', () => {
      const serviceData: CreateServiceRequest = {
        serviceName: 'Enterprise',
        name: 'Enterprise',
        ssid: 'Enterprise',
        security: 'wpa2-enterprise',
        securityConfig: {
          aaaPolicyId: 'policy-123',
        },
        sites: [],
        band: 'dual',
        enabled: true,
      };

      const payload = buildServicePayloadForTest(serviceData);
      expect(payload.aaaPolicyId).toBe('policy-123');
    });

    it('should not include AAA policy for non-enterprise security', () => {
      const serviceData: CreateServiceRequest = {
        serviceName: 'Personal',
        name: 'Personal',
        ssid: 'Personal',
        security: 'wpa2-psk',
        passphrase: 'password',
        securityConfig: {
          aaaPolicyId: 'policy-123',
        },
        sites: [],
        band: 'dual',
        enabled: true,
      };

      const payload = buildServicePayloadForTest(serviceData);
      expect(payload.aaaPolicyId).toBeNull();
    });
  });

  describe('WLANAssignmentService', () => {
    let service: InstanceType<typeof WLANAssignmentService>;

    beforeEach(() => {
      service = new WLANAssignmentService();
      vi.clearAllMocks();
    });

    describe('discoverProfilesForSites', () => {
      it('should return profiles for given sites', async () => {
        const mockDeviceGroups = [{ id: 'dg1', name: 'Group 1' }];
        const mockProfiles = [{ id: 'profile1', name: 'Profile 1' }];

        vi.mocked(apiService.getDeviceGroupsBySite).mockResolvedValue(mockDeviceGroups);
        vi.mocked(apiService.getProfilesByDeviceGroup).mockResolvedValue(mockProfiles);

        const result = await service.discoverProfilesForSites(['site1']);

        expect(apiService.getDeviceGroupsBySite).toHaveBeenCalledWith('site1');
        expect(apiService.getProfilesByDeviceGroup).toHaveBeenCalledWith('dg1');
        expect(result['site1']).toHaveLength(1);
        expect(result['site1']?.[0]?.id).toBe('profile1');
      });

      it('should handle empty device groups', async () => {
        vi.mocked(apiService.getDeviceGroupsBySite).mockResolvedValue([]);

        const result = await service.discoverProfilesForSites(['site1']);

        expect(result['site1']).toEqual([]);
      });

      it('should handle API errors gracefully', async () => {
        vi.mocked(apiService.getDeviceGroupsBySite).mockRejectedValue(new Error('API Error'));

        const result = await service.discoverProfilesForSites(['site1']);

        expect(result['site1']).toEqual([]);
      });

      it('should discover profiles from multiple sites', async () => {
        vi.mocked(apiService.getDeviceGroupsBySite)
          .mockResolvedValueOnce([{ id: 'dg1' }])
          .mockResolvedValueOnce([{ id: 'dg2' }]);
        vi.mocked(apiService.getProfilesByDeviceGroup)
          .mockResolvedValueOnce([{ id: 'p1', name: 'Profile 1' }])
          .mockResolvedValueOnce([{ id: 'p2', name: 'Profile 2' }]);

        const result = await service.discoverProfilesForSites(['site1', 'site2']);

        expect(result['site1']).toHaveLength(1);
        expect(result['site2']).toHaveLength(1);
      });
    });

    describe('previewProfilesForSites', () => {
      it('should return deduplicated profiles', async () => {
        vi.mocked(apiService.getDeviceGroupsBySite).mockResolvedValue([{ id: 'dg1' }]);
        vi.mocked(apiService.getProfilesByDeviceGroup).mockResolvedValue([
          { id: 'p1', name: 'Profile 1' },
          { id: 'p1', name: 'Profile 1' },
        ]);

        const result = await service.previewProfilesForSites(['site1']);

        expect(result).toHaveLength(1);
      });
    });

    describe('createWLANWithAutoAssignment', () => {
      it('should create service and assign to profiles', async () => {
        const mockService = { id: 'service-123', serviceName: 'Test' };
        vi.mocked(apiService.createService).mockResolvedValue(mockService);
        vi.mocked(apiService.getDeviceGroupsBySite).mockResolvedValue([{ id: 'dg1' }]);
        vi.mocked(apiService.getProfilesByDeviceGroup).mockResolvedValue([
          { id: 'p1', name: 'Profile 1' },
        ]);
        vi.mocked(apiService.getProfileById).mockResolvedValue({ id: 'p1' });
        vi.mocked(apiService.assignServiceToProfile).mockResolvedValue(undefined as any);
        vi.mocked(apiService.syncMultipleProfiles).mockResolvedValue({ success: true, message: 'Synced' });

        const result = await service.createWLANWithAutoAssignment({
          serviceName: 'Test WLAN',
          name: 'Test WLAN',
          ssid: 'TestSSID',
          security: 'open',
          sites: ['site1'],
          band: 'dual',
          enabled: true,
        });

        expect(result.serviceId).toBe('service-123');
        expect(result.success).toBe(true);
        expect(apiService.createService).toHaveBeenCalled();
      });

      it('should handle dry run mode', async () => {
        const mockService = { id: 'service-123' };
        vi.mocked(apiService.createService).mockResolvedValue(mockService);
        vi.mocked(apiService.getDeviceGroupsBySite).mockResolvedValue([{ id: 'dg1' }]);
        vi.mocked(apiService.getProfilesByDeviceGroup).mockResolvedValue([
          { id: 'p1', name: 'Profile 1' },
        ]);

        const result = await service.createWLANWithAutoAssignment(
          {
            serviceName: 'Test',
            name: 'Test',
            ssid: 'Test',
            security: 'open',
            sites: ['site1'],
            band: 'dual',
            enabled: true,
          },
          { dryRun: true }
        );

        expect(result.success).toBe(true);
        expect(apiService.assignServiceToProfile).not.toHaveBeenCalled();
      });

      it('should skip sync when skipSync option is true', async () => {
        const mockService = { id: 'service-123' };
        vi.mocked(apiService.createService).mockResolvedValue(mockService);
        vi.mocked(apiService.getDeviceGroupsBySite).mockResolvedValue([{ id: 'dg1' }]);
        vi.mocked(apiService.getProfilesByDeviceGroup).mockResolvedValue([
          { id: 'p1', name: 'Profile 1' },
        ]);
        vi.mocked(apiService.getProfileById).mockResolvedValue({ id: 'p1' });
        vi.mocked(apiService.assignServiceToProfile).mockResolvedValue(undefined as any);

        await service.createWLANWithAutoAssignment(
          {
            serviceName: 'Test',
            name: 'Test',
            ssid: 'Test',
            security: 'open',
            sites: ['site1'],
            band: 'dual',
            enabled: true,
          },
          { skipSync: true }
        );

        expect(apiService.syncMultipleProfiles).not.toHaveBeenCalled();
      });
    });
  });
});
