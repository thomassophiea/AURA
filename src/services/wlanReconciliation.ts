/**
 * WLAN Reconciliation Service
 *
 * Compares expected vs actual WLAN assignments and generates remediation actions.
 * Detects mismatches between tracked assignments and actual API state.
 */

import { apiService } from './api';
import { assignmentStorageService } from './assignmentStorage';
import type {
  WLANProfileAssignment,
  ReconciliationResult,
  RemediationAction,
  MismatchReason
} from '../types/network';

/**
 * WLAN Reconciliation Service Class
 */
class WLANReconciliationService {
  /**
   * Reconcile a single WLAN
   * Compares expected profile assignments with actual API state
   *
   * @param wlanId - WLAN ID to reconcile
   * @returns ReconciliationResult with mismatch details
   */
  async reconcileWLAN(wlanId: string): Promise<ReconciliationResult> {

    try {
      // Get expected assignments from storage
      const profileAssignments = assignmentStorageService.getWLANProfileAssignments(wlanId);

      if (profileAssignments.length === 0) {
        console.warn(`[WLANReconciliation] No tracked assignments found for WLAN: ${wlanId}`);
        return {
          wlanId,
          wlanName: wlanId,
          totalExpected: 0,
          totalActual: 0,
          matched: 0,
          mismatched: 0,
          mismatches: [],
          timestamp: new Date().toISOString()
        };
      }

      const wlanName = profileAssignments[0]?.wlanName || wlanId;

      // Fetch actual profile states from API
      const updatedAssignments: WLANProfileAssignment[] = [];
      let matched = 0;
      let mismatched = 0;

      for (const assignment of profileAssignments) {
        const { actualState, mismatch } = await this.checkProfileState(
          wlanId,
          assignment.profileId,
          assignment.expectedState
        );

        // Update assignment with actual state
        const updated: WLANProfileAssignment = {
          ...assignment,
          actualState,
          mismatch,
          lastReconciled: new Date().toISOString()
        };

        // Save updated state to storage
        assignmentStorageService.saveWLANProfileAssignment(updated);

        updatedAssignments.push(updated);

        if (mismatch === null) {
          matched++;
        } else {
          mismatched++;
        }
      }

      // Filter for actual mismatches only
      const mismatchList = updatedAssignments.filter(a => a.mismatch !== null);

      const result: ReconciliationResult = {
        wlanId,
        wlanName,
        totalExpected: profileAssignments.length,
        totalActual: updatedAssignments.filter(a => a.actualState === 'ASSIGNED').length,
        matched,
        mismatched,
        mismatches: mismatchList,
        timestamp: new Date().toISOString()
      };

      return result;

    } catch (error) {
      console.error(`[WLANReconciliation] Reconciliation failed for WLAN ${wlanId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a profile has the WLAN assigned
   *
   * @param wlanId - WLAN ID
   * @param profileId - Profile ID
   * @param expectedState - Expected assignment state
   * @returns Actual state and mismatch reason (if any)
   */
  private async checkProfileState(
    wlanId: string,
    profileId: string,
    expectedState: 'ASSIGNED' | 'NOT_ASSIGNED'
  ): Promise<{
    actualState: 'ASSIGNED' | 'NOT_ASSIGNED' | 'UNKNOWN';
    mismatch: MismatchReason;
  }> {
    try {
      // Fetch profile from API
      const profile = await apiService.getProfileById(profileId);

      if (!profile) {
        return {
          actualState: 'UNKNOWN',
          mismatch: 'PROFILE_DELETED'
        };
      }

      // Check if WLAN is in profile's services list
      const hasWLAN = profile.services?.includes(wlanId) || false;
      const actualState: 'ASSIGNED' | 'NOT_ASSIGNED' = hasWLAN ? 'ASSIGNED' : 'NOT_ASSIGNED';

      // Determine mismatch
      let mismatch: MismatchReason = null;

      if (expectedState === 'ASSIGNED' && actualState === 'NOT_ASSIGNED') {
        mismatch = 'MISSING_ASSIGNMENT';
      } else if (expectedState === 'NOT_ASSIGNED' && actualState === 'ASSIGNED') {
        mismatch = 'UNEXPECTED_ASSIGNMENT';
      }

      return { actualState, mismatch };

    } catch (error) {
      console.warn(`[WLANReconciliation] Error checking profile ${profileId}:`, error);
      return {
        actualState: 'UNKNOWN',
        mismatch: 'PROFILE_DELETED'
      };
    }
  }

  /**
   * Reconcile all tracked WLANs
   *
   * @returns Array of reconciliation results
   */
  async reconcileAllWLANs(): Promise<ReconciliationResult[]> {

    const wlanIds = assignmentStorageService.getAllTrackedWLANs();

    const results: ReconciliationResult[] = [];

    for (const wlanId of wlanIds) {
      try {
        const result = await this.reconcileWLAN(wlanId);
        results.push(result);
      } catch (error) {
        console.error(`[WLANReconciliation] Failed to reconcile WLAN ${wlanId}:`, error);
      }
    }

    return results;
  }

  /**
   * Generate remediation actions from mismatches
   *
   * @param mismatches - Array of profile assignments with mismatches
   * @returns Array of remediation actions
   */
  generateRemediationActions(mismatches: WLANProfileAssignment[]): RemediationAction[] {

    const actions: RemediationAction[] = [];

    for (const mismatch of mismatches) {
      if (!mismatch.mismatch) continue;

      let actionType: RemediationAction['type'];
      let reason: string;

      switch (mismatch.mismatch) {
        case 'MISSING_ASSIGNMENT':
          actionType = 'ADD_ASSIGNMENT';
          reason = `Profile expected to have WLAN but doesn't`;
          break;

        case 'UNEXPECTED_ASSIGNMENT':
          actionType = 'REMOVE_ASSIGNMENT';
          reason = `Profile has WLAN but shouldn't`;
          break;

        case 'SYNC_FAILED':
          actionType = 'RESYNC_PROFILE';
          reason = `Profile sync failed`;
          break;

        case 'PROFILE_DELETED':
          // No action - profile no longer exists
          continue;

        case 'PROFILE_MOVED':
          actionType = 'RESYNC_PROFILE';
          reason = `Profile moved to different device group`;
          break;

        default:
          continue;
      }

      actions.push({
        type: actionType,
        wlanId: mismatch.wlanId,
        wlanName: mismatch.wlanName,
        profileId: mismatch.profileId,
        profileName: mismatch.profileName,
        siteId: mismatch.siteId,
        reason,
        mismatchReason: mismatch.mismatch
      });
    }

    return actions;
  }

