/**
 * Editable list of strings (LDAP connection URLs, certificate CRL
 * distribution points): inline edit per row, remove, and a validated
 * add-input row.
 */
import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';

export interface StringListEditorProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  /** Returns an error message when the candidate value may not be added. */
  validateAdd?: (value: string) => string | null;
  disabled?: boolean;
  addLabel?: string;
}

export function StringListEditor({
  values,
  onChange,
  placeholder,
  emptyText = 'No entries.',
  validateAdd,
  disabled,
  addLabel = 'Add',
}: StringListEditorProps) {
  const [draft, setDraft] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmed = draft.trim();
  const addError = trimmed && validateAdd ? validateAdd(trimmed) : null;
  const canAdd = !disabled && !!trimmed && !addError;

  const add = () => {
    if (!canAdd) return;
    onChange([...values, trimmed]);
    setDraft('');
    setTouched(false);
  };

  return (
    <div className="space-y-2">
      {values.length === 0 && <p className="text-sm text-muted-foreground">{emptyText}</p>}
      {values.map((value, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
            aria-label={`Entry ${i + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
            disabled={disabled}
            aria-label="Remove entry"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {!disabled && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              placeholder={placeholder}
              onChange={(e) => {
                setDraft(e.target.value);
                setTouched(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={!canAdd} onClick={add}>
              <Plus className="mr-1 h-4 w-4" />
              {addLabel}
            </Button>
          </div>
          {touched && addError && <p className="text-xs text-destructive">{addError}</p>}
        </div>
      )}
    </div>
  );
}
