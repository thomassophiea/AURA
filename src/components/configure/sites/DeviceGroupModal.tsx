/**
 * Device Group add/edit modal (add-edit-device-group.html). Bound name with
 * required/pattern/unique validation, required Profile + RF Management selects,
 * and a site-scoped selectable AP membership grid with search + Total/Selected
 * counters. OK is valid+dirty gated. The group is a child of site.deviceGroups
 * (persisted when the parent site is saved).
 */
import React, { useMemo, useRef, useState } from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Checkbox } from '../../ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import { FieldRow } from '../_kit';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import type { ApProfile, DeviceGroup, RfMgmtPolicy } from '../../../types/configure';
import { useSiteAps } from './useSiteAps';
import { newDeviceGroup, validateDeviceGroup } from './siteModel';

const NONE = '__none__';

export interface DeviceGroupModalProps {
  siteName: string;
  /** Group being edited, or null to create. */
  group: DeviceGroup | null;
  siblingNames: string[];
  profiles: ApProfile[];
  rfPolicies: RfMgmtPolicy[];
  onApply: (group: DeviceGroup) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function DeviceGroupModal({
  siteName,
  group,
  siblingNames,
  profiles,
  rfPolicies,
  onApply,
  onDelete,
  onClose,
}: DeviceGroupModalProps) {
  const [dg, setDg] = useState<DeviceGroup>(() =>
    group ? structuredClone(group) : newDeviceGroup()
  );
  const dirtyRef = useRef(group == null);
  const [q, setQ] = useState('');
  const { aps } = useSiteAps(siteName);

  const set = <K extends keyof DeviceGroup>(key: K, value: DeviceGroup[K]) => {
    dirtyRef.current = true;
    setDg((prev) => ({ ...prev, [key]: value }));
  };

  const selected = dg.apSerialNumbers ?? [];
  const shown = useMemo(
    () =>
      aps.filter(
        (a) => !q || `${a.apName} ${a.serialNumber}`.toLowerCase().includes(q.toLowerCase())
      ),
    [aps, q]
  );
  const errs = validateDeviceGroup(dg, { siblingNames });
  const valid = Object.keys(errs).length === 0;

  const toggleAp = (sn: string) =>
    set('apSerialNumbers', selected.includes(sn) ? selected.filter((x) => x !== sn) : [...selected, sn]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[820px]">
        <DialogHeader>
          <DialogTitle>{group ? 'Edit Device Group' : 'Create Device Group'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-8">
          <div className="w-[300px] shrink-0 space-y-1">
            <FieldRow label="Name" error={errs.name} required>
              <Input value={dg.groupName ?? ''} onChange={(e) => set('groupName', e.target.value)} />
            </FieldRow>
            <FieldRow label="Profile" error={errs.profile} required>
              <Select
                value={dg.profileId || NONE}
                onValueChange={(v) => set('profileId', v === NONE ? '' : v)}
              >
                <SelectTrigger aria-label="Profile">
                  <SelectValue placeholder="— Select —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Select —</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="RF Management" error={errs.rf} required>
              <Select
                value={dg.rfMgmtPolicyId || NONE}
                onValueChange={(v) => set('rfMgmtPolicyId', v === NONE ? '' : v)}
              >
                <SelectTrigger aria-label="RF Management">
                  <SelectValue placeholder="— Select —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Select —</SelectItem>
                  {rfPolicies.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          </div>
          <div className="min-w-[300px] flex-1">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Access Points</span>
              <span className="text-xs text-muted-foreground">
                {`Total: ${aps.length} · Selected: ${selected.length}`}
              </span>
            </div>
            <Input
              value={q}
              placeholder="Search"
              onChange={(e) => setQ(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-[320px] overflow-auto rounded-md border border-border">
              {shown.length ? (
                shown.map((a) => (
                  <label
                    key={a.serialNumber}
                    className="grid cursor-pointer grid-cols-[28px_1.4fr_1.4fr_1fr] items-center gap-2 border-b border-border px-3 py-2 text-[13px] last:border-b-0"
                  >
                    <Checkbox
                      checked={selected.includes(a.serialNumber)}
                      onCheckedChange={() => toggleAp(a.serialNumber)}
                      aria-label={`Select ${a.apName}`}
                    />
                    <span className="font-medium">{a.apName}</span>
                    <span className="font-mono text-muted-foreground">{a.serialNumber}</span>
                    <span className="text-muted-foreground">{a.hardwareType}</span>
                  </label>
                ))
              ) : (
                <div className="p-3.5 text-[12.5px] text-muted-foreground">
                  {aps.length ? 'No matches' : 'No access points on this site'}
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          {onDelete && (
            <Button variant="outline" className="mr-auto text-destructive hover:text-destructive" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || !dirtyRef.current} onClick={() => onApply(dg)}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
