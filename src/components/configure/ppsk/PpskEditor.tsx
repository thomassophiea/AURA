/**
 * PPSK identity editor. One key = one identity on a WPA2-Personal WLAN: a
 * passphrase bound to an SSID, tagged with a keyid the AP echoes on connect.
 *
 * The passphrase field is masked, generatable, and — for an existing key —
 * reveal-on-demand through the audited backend path (it is never sent to the
 * browser in the list). Per-key Role and VLAN carry the authorization the AP
 * applies to whoever presents the key.
 */
import React, { useMemo, useState } from 'react';
import { Sparkles, Eye } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Switch } from '../../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { EditorSheet, FieldRow, MaskedInput, Section } from '../_kit';
import { toast } from 'sonner';
import { ppskService, type PpskIdentity, type PpskInput, type PpskScope } from '../../../services/ppskService';

export interface PpskEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: PpskIdentity | null;
  saving: boolean;
  onSave: (payload: PpskInput) => void | Promise<void>;
}

interface Form {
  name: string;
  ssid: string;
  passphrase: string;
  description: string;
  role: string;
  vlanId: string;
  scope: PpskScope;
  expiresAt: string;
  maxDevices: string;
  enabled: boolean;
}

function fromRecord(record: PpskIdentity | null): Form {
  return {
    name: record?.name ?? '',
    ssid: record?.ssid ?? '',
    passphrase: '',
    description: record?.description ?? '',
    role: record?.role ?? '',
    vlanId: record?.vlanId != null ? String(record.vlanId) : '',
    scope: record?.scope ?? 'global',
    expiresAt: record?.expiresAt ? record.expiresAt.slice(0, 10) : '',
    maxDevices: record?.maxDevices != null ? String(record.maxDevices) : '',
    enabled: record?.enabled ?? true,
  };
}

