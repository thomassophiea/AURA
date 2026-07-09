/**
 * WLAN editor - Authentication tab: hotspot-filtered Auth Type (locked in
 * edit mode), the enterprise AAA block (AAA policy, auth method, LDAP, proxy
 * RADIUS servers 1-4, fast transition + Mobility Domain ID) and MAC-based
 * authorization with its timeout-role reveal.
 */
import React from 'react';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { FieldRow, Section } from '../_kit';
import type { WlanService } from '../../../types/configure';
import {
  AUTH_METHODS,
  AUTH_TO_ELEMENT,
  authOptionsForHotspot,
  defaultPrivacyFields,
  isEnterprise,
  readPrivacyElement,
  type WlanAuthType,
} from './wlanModel';
import { showMobilityDomainId, withPrivacyField } from './wlanForm';
import {
  EnumSelect,
  RefSelect,
  patchRecord,
  patchUi,
  toOptions,
  type WlanTabProps,
} from './wlanControls';
import { radiusServerIps } from './useWlanRefs';

export function WlanAuthTab({ form, setForm, errors, isNew, refs }: WlanTabProps) {
  const { record, ui } = form;
  const patch = patchRecord(setForm);
  const setUi = patchUi(setForm);
  const auth = ui.authType;
  const enterprise = isEnterprise(auth);
  const fields = readPrivacyElement(record.privacy, auth);
  const authOptions = authOptionsForHotspot(record.hotspotType).map((a) => ({
    id: a,
    label: a,
  }));
  const proxyRadius = ui.authMethod.includes('Proxy RADIUS');
  const serverIps = radiusServerIps(refs.aaaPolicies).map((ip) => ({ id: ip, label: ip }));
  // MBA is locked while an Internal / EGuest / GuestEssentials portal is enabled.
  const mbaLocked =
    record.enableCaptivePortal &&
    (record.captivePortalType === 'Internal' ||
      record.captivePortalType === 'EGuest' ||
      record.captivePortalType === 'GuestEssentials');
  const showTimeoutRole =
    record.mbaAuthorization &&
    !(record.enableCaptivePortal && record.captivePortalType === 'Internal');
  const showMdId = showMobilityDomainId(form, isNew);

  const changeAuthType = (next: string) => {
    const authType = next as WlanAuthType;
    setForm((prev) => {
      const element = AUTH_TO_ELEMENT[authType];
      const record: WlanService = { ...prev.record };
      if (element) {
        const existing = prev.record.privacy?.[element];
        record.privacy = {
          [element]: {
            ...defaultPrivacyFields(authType),
            ...(existing && typeof existing === 'object' ? existing : {}),
          },
        };
      } else {
        record.privacy = null;
      }
      return { ...prev, record, ui: { ...prev.ui, authType } };
    });
  };

  return (
    <div className="space-y-6">
      <Section title="Authentication">
        <FieldRow
          label="Auth Type"
          htmlFor="wlan-auth-type"
          description={
            !isNew
              ? 'Auth type is locked after creation (derived from the privacy element).'
              : record.hotspotType !== 'Disabled'
                ? 'Options constrained by the selected Hotspot mode.'
                : undefined
          }
        >
          <EnumSelect
            id="wlan-auth-type"
            value={auth}
            options={authOptions}
            onChange={changeAuthType}
            disabled={!isNew}
            className="w-80"
          />
        </FieldRow>
      </Section>

      {enterprise && (
        <Section title="Enterprise (802.1X/EAP)">
          <FieldRow
            label="AAA Policy"
            description={
              record.hotspotType === 'OpenRoaming'
                ? 'Read-only while WBA OpenRoaming is active.'
                : undefined
            }
          >
            <RefSelect
              value={record.aaaPolicyId}
              options={toOptions(refs.aaaPolicies)}
              onChange={(v) => patch({ aaaPolicyId: v })}
              disabled={record.hotspotType === 'OpenRoaming'}
            />
          </FieldRow>
          <FieldRow label="Authentication Method">
            <EnumSelect
              value={ui.authMethod}
              options={AUTH_METHODS.map((m) => ({ id: m, label: m }))}
              onChange={(v) => setUi({ authMethod: v })}
              className="w-72"
            />
          </FieldRow>
          {ui.authMethod === 'LDAP' && (
            <FieldRow label="LDAP Configuration">
              <RefSelect
                value={ui.ldapConfig}
                options={toOptions(refs.aaaPolicies)}
                onChange={(v) => setUi({ ldapConfig: v ?? '' })}
              />
            </FieldRow>
          )}
          {proxyRadius && (
            <>
              <FieldRow label="Local MAC Authentication" inline>
                <Switch
                  checked={ui.localMacAuth}
                  onCheckedChange={(v) => setUi({ localMacAuth: v })}
                />
              </FieldRow>
              {[0, 1, 2, 3].map((slot) => (
                <FieldRow
                  key={slot}
                  label={`RADIUS Server ${slot + 1}`}
                  description={slot === 0 ? 'Servers come from the configured AAA policies.' : undefined}
                >
                  <RefSelect
                    value={ui.radiusServers[slot]}
                    options={serverIps}
                    onChange={(v) => {
                      const next = [...ui.radiusServers];
                      next[slot] = v ?? '';
                      setUi({ radiusServers: next });
                    }}
                  />
                </FieldRow>
              ))}
            </>
          )}
          <FieldRow label="Fast Transition (802.11r)" inline>
            <Switch
              checked={!!fields.fastTransitionEnabled}
              onCheckedChange={(v) =>
                setForm((prev) => withPrivacyField(prev, 'fastTransitionEnabled', v))
              }
            />
          </FieldRow>
          {showMdId && (
            <FieldRow
              label="Mobility Domain ID"
              htmlFor="wlan-mdid"
              error={errors.mobilityDomainId}
              description="0 to 65535."
              required
            >
              <Input
                id="wlan-mdid"
                type="number"
                min={0}
                max={65535}
                className="w-40"
                value={fields.fastTransitionMdId ?? ''}
                onChange={(e) =>
                  setForm((prev) =>
                    withPrivacyField(
                      prev,
                      'fastTransitionMdId',
                      e.target.value === '' ? undefined : Number(e.target.value)
                    )
                  )
                }
              />
            </FieldRow>
          )}
        </Section>
      )}

      <Section title="MAC-Based Authorization">
        <FieldRow
          label="MAC-based authentication (MBA)"
          inline
          description={
            mbaLocked ? 'Unavailable while this captive portal type is enabled.' : undefined
          }
        >
          <Switch
            checked={record.mbaAuthorization}
            disabled={mbaLocked}
            onCheckedChange={(v) => patch({ mbaAuthorization: v })}
          />
        </FieldRow>
        {showTimeoutRole && (
          <FieldRow label="MBA Timeout Role">
            <RefSelect
              value={record.mbatimeoutRoleId}
              options={toOptions(refs.roles)}
              onChange={(v) => patch({ mbatimeoutRoleId: v })}
            />
          </FieldRow>
        )}
        <FieldRow label="RADIUS Accounting" inline>
          <Switch
            checked={record.accountingEnabled}
            onCheckedChange={(v) => patch({ accountingEnabled: v })}
          />
        </FieldRow>
      </Section>
    </div>
  );
}
