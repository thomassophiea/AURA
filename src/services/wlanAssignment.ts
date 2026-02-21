import { apiService } from './api';
import type {
  CreateServiceRequest,
  AutoAssignmentResponse,
  AssignmentResult,
  SyncResult,
  DeviceGroup,
  Profile
} from '../types/network';

/**
 * Build Extreme Platform ONE API compliant service payload from form data
 * Uses form values with controller defaults as fallbacks
 */
function buildServicePayload(serviceData: CreateServiceRequest): any {
  const payload: any = {
    // Basic identification
    serviceName: serviceData.serviceName || serviceData.name,
    ssid: serviceData.ssid,
    status: 'enabled',
    suppressSsid: serviceData.hidden || false,

    // Required flags
    canEdit: true,
    canDelete: true,
    proxied: 'Local',
    shutdownOnMeshpointLoss: false,

    // VLAN configuration
    dot1dPortNumber: serviceData.vlan || 99,

    // Security configuration - set below based on security type
    privacy: null,

    // 802.11k/v/r support (from form with defaults)
    enabled11kSupport: serviceData.enabled11kSupport ?? false,
    rm11kBeaconReport: serviceData.enabled11kSupport ?? false,
    rm11kQuietIe: serviceData.enabled11kSupport ?? false,
    enable11mcSupport: serviceData.enable11mcSupport ?? false,

    // QoS settings (from form with defaults)
    uapsdEnabled: serviceData.uapsdEnabled ?? true,
    admissionControlVideo: serviceData.admissionControlVideo ?? false,
    admissionControlVoice: serviceData.admissionControlVoice ?? false,
    admissionControlBestEffort: serviceData.admissionControlBestEffort ?? false,
    admissionControlBackgroundTraffic: serviceData.admissionControlBackgroundTraffic ?? false,

    // Advanced features (from form with defaults)
    flexibleClientAccess: false,
    mbaAuthorization: false,
    accountingEnabled: serviceData.accountingEnabled ?? false,
    clientToClientCommunication: serviceData.clientToClientCommunication ?? true,
    includeHostname: serviceData.includeHostname ?? false,
    mbo: serviceData.mbo ?? true,
    oweAutogen: false,
    oweCompanion: null,
    purgeOnDisconnect: serviceData.purgeOnDisconnect ?? false,
    beaconProtection: serviceData.beaconProtection ?? false,

    // Policies
    aaaPolicyId: null,
    mbatimeoutRoleId: null,
    roamingAssistPolicy: null,

    // Vendor attributes
    vendorSpecificAttributes: ['apName', 'vnsName', 'ssid'],

    // Captive portal
    enableCaptivePortal: false,
    captivePortalType: null,
    eGuestPortalId: null,
    eGuestSettings: [],

    // Timeouts (from form with defaults)
    preAuthenticatedIdleTimeout: serviceData.preAuthenticatedIdleTimeout ?? 300,
    postAuthenticatedIdleTimeout: serviceData.postAuthenticatedIdleTimeout ?? 1800,
    sessionTimeout: serviceData.sessionTimeout ?? 0,

    // Topology and CoS (using default UUIDs from existing services)
    defaultTopology: 'efd5f044-26c8-11e7-93ae-92361f002671',
    defaultCoS: '1eea4d66-2607-11e7-93ae-92361f002671',

    // Roles
    unAuthenticatedUserDefaultRoleID: serviceData.authenticatedUserDefaultRoleID || null,
    authenticatedUserDefaultRoleID: serviceData.authenticatedUserDefaultRoleID || null,
    cpNonAuthenticatedPolicyName: null,

    // Hotspot 2.0
    hotspotType: 'Disabled',
    hotspot: null,

    // DSCP code points mapping (controller defaults)
    dscp: {
      codePoints: [
        2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 2, 0,
        1, 0, 3, 0, 3, 0, 3, 0, 3, 0, 4, 0, 4, 0, 4, 0,
        4, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 6, 0,
        6, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0
      ]
    },

    // Features
    features: ['CENTRALIZED-SITE']
  };

  // Configure security based on type
  if (serviceData.security === 'wpa2-psk' && serviceData.passphrase) {
    payload.privacy = {
      WpaPskElement: {
        mode: 'aesOnly',
        pmfMode: 'disabled',
        presharedKey: serviceData.passphrase,
        keyHexEncoded: false
      }
    };
  } else if (serviceData.security === 'open') {
    payload.privacy = null;
  }

  // Add optional description if provided
  if (serviceData.description) {
    payload.description = serviceData.description;
  }

  return payload;
}

