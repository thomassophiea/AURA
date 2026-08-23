import { Sparkles } from 'lucide-react';

/**
 * OS ONE upsell shown on the Infrastructure tab when an XIQ site is selected.
 * The Sentinel checks (VLAN trunk, DHCP / RADIUS reachability) read Campus
 * Controller / OS ONE Gateway state and have no XIQ equivalent, so rather than
 * an empty, idle board we explain why and point at the upgrade — mirroring the
 * Energy page's `EnergyEmptyState` "xiq-unsupported" message.
 */
export function InfraOsOneGate() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
      <Sparkles className="h-8 w-8 text-muted-foreground" aria-hidden />
      <h3 className="text-base font-semibold text-foreground">
        Infrastructure health monitoring requires an OS ONE Gateway
      </h3>
      <p className="max-w-md text-sm text-muted-foreground">
        Infrastructure checks — VLAN trunk, DHCP and RADIUS reachability — are available only for OS
        ONE Gateway sites. Upgrade this Site to OS ONE to enable them.
      </p>
    </div>
  );
}
