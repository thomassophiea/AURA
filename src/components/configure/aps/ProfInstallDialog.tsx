/**
 * Professional Install modal (apAntennaInfo.html, gap 15) — each block feature-
 * gated. AP Environment (WiFi7 APs configure it here, gap 27), per-radio
 * Attenuation 0-30 dB (PROFESSIONAL-INSTALL-ATT), Floor Settings override
 * (elevation.*), GPS Anchor + dongle distance (GPS-ANCHOR/GPS-DONGLE), IoT
 * antenna type. Antenna-model-per-socket needs metadata absent from the
 * capture record, so it is omitted.
 */
import React, { useMemo } from 'react';
import { FieldRow, OvrRow } from '../_kit';
import { Switch } from '../../ui/switch';
import { EditorDialog } from './EditorDialog';
import { ApSelect, NumberField } from './controls';
import { useApDraft, getIn } from './useApDraft';
import { hasFeature, inRange } from './apHelpers';
import type { ApDetail } from '../../../types/configure';

export interface ProfInstallDialogProps {
  form: ApDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (form: ApDetail) => void;
}

export function ProfInstallDialog({ form, open, onOpenChange, onApply }: ProfInstallDialogProps) {
  const { form: d, upd, dirty } = useApDraft<ApDetail>(form);
  const F = (f: string) => hasFeature(d.features, f);

  const attBad = useMemo(
    () => (d.radios ?? []).some((r) => r.attenuation != null && !inRange(r.attenuation, 0, 30)),
    [d.radios]
  );

  return (
    <EditorDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Professional Install"
      maxWidth={620}
      okDisabled={!dirty || attBad}
      onOk={() => onApply(d)}
    >
      {F('WIFI7') && (
        <FieldRow label="AP Environment" inline>
          <ApSelect className="w-40" value={d.environment || 'indoor'} options={['indoor', 'outdoor']} onChange={(v) => upd('environment', v)} />
        </FieldRow>
      )}

      {F('PROFESSIONAL-INSTALL-ATT') && (
        <>
          <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attenuation [dB] (0-30)</h4>
          {(d.radios ?? []).map((r, i) => (
            <FieldRow key={i} label={r.radioName || `Radio ${r.radioIndex}`} inline>
              <NumberField value={r.attenuation} min={0} max={30} onChange={(v) => upd(`radios.${i}.attenuation`, v)} />
            </FieldRow>
          ))}
          {attBad && <p className="text-xs text-destructive">Attenuation must be 0 to 30 dB</p>}
        </>
      )}

      <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Floor Settings</h4>
      <OvrRow
        label="Floor Settings Override"
        overridden={!!d.elevationOvr}
        onOverriddenChange={(v) => upd('elevationOvr', v)}
        inheritedDisplay="Inherited from floor plan"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">AP Height [m]</span>
          <NumberField className="w-24" value={getIn(d, 'elevation.height') as number} onChange={(v) => upd('elevation.height', v)} />
          <span className="text-xs text-muted-foreground">Uncertainty</span>
          <NumberField className="w-24" value={getIn(d, 'elevation.uncertainty') as number} onChange={(v) => upd('elevation.uncertainty', v)} />
        </div>
      </OvrRow>

      {F('GPS-ANCHOR') && (
        <>
          <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">GPS</h4>
          <FieldRow label="Anchor AP" inline>
            <Switch checked={!!d.gpsAnchor} onCheckedChange={(v) => upd('gpsAnchor', v)} />
          </FieldRow>
          {F('GPS-DONGLE') && d.gpsAnchor && (
            <FieldRow label="GPS Dongle Distance [m]" inline>
              <NumberField value={d.gpsAntennaDistance} onChange={(v) => upd('gpsAntennaDistance', v)} />
            </FieldRow>
          )}
        </>
      )}

      {F('IOT-EXTERNAL-ANTENNA') && (
        <FieldRow label="IoT Antenna Type" inline>
          <ApSelect
            className="w-40"
            value={(getIn(d, 'iotAntennaType') as string) || 'internal'}
            options={['internal', 'external']}
            onChange={(v) => upd('iotAntennaType', v)}
          />
        </FieldRow>
      )}
    </EditorDialog>
  );
}
