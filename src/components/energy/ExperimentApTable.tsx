import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/components/ui/utils';
import type { ExperimentApRow } from '@/types/energyExperiment';

interface Props {
  aps: ExperimentApRow[];
}

const ENERGY_STATE_LABEL: Record<ExperimentApRow['energyState'], string> = {
  optimized: 'Energy optimized',
  control: 'Control',
  normal: 'Normal',
};

function watts(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(2)} W`;
}

function radioSummary(ap: ExperimentApRow): string {
  if (ap.radios.length === 0) return '—';
  return ap.radios
    .map((r) => `${r.band ?? `r${r.radioIndex}`}: ${r.enabled === false ? 'off' : `${r.txPower ?? '—'} dBm`}`)
    .join('  ');
}

/**
 * Per-AP drill-down for both sides.
 *
 * `Power` is always a measured reading or a dash — there is no modelled value
 * in this table, so a dash means "we did not observe it", never "we estimated
 * zero".
 */
export function ExperimentApTable({ aps }: Props) {
  if (aps.length === 0) {
    return <p className="text-sm text-muted-foreground">No access points are enrolled.</p>;
  }

  const north = aps.filter((a) => a.side === 'north');
  const south = aps.filter((a) => a.side === 'south');

  const section = (label: string, rows: ExperimentApRow[], caption: string) => (
    <div key={label}>
      <div className="mb-1 flex items-baseline gap-2">
        <h4 className="text-sm font-medium text-foreground">{label}</h4>
        <span className="text-xs text-muted-foreground">{caption}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="py-1.5 pr-3 font-medium">AP</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Model</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Energy state</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">Power</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">Clients</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Radios</th>
              <th scope="col" className="py-1.5 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ap) => (
              <tr key={ap.apSerial} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 pr-3">
                  <div className="font-medium text-foreground">{ap.apName ?? ap.apSerial}</div>
                  <div className="font-mono text-xs text-muted-foreground">{ap.apSerial}</div>
                </td>
                <td className="py-1.5 pr-3 text-muted-foreground">{ap.model ?? '—'}</td>
                <td className="py-1.5 pr-3">
                  <StatusBadge
                    status={
                      ap.energyState === 'optimized'
                        ? 'active'
                        : ap.energyState === 'control'
                          ? 'info'
                          : 'online'
                    }
                    label={ENERGY_STATE_LABEL[ap.energyState]}
                  />
                  {ap.rollback?.restoreError ? (
                    <div className="mt-0.5 text-xs text-[color:var(--status-error)]">
                      Restore unconfirmed
                    </div>
                  ) : null}
                </td>
                <td
                  className={cn(
                    'py-1.5 pr-3 text-right font-mono tabular-nums',
                    ap.currentWatts == null ? 'text-muted-foreground' : 'text-foreground'
                  )}
                >
                  {watts(ap.currentWatts)}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                  {ap.clients ?? '—'}
                </td>
                <td className="py-1.5 pr-3 font-mono text-xs text-muted-foreground">{radioSummary(ap)}</td>
                <td className="py-1.5 text-xs text-muted-foreground">
                  {ap.telemetrySource === 'measured' ? 'Measured' : 'No telemetry'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {section('North — treatment', north, `${north.length} AP`)}
      {section('South — control', south, `${south.length} AP, unchanged`)}
    </div>
  );
}
