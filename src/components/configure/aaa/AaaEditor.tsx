/**
 * AAA policy editor (EPB-125 §7) — full controller parity per
 * aaa-guest-admin-parity.md A1-A15: attributes.* NAS bindings, policy-type
 * badge, nullable denyOnAuthFailure object, reauthTimeoutOvr 0=off,
 * create-only NAI Routing that swaps the server tables for realm entries and
 * hides the pooling selects, canEdit + Local-onboarding lockdowns, and
 * defaults-seeded Add (page passes the /default template).
 */
import React, { useMemo, useRef, useState } from 'react';
import { Badge } from '../../ui/badge';
import { EditorSheet, FieldRow, Section } from '../_kit';
import { NumberField, SelectField, SwitchField, TextField } from './fields';
import { RadiusServerTable } from './RadiusServerTable';
import { NaiRealmTable } from './NaiRealmTable';
import { AaaFailureSection } from './AaaFailureSection';
import {
  AAA_ENUMS,
  fromAaaRecord,
  isOnboardPolicy,
  toAaaPayload,
  validateAaaPolicy,
  type AaaPolicyForm,
} from './aaaModel';
import type { AaaPolicy } from '../../../types/configure';

export interface AaaEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Record being edited, or null for Add. */
  record: AaaPolicy | null;
  /** Add-mode seed — the controller /default template (id stripped by the page). */
  seed: AaaPolicy | null;
  saving: boolean;
  onSave: (payload: Partial<AaaPolicy>) => void | Promise<void>;
}

