/**
 * System & Security landing page — five sub-tabs over the appliance-level
 * configuration surfaces: Availability (HA pair + mobility), Allow List/Deny
 * List (client MAC ACL), SNMP, Gateway Settings and Local Service Accounts
 * (names per PLM rulings 2026-08-26). Each tab owns its own live GET/PUT
 * (or list CRUD) against the Configure service layer.
 */
import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { AccessControlTab } from './AccessControlTab';
import { SnmpTab } from './SnmpTab';
import { GlobalSettingsTab } from './GlobalSettingsTab';
import { AdministratorsTab } from './AdministratorsTab';
import { AvailabilityTab } from './AvailabilityTab';
import { consumeConfigureTabHint } from '../catalog/configureNav';

const TABS = [
  { value: 'availability', label: 'Availability' },
  { value: 'access', label: 'Allow List/Deny List' },
  { value: 'snmp', label: 'SNMP' },
  { value: 'global', label: 'Gateway Settings' },
  { value: 'admins', label: 'Local Service Accounts' },
] as const;

const TAB_VALUES = TABS.map((t) => t.value);

export function SystemPage() {
  const [tab, setTab] = useState<string>(
    () => consumeConfigureTabHint(TAB_VALUES) ?? 'availability'
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 px-6 pt-6">
        <ShieldCheck className="h-8 w-8 text-primary" />
        <div className="space-y-1">
          <h1 className="text-2xl font-medium">System &amp; Security</h1>
          <p className="text-sm text-muted-foreground">
            Availability, client allow/deny lists, SNMP, Gateway settings and local service
            accounts
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mx-6 h-auto flex-wrap justify-start">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="flex-none">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="access" className="px-6 pb-6">
          <AccessControlTab />
        </TabsContent>
        <TabsContent value="snmp" className="px-6 pb-6">
          <SnmpTab />
        </TabsContent>
        <TabsContent value="global" className="px-6 pb-6">
          <GlobalSettingsTab />
        </TabsContent>
        {/* AdministratorsTab renders its own ResourceGridPage padding. */}
        <TabsContent value="admins">
          <AdministratorsTab />
        </TabsContent>
        <TabsContent value="availability" className="px-6 pb-6">
          <AvailabilityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default SystemPage;
