/**
 * RuleEditor: the invert (NOT) switch renders only on an editable criterion
 * whose value is not "Any", and edit:false criteria render static text
 * instead of a select — both straight from the live wire's Blacklist rule.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The _kit barrel pulls in useResourceCrud → services/configure → api.ts,
// whose module-load side effects (localStorage tokens) don't run under vitest.
vi.mock('../../../services/configure', () => ({
  ConfigureApiError: class ConfigureApiError extends Error {},
}));

import { RuleEditor } from './RuleEditor';
import type { AcRule } from '../../../services/configure/accessControlFamilyService';
import type { RuleCriterionKey } from './accessControlModel';

const GROUPS: Record<RuleCriterionKey, string[]> = {
  user_group: ['Staff'],
  end_system_group: ['Blacklist'],
  device_type_group: ['Android'],
  location_group: [],
  time_group: [],
};

function renderEditor(record: AcRule | null) {
  return render(
    <RuleEditor
      open
      onOpenChange={() => {}}
      record={record}
      groupOptions={GROUPS}
      roleOptions={['Quarantine', 'Enterprise User']}
      portalOptions={['Default']}
      siblingNames={[]}
      saving={false}
      onSave={() => {}}
    />
  );
}

describe('RuleEditor invert visibility', () => {
  it('shows the invert switch on an editable criterion whose value is not "Any"', () => {
    renderEditor({
      name: 'Staff rule',
      enabled: true,
      enabled_edit: true,
      user_group: { value: 'Staff', edit: true, invert: false },
      end_system_group: { value: 'Any', edit: true, invert: false },
      device_type_group: { value: 'Any', edit: true, invert: false },
      location_group: { value: 'Any', edit: true, invert: false },
      time_group: { value: 'Any', edit: true, invert: false },
      role: { value: 'Enterprise User', edit: true, invert: null },
      portal: { value: 'Default', edit: true, invert: null },
    });
    expect(screen.getByRole('switch', { name: 'Invert User Group' })).toBeInTheDocument();
    // every other criterion is "Any" → no invert switch
    expect(screen.queryByRole('switch', { name: 'Invert End-System Group' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Invert Time Group' })).toBeNull();
  });

  it('hides the invert switch and the select on an edit:false criterion (live Blacklist rule)', () => {
    renderEditor({
      name: 'Blacklist',
      enabled: true,
      enabled_edit: false,
      user_group: { value: 'Any', edit: false, invert: false },
      end_system_group: { value: 'Blacklist', edit: false, invert: false },
      device_type_group: { value: 'Any', edit: false, invert: false },
      location_group: { value: 'Any', edit: false, invert: false },
      time_group: { value: 'Any', edit: false, invert: false },
      role: { value: 'Quarantine', edit: false, invert: null },
      portal: { value: 'Default', edit: true, invert: null },
    });
    // non-"Any" value, but edit:false → no invert switch and no combobox
    expect(screen.queryByRole('switch', { name: 'Invert End-System Group' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'End-System Group' })).toBeNull();
    // "Blacklist" appears as the sheet title AND as the static criterion value
    expect(screen.getAllByText('Blacklist').length).toBeGreaterThanOrEqual(2);
    // role is edit:false → static text, not a select
    expect(screen.queryByRole('combobox', { name: 'Role' })).toBeNull();
    expect(screen.getByText('Quarantine')).toBeInTheDocument();
    // portal stays editable (edit:true on the wire)
    expect(screen.getByRole('combobox', { name: 'Portal' })).toBeInTheDocument();
    // enabled_edit:false → the Enabled switch is disabled
    expect(screen.getByRole('switch', { name: 'Enabled' })).toBeDisabled();
  });

  it('shows selects (and no invert) for a new rule seeded with "Any" everywhere', () => {
    renderEditor(null);
    expect(screen.getByRole('combobox', { name: 'User Group' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /Invert/ })).toBeNull();
  });
});
