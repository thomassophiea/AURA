/**
 * RADIUS Server editor (aaa_radius_servers.html + radiusServerAdvanced
 * popover): Server identity + timing, Advanced username handling, and the
 * Health Check reveal chain. `server_ip` is the record key on this API.
 * Response Window renders in EDIT mode only (gateway ng-show="!createMode").
 */
import React, { useRef, useState } from 'react';
import { Switch } from '../../ui/switch';
import { EditorSheet, FieldRow, MaskedInput, Section } from '../_kit';
import { EnumSelect, NumInput } from '../policy/fields';
import { Input } from '../../ui/input';
import type { AcRadiusServer } from '../../../services/configure/accessControlFamilyService';
import {
  D_RADIUS,
  USERNAME_FORMATS,
  isReadOnly,
  noErrors,
  radiusErrors,
  toOpts,
} from './accessControlModel';

export interface RadiusServerEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → create (seeded from the controller-shaped D_RADIUS default). */
  record: AcRadiusServer | null;
  saving: boolean;
  onSave: (payload: Partial<AcRadiusServer>, id?: string) => void | Promise<void>;
}

export function RadiusServerEditor({
  open,
  onOpenChange,
  record,
  saving,
  onSave,
}: RadiusServerEditorProps) {
  const createMode = record == null;
  const ro = isReadOnly(record);
  const [form, setForm] = useState<AcRadiusServer>(() => structuredClone(record ?? D_RADIUS));
  const initial = useRef(JSON.stringify(record ?? D_RADIUS));
  const dirty = JSON.stringify(form) !== initial.current;

  const upd = <K extends keyof AcRadiusServer>(key: K, value: AcRadiusServer[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const num = (v: number | '') => (v === '' ? null : v);

  const errs = radiusErrors(form, createMode);
  const valid = noErrors(errs) && !ro;
  const healthOn = !!form.use_server_status_request || !!form.use_access_request;

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={createMode ? 'Add RADIUS Server' : form.server_ip || 'Edit RADIUS Server'}
      description="Access Control RADIUS server (/access-control/v1/radius_servers)"
      width={760}
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={() => onSave(structuredClone(form), record?.server_ip)}
    >
      <div className="max-w-[620px] space-y-6">
        <Section title="Server">
          <FieldRow
            label="RADIUS Server IP"
            htmlFor="acr-ip"
            required
            error={dirty ? errs.server_ip : null}
          >
            <Input
              id="acr-ip"
              value={form.server_ip ?? ''}
              disabled={ro}
              onChange={(e) => upd('server_ip', e.target.value)}
              className="max-w-[280px]"
            />
          </FieldRow>
          <FieldRow
            label="Shared Secret"
            htmlFor="acr-secret"
            required
            error={dirty ? errs.shared_secret : null}
            description="At least 6 characters"
          >
            <MaskedInput
              id="acr-secret"
              value={form.shared_secret ?? ''}
              disabled={ro}
              onChange={(v) => upd('shared_secret', v)}
              className="max-w-[280px]"
            />
          </FieldRow>
          {/* response_window is edit-mode only on the Gateway (ng-show="!createMode") */}
          {!createMode && (
            <FieldRow
              label="Response Window"
              htmlFor="acr-window"
              error={dirty ? errs.response_window : null}
              description="Valid range 1 to 60"
            >
              <NumInput
                id="acr-window"
                value={form.response_window ?? ''}
                min={1}
                max={60}
                disabled={ro}
                onChange={(v) => upd('response_window', num(v))}
              />
            </FieldRow>
          )}
          <FieldRow
            label="Authentication Timeout Duration"
            htmlFor="acr-timeout"
            error={dirty ? errs.authentication_timeout : null}
            description="Valid range 1 to 60"
          >
            <NumInput
              id="acr-timeout"
              value={form.authentication_timeout ?? ''}
              min={1}
              max={60}
              disabled={ro}
              onChange={(v) => upd('authentication_timeout', num(v))}
            />
          </FieldRow>
          <FieldRow
            label="Authentication Retry Count"
            htmlFor="acr-retries"
            error={dirty ? errs.authentication_retry_count : null}
            description="Valid range 0 to 10"
          >
            <NumInput
              id="acr-retries"
              value={form.authentication_retry_count ?? ''}
              min={0}
              max={10}
              disabled={ro}
              onChange={(v) => upd('authentication_retry_count', num(v))}
            />
          </FieldRow>
          <FieldRow
            label="Auth Client UDP Port"
            htmlFor="acr-authport"
            error={dirty ? errs.authorization_client_port : null}
            description="Valid range 1 to 65535"
          >
            <NumInput
              id="acr-authport"
              value={form.authorization_client_port ?? ''}
              min={1}
              max={65535}
              disabled={ro}
              onChange={(v) => upd('authorization_client_port', num(v))}
            />
          </FieldRow>
          <FieldRow
            label="Accounting Client UDP Port"
            htmlFor="acr-acctport"
            error={dirty ? errs.accounting_client_port : null}
            description="Valid range 1 to 65535"
          >
            <NumInput
              id="acr-acctport"
              value={form.accounting_client_port ?? ''}
              min={1}
              max={65535}
              disabled={ro}
              onChange={(v) => upd('accounting_client_port', num(v))}
            />
          </FieldRow>
          <FieldRow label="Proxy RADIUS Accounting Requests" inline>
            <Switch
              checked={!!form.proxy_radius_accounting_requests}
              disabled={ro}
              onCheckedChange={(v) => upd('proxy_radius_accounting_requests', v)}
              aria-label="Proxy RADIUS Accounting Requests"
            />
          </FieldRow>
        </Section>

        <Section title="Advanced">
          <FieldRow label="Username Format" htmlFor="acr-unformat">
            <EnumSelect
              id="acr-unformat"
              value={form.username_format ?? USERNAME_FORMATS[0]}
              options={toOpts(USERNAME_FORMATS)}
              disabled={ro}
              onChange={(v) => upd('username_format', v)}
            />
          </FieldRow>
          <FieldRow label="Require Message Authenticator" inline>
            <Switch
              checked={!!form.require_message_authenticator}
              disabled={ro}
              onCheckedChange={(v) => upd('require_message_authenticator', v)}
              aria-label="Require Message Authenticator"
            />
          </FieldRow>
        </Section>

        <Section title="Health Check">
          <FieldRow label="Use Server-Status Request" inline>
            <Switch
              checked={!!form.use_server_status_request}
              disabled={ro}
              onCheckedChange={(v) => upd('use_server_status_request', v)}
              aria-label="Use Server-Status Request"
            />
          </FieldRow>
          <FieldRow label="Use Access Request" inline>
            <Switch
              checked={!!form.use_access_request}
              disabled={ro}
              onCheckedChange={(v) => upd('use_access_request', v)}
              aria-label="Use Access Request"
            />
          </FieldRow>
          {form.use_access_request && (
            <>
              <FieldRow label="Username" htmlFor="acr-hc-user">
                <Input
                  id="acr-hc-user"
                  value={form.username ?? ''}
                  disabled={ro}
                  onChange={(e) => upd('username', e.target.value)}
                  className="max-w-[260px]"
                />
              </FieldRow>
              <FieldRow label="Password" htmlFor="acr-hc-pass">
                <MaskedInput
                  id="acr-hc-pass"
                  value={form.password ?? ''}
                  disabled={ro}
                  onChange={(v) => upd('password', v)}
                  className="max-w-[260px]"
                />
              </FieldRow>
            </>
          )}
          {healthOn && (
            <>
              <FieldRow
                label="Check Interval"
                htmlFor="acr-hc-check"
                error={dirty ? errs.check_interval : null}
                description="Valid range 1 to 3600"
              >
                <NumInput
                  id="acr-hc-check"
                  value={form.check_interval ?? ''}
                  min={1}
                  max={3600}
                  disabled={ro}
                  onChange={(v) => upd('check_interval', num(v))}
                />
              </FieldRow>
              <FieldRow
                label="Number of Answers to Alive"
                htmlFor="acr-hc-answers"
                error={dirty ? errs.number_of_answers_to_alive : null}
                description="Valid range 1 to 10"
              >
                <NumInput
                  id="acr-hc-answers"
                  value={form.number_of_answers_to_alive ?? ''}
                  min={1}
                  max={10}
                  disabled={ro}
                  onChange={(v) => upd('number_of_answers_to_alive', num(v))}
                />
              </FieldRow>
              <FieldRow
                label="Revive Interval"
                htmlFor="acr-hc-revive"
                error={dirty ? errs.revive_interval : null}
                description="Valid range 1 to 3600"
              >
                <NumInput
                  id="acr-hc-revive"
                  value={form.revive_interval ?? ''}
                  min={1}
                  max={3600}
                  disabled={ro}
                  onChange={(v) => upd('revive_interval', num(v))}
                />
              </FieldRow>
            </>
          )}
        </Section>
      </div>
    </EditorSheet>
  );
}
