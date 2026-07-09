/**
 * Advanced Settings > Overrides tab (apAdvanced.html, gap 3/13). Every advanced
 * field is an OvrRow pair (toggle enables the paired control, otherwise shows
 * the inherited tag). Feature-gated blocks match the controller: LAG / USB /
 * PSE / SSH / Edge / Poll Timeout / FA Auth Key / LED / PEAP / PKI / Smart Poll
 * / per-radio Probe Suppression. Keys verified against ap-detail-sample.json.
 */
import React from 'react';
import { FieldRow, OvrRow, MaskedInput } from '../_kit';
import { Switch } from '../../ui/switch';
import { Input } from '../../ui/input';
import { ApSelect, NumberField } from './controls';
import { getIn } from './useApDraft';
import { AP_EVENT_LEVELS, PEAP_OPTS, hasFeature, type Opt } from './apHelpers';
import type { ApDetail } from '../../../types/configure';

export interface OverridesTabProps {
  d: ApDetail;
  upd: (path: string, value: unknown) => void;
  errs: Record<string, string>;
}

const SectionHead = ({ children }: { children: React.ReactNode }) => (
  <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
    {children}
  </h4>
);

export function ApAdvancedOverridesTab({ d, upd, errs }: OverridesTabProps) {
  const F = (f: string) => hasFeature(d.features, f);
  const g = (p: string) => getIn(d, p);
  const gb = (p: string) => !!getIn(d, p);
  const gn = (p: string) => getIn(d, p) as number | null | undefined;
  const gs = (p: string) => (getIn(d, p) as string | null | undefined) ?? '';

  const ge2opts: Opt[] = [{ id: 'Backup', label: 'Backup' }];
  if (F('AP-LAG')) ge2opts.push({ id: 'LAG', label: 'LAG' });
  if (F('AP-GE2-CLIENT')) ge2opts.push({ id: 'Client', label: 'Client' });
  if (F('AP-GE2-BRIDGE')) ge2opts.push({ id: 'Bridge', label: 'Bridge' });

  const sp = d.smartPoll ?? { enabled: false, interval: 300, deadline: 300, targets: [] };
  const tagged = d.mgmtVlanId != null && d.mgmtVlanId >= 0;

  return (
    <div className="space-y-5">
      <OvrRow
        label="Management VLAN"
        overridden={!!d.mgmtVlanIdOvr}
        onOverriddenChange={(v) => upd('mgmtVlanIdOvr', v)}
        inheritedDisplay="Inherited from profile"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Tagged</span>
          <Switch checked={tagged} onCheckedChange={(v) => upd('mgmtVlanId', v ? 1 : -1)} />
          {tagged && (
            <NumberField
              className="w-28"
              value={d.mgmtVlanId}
              min={1}
              max={4094}
              onChange={(v) => upd('mgmtVlanId', v)}
            />
          )}
        </div>
        {errs.vlan && <p className="mt-1 text-xs text-destructive">{errs.vlan}</p>}
      </OvrRow>

      <OvrRow
        label="Static MTU"
        overridden={!!d.mtuOvr}
        onOverriddenChange={(v) => upd('mtuOvr', v)}
        inheritedDisplay="Inherited from profile"
      >
        <NumberField value={d.mtu} min={1500} max={1800} onChange={(v) => upd('mtu', v)} />
        {errs.mtu && <p className="mt-1 text-xs text-destructive">{errs.mtu}</p>}
      </OvrRow>

      {F('AP-LAG') && (
        <OvrRow label="LAG" overridden={!!d.lagOvr} onOverriddenChange={(v) => upd('lagOvr', v)} inheritedDisplay="Inherited from profile">
          <Switch checked={!!d.lag} onCheckedChange={(v) => upd('lag', v)} />
        </OvrRow>
      )}

      <OvrRow label="Eth1 Port Function" overridden={!!d.ge2modeOvr} onOverriddenChange={(v) => upd('ge2modeOvr', v)} inheritedDisplay="Inherited from profile">
        <ApSelect className="w-40" value={d.ge2mode} options={ge2opts} onChange={(v) => upd('ge2mode', v)} />
      </OvrRow>

      {F('USB') && (
        <OvrRow label="USB Power" overridden={!!d.usbPowerOvr} onOverriddenChange={(v) => upd('usbPowerOvr', v)} inheritedDisplay="Inherited from profile">
          <ApSelect className="w-32" value={d.usbPower} options={['Off', 'On']} onChange={(v) => upd('usbPower', v)} />
        </OvrRow>
      )}
      {F('PSE') && (
        <OvrRow label="PSE Power" overridden={!!d.psePowerOvr} onOverriddenChange={(v) => upd('psePowerOvr', v)} inheritedDisplay="Inherited from profile">
          <ApSelect className="w-32" value={d.psePower} options={['Auto', 'Off']} onChange={(v) => upd('psePower', v)} />
        </OvrRow>
      )}

      <OvrRow label="SSH Access" overridden={!!d.sshEnabledOvr} onOverriddenChange={(v) => upd('sshEnabledOvr', v)} inheritedDisplay="Inherited from profile">
        <ApSelect className="w-36" value={d.sshEnabled ? 'Enabled' : 'Disabled'} options={['Enabled', 'Disabled']} onChange={(v) => upd('sshEnabled', v === 'Enabled')} />
      </OvrRow>

      {F('LOW-POWER-MODE-OVERRIDE') && (
        <FieldRow label="Force PoE+" inline>
          <Switch checked={!!d.forcePoEPlus} onCheckedChange={(v) => upd('forcePoEPlus', v)} />
        </FieldRow>
      )}

      <OvrRow label="Event Level" overridden={!!d.apLogLevelOvr} onOverriddenChange={(v) => upd('apLogLevelOvr', v)} inheritedDisplay="Inherited from profile">
        <ApSelect className="w-40" value={d.apLogLevel} options={AP_EVENT_LEVELS} onChange={(v) => upd('apLogLevel', v)} />
      </OvrRow>

      {F('EDGE-COMPUTE') && (
        <OvrRow label="Edge Compute" overridden={!!d.edgeOvr} onOverriddenChange={(v) => upd('edgeOvr', v)} inheritedDisplay="Inherited from profile">
          <Switch checked={!!d.edge} onCheckedChange={(v) => upd('edge', v)} />
        </OvrRow>
      )}
      {F('POLL-TIMEOUT') && (
        <OvrRow label="Poll Timeout [s]" overridden={!!d.pollTimeoutOvr} onOverriddenChange={(v) => upd('pollTimeoutOvr', v)} inheritedDisplay="Inherited from profile">
          <NumberField value={d.pollTimeout} min={2} max={600} onChange={(v) => upd('pollTimeout', v)} />
          {errs.poll && <p className="mt-1 text-xs text-destructive">{errs.poll}</p>}
        </OvrRow>
      )}
      {F('FABRIC-ATTACH-AUTH-KEY') && (
        <OvrRow label="FA Authentication Key" overridden={!!d.faAuthKeyOvr} onOverriddenChange={(v) => upd('faAuthKeyOvr', v)} inheritedDisplay="Inherited from profile">
          <MaskedInput className="w-56" value={d.faAuthKey ?? ''} onChange={(v) => upd('faAuthKey', v)} />
        </OvrRow>
      )}
      {F('LED-CONTROL') && (
        <OvrRow label="LED Status" overridden={!!d.ledStatusOvr} onOverriddenChange={(v) => upd('ledStatusOvr', v)} inheritedDisplay="Inherited from profile">
          <ApSelect className="w-36" value={d.ledStatus} options={[{ id: 'NORMAL', label: 'Normal' }, { id: 'OFF', label: 'Off' }]} onChange={(v) => upd('ledStatus', v)} />
        </OvrRow>
      )}
      <OvrRow label="Preferred Connection" overridden={!!d.affinityOvr} onOverriddenChange={(v) => upd('affinityOvr', v)} inheritedDisplay="Inherited from profile">
        <ApSelect className="w-36" value={d.affinity} options={['Primary', 'Backup']} onChange={(v) => upd('affinity', v)} />
      </OvrRow>

      <OvrRow label="PEAP Username" overridden={!!d.peapUsernameOvr} onOverriddenChange={(v) => upd('peapUsernameOvr', v)} inheritedDisplay="Inherited from profile">
        <div className="flex items-center gap-2">
          <ApSelect className="w-40" value={gs('peapUsername.selection')} options={PEAP_OPTS} onChange={(v) => upd('peapUsername.selection', v)} />
          {g('peapUsername.selection') === 'Custom' && (
            <Input className="w-40" value={gs('peapUsername.custom')} onChange={(e) => upd('peapUsername.custom', e.target.value)} />
          )}
        </div>
      </OvrRow>
      <OvrRow label="PEAP Password" overridden={!!d.peapPasswordOvr} onOverriddenChange={(v) => upd('peapPasswordOvr', v)} inheritedDisplay="Inherited from profile">
        <div className="flex items-center gap-2">
          <ApSelect className="w-40" value={gs('peapPassword.selection')} options={PEAP_OPTS} onChange={(v) => upd('peapPassword.selection', v)} />
          {g('peapPassword.selection') === 'Custom' && (
            <MaskedInput className="w-40" value={gs('peapPassword.custom')} onChange={(v) => upd('peapPassword.custom', v)} />
          )}
        </div>
      </OvrRow>

      {F('PKI-CERT') && (
        <OvrRow label="Enforce Manufacturing Certificate" overridden={!!d.enforcePkiAuthOvr} onOverriddenChange={(v) => upd('enforcePkiAuthOvr', v)} inheritedDisplay="Inherited from profile">
          <Switch checked={!!d.enforcePkiAuth} onCheckedChange={(v) => upd('enforcePkiAuth', v)} />
        </OvrRow>
      )}
      <OvrRow label="Client Bridge RSS Threshold [dBm]" overridden={!!d.cbRssThresholdOvr} onOverriddenChange={(v) => upd('cbRssThresholdOvr', v)} inheritedDisplay="Inherited from profile">
        <NumberField value={d.cbRssThreshold} min={-100} max={-40} onChange={(v) => upd('cbRssThreshold', v)} />
      </OvrRow>

      {F('SMART-POLL') && (
        <>
          <SectionHead>Smart Poll</SectionHead>
          <OvrRow label="Smart Poll Override" overridden={!!d.smartPollOvr} onOverriddenChange={(v) => upd('smartPollOvr', v)} inheritedDisplay="Inherited from profile">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Enabled</span>
                <Switch checked={!!sp.enabled} onCheckedChange={(v) => upd('smartPoll.enabled', v)} />
              </div>
              {sp.enabled && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Interval [s]</span>
                    <ApSelect className="w-28" value={sp.interval} options={['60', '120', '300', '600']} onChange={(v) => upd('smartPoll.interval', Number(v))} />
                    <span className="text-xs text-muted-foreground">Deadline [s]</span>
                    <NumberField className="w-24" value={sp.deadline} onChange={(v) => upd('smartPoll.deadline', v)} />
                  </div>
                  <Input
                    className="w-full"
                    placeholder="Targets (max 10) — IP or FQDN, comma-separated"
                    value={(sp.targets ?? []).join(', ')}
                    onChange={(e) =>
                      upd(
                        'smartPoll.targets',
                        e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10)
                      )
                    }
                  />
                </div>
              )}
            </div>
          </OvrRow>
        </>
      )}

      <SectionHead>Probe Suppression (per radio)</SectionHead>
      {(d.radios ?? []).map((r, i) => (
        <div key={i} className="space-y-3 rounded-md border border-border p-3">
          <p className="text-xs font-semibold">{r.radioName || `Radio ${r.radioIndex}`}</p>
          <OvrRow label="Probe Suppression" overridden={gb(`radios.${i}.probeSuppOnLowRssOvr`)} onOverriddenChange={(v) => upd(`radios.${i}.probeSuppOnLowRssOvr`, v)} inheritedDisplay="Inherited">
            <Switch checked={gb(`radios.${i}.probeSuppOnLowRss`)} onCheckedChange={(v) => upd(`radios.${i}.probeSuppOnLowRss`, v)} />
          </OvrRow>
          {F('FORCE-DEASSOC-ON-LOW-RSS') && (
            <OvrRow label="Disassociate on low RSS" overridden={gb(`radios.${i}.deasscOnLowRssOvr`)} onOverriddenChange={(v) => upd(`radios.${i}.deasscOnLowRssOvr`, v)} inheritedDisplay="Inherited">
              <Switch checked={gb(`radios.${i}.deasscOnLowRss`)} onCheckedChange={(v) => upd(`radios.${i}.deasscOnLowRss`, v)} />
            </OvrRow>
          )}
          <OvrRow label="RSS Threshold [dBm]" overridden={gb(`radios.${i}.probeSuppRssThOvr`)} onOverriddenChange={(v) => upd(`radios.${i}.probeSuppRssThOvr`, v)} inheritedDisplay="Inherited">
            <NumberField value={gn(`radios.${i}.probeSuppRssTh`)} min={-100} max={-50} onChange={(v) => upd(`radios.${i}.probeSuppRssTh`, v)} />
          </OvrRow>
          <OvrRow label="Max Probe Retries" overridden={gb(`radios.${i}.maxProbeRtyOvr`)} onOverriddenChange={(v) => upd(`radios.${i}.maxProbeRtyOvr`, v)} inheritedDisplay="Inherited">
            <NumberField value={gn(`radios.${i}.maxProbeRty`)} min={1} max={10} onChange={(v) => upd(`radios.${i}.maxProbeRty`, v)} />
          </OvrRow>
          <OvrRow label="RSS Offset [dB]" overridden={gb(`radios.${i}.rssOffsetOvr`)} onOverriddenChange={(v) => upd(`radios.${i}.rssOffsetOvr`, v)} inheritedDisplay="Inherited">
            <NumberField value={gn(`radios.${i}.rssOffset`)} min={0} max={120} onChange={(v) => upd(`radios.${i}.rssOffset`, v)} />
          </OvrRow>
        </div>
      ))}
    </div>
  );
}
