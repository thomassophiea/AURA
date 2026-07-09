/**
 * Renders the active profile tab body. Keeps the editor sheet lean by owning
 * the tab → component mapping (including the six specialized-profile reference
 * selects that share ReferenceTab).
 */
import React from 'react';
import { RadiosTab } from './tabs/RadiosTab';
import { NetworksTab } from './tabs/NetworksTab';
import { RolesTab } from './tabs/RolesTab';
import { VlansTab } from './tabs/VlansTab';
import { MeshpointsTab } from './tabs/MeshpointsTab';
import { WiredPortsTab } from './tabs/WiredPortsTab';
import { ReferenceTab } from './tabs/ReferenceTab';
import type { ProfileTab } from './constants';
import type { ProfileTabContext } from './types';

export function TabRouter({ tab, ctx }: { tab: ProfileTab; ctx: ProfileTabContext }) {
  switch (tab) {
    case 'Radios':
      return <RadiosTab ctx={ctx} />;
    case 'Networks':
      return <NetworksTab ctx={ctx} />;
    case 'Roles':
      return <RolesTab ctx={ctx} />;
    case 'VLANs':
      return <VlansTab ctx={ctx} />;
    case 'Meshpoints':
      return <MeshpointsTab ctx={ctx} />;
    case 'Wired Ports':
      return <WiredPortsTab ctx={ctx} />;
    case 'Air Defense':
      return (
        <ReferenceTab ctx={ctx} label="Air Defense Profile" fieldKey="airDefenseProfileId" pool={ctx.pools.airdefense} withAirDefenseEssentials />
      );
    case 'IoT':
      return <ReferenceTab ctx={ctx} label="IoT Profile" fieldKey="iotProfileId" pool={ctx.pools.iot} />;
    case 'ESL':
      return <ReferenceTab ctx={ctx} label="ESL Profile" fieldKey="eslProfileId" pool={ctx.pools.esl} />;
    case 'Positioning':
      return <ReferenceTab ctx={ctx} label="Positioning Profile" fieldKey="positioningProfileId" pool={ctx.pools.positioning} />;
    case 'Analytics':
      return <ReferenceTab ctx={ctx} label="Analytics Profile" fieldKey="analyticsProfileId" pool={ctx.pools.analytics} />;
    case 'RTLS':
      return <ReferenceTab ctx={ctx} label="RTLS Profile" fieldKey="rtlsProfileId" pool={ctx.pools.rtls} />;
    default:
      return null;
  }
}
