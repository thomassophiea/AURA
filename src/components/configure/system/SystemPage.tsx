/**
 * System & Security landing page — five sub-tabs over the appliance-level
 * configuration surfaces: Availability (HA pair + mobility), Allow List/Deny
 * List (client MAC ACL), SNMP, Gateway Settings and Local Service Accounts
 * (names per PLM rulings 2026-08-26). Each tab owns its own live GET/PUT
 * (or list CRUD) against the Configure service layer.
 *
 * Scope honesty: these settings are APPLIANCE-level, not Site-Group-global.
 * On an HA pair the header names which appliance of the pair is being edited
 * (role + peer address from the live availability record) so a pair never
 * masquerades as one shared config surface.
 */
import React, { useEffect, useState } from 'react';
import { HardDrive, ShieldCheck } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { useAppContext } from '../../../contexts/AppContext';
import {
  availabilityService,
  type AvailabilitySettings,
} from '../../../services/configure/availabilityService';
import { gatewayIdentity } from '../../../services/siteCatalog';
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
  const { siteGroup } = useAppContext();

  // Which appliance is being edited: live availability record (role + peer).
  const [availability, setAvailability] = useState<AvailabilitySettings | null>(null);
  useEffect(() => {
    let alive = true;
    setAvailability(null);
    availabilityService
      .get()
      .then((a) => {
        if (alive) setAvailability(a);
      })
      .catch(() => {
        /* banner simply omits pair detail when the record is unreadable */
      });
    return () => {
      alive = false;
    };
  }, [siteGroup?.id]);

  const applianceName =
    siteGroup ? (gatewayIdentity(siteGroup) ?? siteGroup.name ?? 'this appliance') : 'this appliance';
  const pairDetail = availability?.availabilityEnabled
    ? `${availability.availabilityRole === 'PRIMARY' ? 'Primary' : 'Backup'} of a Gateway pair — peer ${availability.availabilityPairAddr}. The paired appliance keeps its own System & Security settings.`
    : availability
      ? 'Standalone Gateway.'
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 px-6 pt-6">
        <ShieldCheck className="h-8 w-8 text-primary" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-medium">System &amp; Security</h1>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              Appliance
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Availability, client allow/deny lists, SNMP, Gateway settings and local service accounts
          </p>
        </div>
      </div>

      {/* Appliance scope banner — these settings do not span the Site Group. */}
      <div className="mx-6 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
        <HardDrive className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          Configuring appliance <span className="font-medium text-foreground">{applianceName}</span>
          {pairDetail ? <> · {pairDetail}</> : null}
        </span>
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
