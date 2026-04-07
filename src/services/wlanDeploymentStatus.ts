/**
 * WLAN Deployment Status Service
 *
 * Computes deployment status for WLANs and creates comprehensive site inventories
 * combining intended state (assignments) with observed state (actual broadcasts).
 */

import { assignmentStorageService } from './assignmentStorage';
import type {
  WLANDeploymentStatus,
  WLANWithDeploymentStatus,
  SiteWLANInventory,
  MismatchReason,
  Service,
  ObservedWLAN
} from '../types/network';

class WLANDeploymentStatusService {
  /**
   * Get deployment status for a WLAN
   */
  getWLANDeploymentStatus(wlanId: string): WLANDeploymentStatus {
    try {
      const siteAssignments = assignmentStorageService.getWLANSiteAssignments(wlanId);
      const profileAssignments = assignmentStorageService.getWLANProfileAssignments(wlanId);

      if (siteAssignments.length === 0) {
        return 'NOT_DEPLOYED';
      }

      // Check if there are any failed assignments
      const failedAssignments = profileAssignments.filter(
        pa => pa.syncStatus === 'FAILED' || pa.mismatch !== null
      );

      if (failedAssignments.length > 0 && failedAssignments.length < profileAssignments.length) {
        return 'PARTIALLY_DEPLOYED';
      }

      if (profileAssignments.length > 0) {
        return 'DEPLOYED';
      }

      // Has site assignments but no profile assignments yet (might be calculating)
      return 'DEPLOYED';
    } catch (error) {
      console.error('[WLANDeploymentStatus] Error getting deployment status:', error);
      return 'UNKNOWN';
    }
  }

  /**
   * Get WLAN with deployment status
   */
  getWLANWithStatus(wlan: Service): WLANWithDeploymentStatus {
    const deploymentStatus = this.getWLANDeploymentStatus(wlan.id);
    const siteAssignments = assignmentStorageService.getWLANSiteAssignments(wlan.id);
    const profileAssignments = assignmentStorageService.getWLANProfileAssignments(wlan.id);

    const totalSites = siteAssignments.length;
    const totalProfiles = profileAssignments.filter(pa => pa.expectedState === 'ASSIGNED').length;
    const mismatchCount = profileAssignments.filter(pa => pa.mismatch !== null).length;

    // Get last reconciliation time
    const lastReconciled = profileAssignments.length > 0
      ? profileAssignments
          .map(pa => pa.lastReconciled)
          .filter(Boolean)
          .sort()
          .reverse()[0]
      : undefined;

    return {
      ...wlan,
      deploymentStatus,
      totalSites,
      totalProfiles,
      mismatchCount,
      lastReconciled
    };
  }

