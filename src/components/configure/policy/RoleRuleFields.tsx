/**
 * Field blocks shared by the four RoleRuleDialog variants (rule-editor.html):
 * direction selects (From/To User pair vs the src-dest single Direction),
 * action + contain-VLAN + per-rule CoS, the flat L3 port block (ICMP hides
 * ports), and the nested src-dest endpoint (subnetType/address/port.known).
 */
import React from 'react';
import { Input } from '../../ui/input';
import { FieldRow } from '../_kit';
import { EnumSelect, NumInput } from './fields';
import {
  PORT_RANGE,
  RULE_ACTIONS,
  RULE_FILTER_DIRS,
  RULE_PORT,
  RULE_SUBNET,
  SRC_DEST_ACTIONS,
  SRC_DEST_DIRECTIONS,
  type Opt,
} from './constants';
import { getIn, wellKnownPortLabel } from './policyUtils';
import type { RoleRuleDraft } from './localTypes';

export interface RuleBlockProps {
  draft: RoleRuleDraft;
  set: (path: string, value: unknown) => void;
  errs: Record<string, string>;
}

const str = (draft: RoleRuleDraft, path: string) => String(getIn(draft, path) ?? '');

/** From User / To User pair for L2/L3/L7; single Direction for src-dest. */
export function DirectionFields({ draft, set, sd }: RuleBlockProps & { sd: boolean }) {
  if (sd) {
    return (
      <FieldRow label="Direction">
        <EnumSelect
          value={str(draft, 'direction') || 'OUTBOUND'}
          options={SRC_DEST_DIRECTIONS}
          onChange={(v) => set('direction', v)}
        />
      </FieldRow>
    );
  }
  return (
    <>
      <FieldRow label="From User">
        <EnumSelect
          value={str(draft, 'outFromNetwork') || 'sourceAddr'}
          options={RULE_FILTER_DIRS}
          onChange={(v) => set('outFromNetwork', v)}
          className="w-64"
        />
      </FieldRow>
      <FieldRow label="To User">
        <EnumSelect
          value={str(draft, 'intoNetwork') || 'destAddr'}
          options={RULE_FILTER_DIRS}
          onChange={(v) => set('intoNetwork', v)}
          className="w-64"
        />
      </FieldRow>
    </>
  );
}

/** Action select; VLAN reveal (required) on Contain to VLAN; CoS always offered. */
export function ActionFields({
  draft,
  set,
  errs,
  sd,
  contain,
  vlanOptions,
  cosOptions,
}: RuleBlockProps & { sd: boolean; contain: boolean; vlanOptions: Opt[]; cosOptions: Opt[] }) {
  return (
    <>
      <FieldRow label="Action">
        <EnumSelect
          value={str(draft, 'action') || (sd ? 'DENY' : 'FILTERACTION_DENY')}
          options={sd ? SRC_DEST_ACTIONS : RULE_ACTIONS}
          onChange={(v) => set('action', v)}
        />
      </FieldRow>
      {contain && (
        <FieldRow label="Contain to VLAN" required error={errs.topology}>
          <EnumSelect
            value={str(draft, 'topologyId')}
            options={[{ id: '', label: '— VLAN —' }, ...vlanOptions]}
            onChange={(v) => set('topologyId', v || null)}
            className="w-64"
          />
        </FieldRow>
      )}
      <FieldRow label="Class of Service">
        <EnumSelect
          value={str(draft, 'cosId')}
          options={[{ id: '', label: 'None' }, ...cosOptions]}
          onChange={(v) => set('cosId', v || null)}
          className="w-64"
        />
      </FieldRow>
    </>
  );
}

/** Flat L3 port block — REAL API keys port/portLow/portHigh; ICMP → type/code. */
export function L3PortFields({ draft, set, errs, isIcmp }: RuleBlockProps & { isIcmp: boolean }) {
  if (isIcmp) {
    // Port column hidden for ICMP; type/code editor instead (icmp.html)
    return (
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
    );
  }
  return (
    <>
      <FieldRow label="Port">
        <EnumSelect
          value={str(draft, 'port') || 'any'}
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
}

/** Src-dest nested endpoint: { subnetType, address, port.known/.low/.high }. */
export function SrcDestEndpointFields({
  draft,
  set,
  errs,
  isIcmp,
  title,
  base,
}: RuleBlockProps & { isIcmp: boolean; title: 'Source' | 'Destination'; base: 'source' | 'destination' }) {
  const subnetType = str(draft, `${base}.subnetType`) || 'anyIpAddress';
  const known = str(draft, `${base}.port.known`) || 'any';
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
            value={str(draft, `${base}.address`)}
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
}
