/**
 * AP editor > General tab. Identity is read-only/derived; site membership is a
 * Site -> Device Group cascade (gap 22) with Profile / RF Management resolved
 * as read-only links from the chosen device group. Environment is hidden for
 * WiFi7 APs (configured in Professional Install, gap 27). WLAN assignment is an
 * override (radioIfListOvr) opening the matrix modal (gap 14).
 */
import React from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { FieldRow, OvrRow } from '../_kit';
import { ApSelect } from './controls';
import { hasFeature } from './apHelpers';
import type { ApDetail, DeviceGroup } from '../../../types/configure';
import type { ApRefData } from './useApRefData';

export interface ApGeneralTabProps {
  form: ApDetail;
  upd: (path: string, value: unknown) => void;
  refData: ApRefData;
  nameError?: string;
  deviceGroupId: string;
  onDeviceGroupChange: (dg: DeviceGroup | null) => void;
  onOpenWlanOvr: () => void;
  onOpenAdvanced: () => void;
  onOpenProfInstall: () => void;
}

const RO = 'w-72 bg-muted text-muted-foreground';

export function ApGeneralTab({
  form,
  upd,
  refData,
  deviceGroupId,
  onDeviceGroupChange,
  onOpenWlanOvr,
  onOpenAdvanced,
  onOpenProfInstall,
}: ApGeneralTabProps) {
  const site = refData.siteByName(form.hostSite);
  const deviceGroups = site?.deviceGroups ?? [];
  const dg = deviceGroups.find((g) => g.id === deviceGroupId) ?? null;
  const resolvedProfileId = dg?.profileId ?? form.profileId;
  const resolvedRfId = dg?.rfMgmtPolicyId ?? form.rfMgmtPolicyId;

  return (
    <div className="space-y-4">
      {form.hostname && (
        <FieldRow label="Host Name">
          <Input readOnly value={form.hostname} className={RO} />
        </FieldRow>
      )}
      <FieldRow label="Description">
        <Input value={form.description ?? ''} className="w-72" onChange={(e) => upd('description', e.target.value)} />
      </FieldRow>
      <FieldRow label="IP Address">
        <Input readOnly value={form.ipAddress ?? ''} className={RO} />
      </FieldRow>
      <FieldRow label="Software Version">
        <Input readOnly value={form.softwareVersion ?? ''} className={RO} />
      </FieldRow>

      <FieldRow label="Site">
        <ApSelect
          className="w-72"
          value={form.hostSite ?? ''}
          options={['', ...refData.sites.map((s) => s.siteName)]}
          onChange={(v) => {
            upd('hostSite', v);
            onDeviceGroupChange(null);
          }}
        />
      </FieldRow>
      <FieldRow label="Device Group">
        <ApSelect
          className="w-72"
          value={dg?.id ?? ''}
          placeholder={form.hostSite ? 'Select...' : 'Select a site first'}
          options={[{ id: '', label: '— Select —' }, ...deviceGroups.map((g) => ({ id: g.id, label: g.groupName }))]}
          onChange={(v) => onDeviceGroupChange(deviceGroups.find((g) => g.id === v) ?? null)}
        />
      </FieldRow>
      <FieldRow label="Profile">
        <span className="text-sm text-primary">{refData.profileName(resolvedProfileId)}</span>
      </FieldRow>
      <FieldRow label="RF Management">
        <span className="text-sm text-primary">{refData.rfPolicyName(resolvedRfId)}</span>
      </FieldRow>

      {!hasFeature(form.features, 'WIFI7') && (
        <FieldRow label="Environment">
          <ApSelect className="w-52" value={form.environment || 'indoor'} options={['indoor', 'outdoor']} onChange={(v) => upd('environment', v)} />
        </FieldRow>
      )}

      <OvrRow
        label="WLAN Assignment Override"
        overridden={!!form.radioIfListOvr}
        onOverriddenChange={(v) => upd('radioIfListOvr', v)}
        inheritedDisplay="WLAN assignment inherited from device group"
      >
        <Button type="button" variant="outline" size="sm" onClick={onOpenWlanOvr}>
          Edit WLAN Overrides
        </Button>
      </OvrRow>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onOpenAdvanced}>
          Advanced
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onOpenProfInstall}>
          Professional Install
        </Button>
      </div>
    </div>
  );
}
