/**
 * Local Password Repository user editor (aaa_local_password_repo.html +
 * cbUser). The gateway ships exactly one repository ("Default"); this editor
 * edits the users inside it. Display Name / First Name render in EDIT mode
 * only (gateway ng-show="!createMode"); password requires ≥8 chars + confirm
 * (validated on create, or on edit once a new password is typed).
 */
import React, { useRef, useState } from 'react';
import { Switch } from '../../ui/switch';
import { Input } from '../../ui/input';
import { EditorSheet, FieldRow, MaskedInput, Section } from '../_kit';
import { EnumSelect } from '../policy/fields';
import type { AcRepoUserRecord } from '../../../services/configure/accessControlFamilyService';
import {
  DEFAULT_REPOSITORY,
  repoUserId,
} from '../../../services/configure/accessControlFamilyService';
import { D_REPO_USER, HASH_TYPES, isReadOnly, noErrors, toOpts } from './accessControlModel';

export interface RepoUserEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: AcRepoUserRecord | null;
  /** Sibling usernames in the same repository (uniqueness on create). */
  siblingUsernames: string[];
  saving: boolean;
  onSave: (payload: Partial<AcRepoUserRecord>, id?: string) => void | Promise<void>;
}

export function RepoUserEditor({
  open,
  onOpenChange,
  record,
  siblingUsernames,
  saving,
  onSave,
}: RepoUserEditorProps) {
  const createMode = record == null;
  const ro = isReadOnly(record);
  const seed: AcRepoUserRecord = record ?? { ...D_REPO_USER, repository: DEFAULT_REPOSITORY };
  const [form, setForm] = useState<AcRepoUserRecord>(() => structuredClone(seed));
  const [confirm, setConfirm] = useState('');
  const initial = useRef(JSON.stringify(seed));
  const dirty = JSON.stringify(form) !== initial.current;

  const upd = <K extends keyof AcRepoUserRecord>(key: K, value: AcRepoUserRecord[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const username = (form.username ?? '').trim();
  const password = form.password ?? '';
  const passwordActive = createMode || password !== (record?.password ?? '');
  const errs: Record<string, string | null> = {
    username: !username
      ? 'Username is required'
      : username !== (record?.username ?? '') &&
          siblingUsernames.some((u) => u.toLowerCase() === username.toLowerCase())
        ? 'That username is already in use'
        : null,
    password:
      passwordActive && password.length < 8 ? 'Password must be at least 8 characters' : null,
    confirm: passwordActive && confirm !== password ? 'Passwords do not match' : null,
  };
  const valid = noErrors(errs) && !ro;

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={createMode ? 'Add User' : form.username || 'Edit User'}
      description={`Local Password Repository "${form.repository ?? DEFAULT_REPOSITORY}" (/access-control/v1/local_password_repos)`}
      width={720}
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={() => onSave(structuredClone(form), record ? repoUserId(record) : undefined)}
    >
      <div className="max-w-[560px] space-y-6">
        <Section title="User">
          <FieldRow
            label="Username"
            htmlFor="acu-username"
            required
            error={dirty ? errs.username : null}
          >
            <Input
              id="acu-username"
              value={form.username ?? ''}
              disabled={ro}
              onChange={(e) => upd('username', e.target.value)}
              className="max-w-[300px]"
            />
          </FieldRow>
          {/* display/first name are edit-mode only on the Gateway (ng-show="!createMode") */}
          {!createMode && (
            <FieldRow label="Display Name" htmlFor="acu-display">
              <Input
                id="acu-display"
                value={form.display_name ?? ''}
                disabled={ro}
                onChange={(e) => upd('display_name', e.target.value)}
                className="max-w-[300px]"
              />
            </FieldRow>
          )}
          {!createMode && (
            <FieldRow label="First Name" htmlFor="acu-first">
              <Input
                id="acu-first"
                value={form.first_name ?? ''}
                disabled={ro}
                onChange={(e) => upd('first_name', e.target.value)}
                className="max-w-[300px]"
              />
            </FieldRow>
          )}
          <FieldRow label="Last Name" htmlFor="acu-last">
            <Input
              id="acu-last"
              value={form.last_name ?? ''}
              disabled={ro}
              onChange={(e) => upd('last_name', e.target.value)}
              className="max-w-[300px]"
            />
          </FieldRow>
          <FieldRow label="Description" htmlFor="acu-desc">
            <Input
              id="acu-desc"
              value={form.description ?? ''}
              disabled={ro}
              onChange={(e) => upd('description', e.target.value)}
              className="max-w-[420px]"
            />
          </FieldRow>
          <FieldRow label="Enabled" inline>
            <Switch
              checked={form.enabled !== false}
              disabled={ro}
              onCheckedChange={(v) => upd('enabled', v)}
              aria-label="Enabled"
            />
          </FieldRow>
        </Section>

        <Section title="Password">
          <FieldRow
            label="Password"
            htmlFor="acu-pass"
            required={createMode}
            error={dirty ? errs.password : null}
            description="At least 8 characters"
          >
            <MaskedInput
              id="acu-pass"
              value={password}
              disabled={ro}
              onChange={(v) => upd('password', v)}
              className="max-w-[280px]"
            />
          </FieldRow>
          <FieldRow
            label="Confirm Password"
            htmlFor="acu-confirm"
            required={createMode}
            error={dirty ? errs.confirm : null}
          >
            <MaskedInput
              id="acu-confirm"
              value={confirm}
              disabled={ro}
              onChange={setConfirm}
              className="max-w-[280px]"
            />
          </FieldRow>
          <FieldRow label="Password Hash Type" htmlFor="acu-hash">
            <EnumSelect
              id="acu-hash"
              value={form.password_hash_type ?? HASH_TYPES[0]}
              options={toOpts(HASH_TYPES)}
              disabled={ro}
              onChange={(v) => upd('password_hash_type', v)}
              className="w-72"
            />
          </FieldRow>
        </Section>
      </div>
    </EditorSheet>
  );
}