/**
 * Service for orchestrating automatic WLAN-to-Profile assignment
 *
 * Workflow:
 * 1. Create WLAN/Service
 * 2. Discover device groups for selected sites
 * 3. Discover profiles for those device groups
 * 4. Assign WLAN to each profile
 * 5. Trigger profile synchronization
 */
export class WLANAssignmentService {
  /**
   * Main workflow: Create WLAN and auto-assign to profiles
   */
  async createWLANWithAutoAssignment(
    serviceData: CreateServiceRequest,
    options: {
      dryRun?: boolean; // Preview without committing
      skipSync?: boolean; // Skip profile sync step
    } = {}
  ): Promise<AutoAssignmentResponse> {
    console.log('[WLANAssignment] Starting auto-assignment workflow', { serviceData, options });

    try {
      // Step 1: Create the WLAN/Service
      console.log('[WLANAssignment] Step 1: Creating service...');

      const servicePayload = buildServicePayload(serviceData);
      console.log('[WLANAssignment] Service payload:', JSON.stringify(servicePayload));

      const service = await apiService.createService(servicePayload);

      console.log('[WLANAssignment] Service created:', service.id);

      // Step 2: Discover profiles for selected sites
      console.log('[WLANAssignment] Step 2: Discovering profiles for sites:', serviceData.sites);
      const profileMap = await this.discoverProfilesForSites(serviceData.sites);

      const allProfiles = Object.values(profileMap).flat();
      const uniqueProfiles = this.deduplicateProfiles(allProfiles);

      console.log('[WLANAssignment] Discovered profiles:', {
        totalProfiles: allProfiles.length,
        uniqueProfiles: uniqueProfiles.length,
        deviceGroupsFound: Object.keys(profileMap).length
      });

      if (options.dryRun) {
        console.log('[WLANAssignment] Dry run mode - skipping assignment and sync');
        return {
          serviceId: service.id,
          sitesProcessed: serviceData.sites.length,
          deviceGroupsFound: Object.keys(profileMap).length,
          profilesAssigned: 0,
          assignments: uniqueProfiles.map(p => ({
            profileId: p.id,
            profileName: p.name || p.profileName || p.id,
            success: true,
            error: 'Dry run - not executed'
          })),
          success: true
        };
      }

      // Step 3: Assign service to each profile
      console.log('[WLANAssignment] Step 3: Assigning service to profiles...');
      const assignments = await this.assignToProfiles(service.id, uniqueProfiles);

      const successfulAssignments = assignments.filter(a => a.success);
      const failedAssignments = assignments.filter(a => !a.success);

      console.log('[WLANAssignment] Assignment results:', {
        successful: successfulAssignments.length,
        failed: failedAssignments.length
      });

      // Step 4: Trigger profile synchronization
      let syncResults: SyncResult[] | undefined;
      if (!options.skipSync && successfulAssignments.length > 0) {
        console.log('[WLANAssignment] Step 4: Triggering profile sync...');
        syncResults = await this.syncProfiles(
          successfulAssignments.map(a => a.profileId)
        );
        console.log('[WLANAssignment] Sync completed');
      }

      const response: AutoAssignmentResponse = {
        serviceId: service.id,
        sitesProcessed: serviceData.sites.length,
        deviceGroupsFound: Object.keys(profileMap).length,
        profilesAssigned: successfulAssignments.length,
        assignments,
        syncResults,
        success: failedAssignments.length === 0,
        errors: failedAssignments.length > 0
          ? [`${failedAssignments.length} profile(s) failed to assign`]
          : undefined
      };

      console.log('[WLANAssignment] Workflow completed:', response);
      return response;

    } catch (error) {
      console.error('[WLANAssignment] Workflow failed:', error);
      throw error;
    }
  }

