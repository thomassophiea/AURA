/**
 * Shared single-select tab for the profile's specialized-profile references
 * (Air Defense / IoT / ESL / Positioning / Analytics / RTLS). Each binds a
 * `*ProfileId` key to a pool with a "— None —" option. Air Defense adds the
 * Enable Air Defense Essentials toggle above the select.
 */
import React from 'react';
import { Switch } from '../../../ui/switch';
import { LabelRow, PSelect } from '../controls';
import type { Opt, ProfileTabContext } from '../types';

export interface ReferenceTabProps {
  ctx: ProfileTabContext;
  label: string;
  /** Profile field holding the referenced id, e.g. 'iotProfileId'. */
  fieldKey: keyof ProfileTabContext['form'] & string;
  pool: Opt[];
  /** Render the Air Defense Essentials toggle. */
  withAirDefenseEssentials?: boolean;
}

export function ReferenceTab({ ctx, label, fieldKey, pool, withAirDefenseEssentials }: ReferenceTabProps) {
  const { form, setField } = ctx;
  const opts: Opt[] = [{ id: '', label: '— None —' }, ...pool];
  const value = (form as unknown as Record<string, unknown>)[fieldKey];

  return (
    <div className="max-w-2xl space-y-4">
      {withAirDefenseEssentials && (
        <LabelRow label="Enable Air Defense Essentials">
          <Switch
            checked={!!form.airDefenseEssentials}
            onCheckedChange={(v) => setField('airDefenseEssentials', v)}
            aria-label="Enable Air Defense Essentials"
          />
        </LabelRow>
      )}
      <LabelRow label={label}>
        <PSelect
          value={value == null ? '' : String(value)}
          options={opts}
          onChange={(v) => setField(fieldKey, v || null)}
          className="w-72"
          ariaLabel={label}
        />
      </LabelRow>
      {pool.length === 0 && (
        <p className="text-xs text-muted-foreground" style={{ marginLeft: 236 }}>
          No {label.toLowerCase()}s are configured on this controller yet.
        </p>
      )}
    </div>
  );
}
