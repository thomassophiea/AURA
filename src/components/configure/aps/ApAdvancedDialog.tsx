/**
 * Advanced Settings modal (apAdvanced.html, gap 13) — 4 tabs: Overrides /
 * Actions / IP Address Assignment / Location Information. Overrides lives in
 * ApAdvancedOverridesTab; the other three are inline. All keys verified against
 * api/ap-detail-sample.json (ftm.*, ipAddress/ipNetmask/ipGateway,
 * maintainClientSession, apPersistence). secureTunnelMode is absent from the
 * capture (audit UQ-5) and therefore omitted.
 */
import React, { useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { FieldRow, OvrRow } from '../_kit';
import { EditorDialog } from './EditorDialog';
import { ApSelect, NumberField } from './controls';
import { ApAdvancedOverridesTab } from './ApAdvancedOverridesTab';
import { useApDraft, getIn } from './useApDraft';
import { hasFeature, inRange, IP_RE } from './apHelpers';
import type { ApDetail } from '../../../types/configure';

export interface ApAdvancedDialogProps {
  form: ApDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (form: ApDetail) => void;
}

export function ApAdvancedDialog({ form, open, onOpenChange, onApply }: ApAdvancedDialogProps) {
  const { form: d, upd, dirty } = useApDraft<ApDetail>(form);
  const [traceMsg, setTraceMsg] = useState('');
  const F = (f: string) => hasFeature(d.features, f);
  const dhcp = d.addrAssn !== false;

  const errs = useMemo(() => {
    const e: Record<string, string> = {};
    if (d.mgmtVlanIdOvr && d.mgmtVlanId != null && d.mgmtVlanId !== -1 && !inRange(d.mgmtVlanId, 1, 4094)) {
      e.vlan = 'Valid range 1 to 4094';
    }
    const mtuMax = F('JUMBO-FRAMES') ? 1800 : 1500;
    if (d.mtuOvr && !inRange(d.mtu, 1500, mtuMax)) e.mtu = `Valid range 1500 to ${mtuMax}`;
    if (d.pollTimeoutOvr && !inRange(d.pollTimeout, 2, 600)) e.poll = 'Valid range 2 to 600';
    if (!dhcp) {
      (['ipAddress', 'ipNetmask', 'ipGateway'] as const).forEach((k) => {
        const v = d[k];
        if (v && !IP_RE.test(v)) e[k] = 'Invalid IP address';
      });
    }
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, dhcp]);
  const valid = Object.keys(errs).length === 0;

  const gs = (p: string) => (getIn(d, p) as string | null | undefined) ?? '';

  return (
    <EditorDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Advanced Settings"
      maxWidth={720}
      okDisabled={!dirty || !valid}
      onOk={() => onApply(d)}
    >
      <Tabs defaultValue="overrides">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overrides">Overrides</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="ip">IP Assignment</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
        </TabsList>

        <TabsContent value="overrides" className="pt-4">
          <ApAdvancedOverridesTab d={d} upd={upd} errs={errs} />
        </TabsContent>

        <TabsContent value="actions" className="pt-4">
          {F('AP-TRACE') ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setTraceMsg('Trace retrieval requested (prototype stub — no controller connection).')}>
                  Retrieve Trace
                </Button>
                <Button variant="outline" size="sm" onClick={() => setTraceMsg('Trace download requested (prototype stub — no controller connection).')}>
                  Download Trace
                </Button>
              </div>
              {traceMsg && <p className="text-sm text-muted-foreground">{traceMsg}</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">AP trace is not supported on this model.</p>
          )}
        </TabsContent>

        <TabsContent value="ip" className="space-y-4 pt-4">
          <FieldRow label="IP Address Assignment" inline>
            <ApSelect className="w-36" value={dhcp ? 'DHCP' : 'Static'} options={['DHCP', 'Static']} onChange={(v) => upd('addrAssn', v === 'DHCP')} />
          </FieldRow>
          {!dhcp && (
            <>
              <FieldRow label="IP Address" error={errs.ipAddress}>
                <Input className="w-56" value={d.ipAddress ?? ''} placeholder="192.168.1.10" onChange={(e) => upd('ipAddress', e.target.value)} />
              </FieldRow>
              <FieldRow label="Netmask" error={errs.ipNetmask}>
                <Input className="w-56" value={d.ipNetmask ?? ''} placeholder="255.255.255.0" onChange={(e) => upd('ipNetmask', e.target.value)} />
              </FieldRow>
              <FieldRow label="Gateway" error={errs.ipGateway}>
                <Input className="w-56" value={d.ipGateway ?? ''} placeholder="192.168.1.1" onChange={(e) => upd('ipGateway', e.target.value)} />
              </FieldRow>
            </>
          )}
        </TabsContent>

        <TabsContent value="location" className="space-y-4 pt-4">
          <OvrRow
            label="LCI Override (WGS84)"
            overridden={!!getIn(d, 'ftm.wgs84Ovr')}
            onOverriddenChange={(v) => upd('ftm.wgs84Ovr', v)}
            inheritedDisplay="Inherited from site"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Lat</span>
              <NumberField className="w-24" value={getIn(d, 'ftm.wgs84.latitude') as number} onChange={(v) => upd('ftm.wgs84.latitude', v)} />
              <span className="text-xs text-muted-foreground">Long</span>
              <NumberField className="w-24" value={getIn(d, 'ftm.wgs84.longitude') as number} onChange={(v) => upd('ftm.wgs84.longitude', v)} />
              <span className="text-xs text-muted-foreground">Alt</span>
              <NumberField className="w-20" value={getIn(d, 'ftm.wgs84.altitude') as number} onChange={(v) => upd('ftm.wgs84.altitude', v)} />
            </div>
          </OvrRow>

          <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Z-Subelement</h4>
          <FieldRow label="Expected To Move" inline>
            <Switch checked={!!getIn(d, 'ftm.zSubelement.expectedToMove')} onCheckedChange={(v) => upd('ftm.zSubelement.expectedToMove', v)} />
          </FieldRow>
          <FieldRow label="Floor Number">
            <NumberField value={getIn(d, 'ftm.zSubelement.floorNumber') as number} onChange={(v) => upd('ftm.zSubelement.floorNumber', v)} />
          </FieldRow>
          <FieldRow label="Height Above Floor [m]">
            <NumberField value={getIn(d, 'ftm.zSubelement.aboveFloor.height') as number} onChange={(v) => upd('ftm.zSubelement.aboveFloor.height', v)} />
          </FieldRow>
          <FieldRow label="Height Uncertainty [m]">
            <NumberField value={getIn(d, 'ftm.zSubelement.aboveFloor.uncertainty') as number} onChange={(v) => upd('ftm.zSubelement.aboveFloor.uncertainty', v)} />
          </FieldRow>

          <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Civic Address (RFC 4776)</h4>
          <OvrRow
            label="Civic Address Override"
            overridden={!!getIn(d, 'ftm.civicAddress.ovr')}
            onOverriddenChange={(v) => upd('ftm.civicAddress.ovr', v)}
            inheritedDisplay="Inherited from site"
          >
            <Input className="w-full" value={gs('ftm.civicAddress.addr')} placeholder="TLV hex string" onChange={(e) => upd('ftm.civicAddress.addr', e.target.value)} />
          </OvrRow>

          <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Session</h4>
          <FieldRow label="Maintain Client Session" inline>
            <ApSelect className="w-36" value={d.maintainClientSession} options={['enabled', 'disabled']} onChange={(v) => upd('maintainClientSession', v)} />
          </FieldRow>
          <FieldRow label="AP Persistence" inline>
            <ApSelect className="w-36" value={d.apPersistence} options={['enabled', 'disabled']} onChange={(v) => upd('apPersistence', v)} />
          </FieldRow>
        </TabsContent>
      </Tabs>
    </EditorDialog>
  );
}
