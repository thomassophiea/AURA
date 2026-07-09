/**
 * AP Actions — parameterized modal workflows for the footer Actions menu
 * (ap-actions.tmpl.html + generatecsr / applycertificate / assignApToSite,
 * gaps 18/19). Each action collects its own parameters; on submit the parent
 * shows the confirmation toast. No live controller mutation is performed here.
 */
import React, { useMemo, useState } from 'react';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { FieldRow, MaskedInput } from '../_kit';
import { EditorDialog } from './EditorDialog';
import { ApSelect } from './controls';
import { AP_EVENT_LEVELS, type Opt } from './apHelpers';
import type { SiteConfig } from '../../../types/configure';
import type { ApListRow } from './apsData';

export type ApActionKey = 'adopt' | 'event' | 'image' | 'csr' | 'applycert' | 'assign';

export interface ApActionsModalProps {
  actionKey: ApActionKey;
  label: string;
  selected: ApListRow[];
  sites: SiteConfig[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => void;
}

export function ApActionsModal({
  actionKey,
  label,
  selected,
  sites,
  open,
  onOpenChange,
  onDone,
}: ApActionsModalProps) {
  const [d, setD] = useState({
    enable: true,
    affinity: 'Primary',
    level: 'Errors',
    version: '',
    minimize: true,
    cnType: 'Serial Number',
    keySize: '2048',
    country: '',
    state: '',
    locality: '',
    org: '',
    unit: '',
    email: '',
    file: '',
    password: '',
    siteId: '',
    dgId: '',
  });
  const set = (k: keyof typeof d, v: string | boolean) => setD((p) => ({ ...p, [k]: v }));

  const names =
    selected.map((r) => r.apName || r.serialNumber).slice(0, 3).join(', ') +
    (selected.length > 3 ? `, +${selected.length - 3} more` : '');

  const versions = useMemo<string[]>(
    () =>
      Array.from(new Set(selected.map((r) => r.softwareVersion).filter((v): v is string => !!v))).sort(),
    [selected]
  );
  const site = sites.find((x) => x.id === d.siteId);

  let okLabel = 'OK';
  let okDisabled = false;
  let okMsg = label;
  let body: React.ReactNode = null;

  if (actionKey === 'adopt') {
    okMsg = `Adoption preference set to ${d.enable ? d.affinity : 'inherited'}`;
    body = (
      <>
        <FieldRow label="Override adoption preference" inline>
          <Switch checked={d.enable} onCheckedChange={(v) => set('enable', v)} />
        </FieldRow>
        {d.enable && (
          <FieldRow label="Preferred Connection" inline>
            <ApSelect className="w-40" value={d.affinity} options={['Primary', 'Backup']} onChange={(v) => set('affinity', v)} />
          </FieldRow>
        )}
      </>
    );
  } else if (actionKey === 'event') {
    okMsg = 'Event level updated';
    body = (
      <>
        <FieldRow label="Override event level" inline>
          <Switch checked={d.enable} onCheckedChange={(v) => set('enable', v)} />
        </FieldRow>
        {d.enable && (
          <FieldRow label="Event Level" inline>
            <ApSelect className="w-40" value={d.level} options={AP_EVENT_LEVELS} onChange={(v) => set('level', v)} />
          </FieldRow>
        )}
      </>
    );
  } else if (actionKey === 'image') {
    okDisabled = !d.version;
    okMsg = `Upgrade to ${d.version || '?'} scheduled`;
    const opts: Opt[] = [{ id: '', label: '— Select —' }, ...versions.map((v) => ({ id: v, label: v }))];
    body = (
      <>
        <FieldRow label="Upgrade To Version" inline>
          <ApSelect className="w-56" value={d.version} options={opts} onChange={(v) => set('version', v)} />
        </FieldRow>
        <FieldRow label="Minimize service impact" inline>
          <Switch checked={d.minimize} onCheckedChange={(v) => set('minimize', v)} />
        </FieldRow>
      </>
    );
  } else if (actionKey === 'csr') {
    okLabel = 'Generate';
    okMsg = 'Certificate signing request generated';
    body = (
      <>
        <FieldRow label="Common Name" inline>
          <ApSelect className="w-44" value={d.cnType} options={['AP Name', 'Serial Number', 'Custom']} onChange={(v) => set('cnType', v)} />
        </FieldRow>
        <FieldRow label="Key Size" inline>
          <ApSelect className="w-32" value={d.keySize} options={['1024', '2048', '4096']} onChange={(v) => set('keySize', v)} />
        </FieldRow>
        {(
          [
            ['country', 'Country'],
            ['state', 'State'],
            ['locality', 'Location'],
            ['org', 'Organization'],
            ['unit', 'Organizational Unit'],
            ['email', 'Email'],
          ] as const
        ).map(([k, lbl]) => (
          <FieldRow key={k} label={lbl}>
            <Input className="w-60" value={d[k]} onChange={(e) => set(k, e.target.value)} />
          </FieldRow>
        ))}
      </>
    );
  } else if (actionKey === 'applycert') {
    okLabel = 'Apply';
    okDisabled = !d.file;
    okMsg = 'Certificate applied';
    body = (
      <>
        <FieldRow label="Certificate File">
          <Input
            type="file"
            onChange={(e) => set('file', e.target.files?.[0]?.name ?? 'certificate')}
          />
        </FieldRow>
        <FieldRow label="Password">
          <MaskedInput className="w-56" value={d.password} onChange={(v) => set('password', v)} />
        </FieldRow>
      </>
    );
  } else {
    okDisabled = !d.siteId || !d.dgId;
    okMsg = `Assigned to ${site?.siteName ?? 'site'}`;
    const siteOpts: Opt[] = [{ id: '', label: '— Select —' }, ...sites.map((x) => ({ id: x.id ?? '', label: x.siteName }))];
    const dgOpts: Opt[] = [
      { id: '', label: d.siteId ? '— Select —' : 'Select a site first' },
      ...((site?.deviceGroups ?? []).map((g) => ({ id: g.id, label: g.groupName }))),
    ];
    body = (
      <>
        <FieldRow label="Site" inline>
          <ApSelect
            className="w-60"
            value={d.siteId}
            options={siteOpts}
            onChange={(v) => {
              set('siteId', v);
              set('dgId', '');
            }}
          />
        </FieldRow>
        <FieldRow label="Device Group" inline>
          <ApSelect className="w-60" value={d.dgId} options={dgOpts} onChange={(v) => set('dgId', v)} />
        </FieldRow>
      </>
    );
  }

  return (
    <EditorDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${label} (${selected.length} selected)`}
      maxWidth={580}
      okLabel={okLabel}
      okDisabled={okDisabled}
      onOk={() => onDone(`${okMsg} — ${selected.length} AP${selected.length === 1 ? '' : 's'}: ${names}`)}
    >
      <p className="text-sm text-muted-foreground">{names}</p>
      {body}
    </EditorDialog>
  );
}
