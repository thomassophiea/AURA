/**
 * Rate limiter editor (controller rate.html / cosRate.html): exactly two
 * fields — Name (required) and Average Rate CIR in Kbps (128–500000). The API
 * record is { id, name, canEdit, canDelete, cirKbps }; no CBS field exists.
 * Rendered as a Dialog so it can stack inside the CoS editor sheet.
 */
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { FieldRow } from '../_kit';
import { NumInput } from './fields';
import type { RateLimiter } from '../../../types/configure';
import { rateLimiterErrors } from './policyUtils';
import { CIR_MAX, CIR_MIN } from './constants';

export interface RateLimiterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → create (seeded from the /default template by the caller). */
  record: RateLimiter | null;
  saving?: boolean;
  onSubmit: (payload: Partial<RateLimiter>, id?: string) => void | Promise<void>;
}

export function RateLimiterDialog({
  open,
  onOpenChange,
  record,
  saving = false,
  onSubmit,
}: RateLimiterDialogProps) {
  const [name, setName] = useState(record?.name ?? '');
  const [cirKbps, setCirKbps] = useState<number | ''>(record?.cirKbps ?? '');
  const [touched, setTouched] = useState(false);

  const errs = rateLimiterErrors({ name, cirKbps });
  const valid = Object.keys(errs).length === 0;

  const submit = async () => {
    if (!valid) return;
    const payload: Partial<RateLimiter> = record
      ? { ...record, name, cirKbps: Number(cirKbps) }
      : { name, cirKbps: Number(cirKbps) };
    await onSubmit(payload, record?.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{record ? record.name : 'Add Rate Limiter'}</DialogTitle>
          <DialogDescription>
            Committed information rate limiter ({CIR_MIN}–{CIR_MAX} Kbps).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FieldRow label="Name" required error={touched ? errs.name : undefined}>
            <Input
              value={name}
              maxLength={64}
              onChange={(e) => {
                setName(e.target.value);
                setTouched(true);
              }}
            />
          </FieldRow>
          <FieldRow
            label="Average Rate (CIR) [Kbps]"
            required
            error={touched && cirKbps !== '' ? errs.cir : undefined}
            description={`Valid range ${CIR_MIN} to ${CIR_MAX}`}
          >
            <NumInput
              value={cirKbps}
              min={CIR_MIN}
              max={CIR_MAX}
              placeholder={`${CIR_MIN}–${CIR_MAX}`}
              onChange={(v) => {
                setCirKbps(v);
                setTouched(true);
              }}
              className="w-44"
            />
          </FieldRow>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!valid || saving} onClick={() => void submit()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
