/**
 * Policy suite (EPB-125 Configure port) — Roles / VLANs / VLAN Groups / CoS /
 * Rate Limiters as tabs. Each tab is a self-contained ResourceGridPage + full
 * editor over the typed services/configure layer; only the active tab mounts,
 * so switching tabs defers each resource's initial load until needed.
 */
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { RolesPage } from './RolesPage';
import { VlansPage } from './VlansPage';
import { VlanGroupsPage } from './VlanGroupsPage';
import { CosPage } from './CosPage';
import { RateLimitersPage } from './RateLimitersPage';
import { consumeConfigureTabHint } from '../catalog/configureNav';

const TAB_VALUES = ['roles', 'vlans', 'vlangroups', 'cos', 'ratelimiters'] as const;

export function PolicyPage() {
  const [tab, setTab] = useState<string>(() => consumeConfigureTabHint(TAB_VALUES) ?? 'roles');
  return (
    <div className="flex h-full flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col">
        <div className="border-b border-border px-6 pt-4">
          <TabsList>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="vlans">VLANs</TabsTrigger>
            <TabsTrigger value="vlangroups">VLAN Groups</TabsTrigger>
            <TabsTrigger value="cos">Class of Service</TabsTrigger>
            <TabsTrigger value="ratelimiters">Rate Limiters</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="roles" className="flex-1">
          <RolesPage />
        </TabsContent>
        <TabsContent value="vlans" className="flex-1">
          <VlansPage />
        </TabsContent>
        <TabsContent value="vlangroups" className="flex-1">
          <VlanGroupsPage />
        </TabsContent>
        <TabsContent value="cos" className="flex-1">
          <CosPage />
        </TabsContent>
        <TabsContent value="ratelimiters" className="flex-1">
          <RateLimitersPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default PolicyPage;
