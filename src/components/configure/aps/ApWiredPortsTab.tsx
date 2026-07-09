/**
 * AP editor > Wired Ports tab (gap 23). Table gated behind wiredPortsOvr; rows
 * from wiredPorts[] (portIndex/portName/ethSpeed/ethMode/energyEffEth). Speed
 * is the reported value — read-only. When speed = Auto the third column is
 * Energy Efficient Ethernet (ENERGY-EFF-ETH feature), otherwise it is Duplex.
 */
import React from 'react';
import { FieldRow } from '../_kit';
import { Switch } from '../../ui/switch';
import { Badge } from '../../ui/badge';
import { ApSelect } from './controls';
import { AP_ETH_SPEEDS, hasFeature } from './apHelpers';
import type { ApDetail } from '../../../types/configure';

export interface ApWiredPortsTabProps {
  form: ApDetail;
  upd: (path: string, value: unknown) => void;
}

const DUPLEX = [
  { id: 'fullDuplex', label: 'Full Duplex' },
  { id: 'halfDuplex', label: 'Half Duplex' },
];

export function ApWiredPortsTab({ form, upd }: ApWiredPortsTabProps) {
  const ports = form.wiredPorts ?? [];
  const eee = hasFeature(form.features, 'ENERGY-EFF-ETH');

  return (
    <div className="max-w-2xl space-y-4">
      <FieldRow label="Override wired port settings" inline>
        <Switch checked={!!form.wiredPortsOvr} onCheckedChange={(v) => upd('wiredPortsOvr', v)} />
      </FieldRow>

      {!form.wiredPortsOvr ? (
        <Badge variant="secondary">Inherited from profile</Badge>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="grid grid-cols-3 gap-2 bg-muted px-4 py-2 text-xs font-semibold">
            <div>Port</div>
            <div>Speed (reported)</div>
            <div>Duplex / Energy Efficient Ethernet</div>
          </div>
          {ports.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No wired ports reported.</p>
          ) : (
            ports.map((p, i) => (
              <div key={i} className="grid grid-cols-3 items-center gap-2 border-t border-border px-4 py-2">
                <div className="text-sm">{p.portName || `ETH${p.portIndex}`}</div>
                <ApSelect className="w-36" disabled value={p.ethSpeed || 'speedAuto'} options={AP_ETH_SPEEDS} onChange={() => undefined} />
                {p.ethSpeed === 'speedAuto' ? (
                  eee ? (
                    <ApSelect
                      className="w-40"
                      value={p.energyEffEth ? 'Enabled' : 'Disabled'}
                      options={['Enabled', 'Disabled']}
                      onChange={(v) => upd(`wiredPorts.${i}.energyEffEth`, v === 'Enabled')}
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )
                ) : (
                  <ApSelect
                    className="w-40"
                    value={p.ethMode || 'fullDuplex'}
                    options={DUPLEX}
                    onChange={(v) => upd(`wiredPorts.${i}.ethMode`, v)}
                  />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
