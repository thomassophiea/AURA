/**
 * SNMP settings editor over the real /v1/snmp singleton record. Surfaces the
 * fields the audit enumerates: version, engine ID, context, trap severity, v3
 * users and notification targets. v2 communities / custId / id / canEdit /
 * canDelete are preserved untouched through the payload spread.
 */
import React, { useMemo, useRef, useState } from 'react';
import { ArrayEditor, Section } from '../_kit';
import { snmpService } from '../../../services/configure';
import type { SnmpSettings, SnmpV3User, SnmpNotification } from '../../../types/configure';
import { useSingleton } from './useSingleton';
import { SettingsShell } from './SettingsShell';
import { MaskedField, NumberField, SelectField, TextField } from './systemFields';

const VERSION_OPTIONS = [
  { id: 'DISABLED', label: 'Disabled' },
  { id: 'V2', label: 'v2c' },
  { id: 'V3', label: 'v3' },
] as const;

const TRAP_SEVERITY_OPTIONS = [
  { id: 'Critical', label: 'Critical' },
  { id: 'Major', label: 'Major' },
  { id: 'Minor', label: 'Minor' },
  { id: 'Warning', label: 'Warning' },
  { id: 'Informational', label: 'Informational' },
] as const;

const AUTH_PROTOCOL_OPTIONS = [
  { id: 'None', label: 'None' },
  { id: 'MD5', label: 'MD5' },
  { id: 'SHA', label: 'SHA' },
] as const;

const PRIV_PROTOCOL_OPTIONS = [
  { id: 'None', label: 'None' },
  { id: 'DES', label: 'DES' },
  { id: 'AES', label: 'AES' },
] as const;

export function SnmpTab() {
  const { record, loading, saving, refresh, save } = useSingleton<SnmpSettings>(
    snmpService,
    'SNMP settings'
  );
  const [form, setForm] = useState<SnmpSettings | null>(null);
  const initial = useRef('');
  const seededFor = useRef<SnmpSettings | null>(null);
  if (record && seededFor.current !== record) {
    seededFor.current = record;
    const clone = structuredClone(record);
    setForm(clone);
    initial.current = JSON.stringify(clone);
  }

  const dirty = form != null && JSON.stringify(form) !== initial.current;
  const version = form?.snmpVersion ?? 'DISABLED';
  const isV3 = version === 'V3';

  const patch = (next: Partial<SnmpSettings>) => setForm((p) => (p ? { ...p, ...next } : p));

  const users = useMemo<SnmpV3User[]>(() => form?.v3Users ?? [], [form]);
  const notifications = useMemo<SnmpNotification[]>(() => form?.notifications ?? [], [form]);

  return (
    <SettingsShell
      title="SNMP"
      description="Appliance SNMP agent, trap severity and notification targets (/v1/snmp)."
      loading={loading}
      saving={saving}
      dirty={dirty}
      ready={form != null}
      onRefresh={() => void refresh()}
      onSave={() => form && void save(form)}
    >
      {form && (
        <>
          <Section title="Agent">
            <SelectField
              label="SNMP Version"
              value={version}
              onChange={(v) => patch({ snmpVersion: v })}
              options={VERSION_OPTIONS}
            />
            <TextField
              label="Engine ID"
              value={form.engineId ?? ''}
              onChange={(v) => patch({ engineId: v || null })}
              description="SNMPv3 engine identifier."
            />
            <TextField
              label="Context"
              value={form.context ?? ''}
              onChange={(v) => patch({ context: v || null })}
            />
            <SelectField
              label="Trap Severity"
              value={form.trapSeverity || 'Major'}
              onChange={(v) => patch({ trapSeverity: v })}
              options={TRAP_SEVERITY_OPTIONS}
              description="Minimum event severity that generates an SNMP trap."
            />
          </Section>

          {isV3 && (
            <Section title="v3 Users" description="SNMPv3 users with auth / privacy protocols.">
              <ArrayEditor<SnmpV3User>
                items={users}
                onChange={(items) => patch({ v3Users: items })}
                createItem={() => ({ name: '', authProtocol: 'None', privProtocol: 'None' })}
                addLabel="Add User"
                emptyText="No v3 users configured"
                getItemTitle={(u, i) => u.name || `User ${i + 1}`}
                renderItem={(u, _i, update) => (
                  <>
                    <TextField
                      label="User Name"
                      value={u.name ?? ''}
                      onChange={(v) => update({ ...u, name: v })}
                      required
                    />
                    <SelectField
                      label="Auth Protocol"
                      value={u.authProtocol ?? 'None'}
                      onChange={(v) => update({ ...u, authProtocol: v })}
                      options={AUTH_PROTOCOL_OPTIONS}
                    />
                    <MaskedField
                      label="Auth Password"
                      value={typeof u.authPassword === 'string' ? u.authPassword : ''}
                      onChange={(v) => update({ ...u, authPassword: v })}
                    />
                    <SelectField
                      label="Privacy Protocol"
                      value={u.privProtocol ?? 'None'}
                      onChange={(v) => update({ ...u, privProtocol: v })}
                      options={PRIV_PROTOCOL_OPTIONS}
                    />
                    <MaskedField
                      label="Privacy Password"
                      value={typeof u.privPassword === 'string' ? u.privPassword : ''}
                      onChange={(v) => update({ ...u, privPassword: v })}
                    />
                  </>
                )}
              />
            </Section>
          )}

          <Section title="Notifications" description="Trap / inform notification targets.">
            <ArrayEditor<SnmpNotification>
              items={notifications}
              onChange={(items) => patch({ notifications: items })}
              createItem={() => ({ ipAddress: '', port: 162 })}
              addLabel="Add Notification"
              emptyText="No notification targets configured"
              getItemTitle={(n, i) => n.ipAddress || `Target ${i + 1}`}
              renderItem={(n, _i, update) => (
                <>
                  <TextField
                    label="IP Address"
                    value={n.ipAddress ?? ''}
                    onChange={(v) => update({ ...n, ipAddress: v })}
                    placeholder="10.0.0.10"
                    required
                  />
                  <NumberField
                    label="Port"
                    value={typeof n.port === 'number' ? n.port : ''}
                    onChange={(v) => update({ ...n, port: v === '' ? undefined : v })}
                    min={1}
                    max={65535}
                  />
                </>
              )}
            />
          </Section>
        </>
      )}
    </SettingsShell>
  );
}

export default SnmpTab;
