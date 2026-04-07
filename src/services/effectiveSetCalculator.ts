/**
 * Effective Set Calculator Service
 *
 * Calculates which profiles should receive a WLAN based on deployment mode.
 * Handles ALL_PROFILES_AT_SITE, INCLUDE_ONLY, and EXCLUDE_SOME modes.
 */

import type {
  DeploymentMode,
  Profile,
  WLANSiteAssignment,
  EffectiveProfileSet
} from '../types/network';

/**
 * Effective Set Calculator Service Class
 */
class EffectiveSetCalculatorService {
  /**
   * Calculate effective profile set for a single site assignment
   *
   * @param siteAssignment - Site assignment with deployment mode and include/exclude lists
   * @param allProfilesAtSite - All profiles available at the site
   * @returns EffectiveProfileSet with selected and excluded profiles
   */
  calculateEffectiveSet(
    siteAssignment: Pick<WLANSiteAssignment, 'siteId' | 'siteName' | 'deploymentMode' | 'includedProfiles' | 'excludedProfiles'>,
    allProfilesAtSite: Profile[]
  ): EffectiveProfileSet {
    console.log('[EffectiveSetCalculator] Calculating effective set:', {
      siteId: siteAssignment.siteId,
      mode: siteAssignment.deploymentMode,
      totalProfiles: allProfilesAtSite.length
    });

    const { deploymentMode, includedProfiles, excludedProfiles } = siteAssignment;

    let selectedProfiles: Profile[] = [];
    let excludedProfilesList: Profile[] = [];

    switch (deploymentMode) {
      case 'ALL_PROFILES_AT_SITE':
        // Include all profiles at site
        selectedProfiles = [...allProfilesAtSite];
        excludedProfilesList = [];
        break;

      case 'INCLUDE_ONLY':
        // Include only specified profiles
        selectedProfiles = allProfilesAtSite.filter(profile =>
          includedProfiles.includes(profile.id)
        );
        excludedProfilesList = allProfilesAtSite.filter(profile =>
          !includedProfiles.includes(profile.id)
        );
        break;

      case 'EXCLUDE_SOME':
        // Include all except specified profiles
        selectedProfiles = allProfilesAtSite.filter(profile =>
          !excludedProfiles.includes(profile.id)
        );
        excludedProfilesList = allProfilesAtSite.filter(profile =>
          excludedProfiles.includes(profile.id)
        );
        break;

      default:
        console.warn(`[EffectiveSetCalculator] Unknown deployment mode: ${deploymentMode}`);
        selectedProfiles = [...allProfilesAtSite]; // Default to all
        excludedProfilesList = [];
    }

    console.log('[EffectiveSetCalculator] Result:', {
      selected: selectedProfiles.length,
      excluded: excludedProfilesList.length
    });

    return {
      siteId: siteAssignment.siteId,
      siteName: siteAssignment.siteName,
      deploymentMode,
      allProfiles: allProfilesAtSite,
      selectedProfiles,
      excludedProfiles: excludedProfilesList
    };
  }

  /**
   * Calculate effective sets for multiple site assignments
   *
   * @param siteAssignments - Array of site assignments
   * @param profilesBySite - Map of site ID to profiles at that site
   * @returns Array of effective profile sets
   */
  calculateMultipleEffectiveSets(
    siteAssignments: Pick<WLANSiteAssignment, 'siteId' | 'siteName' | 'deploymentMode' | 'includedProfiles' | 'excludedProfiles'>[],
    profilesBySite: Map<string, Profile[]>
  ): EffectiveProfileSet[] {
    return siteAssignments.map(siteAssignment => {
      const profiles = profilesBySite.get(siteAssignment.siteId) || [];
      return this.calculateEffectiveSet(siteAssignment, profiles);
    });
  }

  /**
   * Merge multiple effective sets into a single deduplicated profile list
   *
   * @param effectiveSets - Array of effective profile sets
   * @returns Deduplicated array of profiles that should receive WLAN
   */
  mergeEffectiveSets(effectiveSets: EffectiveProfileSet[]): Profile[] {
    const profileMap = new Map<string, Profile>();

    for (const effectiveSet of effectiveSets) {
      for (const profile of effectiveSet.selectedProfiles) {
        if (!profileMap.has(profile.id)) {
          profileMap.set(profile.id, profile);
        }
      }
    }

    return Array.from(profileMap.values());
  }

