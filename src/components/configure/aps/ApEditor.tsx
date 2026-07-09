/**
 * Per-AP OVERRIDE editor (ap.html + nested templates). Edit-only — registration
 * is NewApModal (gap 4). Identity is read-only except Name (disabled when
 * proxied, gap 21). Tabs: General, Radios, Wired Ports, Meshpoints (when
 * present), UWB (UWB-ELECTION), AFC. Advanced / Professional Install / WLAN
 * override / per-radio Advanced / meshpoint override open as modals. Every
 * advanced field is an OvrRow pair (gap 3). Save PUTs the full record.
 */
import React, { useMemo, useState } from 'react';
import { Input } from '../../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { EditorSheet, FieldRow, ConfirmDialog } from '../_kit';
import { useApDraft } from './useApDraft';
import { useApRefData } from './useApRefData';
import { AP_NAME_RE, RADIO_MODE_LABEL, apBandOf, inRange, hasFeature } from './apHelpers';
import { ApGeneralTab } from './ApGeneralTab';
import { ApRadiosTab } from './ApRadiosTab';
import { ApWiredPortsTab } from './ApWiredPortsTab';
import { ApMeshpointsTab } from './ApMeshpointsTab';
import { ApUwbTab } from './ApUwbTab';
import { ApAfcTab } from './ApAfcTab';
import { ApAdvancedDialog } from './ApAdvancedDialog';
import { ProfInstallDialog } from './ProfInstallDialog';
import { RadioAdvDialog } from './RadioAdvDialog';
import { WlanOvrDialog, type WlanOvrValue } from './WlanOvrDialog';
import { ApMeshOvrDialog } from './ApMeshOvrDialog';
import type { ApDetail, ApMeshpointBinding, ApRadio, DeviceGroup } from '../../../types/configure';

export interface ApEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ApDetail;
  saving: boolean;
  onSubmit: (payload: Partial<ApDetail>, serialNumber: string) => void | Promise<void>;
  onDelete: (ap: ApDetail) => void;
}

