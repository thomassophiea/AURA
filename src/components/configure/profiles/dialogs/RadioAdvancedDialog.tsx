/**
 * Per-radio Advanced dialog (radioAdvancedProfile.html) — renders the
 * mode/feature-gated ADV_RADIO_FIELDS set with inline range validation and a
 * Cell Size Control sub-block. Hidden entirely for sensor radios.
 */
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../ui/dialog';
import { Button } from '../../../ui/button';
import { Input } from '../../../ui/input';
import { BoolSelect, NumInput, PSelect } from '../controls';
import { ADV_RADIO_FIELDS, ADV_RANGES, type AdvFieldType, type AdvRadioField } from '../constants';
import { inRange, parseChannelList } from '../helpers';
import type { ProfileRadio } from '../../../../types/configure';

export interface RadioAdvancedDialogProps {
  open: boolean;
  radio: ProfileRadio | null;
  radioIndex: number;
  F: (tag: string) => boolean;
  updRadio: (index: number, key: string, value: unknown) => void;
  onClose: () => void;
}

function AdvField({
  field,
  radio,
  radioIndex,
  updRadio,
}: {
  field: AdvRadioField;
  radio: ProfileRadio;
  radioIndex: number;
  updRadio: (index: number, key: string, value: unknown) => void;
}) {
  const rec = radio as unknown as Record<string, unknown>;
  const value = rec[field.key];
  const rg = ADV_RANGES[field.key];
  const bad = field.type === 'num' && rg && !inRange(value, rg[0], rg[1]);
  const type: AdvFieldType = field.type;

  let control: React.ReactNode;
  if (type === 'num') {
    control = <NumInput value={value as number} onChange={(v) => updRadio(radioIndex, field.key, v)} className="w-52" />;
  } else if (type === 'bool') {
    control = <BoolSelect value={!!value} onChange={(v) => updRadio(radioIndex, field.key, v)} className="w-52" />;
  } else if (type === 'chlist') {
    control = (
      <Input
        className="h-9 w-52"
        placeholder="e.g. 1, 6, 11"
        value={Array.isArray(value) ? (value as unknown[]).join(', ') : ''}
        onChange={(e) => updRadio(radioIndex, field.key, parseChannelList(e.target.value))}
      />
    );
  } else {
    const opts = typeof type === 'function' ? type(radio) : type;
    control = (
      <PSelect
        value={value == null ? '' : String(value)}
        options={opts}
        onChange={(v) => updRadio(radioIndex, field.key, v)}
        className="w-52"
        ariaLabel={field.label}
      />
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground">{field.label}</span>
        <div className="shrink-0">{control}</div>
      </div>
      {bad && rg && <p className="text-right text-xs text-destructive">{`Valid range ${rg[0]} to ${rg[1]}`}</p>}
    </div>
  );
}

export function RadioAdvancedDialog({ open, radio, radioIndex, F, updRadio, onClose }: RadioAdvancedDialogProps) {
  if (!radio) return null;
  const main = ADV_RADIO_FIELDS.filter((f) => !f.group && f.show(radio, F));
  const csc = ADV_RADIO_FIELDS.filter((f) => f.group === 'csc' && f.show(radio, F));
  const isSensor = radio.mode === 'sensor';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Advanced ({radio.radioName})</DialogTitle>
        </DialogHeader>
        {isSensor ? (
          <p className="py-2 text-sm text-muted-foreground">
            Radio advanced settings do not apply while the radio operates in sensor mode.
          </p>
        ) : (
          <div className="space-y-3">
            {main.map((f) => (
              <AdvField key={f.key} field={f} radio={radio} radioIndex={radioIndex} updRadio={updRadio} />
            ))}
            {csc.length > 0 && (
              <div className="space-y-3 border-t border-border pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cell Size Control</p>
                {csc.map((f) => (
                  <AdvField key={f.key} field={f} radio={radio} radioIndex={radioIndex} updRadio={updRadio} />
                ))}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
