/**
 * Site editor · Switches tab. MSTP (stpEnabled) select and AAA Policy select
 * (aaaPolicyId, options = AAA policies + None) per site.html 378-424. The
 * switch-assignment grid is out of the EPB-125 prototype scope.
 */
import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { FieldRow } from '../_kit';
import type { SiteTabProps } from './siteEditorTypes';

const NONE = '__none__';

export function SiteSwitchesTab({ form, update, refs }: SiteTabProps) {
  return (
    <div className="max-w-[640px] space-y-1">
      <FieldRow label="STP (MSTP Enabled)">
        <Select
          value={form.stpEnabled ? 'on' : 'off'}
          onValueChange={(v) => update('stpEnabled', v === 'on')}
        >
          <SelectTrigger className="max-w-[180px]" aria-label="STP">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="on">Enabled</SelectItem>
            <SelectItem value="off">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="AAA Policy">
        <Select
          value={form.aaaPolicyId || NONE}
          onValueChange={(v) => update('aaaPolicyId', v === NONE ? null : v)}
        >
          <SelectTrigger className="max-w-[280px]" aria-label="AAA Policy">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {refs.aaaPolicies.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
      <p className="pt-3 text-[12.5px] text-muted-foreground">
        {`Switch assignment (${(form.switchSerialNumbers ?? []).length} assigned) — switches are excluded from the EPB-125 prototype scope.`}
      </p>
    </div>
  );
}
