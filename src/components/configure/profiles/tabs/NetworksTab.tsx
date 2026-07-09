/**
 * Networks tab — the radio-interface matrix. Checkboxes seed from and write to
 * radioIfList [{serviceId,index}]; per-platform columns (MLO, Band Steering,
 * wired ports, IoT) appear behind their feature gates. The first WLAN assigned
 * to a radio is flagged as the primary BSSID (bssid0). CB-mode radios show a
 * fixed check for their client-bridge WLAN; sensor radios are disabled.
 */
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../ui/table';
import { PCheck } from '../controls';
import { radioIfOf, wiredIfOf, strArr } from '../helpers';
import type { ProfileTabContext } from '../types';

export function NetworksTab({ ctx }: { ctx: ProfileTabContext }) {
  const { form, radios, F, pools, toggleInArr, mut } = ctx;
  // IoT column has no wire key on the captured records (parity gap 13 / UQ-1) —
  // UI-only selection, intentionally not persisted on save.
  const [iotSel, setIotSel] = useState<Record<string, boolean>>({});

  const services = pools.services;
  const showMlo = F('MLO');
  const showBs = !F('NO-BAND-STEERING');
  const showIot = F('IOT');
  const wired = (form.wiredPorts ?? []).filter((p) => p.portIndex > 0);

  const ifl = radioIfOf(form);
  const has = (sid: string, idx: number) => ifl.some((e) => e.serviceId === sid && e.index === idx);
  const toggleIf = (sid: string, idx: number) =>
    mut((c) => {
      const a = (c.radioIfList as { serviceId: string; index: number }[]) ?? [];
      const i = a.findIndex((e) => e.serviceId === sid && e.index === idx);
      if (i >= 0) a.splice(i, 1);
      else a.push({ serviceId: sid, index: idx });
      c.radioIfList = a;
    });

  const wifl = wiredIfOf(form);
  const hasW = (sid: string, idx: number) => wifl.some((e) => e.serviceId === sid && e.index === idx);
  const toggleW = (sid: string, idx: number) =>
    mut((c) => {
      const a = (c.wiredIfList as { serviceId: string; index: number }[]) ?? [];
      const i = a.findIndex((e) => e.serviceId === sid && e.index === idx);
      if (i >= 0) a.splice(i, 1);
      else a.push({ serviceId: sid, index: idx });
      c.wiredIfList = a;
    });

  const mlo = strArr(form.mloServiceIDs);
  const bs = strArr(form.bandSteeringServiceIds);

  const bssid0: Record<number, string> = {};
  radios.forEach((r) => {
    const first = services.find((s) => has(s.id, r.radioIndex));
    if (first) bssid0[r.radioIndex] = first.id;
  });

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" disabled title="Create a WLAN from the Networks page">
          <Plus className="mr-1 h-4 w-4" />
          New Network
        </Button>
      </div>

      {services.length === 0 ? (
        <p className="text-sm text-muted-foreground">No networks configured.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {showMlo && <TableHead className="text-center">MLO</TableHead>}
                {showBs && <TableHead className="text-center">Band Steering</TableHead>}
                {radios.map((r) => (
                  <TableHead key={r.radioIndex} className="text-center">
                    {r.radioName}
                  </TableHead>
                ))}
                {wired.map((p) => (
                  <TableHead key={p.portIndex} className="text-center">
                    {p.portName}
                  </TableHead>
                ))}
                {showIot && <TableHead className="text-center">IoT</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.label}</TableCell>
                  {showMlo && (
                    <TableCell className="text-center">
                      <PCheck checked={mlo.indexOf(s.id) >= 0} onChange={() => toggleInArr('mloServiceIDs', s.id)} ariaLabel="MLO" />
                    </TableCell>
                  )}
                  {showBs && (
                    <TableCell className="text-center">
                      <PCheck
                        checked={bs.indexOf(s.id) >= 0}
                        onChange={() => toggleInArr('bandSteeringServiceIds', s.id)}
                        ariaLabel="Band steering"
                      />
                    </TableCell>
                  )}
                  {radios.map((r) => {
                    if (r.mode === 'bridge') {
                      return (
                        <TableCell key={r.radioIndex} className="text-center">
                          <PCheck checked={r.cbServiceId === s.id} disabled onChange={() => {}} ariaLabel="Client bridge WLAN" />
                        </TableCell>
                      );
                    }
                    if (r.mode === 'sensor') {
                      return (
                        <TableCell key={r.radioIndex} className="text-center">
                          <PCheck checked={false} disabled onChange={() => {}} ariaLabel="Sensor radio" />
                        </TableCell>
                      );
                    }
                    return (
                      <TableCell key={r.radioIndex} className="text-center">
                        <span className="inline-flex items-center gap-1">
                          <PCheck
                            checked={has(s.id, r.radioIndex)}
                            onChange={() => toggleIf(s.id, r.radioIndex)}
                            ariaLabel={`${r.radioName} ${s.label}`}
                          />
                          {bssid0[r.radioIndex] === s.id && (
                            <span title="Primary BSSID" className="font-bold text-destructive">
                              *
                            </span>
                          )}
                        </span>
                      </TableCell>
                    );
                  })}
                  {wired.map((p) => (
                    <TableCell key={p.portIndex} className="text-center">
                      <PCheck checked={hasW(s.id, p.portIndex)} onChange={() => toggleW(s.id, p.portIndex)} ariaLabel={`${p.portName} ${s.label}`} />
                    </TableCell>
                  ))}
                  {showIot && (
                    <TableCell className="text-center">
                      <PCheck checked={!!iotSel[s.id]} onChange={(v) => setIotSel((m) => ({ ...m, [s.id]: v }))} ariaLabel="IoT" />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        * WLAN is used as the primary BSSID (bssid0) on this radio — unassigning it resets the radio.
      </p>
    </div>
  );
}
