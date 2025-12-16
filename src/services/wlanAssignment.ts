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

      // Build service payload with only the fields we want to send
      const servicePayload: any = {
        serviceName: serviceData.serviceName || serviceData.name,
        ssid: serviceData.ssid,
        security: serviceData.security,
        band: serviceData.band,
        enabled: serviceData.enabled,
      };

      // Add optional fields only if they have values
      if (serviceData.passphrase) servicePayload.passphrase = serviceData.passphrase;
      if (serviceData.vlan) servicePayload.vlan = serviceData.vlan;
      if (serviceData.authenticatedUserDefaultRoleID) servicePayload.authenticatedUserDefaultRoleID = serviceData.authenticatedUserDefaultRoleID;
      if (serviceData.hidden !== undefined) servicePayload.hidden = serviceData.hidden;
      if (serviceData.maxClients) servicePayload.maxClients = serviceData.maxClients;
      if (serviceData.description) servicePayload.description = serviceData.description;

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
   * Assign service to all profiles
   */
  private async assignToProfiles(
    serviceId: string,
    profiles: Profile[]
  ): Promise<AssignmentResult[]> {
    const results: AssignmentResult[] = [];

    // Process assignments in parallel (but limit concurrency to avoid overwhelming the API)
    const batchSize = 5;
    for (let i = 0; i < profiles.length; i += batchSize) {
      const batch = profiles.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (profile) => {
          try {
            await apiService.assignServiceToProfile(serviceId, profile.id);
            return {
              profileId: profile.id,
              profileName: profile.name || profile.profileName || profile.id,
              success: true
            };
          } catch (error) {
            return {
              profileId: profile.id,
              profileName: profile.name || profile.profileName || profile.id,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        })
      );

      results.push(...batchResults);
    }

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

      // Build service payload with only the fields we want to send
      // IMPORTANT: Do NOT include timeout fields unless they have valid values (>= 5)
      const servicePayload: any = {
        serviceName: serviceData.serviceName || serviceData.name,
        ssid: serviceData.ssid,
        security: serviceData.security,
        band: serviceData.band,
        enabled: serviceData.enabled,
      };

      // Add optional fields only if they have values
      if (serviceData.passphrase) servicePayload.passphrase = serviceData.passphrase;
      if (serviceData.vlan) servicePayload.vlan = serviceData.vlan;
      if (serviceData.authenticatedUserDefaultRoleID) servicePayload.authenticatedUserDefaultRoleID = serviceData.authenticatedUserDefaultRoleID;
      if (serviceData.hidden !== undefined) servicePayload.hidden = serviceData.hidden;
      if (serviceData.maxClients) servicePayload.maxClients = serviceData.maxClients;
      if (serviceData.description) servicePayload.description = serviceData.description;

      // Explicitly remove timeout fields that might have been included with invalid values
      // These should be omitted to let the API use its defaults
      console.log('[WLANAssignment] Service payload before cleanup:', JSON.stringify(servicePayload));

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
