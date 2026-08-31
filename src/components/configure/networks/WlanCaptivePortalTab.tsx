/**
 * WLAN editor - Captive Portal tab. Two portal choices (ruling 2026-08-31):
 * Cloud Captive Portal — the managed portal, ECP URL and identity wired from
 * the portal service itself — and External Captive Portal, entered by hand.
 * Both store captivePortalType 'External' on the gateway; a legacy Internal /
 * EGuest / CWA / GuestEssentials value stays selectable without silent
 * rewrite. Plus topology-gated portal connection, redirect URL select with
 * custom target, redirect ports, walled-garden rules and the eGuestSettings
 * editor (max 3 servers) for legacy records.
 */
import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '../../ui/alert';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { ArrayEditor, FieldRow, MaskedInput, Section } from '../_kit';
import { PORTAL_CLOUD, WLAN_ENUMS, portalSelection, portalTypeOptions } from './wlanModel';
import { portalEcpInfo, type PortalEcpInfo } from '../../../services/portalConfigService';
import type { EGuestSetting, WalledGardenRule } from './wlanForm';
import {
  EnumSelect,
  RefSelect,
  patchRecord,
  patchUi,
  toOptions,
  type WlanTabProps,
} from './wlanControls';

const DEFAULT_PORTALS = [{ id: 'default', label: 'default' }];