export function PpskEditor({ open, onOpenChange, record, saving, onSave }: PpskEditorProps) {
  const isEdit = Boolean(record);
  const [form, setForm] = useState<Form>(() => fromRecord(record));
  const [dirty, setDirty] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const errors = useMemo(() => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!form.name.trim()) e.name = 'Identity name is required';
    if (!form.ssid.trim()) e.ssid = 'SSID is required';
    // Passphrase required on create; on edit, blank means "leave unchanged".
    const pass = form.passphrase;
    if (!isEdit && !pass) e.passphrase = 'Passphrase is required';
    else if (pass && (pass.length < 8 || pass.length > 63)) e.passphrase = 'Passphrase must be 8–63 characters';
    if (form.vlanId && !/^\d+$/.test(form.vlanId)) e.vlanId = 'VLAN must be a number';
    else if (form.vlanId && (Number(form.vlanId) < 1 || Number(form.vlanId) > 4094)) e.vlanId = 'VLAN must be 1–4094';
    if (form.maxDevices && (!/^\d+$/.test(form.maxDevices) || Number(form.maxDevices) < 1)) e.maxDevices = 'Must be a positive number';
    return e;
  }, [form, isEdit]);

  const valid = Object.keys(errors).length === 0;

  const generate = async () => {
    try {
      const passphrase = await ppskService.generate(14);
      set('passphrase', passphrase);
      toast.success('Generated a secure passphrase');
    } catch {
      toast.error('Could not generate a passphrase');
    }
  };

  const reveal = async () => {
    if (!record) return;
    setRevealing(true);
    try {
      const { passphrase } = await ppskService.reveal(record.id);
      set('passphrase', passphrase);
      toast.success('Passphrase revealed');
    } catch {
      toast.error('Could not reveal the passphrase');
    } finally {
      setRevealing(false);
    }
  };

  const submit = async () => {
    const payload: PpskInput = {
      name: form.name.trim(),
      ssid: form.ssid.trim(),
      description: form.description.trim() || null,
      role: form.role.trim() || null,
      vlanId: form.vlanId ? Number(form.vlanId) : null,
      scope: form.scope,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      maxDevices: form.maxDevices ? Number(form.maxDevices) : null,
      enabled: form.enabled,
    };
    // Only send a passphrase when one was entered (blank on edit = unchanged).
    if (form.passphrase) payload.passphrase = form.passphrase;
    await onSave(payload);
  };

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit ${record?.keyid}` : 'New PPSK identity'}
      description="One key, one identity, on a shared WPA2-Personal WLAN."
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={submit}
    >
      <Section title="Identity">
        <FieldRow label="Name" htmlFor="ppsk-name" required error={errors.name}
          description="Becomes the keyid the AP reports on connect (e.g. Thomas-Test).">
          <Input id="ppsk-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Thomas-Test" />
        </FieldRow>
        <FieldRow label="SSID" htmlFor="ppsk-ssid" required error={errors.ssid}
          description="The WPA2-Personal WLAN this key authenticates on. The PMK is bound to it.">
          <Input id="ppsk-ssid" value={form.ssid} onChange={(e) => set('ssid', e.target.value)} placeholder="Aura-PPSK-Lab" disabled={isEdit} />
        </FieldRow>
        <FieldRow label="Passphrase" htmlFor="ppsk-pass" required={!isEdit} error={errors.passphrase}
          description={isEdit ? 'Leave blank to keep the current key. Reveal or rotate here.' : '8–63 characters. Generate a strong one, or type your own.'}>
          <div className="flex items-center gap-2">
            <MaskedInput id="ppsk-pass" value={form.passphrase} onChange={(v) => set('passphrase', v)}
              placeholder={isEdit ? '••••••• (unchanged)' : 'Printer-3829'} />
            <Button type="button" variant="outline" size="icon" title="Generate" onClick={() => void generate()}>
              <Sparkles className="h-4 w-4" />
            </Button>
            {isEdit && (
              <Button type="button" variant="outline" size="icon" title="Reveal current" onClick={() => void reveal()} disabled={revealing}>
                <Eye className="h-4 w-4" />
              </Button>
            )}
          </div>
        </FieldRow>
        <FieldRow label="Description" htmlFor="ppsk-desc">
          <Textarea id="ppsk-desc" value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} />
        </FieldRow>
      </Section>

      <Section title="Authorization">
        <FieldRow label="Role" htmlFor="ppsk-role"
          description="The role the AP assigns to whoever presents this key.">
          <Input id="ppsk-role" value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="Employee-Test" />
        </FieldRow>
        <FieldRow label="VLAN" htmlFor="ppsk-vlan" error={errors.vlanId}
          description="Optional per-key VLAN (1–4094). Rendered as vlanid= in the key file.">
          <Input id="ppsk-vlan" value={form.vlanId} onChange={(e) => set('vlanId', e.target.value)} placeholder="30" />
        </FieldRow>
        <FieldRow label="Scope" htmlFor="ppsk-scope"
          description="Where this key applies. Global covers the whole organization.">
          <Select value={form.scope} onValueChange={(v) => set('scope', v as PpskScope)}>
            <SelectTrigger id="ppsk-scope" className="max-w-[240px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global (organization)</SelectItem>
              <SelectItem value="site-group">Site group</SelectItem>
              <SelectItem value="site">Site</SelectItem>
              <SelectItem value="gateway">Gateway</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>
      </Section>

      <Section title="Lifecycle">
        <FieldRow label="Enabled" inline
          description="A disabled key stops authenticating on the next AP key-file reload.">
          <Switch checked={form.enabled} onCheckedChange={(v) => set('enabled', v === true)} />
        </FieldRow>
        <FieldRow label="Expires" htmlFor="ppsk-exp"
          description="Optional. After this date the key is dropped from the key file.">
          <Input id="ppsk-exp" type="date" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} className="max-w-[200px]" />
        </FieldRow>
        <FieldRow label="Max devices" htmlFor="ppsk-max" error={errors.maxDevices}
          description="Optional advisory cap on simultaneous devices using this key.">
          <Input id="ppsk-max" value={form.maxDevices} onChange={(e) => set('maxDevices', e.target.value)} placeholder="unlimited" className="max-w-[200px]" />
        </FieldRow>
      </Section>
    </EditorSheet>
  );
}
