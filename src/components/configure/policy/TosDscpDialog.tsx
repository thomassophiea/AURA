/**
 * Two-mode ToS / DSCP editor (controller tosDscpEditor.html): DSCP codepoint
 * (well-known select or 0–63 input) vs raw ToS byte (precedence + flag bits).
 * Applies a single numeric ToS byte to the caller.
 */
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';
import { FieldRow } from '../_kit';
import { EnumSelect, NumInput } from './fields';
import { DSCP_KNOWN } from './constants';
import { dscpHex, tosFromBits, tosFromDscp, tosHex } from './policyUtils';

export interface TosDscpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: number | null | undefined;
  onApply: (tos: number) => void;
}

export function TosDscpDialog({ open, onOpenChange, value, onApply }: TosDscpDialogProps) {
  const v = Number(value) || 0;
  const [mode, setMode] = useState<'dscp' | 'tos'>('dscp');
  const [prec, setPrec] = useState((v >> 5) & 7);
  const [bits, setBits] = useState({
    delay: !!(v & 16),
    throughput: !!(v & 8),
    reliability: !!(v & 4),
    ecn: !!(v & 3),
  });
  const [dscp, setDscp] = useState<number | ''>(v >> 2);

  const tosVal = mode === 'dscp' ? tosFromDscp(Number(dscp) || 0) : tosFromBits(prec, bits);

  const flag = (key: keyof typeof bits, label: string) => (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <Checkbox
        checked={bits[key]}
        onCheckedChange={(checked) => setBits((p) => ({ ...p, [key]: checked === true }))}
      />
      {label}
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>ToS / DSCP Configuration</DialogTitle>
          <DialogDescription>
            Configure the Type of Service byte via DSCP codepoint or raw ToS bits.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup
            value={mode}
            onValueChange={(m) => setMode(m as 'dscp' | 'tos')}
            className="flex gap-6"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="dscp" /> DSCP
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="tos" /> Type of Service (ToS)
            </label>
          </RadioGroup>

          {mode === 'dscp' && (
            <>
              <FieldRow label="Well-Known Value">
                <EnumSelect
                  value={DSCP_KNOWN.includes(Number(dscp)) ? String(dscp) : ''}
                  options={[
                    { id: '', label: '— Custom —' },
                    ...DSCP_KNOWN.map((d) => ({
                      id: String(d),
                      label: `0x${d.toString(16).toUpperCase()} (${d})`,
                    })),
                  ]}
                  onChange={(nv) => {
                    if (nv !== '') setDscp(Number(nv));
                  }}
                />
              </FieldRow>
              <FieldRow label="DSCP (0–63)">
                <NumInput
                  value={dscp}
                  min={0}
                  max={63}
                  onChange={(nv) =>
                    setDscp(nv === '' ? '' : Math.max(0, Math.min(63, Number(nv))))
                  }
                  className="w-28"
                />
              </FieldRow>
            </>
          )}

          {mode === 'tos' && (
            <>
              <FieldRow label="Precedence">
                <EnumSelect
                  value={String(prec)}
                  options={[0, 1, 2, 3, 4, 5, 6, 7].map((p) => ({
                    id: String(p),
                    label: String(p),
                  }))}
                  onChange={(nv) => setPrec(Number(nv))}
                  className="w-24"
                />
              </FieldRow>
              <FieldRow label="Flags">
                <div className="flex flex-wrap gap-4">
                  {flag('delay', 'Low Delay')}
                  {flag('throughput', 'Throughput')}
                  {flag('reliability', 'Reliability')}
                  {flag('ecn', 'ECN')}
                </div>
              </FieldRow>
            </>
          )}

          <FieldRow label="ToS/DSCP Value">
            <span className="font-mono text-sm">
              {tosHex(tosVal)} (DSCP: {dscpHex(tosVal)})
            </span>
          </FieldRow>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onApply(tosVal);
              onOpenChange(false);
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reusable "0x__ (DSCP: 0x_) [Configure] Mask: __" row body. */
export interface TosRowProps {
  tosDscp: number | null | undefined;
  onTosChange: (v: number | null) => void;
  maskValue: string;
  maskOptions: { id: string; label: string }[];
  onMaskChange: (v: string) => void;
  onConfigure: () => void;
}

export function TosRow({
  tosDscp,
  onTosChange,
  maskValue,
  maskOptions,
  onMaskChange,
  onConfigure,
}: TosRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-muted-foreground">0x</span>
      <input
        value={tosDscp != null ? (Number(tosDscp) || 0).toString(16).toUpperCase() : ''}
        onChange={(e) =>
          onTosChange(e.target.value === '' ? null : parseInt(e.target.value, 16) || 0)
        }
        aria-label="ToS/DSCP hex value"
        className="h-9 w-20 rounded-md border border-input bg-transparent px-3 text-sm"
      />
      <span className="text-xs text-muted-foreground">(DSCP: {dscpHex(tosDscp ?? 0)})</span>
      <Button type="button" variant="outline" size="sm" onClick={onConfigure}>
        Configure
      </Button>
      <span className="text-sm text-muted-foreground">Mask:</span>
      <EnumSelect
        value={maskValue}
        options={maskOptions}
        onChange={onMaskChange}
        className="w-28"
        aria-label="ToS mask"
      />
    </div>
  );
}
