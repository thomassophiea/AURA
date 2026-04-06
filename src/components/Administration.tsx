import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Settings, Users, Package } from 'lucide-react';
import { SystemAdministration } from './SystemAdministration';
import { AdministratorsManagement } from './AdministratorsManagement';
import { ApplicationsManagement } from './ApplicationsManagement';

interface AdministrationProps {
  networkAssistantEnabled?: boolean;
  onToggleNetworkAssistant?: (enabled: boolean) => void;
}

export function Administration({ networkAssistantEnabled = false, onToggleNetworkAssistant }: AdministrationProps) {
  const [activeTab, setActiveTab] = useState('system');

  return (
    <div className="h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
        <div className="border-b">
          <TabsList className="h-12 px-6">
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              System
            </TabsTrigger>
            <TabsTrigger value="administrators" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Local Admins
            </TabsTrigger>
            <TabsTrigger value="applications" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Applications
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="system" className="m-0 h-[calc(100%-3rem)]">
          <SystemAdministration
            networkAssistantEnabled={networkAssistantEnabled}
            onToggleNetworkAssistant={onToggleNetworkAssistant}
          />
        </TabsContent>

        <TabsContent value="administrators" className="m-0 h-[calc(100%-3rem)]">
          <AdministratorsManagement />
        </TabsContent>

        <TabsContent value="applications" className="m-0 h-[calc(100%-3rem)]">
          <ApplicationsManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
