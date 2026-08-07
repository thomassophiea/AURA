import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Wifi, ShieldCheck, Clock, CalendarRange } from 'lucide-react';
import type { GuestSummary } from '@/services/guestService';

interface GuestSummaryCardsProps {
  summary: GuestSummary | null;
  isLoading: boolean;
  /** When false, "Connected Now" says so instead of showing a number. */
  gatewayReachable: boolean;
}

interface Tile {
  key: string;
  label: string;
  value: number | null;
  icon: typeof Wifi;
  tone: string;
  /** Shown in place of the number when the source could not answer. */
  unavailable?: string;
}

/**
 * The four counts an operator opens this page for.
 *
 * "Connected Now" renders as "Unavailable" rather than 0 when the gateway could
 * not be reached: a zero here is a claim that nobody is on the network, which
 * is a different and false statement.
 */
export function GuestSummaryCards({
  summary,
  isLoading,
  gatewayReachable,
}: GuestSummaryCardsProps) {
  const tiles: Tile[] = [
    {
      key: 'connected',
      label: 'Connected Now',
      value: summary?.connectedNow ?? null,
      icon: Wifi,
      tone: 'text-[color:var(--status-success)]',
      unavailable: gatewayReachable ? undefined : 'Gateway unavailable',
    },
    {
      key: 'authorized',
      label: 'Authorized Guests',
      value: summary?.authorized ?? null,
      icon: ShieldCheck,
      tone: 'text-[color:var(--status-info)]',
    },
    {
      key: 'today',
      label: 'Guests Seen Today',
      value: summary?.seenToday ?? null,
      icon: Clock,
      tone: 'text-primary',
    },
    {
      key: 'week',
      label: 'Guests Seen in Last 7 Days',
      value: summary?.seenLast7Days ?? null,
      icon: CalendarRange,
      tone: 'text-muted-foreground',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {tiles.map((tile) => (
        <Card key={tile.key}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tile.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <tile.icon className={`h-5 w-5 ${tile.tone}`} aria-hidden="true" />
              {isLoading ? (
                <Skeleton className="h-7 w-12" />
              ) : tile.value === null ? (
                <span className="text-sm text-muted-foreground">
                  {tile.unavailable ?? 'No data'}
                </span>
              ) : (
                <span className="text-2xl font-bold">{tile.value}</span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
