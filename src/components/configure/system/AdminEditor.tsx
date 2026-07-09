/**
 * Administrator account editor drawer (/v1/administrators). Core account fields
 * only — username (create-only, pattern-validated), admin role (locked for the
 * built-in `admin`), account state, change-password reveal with confirm + mask,
 * and idle timeout. Scopes/presets dialog, RADIUS admin-auth tab and API-key
 * management are deferred (see adminModel header for the audit references).
 */
import React, { useMemo, useRef, useState } from 'react';
import { Badge } from '../../ui/badge';
import { EditorSheet, FieldRow, Section } from '../_kit';
import { Switch } from '../../ui/switch';
import type { Administrator } from '../../../types/configure';
import { MaskedField, NumberField, SelectField, TextField } from './systemFields';
import {
  ACCOUNT_STATE_OPTIONS,
  BUILTIN_ADMIN,
  ROLE_OPTIONS,
  toAdminPayload,
  validateAdmin,
} from './adminModel';

export interface AdminEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Record being edited, or null for Add. */
  record: Administrator | null;
  /** Add seed (buildNewAdmin()). */
  seed: Administrator | null;
  existingIds: string[];
  saving: boolean;
  onSave: (payload: Administrator, userId?: string) => void | Promise<void>;
}

export function AdminEditor({
  open,
  onOpenChange,
  record,
  seed,
  existingIds,
  saving,
  onSave,
}: AdminEditorProps) {
  const isNew = record == null;
  const [form, setForm] = useState<Administrator>(() =>
    structuredClone((record ?? seed) as Administrator)
  );
  // New accounts must set a password; edits keep the stored secret until asked.
  const [changePassword, setChangePassword] = useState(isNew);
  const [confirmPassword, setConfirmPassword] = useState('');
  const initialJson = useRef(JSON.stringify({ form, changePassword, confirmPassword }));

  const dirty =
    isNew || JSON.stringify({ form, changePassword, confirmPassword }) !== initialJson.current;

  const errs = useMemo(
    () => validateAdmin(form, { isNew, changePassword, confirmPassword, existingIds }),
    [form, isNew, changePassword, confirmPassword, existingIds]
  );
  const valid = Object.keys(errs).length === 0;

  const patch = (next: Partial<Administrator>) => setForm((p) => ({ ...p, ...next }));
  const isBuiltinAdmin = !isNew && form.userId === BUILTIN_ADMIN;

  const handleSave = () =>
    onSave(toAdminPayload(form, { isNew, changePassword }), record?.userId);

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          {isNew ? 'Add Administrator' : form.userId || 'Edit Administrator'}
          {!isNew && <Badge variant="secondary">{form.adminRole}</Badge>}
        </span>
      }
      description="Controller administrator account (/v1/administrators)"
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={handleSave}
    >
      <div className="space-y-6">
        <Section title="Account">
          <TextField
            label="Username"
            value={form.userId}
            onChange={(v) => patch({ userId: v })}
            error={errs.userId}
            required
            disabled={!isNew}
            maxLength={32}
            description={isNew ? undefined : 'Username cannot be changed after creation.'}
          />
          <SelectField
            label="Admin Role"
            value={form.adminRole}
            onChange={(v) => patch({ adminRole: v })}
            options={ROLE_OPTIONS}
            disabled={isBuiltinAdmin}
            description={
              isBuiltinAdmin
                ? 'The built-in admin account is always Full access.'
                : form.adminRole === 'CUSTOM'
                  ? 'Custom scopes are managed on the controller (per-scope editing deferred).'
                  : undefined
            }
          />
          <SelectField
            label="Account State"
            value={form.accountState || 'ENABLED'}
            onChange={(v) => patch({ accountState: v })}
            options={ACCOUNT_STATE_OPTIONS}
          />
          <FieldRow label="Enabled" inline description="Allow this account to sign in.">
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
              aria-label="Enabled"
            />
          </FieldRow>
          <NumberField
            label="Idle Timeout"
            value={form.idleTimeout ?? ''}
            onChange={(v) => patch({ idleTimeout: v === '' ? 0 : v })}
            error={errs.idleTimeout}
            min={0}
            description="Seconds of inactivity before the session ends."
          />
        </Section>

        <Section title="Password">
          {!isNew && (
            <FieldRow label="Change Password" inline description="Set a new password for this account.">
              <Switch
                checked={changePassword}
                onCheckedChange={(v) => {
                  setChangePassword(v);
                  if (!v) {
                    patch({ password: null });
                    setConfirmPassword('');
                  }
                }}
                aria-label="Change password"
              />
            </FieldRow>
          )}
          {(isNew || changePassword) && (
            <>
              <MaskedField
                label="Password"
                value={form.password ?? ''}
                onChange={(v) => patch({ password: v })}
                error={errs.password}
                required
              />
              <MaskedField
                label="Confirm Password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                error={errs.confirmPassword}
                required
              />
            </>
          )}
        </Section>
      </div>
    </EditorSheet>
  );
}

export default AdminEditor;
