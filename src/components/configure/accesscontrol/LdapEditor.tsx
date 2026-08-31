/**
 * LDAP Configuration editor (aaa_ldap_configs.html + ldapSchemaDefinition):
 * Configuration (name + connection URL list, at least one), Administrator
 * (masked password, user authentication type), and the Schema Definition
 * fields. `config_name` is the record key on this API.
 */
import React, { useRef, useState } from 'react';
import { Switch } from '../../ui/switch';
import { Input } from '../../ui/input';
import { EditorSheet, FieldRow, MaskedInput, Section } from '../_kit';
import { EnumSelect } from '../policy/fields';
import { StringListEditor } from './StringListEditor';
import type { AcLdapConfiguration } from '../../../services/configure/accessControlFamilyService';
import {
  D_LDAP,
  LDAP_AUTH_TYPES,
  RE_LDAP_URL,
  isReadOnly,
  noErrors,
  toOpts,
  uniqueNameError,
} from './accessControlModel';

export interface LdapEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: AcLdapConfiguration | null;
  /** Sibling config names for the uniqueness check. */
  siblingNames: string[];
  saving: boolean;
  onSave: (payload: Partial<AcLdapConfiguration>, id?: string) => void | Promise<void>;
}

const SCHEMA_FIELDS: Array<[keyof AcLdapConfiguration, string]> = [
  ['user_search_root', 'User Search Root'],
  ['host_search_root', 'Host Search Root'],
  ['ou_search_root', 'OU Search Root'],
  ['user_object_class', 'User Object Class'],
  ['user_search_attribute', 'User Search Attribute'],
  ['user_password_attribute', 'User Password Attribute'],
  ['host_object_class', 'Host Object Class'],
  ['host_search_attribute', 'Host Search Attribute'],
  ['ou_object_classes', 'OU Object Classes'],
];

export function LdapEditor({
  open,
  onOpenChange,
  record,
  siblingNames,
  saving,
  onSave,
}: LdapEditorProps) {
  const createMode = record == null;
  const ro = isReadOnly(record);
  const [form, setForm] = useState<AcLdapConfiguration>(() => structuredClone(record ?? D_LDAP));
  const initial = useRef(JSON.stringify(record ?? D_LDAP));
  const dirty = JSON.stringify(form) !== initial.current;

  const upd = <K extends keyof AcLdapConfiguration>(key: K, value: AcLdapConfiguration[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const urls = Array.isArray(form.ldap_configuration_urls) ? form.ldap_configuration_urls : [];
  const errs = {
    name: uniqueNameError(form.config_name ?? '', siblingNames, record?.config_name),
    urls: urls.length > 0 ? null : 'At least one LDAP connection URL is required',
    admin: (form.administrator_username ?? '').trim() ? null : 'Administrator name is required',
  };
  const valid = noErrors(errs) && !ro;

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={createMode ? 'Add LDAP Configuration' : form.config_name || 'Edit LDAP Configuration'}
      description="Access Control LDAP configuration (/access-control/v1/ldap_configurations)"
      width={780}
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={() => onSave(structuredClone(form), record?.config_name)}
    >
      <div className="max-w-[640px] space-y-6">
        <Section title="Configuration">
          <FieldRow label="LDAP Configuration" htmlFor="acl-name" required error={dirty ? errs.name : null}>
            <Input
              id="acl-name"
              value={form.config_name ?? ''}
              disabled={ro}
              onChange={(e) => upd('config_name', e.target.value)}
              className="max-w-[320px]"
            />
          </FieldRow>
          <FieldRow label="Connection URLs" required error={dirty ? errs.urls : null}>
            <StringUrls
              urls={urls}
              disabled={ro}
              onChange={(next) => upd('ldap_configuration_urls', next)}
            />
          </FieldRow>
        </Section>

        <Section title="Administrator">
          <FieldRow label="Administrator Name" htmlFor="acl-admin" required error={dirty ? errs.admin : null}>
            <Input
              id="acl-admin"
              value={form.administrator_username ?? ''}
              disabled={ro}
              onChange={(e) => upd('administrator_username', e.target.value)}
              className="max-w-[320px]"
            />
          </FieldRow>
          <FieldRow label="Administrator Password" htmlFor="acl-pass">
            <MaskedInput
              id="acl-pass"
              value={form.administrator_password ?? ''}
              disabled={ro}
              onChange={(v) => upd('administrator_password', v)}
              className="max-w-[280px]"
            />
          </FieldRow>
          <FieldRow label="User Authentication Type" htmlFor="acl-authtype">
            <EnumSelect
              id="acl-authtype"
              value={form.user_authentication_type ?? LDAP_AUTH_TYPES[0]}
              options={toOpts(LDAP_AUTH_TYPES)}
              disabled={ro}
              onChange={(v) => upd('user_authentication_type', v)}
              className="w-72"
            />
          </FieldRow>
          <FieldRow label="Keep Domain Name for User Lookup" inline>
            <Switch
              checked={!!form.keep_domain_name_for_user_lookup}
              disabled={ro}
              onCheckedChange={(v) => upd('keep_domain_name_for_user_lookup', v)}
              aria-label="Keep Domain Name for User Lookup"
            />
          </FieldRow>
          <FieldRow label="Use FQDN" inline>
            <Switch
              checked={!!form.use_fqdn}
              disabled={ro}
              onCheckedChange={(v) => upd('use_fqdn', v)}
              aria-label="Use FQDN"
            />
          </FieldRow>
        </Section>

        <Section title="Schema Definition">
          {SCHEMA_FIELDS.map(([key, label]) => (
            <FieldRow key={key} label={label} htmlFor={`acl-${key}`}>
              <Input
                id={`acl-${key}`}
                value={(form[key] as string | null | undefined) ?? ''}
                disabled={ro}
                onChange={(e) => upd(key, e.target.value as AcLdapConfiguration[typeof key])}
                className="max-w-[420px]"
              />
            </FieldRow>
          ))}
        </Section>
      </div>
    </EditorSheet>
  );
}

function StringUrls({
  urls,
  disabled,
  onChange,
}: {
  urls: string[];
  disabled: boolean;
  onChange: (urls: string[]) => void;
}) {
  return (
    <StringListEditor
      values={urls}
      onChange={onChange}
      disabled={disabled}
      placeholder="ldap://server.example.com:389"
      emptyText="No connection URLs."
      validateAdd={(v) => (RE_LDAP_URL.test(v) ? null : 'Enter a valid ldap:// or ldaps:// URL')}
    />
  );
}
