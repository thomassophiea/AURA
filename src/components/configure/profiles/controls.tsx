/**
 * Small presentational primitives shared across the profile editor tabs and
 * dialogs, built on the AURA shadcn kit. `PSelect` maps the controller's empty
 * "— None —" id to a sentinel so it survives Radix Select (which forbids an
 * empty-string item value).
 */
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Checkbox } from '../../ui/checkbox';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { cn } from '../../ui/utils';
import type { Opt } from './types';

const NONE = '__none__';

export interface PSelectProps {
  value: string | null | undefined;
  options: Opt[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

export function PSelect({ value, options, onChange, disabled, placeholder, className, ariaLabel }: PSelectProps) {
  const toItem = (id: string) => (id === '' ? NONE : id);
  const current = value == null || value === '' ? NONE : value;
  return (
    <Select
      value={options.some((o) => toItem(o.id) === current) ? current : undefined}
      onValueChange={(v) => onChange(v === NONE ? '' : v)}
      disabled={disabled}
    >
      <SelectTrigger className={cn('h-9', className)} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder ?? 'Select...'} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id || NONE} value={toItem(o.id)}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** On/Off (boolean) select — controller renders many toggles as an Enabled/Disabled dropdown. */
export function BoolSelect({
  value,
  onChange,
  disabled,
  onLabel = 'Enabled',
  offLabel = 'Disabled',
  className,
}: {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  onLabel?: string;
  offLabel?: string;
  className?: string;
}) {
  return (
    <PSelect
      value={value ? 'on' : 'off'}
      options={[
        { id: 'on', label: onLabel },
        { id: 'off', label: offLabel },
      ]}
      onChange={(v) => onChange(v === 'on')}
      disabled={disabled}
      className={className}
    />
  );
}

/** Checkbox that reports a plain boolean (Radix reports boolean | 'indeterminate'). */
export function PCheck({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <Checkbox
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onCheckedChange={(c) => onChange(c === true)}
    />
  );
}

export function NumInput({
  value,
  onChange,
  disabled,
  className,
}: {
  value: number | string | null | undefined;
  onChange: (value: number | '') => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Input
      type="number"
      value={value == null ? '' : String(value)}
      disabled={disabled}
      className={cn('h-9', className)}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
    />
  );
}

/** Label (left) + control (right) row used inside dialogs. */
export function LabelRow({
  label,
  children,
  error,
  labelWidth = 220,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  error?: string | null;
  labelWidth?: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-4">
        <Label className="shrink-0 text-right text-muted-foreground" style={{ width: labelWidth }}>
          {label}
        </Label>
        <div className="flex-1">{children}</div>
      </div>
      {error && (
        <p className="text-xs text-destructive" style={{ marginLeft: labelWidth + 16 }}>
          {error}
        </p>
      )}
    </div>
  );
}
