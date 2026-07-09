/**
 * Service Profiles landing (EPB-125 · specialized-profiles-parity.md). A
 * tabbed shell over the six specialized profile areas — IoT, RTLS, ESL,
 * Positioning, Analytics, Air Defense — each a full ResourceGridPage with its
 * own live CRUD editor. Mounted profiles are lazy per active tab.
 */
import React, { useState } from 'react';
import { Layers } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { IotPage } from './IotPage';
import { RtlsPage } from './RtlsPage';
import { EslPage } from './EslPage';
import { PositioningPage } from './PositioningPage';
import { AnalyticsPage } from './AnalyticsPage';
import { AdspPage } from './AdspPage';

const TABS = [
  { value: 'iot', label: 'IoT', Page: IotPage },
  { value: 'rtls', label: 'RTLS', Page: RtlsPage },
  { value: 'esl', label: 'ESL', Page: EslPage },
  { value: 'positioning', label: 'Positioning', Page: PositioningPage },
  { value: 'analytics', label: 'Analytics', Page: AnalyticsPage },
  { value: 'airdefense', label: 'Air Defense', Page: AdspPage },
] as const;

export function ServiceProfilesPage() {
  const [tab, setTab] = useState<string>(TABS[0].value);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-6 pt-6">
        <Layers className="h-8 w-8 text-primary" />
        <div className="space-y-1">
          <h1 className="text-2xl font-medium">Service Profiles</h1>
          <p className="text-sm text-muted-foreground">
            Specialized location, IoT, and analytics service profiles
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList className="mx-6 w-fit">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(({ value, Page }) => (
          <TabsContent key={value} value={value}>
            {/* Mount the sub-page only once its tab is first activated. */}
            {tab === value && <Page />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default ServiceProfilesPage;