export function ApEditor({ open, onOpenChange, initial, saving, onSubmit, onDelete }: ApEditorProps) {
  const { form, upd, replace, dirty } = useApDraft<ApDetail>(initial);
  const refData = useApRefData();
  const [advOpen, setAdvOpen] = useState(false);
  const [profInst, setProfInst] = useState(false);
  const [wlanOvr, setWlanOvr] = useState(false);
  const [radioAdv, setRadioAdv] = useState<number | null>(null);
  const [meshAdv, setMeshAdv] = useState<number | null>(null);
  const [confirmAct, setConfirmAct] = useState<'Locate' | 'Reboot' | 'Delete' | null>(null);
  const [deviceGroupId, setDeviceGroupId] = useState('');

  const locked = !!(form.proxied && form.proxied !== 'Local');
  const radios = useMemo(() => form.radios ?? [], [form.radios]);

  const errs = useMemo(() => {
    const e: Record<string, string> = {};
    if (!String(form.apName ?? '').trim()) e.name = 'Name is required';
    else if (!AP_NAME_RE.test(form.apName)) e.name = 'Name contains invalid characters';
    radios.forEach((r, i) => {
      if (apBandOf(r) === 'Band5' && r.dfsRevert && !r.useSmartRf) {
        if (!inRange(r.dfsRevertHoldTime, 30, 3600)) e[`dfsH${i}`] = 'Valid range 30 to 3600';
        if (!inRange(r.dfsRevertClientAware, 0, 255)) e[`dfsC${i}`] = 'Valid range 0 to 255';
      }
    });
    return e;
  }, [form.apName, radios]);
  const valid = Object.keys(errs).length === 0;

  const site = refData.siteByName(form.hostSite);
  const dg = site?.deviceGroups.find((g) => g.id === deviceGroupId) ?? null;
  const resolvedRfId = dg?.rfMgmtPolicyId ?? form.rfMgmtPolicyId;

  const onDeviceGroupChange = (group: DeviceGroup | null) => {
    setDeviceGroupId(group?.id ?? '');
    if (group) {
      upd('profileId', group.profileId);
      upd('rfMgmtPolicyId', group.rfMgmtPolicyId);
    }
  };

  const applyWlanOvr = (v: WlanOvrValue) => {
    replace({ ...form, ...v } as ApDetail);
    setWlanOvr(false);
  };

  const hasMesh = (form.meshpoints ?? []).length > 0;
  const hasUwb = hasFeature(form.features, 'UWB-ELECTION');

  return (
    <>
      <EditorSheet
        open={open}
        onOpenChange={onOpenChange}
        title={form.apName || 'Access Point'}
        description={`${RADIO_MODE_LABEL[radios[0]?.mode ?? ''] ? '' : ''}${form.hardwareType || form.platformName || ''}`}
        width={840}
        dirty={dirty}
        valid={valid}
        saving={saving}
        onSave={() => void onSubmit(form, form.serialNumber)}
        footerExtra={
          <div className="flex gap-2">
            <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setConfirmAct('Locate')}>
              Locate
            </button>
            <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setConfirmAct('Reboot')}>
              Reboot
            </button>
            {form.canDelete !== false && (
              <button type="button" className="text-sm text-destructive hover:text-destructive/80" onClick={() => setConfirmAct('Delete')}>
                Delete
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldRow label="Name" required error={dirty ? errs.name : undefined}>
              <Input value={form.apName ?? ''} disabled={locked} onChange={(e) => upd('apName', e.target.value)} />
            </FieldRow>
            <FieldRow label="Serial Number">
              <Input readOnly value={form.serialNumber ?? ''} className="bg-muted text-muted-foreground" />
            </FieldRow>
            <FieldRow label="Model">
              <span className="text-sm font-semibold text-primary">
                {form.hardwareType || form.platformName || '—'}
              </span>
            </FieldRow>
          </div>

          <Tabs defaultValue="general">
            <TabsList className="flex-wrap">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="radios">Radios</TabsTrigger>
              <TabsTrigger value="wired">Wired Ports</TabsTrigger>
              {hasMesh && <TabsTrigger value="mesh">Meshpoints</TabsTrigger>}
              {hasUwb && <TabsTrigger value="uwb">UWB</TabsTrigger>}
              <TabsTrigger value="afc">AFC</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="pt-4">
              <ApGeneralTab
                form={form}
                upd={upd}
                refData={refData}
                deviceGroupId={deviceGroupId}
                onDeviceGroupChange={onDeviceGroupChange}
                onOpenWlanOvr={() => setWlanOvr(true)}
                onOpenAdvanced={() => setAdvOpen(true)}
                onOpenProfInstall={() => setProfInst(true)}
              />
            </TabsContent>
            <TabsContent value="radios" className="pt-4">
              <ApRadiosTab
                form={form}
                upd={upd}
                refData={refData}
                resolvedRfId={resolvedRfId}
                errors={errs}
                onOpenRadioAdvanced={setRadioAdv}
              />
            </TabsContent>
            <TabsContent value="wired" className="pt-4">
              <ApWiredPortsTab form={form} upd={upd} />
            </TabsContent>
            {hasMesh && (
              <TabsContent value="mesh" className="pt-4">
                <ApMeshpointsTab form={form} refData={refData} onEditOverrides={setMeshAdv} />
              </TabsContent>
            )}
            {hasUwb && (
              <TabsContent value="uwb" className="pt-4">
                <ApUwbTab form={form} upd={upd} />
              </TabsContent>
            )}
            <TabsContent value="afc" className="pt-4">
              <ApAfcTab form={form} />
            </TabsContent>
          </Tabs>
        </div>
      </EditorSheet>

      {advOpen && (
        <ApAdvancedDialog form={form} open onOpenChange={setAdvOpen} onApply={(v) => { replace(v); setAdvOpen(false); }} />
      )}
      {profInst && (
        <ProfInstallDialog form={form} open onOpenChange={setProfInst} onApply={(v) => { replace(v); setProfInst(false); }} />
      )}
      {wlanOvr && (
        <WlanOvrDialog form={form} services={refData.services} open onOpenChange={setWlanOvr} onApply={applyWlanOvr} />
      )}
      {radioAdv != null && radios[radioAdv] && (
        <RadioAdvDialog
          radio={radios[radioAdv] as ApRadio}
          open
          onOpenChange={() => setRadioAdv(null)}
          onApply={(v) => { upd(`radios.${radioAdv}`, v); setRadioAdv(null); }}
        />
      )}
      {meshAdv != null && (form.meshpoints ?? [])[meshAdv] && (
        <ApMeshOvrDialog
          mp={form.meshpoints[meshAdv] as ApMeshpointBinding}
          features={(form.features as string[]) ?? []}
          open
          onOpenChange={() => setMeshAdv(null)}
          onApply={(v) => { upd(`meshpoints.${meshAdv}`, v); setMeshAdv(null); }}
        />
      )}

      <ConfirmDialog
        open={confirmAct != null}
        onOpenChange={(o) => !o && setConfirmAct(null)}
        title={`${confirmAct ?? ''} Access Point`}
        description={
          confirmAct === 'Locate'
            ? `Blink the identification LEDs on "${form.apName}"?`
            : confirmAct === 'Reboot'
              ? `Reboot "${form.apName}"? Connected clients will be dropped.`
              : `Delete "${form.apName}"? This cannot be undone.`
        }
        confirmLabel={confirmAct ?? 'Confirm'}
        destructive={confirmAct === 'Delete'}
        onConfirm={() => {
          const a = confirmAct;
          setConfirmAct(null);
          if (a === 'Delete') onDelete(form);
        }}
      />
    </>
  );
}
