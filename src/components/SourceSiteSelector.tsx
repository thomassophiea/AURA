/**
 * SourceSiteSelector — the grouped OS1 / IQ Engine (XIQ) site picker used across
 * the Service-Levels-style pages (Access Points, Clients, App Insights, Audit
 * Logs, Service Levels).
 *
 * The two management domains are presented differently because they are shaped
 * differently:
 *
 *   OS1   Site Group → Site.  A Site Group is the Gateway boundary — a single
 *         Gateway or a Gateway/HA pair — so the header row names the Gateway and
 *         its Locking ID, and the Sites it owns are indented beneath it. The
 *         org-wide `Staging` site closes the section.
 *
 *   XIQ   A flat site list, unchanged from before, closed by `Default Site`.
 *
 * Selector values (unchanged for every pre-existing entry, so no consumer breaks):
 *
 *   All OS1 Sites   = 'all'
 *   <os1 site>      = site.name, or site.id when osSiteValue='id'
 *   OS1 Staging     = OS1_STAGING_KEY
 *   All XIQ Sites   = buildXiqAllSitesValue(siteGroupId)
 *   <xiq site>      = buildXiqSiteValue(siteGroupId, locationId)
 *   XIQ Default Site= buildXiqDefaultSiteValue(siteGroupId)
 *
 * Ordering and the Gateway-"Unassigned" → OS1-"Staging" translation live in
 * `services/siteCatalog`, never here.
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
import { cn } from './ui/utils';
import { buildXiqAllSitesValue } from '../services/siteContextService';
import { gatewayModeLabel } from '../services/siteCatalog';
import { useSiteCatalogFrom } from '../hooks/useSiteCatalog';
import { useAppContext } from '@/contexts/AppContext';
import { ConnectXiqDialog } from './ConnectXiqDialog';
import {
  OS1_STAGING_DESCRIPTION,
  XIQ_DEFAULT_SITE_DESCRIPTION,
  type CatalogSite,
  type CatalogSiteGroup,
} from '../types/siteCatalog';
import type { Site } from '../services/api';
import type { XiqSite } from '../services/sle/xiqSites';

interface SourceSiteSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  /** OS1 sites, loaded by the calling page via `useSourceSites`. */
  sites: Site[];
  /** XIQ sites, from the same loader. */
  xiqSites: XiqSite[];
  triggerClassName?: string;
  /**
   * What an OS1 site option uses as its value: the site name (default — for
   * pages that filter rows by name) or the site id (for pages that fetch
   * per-site by id, e.g. App Insights / SLE).
   */
  osSiteValue?: 'name' | 'id';
  /**
   * Devices the caller knows are unassigned, shown as the Staging count. Omit
   * when the caller has no device list; Staging is offered either way.
   */
  unassignedDeviceCount?: number | null;
}

/**
 * Neutral marker for a system site. Staging and Default Site are expected
 * places for a device to be, not faults, so this carries no status hue — just
 * muted text, matching the small-badge recipe used elsewhere in AURA.
 */
function SystemTag() {
  return (
    <span className="ml-2 shrink-0 rounded-sm border border-border px-1 text-[9px] font-normal uppercase leading-4 tracking-wide text-muted-foreground">
      System
    </span>
  );
}

/** Sites hang one indent step below their Gateway boundary. */
const SITE_INDENT = 'pl-6';

function SiteOption({
  site,
  indent = true,
  description,
}: {
  site: CatalogSite;
  indent?: boolean;
  description?: string;
}) {
  return (
    <SelectItem
      value={site.key}
      className={cn(indent && SITE_INDENT)}
      title={description ?? (site.deviceCount === null ? undefined : `${site.deviceCount} devices`)}
    >
      <span className="flex min-w-0 items-center">
        <span className="truncate">{site.name}</span>
        {site.systemKind && <SystemTag />}
      </span>
    </SelectItem>
  );
}

/**
 * The Gateway boundary header. Not selectable — selecting a Site Group is a
 * different action, owned by the Gateway picker; here it names the boundary so a
 * user can see which Gateway owns each Site.
 */
