/**
 * Access Control family (EPB-125 Configure port) — RADIUS Servers / LDAP
 * Configurations / Local Password Repository / Groups / Rules / Certificates
 * as tabs. Each tab is a self-contained ResourceGridPage + full editor over
 * /access-control/v1; only the active tab mounts, so switching tabs defers
 * each resource's initial load until needed.
 */
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { RadiusServersPage } from './RadiusServersPage';
import { LdapConfigurationsPage } from './LdapConfigurationsPage';
import { LocalPasswordRepositoryPage } from './LocalPasswordRepositoryPage';
import { GroupsPage } from './GroupsPage';
import { RulesPage } from './RulesPage';
import { CertificatesPage } from './CertificatesPage';
import { consumeConfigureTabHint } from '../catalog/configureNav';

const TAB_VALUES = ['radius', 'ldap', 'repository', 'groups', 'rules', 'certificates'] as const;

export function AccessControlPage() {
  const [tab, setTab] = useState<string>(() => consumeConfigureTabHint(TAB_VALUES) ?? 'radius');
  return (
    <div className="flex h-full flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col">
        <div className="border-b border-border px-6 pt-4">
          <TabsList>
            <TabsTrigger value="radius">RADIUS Servers</TabsTrigger>
            <TabsTrigger value="ldap">LDAP Configurations</TabsTrigger>
            <TabsTrigger value="repository">Local Password Repository</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
            <TabsTrigger value="certificates">Certificates</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="radius" className="flex-1">
          <RadiusServersPage />
        </TabsContent>
        <TabsContent value="ldap" className="flex-1">
          <LdapConfigurationsPage />
        </TabsContent>
        <TabsContent value="repository" className="flex-1">
          <LocalPasswordRepositoryPage />
        </TabsContent>
        <TabsContent value="groups" className="flex-1">
          <GroupsPage />
        </TabsContent>
        <TabsContent value="rules" className="flex-1">
          <RulesPage />
        </TabsContent>
        <TabsContent value="certificates" className="flex-1">
          <CertificatesPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AccessControlPage;
