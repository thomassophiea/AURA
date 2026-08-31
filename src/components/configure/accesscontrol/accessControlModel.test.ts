/**
 * Access Control model: rule-criteria invert visibility (rule.html), group
 * type-change-clears-entries (group.html createMode), and the golden
 * validation ranges.
 */
import { describe, expect, it } from 'vitest';
import {
  D_GROUP,
  D_RADIUS,
  ENTRY_SPEC,
  blankEntry,
  changeGroupType,
  criterionText,
  entrySpecFor,
  groupEntryErrors,
  isReadOnly,
  noErrors,
  radiusErrors,
  showInvert,
  uniqueNameError,
} from './accessControlModel';

describe('showInvert (rule.html NOT switch)', () => {
  it('renders only on an editable criterion whose value is not "Any"', () => {
    expect(showInvert({ value: 'Blacklist', edit: true, invert: false })).toBe(true);
  });

  it('hides when the criterion value is "Any"', () => {
    expect(showInvert({ value: 'Any', edit: true, invert: false })).toBe(false);
  });

  it('hides when the Gateway marks the criterion non-editable (edit:false)', () => {
    // Live wire truth: the Blacklist rule's end_system_group is edit:false.
    expect(showInvert({ value: 'Blacklist', edit: false, invert: false })).toBe(false);
  });

  it('treats a missing edit flag as editable (edit !== false)', () => {
    expect(showInvert({ value: 'Staff', edit: undefined as unknown as boolean, invert: false })).toBe(
      true
    );
  });

  it('hides for an absent criterion', () => {
    expect(showInvert(null)).toBe(false);
    expect(showInvert(undefined)).toBe(false);
  });
});

describe('criterionText (rules list cells)', () => {
  it('prefixes NOT for inverted criteria and dashes empty values', () => {
    expect(criterionText({ value: 'Staff', edit: true, invert: true })).toBe('NOT Staff');
    expect(criterionText({ value: 'Any', edit: false, invert: false })).toBe('Any');
    expect(criterionText({ value: '', edit: true, invert: false })).toBe('—');
    expect(criterionText(undefined)).toBe('—');
  });
});

describe('changeGroupType (create-only Group Type select)', () => {
  it('clears entries and re-derives type_category', () => {
    const form = {
      ...D_GROUP,
      type: 'End System - MAC',
      type_category: 'End-System Group',
      entries: [blankEntry(ENTRY_SPEC['End System - MAC'])],
    };
    const next = changeGroupType(form, 'Device Type');
    expect(next.type).toBe('Device Type');
    expect(next.type_category).toBe('Device Type Group');
    expect(next.entries).toEqual([]);
    // the original form is not mutated
    expect(form.entries).toHaveLength(1);
  });

  it('maps every golden type to its category', () => {
    expect(changeGroupType(D_GROUP, 'User - LDAP User Group').type_category).toBe('User Group');
    expect(changeGroupType(D_GROUP, 'End System - IP').type_category).toBe('End-System Group');
  });
});

describe('entry specs', () => {
  it('seeds blank entries with the first select option / empty strings', () => {
    const mac = blankEntry(ENTRY_SPEC['End System - MAC']);
    expect(mac.mac_group_entry).toEqual({ type: 'MACADDR', mac_addr: '', entry_description: '' });
    const device = blankEntry(ENTRY_SPEC['Device Type']);
    expect((device.device_group_entry as { device_type: string }).device_type).toBe('Windows');
  });

  it('falls back to the MAC spec for unknown types', () => {
    expect(entrySpecFor('Location').key).toBe('mac_group_entry');
  });

  it('validates MAC / OUI shapes and IPv4 entries', () => {
    const spec = ENTRY_SPEC['End System - MAC'];
    const bad = groupEntryErrors(spec, [
      { mac_group_entry: { type: 'MACADDR', mac_addr: 'not-a-mac' } },
      { mac_group_entry: { type: 'MACOUI', mac_addr: 'AA:BB:CC' } },
    ]);
    expect(bad.e0).toMatch(/full MAC address/);
    expect(bad.e1).toBeUndefined();

    const ipSpec = ENTRY_SPEC['End System - IP'];
    const ipErrs = groupEntryErrors(ipSpec, [{ ip_group_entry: { ip_addr: '999.1.1.1' } }]);
    expect(ipErrs.e0).toMatch(/valid IPv4/);
  });
});

describe('radiusErrors (aaa_radius_servers.html ranges)', () => {
  it('accepts the controller-shaped default record once identity is filled', () => {
    const errs = radiusErrors(
      { ...D_RADIUS, server_ip: '10.0.0.1', shared_secret: 'secret1' },
      true
    );
    expect(noErrors(errs)).toBe(true);
  });

  it('validates response_window in EDIT mode only (ng-show="!createMode")', () => {
    const record = { ...D_RADIUS, server_ip: '10.0.0.1', shared_secret: 'secret1', response_window: 0 };
    expect(radiusErrors(record, true).response_window).toBeUndefined();
    expect(radiusErrors(record, false).response_window).toBe('Valid range 1 to 60');
  });

  it('validates the health-check trio only when a health check is enabled', () => {
    const base = { ...D_RADIUS, server_ip: '10.0.0.1', shared_secret: 'secret1', check_interval: 0 };
    expect(radiusErrors(base, true).check_interval).toBeUndefined();
    expect(
      radiusErrors({ ...base, use_server_status_request: true }, true).check_interval
    ).toBe('Valid range 1 to 3600');
  });

  it('enforces secret length and port/retry ranges', () => {
    const errs = radiusErrors(
      {
        ...D_RADIUS,
        server_ip: 'nope',
        shared_secret: 'abc',
        authentication_retry_count: 11,
        authorization_client_port: 0,
      },
      true
    );
    expect(errs.server_ip).toMatch(/IPv4/);
    expect(errs.shared_secret).toMatch(/at least 6/);
    expect(errs.authentication_retry_count).toBe('Valid range 0 to 10');
    expect(errs.authorization_client_port).toBe('Valid range 1 to 65535');
  });
});

describe('uniqueNameError / isReadOnly', () => {
  it('requires a name and rejects case-insensitive duplicates', () => {
    expect(uniqueNameError('', [])).toBe('Name is required');
    expect(uniqueNameError('staff', ['Staff'])).toMatch(/already in use/);
    expect(uniqueNameError('Staff', ['Staff'], 'Staff')).toBeNull();
  });

  it('treats predefined (is_readonly) and canEdit:false records as read-only', () => {
    expect(isReadOnly({ is_readonly: true })).toBe(true);
    expect(isReadOnly({ canEdit: false })).toBe(true);
    expect(isReadOnly({ is_readonly: false })).toBe(false);
    expect(isReadOnly(null)).toBe(false);
  });
});
