/**
 * Compact controls shared by the RF editor tabs: a grid number cell (with
 * inline range error) and a labelled numeric row. Kept separate so each tab
 * component stays under the house 300-line cap.
 */
import React from 'react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { cn } from '../../ui/utils';

export interface RfTabProps {
  /** Active sub-document (form.smartRf | form.acs) — never null while rendering. */
  cfg: unknown;
  /** 'smartRf' | 'acs' — the payload root the paths are written under. */
  root: string;
  isAcs: boolean;
  /** sensitivity === 'CUSTOM' — unlocks the advanced numeric fields. */
  custom: boolean;
  errs: Record<string, string>;
  update: (path: string, value: unknown) => void;
}

/** Numeric input from a resolved value; the caller wires onChange to setPath. */
export function NumCellRaw({
  value,
  onChange,
  error,
  disabled,
  width = 90,
}: {
  value: unknown;
  onChange: (value: number | '') => void;
  error?: string;
  disabled?: boolean;
  width?: number;
}) {
  return (
    <div>
      <Input
        type="number"
        value={value === '' || value == null ? '' : (value as number)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className={cn('h-8', error && 'border-destructive', disabled && 'opacity-55')}
        style={{ width }}
      />
      {error && <p className="mt-0.5 text-[10.5px] text-destructive">{error}</p>}
    </div>
  );
}

/** Uppercase section sub-heading inside a tab. */
export function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

/** Grid header row shared by the band tables. */
export function GridHead({ cols, template }: { cols: string[]; template: string }) {
  return (
    <div
      className="grid gap-2 bg-muted/50 px-3 py-2 text-[11.5px] font-semibold"
      style={{ gridTemplateColumns: template }}
    >
      {cols.map((c) => (
        <div key={c}>{c}</div>
      ))}
    </div>
  );
}

/** Label + control single row (label fixed width, control right). */
export function LabelRow({
  label,
  children,
  width = 220,
  error,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  error?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-3">
        <Label className="shrink-0 text-sm" style={{ width }}>
          {label}
        </Label>
        {children}
      </div>
      {error && <p className="mt-1 text-xs text-destructive" style={{ marginLeft: width + 12 }}>{error}</p>}
    </div>
  );
}
