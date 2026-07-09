/**
 * AP editor > UWB tab (ap-uwb.html, gap 17) — feature-gated on UWB-ELECTION.
 * Anchor Mode select; Anchor To Follow (Secondary only); CCP Delay, AP Height
 * and the Multilateration master list (any non-Disabled mode). The capture
 * record has no uwb sub-document (audit UQ-6), so fields bind under `uwb.*`
 * using the controller's control names.
 */
import React from 'react';
import { Input } from '../../ui/input';
import { FieldRow } from '../_kit';
import { ApSelect, NumberField } from './controls';
import { getIn } from './useApDraft';
import type { ApDetail } from '../../../types/configure';

export interface ApUwbTabProps {
  form: ApDetail;
  upd: (path: string, value: unknown) => void;
}

export function ApUwbTab({ form, upd }: ApUwbTabProps) {
  const mode = (getIn(form, 'uwb.uwbAnchorMode') as string) || 'Disabled';
  const active = mode !== 'Disabled';
  const num = (p: string): number | null => {
    const v = getIn(form, p);
    return typeof v === 'number' ? v : null;
  };
  const masters = (getIn(form, 'uwb.multilateration') as string[]) ?? [];

  return (
    <div className="max-w-xl space-y-4">
      <FieldRow label="Anchor Mode" inline>
        <ApSelect
          className="w-44"
          value={mode}
          options={['Disabled', 'Primary', 'Secondary']}
          onChange={(v) => upd('uwb.uwbAnchorMode', v)}
        />
      </FieldRow>
      {mode === 'Secondary' && (
        <FieldRow label="Anchor To Follow">
          <Input
            className="w-60"
            placeholder="AP serial number"
            value={(getIn(form, 'uwb.anchorToFollow') as string) ?? ''}
            onChange={(e) => upd('uwb.anchorToFollow', e.target.value)}
          />
        </FieldRow>
      )}
      {active && (
        <>
          <FieldRow label="CCP Delay">
            <NumberField value={num('uwb.ccpDelay')} onChange={(v) => upd('uwb.ccpDelay', v)} />
          </FieldRow>
          <FieldRow label="AP Height [m]">
            <NumberField
              value={num('uwb.apHeight') ?? (getIn(form, 'elevation.height') as number | null)}
              onChange={(v) => upd('uwb.apHeight', v)}
            />
          </FieldRow>
          <FieldRow label="Multilateration Masters">
            <Input
              className="w-full"
              placeholder="AP serials, comma-separated"
              value={masters.join(', ')}
              onChange={(e) =>
                upd(
                  'uwb.multilateration',
                  e.target.value.split(',').map((x) => x.trim()).filter(Boolean)
                )
              }
            />
          </FieldRow>
        </>
      )}
    </div>
  );
}