export function AaaEditor({ open, onOpenChange, record, seed, saving, onSave }: AaaEditorProps) {
  const isNew = record == null;
  const [form, setForm] = useState<AaaPolicyForm>(() =>
    fromAaaRecord(record ?? (seed as AaaPolicy))
  );
  const initialJson = useRef(JSON.stringify(form));
  const dirty = useMemo(() => JSON.stringify(form) !== initialJson.current, [form]);

  const canEdit = record?.canEdit !== false;
  const dis = !canEdit;
  const onboard = isOnboardPolicy(record);

  const errs = useMemo(() => validateAaaPolicy(form), [form]);
  const valid = Object.keys(errs).length === 0;

  const upd = (patch: Partial<AaaPolicyForm>) => setForm((prev) => ({ ...prev, ...patch }));
  const updAttr = (patch: Partial<AaaPolicyForm['attributes']>) =>
    setForm((prev) => ({ ...prev, attributes: { ...prev.attributes, ...patch } }));

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          {isNew ? 'Add AAA Policy' : form.name || 'Edit AAA Policy'}
          <Badge variant="secondary">{form.policyType || 'Standard'}</Badge>
        </span>
      }
      description="RADIUS authentication and accounting policy"
      width={840}
      dirty={dirty}
      valid={valid && canEdit}
      saving={saving}
      onSave={() => void onSave(toAaaPayload(form))}
    >
      <div className="space-y-6">
        <Section title="General">
          <TextField
            label="Name"
            value={form.name}
            onChange={(v) => upd({ name: v })}
            error={errs.name}
            maxLength={64}
            disabled={dis}
            required
          />
          <SwitchField
            label="NAI Routing"
            description="Settable only when creating the policy"
            checked={form.naiRouting}
            // Create-only lock (A7): the controller disables this after create.
            onChange={(v) => upd({ naiRouting: v, naiRealms: v ? (form.naiRealms ?? []) : null })}
            disabled={dis || !isNew}
          />
          <SelectField
            label="Authentication Protocol"
            value={form.authenticationType}
            onChange={(v) => upd({ authenticationType: v })}
            options={AAA_ENUMS.authProto}
            disabled={dis}
          />
        </Section>

        <Section title="RADIUS Attributes">
          <TextField
            label="NAS IP Address"
            value={form.attributes.nasIpAddress}
            onChange={(v) => updAttr({ nasIpAddress: v })}
            placeholder="0.0.0.0"
            error={errs.nasIp}
            disabled={dis}
            required
          />
          <TextField
            label="NAS ID"
            value={form.attributes.nasId}
            onChange={(v) => updAttr({ nasId: v })}
            error={errs.nasId}
            disabled={dis}
            required
          />
          <SelectField
            label="Called Station ID"
            value={form.attributes.calledStationId}
            onChange={(v) => updAttr({ calledStationId: v })}
            options={AAA_ENUMS.calledStation}
            disabled={dis}
          />
        </Section>

        <Section title="Accounting">
          <SelectField
            label="Accounting Type"
            value={form.accountingType}
            onChange={(v) => upd({ accountingType: v })}
            options={AAA_ENUMS.acctType}
            disabled={dis}
          />
          <SelectField
            label="Accounting Start"
            value={form.accountingStart}
            onChange={(v) => upd({ accountingStart: v })}
            options={AAA_ENUMS.acctStart}
            disabled={dis}
          />
          <NumberField
            label="Accounting Interim Interval (seconds)"
            value={form.accountingInterimInterval}
            onChange={(v) => upd({ accountingInterimInterval: v })}
            min={60}
            max={3600}
            error={errs.interim}
            disabled={dis}
            required
          />
        </Section>

        {/* Pooling-mode selects are hidden while NAI routing is on (A7). */}
        {!form.naiRouting && (
          <Section title="Server Pooling">
            <SelectField
              label="RADIUS Authentication Servers Mode"
              value={form.serverPoolingMode}
              onChange={(v) => upd({ serverPoolingMode: v })}
              options={AAA_ENUMS.poolMode}
              disabled={dis}
            />
            <SelectField
              label="RADIUS Accounting Servers Mode"
              value={form.accountingAccessAlg}
              onChange={(v) => upd({ accountingAccessAlg: v })}
              options={AAA_ENUMS.acctAlg}
              disabled={dis}
            />
          </Section>
        )}

        <Section title="Options">
          <SwitchField
            label="Event Timestamp"
            checked={form.eventTimestamp}
            onChange={(v) => upd({ eventTimestamp: v })}
            disabled={dis || onboard}
          />
          <SwitchField
            label="Include Framed-IP"
            checked={form.includeFramedIp}
            onChange={(v) => upd({ includeFramedIp: v })}
            disabled={dis || onboard}
          />
          <SwitchField
            label="Report NAS Location"
            checked={form.reportNasLocation}
            onChange={(v) => upd({ reportNasLocation: v })}
            disabled={dis || onboard}
          />
          <SwitchField
            label="Include Message Authenticator"
            checked={form.includeMsgAuth}
            onChange={(v) => upd({ includeMsgAuth: v })}
            disabled={dis}
          />
          <SelectField
            label="Operator Namespace"
            value={form.operatorNamespace}
            onChange={(v) => upd({ operatorNamespace: v })}
            options={AAA_ENUMS.opNs}
            disabled={dis || onboard}
          />
          {form.operatorNamespace !== 'None' && (
            <TextField
              label="Operator Name"
              value={form.operatorName}
              onChange={(v) => upd({ operatorName: v })}
              disabled={dis}
            />
          )}
        </Section>

        <AaaFailureSection form={form} errs={errs} disabled={dis} setForm={setForm} />

        {form.naiRouting ? (
          <Section title="NAI Realm Entries" description="Per-realm RADIUS server routing">
            <FieldRow label="Realm Entries" error={errs.naiRealms}>
              <NaiRealmTable
                realms={form.naiRealms ?? []}
                onChange={(v) => upd({ naiRealms: v })}
                disabled={dis}
              />
            </FieldRow>
          </Section>
        ) : (
          <>
            <Section title="RADIUS Authentication Servers">
              <RadiusServerTable
                radiusType="auth"
                servers={form.authenticationRadiusServers}
                onChange={(v) => upd({ authenticationRadiusServers: v })}
                hideNew={onboard}
                disabled={dis}
              />
            </Section>
            <Section title="RADIUS Accounting Servers">
              <RadiusServerTable
                radiusType="acct"
                servers={form.accountingRadiusServers}
                authServers={form.authenticationRadiusServers}
                onChange={(v) => upd({ accountingRadiusServers: v })}
                hideNew={onboard}
                disabled={dis}
              />
            </Section>
          </>
        )}
      </div>
    </EditorSheet>
  );
}
