/**
 * Rule popover for the Role editor — one dialog covering all four groups
 * (rulePopover / rule-editor.html parity):
 *  - L2: Ethertype (userDefined → hex), MAC type/address, direction pair
 *  - L3/L4: protocol (ICMP hides ports → type/code), subnet/FQDN, well-known
 *    port writing flat port/portLow/portHigh, ToS/DSCP + mask
 *  - L3 Src-Dest: nested source/destination endpoints, single Direction
 *    (OUTBOUND "From User" / INBOUND "To User"), unprefixed action enum
 *  - L7: application group/name (39xx note)
 * Per-rule CoS is ALWAYS offered; VLAN reveal only on Contain to VLAN (required).
 */
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { FieldRow } from '../_kit';
import { EnumSelect, NumInput } from './fields';
import { TosDscpDialog, TosRow } from './TosDscpDialog';
import {
  PORT_RANGE,
  RULE_ACTIONS,
  RULE_ETHERTYPES,
  RULE_FILTER_DIRS,
  RULE_MAC,
  RULE_MASKS,
  RULE_PORT,
  RULE_PROTO,
  RULE_SUBNET,
  SRC_DEST_ACTIONS,
  SRC_DEST_DIRECTIONS,
  type Opt,
} from './constants';
import {
  containActionId,
  getIn,
  isSrcDest,
  ruleErrors,
  ruleProtocolName,
  wellKnownPortLabel,
} from './policyUtils';
import { setIn } from './policyUtils';
import type { RoleRuleDraft, RoleRuleGroupKey } from './localTypes';

export interface RoleRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupKey: RoleRuleGroupKey;
  groupLabel: string;
  /** Deep-cloned draft; index null → append. */
  initialDraft: RoleRuleDraft;
  editIndex: number | null;
  vlanOptions: Opt[];
  cosOptions: Opt[];
  onSave: (draft: RoleRuleDraft) => void;
}

