/**
 * Pure model layer for the Access Control family. Enum values, defaults,
 * validation ranges and reveal conditions are copied VERBATIM from the EPB-125
 * golden reference (golden-eds-strict-ascend/config-accesscontrol.js), which
 * mirrors a VE6120 on 10.20.01.0024 — its Angular templates, GroupNacTypes /
 * utils/enums bundles and live GET /access-control/v1/*. Do not "clean up"
 * ids — the gateway round-trips these strings.
 */
import type {
  AcGroup,
  AcGroupEntry,
  AcRadiusServer,
  AcRule,
  AcRuleCriterion,
} from '../../../services/configure/accessControlFamilyService';

export interface Opt {
  id: string;
  label: string;
}

/* ─────────────────────────── validation primitives ─────────────────────────── */

export const RE_IPV4 =
  /^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}$/;
export const RE_MAC = /^([0-9A-Fa-f]{2}:){5}([0-9A-Fa-f]{2})$/;
export const RE_OUI = /^([0-9A-Fa-f]{2}:){2}([0-9A-Fa-f]{2})$/;
export const RE_LDAP_URL = /^ldaps?:\/\/\S+$/i;

export const isInt = (v: unknown): boolean =>
  v !== '' && v != null && Number.isInteger(Number(v));

export const intIn = (v: unknown, lo: number, hi: number): boolean =>
  isInt(v) && Number(v) >= lo && Number(v) <= hi;

export type ErrorMap = Record<string, string | null | undefined>;

/** True when every value in the error map is falsy. */
export const noErrors = (errs: ErrorMap): boolean => Object.values(errs).every((e) => !e);

/* ─────────────────── controller enums — verbatim, with source ─────────────────── */

// GroupNacTypes.groupTypes — value doubles as the display text on the Gateway
export const GROUP_TYPES: Array<Opt & { cat: string }> = [
  { id: 'End System - MAC', label: 'End System - MAC', cat: 'End-System Group' },
  { id: 'End System - Hostname', label: 'End System - Hostname', cat: 'End-System Group' },
  { id: 'End System - IP', label: 'End System - IP', cat: 'End-System Group' },
  { id: 'User - LDAP User Group', label: 'User - LDAP User Group', cat: 'User Group' },
  { id: 'User - RADIUS User Group', label: 'User - RADIUS User Group', cat: 'User Group' },
  { id: 'User - Username', label: 'User - Username', cat: 'User Group' },
  { id: 'Device Type', label: 'Device Type', cat: 'Device Type Group' },
];

export const GROUP_MODES: Opt[] = [
  { id: 'MATCH_ANY', label: 'Match Any' },
  { id: 'EXISTS', label: 'Exists' },
  { id: 'MATCH_ALL', label: 'Match All' },
];

export const MAC_TYPES: Opt[] = [
  { id: 'MACADDR', label: 'MAC Address' },
  { id: 'MACMASK', label: 'MAC Mask' },
  { id: 'MACOUI', label: 'MAC OUI' },
];

// aaa_radius_servers.html ng-options (inline literal)
export const USERNAME_FORMATS = ['Keep Domain Name', 'Strip Domain Name'];
// aaa_ldap_configs.html ng-options (inline literal)
export const LDAP_AUTH_TYPES = [
  'NTLM Authentication',
  'LDAP Bind',
  'Plain Text Password Lookup',
  'NTHash Password Lookup',
];
// aaa_local_password_repo.html ng-options (inline literal)
export const HASH_TYPES = ['PKCS5 Reversible Hash', 'SHA1 Non-Reversible Hash'];

/* GroupNacTypes.groupDeviceTypes — the Gateway ships ~90 entries; the families
   its own predefined groups use are offered here and any value already on a
   record is preserved, so nothing captured is lost. */