  /**
   * Discover all profiles within the selected sites
   */
  async discoverProfilesForSites(
    siteIds: string[]
  ): Promise<Record<string, Profile[]>> {
    const profileMap: Record<string, Profile[]> = {};

    for (const siteId of siteIds) {
      try {
        console.log(`[WLANAssignment] Fetching device groups for site: ${siteId}`);

        // Fetch device groups for this site
        const deviceGroups: DeviceGroup[] = await apiService.getDeviceGroupsBySite(siteId);

        console.log(`[WLANAssignment] Found ${deviceGroups.length} device groups for site ${siteId}`);

        // Fetch profiles for each device group
        const profiles: Profile[] = [];
        for (const group of deviceGroups) {
          try {
            console.log(`[WLANAssignment] Fetching profiles for device group: ${group.id}`);
            const groupProfiles: Profile[] = await apiService.getProfilesByDeviceGroup(group.id);

            // Add device group info to each profile for reference
            const enrichedProfiles = groupProfiles.map(p => ({
              ...p,
              deviceGroupId: group.id,
              siteName: siteId
            }));

            profiles.push(...enrichedProfiles);
            console.log(`[WLANAssignment] Found ${groupProfiles.length} profiles in group ${group.id}`);
          } catch (error) {
            console.warn(`[WLANAssignment] Error fetching profiles for device group ${group.id}:`, error);
          }
        }

        profileMap[siteId] = profiles;
      } catch (error) {
        console.error(`[WLANAssignment] Error discovering profiles for site ${siteId}:`, error);
        profileMap[siteId] = [];
      }
    }

    return profileMap;
  }

