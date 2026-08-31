/**
 * IOT-MULTI-APP editor body (add-edit-multi-profile.html, Gateway 10.20).
 * No Function/Application pair: each application is its own toggle so several
 * run at once, each beacon application carries a Tx Power select (20 steps,
 * 3 dBm to -16 dBm) driving a READ-ONLY derived Measured RSSI, one Scan
 * Interval and one Destination (Real-Time Monitoring UDP vs Batch Reporting
 * URL) are shared across the scan applications, and BLE Data selects the
 * reporting granularity (Latest Only / All Records).
 */
import React from 'react';
import { Checkbox } from '../../ui/checkbox';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { FieldRow } from '../_kit';
import type { IBeaconAdvertisement, IotProfile } from '../../../types/configure';
import {
  IOT_BLE_DATA,
  IOT_MULTI_APPS,
  IOT_SCAN_APP_IDS,
  IOT_TX_POWER,
  iotMeasuredRssi,
} from './iotModel';

const numVal = (v: string): number => (v === '' ? NaN : Number(v));

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

export type IotMultiApp = (typeof IOT_MULTI_APPS)[number];

export interface IotMultiAppBodyProps {
  form: IotProfile;
  errs: Record<string, string | null>;
  readOnly: boolean;
  /** Applications available on this deployment (per-app feature gates). */
  availApps: readonly IotMultiApp[];
  upd: (patch: Partial<IotProfile>) => void;
  updSub: (key: keyof IotProfile, patch: Record<string, unknown>) => void;
  toggleApp: (id: string) => void;
  /** Generic-scan vendor rows, rendered by the parent (owns edit state). */
  vendorRows: React.ReactNode;
}

