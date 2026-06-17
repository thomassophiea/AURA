import { Server } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import type { ControllerIdentity } from '@/types/controllerIdentity';

interface ControllerIdentityBadgeProps {
  identity: ControllerIdentity | null;
  className?: string;
}

/** Truncate a Locking ID to its first segment + ellipsis for compact display. */
function truncateLockingId(lockingId: string): string {
  if (!lockingId) return '';
  return lockingId.length > 12 ? `${lockingId.slice(0, 12)}…` : lockingId;
}

export function ControllerIdentityBadge({ identity, className }: ControllerIdentityBadgeProps) {
  if (!identity) return null;

  const { hostname, lockingId, fetchedAt, status } = identity;
  const lockingLabel =
    status === 'unreachable' || !lockingId
      ? 'Locking ID unavailable'
      : `Locking ID: ${truncateLockingId(lockingId)}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className ?? ''}`}
          data-testid="controller-identity-badge"
        >
          <Server className="h-3.5 w-3.5" />
          <span className="font-medium text-high-emphasis">{hostname}</span>
          <span aria-hidden>·</span>
          <span>{lockingLabel}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          <div>Gateway: {hostname}</div>
          {lockingId && <div>Locking ID: {lockingId}</div>}
          <div className="text-muted-foreground">Fetched: {fetchedAt}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
