/**
 * WLAN editor - Roles / VLAN tab with the controller's gating: the
 * unauthenticated role appears (and is required) only when MBA is on with no
 * captive portal; Default VLAN is gated on an authenticated role being set.
 */
import React from 'react';
import { Switch } from '../../ui/switch';
import { FieldRow, Section } from '../_kit';
import {
  RefSelect,
  cosOptions,
  patchRecord,
  toOptions,
  topologyOptions,
  type WlanTabProps,
} from './wlanControls';

export function WlanRolesVlanTab({ form, setForm, errors, refs }: WlanTabProps) {
  const { record } = form;
  const patch = patchRecord(setForm);
  const showUnauthRole = !record.enableCaptivePortal && record.mbaAuthorization;

  return (
    <div className="space-y-6">
      <Section title="Default Roles">
        <FieldRow label="Authenticated Default Role">
          <RefSelect
            value={record.authenticatedUserDefaultRoleID}
            options={toOptions(refs.roles)}
            onChange={(v) => patch({ authenticatedUserDefaultRoleID: v })}
          />
        </FieldRow>
        {showUnauthRole && (
          <FieldRow
            label="Unauthenticated Default Role"
            required
            error={errors.unauthenticatedRole}
            description="Required while MBA is enabled without a captive portal."
          >
            <RefSelect
              value={record.unAuthenticatedUserDefaultRoleID}
              options={toOptions(refs.roles)}
              onChange={(v) => patch({ unAuthenticatedUserDefaultRoleID: v })}
            />
          </FieldRow>
        )}
      </Section>

      <Section title="Topology and Class of Service">
        {record.authenticatedUserDefaultRoleID && (
          <FieldRow label="Default VLAN">
            <RefSelect
              value={record.defaultTopology}
              options={topologyOptions(refs.topologies)}
              onChange={(v) => patch({ defaultTopology: v })}
            />
          </FieldRow>
        )}
        {!record.authenticatedUserDefaultRoleID && (
          <p className="text-sm text-muted-foreground">
            Select an Authenticated Default Role to choose a Default VLAN.
          </p>
        )}
        <FieldRow label="Default Class of Service">
          <RefSelect
            value={record.defaultCoS}
            options={cosOptions(refs.cos)}
            onChange={(v) => patch({ defaultCoS: v })}
          />
        </FieldRow>
        <FieldRow label="Client to Client Communication" inline>
          <Switch
            checked={record.clientToClientCommunication}
            onCheckedChange={(v) => patch({ clientToClientCommunication: v })}
          />
        </FieldRow>
      </Section>
    </div>
  );
}
