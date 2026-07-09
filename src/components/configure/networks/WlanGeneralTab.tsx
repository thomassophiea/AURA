/**
 * WLAN editor - General tab: identity, status, hotspot mode (create-only),
 * timeouts ("Maximum Session Duration" controller label, 0-999999 integers)
 * and the always-available advanced toggles.
 */
import React from 'react';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { FieldRow, Section } from '../_kit';
import { HOTSPOT_OPTIONS } from './wlanModel';
import { EnumSelect, patchRecord, patchUi, type WlanTabProps } from './wlanControls';

const STATUS_OPTIONS = [
  { id: 'enabled', label: 'Enabled' },
  { id: 'disabled', label: 'Disabled' },
];

export function WlanGeneralTab({ form, setForm, errors, isNew }: WlanTabProps) {
  const record = form.record;
  const patch = patchRecord(setForm);
  const setUi = patchUi(setForm);

  const numberField = (
    label: string,
    key: 'sessionTimeout' | 'preAuthenticatedIdleTimeout' | 'postAuthenticatedIdleTimeout',
    description: string
  ) => (
    <FieldRow label={label} htmlFor={`wlan-${key}`} description={description} error={errors[key]}>
      <Input
        id={`wlan-${key}`}
        type="number"
        min={0}
        max={999999}
        className="w-40"
        value={record[key] ?? ''}
        onChange={(e) => patch({ [key]: e.target.value === '' ? 0 : Number(e.target.value) })}
      />
    </FieldRow>
  );

  return (
    <div className="space-y-6">
      <Section title="Identity">
        <FieldRow label="Network Name" htmlFor="wlan-name" required error={errors.serviceName}>
          <Input
            id="wlan-name"
            value={record.serviceName}
            maxLength={64}
            onChange={(e) => patch({ serviceName: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="SSID" htmlFor="wlan-ssid" required error={errors.ssid}>
          <Input
            id="wlan-ssid"
            value={record.ssid}
            maxLength={32}
            onChange={(e) => patch({ ssid: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="Status" htmlFor="wlan-status">
          <EnumSelect
            id="wlan-status"
            value={record.status}
            options={STATUS_OPTIONS}
            onChange={(v) => patch({ status: v })}
            className="w-40"
          />
        </FieldRow>
        <FieldRow
          label="Hotspot"
          htmlFor="wlan-hotspot"
          description={
            isNew
              ? 'Enabled / OSU / WBA OpenRoaming constrain the available auth types.'
              : 'Hotspot mode can only be chosen when creating a network.'
          }
        >
          <EnumSelect
            id="wlan-hotspot"
            value={record.hotspotType}
            options={HOTSPOT_OPTIONS}
            onChange={(v) => {
              patch({ hotspotType: v });
              if (v !== 'Enabled') setUi({ hs20QosMap: false });
            }}
            disabled={!isNew}
            className="w-48"
          />
        </FieldRow>
        <FieldRow label="Suppress (hide) SSID" inline>
          <Switch
            checked={record.suppressSsid}
            onCheckedChange={(v) => patch({ suppressSsid: v })}
          />
        </FieldRow>
        <FieldRow label="Include AP Hostname in Beacon" inline>
          <Switch
            checked={record.includeHostname}
            onCheckedChange={(v) => patch({ includeHostname: v })}
          />
        </FieldRow>
      </Section>

      <Section title="Timeouts" description="Whole seconds, 0 to 999999.">
        {numberField('Maximum Session Duration', 'sessionTimeout', '0 means no session limit.')}
        {numberField(
          'Pre-Authenticated Idle Timeout',
          'preAuthenticatedIdleTimeout',
          'Idle seconds allowed before authentication (default 300).'
        )}
        {numberField(
          'Post-Authenticated Idle Timeout',
          'postAuthenticatedIdleTimeout',
          'Idle seconds allowed after authentication (default 1800).'
        )}
      </Section>

      <Section title="Advanced" collapsible defaultOpen={false}>
        <FieldRow label="Purge on Disconnect" inline>
          <Switch
            checked={record.purgeOnDisconnect}
            onCheckedChange={(v) => patch({ purgeOnDisconnect: v })}
          />
        </FieldRow>
        <FieldRow label="Shutdown on Meshpoint Loss" inline>
          <Switch
            checked={record.shutdownOnMeshpointLoss}
            onCheckedChange={(v) => patch({ shutdownOnMeshpointLoss: v })}
          />
        </FieldRow>
      </Section>
    </div>
  );
}
