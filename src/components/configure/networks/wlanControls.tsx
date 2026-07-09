/**
 * Small shared controls for the WLAN editor tabs: enum + reference selects
 * over the shadcn Select primitive, and the common tab-props contract.
 */
import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import type { WlanService } from '../../../types/configure';
import type { EnumOption } from './wlanModel';
import type { WlanErrors, WlanFormState, WlanUiState } from './wlanForm';
import type { WlanRefs } from './useWlanRefs';

/** Radix Select forbids empty-string item values; sentinel for "none". */
const NONE = '__none__';

export interface EnumSelectProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: readonly EnumOption[];
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function EnumSelect({ value, onChange, options, disabled, className, id }: EnumSelectProps) {
  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={className ?? 'w-64'}>
        <SelectValue placeholder="Select..." />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface RefSelectProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  options: EnumOption[];
  noneLabel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/** Reference select with an explicit "None" entry writing null. */
export function RefSelect({
  value,
  onChange,
  options,
  noneLabel = 'None',
  disabled,
  className,
  id,
}: RefSelectProps) {
  return (
    <Select
      value={value || NONE}
      onValueChange={(next) => onChange(next === NONE ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className ?? 'w-64'}>
        <SelectValue placeholder="Select..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Map resource records to select options (Default VLAN gets "name (vlanid)"). */
export const toOptions = (items: Array<{ id: string; name?: string }>): EnumOption[] =>
  items.map((item) => ({ id: item.id, label: item.name ?? item.id }));

export const topologyOptions = (
  topologies: Array<{ id: string; name: string; vlanid?: number }>
): EnumOption[] =>
  topologies.map((t) => ({
    id: t.id,
    label: t.vlanid != null ? `${t.name} (${t.vlanid})` : t.name,
  }));

export const cosOptions = (items: Array<{ id: string; cosName: string }>): EnumOption[] =>
  items.map((item) => ({ id: item.id, label: item.cosName }));

/** Contract shared by every WLAN editor tab. */
export interface WlanTabProps {
  form: WlanFormState;
  setForm: React.Dispatch<React.SetStateAction<WlanFormState>>;
  errors: WlanErrors;
  isNew: boolean;
  refs: WlanRefs;
}

/** Immutable helpers used by the tabs. */
export const patchRecord =
  (setForm: WlanTabProps['setForm']) =>
  (patch: Partial<WlanService>): void =>
    setForm((prev) => ({ ...prev, record: { ...prev.record, ...patch } }));

export const patchUi =
  (setForm: WlanTabProps['setForm']) =>
  (patch: Partial<WlanUiState>): void =>
    setForm((prev) => ({ ...prev, ui: { ...prev.ui, ...patch } }));
