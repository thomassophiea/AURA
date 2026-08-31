/**
 * GRE tunnel-concentrator block — READ-ONLY by scope ruling (§7a):
 * Tunnel Concentrators are deprecated and no editor, attach control or inline
 * create dialog exists anywhere. A GRE VLAN that already carries
 * `concentrators[]` still displays them and still round-trips them on save —
 * the Legacy Configuration contract (readable, never authorable). A GRE VLAN
 * with none simply says the capability is not configurable from here.
 */
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { GreConcentratorRow, TopologyDraft } from './localTypes';

export interface VlanGreSectionProps {
  form: TopologyDraft;
}

export function VlanGreSection({ form }: VlanGreSectionProps) {
  const members = (form.concentrators ?? []) as GreConcentratorRow[];

  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Deprecated — not configurable from AURA.
      </p>
    );
  }

  return (
    <div className="max-w-[480px] space-y-2">
      <div className="grid grid-cols-[2fr_1.4fr] border-b border-border pb-2 text-sm font-medium">
        <span>Name</span>
        <span>IP Address</span>
      </div>
      {members.map((c, i) => (
        <div
          key={c.id ?? `${c.name}-${i}`}
          className="grid grid-cols-[2fr_1.4fr] border-b border-border py-2 text-sm"
        >
          <span>{c.name}</span>
          <span className="text-muted-foreground">{c.ipAddress ?? ''}</span>
        </div>
      ))}
      <p className="flex items-start gap-2 pt-1 text-sm text-amber-600 dark:text-amber-500">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Legacy Configuration — Tunnel Concentrators are deprecated. This VLAN keeps its existing
          concentrators, which must be changed from the Gateway.
        </span>
      </p>
      {members.length > 1 && (
        <p className="text-sm text-muted-foreground">
          Selection: {form.concentratorsSelection === 'loadBalance' ? 'Load Balance' : 'Failover'}
        </p>
      )}
    </div>
  );
}
