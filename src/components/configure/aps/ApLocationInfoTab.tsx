/**
 * Location Info tab — 802.11MC / FTM location reporting (ap.html's own ftm.*
 * controls, Gateway 10.20). Shown only on an AP whose platform carries the
 * 802.11MC feature tag, the same gate ap.html uses. Two conditional groups:
 *   - the WGS84 (LCI) latitude/longitude/altitude group is revealed by the
 *     LCI Override toggle; with the override off the AP reports the profile's
 *     location, so the inherit tag stands in for the inputs (the Wired Ports
 *     tab pattern).
 *   - the Z-Subelement detail fields are disabled until Z-Subelement Enable
 *     is on. Visible-but-disabled is deliberate: it shows what enabling
 *     would give you.
 * Scope note: ap.html also carries floorData.*, elevation.* and gpsAnchor
 * here, gated on AFC-COMPLIANCE / GPS-ANCHOR. Those render in the
 * Professional Install modal in this editor; do not duplicate them here.
 */
import React from 'react';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { FieldRow, OvrRow } from '../_kit';
import { NumberField } from './controls';
import { getIn } from './useApDraft';
import type { ApDetail } from '../../../types/configure';

export interface ApLocationInfoTabProps {
  form: ApDetail;
  upd: (path: string, value: unknown) => void;
}

export function ApLocationInfoTab({ form, upd }: ApLocationInfoTabProps) {
  const zOff = !getIn(form, 'ftm.zSubelement.enabled');

  return (
    <div className="max-w-2xl space-y-4">
      <OvrRow
        label="LCI Override"
        overridden={!!getIn(form, 'ftm.wgs84Ovr')}
        onOverriddenChange={(v) => upd('ftm.wgs84Ovr', v)}
        inheritedDisplay="Inherited from profile"
      >
        <div className="space-y-3 pl-1">
          <FieldRow label="Latitude">
            <NumberField
              value={getIn(form, 'ftm.wgs84.latitude') as number}
              onChange={(v) => upd('ftm.wgs84.latitude', v)}
              className="w-40"
            />
          </FieldRow>
          <FieldRow label="Longitude">
            <NumberField
              value={getIn(form, 'ftm.wgs84.longitude') as number}
              onChange={(v) => upd('ftm.wgs84.longitude', v)}
              className="w-40"
            />
          </FieldRow>
          <FieldRow label="Altitude">
            <NumberField
              value={getIn(form, 'ftm.wgs84.altitude') as number}
              onChange={(v) => upd('ftm.wgs84.altitude', v)}
              className="w-40"
            />
          </FieldRow>
        </div>
      </OvrRow>

      <FieldRow label="RFC 4776 Hex String">
        <Input
          className="max-w-[340px]"
          value={(getIn(form, 'ftm.civicAddress.addr') as string) ?? ''}
          onChange={(e) => upd('ftm.civicAddress.addr', e.target.value)}
        />
      </FieldRow>

      <div className="border-t border-border pt-4">
        <FieldRow label="Z-Subelement Enable" inline>
          <Switch
            checked={!!getIn(form, 'ftm.zSubelement.enabled')}
            onCheckedChange={(v) => upd('ftm.zSubelement.enabled', v)}
            aria-label="Z-Subelement enable"
          />
        </FieldRow>
      </div>
      <FieldRow label="Expected To Move" inline>
        <Switch
          disabled={zOff}
          checked={!!getIn(form, 'ftm.zSubelement.expectedToMove')}
          onCheckedChange={(v) => upd('ftm.zSubelement.expectedToMove', v)}
          aria-label="Expected to move"
        />
      </FieldRow>
      <FieldRow label="Floor Number">
        <NumberField
          disabled={zOff}
          value={getIn(form, 'ftm.zSubelement.floorNumber') as number}
          onChange={(v) => upd('ftm.zSubelement.floorNumber', v)}
          className="w-40"
        />
      </FieldRow>
      <FieldRow label="Height Above Floor">
        <NumberField
          disabled={zOff}
          value={getIn(form, 'ftm.zSubelement.aboveFloor.height') as number}
          onChange={(v) => upd('ftm.zSubelement.aboveFloor.height', v)}
          className="w-40"
        />
      </FieldRow>
      <FieldRow label="Height Above Floor Uncertainty">
        <NumberField
          disabled={zOff}
          value={getIn(form, 'ftm.zSubelement.aboveFloor.uncertainty') as number}
          onChange={(v) => upd('ftm.zSubelement.aboveFloor.uncertainty', v)}
          className="w-40"
        />
      </FieldRow>
    </div>
  );
}