export function RoleRuleDialog({
  open,
  onOpenChange,
  groupKey,
  groupLabel,
  initialDraft,
  editIndex,
  vlanOptions,
  cosOptions,
  onSave,
}: RoleRuleDialogProps) {
  const [draft, setDraft] = useState<RoleRuleDraft>(initialDraft);
  const [tosOpen, setTosOpen] = useState(false);

  const set = (path: string, value: unknown) => setDraft((d) => setIn(d, path, value));
  const str = (path: string) => String(getIn(draft, path) ?? '');

  const sd = isSrcDest(groupKey);
  const errs = ruleErrors(groupKey, draft);
  const valid = Object.keys(errs).length === 0;
  const contain = draft.action === containActionId(groupKey);
  const proto = ruleProtocolName(draft, groupKey);
  const isIcmp = proto === 'icmp' || proto === 'icmpv6';

  /* From User / To User pair for L2/L3/L7; single Direction for src-dest. */
  const directionBlock = sd ? (
    <FieldRow label="Direction">
      <EnumSelect
        value={str('direction') || 'OUTBOUND'}
        options={SRC_DEST_DIRECTIONS}
        onChange={(v) => set('direction', v)}
      />
    </FieldRow>
  ) : (
    <>
      <FieldRow label="From User">
        <EnumSelect
          value={str('outFromNetwork') || 'sourceAddr'}
          options={RULE_FILTER_DIRS}
          onChange={(v) => set('outFromNetwork', v)}
          className="w-64"
        />
      </FieldRow>
      <FieldRow label="To User">
        <EnumSelect
          value={str('intoNetwork') || 'destAddr'}
          options={RULE_FILTER_DIRS}
          onChange={(v) => set('intoNetwork', v)}
          className="w-64"
        />
      </FieldRow>
    </>
  );

  const actionBlock = (
    <>
      <FieldRow label="Action">
        <EnumSelect
          value={str('action') || (sd ? 'DENY' : 'FILTERACTION_DENY')}
          options={sd ? SRC_DEST_ACTIONS : RULE_ACTIONS}
          onChange={(v) => set('action', v)}
        />
      </FieldRow>
      {contain && (
        <FieldRow label="Contain to VLAN" required error={errs.topology}>
          <EnumSelect
            value={str('topologyId')}
            options={[{ id: '', label: '— VLAN —' }, ...vlanOptions]}
            onChange={(v) => set('topologyId', v || null)}
            className="w-64"
          />
        </FieldRow>
      )}
      <FieldRow label="Class of Service">
        <EnumSelect
          value={str('cosId')}
          options={[{ id: '', label: 'None' }, ...cosOptions]}
          onChange={(v) => set('cosId', v || null)}
          className="w-64"
        />
      </FieldRow>
    </>
  );

  const tosBlock = (
    <FieldRow label="ToS/DSCP">
      <TosRow
        tosDscp={(draft.tosDscp as number) ?? 0}
        onTosChange={(v) => set('tosDscp', v ?? 0)}
        maskValue={draft.mask != null ? String(draft.mask) : '0'}
        maskOptions={RULE_MASKS}
        onMaskChange={(v) => set('mask', Number(v))}
        onConfigure={() => setTosOpen(true)}
      />
    </FieldRow>
  );

  /* Flat L3 port block — REAL API keys port/portLow/portHigh. */
  const l3PortBlock = isIcmp ? (
    // Port column hidden for ICMP; type/code editor instead (icmp.html)
    <>
      <FieldRow label="ICMP Type">
        <NumInput
          value={draft.portLow ?? ''}
          min={0}
          max={255}
          placeholder="0–255"
          onChange={(v) => set('portLow', v)}
        />
      </FieldRow>
      <FieldRow label="ICMP Code">
        <NumInput
          value={draft.portHigh ?? ''}
          min={0}
          max={255}
          placeholder="0–255"
          onChange={(v) => set('portHigh', v)}
        />
      </FieldRow>
    </>
  ) : (
    <>
      <FieldRow label="Port">
        <EnumSelect
          value={str('port') || 'any'}
          options={RULE_PORT}
          onChange={(v) => {
            set('port', v);
            const range = PORT_RANGE[v];
            if (range) {
              set('portLow', range[0]);
              set('portHigh', range[1]);
            }
          }}
        />
      </FieldRow>
      {draft.port === 'userDefined' && (
        <>
          <FieldRow label="Port From" error={errs.port}>
            <NumInput
              value={draft.portLow ?? ''}
              min={0}
              max={65535}
              placeholder="e.g. 1024"
              onChange={(v) => set('portLow', v)}
            />
          </FieldRow>
          <FieldRow label="Port To">
            <NumInput
              value={draft.portHigh ?? ''}
              min={0}
              max={65535}
              placeholder="e.g. 2048"
              onChange={(v) => set('portHigh', v)}
            />
          </FieldRow>
        </>
      )}
      {draft.port && draft.port !== 'userDefined' && draft.port !== 'any' && (
        <FieldRow label="Port Range">
          <span className="text-sm text-muted-foreground">
            {draft.portLow != null && draft.portLow !== ''
              ? `${draft.portLow}–${draft.portHigh}`
              : wellKnownPortLabel(draft.port)}
          </span>
        </FieldRow>
      )}
    </>
  );

  /* Src-dest nested endpoint (source/destination { subnetType, address, port.known/.low/.high }). */
  const endpointBlock = (title: 'Source' | 'Destination', base: 'source' | 'destination') => {
    const subnetType = str(`${base}.subnetType`) || 'anyIpAddress';
    const known = str(`${base}.port.known`) || 'any';
    return (
      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
        <FieldRow label="Subnet Type">
          <EnumSelect
            value={subnetType}
            options={RULE_SUBNET}
            onChange={(v) => set(`${base}.subnetType`, v)}
          />
        </FieldRow>
        {subnetType !== 'anyIpAddress' && (
          <FieldRow label="Address" error={errs[`${base}Addr`]}>
            <Input
              value={str(`${base}.address`)}
              placeholder={subnetType === 'hostName' ? 'host.example.com' : '10.0.0.0/24'}
              onChange={(e) => set(`${base}.address`, e.target.value)}
              className="w-64"
            />
          </FieldRow>
        )}
        {!isIcmp && (
          <>
            <FieldRow label="Port" error={errs[base]}>
              <EnumSelect
                value={known}
                options={RULE_PORT}
                onChange={(v) => set(`${base}.port.known`, v)}
              />
            </FieldRow>
            {known === 'userDefined' && (
              <div className="flex gap-4">
                <FieldRow label="Port From">
                  <NumInput
                    value={(getIn(draft, `${base}.port.low`) as number | '') ?? ''}
                    min={0}
                    max={65535}
                    onChange={(v) => set(`${base}.port.low`, v)}
                  />
                </FieldRow>
                <FieldRow label="Port To">
                  <NumInput
                    value={(getIn(draft, `${base}.port.high`) as number | '') ?? ''}
                    min={0}
                    max={65535}
                    onChange={(v) => set(`${base}.port.high`, v)}
                  />
                </FieldRow>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const nameRow = (
    <FieldRow label="Rule Name" error={errs.name}>
      <Input
        value={str('name')}
        maxLength={64}
        onChange={(e) => set('name', e.target.value)}
        className="w-72"
      />
    </FieldRow>
  );

  let body: React.ReactNode;
  if (groupKey === 'l2Filters') {
    body = (
      <>
        {nameRow}
        <FieldRow label="Ethertype">
          <EnumSelect
            value={str('ethertype') || 'ipv4'}
            options={RULE_ETHERTYPES}
            onChange={(v) => set('ethertype', v)}
          />
        </FieldRow>
        {draft.ethertype === 'userDefined' && (
          <FieldRow label="Ethertype Value" error={errs.ether}>
            <Input
              value={str('ethertypeValue')}
              placeholder="0x8100"
              onChange={(e) => set('ethertypeValue', e.target.value)}
              className="w-40"
            />
          </FieldRow>
        )}
        <FieldRow label="MAC Address Type">
          <EnumSelect
            value={str('macAddrType') || 'any'}
            options={RULE_MAC}
            onChange={(v) => set('macAddrType', v)}
          />
        </FieldRow>
        {draft.macAddrType && draft.macAddrType !== 'any' && (
          <FieldRow label="MAC Address">
            <Input
              value={str('macAddress')}
              placeholder="aa:bb:cc:dd:ee:ff"
              onChange={(e) => set('macAddress', e.target.value)}
              className="w-56"
            />
          </FieldRow>
        )}
        {directionBlock}
        {actionBlock}
      </>
    );
  } else if (groupKey === 'l7Filters') {
    body = (
      <>
        {nameRow}
        <FieldRow
          label="Application Group"
          description="Application rules are supported by AP39xx access points"
        >
          <Input
            value={str('appGroup')}
            placeholder="e.g. Web Applications"
            onChange={(e) => set('appGroup', e.target.value)}
            className="w-64"
          />
        </FieldRow>
        <FieldRow label="Application">
          <Input
            value={str('application')}
            placeholder="e.g. YouTube"
            onChange={(e) => set('application', e.target.value)}
            className="w-64"
          />
        </FieldRow>
        {directionBlock}
        {actionBlock}
      </>
    );
  } else if (groupKey === 'l3SrcDestFilters') {
    body = (
      <>
        {nameRow}
        <FieldRow label="Protocol">
          <EnumSelect
            value={str('protocol.name') || 'any'}
            options={RULE_PROTO}
            onChange={(v) => set('protocol.name', v)}
          />
        </FieldRow>
        {isIcmp && (
          <div className="flex gap-4">
            <FieldRow label="ICMP Type">
              <NumInput
                value={draft.icmpType ?? ''}
                min={0}
                max={255}
                onChange={(v) => set('icmpType', v)}
              />
            </FieldRow>
            <FieldRow label="ICMP Code">
              <NumInput
                value={draft.icmpCode ?? ''}
                min={0}
                max={255}
                onChange={(v) => set('icmpCode', v)}
              />
            </FieldRow>
          </div>
        )}
        {endpointBlock('Source', 'source')}
        {endpointBlock('Destination', 'destination')}
        {tosBlock}
        {directionBlock}
        {actionBlock}
      </>
    );
  } else {
    body = (
      <>
        {nameRow}
        <FieldRow label="Protocol">
          <EnumSelect
            value={typeof draft.protocol === 'string' ? draft.protocol : 'any'}
            options={RULE_PROTO}
            onChange={(v) => set('protocol', v)}
          />
        </FieldRow>
        <FieldRow label="Subnet Type">
          <EnumSelect
            value={str('subnetType') || 'anyIpAddress'}
            options={RULE_SUBNET}
            onChange={(v) => set('subnetType', v)}
          />
        </FieldRow>
        {draft.subnetType && draft.subnetType !== 'anyIpAddress' && (
          <FieldRow label="IP Address / Range" error={errs.addr}>
            <Input
              value={str('ipAddressRange')}
              placeholder={draft.subnetType === 'hostName' ? 'host.example.com' : '10.0.0.0/24'}
              onChange={(e) => set('ipAddressRange', e.target.value)}
              className="w-64"
            />
          </FieldRow>
        )}
        {l3PortBlock}
        {tosBlock}
        {directionBlock}
        {actionBlock}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {(editIndex != null ? 'Edit Rule: ' : 'New Rule: ') + groupLabel}
            </DialogTitle>
            <DialogDescription>
              Rules evaluate top-down; order can be changed from the rule list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">{body}</div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!valid} onClick={() => onSave(draft)}>
              {editIndex != null ? 'Save Rule' : 'Add Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {tosOpen && (
        <TosDscpDialog
          open={tosOpen}
          onOpenChange={setTosOpen}
          value={(draft.tosDscp as number) ?? 0}
          onApply={(v) => set('tosDscp', v)}
        />
      )}
    </>
  );
}