  /**
   * Deduplicate profiles (same profile might be in multiple sites)
   */
  private deduplicateProfiles(profiles: Profile[]): Profile[] {
    const seen = new Map<string, Profile>();

    for (const profile of profiles) {
      if (!seen.has(profile.id)) {
        seen.set(profile.id, profile);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Assign service to all profiles with resilient error handling
   * Continues even if some profiles fail - returns partial success results
   */
  private async assignToProfiles(
    serviceId: string,
    profiles: Profile[]
  ): Promise<AssignmentResult[]> {
    const results: AssignmentResult[] = [];
    let successCount = 0;
    let failCount = 0;

    console.log(`[WLANAssignment] Starting assignment to ${profiles.length} profiles...`);

    // Process assignments in parallel (but limit concurrency to avoid overwhelming the API)
    const batchSize = 5;
    for (let i = 0; i < profiles.length; i += batchSize) {
      const batch = profiles.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(profiles.length / batchSize);
      
      console.log(`[WLANAssignment] Processing batch ${batchNum}/${totalBatches}...`);

      const batchResults = await Promise.all(
        batch.map(async (profile) => {
          const profileName = profile.name || profile.profileName || profile.id;
          try {
            // First verify the profile exists and is accessible
            const profileData = await apiService.getProfile(profile.id).catch(() => null);
            if (!profileData) {
              console.warn(`[WLANAssignment] Profile ${profileName} not found or inaccessible, skipping`);
              failCount++;
              return {
                profileId: profile.id,
                profileName,
                success: false,
                error: 'Profile not found or inaccessible',
                skipped: true
              };
            }

            await apiService.assignServiceToProfile(serviceId, profile.id);
            successCount++;
            console.log(`[WLANAssignment] ✓ Assigned to profile: ${profileName}`);
            return {
              profileId: profile.id,
              profileName,
              success: true
            };
          } catch (error) {
            failCount++;
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[WLANAssignment] ✗ Failed to assign to profile ${profileName}: ${errorMsg}`);
            return {
              profileId: profile.id,
              profileName,
              success: false,
              error: errorMsg
            };
          }
        })
      );

      results.push(...batchResults);
    }

    console.log(`[WLANAssignment] Assignment complete: ${successCount} succeeded, ${failCount} failed`);
    return results;
  }

  /**
   * Trigger profile synchronization
   */
  private async syncProfiles(profileIds: string[]): Promise<SyncResult[]> {
    try {
      // Try batch sync first
      await apiService.syncMultipleProfiles(profileIds);

      // If batch sync succeeds, return success for all
      return profileIds.map(id => ({
        profileId: id,
        profileName: id,
        success: true,
        syncTime: new Date().toISOString()
      }));
    } catch (error) {
      console.warn('[WLANAssignment] Batch sync failed, falling back to individual syncs');

      // Fall back to individual syncs
      return Promise.all(
        profileIds.map(async (profileId) => {
          try {
            await apiService.syncProfile(profileId);
            return {
              profileId,
              profileName: profileId,
              success: true,
              syncTime: new Date().toISOString()
            };
          } catch (err) {
            return {
              profileId,
              profileName: profileId,
              success: false,
              error: err instanceof Error ? err.message : 'Unknown error'
            };
          }
        })
      );
    }
  }

  /**
   * Preview profiles that would be assigned (for UI preview)
   */
  async previewProfilesForSites(siteIds: string[]): Promise<Profile[]> {
    const profileMap = await this.discoverProfilesForSites(siteIds);
    const allProfiles = Object.values(profileMap).flat();
    return this.deduplicateProfiles(allProfiles);
  }

  /**
   * Site-centric WLAN deployment with deployment modes
   *
   * Creates WLAN and assigns to profiles based on site-level deployment configuration.
   * Supports three deployment modes:
   * - ALL_PROFILES_AT_SITE: Assign to all profiles at each site
   * - INCLUDE_ONLY: Assign only to specified profiles
   * - EXCLUDE_SOME: Assign to all except specified profiles
   *
   * @param serviceData - WLAN/Service configuration
   * @param siteAssignments - Array of site assignments with deployment modes
   * @param options - Optional settings (dryRun, skipSync)
   * @returns AutoAssignmentResponse with assignment results
   */
  async createWLANWithSiteCentricDeployment(
    serviceData: CreateServiceRequest,
    siteAssignments: Array<{
      siteId: string;
      siteName: string;
      deploymentMode: 'ALL_PROFILES_AT_SITE' | 'INCLUDE_ONLY' | 'EXCLUDE_SOME';
      includedProfiles?: string[];
      excludedProfiles?: string[];
    }>,
    options: {
      dryRun?: boolean;
      skipSync?: boolean;
    } = {}
  ): Promise<AutoAssignmentResponse> {
    console.log('[WLANAssignment] Starting site-centric deployment workflow', {
      serviceData,
      siteAssignments,
      options
    });

    // Import services dynamically to avoid circular dependencies
    const { assignmentStorageService } = await import('./assignmentStorage');
    const { effectiveSetCalculator } = await import('./effectiveSetCalculator');

    try {
      // Step 1: Validate site assignments
      console.log('[WLANAssignment] Step 1: Validating site assignments...');
      for (const assignment of siteAssignments) {
        const validation = effectiveSetCalculator.validateSiteAssignment(assignment);
        if (!validation.valid) {
          throw new Error(`Invalid site assignment for ${assignment.siteName}: ${validation.errors.join(', ')}`);
        }
      }

      // Step 2: Discover profiles for all sites
      console.log('[WLANAssignment] Step 2: Discovering profiles for sites...');
      const siteIds = siteAssignments.map(a => a.siteId);
      const profileMap = await this.discoverProfilesForSites(siteIds);

      // Step 3: Calculate effective profile sets
      console.log('[WLANAssignment] Step 3: Calculating effective profile sets...');
      const profilesBySite = new Map<string, Profile[]>();
      for (const [siteId, profiles] of Object.entries(profileMap)) {
        profilesBySite.set(siteId, profiles);
      }

      const effectiveSets = effectiveSetCalculator.calculateMultipleEffectiveSets(
        siteAssignments,
        profilesBySite
      );

      // Merge all effective sets to get final profile list
      const profilesToAssign = effectiveSetCalculator.mergeEffectiveSets(effectiveSets);

      console.log('[WLANAssignment] Effective profile sets calculated:', {
        sites: effectiveSets.length,
        totalProfiles: profilesToAssign.length
      });

      if (options.dryRun) {
        console.log('[WLANAssignment] Dry run mode - skipping actual deployment');
        return {
          serviceId: 'dry-run',
          sitesProcessed: siteAssignments.length,
          deviceGroupsFound: 0,
          profilesAssigned: 0,
          assignments: profilesToAssign.map(p => ({
            profileId: p.id,
            profileName: p.name || p.profileName || p.id,
            success: true,
            error: 'Dry run - not executed'
          })),
          success: true
        };
      }

      // Step 4: Create the WLAN/Service
      console.log('[WLANAssignment] Step 4: Creating service...');

      const servicePayload = buildServicePayload(serviceData);
      console.log('[WLANAssignment] Service payload:', JSON.stringify(servicePayload));

      const service = await apiService.createService(servicePayload);

      const wlanId = service.id;
      const wlanName = service.serviceName || service.name || service.ssid || wlanId;
      console.log('[WLANAssignment] Service created:', { wlanId, wlanName });

      // Step 5: Assign service to profiles
      console.log('[WLANAssignment] Step 5: Assigning service to profiles...');
      const assignments = await this.assignToProfiles(wlanId, profilesToAssign);

      const successfulAssignments = assignments.filter(a => a.success);
      const failedAssignments = assignments.filter(a => !a.success);

      console.log('[WLANAssignment] Assignment results:', {
        successful: successfulAssignments.length,
        failed: failedAssignments.length
      });

      // Step 6: Save assignment tracking data
      console.log('[WLANAssignment] Step 6: Saving assignment tracking data...');

      // Save site assignments
      for (const siteAssignment of siteAssignments) {
        assignmentStorageService.saveWLANSiteAssignment({
          wlanId,
          wlanName,
          siteId: siteAssignment.siteId,
          siteName: siteAssignment.siteName,
          deploymentMode: siteAssignment.deploymentMode,
          includedProfiles: siteAssignment.includedProfiles || [],
          excludedProfiles: siteAssignment.excludedProfiles || [],
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString()
        });
      }

      // Save profile assignments
      const profileAssignments = profilesToAssign.map(profile => {
        const assignment = assignments.find(a => a.profileId === profile.id);
        const siteAssignment = siteAssignments.find(sa => {
          const profiles = profileMap[sa.siteId] || [];
          return profiles.some(p => p.id === profile.id);
        });

        return {
          wlanId,
          wlanName,
          profileId: profile.id,
          profileName: profile.name || profile.profileName || profile.id,
          siteId: siteAssignment?.siteId || '',
          siteName: siteAssignment?.siteName || '',
          source: 'SITE_PROPAGATION' as const,
          expectedState: 'ASSIGNED' as const,
          actualState: (assignment?.success ? 'ASSIGNED' : 'UNKNOWN') as const,
          mismatch: null,
          lastReconciled: new Date().toISOString(),
          syncStatus: 'PENDING' as const
        };
      });

      assignmentStorageService.saveWLANProfileAssignmentsBatch(profileAssignments);

      // Step 7: Trigger profile synchronization
      let syncResults;
      if (!options.skipSync && successfulAssignments.length > 0) {
        console.log('[WLANAssignment] Step 7: Triggering profile sync...');
        syncResults = await this.syncProfiles(
          successfulAssignments.map(a => a.profileId)
        );

        // Update sync status in storage
        for (const syncResult of syncResults) {
          assignmentStorageService.updateProfileAssignmentSyncStatus(
            wlanId,
            syncResult.profileId,
            syncResult.success ? 'SYNCED' : 'FAILED',
            syncResult.error
          );
        }

        console.log('[WLANAssignment] Sync completed');
      }

      const response: AutoAssignmentResponse = {
        serviceId: wlanId,
        sitesProcessed: siteAssignments.length,
        deviceGroupsFound: Object.keys(profileMap).length,
        profilesAssigned: successfulAssignments.length,
        assignments,
        syncResults,
        success: failedAssignments.length === 0,
        errors: failedAssignments.length > 0
          ? [`${failedAssignments.length} profile(s) failed to assign`]
          : undefined
      };

      console.log('[WLANAssignment] Site-centric deployment completed:', response);
      return response;

    } catch (error) {
      console.error('[WLANAssignment] Site-centric deployment failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const wlanAssignmentService = new WLANAssignmentService();
