/**
 * SourceSiteSelector — the grouped OS-ONE / XIQ site dropdown used across the
 * Service-Levels-style pages (Access Points, Clients). OS-ONE sites carry their
 * site name as the value (matching those pages' name-based filtering); XIQ sites
 * carry an encoded `xiq:<siteGroupId>:<locationId>` value.
 *
 *   All OS-ONE Sites = 'all'
 *   <os-one site>    = site.name
 *   All XIQ Sites    = buildXiqAllSitesValue(siteGroupId)
 *   <xiq site>       = buildXiqSiteValue(siteGroupId, locationId)
 */

import { useState } from 'react';
import { Building, Cloud } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { buildXiqSiteValue, buildXiqAllSitesValue } from '../services/siteContextService';
import { useAppContext } from '@/contexts/AppContext';
import { ConnectXiqDialog } from './ConnectXiqDialog';
import type { Site } from '../services/api';
import type { XiqSite } from '../services/sle/xiqSites';

interface SourceSiteSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  sites: Site[];
  xiqSites: XiqSite[];
  triggerClassName?: string;
  /**
   * What an OS-ONE site option uses as its value: the site name (default —
   * for pages that filter rows by name) or the site id (for pages that fetch
   * per-site by id, e.g. App Insights / SLE).
   */
  osSiteValue?: 'name' | 'id';
}

export function SourceSiteSelector({
  value,
  onValueChange,
  sites,
  xiqSites,
  triggerClassName = 'w-48',
  osSiteValue = 'name',
}: SourceSiteSelectorProps) {
  const { siteGroups, siteGroup } = useAppContext();
  const [connectOpen, setConnectOpen] = useState(false);

  // A selector value can't open a dialog directly; use a sentinel.
  const CONNECT_XIQ = '__connect_xiq__';
  const handleChange = (v: string) => {
    if (v === CONNECT_XIQ) {
      setConnectOpen(true);
      return;
    }
    onValueChange(v);
  };

  return (
    <>
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger className={triggerClassName}>
        <Building className="mr-2 h-4 w-4" />
        <SelectValue placeholder="Select Site" />
      </SelectTrigger>
      <SelectContent>
        {/* OS-ONE and XIQ are separate sources with different data sets. */}
        <SelectGroup>
          <SelectLabel className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-500">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            OS-ONE
          </SelectLabel>
          <SelectItem value="all">All OS-ONE Sites</SelectItem>
          {sites.map((site) => {
            const name = site.name || site.siteName || site.id;
            const val = osSiteValue === 'id' ? site.id : name;
            return (
              <SelectItem key={site.id || name} value={val}>
                {name}
              </SelectItem>
            );
          })}
        </SelectGroup>
        {xiqSites.length > 0 && <SelectSeparator />}
        {xiqSites.length > 0 && (
          <SelectGroup>
            <SelectLabel className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-500">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
              XIQ
            </SelectLabel>
            <SelectItem value={buildXiqAllSitesValue(xiqSites[0].siteGroupId)}>
              All XIQ Sites
            </SelectItem>
            {xiqSites.map((site) => {
              const v = buildXiqSiteValue(site.siteGroupId, site.id);
              return (
                <SelectItem key={v} value={v}>
                  {site.name}
                </SelectItem>
              );
            })}
          </SelectGroup>
        )}
        {siteGroups.length > 0 && (
          <>
            <SelectSeparator />
            <SelectItem value={CONNECT_XIQ} className="text-cyan-500">
              <span className="flex items-center gap-1.5">
                <Cloud className="h-3.5 w-3.5" />
                {xiqSites.length > 0 ? 'Reconnect XIQ…' : 'Connect XIQ…'}
              </span>
            </SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
    <ConnectXiqDialog
      open={connectOpen}
      onOpenChange={setConnectOpen}
      siteGroups={siteGroups}
      defaultSiteGroupId={siteGroup?.id}
    />
    </>
  );
}
