/**
 * Site editor · SNMP tab, bound to the real snmpConfig sub-document. Version
 * select gates the rest; engine id / context / trap severity plus v2c
 * community, v3 user and notification-target chip collections (add/remove).
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { FieldRow } from '../_kit';
import type { SiteTabProps } from './siteEditorTypes';
import { IP_RE, SNMP_VERSION, TRAP_SEVERITY, getPath } from './siteModel';

function Chips({ items, onRemove, empty }: { items: string[]; onRemove: (i: number) => void; empty: string }) {
  if (items.length === 0) return <span className="text-[12.5px] text-muted-foreground">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <span key={`${t}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[12.5px]">
          {t}
          <button type="button" className="text-destructive" onClick={() => onRemove(i)} aria-label={`Remove ${t}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

export function SiteSnmpTab({ form, update }: SiteTabProps) {
  const version = (getPath(form, 'snmpConfig.snmpVersion') as string) ?? 'DISABLED';
  const on = version !== 'DISABLED';
  const v2 = (getPath(form, 'snmpConfig.v2Communities') as Record<string, unknown>) ?? {};
  const v3 = (getPath(form, 'snmpConfig.v3Users') as Array<{ name?: string }>) ?? [];
  const noti = (getPath(form, 'snmpConfig.notifications') as Array<{ ipAddress?: string }>) ?? [];
  const [draft, setDraft] = useState({ v2: '', v3: '', notif: '' });
  const notifBad = !!draft.notif && !IP_RE.test(draft.notif);

  return (
    <div className="max-w-[720px] space-y-1">
      <FieldRow label="SNMP">
        <Select value={version} onValueChange={(v) => update('snmpConfig.snmpVersion', v)}>
          <SelectTrigger className="max-w-[180px]" aria-label="SNMP Version">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SNMP_VERSION.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {on && (
        <>
          <FieldRow label="Engine ID">
            <Input
              value={(getPath(form, 'snmpConfig.engineId') as string) ?? ''}
              onChange={(e) => update('snmpConfig.engineId', e.target.value || null)}
              className="max-w-[280px]"
            />
          </FieldRow>
          <FieldRow label="Context">
            <Input
              value={(getPath(form, 'snmpConfig.context') as string) ?? ''}
              onChange={(e) => update('snmpConfig.context', e.target.value || null)}
              className="max-w-[280px]"
            />
          </FieldRow>
          <FieldRow label="Trap Severity">
            <Select
              value={(getPath(form, 'snmpConfig.trapSeverity') as string) ?? 'Critical'}
              onValueChange={(v) => update('snmpConfig.trapSeverity', v)}
            >
              <SelectTrigger className="max-w-[180px]" aria-label="Trap Severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRAP_SEVERITY.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          {version === 'V2C' && (
            <div className="pt-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">v2c Communities</p>
              <Chips
                items={Object.keys(v2)}
                onRemove={(i) => {
                  const name = Object.keys(v2)[i];
                  const next = { ...v2 };
                  delete next[name];
                  update('snmpConfig.v2Communities', next);
                }}
                empty="No communities"
              />
              <div className="mt-2 flex gap-2">
                <Input value={draft.v2} placeholder="Community name" onChange={(e) => setDraft({ ...draft, v2: e.target.value })} className="max-w-[240px]" />
                <Button
                  variant="outline"
                  disabled={!draft.v2.trim()}
                  onClick={() => {
                    update('snmpConfig.v2Communities', { ...v2, [draft.v2]: { communityName: draft.v2 } });
                    setDraft({ ...draft, v2: '' });
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          )}

          {version === 'V3' && (
            <div className="pt-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">v3 Users</p>
              <Chips
                items={v3.map((u) => u.name ?? '')}
                onRemove={(i) => update('snmpConfig.v3Users', v3.filter((_, x) => x !== i))}
                empty="No users"
              />
              <div className="mt-2 flex gap-2">
                <Input value={draft.v3} placeholder="User name" onChange={(e) => setDraft({ ...draft, v3: e.target.value })} className="max-w-[240px]" />
                <Button
                  variant="outline"
                  disabled={!draft.v3.trim()}
                  onClick={() => {
                    update('snmpConfig.v3Users', [...v3, { name: draft.v3 }]);
                    setDraft({ ...draft, v3: '' });
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          )}

          <div className="pt-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notifications</p>
            <Chips
              items={noti.map((n) => n.ipAddress ?? '')}
              onRemove={(i) => update('snmpConfig.notifications', noti.filter((_, x) => x !== i))}
              empty="No notification targets"
            />
            <div className="mt-2 flex gap-2">
              <Input value={draft.notif} placeholder="Manager IP address" onChange={(e) => setDraft({ ...draft, notif: e.target.value })} className="max-w-[240px]" />
              <Button
                variant="outline"
                disabled={!draft.notif.trim() || notifBad}
                onClick={() => {
                  update('snmpConfig.notifications', [...noti, { ipAddress: draft.notif }]);
                  setDraft({ ...draft, notif: '' });
                }}
              >
                Add
              </Button>
            </div>
            {notifBad && <p className="mt-1 text-xs text-destructive">Invalid IP address</p>}
          </div>
        </>
      )}
    </div>
  );
}
