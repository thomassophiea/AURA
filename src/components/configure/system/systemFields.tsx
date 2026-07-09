/**
 * Small typed field wrappers shared by the System & Security editors, in the
 * house manual-useState validation idiom (one error string per field). These
 * mirror the AAA editor's field helpers but are local to the System tree so
 * nothing outside src/components/configure/system is touched.
 */
import React from 'react';
import { FieldRow } from '../_kit';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { MaskedInput } from '../_kit';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';

/** Accessible name for the control when the visual label is a plain string. */
function ariaLabel(label: React.ReactNode): string | undefined {
  return typeof label === 'string' ? label : undefined;
}

export interface TextFieldProps {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  description?: React.ReactNode;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
}

export function TextField({
  label,
  value,
  onChange,
  error,
  description,
  placeholder,
  required,
  disabled,
  maxLength,
}: TextFieldProps) {
  return (
    <FieldRow label={label} error={error} description={description} required={required}>
      <Input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        aria-label={ariaLabel(label)}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[320px]"
      />
    </FieldRow>
  );
}

export interface NumberFieldProps {
  label: React.ReactNode;
  value: number | '';
  onChange: (value: number | '') => void;
  error?: string | null;
  description?: React.ReactNode;
  min?: number;
  max?: number;
  required?: boolean;
  disabled?: boolean;
}

export function NumberField({
  label,
  value,
  onChange,
  error,
  description,
  min,
  max,
  required,
  disabled,
}: NumberFieldProps) {
  return (
    <FieldRow label={label} error={error} description={description} required={required}>
      <Input
        type="number"
        value={value === '' ? '' : value}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={ariaLabel(label)}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className="max-w-[180px]"
      />
    </FieldRow>
  );
}

export interface SelectFieldProps {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  error?: string | null;
  description?: React.ReactNode;
  disabled?: boolean;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  error,
  description,
  disabled,
}: SelectFieldProps) {
  return (
    <FieldRow label={label} error={error} description={description}>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="max-w-[320px]" aria-label={ariaLabel(label)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  );
}

export interface SwitchFieldProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: React.ReactNode;
  disabled?: boolean;
}

export function SwitchField({ label, checked, onChange, description, disabled }: SwitchFieldProps) {
  return (
    <FieldRow label={label} description={description} inline>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel(label)}
      />
    </FieldRow>
  );
}

export interface MaskedFieldProps {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  description?: React.ReactNode;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

export function MaskedField({
  label,
  value,
  onChange,
  error,
  description,
  placeholder,
  required,
  disabled,
}: MaskedFieldProps) {
  return (
    <FieldRow label={label} error={error} description={description} required={required}>
      <div className="max-w-[320px]">
        <MaskedInput
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={ariaLabel(label)}
        />
      </div>
    </FieldRow>
  );
}
