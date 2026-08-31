/**
 * Site AFC & Geo-Diagnostics page — a read-oriented detail surface mirroring
 * the Extreme controller's Site editor tab set (Device Groups · Floor Plans ·
 * Location · Access Points [General / AFC / Geo Diagnostics] · Switches · Allow
 * List/Deny List · Advanced) over the live /v3/sites record, with the AFC and
 * Geo-Diagnostics sub-views populated by joining the site's device-group AP
 * serials to /v1/aps/{serial}. Config truth only — runtime AFC/geo telemetry is
 * labelled as not exposed by the controller config API (schema audit).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, SatelliteDish } from 'lucide-react';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { Skeleton } from '../../ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { sitesService } from '../../../services/configure';
import type { SiteConfig } from '../../../types/configure';
import { logger } from '../../../services/logger';
import { SiteAccessPointsTab } from './SiteAccessPointsTab';
import {
  SiteAdvancedPanel,
  SiteAllowDenyPanel,
  SiteDeviceGroupsPanel,
  SiteFloorPlansPanel,
  SiteLocationPanel,
  SiteSwitchesPanel,
} from './SiteInfoPanels';
import { useSiteAfcAps } from './useSiteAfcAps';

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '—'}</p>
    </div>
  );
}

export function SiteAfcGeoPage() {
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadSites = useCallback(async () => {
    setSitesLoading(true);
    try {
      const list = await sitesService.list();
      setSites(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    } catch (error) {
      logger.warn('[configure/siteafc] failed to load sites', error);
      setSites([]);
    } finally {
      setSitesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  const site = useMemo(() => sites.find((s) => s.id === selectedId) ?? null, [sites, selectedId]);
  const { aps, loading: apsLoading, refresh } = useSiteAfcAps(site);
  const apRanging = Boolean(site?.apRanging);

  const tabs = useMemo(
    () =>
      site
        ? [
            {
              id: 'devicegroups',
              label: 'Device Groups',
              node: <SiteDeviceGroupsPanel site={site} />,
            },
            { id: 'floorplans', label: 'Floor Plans', node: <SiteFloorPlansPanel aps={aps} /> },
            { id: 'location', label: 'Location', node: <SiteLocationPanel site={site} /> },
            {
              id: 'accesspoints',
              label: 'Access Points',
              node: <SiteAccessPointsTab aps={aps} apRanging={apRanging} loading={apsLoading} />,
            },
            { id: 'switches', label: 'Switches', node: <SiteSwitchesPanel site={site} /> },
            {
              id: 'allowdeny',
              label: 'Allow / Deny List',
              node: <SiteAllowDenyPanel site={site} />,
            },
            { id: 'advanced', label: 'Advanced', node: <SiteAdvancedPanel site={site} /> },
          ]
        : [],
    [site, aps, apRanging, apsLoading]
  );

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <SatelliteDish className="h-8 w-8 text-primary" />
          <div className="space-y-1">
            <h1 className="text-2xl font-medium">Site AFC &amp; Geo-Diagnostics</h1>
            <p className="text-sm text-muted-foreground">
              Site configuration, AFC eligibility and geo-diagnostics from the live controller
              config (/v3/sites + /v1/aps).
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void loadSites();
            refresh();
          }}
          disabled={sitesLoading || apsLoading}
        >
          <RefreshCw className={`h-4 w-4 ${sitesLoading || apsLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 p-4">
          <div className="min-w-[260px] space-y-1.5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Site</p>
            {sitesLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.siteName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <HeaderStat label="Country" value={site?.country ?? ''} />
          <HeaderStat label="Timezone" value={site?.timezone ?? ''} />
          <HeaderStat
            label="Mode"
            value={site ? (site.distributed ? 'Distributed' : 'Centralized') : ''}
          />
          <HeaderStat label="Access Points" value={site ? String(aps.length) : ''} />
        </CardContent>
      </Card>

      {!sitesLoading && sites.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No sites found on this controller.
          </CardContent>
        </Card>
      )}

      {site && (
        <Tabs defaultValue="accesspoints">
          <TabsList className="h-auto w-full flex-wrap justify-start">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="flex-none">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent key={t.id} value={t.id} className="pt-4">
              {t.node}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

export default SiteAfcGeoPage;
