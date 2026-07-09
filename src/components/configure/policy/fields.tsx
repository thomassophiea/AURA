/**
 * Tiny field wrappers shared by the Policy editors: an Opt[]-driven Select
 * (Radix SelectItem cannot carry value="" so an empty id is mapped through a
 * sentinel), a bounded number input, and an icon-button row helper.
 */
import React from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import type { Opt } from './constants';

const EMPTY_SENTINEL = '__empty__';

export interface EnumSelectProps {
  value: string;
  options: Opt[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

export function EnumSelect({
  value,
  options,
  onChange,
  disabled,
  placeholder,
  className,
  id,
  'aria-label': ariaLabel,
}: EnumSelectProps) {
  return (
    <Select
      value={value === '' ? EMPTY_SENTINEL : value}
      onValueChange={(v) => onChange(v === EMPTY_SENTINEL ? '' : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className ?? 'w-56'} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder ?? 'Select...'} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id === '' ? EMPTY_SENTINEL : o.id} value={o.id === '' ? EMPTY_SENTINEL : o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface NumInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'> {
  value: number | '' | null | undefined;
  onChange: (value: number | '') => void;
}

/** Numeric input that round-trips '' (unset) instead of NaN. */
export function NumInput({ value, onChange, className, ...props }: NumInputProps) {
  return (
    <Input
      {...props}
      type="number"
      value={value == null ? '' : value}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      className={className ?? 'w-32'}
    />
  );
}

export interface IconActionProps {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  children: React.ReactNode;
  destructive?: boolean;
}

export function IconAction({ title, onClick, disabled, children, destructive }: IconActionProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={`h-7 w-7 ${destructive ? 'text-destructive hover:text-destructive' : ''}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
