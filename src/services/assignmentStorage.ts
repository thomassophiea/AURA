/**
 * Assignment Storage Service
 *
 * Manages localStorage-based tracking of WLAN assignments at both site and profile levels.
 * Stores assignment metadata to enable reconciliation and mismatch detection.
 */

import type {
  WLANSiteAssignment,
  WLANProfileAssignment,
  DeploymentMode
} from '../types/network';

const STORAGE_KEYS = {
  SITE_ASSIGNMENTS: 'wlan_site_assignments',
  PROFILE_ASSIGNMENTS: 'wlan_profile_assignments'
} as const;

/**
 * Assignment Storage Service Class
 */
class AssignmentStorageService {
  /**
   * Get all site assignments from storage
   */
  private getAllSiteAssignments(): Record<string, WLANSiteAssignment> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SITE_ASSIGNMENTS);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('[AssignmentStorage] Error reading site assignments:', error);
      return {};
    }
  }

  /**
   * Get all profile assignments from storage
   */
  private getAllProfileAssignments(): Record<string, WLANProfileAssignment> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROFILE_ASSIGNMENTS);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('[AssignmentStorage] Error reading profile assignments:', error);
      return {};
    }
  }

  /**
   * Save all site assignments to storage
   */
  private saveAllSiteAssignments(assignments: Record<string, WLANSiteAssignment>): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SITE_ASSIGNMENTS, JSON.stringify(assignments));
    } catch (error) {
      console.error('[AssignmentStorage] Error saving site assignments:', error);
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw new Error('Storage quota exceeded. Please clear some data.');
      }
      throw error;
    }
  }

  /**
   * Save all profile assignments to storage
   */
  private saveAllProfileAssignments(assignments: Record<string, WLANProfileAssignment>): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PROFILE_ASSIGNMENTS, JSON.stringify(assignments));
    } catch (error) {
      console.error('[AssignmentStorage] Error saving profile assignments:', error);
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw new Error('Storage quota exceeded. Please clear some data.');
      }
      throw error;
    }
  }

  /**
   * Generate unique key for site assignment
   */
  private getSiteAssignmentKey(wlanId: string, siteId: string): string {
    return `${wlanId}_${siteId}`;
  }

  /**
   * Generate unique key for profile assignment
   */
  private getProfileAssignmentKey(wlanId: string, profileId: string): string {
    return `${wlanId}_${profileId}`;
  }

  // ============================================
  // SITE ASSIGNMENT METHODS
  // ============================================

  /**
   * Save a site assignment
   */
  saveWLANSiteAssignment(assignment: WLANSiteAssignment): void {
    const allAssignments = this.getAllSiteAssignments();
    const key = this.getSiteAssignmentKey(assignment.wlanId, assignment.siteId);

    allAssignments[key] = {
      ...assignment,
      lastModified: new Date().toISOString()
    };

    this.saveAllSiteAssignments(allAssignments);
  }

  /**
   * Get site assignments for a specific WLAN
   */
  getWLANSiteAssignments(wlanId: string): WLANSiteAssignment[] {
    const allAssignments = this.getAllSiteAssignments();
    return Object.values(allAssignments).filter(a => a.wlanId === wlanId);
  }

  /**
   * Get a specific site assignment
   */
  getSiteAssignment(wlanId: string, siteId: string): WLANSiteAssignment | null {
    const allAssignments = this.getAllSiteAssignments();
    const key = this.getSiteAssignmentKey(wlanId, siteId);
    return allAssignments[key] || null;
  }

  /**
   * Delete a site assignment
   */
  deleteSiteAssignment(wlanId: string, siteId: string): void {
    const allAssignments = this.getAllSiteAssignments();
    const key = this.getSiteAssignmentKey(wlanId, siteId);
    delete allAssignments[key];
    this.saveAllSiteAssignments(allAssignments);
  }

  /**
   * Delete all site assignments for a WLAN
   */
  deleteWLANSiteAssignments(wlanId: string): void {
    const allAssignments = this.getAllSiteAssignments();
    const filtered = Object.fromEntries(
      Object.entries(allAssignments).filter(([_, assignment]) => assignment.wlanId !== wlanId)
    );
    this.saveAllSiteAssignments(filtered);
  }

  // ============================================
  // PROFILE ASSIGNMENT METHODS
  // ============================================

  /**
   * Save a profile assignment
   */
  saveWLANProfileAssignment(assignment: WLANProfileAssignment): void {
    const allAssignments = this.getAllProfileAssignments();
    const key = this.getProfileAssignmentKey(assignment.wlanId, assignment.profileId);

    allAssignments[key] = {
      ...assignment,
      lastReconciled: assignment.lastReconciled || new Date().toISOString()
    };

    this.saveAllProfileAssignments(allAssignments);
  }

  /**
   * Save multiple profile assignments (batch operation)
   */
  saveWLANProfileAssignmentsBatch(assignments: WLANProfileAssignment[]): void {
    const allAssignments = this.getAllProfileAssignments();

    for (const assignment of assignments) {
      const key = this.getProfileAssignmentKey(assignment.wlanId, assignment.profileId);
      allAssignments[key] = {
        ...assignment,
        lastReconciled: assignment.lastReconciled || new Date().toISOString()
      };
    }

    this.saveAllProfileAssignments(allAssignments);
  }

  /**
   * Get profile assignments for a specific WLAN
   */
  getWLANProfileAssignments(wlanId: string): WLANProfileAssignment[] {
    const allAssignments = this.getAllProfileAssignments();
    return Object.values(allAssignments).filter(a => a.wlanId === wlanId);
  }

  /**
   * Get a specific profile assignment
   */
  getProfileAssignment(wlanId: string, profileId: string): WLANProfileAssignment | null {
    const allAssignments = this.getAllProfileAssignments();
    const key = this.getProfileAssignmentKey(wlanId, profileId);
    return allAssignments[key] || null;
  }

  /**
   * Update actual state of a profile assignment (used during reconciliation)
   */
  updateProfileAssignmentActualState(
    wlanId: string,
    profileId: string,
    actualState: 'ASSIGNED' | 'NOT_ASSIGNED' | 'UNKNOWN',
    mismatch: WLANProfileAssignment['mismatch']
  ): void {
    const assignment = this.getProfileAssignment(wlanId, profileId);
    if (!assignment) {
      console.warn(`[AssignmentStorage] Profile assignment not found: ${wlanId}_${profileId}`);
      return;
    }

    const updated: WLANProfileAssignment = {
      ...assignment,
      actualState,
      mismatch,
      lastReconciled: new Date().toISOString()
    };

    this.saveWLANProfileAssignment(updated);
  }

  /**
   * Update sync status of a profile assignment
   */
  updateProfileAssignmentSyncStatus(
    wlanId: string,
    profileId: string,
    syncStatus: WLANProfileAssignment['syncStatus'],
    syncError?: string
  ): void {
    const assignment = this.getProfileAssignment(wlanId, profileId);
    if (!assignment) {
      console.warn(`[AssignmentStorage] Profile assignment not found: ${wlanId}_${profileId}`);
      return;
    }

    const updated: WLANProfileAssignment = {
      ...assignment,
      syncStatus,
      syncError,
      lastReconciled: new Date().toISOString()
    };

    this.saveWLANProfileAssignment(updated);
  }

  /**
   * Delete a profile assignment
   */
  deleteProfileAssignment(wlanId: string, profileId: string): void {
    const allAssignments = this.getAllProfileAssignments();
    const key = this.getProfileAssignmentKey(wlanId, profileId);
    delete allAssignments[key];
    this.saveAllProfileAssignments(allAssignments);
  }

  /**
   * Delete all profile assignments for a WLAN
   */
  deleteWLANProfileAssignments(wlanId: string): void {
    const allAssignments = this.getAllProfileAssignments();
    const filtered = Object.fromEntries(
      Object.entries(allAssignments).filter(([_, assignment]) => assignment.wlanId !== wlanId)
    );
    this.saveAllProfileAssignments(filtered);
  }

  // ============================================
  // BULK OPERATIONS
  // ============================================

  /**
   * Get all assignments for a WLAN (both site and profile level)
   */
  getAllWLANAssignments(wlanId: string): {
    siteAssignments: WLANSiteAssignment[];
    profileAssignments: WLANProfileAssignment[];
  } {
    return {
      siteAssignments: this.getWLANSiteAssignments(wlanId),
      profileAssignments: this.getWLANProfileAssignments(wlanId)
    };
  }

  /**
   * Delete all assignments for a WLAN (cleanup when WLAN is deleted)
   */
  deleteAllWLANAssignments(wlanId: string): void {
    this.deleteWLANSiteAssignments(wlanId);
    this.deleteWLANProfileAssignments(wlanId);
  }

  /**
   * Get all tracked WLANs (returns unique WLAN IDs)
   */
  getAllTrackedWLANs(): string[] {
    const siteAssignments = this.getAllSiteAssignments();
    const profileAssignments = this.getAllProfileAssignments();

    const wlanIds = new Set<string>();
    Object.values(siteAssignments).forEach(a => wlanIds.add(a.wlanId));
    Object.values(profileAssignments).forEach(a => wlanIds.add(a.wlanId));

    return Array.from(wlanIds);
  }

  /**
   * Clear all assignment data (for testing/debugging)
   */
  clearAll(): void {
    console.warn('[AssignmentStorage] Clearing all assignment data');
    localStorage.removeItem(STORAGE_KEYS.SITE_ASSIGNMENTS);
    localStorage.removeItem(STORAGE_KEYS.PROFILE_ASSIGNMENTS);
  }

  /**
   * Get storage statistics
   */
  getStorageStats(): {
    siteAssignmentCount: number;
    profileAssignmentCount: number;
    trackedWLANCount: number;
  } {
    const siteAssignments = this.getAllSiteAssignments();
    const profileAssignments = this.getAllProfileAssignments();

    return {
      siteAssignmentCount: Object.keys(siteAssignments).length,
      profileAssignmentCount: Object.keys(profileAssignments).length,
      trackedWLANCount: this.getAllTrackedWLANs().length
    };
  }
}

// Export singleton instance
export const assignmentStorageService = new AssignmentStorageService();
