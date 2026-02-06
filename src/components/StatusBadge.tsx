/**
 * StatusBadge Component
 *
 * A versatile badge component for displaying status indicators consistently
 * across the application. Uses centralized status mapping for consistency.
 *
 * Usage Examples:
 *
 * // Basic usage with semantic status
 * <StatusBadge status="success" label="Online" />
 *
 * // Auto-detect status from raw string
 * <StatusBadge rawStatus="connected" />
 *
 * // Without icon
 * <StatusBadge status="warning" label="Pending" showIcon={false} />
 *
 * // Severity badge for alerts
 * <SeverityBadge severity="critical" />
 *
 * // Event level badge for logs
 * <EventLevelBadge level="error" />
 */

import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { CheckCircle, AlertTriangle, XCircle, Info, Circle, AlertCircle } from 'lucide-react';
import {
  type SemanticStatus,
  getSemanticStatus,
  getStatusBadgeConfig,
  getSeverityBadgeConfig,
  getEventLevelBadgeConfig,
  formatStatusLabel,
  SEMANTIC_BADGE_CONFIG,
} from '../utils/statusBadgeHelpers';

// ==================== Icon Mapping ====================

const STATUS_ICONS = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
  neutral: Circle,
} as const;

// ==================== StatusBadge Component ====================

interface StatusBadgeProps {
  /** Semantic status type */
  status?: SemanticStatus;
  /** Raw status string (will be auto-mapped to semantic status) */
  rawStatus?: string;
  /** Label to display (if not provided, will format rawStatus) */
  label?: string;
  /** Whether to show the status icon */
  showIcon?: boolean;
  /** Icon size class */
  iconSize?: string;
  /** Additional className */
  className?: string;
  /** Text size class */
  textSize?: string;
}

export function StatusBadge({
  status,
  rawStatus,
  label,
  showIcon = true,
  iconSize = 'h-3 w-3',
  className,
  textSize,
}: StatusBadgeProps) {
  // Determine semantic status
  const semanticStatus: SemanticStatus = status || getSemanticStatus(rawStatus);

  // Get badge configuration
  const config = SEMANTIC_BADGE_CONFIG[semanticStatus];

  // Determine display label
  const displayLabel = label || (rawStatus ? formatStatusLabel(rawStatus) : semanticStatus);

  // Get icon component
  const Icon = STATUS_ICONS[semanticStatus];

  return (
    <Badge
      variant={config.variant}
      className={cn(
        config.className,
        'inline-flex items-center gap-1',
        textSize,
        className
      )}
    >
      {showIcon && <Icon className={iconSize} aria-hidden="true" />}
      {displayLabel}
    </Badge>
  );
}

// ==================== SeverityBadge Component ====================

interface SeverityBadgeProps {
  /** Severity level string */
  severity: string | undefined | null;
  /** Whether to show an icon */
  showIcon?: boolean;
  /** Additional className */
  className?: string;
  /** Text size class */
  textSize?: string;
}

export function SeverityBadge({
  severity,
  showIcon = true,
  className,
  textSize = 'text-xs',
}: SeverityBadgeProps) {
  const config = getSeverityBadgeConfig(severity);
  const displayLabel = formatStatusLabel(severity || 'Unknown');

  // Map severity to appropriate icon
  const getIcon = () => {
    const normalized = severity?.toLowerCase();
    if (normalized === 'critical' || normalized === 'high' || normalized === 'major') {
      return XCircle;
    }
    if (normalized === 'warning' || normalized === 'medium' || normalized === 'moderate') {
      return AlertTriangle;
    }
    if (normalized === 'info' || normalized === 'informational') {
      return Info;
    }
    return AlertCircle;
  };

  const Icon = getIcon();

  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, 'inline-flex items-center gap-1', textSize, className)}
    >
      {showIcon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {displayLabel}
    </Badge>
  );
}

// ==================== EventLevelBadge Component ====================

interface EventLevelBadgeProps {
  /** Event level string */
  level: string | undefined | null;
  /** Whether to show an icon */
  showIcon?: boolean;
  /** Additional className */
  className?: string;
  /** Text size class */
  textSize?: string;
}

export function EventLevelBadge({
  level,
  showIcon = false,
  className,
  textSize = 'text-xs',
}: EventLevelBadgeProps) {
  const config = getEventLevelBadgeConfig(level);
  const displayLabel = level?.toUpperCase() || 'UNKNOWN';

  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, 'inline-flex items-center gap-1', textSize, className)}
    >
      {showIcon && <AlertCircle className="h-3 w-3" aria-hidden="true" />}
      {displayLabel}
    </Badge>
  );
}

// ==================== ConnectionStatusBadge Component ====================

interface ConnectionStatusBadgeProps {
  /** Whether the entity is connected/online */
  isConnected: boolean;
  /** Label for connected state */
  connectedLabel?: string;
  /** Label for disconnected state */
  disconnectedLabel?: string;
  /** Whether to show an icon */
  showIcon?: boolean;
  /** Additional className */
  className?: string;
}

export function ConnectionStatusBadge({
  isConnected,
  connectedLabel = 'Online',
  disconnectedLabel = 'Offline',
  showIcon = true,
  className,
}: ConnectionStatusBadgeProps) {
  return (
    <StatusBadge
      status={isConnected ? 'success' : 'error'}
      label={isConnected ? connectedLabel : disconnectedLabel}
      showIcon={showIcon}
      className={className}
    />
  );
}

// ==================== Legacy Export ====================

// Keep the default export for backward compatibility
export default StatusBadge;
