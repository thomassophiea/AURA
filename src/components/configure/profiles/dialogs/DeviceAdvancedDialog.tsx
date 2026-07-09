/**
 * Device Advanced Settings dialog (profileAdvanced.html) — ~27 device-level
 * fields with their feature gates and numeric ranges. Close-only footer; all
 * edits write straight to the profile form (validity surfaces on the sheet).
 */
import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../../ui/dialog';
import { Button } from '../../../ui/button';
import { Input } from '../../../ui/input';
import { Switch } from '../../../ui/switch';
import { BoolSelect, LabelRow, NumInput, PSelect } from '../controls';
import { MaskedInput } from '../../_kit';
import {
  AP_LOG_LEVEL_OPTS,
  LED_STATUS_OPTS,
  PEAP_OPTS,
  SECURE_TUNNEL_OPTS,
  SMART_POLL_INTERVAL_OPTS,
} from '../constants';
import { getIn, inRange, parseChannelList } from '../helpers';
import type { Opt } from '../types';
import type { ApProfile, SmartPollConfig } from '../../../../types/configure';

export interface DeviceAdvancedDialogProps {
  open: boolean;
  form: ApProfile;
  F: (tag: string) => boolean;
  setPath: (path: string, value: unknown) => void;
  onClose: () => void;
}

const LW = 250;

