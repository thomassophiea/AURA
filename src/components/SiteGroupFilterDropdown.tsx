/**
 * SiteGroupFilterDropdown — Shown in the top bar at org scope.
 * Lets users filter monitoring data by site group (controller).
 * "All Site Groups" = aggregated view across all controllers.
 *
 * Reads and writes orgSiteGroupFilter from AppContext.
 */

import { Server } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useAppContext } from '@/contexts/AppContext';

export function SiteGroupFilterDropdown() {
  const { siteGroups, orgSiteGroupFilter, setOrgSiteGroupFilter } = useAppContext();

  // Don't render if there's only one site group — no filtering needed
  if (siteGroups.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
      <Server className="h-3.5 w-3.5 text-muted-foreground" />
      <Select
        value={orgSiteGroupFilter ?? '__all__'}
        onValueChange={(v) => setOrgSiteGroupFilter(v === '__all__' ? null : v)}
      >
        <SelectTrigger className="h-7 w-auto min-w-[140px] text-xs border-border/50 bg-background/50">
          <SelectValue placeholder="All Site Groups" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Site Groups</SelectItem>
          {siteGroups.map(sg => (
            <SelectItem key={sg.id} value={sg.id}>
              {sg.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
