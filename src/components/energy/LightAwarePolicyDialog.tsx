import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useLightAwarePolicy } from '@/hooks/useEnergyData';
import type { LightActionInput, LightAwarePolicyDoc } from '@/types/energy';

interface LightAwarePolicyDialogProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}

interface FormState {
  enabled: boolean;
  dimReduceTx: boolean;
  dimTxPercent: number;
  dimReduceChains: boolean;
  darkDisable6: boolean;
  darkReduceTx5: boolean;
  darkTx5Percent: number;
  brightLux: number;
  darkLux: number;
  dimDwellMinutes: number;
  darkDwellMinutes: number;
  restoreDwellMinutes: number;
  disableWlanIds: string;
  protectedWlanIds: string;
}

const DEFAULTS: FormState = {
  enabled: false,
  dimReduceTx: false,
  dimTxPercent: 20,
  dimReduceChains: false,
  darkDisable6: true,
  darkReduceTx5: false,
  darkTx5Percent: 30,
  brightLux: 200,
  darkLux: 10,
  dimDwellMinutes: 15,
  darkDwellMinutes: 30,
  restoreDwellMinutes: 5,
  disableWlanIds: '',
  protectedWlanIds: '',
};

function hasAction(actions: LightActionInput[] | undefined, kind: string, band?: string): boolean {
  return !!actions?.some((a) => a.kind === kind && (band ? a.band === band : true));
}

function percentOf(
  actions: LightActionInput[] | undefined,
  kind: string,
  band?: string
): number | undefined {
  return actions?.find((a) => a.kind === kind && (band ? a.band === band : true))?.reducePercent;
}

