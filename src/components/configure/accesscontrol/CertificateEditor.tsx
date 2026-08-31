/**
 * Certificate editor (aaa_radius_certificate.html +
 * aaa_trusted_certificate_authorities.html): CSR subject fields and the CRL
 * distribution point list. Issuing and signing happen ON THE GATEWAY — this
 * screen holds the request subject and the revocation list; it does not
 * issue certificates. `name` is the record key on this API.
 */
import React, { useRef, useState } from 'react';
import { Input } from '../../ui/input';
import { EditorSheet, FieldRow, Section } from '../_kit';
import { StringListEditor } from './StringListEditor';
import type { AcCertificate } from '../../../services/configure/accessControlFamilyService';
import { D_CERT, isReadOnly, noErrors, uniqueNameError } from './accessControlModel';

export interface CertificateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: AcCertificate | null;
  /** Sibling certificate names for the uniqueness check. */
  siblingNames: string[];
  saving: boolean;
  onSave: (payload: Partial<AcCertificate>, id?: string) => void | Promise<void>;
}

export function CertificateEditor({
  open,
  onOpenChange,
  record,
  siblingNames,
  saving,
  onSave,
}: CertificateEditorProps) {
  const createMode = record == null;
  const ro = isReadOnly(record);
  const [form, setForm] = useState<AcCertificate>(() => structuredClone(record ?? D_CERT));
  const initial = useRef(JSON.stringify(record ?? D_CERT));
  const dirty = JSON.stringify(form) !== initial.current;

  const upd = <K extends keyof AcCertificate>(key: K, value: AcCertificate[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const crls = Array.isArray(form.crl_urls) ? form.crl_urls : [];
  const errs = {
    name: uniqueNameError(form.name ?? '', siblingNames, record?.name),
    subject: (form.subject ?? '').trim() ? null : 'Subject is required',
  };
  const valid = noErrors(errs) && !ro;

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={createMode ? 'Add Certificate' : form.name || 'Edit Certificate'}
      description="Access Control certificate (/access-control/v1/certificates)"
      width={760}
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={() => onSave(structuredClone(form), record?.name)}
    >
      <div className="max-w-[600px] space-y-6">
        <Section title="Certificate">
          <FieldRow label="Name" htmlFor="acc-name" required error={dirty ? errs.name : null}>
            <Input
              id="acc-name"
              value={form.name ?? ''}
              disabled={ro}
              onChange={(e) => upd('name', e.target.value)}
              className="max-w-[340px]"
            />
          </FieldRow>
          <FieldRow label="Subject" htmlFor="acc-subject" required error={dirty ? errs.subject : null}>
            <Input
              id="acc-subject"
              value={form.subject ?? ''}
              disabled={ro}
              onChange={(e) => upd('subject', e.target.value)}
              className="max-w-[480px]"
            />
          </FieldRow>
          <FieldRow label="Issuer" htmlFor="acc-issuer">
            <Input
              id="acc-issuer"
              value={form.issuer ?? ''}
              disabled={ro}
              onChange={(e) => upd('issuer', e.target.value)}
              className="max-w-[480px]"
            />
          </FieldRow>
          <FieldRow label="Valid From" htmlFor="acc-from">
            <Input
              id="acc-from"
              value={form.valid_from ?? ''}
              disabled={ro}
              onChange={(e) => upd('valid_from', e.target.value)}
              className="max-w-[240px]"
            />
          </FieldRow>
          <FieldRow label="Valid To" htmlFor="acc-to">
            <Input
              id="acc-to"
              value={form.valid_to ?? ''}
              disabled={ro}
              onChange={(e) => upd('valid_to', e.target.value)}
              className="max-w-[240px]"
            />
          </FieldRow>
          <p className="text-xs text-muted-foreground">
            Signing requests are generated and certificates installed on the Gateway. This screen
            holds the request subject and the revocation list; it does not issue certificates.
          </p>
        </Section>

        <Section title="CRL Distribution Points">
          <StringListEditor
            values={crls}
            onChange={(next) => upd('crl_urls', next)}
            disabled={ro}
            placeholder="http://crl.example.com/ca.crl"
            emptyText="No CRL URLs."
          />
        </Section>
      </div>
    </EditorSheet>
  );
}
