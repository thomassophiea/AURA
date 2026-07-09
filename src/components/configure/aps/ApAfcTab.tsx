/**
 * AP editor > AFC tab (gap 29). Read-only view of the 6 GHz AFC state derived
 * from radios[].afc + pwrMode6 (not adminState) plus the operating channel and
 * power reported for the 6 GHz radio.
 */
import React from 'react';
import { FieldRow } from '../_kit';
import { apAfcStatus, apBandOf } from './apHelpers';
import type { ApDetail } from '../../../types/configure';

export interface ApAfcTabProps {
  form: ApDetail;
}

export function ApAfcTab({ form }: ApAfcTabProps) {
  const r6 = (form.radios ?? []).find((r) => apBandOf(r) === 'Band6');
  const status = apAfcStatus(form);
  const powerMode =
    r6?.pwrMode6 === 'SP_WITH_LPI_FALLBACK'
      ? 'Standard Power (LPI fallback)'
      : r6?.pwrMode6 === 'LPI'
        ? 'Low Power Indoor (LPI)'
        : '—';

  return (
    <div className="max-w-xl space-y-4">
      <FieldRow label="6 GHz Radio">
        <span className="text-sm">{r6 ? r6.radioName : 'Not present'}</span>
      </FieldRow>
      <FieldRow label="AFC Status">
        <span className={`text-sm font-semibold ${status === 'Standard Power' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
          {status}
        </span>
      </FieldRow>
      {r6 && (
        <FieldRow label="6 GHz Power Mode">
          <span className="text-sm text-muted-foreground">{powerMode}</span>
        </FieldRow>
      )}
      <FieldRow label="Operating Channel (6 GHz)">
        <span className="text-sm text-muted-foreground">{(r6 && (r6.opChannel || r6.channel)) || '—'}</span>
      </FieldRow>
      <FieldRow label="Operating Power (6 GHz)">
        <span className="text-sm text-muted-foreground">
          {r6 && r6.txPower != null ? `${r6.txPower} dBm` : '—'}
        </span>
      </FieldRow>
    </div>
  );
}
