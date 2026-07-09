/**
 * AP editor > Meshpoints tab (gap 16). Lists the AP's meshpoint bindings; each
 * row opens the per-AP meshpoint override editor (ApMeshOvrDialog). Only shown
 * when the AP has meshpoints[].
 */
import React from 'react';
import { Button } from '../../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { PREF_BAND_LABEL } from './apHelpers';
import type { ApDetail } from '../../../types/configure';
import type { ApRefData } from './useApRefData';

export interface ApMeshpointsTabProps {
  form: ApDetail;
  refData: ApRefData;
  onEditOverrides: (index: number) => void;
}

export function ApMeshpointsTab({ form, refData, onEditOverrides }: ApMeshpointsTabProps) {
  const meshpoints = form.meshpoints ?? [];
  return (
    <div className="max-w-2xl">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Meshpoint</TableHead>
            <TableHead>Mesh Root</TableHead>
            <TableHead>Preferred Band</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {meshpoints.map((m, i) => (
            <TableRow key={m.meshpointId}>
              <TableCell>{refData.meshpointName(m.meshpointId)}</TableCell>
              <TableCell>{m.meshRoot ? 'Yes' : 'No'}</TableCell>
              <TableCell>{PREF_BAND_LABEL[m.preferredBand] ?? '—'}</TableCell>
              <TableCell className="text-right">
                <Button type="button" variant="outline" size="sm" onClick={() => onEditOverrides(i)}>
                  Edit Overrides
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
