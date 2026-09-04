import type { WirelessValidationReport } from '@/types/wirelessAssistant';
import { WirelessIntentSummary } from './WirelessIntentSummary';

interface PreProvisionSnapshot {
  site?: { id: string; name: string } | null;
  topology?: { id: string; name: string; vlanid: number } | null;
}

/**
 * "Current controller state" (only data retrieved live, from the
 * validation's preProvisionSnapshot) + "Planned changes" (exactly what the
 * intent would create). Never invents a value neither section can support.
 */
export function ConfigurationPreview({ report }: { report: WirelessValidationReport }) {
  const snapshot = (report.preProvisionSnapshot ?? {}) as PreProvisionSnapshot;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Current controller state</span>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Site</dt>
          <dd className="text-foreground/90">{snapshot.site?.name ?? 'Not resolved'}</dd>
          <dt className="text-muted-foreground">Existing VLAN/topology</dt>
          <dd className="text-foreground/90">
            {snapshot.topology ? `${snapshot.topology.name} (VLAN ${snapshot.topology.vlanid})` : 'None matched'}
          </dd>
        </dl>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Planned changes</span>
        <WirelessIntentSummary intent={report.intent} />
      </div>
    </div>
  );
}
