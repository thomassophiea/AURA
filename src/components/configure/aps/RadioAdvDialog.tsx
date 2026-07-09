/**
 * Per-radio Advanced modal (radioAdvanced.html, gap 12): Aggregate MPDU, LDPC,
 * STBC, Beamforming (TxBF). Hidden for b/g mode by the caller. Fields verified
 * against api/ap-detail-sample.json radios[].
 */
import React from 'react';
import { FieldRow } from '../_kit';
import { Switch } from '../../ui/switch';
import { EditorDialog } from './EditorDialog';
import { ApSelect } from './controls';
import { useApDraft } from './useApDraft';
import type { ApRadio } from '../../../types/configure';

const TXBF_OPTS = [
  { id: 'disabled', label: 'Disabled' },
  { id: 'suMimo', label: 'TX SU-MIMO' },
  { id: 'muMimo', label: 'TX MU-MIMO' },
  { id: 'ulMuMimo', label: 'UL MU-MIMO' },
  { id: 'dlUlMuMimo', label: 'DL & UL MU-MIMO' },
];
const STATUS = [
  { id: 'enabled', label: 'Enabled' },
  { id: 'disabled', label: 'Disabled' },
];

export interface RadioAdvDialogProps {
  radio: ApRadio;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (radio: ApRadio) => void;
}

export function RadioAdvDialog({ radio, open, onOpenChange, onApply }: RadioAdvDialogProps) {
  const { form, upd, dirty } = useApDraft<ApRadio>(radio);
  return (
    <EditorDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Advanced — ${radio.radioName || 'Radio'}`}
      maxWidth={520}
      okDisabled={!dirty}
      onOk={() => onApply(form)}
    >
      <FieldRow label="Aggregate MPDU" inline>
        <ApSelect
          className="w-40"
          value={form.aggregateMpdu || 'enabled'}
          options={STATUS}
          onChange={(v) => upd('aggregateMpdu', v)}
        />
      </FieldRow>
      <FieldRow label="LDPC" inline>
        <ApSelect
          className="w-40"
          value={form.ldpc || 'enabled'}
          options={STATUS}
          onChange={(v) => upd('ldpc', v)}
        />
      </FieldRow>
      <FieldRow label="STBC" inline>
        <Switch checked={!!form.stbc} onCheckedChange={(v) => upd('stbc', v)} />
      </FieldRow>
      <FieldRow label="Beamforming (TxBF)" inline>
        <ApSelect
          className="w-52"
          value={form.txBf || 'disabled'}
          options={TXBF_OPTS}
          onChange={(v) => upd('txBf', v)}
        />
      </FieldRow>
    </EditorDialog>
  );
}
