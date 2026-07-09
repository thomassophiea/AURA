/**
 * VLAN DHCP dialogs (controller dhcpRelayEdit / dhcpLocalEdit): Relay binds
 * the REAL `dhcpServers` key; Local carries domain, default+max lease, DNS,
 * WINS, required gateway, address range, and the dhcpExclusions[] sub-editor
 * (range/single + comment).
 */
import React, { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
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
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';
import { FieldRow } from '../_kit';
import { IconAction, NumInput } from './fields';
import type { DhcpExclusion, TopologyDraft } from './localTypes';
import { IP_RE } from './policyUtils';

interface DhcpDialogProps {
  form: TopologyDraft;
  upd: (path: string, value: unknown) => void;
  onClose: () => void;
}

export function DhcpRelayDialog({ form, upd, onClose }: DhcpDialogProps) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>DHCP Relay</DialogTitle>
          <DialogDescription>Forward DHCP requests to external servers.</DialogDescription>
        </DialogHeader>
        <FieldRow label="DHCP Servers" description="Comma-separated server addresses">
          <Input
            value={String(form.dhcpServers ?? '')}
            placeholder="10.1.1.5, 10.1.1.6"
            onChange={(e) => upd('dhcpServers', e.target.value)}
          />
        </FieldRow>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ExclusionDraft extends DhcpExclusion {
  idx: number | null;
}

export function DhcpLocalDialog({ form, upd, onClose }: DhcpDialogProps) {
  const [showExclusions, setShowExclusions] = useState(false);
  const [excl, setExcl] = useState<ExclusionDraft | null>(null);

  const exclusions = (form.dhcpExclusions ?? []) as DhcpExclusion[];
  const gateway = String(form.gateway ?? '');
  const gwMissing = !IP_RE.test(gateway) || gateway === '0.0.0.0';
  const exclValid =
    excl != null &&
    IP_RE.test(String(excl.rangeFrom || '')) &&
    (excl.mode !== 'range' || IP_RE.test(String(excl.rangeTo || '')));

  const ipValue = (v: unknown) => (v === '0.0.0.0' ? '' : String(v ?? ''));

  const saveExclusion = () => {
    if (!excl || !exclValid) return;
    const next = exclusions.slice();
    const rec: DhcpExclusion = {
      mode: excl.mode,
      rangeFrom: excl.rangeFrom,
      rangeTo: excl.mode === 'range' ? excl.rangeTo : excl.rangeFrom,
      comment: excl.comment,
    };
    if (excl.idx != null) next[excl.idx] = rec;
    else next.push(rec);
    upd('dhcpExclusions', next);
    setExcl(null);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Local DHCP Server</DialogTitle>
          <DialogDescription>Lease, DNS/WINS and address-range settings.</DialogDescription>
        </DialogHeader>
        {!showExclusions ? (
          <div className="space-y-4">
            <FieldRow label="Domain Name">
              <Input
                value={String(form.dhcpDomain ?? '')}
                onChange={(e) => upd('dhcpDomain', e.target.value)}
              />
            </FieldRow>
            <FieldRow label="Lease (seconds) — default">
              <NumInput
                value={(form.dhcpDefaultLease as number | undefined) ?? 36000}
                max={2147483647}
                onChange={(v) => upd('dhcpDefaultLease', v)}
                className="w-40"
              />
            </FieldRow>
            <FieldRow label="Lease (seconds) — max">
              <NumInput
                value={(form.dhcpMaxLease as number | undefined) ?? 2592000}
                max={2147483647}
                onChange={(v) => upd('dhcpMaxLease', v)}
                className="w-40"
              />
            </FieldRow>
            <FieldRow label="DNS Servers">
              <Input
                value={String(form.dhcpDnsServers ?? '')}
                placeholder="8.8.8.8, 1.1.1.1"
                onChange={(e) => upd('dhcpDnsServers', e.target.value)}
              />
            </FieldRow>
            <FieldRow label="WINS">
              <Input value={String(form.wins ?? '')} onChange={(e) => upd('wins', e.target.value)} />
            </FieldRow>
            <FieldRow
              label="Gateway"
              required
              error={gwMissing ? 'A valid gateway address is required' : undefined}
            >
              <Input
                value={ipValue(form.gateway)}
                placeholder="10.0.0.254"
                onChange={(e) => upd('gateway', e.target.value)}
              />
            </FieldRow>
            <FieldRow label="Address Range — from">
              <Input
                value={ipValue(form.dhcpStartIpRange)}
                placeholder="10.0.0.10"
                onChange={(e) => upd('dhcpStartIpRange', e.target.value)}
              />
            </FieldRow>
            <FieldRow label="Address Range — to">
              <Input
                value={ipValue(form.dhcpEndIpRange)}
                placeholder="10.0.0.250"
                onChange={(e) => upd('dhcpEndIpRange', e.target.value)}
              />
            </FieldRow>
            <FieldRow label="Exclusions">
              <Button type="button" variant="outline" onClick={() => setShowExclusions(true)}>
                Exclusions{exclusions.length ? ` (${exclusions.length})` : ''}
              </Button>
            </FieldRow>
          </div>
        ) : (
          <div className="space-y-4">
            {exclusions.length === 0 && !excl && (
              <p className="text-sm text-muted-foreground">No exclusions defined.</p>
            )}
            {exclusions.map((x, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="flex-1">
                  {x.mode === 'range' ? `${x.rangeFrom} – ${x.rangeTo}` : x.rangeFrom}
                </span>
                <span className="flex-1 text-muted-foreground">{x.comment ?? ''}</span>
                <IconAction title="Edit exclusion" onClick={() => setExcl({ idx: i, ...x })}>
                  <Pencil className="h-4 w-4" />
                </IconAction>
                <IconAction
                  title="Delete exclusion"
                  destructive
                  onClick={() => {
                    const next = exclusions.slice();
                    next.splice(i, 1);
                    upd('dhcpExclusions', next);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </IconAction>
              </div>
            ))}
            {!excl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setExcl({ idx: null, mode: 'range', rangeFrom: '', rangeTo: '', comment: '' })
                }
              >
                New Exclusion
              </Button>
            )}
            {excl && (
              <div className="space-y-4 rounded-md border border-border p-4">
                <FieldRow label="Type">
                  <RadioGroup
                    value={excl.mode}
                    onValueChange={(m) => setExcl({ ...excl, mode: m as 'range' | 'single' })}
                    className="flex gap-6"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="range" /> Range
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="single" /> Single Address
                    </label>
                  </RadioGroup>
                </FieldRow>
                <FieldRow
                  label={excl.mode === 'range' ? 'From' : 'Address'}
                  error={!exclValid ? 'Valid IPv4 address(es) required' : undefined}
                >
                  <Input
                    value={excl.rangeFrom}
                    placeholder="10.0.0.20"
                    onChange={(e) => setExcl({ ...excl, rangeFrom: e.target.value })}
                  />
                </FieldRow>
                {excl.mode === 'range' && (
                  <FieldRow label="To">
                    <Input
                      value={excl.rangeTo}
                      placeholder="10.0.0.30"
                      onChange={(e) => setExcl({ ...excl, rangeTo: e.target.value })}
                    />
                  </FieldRow>
                )}
                <FieldRow label="Comment">
                  <Input
                    value={excl.comment ?? ''}
                    onChange={(e) => setExcl({ ...excl, comment: e.target.value })}
                  />
                </FieldRow>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setExcl(null)}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" disabled={!exclValid} onClick={saveExclusion}>
                    Save Exclusion
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {showExclusions ? (
            <Button
              type="button"
              onClick={() => {
                setExcl(null);
                setShowExclusions(false);
              }}
            >
              Done
            </Button>
          ) : (
            <Button type="button" disabled={gwMissing} onClick={onClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
