/**
 * Centralized Status Badge Helpers
 *
 * This utility provides consistent status-to-badge mappings across the entire application.
 * Instead of having 13+ separate implementations of getStatusBadgeVariant functions,
 * use these centralized helpers for consistency.
 */

import { type BadgeProps } from '@/components/ui/badge';

// ==================== Type Definitions ====================

export type SemanticStatus = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export type BadgeVariant = BadgeProps['variant'];

export interface StatusBadgeConfig {
  variant: BadgeVariant;
  className: string;
  label?: string;
}

// ==================== Status Mappings ====================

/**
 * Maps raw status strings to semantic status types.
 * This handles all the different status patterns used across the codebase.
 */
const STATUS_MAP: Record<string, SemanticStatus> = {
  // Success/Online states
  'online': 'success',
  'connected': 'success',
  'up': 'success',
  'active': 'success',
  'in-service': 'success',
  'good': 'success',
  'pass': 'success',
  'passed': 'success',
  'current': 'success',
  'completed': 'success',
  'available': 'success',
  'onboarded': 'success',
  'friendly': 'success',
  'healthy': 'success',
  'ok': 'success',
  'running': 'success',
  'ready': 'success',
  'associated': 'success',
  'authenticated': 'success',

  // Warning states
  'warning': 'warning',
  'degraded': 'warning',
  'expiring': 'warning',
  'expiring soon': 'warning',
  'pending': 'warning',
  'upgrading': 'warning',
  'analyzing': 'warning',
  'medium': 'warning',
  'moderate': 'warning',
  'late roam': 'warning',
  'idle': 'warning',

  // Error/Critical states
  'offline': 'error',
  'disconnected': 'error',
  'down': 'error',
  'inactive': 'error',
  'error': 'error',
  'failed': 'error',
  'fail': 'error',
  'critical': 'error',
  'high': 'error',
  'malicious': 'error',
  'expired': 'error',
  'unavailable': 'error',
  'out-of-service': 'error',

  // Info states
  'info': 'info',
  'informational': 'info',
  'update_available': 'info',
  'upgrade_available': 'info',
  'new': 'info',

  // Neutral/Unknown states
  'unknown': 'neutral',
  'draft': 'neutral',
  'none': 'neutral',
  'n/a': 'neutral',
  'low': 'neutral',
};

// ==================== Badge Style Configurations ====================

/**
 * Semantic status to badge configuration mapping.
 * Uses the semi-transparent pattern for consistent styling.
 */