export const DEVICE_TYPES = [
  'Windows', 'Windows 10', 'Windows 8.1', 'Windows 8', 'Windows 7', 'Windows Vista',
  'Windows XP', 'Windows Server 2008 R2', 'Windows Server 2008', 'Windows Server 2003',
  'Windows Mobile', 'Linux', 'Ubuntu', 'Fedora', 'Red Hat', 'SUSE', 'Debian', 'Mac',
  'Mac OS X 10.7+', 'Macintosh', 'Apple iOS', 'iPad', 'iPhone', 'iPod', 'ATV', 'Android',
  'Samsung Galaxy', 'Chrome OS', 'BlackBerry', 'BB10', 'BlackBerry Playbook',
  'Amazon Kindle Fire', 'Nook', 'Game Console',
];

export const toOpts = (values: string[]): Opt[] => values.map((v) => ({ id: v, label: v }));

/* the five rule criteria groups, in the Gateway's own order (rule.html formGroup) */
export const RULE_CRITERIA: Array<{ id: RuleCriterionKey; label: string; category: string }> = [
  { id: 'user_group', label: 'User Group', category: 'User Group' },
  { id: 'end_system_group', label: 'End-System Group', category: 'End-System Group' },
  { id: 'device_type_group', label: 'Device Type Group', category: 'Device Type Group' },
  { id: 'location_group', label: 'Location Group', category: 'Location Group' },
  { id: 'time_group', label: 'Time Group', category: 'Time Group' },
];

export type RuleCriterionKey =
  | 'user_group'
  | 'end_system_group'
  | 'device_type_group'
  | 'location_group'
  | 'time_group';

/* ──────────────── controller-shaped defaults for Add (no /default API) ──────────────── */

export const D_RADIUS: AcRadiusServer = {
  server_ip: '', shared_secret: '', response_window: 1, authentication_timeout: 5,
  authentication_retry_count: 3, authorization_client_port: 1812, accounting_client_port: 1813,
  proxy_radius_accounting_requests: false, require_message_authenticator: false,
  username_format: 'Keep Domain Name', use_server_status_request: false, use_access_request: false,
  username: '', password: '', check_interval: 60, number_of_answers_to_alive: 3,
  revive_interval: 60,
};

export const D_LDAP = {
  config_name: '', ldap_configuration_urls: [] as string[], administrator_username: '',
  administrator_password: '', user_authentication_type: 'NTLM Authentication',
  keep_domain_name_for_user_lookup: false, use_fqdn: false, user_search_root: '',
  host_search_root: '', ou_search_root: '', user_object_class: '', user_search_attribute: '',
  user_password_attribute: '', host_object_class: '', host_search_attribute: '',
  ou_object_classes: '',
};

export const D_REPO_USER = {
  username: '', display_name: '', first_name: '', last_name: '', password: '',
  password_hash_type: 'PKCS5 Reversible Hash', description: '', enabled: true,
};

export const D_GROUP: AcGroup = {
  name: '', description: '', type: 'End System - MAC', type_category: 'End-System Group',
  mode: 'MATCH_ANY', is_registration: false, is_readonly: false, entries: [],
};

export const D_CERT = {
  name: '', subject: '', issuer: '', valid_from: '', valid_to: '', crl_urls: [] as string[],
};

export const D_RULE: AcRule = {
  name: '', enabled: true, enabled_edit: true,
  user_group: { value: 'Any', edit: true, invert: false },
  end_system_group: { value: 'Any', edit: true, invert: false },
  device_type_group: { value: 'Any', edit: true, invert: false },
  location_group: { value: 'Any', edit: true, invert: false },
  time_group: { value: 'Any', edit: true, invert: false },
  role: { value: '', edit: true, invert: null },
  portal: { value: '', edit: true, invert: null },
};

/* ─────────────────────────── group entry specs ─────────────────────────── */

export type EntryColKind = 'txt' | 'sel';

export interface EntryColSpec {
  field: string;
  label: string;
  kind: EntryColKind;
  options?: Opt[];
}

