/**
 * Class of Service editor (controller cos.html): priority enum, two-mode
 * ToS/DSCP + numeric cosQos.mask, and inbound/outbound bandwidth-limit selects
 * that bind rate-limiter IDS (not names) with inline limiter add/edit/delete.
 */
import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Input } from '../../ui/input';
import type { Cos, RateLimiter } from '../../../types/configure';
import { ConfirmDialog, EditorSheet, FieldRow, Section } from '../_kit';
import { COS_MASKS, COS_PRIORITIES } from './constants';
import { EnumSelect, IconAction } from './fields';
import { cosErrors } from './policyUtils';
import { RateLimiterDialog } from './RateLimiterDialog';
import { TosDscpDialog, TosRow } from './TosDscpDialog';
import { useDraft } from './useDraft';

type RlField = 'inboundRateLimiterId' | 'outboundRateLimiterId';

export interface CosEditorProps {
  /** null → create (seeded from the /default template via `seed`). */
  record: Cos | null;
  seed: Partial<Cos> | null;
  rateLimiters: RateLimiter[];
  saving: boolean;
  rlSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: Partial<Cos>, id?: string) => void | Promise<void>;
  /** Inline rate-limiter CRUD (persists immediately; returns the saved record). */
  onRlSave: (payload: Partial<RateLimiter>, id?: string) => Promise<RateLimiter | null>;
  onRlDelete: (limiter: RateLimiter) => Promise<boolean>;
}

const EMPTY_QOS: Cos['cosQos'] = { priority: 'notApplicable', tosDscp: null, mask: null };

export function CosEditor({
  record,
  seed,
  rateLimiters,
  saving,
  rlSaving,
  onOpenChange,
  onSave,
  onRlSave,
  onRlDelete,
}: CosEditorProps) {
  const isNew = !record;
  const { form, upd, dirty } = useDraft<Partial<Cos>>(
    record ?? { cosQos: EMPTY_QOS, ...(seed ?? {}) }
  );
  const [tosOpen, setTosOpen] = useState(false);
  const [rlEditor, setRlEditor] = useState<{ field: RlField; record: RateLimiter | null } | null>(
    null
  );
  const [rlDelete, setRlDelete] = useState<{ field: RlField; record: RateLimiter } | null>(null);

  const canEdit = form.canEdit !== false;
  const qos = form.cosQos ?? EMPTY_QOS;
  const errs = cosErrors(form);
  const valid = Object.keys(errs).length === 0 && canEdit;

  const rlOptions = [
    { id: '', label: 'None' },
    ...rateLimiters.map((r) => ({ id: r.id, label: r.name })),
  ];

  const bwRow = (label: string, field: RlField) => {
    const current = (form[field] as string | null | undefined) ?? '';
    const selected = rateLimiters.find((r) => r.id === current) ?? null;
    return (
      <FieldRow label={label}>
        <div className="flex items-center gap-1.5">
          <EnumSelect
            value={current}
            options={rlOptions}
            onChange={(v) => upd(field, v || null)}
            className="w-56"
            aria-label={label}
          />
          <IconAction title="Add rate limiter" onClick={() => setRlEditor({ field, record: null })}>
            <Plus className="h-4 w-4" />
          </IconAction>
          {selected && (
            <IconAction
              title="Edit rate limiter"
              onClick={() => setRlEditor({ field, record: selected })}
            >
              <Pencil className="h-4 w-4" />
            </IconAction>
          )}
          {selected && (
            <IconAction
              title="Delete rate limiter"
              destructive
              disabled={selected.canDelete === false}
              onClick={() => setRlDelete({ field, record: selected })}
            >
              <Trash2 className="h-4 w-4" />
            </IconAction>
          )}
        </div>
      </FieldRow>
    );
  };

  return (
    <EditorSheet
      open
      onOpenChange={onOpenChange}
      title={isNew ? 'Add Class of Service' : form.cosName || 'Class of Service'}
      description={
        canEdit
          ? 'Priority, ToS/DSCP marking and bandwidth limits'
          : 'This Class of Service is predefined and read-only.'
      }
      dirty={dirty || isNew}
      valid={valid}
      saving={saving}
      onSave={() => void onSave(form, record?.id)}
    >
      <div className="space-y-6">
        <Section title="General">
          <FieldRow label="Name" required error={dirty || !isNew ? errs.name : undefined}>
            <Input
              value={form.cosName ?? ''}
              maxLength={64}
              disabled={!canEdit || form.predefined === true}
              title={form.predefined ? 'Predefined CoS cannot be renamed' : undefined}
              onChange={(e) => upd('cosName', e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Priority" description="802.1p priority (Any = not applied)">
            <EnumSelect
              value={qos.priority || 'notApplicable'}
              options={COS_PRIORITIES}
              onChange={(v) => upd('cosQos.priority', v)}
              disabled={!canEdit}
            />
          </FieldRow>
          <FieldRow label="ToS/DSCP">
            <TosRow
              tosDscp={qos.tosDscp}
              onTosChange={(v) => upd('cosQos.tosDscp', v)}
              maskValue={qos.mask != null ? String(qos.mask) : ''}
              maskOptions={COS_MASKS}
              onMaskChange={(v) => upd('cosQos.mask', v === '' ? null : Number(v))}
              onConfigure={() => setTosOpen(true)}
            />
          </FieldRow>
        </Section>

        <Section title="Bandwidth Limits" description="Rate limiters applied per direction">
          {bwRow('Inbound Bandwidth Limit', 'inboundRateLimiterId')}
          {bwRow('Outbound Bandwidth Limit', 'outboundRateLimiterId')}
        </Section>
      </div>

      {tosOpen && (
        <TosDscpDialog
          open
          onOpenChange={setTosOpen}
          value={qos.tosDscp}
          onApply={(v) => upd('cosQos.tosDscp', v)}
        />
      )}
      {rlEditor && (
        <RateLimiterDialog
          key={rlEditor.record?.id ?? 'new'}
          open
          onOpenChange={(open) => {
            if (!open) setRlEditor(null);
          }}
          record={rlEditor.record}
          saving={rlSaving}
          onSubmit={async (payload, id) => {
            const saved = await onRlSave(payload, id);
            if (saved) {
              upd(rlEditor.field, saved.id);
              setRlEditor(null);
            }
          }}
        />
      )}
      <ConfirmDialog
        open={rlDelete != null}
        onOpenChange={(open) => {
          if (!open) setRlDelete(null);
        }}
        title={`Delete rate limiter "${rlDelete?.record.name ?? ''}"?`}
        description="This permanently removes the rate limiter from the controller. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!rlDelete) return;
          const ok = await onRlDelete(rlDelete.record);
          if (ok && form[rlDelete.field] === rlDelete.record.id) upd(rlDelete.field, null);
          setRlDelete(null);
        }}
      />
    </EditorSheet>
  );
}
