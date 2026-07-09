/**
 * ConfigureCatalogPage — the Configure landing surface. A two-view toggle
 * (Feature Catalog / Architecture) over the 26 Configure features, with live
 * record counts and drill-through. The catalog cannot import App.tsx; it
 * surfaces navigation through the optional `onNavigate(viewId)` prop, where
 * viewId is an App view key (see catalogData.ts for the map).
 */
import { useCallback, useState } from 'react';
import { LayoutGrid, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
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
  const { counts } = useFeatureCounts();

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

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Configure</h2>
          <p className="text-sm text-muted-foreground">
            Profiles, policies, and services applied across your sites
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