export interface EntrySpec {
  /** Wire key inside each entries[] object (inactive kinds are null). */
  key: keyof AcGroupEntry;
  cols: EntryColSpec[];
}

const descCol: EntryColSpec = { field: 'entry_description', label: 'Description', kind: 'txt' };

/** group.html: the type-specific entry table, per GroupNacTypes. */
export const ENTRY_SPEC: Record<string, EntrySpec> = {
  'End System - MAC': {
    key: 'mac_group_entry',
    cols: [
      { field: 'type', label: 'Type', kind: 'sel', options: MAC_TYPES },
      { field: 'mac_addr', label: 'MAC / OUI / Mask', kind: 'txt' },
      descCol,
    ],
  },
  'End System - Hostname': {
    key: 'hostname_group_entry',
    cols: [{ field: 'hostname', label: 'Hostname', kind: 'txt' }, descCol],
  },
  'End System - IP': {
    key: 'ip_group_entry',
    cols: [
      { field: 'ip_addr', label: 'IP Address', kind: 'txt' },
      { field: 'mask', label: 'Mask', kind: 'txt' },
      descCol,
    ],
  },
  'User - LDAP User Group': {
    key: 'ldap_user_group_entry',
    cols: [
      { field: 'attribute_name', label: 'Attribute Name', kind: 'txt' },
      { field: 'attribute_value', label: 'Attribute Value', kind: 'txt' },
      descCol,
    ],
  },
  'User - RADIUS User Group': {
    key: 'radius_user_group_entry',
    cols: [
      { field: 'attribute_name', label: 'Attribute Name', kind: 'txt' },
      { field: 'attribute_value', label: 'Attribute Value', kind: 'txt' },
      descCol,
    ],
  },
  'User - Username': {
    key: 'username_group_entry',
    cols: [{ field: 'username', label: 'Username', kind: 'txt' }, descCol],
  },
  'Device Type': {
    key: 'device_group_entry',
    cols: [
      { field: 'device_type', label: 'Device Type', kind: 'sel', options: toOpts(DEVICE_TYPES) },
      descCol,
    ],
  },
};

export function entrySpecFor(type: string | null | undefined): EntrySpec {
  return ENTRY_SPEC[type ?? ''] ?? ENTRY_SPEC['End System - MAC'];
}

/** Blank entry seeded with each column's first select option / empty string. */
export function blankEntry(spec: EntrySpec): AcGroupEntry {
  const value: Record<string, unknown> = {};
  for (const col of spec.cols) {
    value[col.field] = col.kind === 'sel' && col.options?.length ? col.options[0].id : '';
  }
  return { [spec.key]: value } as AcGroupEntry;
}

/**
 * Group Type is create-only on the gateway (group.html renders the select only
 * in createMode). Changing it re-derives type_category and CLEARS the entries,
 * because every entry is shaped by the type-specific spec.
 */
export function changeGroupType(form: AcGroup, newType: string): AcGroup {
  const t = GROUP_TYPES.find((x) => x.id === newType);
  return { ...form, type: newType, type_category: t ? t.cat : '', entries: [] };
}

/* ─────────────────────────── rule criterion logic ─────────────────────────── */

/** A criterion the gateway lets this rule change (`edit` !== false). */
export function criterionEditable(criterion: AcRuleCriterion | null | undefined): boolean {
  return criterion?.edit !== false;
}

/**
 * rule.html: the NOT/invert switch is offered ONLY on an editable criterion
 * whose value is not "Any".
 */
export function showInvert(criterion: AcRuleCriterion | null | undefined): boolean {
  if (!criterion) return false;
  return criterionEditable(criterion) && criterion.value !== 'Any';
}

/** Grid cell text: em-dash for empty values (golden list formatter `dash`). */
export const dashText = (v: unknown): string => (v == null || v === '' ? '—' : String(v));

/** Grid cell text: Yes/No for booleans, em-dash otherwise (golden `yn`). */
export const yesNo = (v: unknown): string => (v === true ? 'Yes' : v === false ? 'No' : '—');

