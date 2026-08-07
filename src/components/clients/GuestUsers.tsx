import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Plus, RefreshCw, Search, WifiOff } from 'lucide-react';
import { toast } from 'sonner';

import {
  guestService,
  GuestRequestError,
  type Guest,
  type GuestSummary,
} from '@/services/guestService';
import { resolveTimeRange } from '@/lib/timeRange';
import { GuestSummaryCards } from './GuestSummaryCards';
import { GuestTable } from './GuestTable';
import { AddGuestDialog } from './AddGuestDialog';
import { RevokeGuestDialog } from './RevokeGuestDialog';
import {
  DEFAULT_TIME_TOKEN,
  STATUS_FILTERS,
  TIME_PRESETS,
} from './guestPresentation';

/**
 * Guest Users — the management plane for the AURA captive web portal.
 *
 * Answers four questions and nothing else: who is on the network now, who has
 * been recently, how do I stop someone, and how do I let someone in. The two
 * sources behind it (the portal's ledger and the gateway's live station list)
 * fail independently, so the page states which one is missing rather than
 * blanking or, worse, quietly showing a half-answer as if it were whole.
 */
export function GuestUsers() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [summary, setSummary] = useState<GuestSummary | null>(null);
  const [gatewayReachable, setGatewayReachable] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<GuestRequestError | Error | null>(null);

  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [timeToken, setTimeToken] = useState(DEFAULT_TIME_TOKEN);

  const [addOpen, setAddOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Guest | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const range = useMemo(() => resolveTimeRange(timeToken), [timeToken]);
  const statuses = useMemo(
    () => STATUS_FILTERS.find((f) => f.id === statusFilter)?.statuses ?? [],
    [statusFilter]
  );

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (mode === 'initial') setIsLoading(true);
      else setIsRefreshing(true);

      try {
        const [list, summaryResponse] = await Promise.all([
          guestService.list(
            {
              status: statuses.length > 0 ? statuses : undefined,
              startTime: range.startIso,
              endTime: range.endIso,
            },
            controller.signal
          ),
          // The summary deliberately spans everything rather than the selected
          // window: "Connected Now" is not a property of a past date range.
          guestService.summary(controller.signal),
        ]);

        setGuests(list.guests);
        setSummary(summaryResponse.summary);
        setGatewayReachable(list.gateway.reachable);
        setError(null);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setError(err as Error);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [range.startIso, range.endIso, statuses]
  );

  useEffect(() => {
    void load('initial');
    return () => abortRef.current?.abort();
  }, [load]);

  // Client-side narrowing so typing does not issue a request per keystroke; the
  // server applies the same rule for anything beyond the loaded page.
  const visibleGuests = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return guests;
    const macNeedle = needle.replace(/[\s:.-]/g, '');
    return guests.filter((guest) => {
      const macHex = guest.macAddress.replace(/:/g, '');
      return (
        (macNeedle.length >= 2 && macHex.includes(macNeedle)) ||
        guest.macAddress.toLowerCase().includes(needle) ||
        (guest.ipAddress ?? '').toLowerCase().includes(needle) ||
        (guest.email ?? '').toLowerCase().includes(needle) ||
        (guest.hasRealName && guest.displayName.toLowerCase().includes(needle))
      );
    });
  }, [guests, search]);

  const notConfigured = error instanceof GuestRequestError && error.isNotConfigured;
  const portalDown = error instanceof GuestRequestError && error.isPortalUnavailable;

  if (notConfigured) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Guest management is not connected</AlertTitle>
          <AlertDescription>
            AURA has no link to the captive portal service that owns guest records. Set
            <code className="mx-1 font-mono text-xs">CWP_INTERNAL_API_URL</code> and
            <code className="mx-1 font-mono text-xs">CWP_INTERNAL_API_TOKEN</code> on this
            deployment to enable this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Guest Users</h2>
          <p className="text-sm text-muted-foreground">
            Devices authorized through the AURA captive web portal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load('refresh')}
            disabled={isRefreshing}
            aria-label="Refresh guest list"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            Add Guest
          </Button>
        </div>
      </div>

      <GuestSummaryCards
        summary={summary}
        isLoading={isLoading}
        gatewayReachable={gatewayReachable}
      />

      {!gatewayReachable && !error && (
        <Alert>
          <WifiOff className="h-4 w-4" />
          <AlertTitle>Gateway unavailable</AlertTitle>
          <AlertDescription>
            Guest history below is complete, but live connection state could not be read.
            Devices show as <strong>Authorized</strong> rather than connected or disconnected.
          </AlertDescription>
        </Alert>
      )}

      {portalDown && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Guest records unavailable</AlertTitle>
          <AlertDescription>
            The captive portal service could not be reached, so guest records cannot be listed
            right now. Existing network access is unaffected.
          </AlertDescription>
        </Alert>
      )}

      {error && !portalDown && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load guests</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
            <div className="flex items-center gap-1">
              {STATUS_FILTERS.map((filter) => (
                <Button
                  key={filter.id}
                  variant={statusFilter === filter.id ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setStatusFilter(filter.id)}
                  aria-pressed={statusFilter === filter.id}
                >
                  {filter.label}
                </Button>
              ))}
            </div>

            <div className="relative ml-auto w-full sm:w-64">
              <Search
                className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="MAC, IP or name"
                className="pl-8"
                aria-label="Search guests"
              />
            </div>

            <Select value={timeToken} onValueChange={setTimeToken}>
              <SelectTrigger className="w-40" aria-label="Time range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_PRESETS.map((preset) => (
                  <SelectItem key={preset.token} value={preset.token}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <GuestTable
            guests={visibleGuests}
            isLoading={isLoading}
            onRevoke={setRevokeTarget}
            emptyMessage={
              search.trim()
                ? 'No guests match your search'
                : statusFilter !== 'all'
                  ? 'No guests in this state'
                  : 'No guests yet'
            }
            emptyHint={
              search.trim() || statusFilter !== 'all'
                ? `Showing ${range.label.toLowerCase()}. Widen the time range or clear the filters to see more.`
                : 'Guests appear here once they connect through the captive portal, or as soon as you add one by MAC address.'
            }
          />
        </CardContent>
      </Card>

      <AddGuestDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(message) => {
          toast.success('Guest added', { description: message });
          void load('refresh');
        }}
      />

      <RevokeGuestDialog
        guest={revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        onDone={(message) => {
          toast.success('Access updated', { description: message });
          setRevokeTarget(null);
          void load('refresh');
        }}
      />
    </div>
  );
}

export default GuestUsers;