function GatewayBoundaryLabel({ group }: { group: CatalogSiteGroup }) {
  return (
    <SelectLabel className="flex items-center gap-1.5 pl-2 text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--status-success)]" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        Site Group
      </span>
      <span className="truncate font-semibold text-foreground">{group.name}</span>
      {group.lockingId && (
        <span className="truncate font-mono text-[10px] text-muted-foreground/80">
          {group.lockingId}
        </span>
      )}
      <span className="shrink-0 rounded-sm border border-border px-1 text-[9px] uppercase leading-4 tracking-wide text-muted-foreground">
        {gatewayModeLabel(group.gatewayMode)}
      </span>
    </SelectLabel>
  );
}

export function SourceSiteSelector({
  value,
  onValueChange,
  sites,
  xiqSites,
  triggerClassName = 'w-48',
  osSiteValue = 'name',
  unassignedDeviceCount = null,
}: SourceSiteSelectorProps) {
  const { siteGroups, siteGroup } = useAppContext();
  // Built from the sites the page already loaded — never a second fetch.
  const { os1, xiq, hasXiq } = useSiteCatalogFrom(sites, xiqSites, {
    osSiteValue,
    unassignedDeviceCount,
  });
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

  const hasAnySite = os1.groups.some((g) => g.sites.length > 0);

  return (
    <>
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger className={triggerClassName}>
          <Building className="mr-2 h-4 w-4" />
          <SelectValue placeholder="Select Site" />
        </SelectTrigger>
        <SelectContent>
          {/* OS1 and XIQ are separate sources with different data sets. */}
          <SelectGroup>
            <SelectLabel className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-500">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              OS-ONE
            </SelectLabel>
            <SelectItem value="all">All OS-ONE Sites</SelectItem>
          </SelectGroup>

          {/* Site Group → Site. The boundary row renders even for a single
              Gateway, so which Gateway owns a Site is never implied. */}
          {os1.groups.map((group) => (
            <SelectGroup key={group.id}>
              <GatewayBoundaryLabel group={group} />
              {group.sites.length === 0 ? (
                <div className={cn(SITE_INDENT, 'py-1.5 pr-2 text-xs italic text-muted-foreground')}>
                  No sites yet
                </div>
              ) : (
                group.sites.map((site) => <SiteOption key={site.key} site={site} />)
              )}
            </SelectGroup>
          ))}

          {/* Staging closes the OS1 section: org-wide, always present, last. */}
          <SelectSeparator />
          <SiteOption
            site={os1.staging}
            indent={false}
            description={OS1_STAGING_DESCRIPTION}
          />

          {hasXiq && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                  XIQ
                </SelectLabel>
                {xiq.defaultSite && (
                  <SelectItem value={buildXiqAllSitesValue(xiq.defaultSite.siteGroupId ?? '')}>
                    All XIQ Sites
                  </SelectItem>
                )}
                {xiq.sites.map((site) => (
                  <SiteOption key={site.key} site={site} indent={false} />
                ))}
                {/* Default Site closes the XIQ section. May legitimately be empty. */}
                {xiq.defaultSite && (
                  <SiteOption
                    site={xiq.defaultSite}
                    indent={false}
                    description={XIQ_DEFAULT_SITE_DESCRIPTION}
                  />
                )}
              </SelectGroup>
            </>
          )}

          {siteGroups.length > 0 && (
            <>
              <SelectSeparator />
              <SelectItem value={CONNECT_XIQ} className="text-cyan-500">
                <span className="flex items-center gap-1.5">
                  <Cloud className="h-3.5 w-3.5" />
                  {hasXiq ? 'Reconnect XIQ…' : 'Connect XIQ…'}
                </span>
              </SelectItem>
            </>
          )}

          {/* Sites still loading, or a Gateway that is unreachable. Staging is
              deliberately still offered above — it exists regardless. */}
          {!hasAnySite && os1.groups.length === 0 && (
            <div className="px-2 py-1.5 text-xs italic text-muted-foreground">
              No sites loaded — select a Gateway
            </div>
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
