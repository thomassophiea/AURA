/**
 * Global Settings editor over the real /v1/globalsettings singleton record:
 * captive-portal auto-login, account password validity, external NAT address,
 * tx-power representation, traffic shaping, cloud visibility, DAS and the
 * security standard. `webProxy` (null on the lab box, shape unconfirmed) is
 * preserved untouched through the payload spread.
 */
import React, { useRef, useState } from 'react';
import { Section } from '../_kit';
import { globalSettingsService } from '../../../services/configure';
import type { GlobalSettings } from '../../../types/configure';
import { useSingleton } from './useSingleton';
import { SettingsShell } from './SettingsShell';
import { NumberField, SelectField, SwitchField, TextField } from './systemFields';

/** Best-effort enums; the live value is always injected so nothing is lost. */
function withCurrent(
  options: ReadonlyArray<{ id: string; label: string }>,
  value: string
): Array<{ id: string; label: string }> {
  if (!value || options.some((o) => o.id === value)) return [...options];
  return [...options, { id: value, label: value }];
}

const CP_AUTOLOGIN_OPTIONS = [
  { id: 'Redirect', label: 'Redirect' },
  { id: 'None', label: 'None' },
] as const;

const TX_POWER_OPTIONS = [
  { id: 'PerChain', label: 'Per Chain' },
  { id: 'Total', label: 'Total' },
] as const;

const SECURITY_STANDARD_OPTIONS = [
  { id: 'DISABLED', label: 'Disabled' },
  { id: 'FIPS', label: 'FIPS' },
] as const;

export function GlobalSettingsTab() {
  const { record, loading, saving, refresh, save } = useSingleton<GlobalSettings>(
    globalSettingsService,
    'global settings'
  );
  const [form, setForm] = useState<GlobalSettings | null>(null);
  const initial = useRef('');
  const seededFor = useRef<GlobalSettings | null>(null);
  if (record && seededFor.current !== record) {
    seededFor.current = record;
    const clone = structuredClone(record);
    setForm(clone);
    initial.current = JSON.stringify(clone);
  }

  const dirty = form != null && JSON.stringify(form) !== initial.current;
  const patch = (next: Partial<GlobalSettings>) => setForm((p) => (p ? { ...p, ...next } : p));

  return (
    <SettingsShell
      title="Global Settings"
      description="Appliance-wide configuration (/v1/globalsettings)."
      loading={loading}
      saving={saving}
      dirty={dirty}
      ready={form != null}
      onRefresh={() => void refresh()}
      onSave={() => form && void save(form)}
    >
      {form && (
        <>
          <Section title="General">
            <SelectField
              label="Captive Portal Auto-Login"
              value={form.cpAutoLogin}
              onChange={(v) => patch({ cpAutoLogin: v })}
              options={withCurrent(CP_AUTOLOGIN_OPTIONS, form.cpAutoLogin)}
            />
            <NumberField
              label="Account Password Validity"
              value={form.accountsPasswordValidity}
              onChange={(v) => patch({ accountsPasswordValidity: v === '' ? 0 : v })}
              min={0}
              description="Days before administrator passwords expire (0 = never)."
            />
            <TextField
              label="External NAT Address"
              value={form.extNatAddr}
              onChange={(v) => patch({ extNatAddr: v })}
              placeholder="0.0.0.0"
            />
            <SelectField
              label="Tx Power Representation"
              value={form.txPowerRepresentation}
              onChange={(v) => patch({ txPowerRepresentation: v })}
              options={withCurrent(TX_POWER_OPTIONS, form.txPowerRepresentation)}
            />
            <SwitchField
              label="Traffic Shaping"
              checked={form.trafficShaping}
              onChange={(v) => patch({ trafficShaping: v })}
              description="Enable appliance-wide traffic shaping."
            />
          </Section>

          <Section title="Cloud Visibility">
            <TextField
              label="Address"
              value={form.cloudVisibility?.address ?? ''}
              onChange={(v) =>
                patch({ cloudVisibility: { ...form.cloudVisibility, address: v } })
              }
              placeholder="calr1-cw.extremecloudiq.com"
            />
            <NumberField
              label="Reporting Interval"
              value={form.cloudVisibility?.reportingInterval ?? ''}
              onChange={(v) =>
                patch({
                  cloudVisibility: {
                    ...form.cloudVisibility,
                    reportingInterval: v === '' ? 0 : v,
                  },
                })
              }
              min={0}
              description="Seconds between cloud visibility reports."
            />
          </Section>

          <Section title="Dynamic Authorization (DAS)" collapsible defaultOpen={false}>
            <NumberField
              label="Port"
              value={form.das?.port ?? ''}
              onChange={(v) => patch({ das: { ...form.das, port: v === '' ? 0 : v } })}
              min={1}
              max={65535}
            />
            <NumberField
              label="Replay Interval"
              value={form.das?.replayInterval ?? ''}
              onChange={(v) =>
                patch({ das: { ...form.das, replayInterval: v === '' ? 0 : v } })
              }
              min={0}
              description="Seconds a DAS request is protected against replay."
            />
          </Section>

          <Section title="Security Standard" collapsible defaultOpen={false}>
            <SelectField
              label="Standard"
              value={form.securityStandard?.standard ?? 'DISABLED'}
              onChange={(v) =>
                patch({ securityStandard: { ...form.securityStandard, standard: v } })
              }
              options={withCurrent(
                SECURITY_STANDARD_OPTIONS,
                form.securityStandard?.standard ?? 'DISABLED'
              )}
            />
            <TextField
              label="Image Name"
              value={form.securityStandard?.imageName ?? ''}
              onChange={(v) =>
                patch({
                  securityStandard: { ...form.securityStandard, imageName: v || null },
                })
              }
              description="Signed security-standard image, when a standard is enforced."
            />
          </Section>
        </>
      )}
    </SettingsShell>
  );
}

export default GlobalSettingsTab;
