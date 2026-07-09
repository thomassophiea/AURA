/**
 * Role "CoS Bandwidth Limit" row (role_config.html:80–122) + the
 * roleCosAdvanced dialog: existing-CoS mode (name display + clear) vs CIR
 * mode (128–500000 Kbps input + slider). The persisted field is defaultCos;
 * CIR-mode synthesis happens in RoleEditor.handleSave.
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';
import { Slider } from '../../ui/slider';
import { FieldRow } from '../_kit';
import { CIR_MAX, CIR_MIN, NO_COS_ID, type Opt } from './constants';
import { EnumSelect, IconAction, NumInput } from './fields';
import { inRange, type RoleBandwidthState } from './policyUtils';

export interface RoleBandwidthFieldProps {
  bw: RoleBandwidthState;
  onBwChange: (patch: Partial<RoleBandwidthState>) => void;
  /** Resolved display name of the current defaultCos ("No CoS" when unset). */
  cosName: string;
  /** True when defaultCos points at a real CoS (not the "No CoS" record). */
  hasRealCos: boolean;
  defaultCos: string | null | undefined;
  cosOptions: Opt[];
  /** Writes role.defaultCos (pass NO_COS_ID to clear). */
  onDefaultCosChange: (id: string) => void;
  cirError?: string;
}

export function RoleBandwidthField({
  bw,
  onBwChange,
  cosName,
  hasRealCos,
  defaultCos,
  cosOptions,
  onDefaultCosChange,
  cirError,
}: RoleBandwidthFieldProps) {
  const [advOpen, setAdvOpen] = useState(false);

  return (
    <>
      <FieldRow
        label="CoS Bandwidth Limit"
        error={bw.enabled && bw.mode === 'cir' && bw.cirKbps !== '' ? cirError : undefined}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox
            checked={bw.enabled}
            aria-label="Enable CoS bandwidth limit"
            onCheckedChange={(checked) => onBwChange({ enabled: checked === true })}
          />
          {bw.enabled && bw.mode === 'existing' && (
            <>
              <span className="text-sm text-muted-foreground">Class of Service: {cosName}</span>
              <IconAction
                title="Clear CoS"
                onClick={() => {
                  onDefaultCosChange(NO_COS_ID);
                  onBwChange({ mode: 'cir', cirKbps: '' });
                }}
              >
                <X className="h-4 w-4" />
              </IconAction>
            </>
          )}
          {bw.enabled && bw.mode === 'cir' && (
            <>
              <NumInput
                value={bw.cirKbps}
                min={CIR_MIN}
                max={CIR_MAX}
                placeholder="CIR Kbps"
                aria-label="CIR Kbps"
                onChange={(v) => onBwChange({ cirKbps: v })}
                className="w-32"
              />
              <Slider
                value={[inRange(bw.cirKbps, CIR_MIN, CIR_MAX) ? Number(bw.cirKbps) : CIR_MIN]}
                min={CIR_MIN}
                max={CIR_MAX}
                step={1}
                className="w-44"
                onValueChange={([v]) => onBwChange({ cirKbps: v })}
              />
              <span className="text-xs text-muted-foreground">
                Kbps ({CIR_MIN}–{CIR_MAX})
              </span>
            </>
          )}
          {bw.enabled && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAdvOpen(true)}>
              Configure CoS
            </Button>
          )}
        </div>
      </FieldRow>

      {/* roleCosAdvanced: existing CoS vs role-specific rate limit */}
      <Dialog open={advOpen} onOpenChange={setAdvOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configure Class of Service</DialogTitle>
            <DialogDescription>
              Use an existing CoS or create a role-specific rate-limited CoS.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <RadioGroup
              value={bw.mode}
              onValueChange={(m) => onBwChange({ mode: m as 'existing' | 'cir' })}
              className="space-y-3"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="existing" /> Use an existing Class of Service
              </label>
              {bw.mode === 'existing' && (
                <FieldRow label="Class of Service">
                  <EnumSelect
                    value={hasRealCos ? String(defaultCos) : ''}
                    options={[{ id: '', label: 'None' }, ...cosOptions]}
                    onChange={(v) => onDefaultCosChange(v || NO_COS_ID)}
                    className="w-64"
                  />
                </FieldRow>
              )}
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="cir" /> Advanced settings (create a role-specific CoS)
              </label>
              {bw.mode === 'cir' && (
                <FieldRow
                  label="Average Rate (CIR)"
                  error={bw.cirKbps !== '' ? cirError : undefined}
                  description="Kbps"
                >
                  <NumInput
                    value={bw.cirKbps}
                    min={CIR_MIN}
                    max={CIR_MAX}
                    onChange={(v) => onBwChange({ cirKbps: v })}
                    className="w-36"
                  />
                </FieldRow>
              )}
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setAdvOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