export function DeviceAdvancedDialog({ open, form, F, setPath, onClose }: DeviceAdvancedDialogProps) {
  const sp = (form.smartPoll ?? {}) as Partial<SmartPollConfig>;
  const mtuMax = F('JUMBO-FRAMES') ? 1800 : 1500;
  const mtuErr = form.mtu != null && !inRange(form.mtu, 600, mtuMax) ? `Valid range 600 to ${mtuMax}` : null;
  const pollErr = F('POLL-TIMEOUT') && !inRange(form.pollTimeout, 3, 600) ? 'Valid range 3 to 600' : null;
  const cbErr = form.cbRssThreshold != null && !inRange(form.cbRssThreshold, -128, -40) ? 'Valid range -128 to -40' : null;
  const spDeadlineErr =
    F('SMART-POLL') && sp.enabled && !inRange(sp.deadline, 1, Number(sp.interval) || 300)
      ? `Valid range 1 to ${sp.interval || 300}`
      : null;
  const spTargetsErr = F('SMART-POLL') && sp.enabled && (sp.targets ?? []).length > 10 ? 'Maximum 10 targets' : null;
  const peapUErr = getIn(form, 'peapUsername.selection') === 'Custom' && !getIn(form, 'peapUsername.custom') ? 'Custom username is required' : null;
  const peapPErr = getIn(form, 'peapPassword.selection') === 'Custom' && !getIn(form, 'peapPassword.custom') ? 'Custom password is required' : null;

  const num = (key: string) => <NumInput value={getIn(form, key) as number} onChange={(v) => setPath(key, v)} className="w-36" />;
  const sel = (key: string, opts: Opt[], w = 'w-52') => (
    <PSelect value={(getIn(form, key) as string) ?? ''} options={opts} onChange={(v) => setPath(key, v)} className={w} ariaLabel={key} />
  );
  const onoff = (key: string) => <BoolSelect value={!!getIn(form, key)} onChange={(v) => setPath(key, v)} className="w-36" />;
  const chk = (key: string) => (
    <Switch checked={!!getIn(form, key)} onCheckedChange={(v) => setPath(key, v)} aria-label={key} />
  );
  const text = (key: string, ph?: string) => (
    <Input className="h-9 w-44" placeholder={ph} value={(getIn(form, key) as string) ?? ''} onChange={(e) => setPath(key, e.target.value)} />
  );

  const ge2opts: Opt[] = [{ id: 'Backup', label: 'Backup' }];
  if (F('AP-LAG')) ge2opts.push({ id: 'LAG', label: 'LAG' });
  if (F('AP-GE2-CLIENT')) ge2opts.push({ id: 'Client', label: 'Client' });
  if (F('AP-GE2-BRIDGE')) ge2opts.push({ id: 'Bridge', label: 'Bridge' });

  const Head = ({ children }: { children: React.ReactNode }) => (
    <p className="pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
  );

  const secureOn = F('SECURE-TUNNEL') && !!form.secureTunnelMode && form.secureTunnelMode !== 'disabled';
  const sensorCustom = F('SENSOR-CUSTOM-SCAN') && !!form.sensorMode && form.sensorMode !== 'Default';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Advanced Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <LabelRow label="Client Balancing" labelWidth={LW}>{onoff('clientBalancing')}</LabelRow>
          {F('SECURE-TUNNEL') && <LabelRow label="Secure Tunnel Mode" labelWidth={LW}>{sel('secureTunnelMode', SECURE_TUNNEL_OPTS)}</LabelRow>}
          {secureOn && <LabelRow label="Secure Tunnel Lifetime [h]" labelWidth={LW}>{num('secureTunnelLifetime')}</LabelRow>}
          {F('PKI-CERT') && <LabelRow label="Enforce PKI Authentication" labelWidth={LW}>{chk('enforcePkiAuth')}</LabelRow>}
          <LabelRow label="SSH Access" labelWidth={LW}>{onoff('sshEnabled')}</LabelRow>
          {F('EDGE-COMPUTE') && <LabelRow label="Edge Compute" labelWidth={LW}>{chk('edge')}</LabelRow>}
          {F('SESSION-PERSISTENCE') && <LabelRow label="Session Persistence" labelWidth={LW}>{onoff('sessionPersistence')}</LabelRow>}
          <LabelRow label="Management VLAN ID" labelWidth={LW}>{num('mgmtVlanId')}</LabelRow>
          <LabelRow label="Management VLAN Tagged" labelWidth={LW}>{chk('mgmtVlanTagged')}</LabelRow>
          <LabelRow label="MTU" labelWidth={LW} error={mtuErr}>{num('mtu')}</LabelRow>
          {F('SENSOR-CUSTOM-SCAN') && (
            <LabelRow label="Sensor Mode" labelWidth={LW}>
              {sel('sensorMode', [{ id: 'Default', label: 'Default' }, { id: 'Custom', label: 'Custom' }], 'w-40')}
            </LabelRow>
          )}
          {sensorCustom && (
            <LabelRow label="Sensor Scan Channels" labelWidth={LW}>
              <Input
                className="h-9"
                placeholder="e.g. 1, 6, 11, 36"
                value={((form.sensorChList as unknown[]) ?? []).join(', ')}
                onChange={(e) => setPath('sensorChList', parseChannelList(e.target.value))}
              />
            </LabelRow>
          )}
          {F('AP-LAG') && <LabelRow label="LAG" labelWidth={LW}>{chk('lag')}</LabelRow>}
          {!F('AP-SINGLE-INF-WIRED-CLIENT') && <LabelRow label="GE2 Port Mode" labelWidth={LW}>{sel('ge2mode', ge2opts, 'w-40')}</LabelRow>}
          {F('USB') && <LabelRow label="USB Power" labelWidth={LW}>{sel('usbPower', [{ id: 'Off', label: 'Off' }, { id: 'On', label: 'On' }], 'w-32')}</LabelRow>}
          {F('PSE') && <LabelRow label="PSE Power" labelWidth={LW}>{sel('psePower', [{ id: 'Auto', label: 'Auto' }, { id: 'Off', label: 'Off' }], 'w-32')}</LabelRow>}
          <LabelRow label="AP Log Level" labelWidth={LW}>{sel('apLogLevel', AP_LOG_LEVEL_OPTS, 'w-40')}</LabelRow>
          {F('POLL-TIMEOUT') && <LabelRow label="Poll Timeout [s]" labelWidth={LW} error={pollErr}>{num('pollTimeout')}</LabelRow>}
          {F('FABRIC-ATTACH-AUTH-KEY') && (
            <LabelRow label="Fabric Attach Auth Key" labelWidth={LW}>
              <MaskedInput value={form.faAuthKey || ''} onChange={(v) => setPath('faAuthKey', v)} />
            </LabelRow>
          )}
          {F('LED-CONTROL') && <LabelRow label="LED Status" labelWidth={LW}>{sel('ledStatus', LED_STATUS_OPTS, 'w-32')}</LabelRow>}
          <LabelRow label="PEAP Username" labelWidth={LW} error={peapUErr}>
            <div className="flex items-center gap-2">
              {sel('peapUsername.selection', PEAP_OPTS, 'w-40')}
              {getIn(form, 'peapUsername.selection') === 'Custom' && text('peapUsername.custom')}
            </div>
          </LabelRow>
          <LabelRow label="PEAP Password" labelWidth={LW} error={peapPErr}>
            <div className="flex items-center gap-2">
              {sel('peapPassword.selection', PEAP_OPTS, 'w-40')}
              {getIn(form, 'peapPassword.selection') === 'Custom' && (
                <MaskedInput value={(getIn(form, 'peapPassword.custom') as string) || ''} onChange={(v) => setPath('peapPassword.custom', v)} />
              )}
            </div>
          </LabelRow>

          <Head>Client Bridge</Head>
          <LabelRow label="RSS Threshold [dBm]" labelWidth={LW} error={cbErr}>{num('cbRssThreshold')}</LabelRow>

          {F('SMART-POLL') && (
            <>
              <Head>Smart Poll</Head>
              <LabelRow label="Smart Poll" labelWidth={LW}>{chk('smartPoll.enabled')}</LabelRow>
              {sp.enabled && (
                <>
                  <LabelRow label="Interval [s]" labelWidth={LW}>
                    <PSelect
                      value={sp.interval != null ? String(sp.interval) : ''}
                      options={SMART_POLL_INTERVAL_OPTS}
                      onChange={(v) => setPath('smartPoll.interval', Number(v))}
                      className="w-32"
                      ariaLabel="Smart poll interval"
                    />
                  </LabelRow>
                  <LabelRow label="Deadline [s]" labelWidth={LW} error={spDeadlineErr}>{num('smartPoll.deadline')}</LabelRow>
                  <LabelRow label="Targets (max 10)" labelWidth={LW} error={spTargetsErr}>
                    <Input
                      className="h-9"
                      placeholder="IP or FQDN, comma-separated"
                      value={(sp.targets ?? []).join(', ')}
                      onChange={(e) => setPath('smartPoll.targets', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                    />
                  </LabelRow>
                </>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