export function WlanCaptivePortalTab({ form, setForm, errors, refs }: WlanTabProps) {
  const { record, ui } = form;
  const patch = patchRecord(setForm);
  const setUi = patchUi(setForm);
  const cpOn = record.enableCaptivePortal;
  // PLM 2026-08-21: new guest WLANs default to External (the local CWP
  // "Internal" portal is deprecated and never offered on new records).
  const portalType = record.captivePortalType ?? 'External';

  // The managed portal's ECP wiring; null = portal not connected (the cloud
  // choice then degrades to manual entry), undefined = still loading.
  const [cloudEcp, setCloudEcp] = useState<PortalEcpInfo | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void portalEcpInfo().then((info) => {
      if (!cancelled) setCloudEcp(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selection = portalSelection(
    record.captivePortalType,
    ui.cpRedirect,
    cloudEcp?.url ?? null,
    ui.cpPortalChoice
  );

  const choosePortal = (v: string) => {
    if (v === PORTAL_CLOUD) {
      patch({ captivePortalType: 'External' });
      setUi({
        cpPortalChoice: v,
        ...(cloudEcp ? { cpRedirect: cloudEcp.url, cpIdentity: cloudEcp.identity } : {}),
      });
    } else if (v === 'External') {
      // Leaving the cloud choice clears its auto-filled wiring; a genuinely
      // custom URL/identity is never clobbered.
      const wasCloudWired = !!cloudEcp && ui.cpRedirect === cloudEcp.url;
      patch({ captivePortalType: 'External' });
      setUi({
        cpPortalChoice: v,
        ...(wasCloudWired ? { cpRedirect: '', cpIdentity: '' } : {}),
      });
    } else {
      patch({ captivePortalType: v });
      setUi({ cpPortalChoice: '' });
    }
  };
  const topology = refs.topologies.find((t) => t.id === record.defaultTopology);
  // Portal Connection only applies when the default topology is Bridged@AP or GRE.
  const showPortalConnection =
    cpOn &&
    portalType === 'Internal' &&
    !!topology &&
    (topology.mode === 'BridgedAtAp' || topology.mode === 'Gre');
  const eguestSettings = (record.eGuestSettings ?? []) as EGuestSetting[];

  return (
    <div className="space-y-6">
      <Section title="Captive Portal">
        <FieldRow label="Enable Captive Portal" inline>
          <Switch
            checked={cpOn}
            onCheckedChange={(v) =>
              // Only the flag flips (golden parity): a legacy portal type is
              // never nulled on disable, so an off/on cycle cannot rewrite it.
              patch(
                v
                  ? { enableCaptivePortal: true, captivePortalType: portalType }
                  : { enableCaptivePortal: false }
              )
            }
          />
        </FieldRow>
        {cpOn && (
          <FieldRow
            label="Portal Type"
            description={
              portalType && !WLAN_ENUMS.portalType.some((o) => o.id === portalType)
                ? 'This record carries a legacy portal type; it stays selectable and is never rewritten on save.'
                : undefined
            }
          >
            <EnumSelect
              value={selection}
              options={portalTypeOptions(selection)}
              onChange={choosePortal}
              className="w-72"
            />
          </FieldRow>
        )}
      </Section>

      {cpOn && selection === PORTAL_CLOUD && (
        <Section
          title="Cloud Captive Portal"
          description="The managed guest portal. The guest experience — consent form, sponsorship, secure access, languages — is configured under Configure → Cloud Captive Portal."
        >
          {cloudEcp ? (
            <>
              <FieldRow label="ECP URL" description="Wired to the portal service automatically.">
                <span className="font-mono text-sm">{cloudEcp.url}</span>
              </FieldRow>
              <FieldRow label="Identity">
                <span className="font-mono text-sm">{cloudEcp.identity}</span>
              </FieldRow>
              <FieldRow
                label="Shared Secret"
                description="Must match the secret configured on the portal service; it is never read back from either side."
              >
                <MaskedInput value={ui.cpSharedKey} onChange={(v) => setUi({ cpSharedKey: v })} />
              </FieldRow>
            </>
          ) : (
            <>
              <Alert variant="warning">
                <AlertDescription>
                  The Cloud Captive Portal service is not connected to AURA, so its address cannot
                  be filled in automatically. Enter the portal&apos;s ECP URL and identity manually,
                  or connect the portal (CWP_INTERNAL_API_URL / CWP_INTERNAL_API_TOKEN).
                </AlertDescription>
              </Alert>
              <FieldRow label="ECP URL" htmlFor="wlan-ecp-url" required error={errors.cpRedirect}>
                <Input
                  id="wlan-ecp-url"
                  value={ui.cpRedirect}
                  placeholder="https://portal.example.com/portal"
                  onChange={(e) => setUi({ cpRedirect: e.target.value })}
                />
              </FieldRow>
              <FieldRow label="Identity" htmlFor="wlan-cp-identity">
                <Input
                  id="wlan-cp-identity"
                  value={ui.cpIdentity}
                  onChange={(e) => setUi({ cpIdentity: e.target.value })}
                />
              </FieldRow>
              <FieldRow label="Shared Secret">
                <MaskedInput value={ui.cpSharedKey} onChange={(v) => setUi({ cpSharedKey: v })} />
              </FieldRow>
            </>
          )}
        </Section>
      )}

      {cpOn && portalType === 'Internal' && (
        <Section title="Internal Portal">
          <FieldRow label="Portal Configuration">
            <RefSelect
              value={ui.portalName}
              options={DEFAULT_PORTALS}
              onChange={(v) => setUi({ portalName: v ?? '' })}
            />
          </FieldRow>
          {showPortalConnection && (
            <FieldRow
              label="Portal Connection"
              description="Available because the default topology is Bridged@AP or GRE."
            >
              <RefSelect
                value={ui.portalInterface}
                options={toOptions(refs.topologies)}
                onChange={(v) => setUi({ portalInterface: v ?? '' })}
              />
            </FieldRow>
          )}
        </Section>
      )}

      {cpOn && selection === 'External' && (
        <Section title="External Captive Portal">
          <FieldRow label="ECP URL" htmlFor="wlan-ecp-url" required error={errors.cpRedirect}>
            <Input
              id="wlan-ecp-url"
              value={ui.cpRedirect}
              placeholder="https://portal.example.com"
              onChange={(e) => setUi({ cpRedirect: e.target.value })}
            />
          </FieldRow>
          <FieldRow label="Identity" htmlFor="wlan-cp-identity">
            <Input
              id="wlan-cp-identity"
              value={ui.cpIdentity}
              onChange={(e) => setUi({ cpIdentity: e.target.value })}
            />
          </FieldRow>
          <FieldRow label="Shared Secret">
            <MaskedInput value={ui.cpSharedKey} onChange={(v) => setUi({ cpSharedKey: v })} />
          </FieldRow>
        </Section>
      )}

      {cpOn && (portalType === 'Internal' || portalType === 'External') && (
        <Section title="Redirection">
          <FieldRow label="Send successful login to">
            <EnumSelect
              value={ui.cpRedirectUrlSelect}
              options={WLAN_ENUMS.ecpRedirect}
              onChange={(v) => setUi({ cpRedirectUrlSelect: v })}
              className="w-56"
            />
          </FieldRow>
          {ui.cpRedirectUrlSelect === 'URLCUSTOMIZED' && (
            <FieldRow label="Redirect URL" htmlFor="wlan-cp-custom-url">
              <Input
                id="wlan-cp-custom-url"
                value={ui.cpDefaultRedirectUrl}
                placeholder="https://example.com/welcome"
                onChange={(e) => setUi({ cpDefaultRedirectUrl: e.target.value })}
              />
            </FieldRow>
          )}
        </Section>
      )}

      {cpOn && (
        <Section title="Connection">
          <FieldRow label="Use FQDN for connection" inline>
            <Switch checked={ui.cpUseFqdn} onCheckedChange={(v) => setUi({ cpUseFqdn: v })} />
          </FieldRow>
          <FieldRow label="Use HTTPS connection" inline>
            <Switch checked={ui.cpHttps} onCheckedChange={(v) => setUi({ cpHttps: v })} />
          </FieldRow>
          <FieldRow label="CP Redirect Port List">
            <div className="space-y-2">
              {ui.cpRedirectPorts.map((port, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    className="w-32"
                    value={port}
                    onChange={(e) => {
                      const next = [...ui.cpRedirectPorts];
                      next[index] = Number(e.target.value);
                      setUi({ cpRedirectPorts: next });
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label="Remove port"
                    onClick={() =>
                      setUi({ cpRedirectPorts: ui.cpRedirectPorts.filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setUi({ cpRedirectPorts: [...ui.cpRedirectPorts, 8080] })}
              >
                Add Port
              </Button>
            </div>
          </FieldRow>
          <FieldRow label="Walled Garden Rules">
            <ArrayEditor<WalledGardenRule>
              items={ui.walledGardenRules}
              onChange={(rules) => setUi({ walledGardenRules: rules })}
              createItem={() => ({ domain: '', ip: '', port: '' })}
              addLabel="Add Rule"
              emptyText="No walled-garden rules configured"
              getItemTitle={(rule, index) => rule.domain || rule.ip || `Rule ${index + 1}`}
              renderItem={(rule, _index, update) => (
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    value={rule.domain}
                    placeholder="Domain"
                    onChange={(e) => update({ ...rule, domain: e.target.value })}
                  />
                  <Input
                    value={rule.ip}
                    placeholder="IP"
                    onChange={(e) => update({ ...rule, ip: e.target.value })}
                  />
                  <Input
                    value={rule.port}
                    placeholder="Port"
                    onChange={(e) => update({ ...rule, port: e.target.value })}
                  />
                </div>
              )}
            />
          </FieldRow>
        </Section>
      )}

      {cpOn && portalType === 'EGuest' && (
        <Section title="ExtremeGuest Servers" description="Up to 3 servers.">
          <ArrayEditor<EGuestSetting>
            items={eguestSettings}
            maxItems={3}
            onChange={(items) => patch({ eGuestSettings: items })}
            createItem={() => ({
              id: '',
              useRadiusAuthentication: false,
              useRadiusAccounting: false,
            })}
            addLabel="Add ExtremeGuest Server"
            emptyText="No ExtremeGuest servers configured"
            getItemTitle={(item, index) =>
              refs.eguests.find((e) => e.id === item.id)?.name ?? `Server ${index + 1}`
            }
            renderItem={(item, _index, update) => (
              <div className="space-y-3">
                <FieldRow label="Server">
                  <RefSelect
                    value={item.id}
                    options={toOptions(refs.eguests)}
                    onChange={(v) => update({ ...item, id: v ?? '' })}
                  />
                </FieldRow>
                <FieldRow label="Use RADIUS Authentication" inline>
                  <Switch
                    checked={item.useRadiusAuthentication}
                    onCheckedChange={(v) => update({ ...item, useRadiusAuthentication: v })}
                  />
                </FieldRow>
                <FieldRow label="Use RADIUS Accounting" inline>
                  <Switch
                    checked={item.useRadiusAccounting}
                    onCheckedChange={(v) => update({ ...item, useRadiusAccounting: v })}
                  />
                </FieldRow>
              </div>
            )}
          />
        </Section>
      )}
    </div>
  );
}
