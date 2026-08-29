import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NoData } from '@/components/ui/NoData';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Ban, Users } from 'lucide-react';
import type { Guest } from '@/services/guestService';
import { STATUS_PRESENTATION, guestLabel, secureOnboardingPresentation } from './guestPresentation';

interface GuestTableProps {
  guests: Guest[];
  isLoading: boolean;
  onRevoke: (guest: Guest) => void;
  /** Message for the empty state, which differs for "no guests" vs "no matches". */
  emptyMessage: string;
  emptyHint?: string;
}

const COLUMNS = [
  'Guest',
  'MAC Address',
  'IP Address',
  'Status',
  'SSID',
  'Secure Wi-Fi',
  'Connected Since',
  'Last Seen',
  'First Seen',
  'Authorized',
  'Expires',
  'Source',
  'Gateway',
  '',
] as const;

const SOURCE_LABELS: Record<string, string> = {
  CAPTIVE_PORTAL: 'Captive portal',
  MANUAL: 'Manual',
  GATEWAY: 'Gateway',
};

/** Absolute local time; the exact instant is what an operator correlates on. */
function formatTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function TimeCell({ value, field }: { value: string | null; field: string }) {
  const formatted = formatTime(value);
  return formatted ? (
    <span className="text-sm whitespace-nowrap">{formatted}</span>
  ) : (
    <NoData field={field} />
  );
}

/**
 * Secure Guest Access state for one row.
 *
 * The badge says what is known; the tooltip says how it is known, including
 * which network the device was moved to and when — the two things an operator
 * asks next.
 */
function SecureOnboardingCell({ guest }: { guest: Guest }) {
  const onboarding = guest.secureOnboarding;
  if (!onboarding) return <span className="text-xs text-muted-foreground">&mdash;</span>;

  const presentation = secureOnboardingPresentation(onboarding.status);
  if (!presentation) return <span className="text-xs text-muted-foreground">&mdash;</span>;

  const when = formatTime(onboarding.completedAt ?? onboarding.startedAt);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={presentation.variant}>{presentation.label}</Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>{presentation.description}</p>
        <p className="mt-1 text-xs opacity-80">
          {onboarding.targetSsid}
          {onboarding.platform ? ` \u00b7 ${onboarding.platform}` : ''}
          {when ? ` \u00b7 ${when}` : ''}
        </p>
        {onboarding.failureReason && (
          <p className="mt-1 text-xs opacity-80">{onboarding.failureReason}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function GuestTable({
  guests,
  isLoading,
  onRevoke,
  emptyMessage,
  emptyHint,
}: GuestTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading guests">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (guests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <Users className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
        <p className="text-sm font-medium">{emptyMessage}</p>
        {emptyHint && <p className="text-xs text-muted-foreground max-w-sm">{emptyHint}</p>}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((column, index) => (
                <TableHead key={column || `actions-${index}`}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {guests.map((guest) => {
              const status = STATUS_PRESENTATION[guest.status];
              const canRevoke = guest.authorizationStatus !== 'REVOKED';
              return (
                <TableRow key={guest.id}>
                  <TableCell className="font-medium">
                    {guest.hasRealName ? (
                      guestLabel(guest)
                    ) : (
                      <span className="text-muted-foreground">Unnamed guest</span>
                    )}
                  </TableCell>

                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {guest.macAddress}
                  </TableCell>

                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {guest.ipAddress ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={guest.ipAddressIsLive ? '' : 'text-muted-foreground'}>
                            {guest.ipAddress}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {guest.ipAddressIsLive
                            ? 'Live address from the gateway'
                            : 'Last address the portal saw — the device is not connected now'}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <NoData field="ipAddress" />
                    )}
                  </TableCell>

                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TooltipTrigger>
                      <TooltipContent>{status.description}</TooltipContent>
                    </Tooltip>
                  </TableCell>

                  <TableCell className="text-sm whitespace-nowrap">
                    {guest.ssid ?? <NoData field="ssid" />}
                  </TableCell>

                  {/* Blank, not "None": most guests take the open path and
                      never ask for secure setup, which is the expected outcome
                      rather than a missing value. */}
                  <TableCell className="whitespace-nowrap">
                    <SecureOnboardingCell guest={guest} />
                  </TableCell>

                  <TableCell>
                    <TimeCell value={guest.connectedSince} field="connectedSince" />
                  </TableCell>
                  <TableCell>
                    <TimeCell value={guest.lastSeen} field="lastSeen" />
                  </TableCell>
                  <TableCell>
                    <TimeCell value={guest.firstSeen} field="firstSeen" />
                  </TableCell>
                  <TableCell>
                    <TimeCell value={guest.authorizedAt} field="authorizedAt" />
                  </TableCell>
                  <TableCell>
                    {guest.expiresAt ? (
                      <TimeCell value={guest.expiresAt} field="expiresAt" />
                    ) : (
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        No expiry
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-sm whitespace-nowrap">
                    {SOURCE_LABELS[guest.source] ?? guest.source}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {guest.gateway ?? <NoData field="gateway" />}
                  </TableCell>

                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevoke(guest)}
                      disabled={!canRevoke}
                      aria-label={`Revoke access for ${guestLabel(guest)}`}
                    >
                      <Ban className="h-4 w-4 mr-1" aria-hidden="true" />
                      {canRevoke ? 'Revoke' : 'Revoked'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
