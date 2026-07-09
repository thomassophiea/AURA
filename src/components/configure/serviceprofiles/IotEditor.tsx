/**
 * IoT Profile editor (BUILD SPEC 1b · add-edit-iot.html). Function (BLE
 * Beacon / BLE Scan / Thread Gateway) x Application → 6 modes with the full
 * reveal cascade, the Thread Gateway whitelist sub-modal, and the generic-scan
 * vendor rows. Works on the flat template model; a live new-shape record is
 * adapted on open and the flat model is emitted on save.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Checkbox } from '../../ui/checkbox';
import { Button } from '../../ui/button';
import { EditorSheet, FieldRow } from '../_kit';
import type {
  EddystoneAdvertisement,
  GenericScan,
  IBeaconAdvertisement,
  IBeaconScan,
  IotProfile,
  ThreadGateway,
} from '../../../types/configure';
import type { NamedRecord } from './profileModel';
import {
  FIRST_APP_OF_FN,
  IOT_APPS_BEACON,
  IOT_APPS_SCAN,
  IOT_FN_OPTS,
  adaptIot,
  fnOfApp,
  toIotPayload,
  validateIot,
} from './iotModel';
import { IotVendorRows } from './IotVendorRows';
import { IotWhitelistModal, type WhitelistEntry } from './IotWhitelistModal';

const numVal = (v: string): number => (v === '' ? NaN : Number(v));
type ScanKey = 'iBeaconScan' | 'eddystoneScan' | 'genericScan';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-md border border-border p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

export interface IotEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: IotProfile | null;
  seed: IotProfile;
  rows: NamedRecord[];
  saving: boolean;
  onSave: (payload: Partial<IotProfile>, id?: string) => void | Promise<void>;
}

export function IotEditor({ open, onOpenChange, record, seed, rows, saving, onSave }: IotEditorProps) {
  const isNew = record == null;
  const ro = record?.canEdit === false;
  const [form, setForm] = useState<IotProfile>(() =>
    record ? adaptIot(record) : structuredClone(seed)
  );
  const initialJson = useRef(JSON.stringify(form));
  const dirty = JSON.stringify(form) !== initialJson.current;

  const [fwdI, setFwdI] = useState((form.iBeaconScan?.destPort ?? 0) > 0);
  const [fwdE, setFwdE] = useState((form.eddystoneScan?.destPort ?? 0) > 0);
  const [vendorEditing, setVendorEditing] = useState(false);
  const [wlOpen, setWlOpen] = useState(false);

  const fn = fnOfApp(form.appId);
  const errs = useMemo(
    () => validateIot(form, rows, { fwdI, fwdE, vendorEditing }),
    [form, rows, fwdI, fwdE, vendorEditing]
  );
  const valid = Object.values(errs).every((e) => !e) && !ro;

  const upd = (patch: Partial<IotProfile>) => setForm((p) => ({ ...p, ...patch }));
  function updSub<K extends keyof IotProfile>(key: K, patch: Partial<NonNullable<IotProfile[K]>>) {
    setForm((p) => ({ ...p, [key]: { ...(p[key] as object), ...patch } }));
  }
  const setFn = (v: string) => upd({ appId: FIRST_APP_OF_FN[v as keyof typeof FIRST_APP_OF_FN] });

  const scanGroups = (root: ScanKey, hasUuid: boolean, fwd: boolean, setFwd?: (v: boolean) => void) => {
    const s = (form[root] ?? {}) as Partial<IBeaconScan>;
    const destShown = !setFwd || fwd;
    return (
      <>
        <Group title={root === 'genericScan' ? 'Scan Parameters' : 'Scan'}>
          <FieldRow label="Scan Interval (ms)" error={errs[`${root}.interval`]} required>
            <Input type="number" disabled={ro} value={Number.isFinite(s.interval) ? s.interval : ''}
              onChange={(e) => updSub(root, { interval: numVal(e.target.value) })} className="max-w-[160px]" />
          </FieldRow>
          <FieldRow label="Scan Window (ms)" error={errs[`${root}.window`]} required>
            <Input type="number" disabled={ro} value={Number.isFinite(s.window) ? s.window : ''}
              onChange={(e) => updSub(root, { window: numVal(e.target.value) })} className="max-w-[160px]" />
          </FieldRow>
        </Group>
        <Group title="Filter">
          {hasUuid && (
            <FieldRow label="UUID" error={errs[`${root}.uuid`]} required>
              <Input disabled={ro} value={(s as IBeaconScan).uuid ?? ''}
                onChange={(e) => updSub(root, { uuid: e.target.value } as Partial<IBeaconScan>)} className="max-w-[340px]" />
            </FieldRow>
          )}
          <FieldRow label="Min RSS (dBm)" error={errs[`${root}.minRSS`]} required>
            <Input type="number" disabled={ro} value={Number.isFinite(s.minRSS) ? s.minRSS : ''}
              onChange={(e) => updSub(root, { minRSS: numVal(e.target.value) })} className="max-w-[160px]" />
          </FieldRow>
          {root === 'genericScan' && (
            <FieldRow label="Vendors">
              <IotVendorRows vendors={(form.genericScan as GenericScan).vendors} readOnly={ro}
                onEditingChange={setVendorEditing}
                onChange={(vendors) => updSub('genericScan', { vendors } as Partial<GenericScan>)} />
            </FieldRow>
          )}
        </Group>
        <Group title="Destination">
          {setFwd && (
            <FieldRow label="Forward to external server" inline>
              <Checkbox checked={fwd} disabled={ro} onCheckedChange={(v) => setFwd(v === true)} aria-label="Forward to external server" />
            </FieldRow>
          )}
          {destShown && (
            <>
              <FieldRow label="Destination IP" error={errs[`${root}.destAddr`]} required>
                <Input disabled={ro} value={s.destAddr ?? ''}
                  onChange={(e) => updSub(root, { destAddr: e.target.value })} className="max-w-[240px]" />
              </FieldRow>
              <FieldRow label="Destination Port" error={errs[`${root}.destPort`]} required>
                <Input type="number" disabled={ro} value={Number.isFinite(s.destPort) ? s.destPort : ''}
                  onChange={(e) => updSub(root, { destPort: numVal(e.target.value) })} className="max-w-[160px]" />
              </FieldRow>
            </>
          )}
        </Group>
      </>
    );
  };

  let modeBody: React.ReactNode = null;
  if (form.appId === 'iBeaconAdvertisement') {
    const b = (form.iBeaconAdvertisement ?? {}) as Partial<IBeaconAdvertisement>;
    modeBody = (
      <>
        <FieldRow label="Advertise Interval (ms)" error={errs['ib.interval']} required>
          <Input type="number" disabled={ro} value={Number.isFinite(b.interval) ? b.interval : ''}
            onChange={(e) => updSub('iBeaconAdvertisement', { interval: numVal(e.target.value) })} className="max-w-[160px]" />
        </FieldRow>
        <FieldRow label="UUID" error={errs['ib.uuid']} required>
          <Input disabled={ro} value={b.uuid ?? ''}
            onChange={(e) => updSub('iBeaconAdvertisement', { uuid: e.target.value })} className="max-w-[340px]" />
        </FieldRow>
        <FieldRow label="Major" error={errs['ib.major']} required>
          <Input type="number" disabled={ro} value={Number.isFinite(b.major) ? b.major : ''}
            onChange={(e) => updSub('iBeaconAdvertisement', { major: numVal(e.target.value) })} className="max-w-[160px]" />
        </FieldRow>
        <FieldRow label="Minor" error={errs['ib.minor']} required>
          <Input type="number" disabled={ro} value={Number.isFinite(b.minor) ? b.minor : ''}
            onChange={(e) => updSub('iBeaconAdvertisement', { minor: numVal(e.target.value) })} className="max-w-[160px]" />
        </FieldRow>
        <FieldRow label="Measured RSSI (dBm)" error={errs['ib.rssi']} required>
          <Input type="number" disabled={ro} value={Number.isFinite(b.measuredRssi) ? b.measuredRssi : ''}
            onChange={(e) => updSub('iBeaconAdvertisement', { measuredRssi: numVal(e.target.value) })} className="max-w-[160px]" />
        </FieldRow>
      </>
    );
  } else if (form.appId === 'eddystoneAdvertisement') {
    const e = (form.eddystoneAdvertisement ?? {}) as Partial<EddystoneAdvertisement>;
    modeBody = (
      <>
        <FieldRow label="URL" error={errs['ed.url']} required>
          <Input disabled={ro} value={e.url ?? ''} placeholder="https://example.com"
            onChange={(ev) => updSub('eddystoneAdvertisement', { url: ev.target.value })} className="max-w-[340px]" />
        </FieldRow>
        <FieldRow label="Advertise Interval (ms)" error={errs['ed.interval']} required>
          <Input type="number" disabled={ro} value={Number.isFinite(e.interval) ? e.interval : ''}
            onChange={(ev) => updSub('eddystoneAdvertisement', { interval: numVal(ev.target.value) })} className="max-w-[160px]" />
        </FieldRow>
        <FieldRow label="Measured RSSI (dBm)" error={errs['ed.rssi']} required>
          <Input type="number" disabled={ro} value={Number.isFinite(e.measuredRssi) ? e.measuredRssi : ''}
            onChange={(ev) => updSub('eddystoneAdvertisement', { measuredRssi: numVal(ev.target.value) })} className="max-w-[160px]" />
        </FieldRow>
      </>
    );
  } else if (form.appId === 'iBeaconScan') modeBody = scanGroups('iBeaconScan', true, fwdI, setFwdI);
  else if (form.appId === 'eddystoneScan') modeBody = scanGroups('eddystoneScan', false, fwdE, setFwdE);
  else if (form.appId === 'genericScan') modeBody = scanGroups('genericScan', false, true);
  else if (form.appId === 'threadGateway') {
    const t = (form.threadGateway ?? {}) as Partial<ThreadGateway>;
    const tField = (label: string, key: keyof ThreadGateway, err: string | null, cls = 'max-w-[260px]') => (
      <FieldRow label={label} error={err} required>
        <Input disabled={ro} value={(t[key] as string) ?? ''}
          onChange={(e) => updSub('threadGateway', { [key]: e.target.value } as Partial<ThreadGateway>)}
          className={cls} />
      </FieldRow>
    );
    modeBody = (
      <>
        {tField('Service Name', 'networkName', errs['tg.name'])}
        <FieldRow label="Channel" error={errs['tg.ch']} required>
          <Input type="number" disabled={ro} value={Number.isFinite(t.channel) ? t.channel : ''}
            onChange={(e) => updSub('threadGateway', { channel: numVal(e.target.value) })} className="max-w-[160px]" />
        </FieldRow>
        {tField('Short PAN ID', 'shortPANId', errs['tg.span'], 'max-w-[160px]')}
        {tField('Extended PAN ID', 'extPANId', errs['tg.xpan'])}
        {tField('Master Key', 'masterKey', errs['tg.key'], 'max-w-[340px]')}
        {tField('Commissioning Credentials', 'commCredentials', errs['tg.cred'])}
        <FieldRow label="Whitelist">
          <Button type="button" variant="outline" onClick={() => setWlOpen(true)}>
            Whitelist ({(t.whiteList ?? []).length})
          </Button>
        </FieldRow>
      </>
    );
  }

  return (
    <>
      <EditorSheet
        open={open}
        onOpenChange={onOpenChange}
        title={isNew ? 'Create IoT Profile' : form.name || 'Edit IoT Profile'}
        description="IoT profile (/v3/iotprofile)"
        width={760}
        dirty={dirty}
        valid={valid}
        saving={saving}
        onSave={() => onSave(toIotPayload(form, fwdI, fwdE), record?.id)}
      >
        <div className="max-w-[640px] space-y-4">
          <FieldRow label="Profile Name" htmlFor="iot-name" error={dirty ? errs.name : null} required>
            <Input id="iot-name" disabled={ro} value={form.name ?? ''}
              onChange={(e) => upd({ name: e.target.value })} className="max-w-[340px]" />
          </FieldRow>
          <FieldRow label="Function" required>
            <Select value={fn} disabled={ro} onValueChange={setFn}>
              <SelectTrigger className="max-w-[240px]" aria-label="Function">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IOT_FN_OPTS.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          {fn !== 'threadGateway' && (
            <FieldRow label="Application" required>
              <Select value={form.appId} disabled={ro} onValueChange={(v) => upd({ appId: v })}>
                <SelectTrigger className="max-w-[240px]" aria-label="Application">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(fn === 'bleBeacon' ? IOT_APPS_BEACON : IOT_APPS_SCAN).map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          )}
          <div className="space-y-4 pt-1">{modeBody}</div>
        </div>
      </EditorSheet>

      {wlOpen && (
        <IotWhitelistModal
          list={((form.threadGateway?.whiteList ?? []) as WhitelistEntry[])}
          readOnly={ro}
          onClose={() => setWlOpen(false)}
          onOk={(rowsWl) => {
            updSub('threadGateway', { whiteList: rowsWl } as Partial<ThreadGateway>);
            setWlOpen(false);
          }}
        />
      )}
    </>
  );
}