function idsToList(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Hydrate form state from a saved policy document. */
function fromPolicy(doc: LightAwarePolicyDoc | undefined, enabled: boolean): FormState {
  if (!doc) return { ...DEFAULTS, enabled };
  const dim = doc.dim?.actions;
  const dark = doc.dark?.actions;
  return {
    enabled,
    dimReduceTx: hasAction(dim, 'reduceTxPower'),
    dimTxPercent: percentOf(dim, 'reduceTxPower') ?? DEFAULTS.dimTxPercent,
    dimReduceChains: hasAction(dim, 'reduceChains'),
    darkDisable6: hasAction(dark, 'disableRadio', '6'),
    darkReduceTx5: hasAction(dark, 'reduceTxPower', '5'),
    darkTx5Percent: percentOf(dark, 'reduceTxPower', '5') ?? DEFAULTS.darkTx5Percent,
    brightLux: doc.thresholds?.brightLux ?? DEFAULTS.brightLux,
    darkLux: doc.thresholds?.darkLux ?? DEFAULTS.darkLux,
    dimDwellMinutes: doc.hysteresis?.dimDwellMinutes ?? DEFAULTS.dimDwellMinutes,
    darkDwellMinutes: doc.hysteresis?.darkDwellMinutes ?? DEFAULTS.darkDwellMinutes,
    restoreDwellMinutes: doc.hysteresis?.restoreDwellMinutes ?? DEFAULTS.restoreDwellMinutes,
    disableWlanIds:
      (
        dark
          ?.filter((a) => a.kind === 'disableWlan')
          .map((a) => a.wlanId)
          .filter(Boolean) as string[]
      )?.join(', ') ?? '',
    protectedWlanIds: doc.protectedWlanIds?.join(', ') ?? '',
  };
}

/** Assemble a policy document from the form state. */
function toPolicy(form: FormState): LightAwarePolicyDoc {
  const dim: LightActionInput[] = [];
  if (form.dimReduceTx) dim.push({ kind: 'reduceTxPower', reducePercent: form.dimTxPercent });
  if (form.dimReduceChains) dim.push({ kind: 'reduceChains' });

  const dark: LightActionInput[] = [];
  if (form.darkDisable6) dark.push({ kind: 'disableRadio', band: '6' });
  if (form.darkReduceTx5)
    dark.push({ kind: 'reduceTxPower', band: '5', reducePercent: form.darkTx5Percent });
  for (const wlanId of idsToList(form.disableWlanIds)) dark.push({ kind: 'disableWlan', wlanId });

  return {
    thresholds: { brightLux: form.brightLux, darkLux: form.darkLux },
    hysteresis: {
      dimDwellMinutes: form.dimDwellMinutes,
      darkDwellMinutes: form.darkDwellMinutes,
      restoreDwellMinutes: form.restoreDwellMinutes,
    },
    dim: { actions: dim },
    dark: { actions: dark },
    protectedWlanIds: idsToList(form.protectedWlanIds),
  };
}

export function LightAwarePolicyDialog({ open, onOpenChange }: LightAwarePolicyDialogProps) {
  const { data, loading, save } = useLightAwarePolicy();
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const initial = useMemo(() => fromPolicy(data?.policy, data?.enabled ?? false), [data]);
  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({ enabled: form.enabled, policy: toPolicy(form) });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Light-Aware Policy</DialogTitle>
          <DialogDescription>
            Model AP energy actions by ambient-light state. Actions are modeled / not currently
            executable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <Label htmlFor="la-enabled">Enabled</Label>
            <Switch
              id="la-enabled"
              checked={form.enabled}
              onCheckedChange={(v) => set('enabled', v)}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">When Dim</legend>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.dimReduceTx}
                onCheckedChange={(v) => set('dimReduceTx', v === true)}
              />
              Reduce Tx power
              <Input
                type="number"
                className="h-7 w-16"
                value={form.dimTxPercent}
                onChange={(e) => set('dimTxPercent', Number(e.target.value))}
                disabled={!form.dimReduceTx}
              />
              %
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.dimReduceChains}
                onCheckedChange={(v) => set('dimReduceChains', v === true)}
              />
              Reduce radio chains
            </label>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">When Dark</legend>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.darkDisable6}
                onCheckedChange={(v) => set('darkDisable6', v === true)}
              />
              Disable 6 GHz radio
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.darkReduceTx5}
                onCheckedChange={(v) => set('darkReduceTx5', v === true)}
              />
              Reduce 5 GHz Tx power
              <Input
                type="number"
                className="h-7 w-16"
                value={form.darkTx5Percent}
                onChange={(e) => set('darkTx5Percent', Number(e.target.value))}
                disabled={!form.darkReduceTx5}
              />
              %
            </label>
          </fieldset>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
              <ChevronDown
                className={`size-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
              />
              Advanced
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Bright lux ≥"
                  value={form.brightLux}
                  onChange={(v) => set('brightLux', v)}
                />
                <NumberField
                  label="Dark lux ≤"
                  value={form.darkLux}
                  onChange={(v) => set('darkLux', v)}
                />
                <NumberField
                  label="Dim dwell (min)"
                  value={form.dimDwellMinutes}
                  onChange={(v) => set('dimDwellMinutes', v)}
                />
                <NumberField
                  label="Dark dwell (min)"
                  value={form.darkDwellMinutes}
                  onChange={(v) => set('darkDwellMinutes', v)}
                />
                <NumberField
                  label="Restore dwell (min)"
                  value={form.restoreDwellMinutes}
                  onChange={(v) => set('restoreDwellMinutes', v)}
                />
              </div>
              <TextField
                label="Disable WLAN ids when dark (comma-separated)"
                value={form.disableWlanIds}
                onChange={(v) => set('disableWlanIds', v)}
              />
              <TextField
                label="Protected WLAN ids (never disabled)"
                value={form.protectedWlanIds}
                onChange={(v) => set('protectedWlanIds', v)}
              />
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <p className="mr-auto self-center text-[11px] text-muted-foreground">
            Modeled / not currently executable
          </p>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type="number"
        className="h-8"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <Input className="h-8" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