  /**
   * Create comprehensive site WLAN inventory
   * Combines intended state (from assignments) with observed state (from API)
   */
  async createSiteInventory(
    siteId: string,
    siteName: string,
    intendedWLANs: Service[],
    profilesAtSite: any[],
    observedWLANs: ObservedWLAN[] = []
  ): Promise<SiteWLANInventory> {
    console.log('[WLANDeploymentStatus] Creating site inventory for', siteName);

    const intendedWLANsWithStatus = intendedWLANs.map(wlan => {
      // Get expected profile count from assignments
      const profileAssignments = assignmentStorageService
        .getWLANProfileAssignments(wlan.id)
        .filter(pa => pa.siteId === siteId && pa.expectedState === 'ASSIGNED');

      const expectedProfiles = profileAssignments.length;

      // Get actual profile count from API data
      const actualProfiles = profilesAtSite.filter(
        (p: any) => p.wlans?.some((w: any) => w.id === wlan.id)
      ).length;

      // Determine deployment status
      const deploymentStatus = this.getWLANDeploymentStatus(wlan.id);

      // Determine mismatch reason if any
      let mismatchReason: MismatchReason = null;

      if (expectedProfiles === 0) {
        mismatchReason = 'SITE_ASSIGNMENT_MISSING';
      } else if (expectedProfiles !== actualProfiles) {
        if (actualProfiles === 0) {
          mismatchReason = 'PROVISIONING_FAILED';
        } else {
          mismatchReason = 'MISSING_ASSIGNMENT';
        }
      }

      // Check if it's observed but not in intended
      const isObserved = observedWLANs.some(ow => ow.id === wlan.id || ow.ssid === wlan.ssid);
      if (!isObserved && expectedProfiles > 0) {
        mismatchReason = 'INTENDED_ONLY';
      }

      return {
        wlan,
        expectedProfiles,
        actualProfiles,
        deploymentStatus,
        mismatchReason
      };
    });

    // Find mismatches
    const mismatches = intendedWLANsWithStatus
      .filter(item => item.mismatchReason !== null)
      .map(item => ({
        wlanId: item.wlan.id,
        wlanName: item.wlan.ssid || item.wlan.name || item.wlan.id,
        reason: item.mismatchReason!,
        severity: this.getMismatchSeverity(item.mismatchReason!)
      }));

    // Check for observed-only WLANs (not in intended state)
    observedWLANs.forEach(observed => {
      const isIntended = intendedWLANs.some(
        wlan => wlan.id === observed.id || wlan.ssid === observed.ssid
      );

      if (!isIntended) {
        mismatches.push({
          wlanId: observed.id,
          wlanName: observed.ssid,
          reason: 'OBSERVED_ONLY',
          severity: 'warning'
        });
      }
    });

    return {
      siteId,
      siteName,
      intendedWLANs: intendedWLANsWithStatus,
      observedWLANs,
      mismatches,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get severity level for a mismatch reason
   */
  private getMismatchSeverity(reason: MismatchReason): 'error' | 'warning' | 'info' {
    switch (reason) {
      case 'WLAN_NOT_DEPLOYED':
      case 'PROVISIONING_FAILED':
      case 'PROFILE_DELETED':
        return 'error';

      case 'SITE_ASSIGNMENT_MISSING':
      case 'MISSING_ASSIGNMENT':
      case 'PROFILE_MAPPING_MISSING':
      case 'SYNC_FAILED':
        return 'warning';

      case 'OBSERVED_ONLY':
      case 'INTENDED_ONLY':
      case 'CACHE_STALE':
      case 'UNEXPECTED_ASSIGNMENT':
      case 'PROFILE_MOVED':
        return 'info';

      default:
        return 'info';
    }
  }

  /**
   * Get human-readable description for mismatch reason
   */
  getMismatchDescription(reason: MismatchReason): string {
    switch (reason) {
      case 'MISSING_ASSIGNMENT':
        return 'Expected assignment not found on some profiles';
      case 'UNEXPECTED_ASSIGNMENT':
        return 'WLAN found on profiles where not expected';
      case 'PROFILE_DELETED':
        return 'Target profile no longer exists';
      case 'PROFILE_MOVED':
        return 'Profile moved to different device group';
      case 'SYNC_FAILED':
        return 'Assignment created but sync to device failed';
      case 'WLAN_NOT_DEPLOYED':
        return 'WLAN has no deployment assignments';
      case 'SITE_ASSIGNMENT_MISSING':
        return 'Site has no assignment record for this WLAN';
      case 'PROFILE_MAPPING_MISSING':
        return 'Profile to site mapping is broken';
      case 'PROVISIONING_FAILED':
        return 'Provisioning job failed or stalled';
      case 'CACHE_STALE':
        return 'Cached data may be out of sync';
      case 'OBSERVED_ONLY':
        return 'WLAN is broadcasting but not in intended configuration';
      case 'INTENDED_ONLY':
        return 'WLAN is configured but not observed broadcasting';
      default:
        return 'Unknown mismatch';
    }
  }

  /**
   * Get badge variant for mismatch reason
   */
  getMismatchBadgeVariant(reason: MismatchReason): 'default' | 'destructive' | 'outline' | 'secondary' {
    const severity = this.getMismatchSeverity(reason);
    switch (severity) {
      case 'error':
        return 'destructive';
      case 'warning':
        return 'default';
      case 'info':
        return 'outline';
      default:
        return 'secondary';
    }
  }

  /**
   * Check if WLAN needs deployment
   */
  needsDeployment(wlanId: string): boolean {
    const status = this.getWLANDeploymentStatus(wlanId);
    return status === 'NOT_DEPLOYED';
  }

  /**
   * Get deployment summary for WLAN
   */
  getDeploymentSummary(wlanId: string): {
    status: WLANDeploymentStatus;
    sites: number;
    profiles: number;
    mismatches: number;
    needsAction: boolean;
  } {
    const status = this.getWLANDeploymentStatus(wlanId);
    const siteAssignments = assignmentStorageService.getWLANSiteAssignments(wlanId);
    const profileAssignments = assignmentStorageService.getWLANProfileAssignments(wlanId);

    const sites = siteAssignments.length;
    const profiles = profileAssignments.filter(pa => pa.expectedState === 'ASSIGNED').length;
    const mismatches = profileAssignments.filter(pa => pa.mismatch !== null).length;

    const needsAction =
      status === 'NOT_DEPLOYED' ||
      status === 'PARTIALLY_DEPLOYED' ||
      mismatches > 0;

    return {
      status,
      sites,
      profiles,
      mismatches,
      needsAction
    };
  }
}

export const wlanDeploymentStatusService = new WLANDeploymentStatusService();
