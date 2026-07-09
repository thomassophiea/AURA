/**
 * Site editor · Allow List / Deny List tab, bound to site.macAcl (MAC) and
 * site.protectedAcl (client IP protection). Each has an enable toggle, Allow/
 * Deny mode radios, a validated chip list (MAC regex + duplicate check; IP
 * regex, 256-entry cap) and the AP3900 / DHCP-snooping notes.
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';
import type { SiteTabProps } from './siteEditorTypes';
import {
  IP_RE,
  MAC_RE,
  PROTECTED_ACL_CAP,
  readMacAcl,
  readProtectedAcl,
} from './siteModel';

function ChipList({ items, onRemove }: { items: string[]; onRemove: (i: number) => void }) {
  if (items.length === 0) return <p className="my-2 text-[12.5px] text-muted-foreground">No entries</p>;
  return (
    <div className="my-2 flex flex-wrap gap-1.5">
      {items.map((m, i) => (
        <span key={`${m}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 font-mono text-[12.5px]">
          {m}
          <button type="button" className="text-destructive" onClick={() => onRemove(i)} aria-label={`Remove ${m}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

export function SiteAllowDenyTab({ form, update }: SiteTabProps) {
  const mac = readMacAcl(form);
  const pro = readProtectedAcl(form);
  const [draft, setDraft] = useState({ mac: '', ip: '' });

  const macList = mac?.macList ?? [];
  const ipList = pro?.ipList ?? [];
  const macErr = draft.mac
    ? !MAC_RE.test(draft.mac)
      ? 'Invalid MAC address (aa:bb:cc:dd:ee:ff)'
      : macList.includes(draft.mac.toLowerCase())
        ? 'Duplicate MAC address'
        : ''
    : '';
  const ipErr = draft.ip && !IP_RE.test(draft.ip) ? 'Invalid IP address' : '';
  const ipFull = ipList.length >= PROTECTED_ACL_CAP;

  return (
    <div className="max-w-[720px]">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Label>Enforce site level control over allow/deny lists</Label>
        <Switch
          checked={!!mac}
          onCheckedChange={(v) => update('macAcl', v ? { mode: 'Allow', macList: [] } : null)}
          aria-label="Enable MAC ACL"
        />
      </div>
      {mac && (
        <div className="mb-6 pl-6">
          <RadioGroup className="mb-2 flex gap-6" value={mac.mode} onValueChange={(v) => update('macAcl.mode', v)}>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="Allow" /> Allow List
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="Deny" /> Deny List
            </label>
          </RadioGroup>
          <ChipList items={macList} onRemove={(i) => update('macAcl.macList', macList.filter((_, x) => x !== i))} />
          <div className="flex items-center gap-2">
            <Input
              value={draft.mac}
              placeholder="aa:bb:cc:dd:ee:ff"
              onChange={(e) => setDraft({ ...draft, mac: e.target.value })}
              className="max-w-[220px] font-mono"
            />
            <Button
              variant="outline"
              disabled={!draft.mac || !!macErr}
              onClick={() => {
                update('macAcl.macList', [...macList, draft.mac.toLowerCase()]);
                setDraft({ ...draft, mac: '' });
              }}
            >
              Add MAC
            </Button>
          </div>
          {macErr && <p className="mt-1 text-xs text-destructive">{macErr}</p>}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-4">
        <Label>Enforce Client Address protection</Label>
        <Switch
          checked={!!pro}
          onCheckedChange={(v) => update('protectedAcl', v ? { mode: 'Deny', ipList: [] } : null)}
          aria-label="Enable protected ACL"
        />
      </div>
      {pro && (
        <div className="pl-6">
          <RadioGroup className="mb-2 flex gap-6" value={pro.mode} onValueChange={(v) => update('protectedAcl.mode', v)}>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="Deny" /> Deny List
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="Allow" /> Allow List
            </label>
          </RadioGroup>
          <ChipList items={ipList} onRemove={(i) => update('protectedAcl.ipList', ipList.filter((_, x) => x !== i))} />
          <div className="flex items-center gap-2">
            <Input
              value={draft.ip}
              placeholder="10.0.0.5"
              disabled={ipFull}
              onChange={(e) => setDraft({ ...draft, ip: e.target.value })}
              className="max-w-[220px] font-mono"
            />
            <Button
              variant="outline"
              disabled={ipFull || !draft.ip || !!ipErr}
              onClick={() => {
                update('protectedAcl.ipList', [...ipList, draft.ip]);
                setDraft({ ...draft, ip: '' });
              }}
            >
              Add IP
            </Button>
            <span className={ipFull ? 'text-xs text-amber-600' : 'text-xs text-muted-foreground'}>
              {`${ipList.length} / ${PROTECTED_ACL_CAP}`}
            </span>
          </div>
          {ipErr && <p className="mt-1 text-xs text-destructive">{ipErr}</p>}
          <p className="mt-3 text-xs text-amber-600">Not supported on AP3900 series access points.</p>
          <p className="text-xs text-muted-foreground">
            Client address protection requires DHCP snooping to learn client bindings.
          </p>
        </div>
      )}
    </div>
  );
}
