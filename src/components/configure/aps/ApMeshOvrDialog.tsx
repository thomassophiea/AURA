/**
 * Per-AP meshpoint override editor (meshpointOvrEditor.html, gap 16). Every
 * field is an OvrRow pair against the profile value; band settings carry
 * per-field Ovr flags (ap-detail-sample.json meshpoints[0]). pathSelectionMethod
 * renders only without MESHPOINT-BEACON; Backhaul Detection only with it + root.
 */
import React from 'react';
import { OvrRow } from '../_kit';
import { Switch } from '../../ui/switch';
import { Input } from '../../ui/input';
import { Checkbox } from '../../ui/checkbox';
import { EditorDialog } from './EditorDialog';
import { ApSelect, NumberField } from './controls';
import { useApDraft, getIn } from './useApDraft';
import { hasFeature, MESH_BAND_LABEL, type Opt } from './apHelpers';
import type { ApMeshpointBinding, ApMeshpointBandSetting } from '../../../types/configure';

const PREF_BAND: Opt[] = [
  { id: 'BandNONE', label: 'None' },
  { id: 'Band24', label: '2.4 GHz' },
  { id: 'Band5', label: '5 GHz' },
  { id: 'Band6', label: '6 GHz' },
];

function plansFor(bandId: string): Opt[] {
  const pl: Opt[] = [
    { id: 'ChannelPlanAuto', label: 'Auto' },
    { id: 'ChannelPlanAll', label: 'All Channels' },
    { id: 'ChannelPlanAllNonDFS', label: 'All Non-DFS' },
    { id: 'ChannelPlanCustom', label: 'Custom' },
  ];
  if (bandId === 'Band6') pl.splice(3, 0, { id: 'ChannelPlanPSC', label: 'PSC Channels' });
  return pl;
}

export interface ApMeshOvrDialogProps {
  mp: ApMeshpointBinding;
  features: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (mp: ApMeshpointBinding) => void;
}

