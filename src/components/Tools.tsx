import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Wrench, Radio, Upload, GitBranch, TestTube, Zap } from 'lucide-react';
import { AFCPlanningTool } from './AFCPlanningTool';
import { ApiTestTool } from './ApiTestTool';
import { RFManagementTools } from './RFManagementTools';
import { DeviceUpgrade } from './DeviceUpgrade';
import { AdoptionRulesManagement } from './AdoptionRulesManagement';

export function Tools() {
  const [activeTab, setActiveTab] = useState('rf-management');

  return (
    <div className="h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
        <div className="border-b">
          <TabsList className="h-12 px-6">
            <TabsTrigger value="rf-management" className="flex items-center gap-2">
              <Radio className="h-4 w-4" />
              RF Management
            </TabsTrigger>
            <TabsTrigger value="device-upgrade" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Device Upgrade
            </TabsTrigger>
            <TabsTrigger value="adoption-rules" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Adoption Rules
            </TabsTrigger>
            <TabsTrigger value="afc-planning" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              AFC Planning
            </TabsTrigger>
            <TabsTrigger value="api-test" className="flex items-center gap-2">
              <TestTube className="h-4 w-4" />
              API Test
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="rf-management" className="m-0 h-[calc(100%-3rem)]">
          <RFManagementTools />
        </TabsContent>

        <TabsContent value="device-upgrade" className="m-0 h-[calc(100%-3rem)]">
          <DeviceUpgrade />
        </TabsContent>

        <TabsContent value="adoption-rules" className="m-0 h-[calc(100%-3rem)]">
          <AdoptionRulesManagement />
        </TabsContent>

        <TabsContent value="afc-planning" className="m-0 h-[calc(100%-3rem)]">
          <AFCPlanningTool />
        </TabsContent>

        <TabsContent value="api-test" className="m-0 h-[calc(100%-3rem)]">
          <ApiTestTool />
        </TabsContent>
      </Tabs>
    </div>
  );
}
