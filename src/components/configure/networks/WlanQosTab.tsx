/**
 * WLAN editor - QoS tab: radio-management toggles (U-APSD, 802.11k with its
 * children, 802.11mc, Agile Multibanding), WMM admission control and, when
 * Hotspot is Enabled, the HS 2.0 QoS Map toggle with the 64-row DSCP
 * Classification modal (dscp.codePoints).
 */
import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Switch } from '../../ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { FieldRow, Section } from '../_kit';
import type { WlanService } from '../../../types/configure';
import { DSCP_CLASSES } from './wlanModel';
import { EnumSelect, patchRecord, patchUi, type WlanTabProps } from './wlanControls';

/** Keys of WlanService whose values are plain booleans (toggle targets). */
type WlanBooleanKey = Exclude<
  {
    [K in keyof WlanService]: WlanService[K] extends boolean ? K : never;
  }[keyof WlanService],
  undefined
>;

export function WlanQosTab({ form, setForm }: WlanTabProps) {
  const { record, ui } = form;
  const patch = patchRecord(setForm);
  const setUi = patchUi(setForm);
  const [dscpOpen, setDscpOpen] = useState(false);
  const codePoints =
    record.dscp?.codePoints && record.dscp.codePoints.length === 64
      ? record.dscp.codePoints
      : new Array<number>(64).fill(0);

  const toggle = (label: string, key: WlanBooleanKey, indent = false) => (
    <FieldRow label={label} inline className={indent ? 'pl-6' : undefined}>
      <Switch
        checked={!!record[key]}
        onCheckedChange={(v) => patch({ [key]: v } as Partial<WlanService>)}
      />
    </FieldRow>
  );

  return (
    <div className="space-y-6">
      <Section title="Radio Management">
        {toggle('U-APSD (WMM Power Save)', 'uapsdEnabled')}
        {toggle('802.11k (Radio Resource Management)', 'enabled11kSupport')}
        {record.enabled11kSupport && toggle('11k Beacon Report', 'rm11kBeaconReport', true)}
        {record.enabled11kSupport && toggle('11k Quiet IE', 'rm11kQuietIe', true)}
        {toggle('802.11mc (FTM Ranging)', 'enable11mcSupport')}
        {toggle('Agile Multibanding', 'mbo')}
      </Section>

      <Section title="Admission Control">
        {toggle('Voice', 'admissionControlVoice')}
        {toggle('Video', 'admissionControlVideo')}
        {toggle('Best Effort', 'admissionControlBestEffort')}
        {toggle('Background', 'admissionControlBackgroundTraffic')}
      </Section>

      {record.hotspotType === 'Enabled' && (
        <Section title="Hotspot 2.0" description="Available because Hotspot is Enabled.">
          <FieldRow label="QoS Map (HS 2.0)" inline>
            <Switch checked={ui.hs20QosMap} onCheckedChange={(v) => setUi({ hs20QosMap: v })} />
          </FieldRow>
          <FieldRow label="DSCP Classification">
            <Button type="button" variant="outline" onClick={() => setDscpOpen(true)}>
              Configure
            </Button>
          </FieldRow>
        </Section>
      )}

      <Dialog open={dscpOpen} onOpenChange={setDscpOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>DSCP Classification</DialogTitle>
            <DialogDescription>
              Map each of the 64 DSCP code points to a service class (dscp.codePoints).
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
            {codePoints.map((value, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
                  CP {index}
                </span>
                <EnumSelect
                  value={String(value)}
                  options={DSCP_CLASSES}
                  onChange={(next) => {
                    const nextPoints = [...codePoints];
                    nextPoints[index] = Number(next);
                    patch({ dscp: { codePoints: nextPoints } });
                  }}
                  className="w-full"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setDscpOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
