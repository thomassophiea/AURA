/**
 * Wired Ports tab — bound to wiredPorts[].ethSpeed / ethMode / energyEffEth.
 * The Port Duplex select shows only when speed is not Auto; the uplink row
 * (portIndex 0) is locked; the EEE column is gated on ENERGY-EFF-ETH.
 */
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../ui/table';
import { PCheck, PSelect } from '../controls';
import { WIRED_DUPLEX_OPTS, WIRED_SPEED_OPTS } from '../constants';
import type { ProfileTabContext } from '../types';

export function WiredPortsTab({ ctx }: { ctx: ProfileTabContext }) {
  const { form, F, mut } = ctx;
  const ports = form.wiredPorts ?? [];
  const showEee = F('ENERGY-EFF-ETH');

  if (!ports.length) {
    return <p className="p-4 text-sm text-muted-foreground">This platform has no configurable wired ports.</p>;
  }

  const updPort = (i: number, key: string, value: unknown) =>
    mut((c) => {
      (c.wiredPorts[i] as unknown as Record<string, unknown>)[key] = value;
    });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Port Number</TableHead>
          <TableHead>Port Speed</TableHead>
          <TableHead>Port Duplex</TableHead>
          {showEee && <TableHead className="text-center">Energy Efficient Ethernet</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {ports.map((p, i) => (
          <TableRow key={p.portIndex}>
            <TableCell className="font-medium">{p.portName || `ETH${i}`}</TableCell>
            <TableCell>
              <PSelect
                value={p.ethSpeed || 'speedAuto'}
                options={WIRED_SPEED_OPTS}
                disabled={p.portIndex === 0}
                onChange={(v) => updPort(i, 'ethSpeed', v)}
                className="w-36"
                ariaLabel={`${p.portName} speed`}
              />
            </TableCell>
            <TableCell>
              {p.ethSpeed !== 'speedAuto' ? (
                <PSelect
                  value={p.ethMode || 'fullDuplex'}
                  options={WIRED_DUPLEX_OPTS}
                  disabled={p.portIndex === 0}
                  onChange={(v) => updPort(i, 'ethMode', v)}
                  className="w-36"
                  ariaLabel={`${p.portName} duplex`}
                />
              ) : (
                <span className="text-xs text-muted-foreground">Port speed set to Auto</span>
              )}
            </TableCell>
            {showEee && (
              <TableCell className="text-center">
                <PCheck
                  checked={!!p.energyEffEth}
                  disabled={p.portIndex === 0}
                  onChange={(v) => updPort(i, 'energyEffEth', v)}
                  ariaLabel={`${p.portName} EEE`}
                />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
