/**
 * SitesAndGroupsPage — Combined tabbed view for Site Groups and Sites.
 * Replaces separate configure-site-groups and configure-sites pages.
 */

import { useState, useCallback } from 'react';
import { Server, Building2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { SiteGroupsPage } from './SiteGroupsPage';
import { SitesPage } from './SitesPage';

type TabId = 'site-groups' | 'sites';

interface SitesAndGroupsPageProps {
  initialTab?: TabId;
  onShowSiteDetail?: (siteId: string, siteName: string) => void;
}

export function SitesAndGroupsPage({ initialTab = 'site-groups', onShowSiteDetail }: SitesAndGroupsPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [siteGroupFilter, setSiteGroupFilter] = useState<{ id: string; name: string } | null>(null);

  // When user clicks site count or "View Sites" in site groups tab, switch to sites tab with filter
  const handleNavigateToSites = useCallback((siteGroupId: string, siteGroupName: string) => {
    setSiteGroupFilter({ id: siteGroupId, name: siteGroupName });
    setActiveTab('sites');
  }, []);

  const handleClearFilter = useCallback(() => {
    setSiteGroupFilter(null);
  }, []);

  return (
    <div className="flex-1 px-4 pt-4 md:px-6 md:pt-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <TabsList className="mb-4">
          <TabsTrigger value="site-groups" className="gap-2">
            <Server className="h-4 w-4" />
            Site Groups
          </TabsTrigger>
          <TabsTrigger value="sites" className="gap-2">
            <Building2 className="h-4 w-4" />
            Sites
          </TabsTrigger>
        </TabsList>

        <TabsContent value="site-groups" className="mt-0">
          <SiteGroupsPage onNavigateToSites={handleNavigateToSites} />
        </TabsContent>

        <TabsContent value="sites" className="mt-0">
          <SitesPage
            siteGroupFilter={siteGroupFilter}
            onClearFilter={handleClearFilter}
            onShowDetail={onShowSiteDetail}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
