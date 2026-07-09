/**
 * Edit Meshpoint Settings dialog (profileMeshpointEdit.html) — 12 scalar fields
 * plus a per-band ACS table, with the controller's feature/root conditionals
 * and exact ranges (hysteresis, pathMin 100-20000, pathThreshold 800-65535,
 * tolerancePeriod 10-600). OK is gated on valid + dirty.
 */
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../../ui/dialog';
import { Button } from '../../../ui/button';
import { Input } from '../../../ui/input';
import { LabelRow, NumInput, PCheck, PSelect } from '../controls';
import {
  MESH_BAND_LABEL,
  PATH_SELECTION_OPTS,
  PREFERRED_BAND_OPTS,
  ROOT_SELECTION_OPTS,
  acsPlansFor,
} from '../constants';
import { inRange, setIn } from '../helpers';
import type { MeshBandSetting, ProfileMesh } from '../types';

const LW = 230;

export interface MeshAdvancedDialogProps {
  open: boolean;
  mesh: ProfileMesh;
  F: (tag: string) => boolean;
  supportDistributed?: boolean;
  onApply: (mesh: ProfileMesh) => void;
  onClose: () => void;
}

export function MeshAdvancedDialog({ open, mesh, F, supportDistributed = true, onApply, onClose }: MeshAdvancedDialogProps) {
  const [d, setD] = useState<ProfileMesh>(() => structuredClone(mesh));
  const [dirty, setDirty] = useState(false);
  const set = (path: string, value: unknown) => {
    setD((p) => setIn(p, path, value));
    setDirty(true);
  };

  const errs: Record<string, string> = {};
  if (!inRange(d.hysteresisPeriod, 0, 600)) errs.hysteresisPeriod = 'Valid range 0 to 600';
  if (!inRange(d.hysteresisDelta, 1, 100)) errs.hysteresisDelta = 'Valid range 1 to 100';
  if (!inRange(d.hysteresisSNRDelta, 1, 100)) errs.hysteresisSNRDelta = 'Valid range 1 to 100';
  if (!inRange(d.hysteresisMinTh, -100, 0)) errs.hysteresisMinTh = 'Valid range -100 to 0';
  const bandBad = (b: MeshBandSetting) =>
    !inRange(b.pathMin, 100, 20000) || !inRange(b.pathThreshold, 800, 65535) || !inRange(b.tolerancePeriod, 10, 600);
  const bandInvalid = (d.bandSettings ?? []).some(bandBad);
  const valid = Object.keys(errs).length === 0 && !bandInvalid;

  const showPreferred = F('MESH-ACS-POLICY') && (!d.meshRoot || d.monitorPrimaryLink) && F('MESHPOINT-BEACON');

  const bandCell = (b: MeshBandSetting, i: number, key: 'pathMin' | 'pathThreshold' | 'tolerancePeriod', range: [number, number]) => (
    <div className="flex flex-col items-center gap-1">
      <NumInput value={b[key]} onChange={(v) => set(`bandSettings.${i}.${key}`, v)} className="w-28" />
      {!inRange(b[key], range[0], range[1]) && <span className="text-[10px] text-destructive">Invalid</span>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Meshpoint Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <LabelRow label="Cost Root" labelWidth={LW}>
            <PCheck checked={!!d.costRoot} onChange={(v) => set('costRoot', v)} ariaLabel="Cost Root" />
          </LabelRow>
          <LabelRow label="Hysteresis Period [s]" labelWidth={LW} error={errs.hysteresisPeriod}>
            <NumInput value={d.hysteresisPeriod} onChange={(v) => set('hysteresisPeriod', v)} className="w-32" />
          </LabelRow>
          <LabelRow label="Exclude Wired Peer" labelWidth={LW}>
            <PCheck checked={!!d.excludeWiredPeer} onChange={(v) => set('excludeWiredPeer', v)} ariaLabel="Exclude Wired Peer" />
          </LabelRow>
          <LabelRow label="Hysteresis Delta [dB]" labelWidth={LW} error={errs.hysteresisDelta}>
            <NumInput value={d.hysteresisDelta} onChange={(v) => set('hysteresisDelta', v)} className="w-32" />
          </LabelRow>
          <LabelRow label="Mesh Root" labelWidth={LW}>
            <PSelect
              value={d.meshRoot ? 'Yes' : 'No'}
              options={[{ id: 'Yes', label: 'Yes' }, { id: 'No', label: 'No' }]}
              onChange={(v) => set('meshRoot', v === 'Yes')}
              className="w-28"
              ariaLabel="Mesh Root"
            />
          </LabelRow>
          {d.meshRoot && F('MESHPOINT-BEACON') && (
            <LabelRow label="Backhaul Detection" labelWidth={LW}>
              <PCheck checked={!!d.monitorPrimaryLink} onChange={(v) => set('monitorPrimaryLink', v)} ariaLabel="Backhaul Detection" />
            </LabelRow>
          )}
          <LabelRow label="Hysteresis SNR Delta [dB]" labelWidth={LW} error={errs.hysteresisSNRDelta}>
            <NumInput value={d.hysteresisSNRDelta} onChange={(v) => set('hysteresisSNRDelta', v)} className="w-32" />
          </LabelRow>
          {!F('MESHPOINT-BEACON') && (
            <LabelRow label="Path Selection Method" labelWidth={LW}>
              <PSelect value={d.pathSelectionMethod || 'Uniform'} options={PATH_SELECTION_OPTS} onChange={(v) => set('pathSelectionMethod', v)} className="w-40" ariaLabel="Path Selection Method" />
            </LabelRow>
          )}
          {supportDistributed && (
            <LabelRow label="Root Selection Method" labelWidth={LW}>
              <PSelect value={d.rootSelectionMethod || 'None'} options={ROOT_SELECTION_OPTS} onChange={(v) => set('rootSelectionMethod', v)} className="w-40" ariaLabel="Root Selection Method" />
            </LabelRow>
          )}
          <LabelRow label="Hysteresis Min Threshold [dBm]" labelWidth={LW} error={errs.hysteresisMinTh}>
            <NumInput value={d.hysteresisMinTh} onChange={(v) => set('hysteresisMinTh', v)} className="w-32" />
          </LabelRow>
          <LabelRow label="Preferred Band" labelWidth={LW}>
            <PSelect value={d.preferredBand || 'BandNONE'} options={PREFERRED_BAND_OPTS} onChange={(v) => set('preferredBand', v)} className="w-40" ariaLabel="Preferred Band" />
          </LabelRow>
          {showPreferred && (
            <LabelRow label="Preferred Neighbor" labelWidth={LW}>
              <Input className="h-9" placeholder="BSSID (aa:bb:cc:dd:ee:ff)" value={d.preferredNeighbor || ''} onChange={(e) => set('preferredNeighbor', e.target.value || null)} />
            </LabelRow>
          )}
          {showPreferred && (
            <LabelRow label="Preferred Root" labelWidth={LW}>
              <Input className="h-9" placeholder="BSSID (aa:bb:cc:dd:ee:ff)" value={d.preferredRoot || ''} onChange={(e) => set('preferredRoot', e.target.value || null)} />
            </LabelRow>
          )}

          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Band Settings</p>
          <div className="overflow-x-auto">
            <div className="grid min-w-[640px] items-center gap-x-3 gap-y-2" style={{ gridTemplateColumns: '90px 1.4fr 1fr 1fr 1fr' }}>
              {['Band', 'ACS Channel Plan', 'Path Min (100–20000)', 'Path Threshold (800–65535)', 'Tolerance Period (10–600 s)'].map((t, i) => (
                <div key={t} className={`text-xs font-semibold ${i === 0 ? 'text-left' : 'text-center'}`}>
                  {t}
                </div>
              ))}
              {(d.bandSettings ?? []).map((b, i) => (
                <React.Fragment key={b.bandId}>
                  <div className="text-sm">{MESH_BAND_LABEL[b.bandId] ?? b.bandId}</div>
                  <div className="flex flex-col items-center gap-1">
                    <PSelect value={b.acsPlan} options={acsPlansFor(b.bandId)} onChange={(v) => set(`bandSettings.${i}.acsPlan`, v)} className="w-44" ariaLabel={`${b.bandId} ACS plan`} />
                    {b.acsPlan === 'ChannelPlanCustom' && (
                      <Input
                        className="h-8 w-44 text-xs"
                        placeholder="Channels, e.g. 36, 40"
                        value={(b.acsList ?? []).join(', ')}
                        onChange={(e) => set(`bandSettings.${i}.acsList`, e.target.value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => (Number.isNaN(Number(s)) ? s : Number(s))))}
                      />
                    )}
                  </div>
                  {bandCell(b, i, 'pathMin', [100, 20000])}
                  {bandCell(b, i, 'pathThreshold', [800, 65535])}
                  {bandCell(b, i, 'tolerancePeriod', [10, 600])}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!dirty || !valid} onClick={() => onApply(d)}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
