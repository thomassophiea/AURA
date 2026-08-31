/**
 * VLAN / Topology editor (controller topology.html parity):
 *  - the 5 user modes only; internal modes (Routed/Physical/Management) and
 *    canEdit:false records render read-only
 *  - VLAN ID 1–4094; Tagged hidden for VXLAN, forced for Fabric Attach, GRE
 *    untagged-support tooltip; no MTU field (VXLAN gets the static note)
 *  - Bridged@AC: Port select (vlanMapToEsa) and the ONLY mode with Layer 3
 *    (IP/CIDR/FQDN, device registration, mgmt traffic, certificates, DHCP
 *    None/Relay/Local with the Configure dialogs)
 *  - GRE: existing concentrators render READ-ONLY with a Legacy Configuration
 *    warning — Tunnel Concentrators are deprecated, no authoring surface (§7a)
 *  - Peer Address (foreignIpAddress) on a paired appliance — shown for every
 *    mode but Bridged@AP, required on Bridged@AC with Layer 3 (the Gateway's
 *    own gate); pairing state loads once per editor open via isPaired()
 *  - Advanced dialog for locally-proxied topologies (multicast + mgmt ACL)
 */
import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Checkbox } from '../../ui/checkbox';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { EditorSheet, FieldRow, Section } from '../_kit';
import { EnumSelect, NumInput } from './fields';
import { DhcpLocalDialog, DhcpRelayDialog } from './VlanDhcpDialogs';
import { VlanAdvancedDialog } from './VlanAdvancedDialog';
import { VlanGreSection } from './VlanGreSection';
import { DHCP_MODES, PHYS_IFACES, TOPOLOGY_MODES } from './constants';
import {
  fmtMode,
  isInternalMode,
  peerAddressApplies,
  peerAddressError,
  peerBlockVisible,
  topologyErrors,
} from './policyUtils';
import { useDraft } from './useDraft';
import type { TopologyDraft } from './localTypes';
import { isPaired } from '../../../services/configure/availabilityService';

export interface VlanEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Record to edit, or the /default seed for creates. */
  initial: TopologyDraft;
  isNew: boolean;
  saving: boolean;
  onSubmit: (payload: TopologyDraft, id?: string) => void | Promise<void>;
}