/** List text for a criterion cell: NOT prefix + value (— when unset). */
export function criterionText(criterion: AcRuleCriterion | null | undefined): string {
  if (!criterion) return '—';
  const value = criterion.value == null || criterion.value === '' ? '—' : criterion.value;
  return (criterion.invert ? 'NOT ' : '') + value;
}

/* ─────────────────────────── per-editor validation ─────────────────────────── */

const str = (v: unknown): string => (v == null ? '' : String(v));

/** aaa_radius_servers.html ranges; response_window is validated in EDIT mode only. */
export function radiusErrors(form: AcRadiusServer, createMode: boolean): ErrorMap {
  const errs: ErrorMap = {
    server_ip: RE_IPV4.test(str(form.server_ip)) ? null : 'Enter a valid IPv4 address',
    shared_secret:
      str(form.shared_secret).length >= 6 ? null : 'Shared secret must be at least 6 characters',
    authentication_timeout: intIn(form.authentication_timeout, 1, 60) ? null : 'Valid range 1 to 60',
    authentication_retry_count:
      intIn(form.authentication_retry_count, 0, 10) ? null : 'Valid range 0 to 10',
    authorization_client_port:
      intIn(form.authorization_client_port, 1, 65535) ? null : 'Valid range 1 to 65535',
    accounting_client_port:
      intIn(form.accounting_client_port, 1, 65535) ? null : 'Valid range 1 to 65535',
  };
  if (!createMode) {
    errs.response_window = intIn(form.response_window, 1, 60) ? null : 'Valid range 1 to 60';
  }
  if (form.use_server_status_request || form.use_access_request) {
    errs.check_interval = intIn(form.check_interval, 1, 3600) ? null : 'Valid range 1 to 3600';
    errs.number_of_answers_to_alive =
      intIn(form.number_of_answers_to_alive, 1, 10) ? null : 'Valid range 1 to 10';
    errs.revive_interval = intIn(form.revive_interval, 1, 3600) ? null : 'Valid range 1 to 3600';
  }
  return errs;
}

/** Required + unique (case-insensitive) name against sibling records. */
export function uniqueNameError(
  value: string,
  siblings: string[],
  originalName?: string | null
): string | null {
  const name = value.trim();
  if (!name) return 'Name is required';
  const dup = siblings.some(
    (s) => s.toLowerCase() === name.toLowerCase() && s !== (originalName ?? '')
  );
  return dup ? 'That name is already in use' : null;
}

/** MAC entries are validated by shape per the gateway's MACADDR/MACOUI types. */
export function groupEntryErrors(spec: EntrySpec, entries: AcGroupEntry[]): ErrorMap {
  const errs: ErrorMap = {};
  entries.forEach((entry, i) => {
    const value = (entry[spec.key] ?? {}) as Record<string, unknown>;
    if (spec.key === 'mac_group_entry') {
      const type = str(value.type) || 'MACADDR';
      const mac = str(value.mac_addr);
      if (type === 'MACADDR' && !RE_MAC.test(mac)) {
        errs[`e${i}`] = `Row ${i + 1}: enter a full MAC address`;
      }
      if (type === 'MACOUI' && !RE_OUI.test(mac)) {
        errs[`e${i}`] = `Row ${i + 1}: enter a 3-octet OUI`;
      }
    }
    if (spec.key === 'ip_group_entry' && value.ip_addr && !RE_IPV4.test(str(value.ip_addr))) {
      errs[`e${i}`] = `Row ${i + 1}: enter a valid IPv4 address`;
    }
  });
  return errs;
}

/** Predefined/readonly records get read-only editors. */
export function isReadOnly(record: object | null | undefined): boolean {
  if (!record) return false;
  const r = record as { is_readonly?: boolean; canEdit?: boolean | null };
  return r.is_readonly === true || r.canEdit === false;
}
