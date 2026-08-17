import * as React from 'react';
import { Server, ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useAppContext } from '@/contexts/AppContext';
import { gatewayModeLabel, deriveGatewayMode, pinSystemSitesLast } from '@/services/siteCatalog';
import { OS1_STAGING_LABEL, SYSTEM_SITE_SORT_PRIORITY, NORMAL_SITE_SORT_PRIORITY } from '@/types/siteCatalog';
import type { SiteGroup } from '@/types/domain';

export interface SiteGroupSitePickerProps {
  sites: string[];
  selectedSite: string;
  onSelectSite: (site: string) => void;
  className?: string;
}

function controllerLabel(sg: SiteGroup): string {
  const name = sg.hostname ?? sg.name;
  return sg.locking_id ? `${name} · ${sg.locking_id}` : name;
}

/**
 * Site ordering for this picker.
 *
 * This is a *configuration target* picker — the selection decides which
 * Gateway and Site a network is written to. Staging is not a configuration
 * target (you do not push a WLAN to the unassigned pool), so no synthetic
 * Staging row is injected here; that belongs on the monitoring and device-list
 * surfaces. The system-site ordering rule is still applied, so a Site that is
 * genuinely named Staging cannot land in the middle of the list.
 */
const orderSiteNames = pinSystemSitesLast<{ name: string; sortPriority: number }>((a, b) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
);

function sortSiteNames(names: string[]): string[] {
  return names
    .map((name) => ({
      name,
      sortPriority:
        name === OS1_STAGING_LABEL ? SYSTEM_SITE_SORT_PRIORITY : NORMAL_SITE_SORT_PRIORITY,
    }))
    .sort(orderSiteNames)
    .map((entry) => entry.name);
}

export function SiteGroupSitePicker({
  sites,
  selectedSite,
  onSelectSite,
  className,
}: SiteGroupSitePickerProps): React.ReactElement {
  const { siteGroups, orgSiteGroupFilter, setOrgSiteGroupFilter } = useAppContext();
  const [open, setOpen] = React.useState(false);
  const orderedSites = React.useMemo(() => sortSiteNames(sites), [sites]);

  const selectedSiteGroup = siteGroups.find((sg) => sg.id === orgSiteGroupFilter) ?? null;

  const siteLabel = selectedSite === 'all' || !selectedSite ? 'All Sites' : selectedSite;

  const triggerLabel = selectedSiteGroup
    ? `${controllerLabel(selectedSiteGroup)} — ${siteLabel}`
    : 'Select gateway';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="button"
          className={cn('flex items-center justify-between gap-2 w-full sm:w-[260px]', className)}
        >
          <Server className="h-4 w-4 shrink-0 opacity-70" />
          <span className="flex-1 truncate text-left">{triggerLabel}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search gateways or sites…" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>

            {/* Gateways group */}
            <CommandGroup heading="Gateways">
              {siteGroups.map((sg) => {
                const isSelected = sg.id === orgSiteGroupFilter;
                const searchValue = `${sg.name} ${sg.hostname ?? ''} ${sg.locking_id ?? ''}`;
                return (
                  <CommandItem
                    key={sg.id}
                    value={searchValue.toLowerCase()}
                    onSelect={() => {
                      setOrgSiteGroupFilter(sg.id);
                      // Do NOT close popover — allow user to also pick a site
                    }}
                    className="flex items-start gap-2 py-2"
                  >
                    <Check
                      className={cn('mt-0.5 h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-semibold">{sg.name}</span>
                        {/* A Site Group is one Gateway or a Gateway/HA pair —
                            the boundary this configuration is written to. */}
                        <span className="shrink-0 rounded-sm border border-border px-1 text-[9px] uppercase leading-4 tracking-wide text-muted-foreground">
                          {gatewayModeLabel(deriveGatewayMode(sg))}
                        </span>
                      </span>
                      {(sg.hostname || sg.locking_id) && (
                        <span className="text-xs text-muted-foreground truncate">
                          {[sg.hostname, sg.locking_id].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>

            {/* Sites group */}
            <CommandGroup heading="Sites">
              {orderedSites.length === 0 ? (
                <CommandItem disabled value="__no-sites__" className="text-muted-foreground italic">
                  No sites loaded — select a gateway
                </CommandItem>
              ) : (
                <>
                  <CommandItem
                    key="all"
                    value="all"
                    onSelect={() => {
                      onSelectSite('all');
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0',
                        selectedSite === 'all' || !selectedSite ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    All Sites
                  </CommandItem>
                  {orderedSites.map((site) => (
                    <CommandItem
                      key={site}
                      value={site}
                      onSelect={() => {
                        onSelectSite(site);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'h-4 w-4 shrink-0',
                          selectedSite === site ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {site}
                    </CommandItem>
                  ))}
                </>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