export function VlanEditor({
  open,
  onOpenChange,
  initial,
  isNew,
  saving,
  onSubmit,
}: VlanEditorProps) {
  const { form, upd, dirty } = useDraft<TopologyDraft>(initial);
  const [dialog, setDialog] = useState<'relay' | 'local' | 'adv' | 'cert' | null>(null);

  /* HA pairing gates the Peer Address block — loaded once per editor open
     (isPaired() is cached in the service; no polling). */
  const [paired, setPaired] = useState(false);
  useEffect(() => {
    let alive = true;
    void isPaired().then((v) => {
      if (alive) setPaired(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const canEdit = form.canEdit !== false;
  const mode = String(form.mode || 'BridgedAtAp');
  const internal = isInternalMode(mode);
  const l3Capable = mode === 'BridgedAtAc';
  const l3On = l3Capable && form.l3Presence === true;
  const peerApplies = peerAddressApplies(paired, form);

  const errs = { ...topologyErrors(form), ...peerAddressError(paired, form) };
  const valid = Object.keys(errs).length === 0;
  const l3Valid = l3On && !errs.ip && !errs.cidr;

  return (
    <>
      <EditorSheet
        open={open}
        onOpenChange={onOpenChange}
        title={isNew ? 'Add VLAN' : String(form.name || 'VLAN')}
        description={internal ? 'Internal topology (read-only)' : `Mode: ${fmtMode(mode)}`}
        width={780}
        dirty={dirty}
        valid={canEdit && valid}
        saving={saving}
        onSave={() => void onSubmit(form, isNew ? undefined : (form.id as string))}
      >
        <div className="space-y-6">
          <Section title="General">
            <FieldRow label="Name" required error={canEdit ? errs.name : undefined}>
              <Input
                value={String(form.name ?? '')}
                maxLength={32}
                placeholder="VLAN Name"
                readOnly={!canEdit}
                onChange={(e) => upd('name', e.target.value)}
                className="w-80"
              />
            </FieldRow>
            <FieldRow label="Mode">
              {canEdit && !internal ? (
                <EnumSelect
                  value={mode}
                  options={TOPOLOGY_MODES}
                  onChange={(v) => upd('mode', v)}
                  aria-label="Topology mode"
                />
              ) : (
                <span className="text-sm text-muted-foreground">{fmtMode(mode)}</span>
              )}
            </FieldRow>

            {mode === 'FabricAttach' && (
              <FieldRow label="I-SID" required error={errs.isid}>
                <NumInput
                  value={(form.isid as number) ?? ''}
                  min={1}
                  max={16777215}
                  onChange={(v) => upd('isid', v)}
                  className="w-40"
                />
              </FieldRow>
            )}

            {mode === 'Vxlan' && (
              <>
                <FieldRow label="VNI" required error={errs.vni}>
                  <NumInput
                    value={(form.vni as number) ?? ''}
                    min={1}
                    max={16777215}
                    onChange={(v) => upd('vni', v)}
                    className="w-40"
                  />
                </FieldRow>
                <FieldRow
                  label="Remote VTEP"
                  required
                  error={errs.vtep}
                  description="An MTU of 1500 is applied to VXLAN topologies"
                >
                  <Input
                    value={String(form.remoteVtepIp ?? '')}
                    placeholder="10.0.0.1"
                    onChange={(e) => upd('remoteVtepIp', e.target.value)}
                    className="w-56"
                  />
                </FieldRow>
              </>
            )}

            {l3Capable && (
              <FieldRow label="Port" description="Physical interface (vlanMapToEsa)">
                <EnumSelect
                  value={
                    form.vlanMapToEsa != null && Number(form.vlanMapToEsa) >= 0
                      ? String(form.vlanMapToEsa)
                      : ''
                  }
                  options={[{ id: '', label: '— Select —' }, ...PHYS_IFACES]}
                  onChange={(v) => upd('vlanMapToEsa', v === '' ? -1 : Number(v))}
                  disabled={!canEdit}
                  className="w-44"
                  aria-label="Port"
                />
              </FieldRow>
            )}

            <FieldRow label="VLAN ID" required error={canEdit ? errs.vlanid : undefined}>
              <div className="flex flex-wrap items-center gap-6">
                <NumInput
                  value={(form.vlanid as number) ?? ''}
                  min={1}
                  max={4094}
                  disabled={!canEdit}
                  aria-label="VLAN ID"
                  onChange={(v) => upd('vlanid', v)}
                  className="w-28"
                />
                {/* Tagged: hidden for VXLAN, disabled for Fabric Attach, GRE note */}
                {mode !== 'Vxlan' && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Tagged</span>
                    <Checkbox
                      checked={form.tagged === true}
                      disabled={!canEdit || mode === 'FabricAttach'}
                      aria-label="Tagged"
                      onCheckedChange={(checked) => upd('tagged', checked === true)}
                    />
                    {mode === 'Gre' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Untagged VLAN is supported only with an Extreme Tunnel Concentrator
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}
              </div>
            </FieldRow>
          </Section>

          {mode === 'Gre' && (
            <Section title="Tunnel Concentrators">
              <VlanGreSection form={form} />
            </Section>
          )}

          {/* ── Layer 3 — exists ONLY for Bridged@AC ── */}
          {l3Capable && (
            <Section title="Layer 3">
              <FieldRow label="Layer 3 Presence" inline>
                <Switch
                  checked={form.l3Presence === true}
                  disabled={!canEdit}
                  onCheckedChange={(checked) => upd('l3Presence', checked)}
                />
              </FieldRow>
              {l3On && (
                <>
                  <FieldRow label="IP Address" required error={errs.ip}>
                    <Input
                      value={String(form.ipAddress ?? '')}
                      placeholder="10.0.0.1"
                      onChange={(e) => upd('ipAddress', e.target.value)}
                      className="w-56"
                    />
                  </FieldRow>
                  <FieldRow label="CIDR" required error={errs.cidr}>
                    <NumInput
                      value={(form.cidr as number) ?? ''}
                      min={0}
                      max={32}
                      placeholder="24"
                      onChange={(v) => upd('cidr', v)}
                      className="w-28"
                    />
                  </FieldRow>
                  <FieldRow label="FQDN">
                    <Input
                      value={String(form.fqdn ?? '')}
                      placeholder="vlan.example.com"
                      onChange={(e) => upd('fqdn', e.target.value)}
                      className="w-64"
                    />
                  </FieldRow>
                  <FieldRow label="Enable Device Registration" inline>
                    <Checkbox
                      checked={form.apRegistration === true}
                      onCheckedChange={(checked) => upd('apRegistration', checked === true)}
                    />
                  </FieldRow>
                  <FieldRow label="Mgmt Traffic" inline>
                    <Checkbox
                      checked={form.enableMgmtTraffic === true}
                      onCheckedChange={(checked) => upd('enableMgmtTraffic', checked === true)}
                    />
                  </FieldRow>
                  {!isNew && valid && (
                    <FieldRow label="Certificates">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDialog('cert')}
                      >
                        Configure
                      </Button>
                    </FieldRow>
                  )}
                  <FieldRow label="DHCP">
                    <div className="flex items-center gap-3">
                      <EnumSelect
                        value={String(form.dhcpMode || 'DHCPNone')}
                        options={DHCP_MODES}
                        onChange={(v) => upd('dhcpMode', v)}
                        className="w-44"
                        aria-label="DHCP mode"
                      />
                      {form.dhcpMode === 'DHCPRelay' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDialog('relay')}
                        >
                          Configure
                        </Button>
                      )}
                      {form.dhcpMode === 'DHCPLocal' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!l3Valid}
                          onClick={() => setDialog('local')}
                        >
                          Configure
                        </Button>
                      )}
                    </div>
                  </FieldRow>
                </>
              )}
            </Section>
          )}

          {/* ── Peer Address — paired appliances only, and never on Bridged@AP
              (topology.html ng-if="paired && topology.mode !== 'BridgedAtAp'").
              The address itself belongs to the Bridged@AC + Layer 3 case; on
              the other modes the Gateway shows the block without an input. ── */}
          {peerBlockVisible(paired, form) && (
            <Section title="Peer Address">
              {peerApplies ? (
                <FieldRow
                  label="IP Address"
                  required
                  error={errs.peer}
                  description="The Layer 3 address this VLAN carries on the paired appliance."
                >
                  <Input
                    value={String(form.foreignIpAddress ?? '')}
                    placeholder="10.0.0.2"
                    onChange={(e) => upd('foreignIpAddress', e.target.value)}
                    className="w-56"
                  />
                </FieldRow>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {mode === 'BridgedAtAc'
                    ? 'Enable Layer 3 to give this VLAN a peer address on the paired appliance.'
                    : 'A peer address applies to Bridged@AC topologies with Layer 3.'}
                </p>
              )}
            </Section>
          )}

          {/* Advanced — shown for locally-proxied topologies */}
          {(form.proxied ?? 'Local') === 'Local' && (
            <Button type="button" variant="outline" onClick={() => setDialog('adv')}>
              Advanced
            </Button>
          )}

          <Section title="Members">
            <FieldRow label="Associated Profiles">
              <span className="text-sm text-muted-foreground">
                {((form.profiles as unknown[] | undefined) ?? []).length > 0
                  ? `${((form.profiles as unknown[]) ?? []).length} profile(s)`
                  : 'Vlan is not associated with any Profiles'}
              </span>
            </FieldRow>
          </Section>
        </div>
      </EditorSheet>

      {dialog === 'relay' && (
        <DhcpRelayDialog form={form} upd={upd} onClose={() => setDialog(null)} />
      )}
      {dialog === 'local' && (
        <DhcpLocalDialog form={form} upd={upd} onClose={() => setDialog(null)} />
      )}
      {dialog === 'adv' && (
        <VlanAdvancedDialog form={form} upd={upd} l3On={l3On} onClose={() => setDialog(null)} />
      )}
      {/* L3 interface certificates (cert/certCa) — assignment stub with real fields */}
      {dialog === 'cert' && (
        <Dialog open onOpenChange={(next) => !next && setDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Interface Certificates</DialogTitle>
              <DialogDescription>
                Certificate generation and installation run on the controller.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <FieldRow label="Certificate">
                <span className="text-sm text-muted-foreground">
                  {Number(form.cert) ? `Assigned (#${form.cert})` : 'None assigned'}
                </span>
              </FieldRow>
              <FieldRow label="CA Certificate">
                <span className="text-sm text-muted-foreground">
                  {Number(form.certCa) ? `Assigned (#${form.certCa})` : 'None assigned'}
                </span>
              </FieldRow>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => setDialog(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
