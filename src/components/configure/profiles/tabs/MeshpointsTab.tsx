/**
 * Meshpoints tab — a meshpoint select per non-sensor radio, bound to
 * meshpointIfList [{meshpointId,index}] with index = radioIndex. Selecting a
 * meshpoint seeds profile.meshpoints[] with a default advanced record; the
 * Advanced button is enabled only when all non-sensor radios share the same
 * meshpoint (controller meshpointAdvancedButtonEnable rule).
 */
import React from 'react';
import { Button } from '../../../ui/button';
import { PSelect } from '../controls';
import { defaultProfileMesh } from '../constants';
import { meshIfOf } from '../helpers';
import type { MeshIfEntry, Opt, ProfileMesh, ProfileTabContext } from '../types';

export function MeshpointsTab({ ctx }: { ctx: ProfileTabContext }) {
  const { form, radios, pools, mut, openMeshAdvanced } = ctx;
  const opts: Opt[] = [{ id: '', label: '— None —' }, ...pools.meshpoints];
  const ifl = meshIfOf(form);
  const entryFor = (radioIndex: number) => ifl.find((e) => e.index === radioIndex);
  const nonSensor = radios.filter((r) => r.mode !== 'sensor');

  const setMp = (radioIndex: number, meshpointId: string) =>
    mut((c) => {
      const list = (meshIfOf(c) as MeshIfEntry[]).filter((e) => e.index !== radioIndex);
      const meshes = (c.meshpoints as ProfileMesh[]) ?? [];
      if (meshpointId) {
        list.push({ meshpointId, index: radioIndex });
        if (!meshes.some((m) => m.meshpointId === meshpointId)) meshes.push(defaultProfileMesh(meshpointId));
      }
      c.meshpointIfList = list;
      c.meshpoints = meshes.filter((m) => list.some((e) => e.meshpointId === m.meshpointId));
    });

  const ids = nonSensor.map((r) => entryFor(r.radioIndex)?.meshpointId ?? '');
  const sameAll = ids.length > 0 && !!ids[0] && ids.every((x) => x === ids[0]);

  return (
    <div className="max-w-2xl space-y-3">
      {radios.map((r) => (
        <div key={r.radioIndex} className="flex items-center gap-4">
          <div className="w-40 shrink-0 text-right text-sm text-muted-foreground">{r.radioName}</div>
          {r.mode === 'sensor' ? (
            <PSelect
              value=""
              options={[{ id: '', label: 'Sensor — not applicable' }]}
              disabled
              onChange={() => {}}
              className="w-72"
            />
          ) : (
            <PSelect
              value={entryFor(r.radioIndex)?.meshpointId ?? ''}
              options={opts}
              onChange={(v) => setMp(r.radioIndex, v)}
              className="w-72"
              ariaLabel={`${r.radioName} meshpoint`}
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-4">
        <div className="w-40 shrink-0" />
        <span title={sameAll ? 'Edit meshpoint settings' : 'Assign the same meshpoint to all non-sensor radios to edit advanced settings'}>
          <Button type="button" size="sm" disabled={!sameAll} onClick={() => openMeshAdvanced(ids[0])}>
            Advanced
          </Button>
        </span>
      </div>
    </div>
  );
}
