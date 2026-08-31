/**
 * Group editor (group.html): identity + mode, then a type-specific entry
 * table. Group Type is chosen once at create (a static label afterwards) and
 * CHANGING it clears the entries; predefined (is_readonly) groups render
 * fully read-only. `name` is the record key on this API; the LIST omits
 * `entries`, so the page fetches the detail before opening this editor.
 */
import React, { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { EditorSheet, FieldRow, Section } from '../_kit';
import { EnumSelect } from '../policy/fields';
import type { AcGroup, AcGroupEntry } from '../../../services/configure/accessControlFamilyService';
import {
  D_GROUP,
  GROUP_MODES,
  GROUP_TYPES,
  blankEntry,
  changeGroupType,
  entrySpecFor,
  groupEntryErrors,
  isReadOnly,
  noErrors,
  uniqueNameError,
} from './accessControlModel';

export interface GroupEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → create; a clone seed may be provided instead. */
  record: AcGroup | null;
  /** Clone seed (create mode with prefilled type/entries). */
  seed?: AcGroup | null;
  /** Sibling group names for the uniqueness check. */
  siblingNames: string[];
  saving: boolean;
  onSave: (payload: Partial<AcGroup>, id?: string) => void | Promise<void>;
}

export function GroupEditor({
  open,
  onOpenChange,
  record,
  seed,
  siblingNames,
  saving,
  onSave,
}: GroupEditorProps) {
  const createMode = record == null;
  const ro = isReadOnly(record);
  const base = record ?? seed ?? D_GROUP;
  const [form, setForm] = useState<AcGroup>(() => structuredClone(base));
  const initial = useRef(JSON.stringify(base));
  const dirty = JSON.stringify(form) !== initial.current;

  const upd = <K extends keyof AcGroup>(key: K, value: AcGroup[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const spec = entrySpecFor(form.type);
  const entries = Array.isArray(form.entries) ? form.entries : [];

  const errs = {
    name: uniqueNameError(form.name ?? '', siblingNames, record?.name),
    ...groupEntryErrors(spec, entries),
  };
  const valid = noErrors(errs) && !ro;

  const setEntryField = (index: number, field: string, value: string) =>
    setForm((prev) => {
      const next = structuredClone(prev);
      const list = Array.isArray(next.entries) ? next.entries : [];
      const entry = list[index] ?? ({} as AcGroupEntry);
      const inner = { ...((entry[spec.key] as Record<string, unknown> | null) ?? {}), [field]: value };
      list[index] = { ...entry, [spec.key]: inner };
      next.entries = list;
      return next;
    });

  const addEntry = () => upd('entries', [...entries, blankEntry(spec)]);
  const removeEntry = (index: number) =>
    upd('entries', entries.filter((_, i) => i !== index));

  const gridTemplate = `${spec.cols.map(() => 'minmax(0,1fr)').join(' ')} 40px`;

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={createMode ? 'Add Group' : form.name || 'Edit Group'}
      description="Access Control group (/access-control/v1/groups)"
      width={820}
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={() => onSave(structuredClone(form), record?.name)}
    >
      <div className="space-y-6">
        <Section title="Group">
          <FieldRow label="Name" htmlFor="acg-name" required error={dirty ? errs.name : null}>
            {ro ? (
              <p className="text-sm text-muted-foreground">{form.name}</p>
            ) : (
              <Input
                id="acg-name"
                value={form.name ?? ''}
                onChange={(e) => upd('name', e.target.value)}
                className="max-w-[340px]"
              />
            )}
          </FieldRow>
          <FieldRow label="Description" htmlFor="acg-desc">
            <Input
              id="acg-desc"
              value={form.description ?? ''}
              disabled={ro}
              onChange={(e) => upd('description', e.target.value)}
              className="max-w-[460px]"
            />
          </FieldRow>
          {/* type is chosen once at create; a static label afterwards (group.html ng-if createMode) */}
          <FieldRow
            label="Group Type"
            htmlFor="acg-type"
            description={createMode ? 'Changing the type clears the entries below' : undefined}
          >
            {createMode ? (
              <EnumSelect
                id="acg-type"
                value={form.type}
                options={GROUP_TYPES}
                onChange={(v) => setForm((prev) => changeGroupType(prev, v))}
                className="w-72"
                aria-label="Group Type"
              />
            ) : (
              <p className="text-sm text-muted-foreground">{form.type}</p>
            )}
          </FieldRow>
          <FieldRow label="Mode" htmlFor="acg-mode">
            <EnumSelect
              id="acg-mode"
              value={form.mode ?? 'MATCH_ANY'}
              options={GROUP_MODES}
              disabled={ro}
              onChange={(v) => upd('mode', v)}
              className="w-52"
              aria-label="Mode"
            />
          </FieldRow>
          {form.is_registration && (
            <p className="text-xs text-muted-foreground">This is a registration group.</p>
          )}
          {ro && (
            <p className="text-xs text-muted-foreground">
              Predefined group — read-only on the Gateway.
            </p>
          )}
        </Section>

        <Section title="Entries">
          <div
            className="grid items-center gap-2 border-b border-border pb-2 text-xs font-medium"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {spec.cols.map((col) => (
              <div key={col.field}>{col.label}</div>
            ))}
            <div />
          </div>
          {entries.length === 0 && <p className="text-sm text-muted-foreground">No entries.</p>}
          {entries.map((entry, i) => {
            const value = (entry[spec.key] as Record<string, unknown> | null) ?? {};
            const rowError = errs[`e${i}`];
            return (
              <div key={i} className="space-y-1">
                <div
                  className="grid items-center gap-2"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  {spec.cols.map((col) =>
                    col.kind === 'sel' ? (
                      <EnumSelect
                        key={col.field}
                        value={String(value[col.field] ?? '')}
                        options={col.options ?? []}
                        disabled={ro}
                        onChange={(v) => setEntryField(i, col.field, v)}
                        className="w-full"
                        aria-label={`${col.label} row ${i + 1}`}
                      />
                    ) : (
                      <Input
                        key={col.field}
                        value={String(value[col.field] ?? '')}
                        disabled={ro}
                        onChange={(e) => setEntryField(i, col.field, e.target.value)}
                        aria-label={`${col.label} row ${i + 1}`}
                      />
                    )
                  )}
                  {ro ? (
                    <div />
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label={`Remove entry ${i + 1}`}
                      onClick={() => removeEntry(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {rowError && <p className="text-xs text-destructive">{rowError}</p>}
              </div>
            );
          })}
          {!ro && (
            <Button type="button" variant="outline" size="sm" onClick={addEntry}>
              <Plus className="mr-1 h-4 w-4" />
              Add Entry
            </Button>
          )}
        </Section>
      </div>
    </EditorSheet>
  );
}
