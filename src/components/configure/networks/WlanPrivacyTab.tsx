/**
 * WLAN editor - Privacy tab: per-auth-type key material (masked PSK/SAE with
 * ASCII/Hex input method, WEP passphrase with dynamic length hints, WPA3 SAE
 * enums), PMF pinning rules, beacon protection and the Open-network OWE
 * auto-provision toggle.
 */
import React from 'react';
import { Switch } from '../../ui/switch';
import { Input } from '../../ui/input';
import { FieldRow, MaskedInput, Section } from '../_kit';
import {
  WLAN_ENUMS,
  hasPresharedKey,
  isPureWpa3,
  isWpa,
  readPrivacyElement,
} from './wlanModel';
import { wepKeyExpectedLength, withPrivacyField } from './wlanForm';
import { EnumSelect, patchRecord, type WlanTabProps } from './wlanControls';

const KEY_METHOD_OPTIONS = [
  { id: 'str', label: 'String (8-63 chars)' },
  { id: 'hex', label: 'Hex (64 chars)' },
];
const PMF_REQUIRED_ONLY = [{ id: 'required', label: 'Required' }];

export function WlanPrivacyTab({ form, setForm, errors }: WlanTabProps) {
  const { record, ui } = form;
  const patch = patchRecord(setForm);
  const auth = ui.authType;
  const fields = readPrivacyElement(record.privacy, auth);
  const setField = (key: string, value: unknown) =>
    setForm((prev) => withPrivacyField(prev, key, value));
  const pskAuth = hasPresharedKey(auth);
  const wpa3Pure = isPureWpa3(auth);
  const showPmf = isWpa(auth);
  const wepHint = wepKeyExpectedLength(fields);

  return (
    <div className="space-y-6">
      <Section
        title="Key Material"
        description={
          auth === 'Open' || auth === 'OWE'
            ? undefined
            : 'Cascades from the auth type selected on the Authentication tab.'
        }
      >
        {(auth === 'Open' || auth === 'OWE') && (
          <p className="text-sm text-muted-foreground">
            {auth === 'OWE'
              ? 'OWE (Enhanced Open) derives keys opportunistically - no key material to configure.'
              : 'Open networks carry no key material.'}
          </p>
        )}

        {auth === 'WEP' && (
          <>
            <FieldRow label="Key Length">
              <EnumSelect
                value={fields.keyLength ?? 'WEP_64bit'}
                options={WLAN_ENUMS.wepKeyLength}
                onChange={(v) => setField('keyLength', v)}
                className="w-40"
              />
            </FieldRow>
            <FieldRow label="Input Method">
              <EnumSelect
                value={fields.pskInputType ?? 'Hex'}
                options={WLAN_ENUMS.inputMethod}
                onChange={(v) => setField('pskInputType', v)}
                className="w-40"
              />
            </FieldRow>
            <FieldRow label="Key Index">
              <EnumSelect
                value={fields.keyIndex ?? '1'}
                options={['1', '2', '3', '4'].map((i) => ({ id: i, label: i }))}
                onChange={(v) => setField('keyIndex', v)}
                className="w-28"
              />
            </FieldRow>
            <FieldRow
              label="WEP Key"
              htmlFor="wlan-wep-key"
              error={errors.wepKey}
              description={`Exactly ${wepHint.length}${wepHint.hex ? ' hex' : ''} characters.`}
              required
            >
              <Input
                id="wlan-wep-key"
                value={fields.passPhrase ?? ''}
                placeholder={`${wepHint.length}${wepHint.hex ? ' hex' : ''} characters`}
                onChange={(e) => setField('passPhrase', e.target.value)}
              />
            </FieldRow>
          </>
        )}

        {pskAuth && (
          <>
            {auth === 'WPA3-Personal' && (
              <>
                <FieldRow label="SAE Method">
                  <EnumSelect
                    value={fields.saeMethod ?? 'SaeH2e'}
                    options={WLAN_ENUMS.saeMethod}
                    onChange={(v) => setField('saeMethod', v)}
                    className="w-56"
                  />
                </FieldRow>
                <FieldRow label="Encryption">
                  <EnumSelect
                    value={fields.encryption ?? 'AES_CCM_128'}
                    options={WLAN_ENUMS.encryption}
                    onChange={(v) => setField('encryption', v)}
                    className="w-56"
                  />
                </FieldRow>
                <FieldRow label="AKM Suite">
                  <EnumSelect
                    value={fields.akmSuiteSelector ?? 'AKM8_24'}
                    options={WLAN_ENUMS.akmSuite}
                    onChange={(v) => setField('akmSuiteSelector', v)}
                    className="w-48"
                  />
                </FieldRow>
              </>
            )}
            <FieldRow label="Input Method">
              <EnumSelect
                value={fields.keyHexEncoded ? 'hex' : 'str'}
                options={KEY_METHOD_OPTIONS}
                onChange={(v) => setField('keyHexEncoded', v === 'hex')}
                className="w-48"
              />
            </FieldRow>
            <FieldRow
              label="Pre-Shared Key"
              error={errors.presharedKey}
              description={
                fields.keyHexEncoded ? 'Exactly 64 hexadecimal characters.' : '8 to 63 characters.'
              }
              required
            >
              <MaskedInput
                value={fields.presharedKey ?? ''}
                maxLength={64}
                placeholder={fields.keyHexEncoded ? '64 hex characters' : '8-63 characters'}
                onChange={(v) => setField('presharedKey', v)}
              />
            </FieldRow>
            {auth === 'WPA2-Personal (PSK)' && (
              <FieldRow label="Encryption">
                <EnumSelect
                  value={fields.mode ?? 'aesOnly'}
                  options={WLAN_ENUMS.wpa2Mode}
                  onChange={(v) => setField('mode', v)}
                  className="w-40"
                />
              </FieldRow>
            )}
          </>
        )}
      </Section>

      {showPmf && (
        <Section title="Management Frame Protection">
          <FieldRow
            label="Protected Management Frames (PMF)"
            description={wpa3Pure ? 'Pinned to Required for pure WPA3 auth types.' : undefined}
          >
            {wpa3Pure ? (
              <EnumSelect
                value="required"
                options={PMF_REQUIRED_ONLY}
                onChange={() => undefined}
                disabled
                className="w-40"
              />
            ) : (
              <EnumSelect
                value={fields.pmfMode ?? 'disabled'}
                options={WLAN_ENUMS.pmf}
                onChange={(v) => setField('pmfMode', v)}
                className="w-40"
              />
            )}
          </FieldRow>
        </Section>
      )}

      <Section title="Advanced">
        <FieldRow label="Beacon Protection" inline>
          <Switch
            checked={record.beaconProtection}
            onCheckedChange={(v) => patch({ beaconProtection: v })}
          />
        </FieldRow>
        {auth === 'Open' && record.hotspotType !== 'Osu' && (
          <FieldRow
            label="Auto Provision OWE network"
            inline
            description="Automatically creates the OWE companion for this Open network."
          >
            <Switch checked={record.oweAutogen} onCheckedChange={(v) => patch({ oweAutogen: v })} />
          </FieldRow>
        )}
      </Section>
    </div>
  );
}
