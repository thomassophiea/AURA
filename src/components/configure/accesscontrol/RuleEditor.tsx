/**
 * Rule editor (rule.html): five criteria groups, each {value, edit, invert} —
 * `edit` is the Gateway telling the UI whether that criterion may be changed
 * on THIS rule, and `invert` is its NOT switch, offered only on an editable
 * criterion whose value is not "Any". Role and Portal use the same
 * {value, edit} shape and each honors its own edit:false independently.
 */
import React, { useRef, useState } from 'react';
import { Switch } from '../../ui/switch';
import { Input } from '../../ui/input';
import { EditorSheet, FieldRow, Section } from '../_kit';
import { EnumSelect } from '../policy/fields';
import type { AcRule, AcRuleCriterion } from '../../../services/configure/accessControlFamilyService';
import {
  D_RULE,
  RULE_CRITERIA,
  type RuleCriterionKey,
  criterionEditable,
  isReadOnly,
  noErrors,
  showInvert,
  uniqueNameError,
} from './accessControlModel';

export interface RuleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: AcRule | null;
  /** Group names per criterion category (already filtered by the page). */
  groupOptions: Record<RuleCriterionKey, string[]>;
  /** Role names from /v3/roles. */
  roleOptions: string[];
  /** Portal names ("Default" + any values already on the wire). */
  portalOptions: string[];
  /** Sibling rule names for the uniqueness check. */
  siblingNames: string[];
  saving: boolean;
  onSave: (payload: Partial<AcRule>, id?: string) => void | Promise<void>;
}

const DEFAULT_CRITERION: AcRuleCriterion = { value: 'Any', edit: true, invert: false };

export function RuleEditor({
  open,
  onOpenChange,
  record,
  groupOptions,
  roleOptions,
  portalOptions,
  siblingNames,
  saving,
  onSave,
}: RuleEditorProps) {
  const createMode = record == null;
  const ro = isReadOnly(record);
  const [form, setForm] = useState<AcRule>(() => structuredClone(record ?? D_RULE));
  const initial = useRef(JSON.stringify(record ?? D_RULE));
  const dirty = JSON.stringify(form) !== initial.current;

  const errs = {
    name: uniqueNameError(form.name ?? '', siblingNames, record?.name),
    role: (form.role?.value ?? '').trim() ? null : 'Role is required',
  };
  const valid = noErrors(errs) && !ro;

  const updCriterion = (key: RuleCriterionKey | 'role' | 'portal', patch: Partial<AcRuleCriterion>) =>
    setForm((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? DEFAULT_CRITERION), ...patch },
    }));

  const withCurrent = (options: string[], current: string | undefined): string[] => {
    const list = [...options];
    if (current && !list.includes(current)) list.unshift(current);
    return list;
  };

  /** "Any" first, then the category's group names (deduped, current preserved). */
  const criterionOpts = (options: string[], current: string) => {
    const names = withCurrent(options, current !== 'Any' ? current : undefined).filter(
      (n) => n !== 'Any'
    );
    return ['Any', ...Array.from(new Set(names))].map((v) => ({ id: v, label: v }));
  };

  const roleEditable = form.role?.edit !== false;
  const portalEditable = form.portal?.edit !== false;

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={createMode ? 'Add Rule' : form.name || 'Edit Rule'}
      description="Access Control rule (/access-control/v1/rules)"
      width={780}
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={() => onSave(structuredClone(form), record?.name)}
    >
      <div className="max-w-[620px] space-y-6">
        <Section title="Rule">
          <FieldRow label="Name" htmlFor="acrule-name" required error={dirty ? errs.name : null}>
            <Input
              id="acrule-name"
              value={form.name ?? ''}
              disabled={ro}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="max-w-[360px]"
            />
          </FieldRow>
          {/* enabled is only togglable when the Gateway says so (enabled_edit) */}
          <FieldRow
            label="Enabled"
            inline
            description={
              form.enabled_edit === false
                ? 'This rule cannot be disabled on the Gateway.'
                : undefined
            }
          >
            <Switch
              checked={form.enabled !== false}
              disabled={ro || form.enabled_edit === false}
              onCheckedChange={(v) => setForm((prev) => ({ ...prev, enabled: v }))}
              aria-label="Enabled"
            />
          </FieldRow>
        </Section>

        <Section title="Criteria">
          {RULE_CRITERIA.map((criterion) => {
            const current = form[criterion.id] ?? DEFAULT_CRITERION;
            const editable = !ro && criterionEditable(current);
            return (
              <FieldRow key={criterion.id} label={criterion.label}>
                <div className="flex items-center gap-4">
                  {editable ? (
                    <EnumSelect
                      value={current.value}
                      options={criterionOpts(groupOptions[criterion.id] ?? [], current.value)}
                      onChange={(v) => updCriterion(criterion.id, { value: v })}
                      className="w-72"
                      aria-label={criterion.label}
                    />
                  ) : (
                    <p className="w-72 text-sm text-muted-foreground">{current.value}</p>
                  )}
                  {/* invert appears only on an editable criterion whose value is not "Any" */}
                  {!ro && showInvert(current) && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={!!current.invert}
                        onCheckedChange={(v) => updCriterion(criterion.id, { invert: v })}
                        aria-label={`Invert ${criterion.label}`}
                      />
                      Invert
                    </label>
                  )}
                </div>
              </FieldRow>
            );
          })}
        </Section>

        <Section title="Action">
          <FieldRow label="Role" required error={dirty ? errs.role : null}>
            {!ro && roleEditable ? (
              <EnumSelect
                value={form.role?.value ?? ''}
                options={[
                  { id: '', label: '— Select —' },
                  ...withCurrent(roleOptions, form.role?.value || undefined).map((r) => ({
                    id: r,
                    label: r,
                  })),
                ]}
                onChange={(v) => updCriterion('role', { value: v })}
                className="w-72"
                aria-label="Role"
              />
            ) : (
              <p className="text-sm text-muted-foreground">{form.role?.value || '—'}</p>
            )}
          </FieldRow>
          <FieldRow label="Portal">
            {!ro && portalEditable ? (
              <EnumSelect
                value={form.portal?.value ?? ''}
                options={[
                  { id: '', label: '— None —' },
                  ...withCurrent(portalOptions, form.portal?.value || undefined).map((p) => ({
                    id: p,
                    label: p,
                  })),
                ]}
                onChange={(v) => updCriterion('portal', { value: v })}
                className="w-72"
                aria-label="Portal"
              />
            ) : (
              <p className="text-sm text-muted-foreground">{form.portal?.value || '—'}</p>
            )}
          </FieldRow>
        </Section>
      </div>
    </EditorSheet>
  );
}
