/**
 * VLAN Advanced dialog (controller topologyAdvanced.html): Multicast Rules
 * (multicastBridging toggle, orderable filter table with the 9 predefined
 * groups, blockNonEssentialBroadcast gated to Bridged@AC/GRE) and Management
 * Access Rules (mgmtTrafficAcl, visible only with an L3 presence).
 */
import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { FieldRow } from '../_kit';
import { PREDEF_MCAST, RULE_PORT } from './constants';
import { EnumSelect, IconAction, NumInput } from './fields';
import type { MgmtAclRule, MulticastFilterRow, TopologyDraft } from './localTypes';
import { inRange } from './policyUtils';

const MGMT_ACTIONS = [
  { id: 'allow', label: 'Allow' },
  { id: 'deny', label: 'Deny' },
];
const MGMT_PROTOCOLS = [
  { id: 'any', label: 'Any' },
  { id: 'tcp', label: 'TCP' },
  { id: 'udp', label: 'UDP' },
  { id: 'icmp', label: 'ICMP' },
];

export interface VlanAdvancedDialogProps {
  form: TopologyDraft;
  upd: (path: string, value: unknown) => void;
  l3On: boolean;
  onClose: () => void;
}

type MgmtDraft = MgmtAclRule & { idx: number | null };

export function VlanAdvancedDialog({ form, upd, l3On, onClose }: VlanAdvancedDialogProps) {
  const [mgmtRule, setMgmtRule] = useState<MgmtDraft | null>(null);
  const mode = String(form.mode ?? 'BridgedAtAp');
  const filters = (form.multicastFilters ?? []) as MulticastFilterRow[];
  const acl = (form.mgmtTrafficAcl ?? []) as MgmtAclRule[];

  const setFilter = (i: number, patch: Partial<MulticastFilterRow>) => {
    const next = filters.slice();
    next[i] = { ...next[i], ...patch };
    upd('multicastFilters', next);
  };
  const moveFilter = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= filters.length) return;
    const next = filters.slice();
    [next[i], next[j]] = [next[j], next[i]];
    upd('multicastFilters', next);
  };
  const addFilter = (ip: string, ipCidr: number) =>
    upd('multicastFilters', [
      ...filters,
      { custId: null, id: null, canDelete: null, canEdit: null, ip, ipCidr, repl: true },
    ]);

  const mgmtValid =
    mgmtRule != null &&
    String(mgmtRule.ipAddressRange || '').length > 0 &&
    (mgmtRule.port !== 'userDefined' ||
      (inRange(mgmtRule.portLow, 0, 65535) && inRange(mgmtRule.portHigh, 0, 65535)));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Advanced Topology Settings</DialogTitle>
          <DialogDescription>Multicast bridging and management access control.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="multicast">
          <TabsList>
            <TabsTrigger value="multicast">Multicast Rules</TabsTrigger>
            {l3On && <TabsTrigger value="mgmt">Management Access Rules</TabsTrigger>}
          </TabsList>

          <TabsContent value="multicast" className="space-y-4 pt-4">
            <FieldRow label="Multicast Bridging" inline>
              <Switch
                checked={form.multicastBridging === true}
                onCheckedChange={(v) => upd('multicastBridging', v)}
              />
            </FieldRow>
            {form.multicastBridging === true && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addFilter('', 32)}
                  >
                    New Rule
                  </Button>
                  <EnumSelect
                    value=""
                    placeholder="Add Pre-Defined Rule…"
                    options={PREDEF_MCAST.map((p, i) => ({ id: String(i), label: p.text }))}
                    onChange={(v) => {
                      const p = PREDEF_MCAST[Number(v)];
                      if (p) addFilter(p.ip, p.ipCidr);
                    }}
                    className="w-72"
                    aria-label="Add predefined multicast rule"
                  />
                </div>
                {filters.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No multicast filter rules.</p>
                ) : (
                  <div className="space-y-1">
                    {filters.map((f, i) => {
                      const v6 = String(f.ip ?? '').includes(':');
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                        >
                          <span className="w-6 shrink-0 text-xs text-muted-foreground">
                            {i + 1}
                          </span>
                          <Input
                            value={f.ip ?? ''}
                            placeholder="224.0.0.0"
                            aria-label="Multicast IP"
                            onChange={(e) => setFilter(i, { ip: e.target.value })}
                            className="w-52"
                          />
                          <NumInput
                            value={f.ipCidr}
                            min={0}
                            max={v6 ? 128 : 32}
                            aria-label="CIDR"
                            onChange={(v) => setFilter(i, { ipCidr: v })}
                            className="w-20"
                          />
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Switch
                              checked={f.repl === true}
                              onCheckedChange={(v) => setFilter(i, { repl: v })}
                            />
                            Wireless Replication
                          </label>
                          <div className="ml-auto flex items-center gap-0.5">
                            <IconAction
                              title="Move rule up"
                              disabled={i === 0}
                              onClick={() => moveFilter(i, -1)}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </IconAction>
                            <IconAction
                              title="Move rule down"
                              disabled={i === filters.length - 1}
                              onClick={() => moveFilter(i, 1)}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </IconAction>
                            <IconAction
                              title="Delete rule"
                              destructive
                              onClick={() => {
                                const next = filters.slice();
                                next.splice(i, 1);
                                upd('multicastFilters', next);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconAction>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            {(mode === 'BridgedAtAc' || mode === 'Gre') && (
              <FieldRow
                label="Block Non-Essential Broadcast"
                description="ARP and DHCP broadcast traffic is always forwarded"
                inline
              >
                <Switch
                  checked={form.blockNonEssentialBroadcast === true}
                  onCheckedChange={(v) => upd('blockNonEssentialBroadcast', v)}
                />
              </FieldRow>
            )}
          </TabsContent>

          {l3On && (
            <TabsContent value="mgmt" className="space-y-4 pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setMgmtRule({
                    idx: null,
                    action: 'allow',
                    protocol: 'tcp',
                    ipAddressRange: '',
                    port: 'any',
                    portLow: '',
                    portHigh: '',
                  })
                }
              >
                New Rule
              </Button>
              {acl.length === 0 ? (
                <p className="text-sm text-muted-foreground">No management access rules.</p>
              ) : (
                <div className="space-y-1">
                  {acl.map((r, i) => (
                    <div
                      key={i}
                      className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-left text-sm"
                    >
                      <span className="w-16 capitalize">{r.action}</span>
                      <span className="w-16 uppercase text-muted-foreground">{r.protocol}</span>
                      <span className="flex-1 text-muted-foreground">{r.ipAddressRange}</span>
                      <span className="text-muted-foreground">
                        {r.port === 'userDefined' ? `${r.portLow}–${r.portHigh}` : r.port || 'any'}
                      </span>
                      <IconAction title="Edit rule" onClick={() => setMgmtRule({ idx: i, ...r })}>
                        <Pencil className="h-4 w-4" />
                      </IconAction>
                      <IconAction
                        title="Delete rule"
                        destructive
                        onClick={() => {
                          const next = acl.slice();
                          next.splice(i, 1);
                          upd('mgmtTrafficAcl', next);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconAction>
                    </div>
                  ))}
                </div>
              )}
              {mgmtRule && (
                <div className="space-y-4 rounded-md border border-border p-4">
                  <FieldRow label="Action">
                    <EnumSelect
                      value={mgmtRule.action}
                      options={MGMT_ACTIONS}
                      onChange={(v) => setMgmtRule({ ...mgmtRule, action: v })}
                      className="w-40"
                    />
                  </FieldRow>
                  <FieldRow label="Protocol">
                    <EnumSelect
                      value={mgmtRule.protocol}
                      options={MGMT_PROTOCOLS}
                      onChange={(v) => setMgmtRule({ ...mgmtRule, protocol: v })}
                      className="w-40"
                    />
                  </FieldRow>
                  <FieldRow label="IP / Subnet" required>
                    <Input
                      value={mgmtRule.ipAddressRange}
                      placeholder="10.0.0.0/24"
                      onChange={(e) => setMgmtRule({ ...mgmtRule, ipAddressRange: e.target.value })}
                    />
                  </FieldRow>
                  <FieldRow label="Port">
                    <EnumSelect
                      value={mgmtRule.port}
                      options={RULE_PORT}
                      onChange={(v) => setMgmtRule({ ...mgmtRule, port: v })}
                    />
                  </FieldRow>
                  {mgmtRule.port === 'userDefined' && (
                    <div className="flex gap-4">
                      <FieldRow label="Port From">
                        <NumInput
                          value={mgmtRule.portLow}
                          min={0}
                          max={65535}
                          onChange={(v) => setMgmtRule({ ...mgmtRule, portLow: v })}
                        />
                      </FieldRow>
                      <FieldRow label="Port To">
                        <NumInput
                          value={mgmtRule.portHigh}
                          min={0}
                          max={65535}
                          onChange={(v) => setMgmtRule({ ...mgmtRule, portHigh: v })}
                        />
                      </FieldRow>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setMgmtRule(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!mgmtValid}
                      onClick={() => {
                        const next = acl.slice();
                        const { idx, ...rec } = mgmtRule;
                        if (idx != null) next[idx] = rec;
                        else next.push(rec);
                        upd('mgmtTrafficAcl', next);
                        setMgmtRule(null);
                      }}
                    >
                      Save Rule
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
