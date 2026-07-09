/**
 * Small shared form controls for the AP editor: an enum/string Select over the
 * shadcn primitive (with the empty-value sentinel Radix requires) and a
 * number input bound to the manual-useState idiom.
 */
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Input } from '../../ui/input';
import type { Opt } from './apHelpers';

/** Radix Select forbids empty-string item values; sentinel maps to ''. */
const EMPTY = '__empty__';

function normalize(options: readonly (Opt | string)[]): Opt[] {
  return options.map((o) => (typeof o === 'string' ? { id: o, label: o } : o));
}

export interface ApSelectProps {
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  options: readonly (Opt | string)[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function ApSelect({
  value,
  onChange,
  options,
  disabled,
  placeholder = 'Select...',
  className,
  id,
}: ApSelectProps) {
  const opts = normalize(options);
  const current = value == null ? '' : String(value);
  return (
    <Select
      value={current === '' ? EMPTY : current}
      onValueChange={(next) => onChange(next === EMPTY ? '' : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className ?? 'w-56'}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opts.map((o) => (
          <SelectItem key={o.id === '' ? EMPTY : o.id} value={o.id === '' ? EMPTY : o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface NumberFieldProps {
  value: number | string | null | undefined;
  onChange: (value: number | '') => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  disabled,
  className,
  placeholder,
  id,
}: NumberFieldProps) {
  return (
    <Input
      id={id}
      type="number"
      min={min}
      max={max}
      disabled={disabled}
      placeholder={placeholder}
      value={value == null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      className={className ?? 'w-32'}
    />
  );
}