export function ApMeshOvrDialog({ mp, features, open, onOpenChange, onApply }: ApMeshOvrDialogProps) {
  const { form: d, upd, dirty } = useApDraft<ApMeshpointBinding>(mp);
  const F = (f: string) => hasFeature(features, f);

  const ov = (label: string, key: string, control: React.ReactNode) => (
    <OvrRow
      label={label}
      overridden={!!getIn(d, `${key}Ovr`)}
      onOverriddenChange={(v) => upd(`${key}Ovr`, v)}
      inheritedDisplay="Inherited from profile"
    >
      {control}
    </OvrRow>
  );

  return (
    <EditorDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Meshpoint Overrides"
      maxWidth={820}
      okDisabled={!dirty}
      onOk={() => onApply(d)}
    >
      {ov('Mesh Root', 'meshRoot', <ApSelect className="w-24" value={d.meshRoot ? 'Yes' : 'No'} options={['Yes', 'No']} onChange={(v) => upd('meshRoot', v === 'Yes')} />)}
      {F('MESHPOINT-BEACON') && d.meshRoot &&
        ov('Backhaul Detection', 'monitorPrimaryLink', <Switch checked={!!d.monitorPrimaryLink} onCheckedChange={(v) => upd('monitorPrimaryLink', v)} />)}
      {ov('Root Selection Method', 'rootSelectionMethod', <ApSelect className="w-40" value={d.rootSelectionMethod || 'None'} options={['None', 'AutoMint', 'AutoProximity']} onChange={(v) => upd('rootSelectionMethod', v)} />)}
      {!F('MESHPOINT-BEACON') &&
        ov('Path Selection Method', 'pathSelectionMethod', <ApSelect className="w-44" value={d.pathSelectionMethod || 'Uniform'} options={['Uniform', 'SNRLeaf', 'MobileSNRLeaf', 'BoundPair']} onChange={(v) => upd('pathSelectionMethod', v)} />)}
      {ov('Preferred Band', 'preferredBand', <ApSelect className="w-36" value={d.preferredBand || 'BandNONE'} options={PREF_BAND} onChange={(v) => upd('preferredBand', v)} />)}
      {ov('Preferred Neighbor', 'preferredNeighbor', <Input className="w-56" value={d.preferredNeighbor ?? ''} placeholder="BSSID (aa:bb:cc:dd:ee:ff)" onChange={(e) => upd('preferredNeighbor', e.target.value || null)} />)}
      {ov('Preferred Root', 'preferredRoot', <Input className="w-56" value={d.preferredRoot ?? ''} placeholder="BSSID (aa:bb:cc:dd:ee:ff)" onChange={(e) => upd('preferredRoot', e.target.value || null)} />)}
      {ov('Monitor CRM', 'monitorCrm', <Switch checked={!!d.monitorCrm} onCheckedChange={(v) => upd('monitorCrm', v)} />)}
      {ov('Cost Root', 'costRoot', <Switch checked={!!d.costRoot} onCheckedChange={(v) => upd('costRoot', v)} />)}
      {ov('Exclude Wired Peer', 'excludeWiredPeer', <Switch checked={!!d.excludeWiredPeer} onCheckedChange={(v) => upd('excludeWiredPeer', v)} />)}
      {ov('Hysteresis Min Threshold [dBm]', 'hysteresisMinTh', <NumberField value={d.hysteresisMinTh} onChange={(v) => upd('hysteresisMinTh', v)} />)}
      {ov('Hysteresis Period [s]', 'hysteresisPeriod', <NumberField value={d.hysteresisPeriod} onChange={(v) => upd('hysteresisPeriod', v)} />)}
      {ov('Hysteresis Delta [dB]', 'hysteresisDelta', <NumberField value={d.hysteresisDelta} onChange={(v) => upd('hysteresisDelta', v)} />)}
      {ov('Hysteresis SNR Delta [dB]', 'hysteresisSNRDelta', <NumberField value={d.hysteresisSNRDelta} onChange={(v) => upd('hysteresisSNRDelta', v)} />)}

      <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Band Settings (per-field override)
      </h4>
      <div className="space-y-3">
        {(d.bandSettings ?? []).map((b: ApMeshpointBandSetting, i) => (
          <div key={b.bandId} className="space-y-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium">{MESH_BAND_LABEL[b.bandId] ?? b.bandId}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <BandCell label="ACS Channel Plan" ovr={!!b.acsPlanOvr} onOvr={(v) => upd(`bandSettings.${i}.acsPlanOvr`, v)}>
                <ApSelect className="w-44" value={b.acsPlan} options={plansFor(b.bandId)} onChange={(v) => upd(`bandSettings.${i}.acsPlan`, v)} />
                {b.acsPlan === 'ChannelPlanCustom' && (
                  <Input
                    className="mt-2 w-44"
                    value={(b.acsList ?? []).join(', ')}
                    placeholder="Channels"
                    onChange={(e) =>
                      upd(
                        `bandSettings.${i}.acsList`,
                        e.target.value.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (Number.isNaN(Number(x)) ? x : Number(x)))
                      )
                    }
                  />
                )}
              </BandCell>
              <BandCell label="Tx Power" ovr={!!b.txPowerOvr} onOvr={(v) => upd(`bandSettings.${i}.txPowerOvr`, v)}>
                <NumberField value={b.txPower} onChange={(v) => upd(`bandSettings.${i}.txPower`, v)} />
              </BandCell>
              <BandCell label="Path Min" ovr={!!b.pathMinOvr} onOvr={(v) => upd(`bandSettings.${i}.pathMinOvr`, v)}>
                <NumberField value={b.pathMin} onChange={(v) => upd(`bandSettings.${i}.pathMin`, v)} />
              </BandCell>
              <BandCell label="Path Threshold" ovr={!!b.pathThresholdOvr} onOvr={(v) => upd(`bandSettings.${i}.pathThresholdOvr`, v)}>
                <NumberField value={b.pathThreshold} onChange={(v) => upd(`bandSettings.${i}.pathThreshold`, v)} />
              </BandCell>
              <BandCell label="Tolerance [s]" ovr={!!b.tolerancePeriodOvr} onOvr={(v) => upd(`bandSettings.${i}.tolerancePeriodOvr`, v)}>
                <NumberField value={b.tolerancePeriod} onChange={(v) => upd(`bandSettings.${i}.tolerancePeriod`, v)} />
              </BandCell>
            </div>
          </div>
        ))}
      </div>
    </EditorDialog>
  );
}

function BandCell({
  label,
  ovr,
  onOvr,
  children,
}: {
  label: string;
  ovr: boolean;
  onOvr: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Checkbox checked={ovr} onCheckedChange={(v) => onOvr(v === true)} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      {ovr ? children : <span className="text-xs text-muted-foreground">Inherited</span>}
    </div>
  );
}