export function IotMultiAppBody({
  form,
  errs,
  readOnly: ro,
  availApps,
  upd,
  updSub,
  toggleApp,
  vendorRows,
}: IotMultiAppBodyProps) {
  const apps = form.apps ?? [];
  const on = (id: string) => apps.indexOf(id) >= 0;
  const scanOn = IOT_SCAN_APP_IDS.some(on);
  const beaconApps = availApps.filter((a) => a.kind === 'beacon');
  const scanApps = availApps.filter((a) => a.kind === 'scan');

  const appToggle = (a: IotMultiApp) => (
    <FieldRow key={a.id} label={a.label} inline>
      <Checkbox
        checked={on(a.id)}
        disabled={ro}
        onCheckedChange={() => toggleApp(a.id)}
        aria-label={a.label}
      />
    </FieldRow>
  );

  /* Tx Power drives the derived Measured RSSI (updateTxPower). Keep the
     derived value on the record so the payload carries it. */
  const setTxPower = (key: 'iBeaconAdvertisement' | 'eddystoneAdvertisement', v: string) =>
    updSub(key, { txPower: v, measuredRssi: iotMeasuredRssi(v, key === 'iBeaconAdvertisement') });

  const txRow = (key: 'iBeaconAdvertisement' | 'eddystoneAdvertisement') => {
    const tx = String(
      (form[key] as Partial<IBeaconAdvertisement> | undefined)?.txPower ?? IOT_TX_POWER[0]
    );
    return (
      <>
        <FieldRow label="Tx Power">
          <Select value={tx} disabled={ro} onValueChange={(v) => setTxPower(key, v)}>
            <SelectTrigger className="max-w-[160px]" aria-label={`${key} Tx power`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IOT_TX_POWER.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="Measured RSSI (dBm)" description="Derived from Tx Power">
          <p className="text-sm text-muted-foreground">
            {iotMeasuredRssi(tx, key === 'iBeaconAdvertisement')}
          </p>
        </FieldRow>
      </>
    );
  };

  const ib = form.iBeaconAdvertisement;
  const ed = form.eddystoneAdvertisement;

  return (
    <>
      {errs['multi.apps'] && <p className="text-xs text-destructive">{errs['multi.apps']}</p>}

      {beaconApps.length > 0 && (
        <Group title="BLE Beacon">
          {beaconApps.map((a) => (
            <React.Fragment key={a.id}>
              {appToggle(a)}
              {a.id === 'iBeaconAdvertisement' && on(a.id) && (
                <div className="space-y-4 pl-4">
                  <FieldRow label="Advertise Interval (ms)" error={errs['ib.interval']} required>
                    <Input type="number" disabled={ro} value={Number.isFinite(ib?.interval) ? ib?.interval : ''}
                      onChange={(e) => updSub('iBeaconAdvertisement', { interval: numVal(e.target.value) })} className="max-w-[160px]" />
                  </FieldRow>
                  <FieldRow label="UUID" error={errs['ib.uuid']} required>
                    <Input disabled={ro} value={ib?.uuid ?? ''}
                      onChange={(e) => updSub('iBeaconAdvertisement', { uuid: e.target.value })} className="max-w-[340px]" />
                  </FieldRow>
                  <FieldRow label="Major" error={errs['ib.major']} required>
                    <Input type="number" disabled={ro} value={Number.isFinite(ib?.major) ? ib?.major : ''}
                      onChange={(e) => updSub('iBeaconAdvertisement', { major: numVal(e.target.value) })} className="max-w-[160px]" />
                  </FieldRow>
                  <FieldRow label="Minor" error={errs['ib.minor']} required>
                    <Input type="number" disabled={ro} value={Number.isFinite(ib?.minor) ? ib?.minor : ''}
                      onChange={(e) => updSub('iBeaconAdvertisement', { minor: numVal(e.target.value) })} className="max-w-[160px]" />
                  </FieldRow>
                  {txRow('iBeaconAdvertisement')}
                </div>
              )}
              {a.id === 'eddystoneAdvertisement' && on(a.id) && (
                <div className="space-y-4 pl-4">
                  <FieldRow label="URL" error={errs['ed.url']} required>
                    <Input disabled={ro} value={ed?.url ?? ''} placeholder="https://example.com"
                      onChange={(e) => updSub('eddystoneAdvertisement', { url: e.target.value })} className="max-w-[340px]" />
                  </FieldRow>
                  <FieldRow label="Advertise Interval (ms)" error={errs['ed.interval']} required>
                    <Input type="number" disabled={ro} value={Number.isFinite(ed?.interval) ? ed?.interval : ''}
                      onChange={(e) => updSub('eddystoneAdvertisement', { interval: numVal(e.target.value) })} className="max-w-[160px]" />
                  </FieldRow>
                  {txRow('eddystoneAdvertisement')}
                </div>
              )}
            </React.Fragment>
          ))}
        </Group>
      )}

      {scanApps.length > 0 && (
        <Group title="BLE Scan">
          {scanOn && (
            <FieldRow label="Scan Interval (ms)" error={errs['m.interval']} required
              description="Shared across the enabled scan applications">
              <Input type="number" disabled={ro}
                value={Number.isFinite(form.iBeaconScan?.interval) ? form.iBeaconScan?.interval : ''}
                onChange={(e) => updSub('iBeaconScan', { interval: numVal(e.target.value) })} className="max-w-[160px]" />
            </FieldRow>
          )}
          {scanApps.map((a) => (
            <React.Fragment key={a.id}>
              {appToggle(a)}
              {a.id === 'iBeaconScan' && on(a.id) && (
                <div className="space-y-4 pl-4">
                  <FieldRow label="Filter UUID" error={errs['m.ibUuid']} required>
                    <Input disabled={ro} value={form.iBeaconScan?.uuid ?? ''}
                      onChange={(e) => updSub('iBeaconScan', { uuid: e.target.value })} className="max-w-[340px]" />
                  </FieldRow>
                  <FieldRow label="Min RSS (dBm)" error={errs['m.ibRss']} required>
                    <Input type="number" disabled={ro}
                      value={Number.isFinite(form.iBeaconScan?.minRSS) ? form.iBeaconScan?.minRSS : ''}
                      onChange={(e) => updSub('iBeaconScan', { minRSS: numVal(e.target.value) })} className="max-w-[160px]" />
                  </FieldRow>
                </div>
              )}
              {a.id === 'eddystoneScan' && on(a.id) && (
                <div className="space-y-4 pl-4">
                  <FieldRow label="Min RSS (dBm)" error={errs['m.edRss']} required>
                    <Input type="number" disabled={ro}
                      value={Number.isFinite(form.eddystoneScan?.minRSS) ? form.eddystoneScan?.minRSS : ''}
                      onChange={(e) => updSub('eddystoneScan', { minRSS: numVal(e.target.value) })} className="max-w-[160px]" />
                  </FieldRow>
                </div>
              )}
              {a.id === 'genericScan' && on(a.id) && (
                <div className="space-y-4 pl-4">
                  <FieldRow label="Min RSS (dBm)" error={errs['m.gnRss']} required>
                    <Input type="number" disabled={ro}
                      value={Number.isFinite(form.genericScan?.minRSS) ? form.genericScan?.minRSS : ''}
                      onChange={(e) => updSub('genericScan', { minRSS: numVal(e.target.value) })} className="max-w-[160px]" />
                  </FieldRow>
                  <FieldRow label="Vendors">{vendorRows}</FieldRow>
                </div>
              )}
            </React.Fragment>
          ))}
        </Group>
      )}

      {scanOn && (
        <Group title="Destination">
          <FieldRow label="Real-Time Monitoring" inline>
            <Checkbox checked={!!form.iBeaconRealTimeMonitoring} disabled={ro}
              onCheckedChange={(v) => upd({ iBeaconRealTimeMonitoring: v === true })}
              aria-label="Real-time monitoring" />
          </FieldRow>
          {form.iBeaconRealTimeMonitoring && (
            <div className="space-y-4 pl-4">
              <FieldRow label="IP Address" error={errs['m.destAddr']} required>
                <Input disabled={ro} value={form.iBeaconScan?.destAddr ?? ''}
                  onChange={(e) => updSub('iBeaconScan', { destAddr: e.target.value })} className="max-w-[240px]" />
              </FieldRow>
              <FieldRow label="Port" error={errs['m.destPort']} required>
                <Input type="number" disabled={ro}
                  value={Number.isFinite(form.iBeaconScan?.destPort) ? form.iBeaconScan?.destPort : ''}
                  onChange={(e) => updSub('iBeaconScan', { destPort: numVal(e.target.value) })} className="max-w-[160px]" />
              </FieldRow>
            </div>
          )}
          <FieldRow label="Batch Reporting" inline>
            <Checkbox checked={!!form.iBeaconRealBatchReporting} disabled={ro}
              onCheckedChange={(v) => upd({ iBeaconRealBatchReporting: v === true })}
              aria-label="Batch reporting" />
          </FieldRow>
          {form.iBeaconRealBatchReporting && (
            <div className="space-y-4 pl-4">
              <FieldRow label="Reporting URL" error={errs['m.batchUrl']} required>
                <Input disabled={ro} value={form.iBeaconAdvertisement?.url ?? ''} placeholder="https://example.com/collect"
                  onChange={(e) => updSub('iBeaconAdvertisement', { url: e.target.value })} className="max-w-[340px]" />
              </FieldRow>
            </div>
          )}
        </Group>
      )}

      <FieldRow label="BLE Data">
        <Select value={form.bleData ?? 'LATEST_ONLY'} disabled={ro}
          onValueChange={(v) => upd({ bleData: v })}>
          <SelectTrigger className="max-w-[240px]" aria-label="BLE data">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IOT_BLE_DATA.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
    </>
  );
}
