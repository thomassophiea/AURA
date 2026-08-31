/**
 * Per-site AP membership grid for an aggregated Device Group. The Profile and
 * RF policy are group-level and locked here — the one thing that may differ
 * per site is which access points belong (PLM §7e). Candidates are
 * platform-matched (rule 1) and not claimed by any other group in any site
 * (rule 2); what the rules withheld is accounted for, never silently dropped.
 */
import React, { useMemo, useState } from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Checkbox } from '../../ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import {
  apEligibility,
  type ApEligibility,
  type DeviceGroupAp,
  type SerialClaim,
} from './devicegroupsModel';

export interface SiteMembershipDialogProps {
  siteName: string;
  groupName: string;
  /** Group-level AP platform (from the locked Profile). */
  platform: string;
  aps: DeviceGroupAp[];
  claims: Map<string, SerialClaim>;
  selected: string[];
  onApply: (serials: string[]) => void;
  onClose: () => void;
}

export function SiteMembershipDialog({
  siteName,
  groupName,
  platform,
  aps,
  claims,
  selected: initial,
  onApply,
  onClose,
}: SiteMembershipDialogProps) {
  const [selected, setSelected] = useState<string[]>(initial);
  const [q, setQ] = useState('');

  const eligibility: ApEligibility = useMemo(
    () => apEligibility(aps, siteName, platform, claims),
    [aps, siteName, platform, claims]
  );
  const shown = useMemo(
    () =>
      eligibility.eligible.filter(
        (a) => !q || `${a.apName} ${a.serialNumber}`.toLowerCase().includes(q.toLowerCase())
      ),
    [eligibility, q]
  );

  const toggle = (sn: string) =>
    setSelected((prev) => (prev.includes(sn) ? prev.filter((x) => x !== sn) : [...prev, sn]));

  const withheld: string[] = [];
  if (eligibility.offPlatform.length)
    withheld.push(`${eligibility.offPlatform.length} not ${platform || 'this platform'}`);
  if (eligibility.taken.length)
    withheld.push(`${eligibility.taken.length} in another device group`);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{`${groupName || 'Device Group'} at ${siteName}`}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Access Points</span>
          <span className="text-xs text-muted-foreground">
            {`Eligible: ${eligibility.eligible.length} · Selected: ${selected.length}`}
          </span>
        </div>
        <Input value={q} placeholder="Search" onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-[320px] overflow-auto rounded-md border border-border">
          {shown.length ? (
            shown.map((a) => (
              <label
                key={a.serialNumber}
                className="grid cursor-pointer grid-cols-[28px_1.4fr_1.4fr_1fr] items-center gap-2 border-b border-border px-3 py-2 text-[13px] last:border-b-0"
              >
                <Checkbox
                  checked={selected.includes(a.serialNumber)}
                  onCheckedChange={() => toggle(a.serialNumber)}
                  aria-label={`Select ${a.apName}`}
                />
                <span className="font-medium">{a.apName}</span>
                <span className="font-mono text-muted-foreground">{a.serialNumber}</span>
                <span className="text-muted-foreground">{a.hardwareType}</span>
              </label>
            ))
          ) : (
            <div className="p-3.5 text-[12.5px] text-muted-foreground">
              {eligibility.eligible.length
                ? 'No matches'
                : `No eligible ${platform || ''} access points at this site`.replace('  ', ' ')}
            </div>
          )}
        </div>
        {withheld.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {`${eligibility.inSite.length} access point${eligibility.inSite.length === 1 ? '' : 's'} at ${siteName} · ${withheld.join(' · ')}`}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onApply(selected)}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
