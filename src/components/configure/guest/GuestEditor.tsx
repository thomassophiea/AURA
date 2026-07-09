/**
 * ExtremeGuest editor (EPB-125 §16) — extreme-guest.html parity per B1-B6:
 * account block (Callback User Name / Callback Password labels, B5), ONE IP /
 * secret / timeout / retries mirrored into both the auth and acct server
 * objects (B1), independent auth/acct UDP ports, full validation set (B2),
 * masked secret + password (B3), delete workflow with confirm (B6).
 */
import React, { useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { ConfirmDialog, EditorSheet, FieldRow, MaskedInput, Section } from '../_kit';
import {
  fromGuestRecord,
  toGuestPayload,
  updatePort,
  updateShared,
  validateGuest,
  type GuestForm,
  type Numeric,
} from './guestModel';
import type { EGuestProfile } from '../../../types/configure';

export interface GuestEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Record being edited, or null for Add. */
  record: EGuestProfile | null;
  /** Add-mode seed — the controller /default template (id stripped by the page). */
  seed: EGuestProfile | null;
  saving: boolean;
  onSave: (payload: Partial<EGuestProfile>) => void | Promise<void>;
  /** Custom delete path threaded through the list machinery (B6). */
  onDelete?: () => void | Promise<void>;
}

export function GuestEditor({
  open,
  onOpenChange,
  record,
  seed,
  saving,
  onSave,
  onDelete,
}: GuestEditorProps) {
  const isNew = record == null;
  const [form, setForm] = useState<GuestForm>(() =>
    fromGuestRecord(record ?? (seed as EGuestProfile))
  );
  const initialJson = useRef(JSON.stringify(form));
  const dirty = useMemo(() => JSON.stringify(form) !== initialJson.current, [form]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canEdit = record?.canEdit !== false;
  const errs = useMemo(() => validateGuest(form), [form]);
  const valid = Object.keys(errs).length === 0;

  const auth = form.authenticationRadiusServer;
  const upd = (patch: Partial<GuestForm>) => setForm((prev) => ({ ...prev, ...patch }));
  const numeric = (raw: string): Numeric => (raw === '' ? '' : Number(raw));

  const canDelete = !isNew && record?.canDelete !== false && onDelete != null;

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? 'Add ExtremeGuest Server' : form.name || 'Edit ExtremeGuest Server'}
      description="ExtremeGuest captive-portal integration"
      width={720}
      dirty={dirty}
      valid={valid && canEdit}
      saving={saving}
      onSave={() => void onSave(toGuestPayload(form))}
      footerExtra={
        canDelete ? (
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={saving}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <Section title="ExtremeGuest Account">
          <FieldRow label="Name" error={errs.name} required>
            <Input
              aria-label="Name"
              value={form.name}
              disabled={!canEdit}
              onChange={(e) => upd({ name: e.target.value })}
              className="max-w-[320px]"
            />
          </FieldRow>
          <FieldRow label="FQDN">
            <Input
              aria-label="FQDN"
              value={form.cpFqdn}
              placeholder="guest.example.com"
              disabled={!canEdit}
              onChange={(e) => upd({ cpFqdn: e.target.value })}
              className="max-w-[320px]"
            />
          </FieldRow>
          <FieldRow label="Callback User Name">
            <Input
              aria-label="Callback User Name"
              value={form.userName}
              disabled={!canEdit}
              onChange={(e) => upd({ userName: e.target.value })}
              className="max-w-[320px]"
            />
          </FieldRow>
          <FieldRow label="Callback Password" error={errs.password}>
            <MaskedInput
              aria-label="Callback Password"
              value={form.password}
              onChange={(v) => upd({ password: v })}
              disabled={!canEdit}
              className="max-w-[320px]"
            />
          </FieldRow>
        </Section>

        <Section
          title="RADIUS Server"
          description="One appliance: address, secret, timeout and retries apply to both authentication and accounting"
        >
          <FieldRow label="IP Address" error={errs.ip} required>
            <Input
              aria-label="IP Address"
              value={auth.ipAddress}
              placeholder="10.0.0.10"
              disabled={!canEdit}
              onChange={(e) => setForm((prev) => updateShared(prev, 'ipAddress', e.target.value))}
              className="max-w-[320px]"
            />
          </FieldRow>
          <FieldRow label="Shared Secret" error={errs.secret} required>
            <MaskedInput
              aria-label="Shared Secret"
              value={auth.sharedSecret}
              onChange={(v) => setForm((prev) => updateShared(prev, 'sharedSecret', v))}
              disabled={!canEdit}
              className="max-w-[320px]"
            />
          </FieldRow>
          <FieldRow label="Authentication Timeout Duration (seconds)" error={errs.timeout} required>
            <Input
              aria-label="Authentication Timeout Duration (seconds)"
              type="number"
              min={2}
              max={60}
              value={auth.timeout === '' ? '' : auth.timeout}
              disabled={!canEdit}
              onChange={(e) =>
                setForm((prev) => updateShared(prev, 'timeout', numeric(e.target.value)))
              }
              className="max-w-[180px]"
            />
          </FieldRow>
          <FieldRow label="Authentication Retry Count" error={errs.retries} required>
            <Input
              aria-label="Authentication Retry Count"
              type="number"
              min={0}
              max={32}
              value={auth.totalRetries === '' ? '' : auth.totalRetries}
              disabled={!canEdit}
              onChange={(e) =>
                setForm((prev) => updateShared(prev, 'totalRetries', numeric(e.target.value)))
              }
              className="max-w-[180px]"
            />
          </FieldRow>
          <FieldRow label="Authorization Client UDP Port" error={errs.authPort} required>
            <Input
              aria-label="Authorization Client UDP Port"
              type="number"
              min={0}
              max={65535}
              value={auth.port === '' ? '' : auth.port}
              disabled={!canEdit}
              onChange={(e) =>
                setForm((prev) =>
                  updatePort(prev, 'authenticationRadiusServer', numeric(e.target.value))
                )
              }
              className="max-w-[180px]"
            />
          </FieldRow>
          <FieldRow label="Accounting Client UDP Port" error={errs.acctPort} required>
            <Input
              aria-label="Accounting Client UDP Port"
              type="number"
              min={0}
              max={65535}
              value={
                form.accountingRadiusServer.port === '' ? '' : form.accountingRadiusServer.port
              }
              disabled={!canEdit}
              onChange={(e) =>
                setForm((prev) =>
                  updatePort(prev, 'accountingRadiusServer', numeric(e.target.value))
                )
              }
              className="max-w-[180px]"
            />
          </FieldRow>
        </Section>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete ExtremeGuest Server"
        description={`Delete "${form.name || 'this server'}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          setConfirmDelete(false);
          await onDelete?.();
        }}
      />
    </EditorSheet>
  );
}