export const SEMANTIC_BADGE_CONFIG: Record<SemanticStatus, StatusBadgeConfig> = {
  success: {
    variant: 'outline',
    className: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  },
  warning: {
    variant: 'outline',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  error: {
    variant: 'destructive',
    className: '',
  },
  info: {
    variant: 'outline',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  neutral: {
    variant: 'secondary',
    className: '',
  },
};

// ==================== Helper Functions ====================

/**
 * Normalizes a status string for lookup.
 */
function normalizeStatus(status: string | undefined | null): string {
  if (!status) return 'unknown';
  return status.toLowerCase().trim().replace(/_/g, ' ').replace(/-/g, ' ');
}

/**
 * Gets the semantic status from a raw status string.
 */
export function getSemanticStatus(status: string | undefined | null): SemanticStatus {
  const normalized = normalizeStatus(status);
  return STATUS_MAP[normalized] || 'neutral';
}

/**
 * Gets the badge variant for a status string.
 * Use this when you only need the variant.
 */
export function getStatusBadgeVariant(status: string | undefined | null): BadgeVariant {
  const semantic = getSemanticStatus(status);
  return SEMANTIC_BADGE_CONFIG[semantic].variant;
}

/**
 * Gets the full badge configuration for a status string.
 * Use this when you need both variant and className.
 */
export function getStatusBadgeConfig(status: string | undefined | null): StatusBadgeConfig {
  const semantic = getSemanticStatus(status);
  return SEMANTIC_BADGE_CONFIG[semantic];
}

/**
 * Gets the badge className for a status string.
 * Use this when you need the semantic color classes.
 */
export function getStatusBadgeClassName(status: string | undefined | null): string {
  const semantic = getSemanticStatus(status);
  return SEMANTIC_BADGE_CONFIG[semantic].className;
}

// ==================== Severity Helpers ====================

/**
 * Maps severity levels to semantic status.
 * Used for alerts, events, and alarms.
 */
const SEVERITY_MAP: Record<string, SemanticStatus> = {
  'critical': 'error',
  'high': 'error',
  'major': 'error',
  'medium': 'warning',
  'moderate': 'warning',
  'warning': 'warning',
  'minor': 'warning',
  'low': 'neutral',
  'info': 'info',
  'informational': 'info',
};

/**
 * Gets the badge variant for a severity level.
 */
export function getSeverityBadgeVariant(severity: string | undefined | null): BadgeVariant {
  if (!severity) return 'secondary';
  const normalized = severity.toLowerCase().trim();
  const semantic = SEVERITY_MAP[normalized] || 'neutral';
  return SEMANTIC_BADGE_CONFIG[semantic].variant;
}

/**
 * Gets the full badge configuration for a severity level.
 */
export function getSeverityBadgeConfig(severity: string | undefined | null): StatusBadgeConfig {
  if (!severity) return SEMANTIC_BADGE_CONFIG.neutral;
  const normalized = severity.toLowerCase().trim();
  const semantic = SEVERITY_MAP[normalized] || 'neutral';
  return SEMANTIC_BADGE_CONFIG[semantic];
}

// ==================== Event Level Helpers ====================

/**
 * Maps event levels to semantic status.
 * Used for system events and logs.
 */
const EVENT_LEVEL_MAP: Record<string, SemanticStatus> = {
  'error': 'error',
  'err': 'error',
  'critical': 'error',
  'crit': 'error',
  'alert': 'error',
  'emergency': 'error',
  'emerg': 'error',
  'warning': 'warning',
  'warn': 'warning',
  'notice': 'info',
  'info': 'info',
  'debug': 'neutral',
};

/**
 * Gets the badge variant for an event level.
 */
export function getEventLevelBadgeVariant(level: string | undefined | null): BadgeVariant {
  if (!level) return 'secondary';
  const normalized = level.toLowerCase().trim();
  const semantic = EVENT_LEVEL_MAP[normalized] || 'neutral';
  return SEMANTIC_BADGE_CONFIG[semantic].variant;
}

/**
 * Gets the full badge configuration for an event level.
 */
export function getEventLevelBadgeConfig(level: string | undefined | null): StatusBadgeConfig {
  if (!level) return SEMANTIC_BADGE_CONFIG.neutral;
  const normalized = level.toLowerCase().trim();
  const semantic = EVENT_LEVEL_MAP[normalized] || 'neutral';
  return SEMANTIC_BADGE_CONFIG[semantic];
}

// ==================== Display Label Helpers ====================

/**
 * Formats a status string for display.
 * Capitalizes first letter and replaces underscores with spaces.
 */
export function formatStatusLabel(status: string | undefined | null): string {
  if (!status) return 'Unknown';
  return status
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ==================== Type Guards ====================

/**
 * Checks if a status indicates an online/healthy state.
 */
export function isOnlineStatus(status: string | undefined | null): boolean {
  const semantic = getSemanticStatus(status);
  return semantic === 'success';
}

/**
 * Checks if a status indicates a critical/error state.
 */
export function isCriticalStatus(status: string | undefined | null): boolean {
  const semantic = getSemanticStatus(status);
  return semantic === 'error';
}

/**
 * Checks if a status indicates a warning state.
 */
export function isWarningStatus(status: string | undefined | null): boolean {
  const semantic = getSemanticStatus(status);
  return semantic === 'warning';
}
