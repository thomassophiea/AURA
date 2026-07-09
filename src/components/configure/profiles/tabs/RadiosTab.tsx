/**
 * Radios tab — Operating Mode (gated SOFTWARE-DEFINED-RADIOS), a per-radio
 * table (band / admin mode / protocol-role / client-bridge network) and a
 * per-radio Advanced button. Admin Mode locks for sensor radios; a dual-radio
 * alert shows when a non-BOTH-RADIOS-ON platform has both radios enabled.
 */
import React from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { Button } from '../../../ui/button';
import { PSelect } from '../controls';
import { OPERATING_MODE_OPTS, RADIO_MODE_LABEL } from '../constants';
import { bandOf } from '../helpers';
import type { Opt, ProfileTabContext } from '../types';

export function RadiosTab({ ctx }: { ctx: ProfileTabContext }) {
  const { form, radios, F, pools, setField, updRadio, openRadioAdvanced, openClientBridge } = ctx;

  if (!radios.length) {
    return <p className="p-4 text-sm text-muted-foreground">This platform has no configurable radios.</p>;
  }

  const bridgeRadios = radios.filter((r) => r.mode === 'bridge');
  const cbMissing = bridgeRadios.some((r) => !r.cbServiceId);
  const dualAlert = !F('BOTH-RADIOS-ON') && radios.length >= 2 && radios[0].adminState && radios[1].adminState;
  const svcOpts: Opt[] = [{ id: '', label: '— None —' }, ...pools.services];
  const cols = `180px repeat(${radios.length}, minmax(150px, 1fr))`;

  const Row = ({ label, cells }: { label: React.ReactNode; cells: React.ReactNode[] }) => (
    <div className="grid items-center border-t border-border py-3" style={{ gridTemplateColumns: cols }}>
      <div className="px-4 text-sm">{label}</div>
      {cells.map((c, i) => (
        <div key={i} className="flex justify-center px-2">
          {c}
        </div>
      ))}
    </div>
  );

  return (
    <div className="max-w-3xl space-y-4">
      {F('SOFTWARE-DEFINED-RADIOS') && (
        <div className="flex items-center gap-4">
          <div className="text-sm font-medium">Operating Mode</div>
          <PSelect
            value={form.operatingMode || 'GENERIC'}
            options={OPERATING_MODE_OPTS}
            onChange={(v) => setField('operatingMode', v)}
            className="w-72"
            ariaLabel="Operating mode"
          />
        </div>
      )}

      {dualAlert && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          This platform cannot operate both radios simultaneously — disable one radio.
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-border">
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          <div className="bg-muted/50" />
          {radios.map((r) => (
            <div key={r.radioIndex} className="bg-muted/50 py-3 text-center text-sm font-semibold">
              {r.radioName}
            </div>
          ))}
        </div>

        <Row
          label="Radio Band"
          cells={radios.map((r) => (
            <span key={r.radioIndex} className="text-sm text-muted-foreground">
              {bandOf(r)}
            </span>
          ))}
        />
        <Row
          label="Admin Mode"
          cells={radios.map((r, i) => (
            <PSelect
              key={r.radioIndex}
              value={r.adminState ? 'On' : 'Off'}
              options={[
                { id: 'On', label: 'On' },
                { id: 'Off', label: 'Off' },
              ]}
              disabled={r.mode === 'sensor'}
              onChange={(v) => updRadio(i, 'adminState', v === 'On')}
              className="w-32"
              ariaLabel={`${r.radioName} admin mode`}
            />
          ))}
        />
        <Row
          label="Protocol / Role"
          cells={radios.map((r, i) => (
            <PSelect
              key={r.radioIndex}
              value={r.mode}
              options={(r.supportedModes?.length ? r.supportedModes : [r.mode]).map((m) => ({
                id: m,
                label: RADIO_MODE_LABEL[m] ?? m,
              }))}
              onChange={(v) => updRadio(i, 'mode', v)}
              className="w-40"
              ariaLabel={`${r.radioName} protocol`}
            />
          ))}
        />
        {bridgeRadios.length > 0 && (
          <Row
            label="CB Network"
            cells={radios.map((r, i) =>
              r.mode === 'bridge' ? (
                <span key={r.radioIndex} className="flex items-center gap-1">
                  <PSelect
                    value={r.cbServiceId || ''}
                    options={svcOpts}
                    onChange={(v) => updRadio(i, 'cbServiceId', v || null)}
                    className="w-36"
                    ariaLabel={`${r.radioName} client bridge network`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Client Bridge credentials"
                    onClick={openClientBridge}
                  >
                    <KeyRound className="h-4 w-4" />
                  </Button>
                </span>
              ) : (
                <span key={r.radioIndex} className="text-muted-foreground">
                  —
                </span>
              )
            )}
          />
        )}
        <Row
          label=""
          cells={radios.map((r, i) => (
            <Button key={r.radioIndex} type="button" size="sm" onClick={() => openRadioAdvanced(i)}>
              Advanced
            </Button>
          ))}
        />
      </div>

      {bridgeRadios.length > 0 && cbMissing && (
        <p className="text-xs text-destructive">
          A Client Bridge network must be selected for every radio in client-bridge mode.
        </p>
      )}
    </div>
  );
}
