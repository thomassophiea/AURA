/**
 * WLAN editor - OpenRoaming tab: WBA OpenRoaming trust point + WBAID
 * (openRoamingModel.*). The AAA Policy select is rendered read-only in this
 * mode (edited on the Authentication tab otherwise).
 */
import React from 'react';
import { Input } from '../../ui/input';
import { FieldRow, Section } from '../_kit';
import { RefSelect, patchUi, toOptions, type WlanTabProps } from './wlanControls';

export function WlanOpenRoamingTab({ form, setForm, refs }: WlanTabProps) {
  const { record, ui } = form;
  const setUi = patchUi(setForm);

  if (record.hotspotType !== 'OpenRoaming') {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        WBA OpenRoaming settings apply only when the Hotspot mode is WBA OpenRoaming (selected at
        creation on the General tab).
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Section title="WBA OpenRoaming">
        <FieldRow
          label="AAA Policy"
          description="Read-only while WBA OpenRoaming is active (managed by the roaming federation)."
        >
          <RefSelect
            value={record.aaaPolicyId}
            options={toOptions(refs.aaaPolicies)}
            onChange={() => undefined}
            disabled
          />
        </FieldRow>
        <FieldRow
          label="Trust Point"
          htmlFor="wlan-trustpoint"
          description="Certificate trust point installed on the controller."
        >
          <Input
            id="wlan-trustpoint"
            value={ui.trustPoint}
            onChange={(e) => setUi({ trustPoint: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="WBAID" htmlFor="wlan-wbaid">
          <Input
            id="wlan-wbaid"
            value={ui.wbaId}
            onChange={(e) => setUi({ wbaId: e.target.value })}
          />
        </FieldRow>
      </Section>
    </div>
  );
}