  /**
   * Validate a site assignment configuration
   *
   * @param siteAssignment - Site assignment to validate
   * @returns Validation result with error messages if invalid
   */
  validateSiteAssignment(
    siteAssignment: Pick<WLANSiteAssignment, 'deploymentMode' | 'includedProfiles' | 'excludedProfiles'>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const { deploymentMode, includedProfiles, excludedProfiles } = siteAssignment;

    // Validate deployment mode
    const validModes: DeploymentMode[] = ['ALL_PROFILES_AT_SITE', 'INCLUDE_ONLY', 'EXCLUDE_SOME'];
    if (!validModes.includes(deploymentMode)) {
      errors.push(`Invalid deployment mode: ${deploymentMode}`);
    }

    // Validate INCLUDE_ONLY mode
    if (deploymentMode === 'INCLUDE_ONLY') {
      if (!includedProfiles || includedProfiles.length === 0) {
        errors.push('INCLUDE_ONLY mode requires at least one profile to be included');
      }
      if (excludedProfiles && excludedProfiles.length > 0) {
        errors.push('INCLUDE_ONLY mode should not have excluded profiles');
      }
    }

    // Validate EXCLUDE_SOME mode
    if (deploymentMode === 'EXCLUDE_SOME') {
      if (!excludedProfiles || excludedProfiles.length === 0) {
        errors.push('EXCLUDE_SOME mode requires at least one profile to be excluded');
      }
      if (includedProfiles && includedProfiles.length > 0) {
        errors.push('EXCLUDE_SOME mode should not have included profiles');
      }
    }

    // Validate ALL_PROFILES_AT_SITE mode
    if (deploymentMode === 'ALL_PROFILES_AT_SITE') {
      if (includedProfiles && includedProfiles.length > 0) {
        errors.push('ALL_PROFILES_AT_SITE mode should not have included profiles');
      }
      if (excludedProfiles && excludedProfiles.length > 0) {
        errors.push('ALL_PROFILES_AT_SITE mode should not have excluded profiles');
      }
    }

    // Check for duplicate profile IDs
    if (includedProfiles && includedProfiles.length > 0) {
      const uniqueIncluded = new Set(includedProfiles);
      if (uniqueIncluded.size !== includedProfiles.length) {
        errors.push('Included profiles list contains duplicates');
      }
    }

    if (excludedProfiles && excludedProfiles.length > 0) {
      const uniqueExcluded = new Set(excludedProfiles);
      if (uniqueExcluded.size !== excludedProfiles.length) {
        errors.push('Excluded profiles list contains duplicates');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get a summary of how many profiles will be assigned
   *
   * @param effectiveSet - Effective profile set
   * @returns Summary object with counts
   */
  getSummary(effectiveSet: EffectiveProfileSet): {
    total: number;
    assigned: number;
    excluded: number;
    assignedPercent: number;
  } {
    const total = effectiveSet.allProfiles.length;
    const assigned = effectiveSet.selectedProfiles.length;
    const excluded = effectiveSet.excludedProfiles.length;
    const assignedPercent = total > 0 ? Math.round((assigned / total) * 100) : 0;

    return {
      total,
      assigned,
      excluded,
      assignedPercent
    };
  }

  /**
   * Get human-readable description of deployment mode
   *
   * @param mode - Deployment mode
   * @returns Human-readable description
   */
  getDeploymentModeDescription(mode: DeploymentMode): string {
    switch (mode) {
      case 'ALL_PROFILES_AT_SITE':
        return 'Assign to all profiles at this site';
      case 'INCLUDE_ONLY':
        return 'Assign to specific profiles only';
      case 'EXCLUDE_SOME':
        return 'Assign to all profiles except selected ones';
      default:
        return 'Unknown deployment mode';
    }
  }

  /**
   * Check if a profile is in the effective set
   *
   * @param profileId - Profile ID to check
   * @param effectiveSet - Effective profile set
   * @returns True if profile is in the selected profiles
   */
  isProfileInEffectiveSet(profileId: string, effectiveSet: EffectiveProfileSet): boolean {
    return effectiveSet.selectedProfiles.some(p => p.id === profileId);
  }

  /**
   * Get profiles that were explicitly selected or excluded by user
   * (not just implicitly included by ALL_PROFILES_AT_SITE mode)
   *
   * @param effectiveSet - Effective profile set
   * @returns Object with explicitly selected and excluded profiles
   */
  getExplicitSelections(effectiveSet: EffectiveProfileSet): {
    explicitlySelected: Profile[];
    explicitlyExcluded: Profile[];
  } {
    if (effectiveSet.deploymentMode === 'ALL_PROFILES_AT_SITE') {
      return {
        explicitlySelected: [],
        explicitlyExcluded: []
      };
    }

    return {
      explicitlySelected: effectiveSet.selectedProfiles,
      explicitlyExcluded: effectiveSet.excludedProfiles
    };
  }
}

// Export singleton instance
export const effectiveSetCalculator = new EffectiveSetCalculatorService();
