/**
 * VLANs tab — Name / Referenced / Additional. Referenced is computed by the
 * controller from role/WLAN topology usage and is read-only (parity gap 16);
 * only the Additional column mutates additionalTopologyIDs.
 */
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../ui/table';
import { PCheck } from '../controls';
import { strArr } from '../helpers';
import type { ProfileTabContext } from '../types';

export function VlansTab({ ctx }: { ctx: ProfileTabContext }) {
  const { form, pools, toggleInArr } = ctx;
  const referenced = strArr(form.referencedTopologyIDs);
  const additional = strArr(form.additionalTopologyIDs);

  if (pools.topologies.length === 0) {
    return <p className="text-sm text-muted-foreground">No VLANs / topologies configured.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-center">Referenced</TableHead>
          <TableHead className="text-center">Additional</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pools.topologies.map((v) => (
          <TableRow key={v.id}>
            <TableCell className="font-medium">{v.label}</TableCell>
            <TableCell className="text-center">
              <PCheck checked={referenced.indexOf(v.id) >= 0} disabled onChange={() => {}} ariaLabel="Referenced (read-only)" />
            </TableCell>
            <TableCell className="text-center">
              <PCheck checked={additional.indexOf(v.id) >= 0} onChange={() => toggleInArr('additionalTopologyIDs', v.id)} ariaLabel={v.label} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
