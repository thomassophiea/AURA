import { memo } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatKwh, formatWatts, formatCurrency } from '@/lib/energyCalc';
import type { EnergySite } from '@/types/energy';

interface EnergySiteRankingsProps {
  sites: EnergySite[] | null;
  loading: boolean;
  onSelectSite: (siteId: string) => void;
  /** Resolves a site id to its human-readable name (from the site catalog). */
  siteNameById?: Map<string, string>;
  currencySymbol?: string;
}

/** Human-readable label for a row: catalog name, then API name, then id, else a legacy label. */
function siteLabel(site: EnergySite, siteNameById?: Map<string, string>): string {
  if (site.siteId) {
    return siteNameById?.get(site.siteId) ?? site.siteName ?? site.siteId;
  }
  return site.siteName ?? 'Unassigned (legacy)';
}

function EnergySiteRankingsComponent({
  sites,
  loading,
  onSelectSite,
  siteNameById,
  currencySymbol = '$',
}: EnergySiteRankingsProps) {
  return (
    <Card className="gap-0">
      <CardHeader className="pb-2">
        <h3 className="text-sm font-semibold text-foreground">Sites by energy use</h3>
      </CardHeader>
      <CardContent>
        {loading || !sites ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No site data in range.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Site</th>
                <th className="py-2 font-medium">APs</th>
                <th className="py-2 font-medium">Energy</th>
                <th className="py-2 font-medium">Avg/AP</th>
                <th className="py-2 font-medium">Annual cost</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr
                  key={site.siteId ?? 'unassigned'}
                  className={
                    site.siteId
                      ? 'cursor-pointer border-b border-border/50 hover:bg-muted/50'
                      : 'border-b border-border/50'
                  }
                  onClick={site.siteId ? () => onSelectSite(site.siteId as string) : undefined}
                >
                  <td className="py-2 font-medium text-foreground">
                    {siteLabel(site, siteNameById)}
                  </td>
                  <td className="py-2 text-muted-foreground">{site.apWithDataCount}</td>
                  <td className="py-2 text-foreground">{formatKwh(site.totalKwh)}</td>
                  <td className="py-2 text-muted-foreground">{formatWatts(site.avgWattsPerAp)}</td>
                  <td className="py-2 text-foreground">
                    {formatCurrency(site.estimatedAnnualCost, currencySymbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export const EnergySiteRankings = memo(EnergySiteRankingsComponent);
