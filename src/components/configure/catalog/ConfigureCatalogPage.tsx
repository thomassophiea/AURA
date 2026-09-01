/**
 * ConfigureCatalogPage — the Configure landing surface. A two-view toggle
 * (Feature Catalog / Architecture) over every Configure feature, with live
 * record counts and drill-through. The catalog cannot import App.tsx; it
 * surfaces navigation through the optional `onNavigate(viewId)` prop, where
 * viewId is an App view key (see catalogData.ts for the map).
 *
 * Scope: configuration is scoped to the Site Group's Gateway (Site Group = the
 * Gateway boundary). The header carries a Site Group selector when more than
 * one exists; changing it re-points the API base URL (via AppContext) and
 * re-fetches every count. Standalone vs Gateway Pair is read live from the
 * appliance's availability record — never inferred from stale metadata.
 */
import { useCallback, useEffect, useState } from 'react';
import { LayoutGrid, Server, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { useAppContext } from '../../../contexts/AppContext';
import { gatewayIdentity } from '../../../services/siteCatalog';
import { isPaired } from '../../../services/configure/availabilityService';
import { FeatureCatalogView } from './FeatureCatalogView';
import { ArchitectureView } from './ArchitectureView';
import { useFeatureCounts } from './useFeatureCounts';

export interface ConfigureCatalogPageProps {
  /** Navigate to an App view key when a feature card/node is selected. */
  onNavigate?: (viewId: string) => void;
}

type CatalogMode = 'catalog' | 'architecture';

export function ConfigureCatalogPage({ onNavigate }: ConfigureCatalogPageProps) {
  const [mode, setMode] = useState<CatalogMode>('catalog');
  const { siteGroup, siteGroups, setActiveSiteGroup } = useAppContext();
  const { counts } = useFeatureCounts(siteGroup?.id);

  // Live HA truth from /platformmanager/v1/availability; null while unknown.
  const [paired, setPaired] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    setPaired(null);
    isPaired().then((value) => {
      if (alive) setPaired(value);
    });
    return () => {
      alive = false;
    };
  }, [siteGroup?.id]);

  const handleNavigate = useCallback(
    (viewId: string) => {
      if (onNavigate) {
        onNavigate(viewId);
      } else {
        toast.info('Navigation target', { description: viewId });
      }
    },
    [onNavigate]
  );

  const modeLabel = paired === null ? null : paired ? 'Gateway Pair' : 'Standalone';
  const groupLabel = (name?: string | null, identity?: string | null) =>
    name ?? identity ?? 'Gateway';

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Configure</h2>
            {siteGroups.length > 1 ? (
              <Select
                value={siteGroup?.id ?? ''}
                onValueChange={(id) => {
                  const next = siteGroups.find((g) => g.id === id);
                  if (next) setActiveSiteGroup(next);
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="h-7 max-w-[280px] gap-1.5 border-border text-xs text-muted-foreground"
                  aria-label="Configuration scope (Site Group)"
                >
                  <Server className="size-3 shrink-0" aria-hidden />
                  <SelectValue placeholder="Select Site Group" />
                </SelectTrigger>
                <SelectContent>
                  {siteGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {groupLabel(g.name, gatewayIdentity(g))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              siteGroup && (
                <Badge variant="outline" className="gap-1.5 font-normal text-muted-foreground">
                  <Server className="size-3" aria-hidden />
                  {groupLabel(siteGroup.name, gatewayIdentity(siteGroup))}
                </Badge>
              )
            )}
            {siteGroup && modeLabel && (
              <Badge variant="outline" className="font-normal text-muted-foreground">
                {modeLabel}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Everything configurable on this Gateway — profiles, policies, and services applied
            across its sites
          </p>
        </div>
        <Tabs value={mode} onValueChange={(value) => setMode(value as CatalogMode)}>
          <TabsList>
            <TabsTrigger value="catalog" className="gap-1.5">
              <LayoutGrid className="size-4" aria-hidden />
              Feature Catalog
            </TabsTrigger>
            <TabsTrigger value="architecture" className="gap-1.5">
              <Workflow className="size-4" aria-hidden />
              Architecture
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {mode === 'catalog' ? (
        <FeatureCatalogView counts={counts} onNavigate={handleNavigate} />
      ) : (
        <ArchitectureView counts={counts} onNavigate={handleNavigate} />
      )}
    </div>
  );
}