  /**
   * Execute remediation actions
   *
   * @param actions - Array of remediation actions to execute
   * @returns Results of remediation execution
   */
  async executeRemediation(actions: RemediationAction[]): Promise<{
    successful: number;
    failed: number;
    results: Array<{ action: RemediationAction; success: boolean; error?: string }>;
  }> {

    const results: Array<{ action: RemediationAction; success: boolean; error?: string }> = [];
    let successful = 0;
    let failed = 0;

    for (const action of actions) {
      try {
        await this.executeRemediationAction(action);
        results.push({ action, success: true });
        successful++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[WLANReconciliation] Remediation action failed:`, action, error);
        results.push({ action, success: false, error: errorMessage });
        failed++;
      }
    }

    return { successful, failed, results };
  }

  /**
   * Execute a single remediation action
   *
   * @param action - Remediation action to execute
   */
  private async executeRemediationAction(action: RemediationAction): Promise<void> {

    switch (action.type) {
      case 'ADD_ASSIGNMENT':
        // Assign WLAN to profile
        await apiService.assignServiceToProfile(action.wlanId, action.profileId);
        // Update storage
        assignmentStorageService.updateProfileAssignmentActualState(
          action.wlanId,
          action.profileId,
          'ASSIGNED',
          null
        );
        assignmentStorageService.updateProfileAssignmentSyncStatus(
          action.wlanId,
          action.profileId,
          'PENDING'
        );
        break;

      case 'REMOVE_ASSIGNMENT':
        // Remove WLAN from profile (if API supports it)
        // Note: May need to update profile configuration directly
        console.warn(`[WLANReconciliation] REMOVE_ASSIGNMENT not yet implemented`);
        throw new Error('Remove assignment not yet implemented');

      case 'RESYNC_PROFILE':
        // Trigger profile sync
        await apiService.syncProfile(action.profileId);
        // Update storage
        assignmentStorageService.updateProfileAssignmentSyncStatus(
          action.wlanId,
          action.profileId,
          'SYNCED'
        );
        break;

      default:
        throw new Error(`Unknown remediation action type: ${action.type}`);
    }

  }

  /**
   * Get reconciliation summary for all tracked WLANs
   *
   * @returns Summary statistics
   */
  async getReconciliationSummary(): Promise<{
    totalWLANs: number;
    totalAssignments: number;
    matched: number;
    mismatched: number;
    mismatchRate: number;
  }> {
    const results = await this.reconcileAllWLANs();

    const totalAssignments = results.reduce((sum, r) => sum + r.totalExpected, 0);
    const matched = results.reduce((sum, r) => sum + r.matched, 0);
    const mismatched = results.reduce((sum, r) => sum + r.mismatched, 0);
    const mismatchRate = totalAssignments > 0 ? (mismatched / totalAssignments) * 100 : 0;

    return {
      totalWLANs: results.length,
      totalAssignments,
      matched,
      mismatched,
      mismatchRate
    };
  }
}

// Export singleton instance
export const wlanReconciliationService = new WLANReconciliationService();
