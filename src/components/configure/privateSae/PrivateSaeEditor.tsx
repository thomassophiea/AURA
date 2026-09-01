/**
 * Add / Edit Private SAE credential modal — mirrors the golden EP1 "Pre-Shared
 * Keys" design, adapted for WPA3-Personal (SAE): KEY IDENTITY · SCOPE · NETWORK
 * (SSID default AURA_PSAE, VLAN, Role) · USAGE (maxDevices) · CREDENTIAL.
 *
 * A credential is a decoupled object: it may reference a Role and an SSID but is
 * never owned by one. Scope decides where it applies. Usage decides whether it is
 * shared or single-user, and maxDevices caps how many MACs can enroll. The
 * passphrase is masked, generatable, and — for an existing credential — revealed
 * on demand through the audited backend path.
 */
import React, { useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Checkbox } from '../../ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';
import { Label } from '../../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import {
  privateSaeService,
  type SaeCredential,
  type SaeInput,
  type SaeScope,
  type SaeUsage,
} from '../../../services/privateSaeService';

/** The default WLAN Private SAE credentials are provisioned onto. */
export const DEFAULT_SSID = 'AURA_PSAE';
/** SAE passphrase minimum enforced by the server; mirrored for inline validation. */
const MIN_PASSPHRASE = 20;
const MAX_PASSPHRASE = 63;

export interface PrivateSaeEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: SaeCredential | null;
  saving: boolean;
  /** SSIDs with a WPA3-Personal (SAE) privacy element. */
  ssidOptions: string[];
  roleOptions: string[];
  onSave: (payload: SaeInput) => void | Promise<void>;
}

interface Form {
  name: string;
  description: string;
  email: string;
  scope: SaeScope;
  scopeRef: string;
  ssid: string;
  vlanId: string;
  role: string;
  usage: SaeUsage;
  maxDevices: string;
  passphrase: string;
  notify: boolean;
}

function fromRecord(record: SaeCredential | null): Form {
  return {
    name: record?.name ?? '',
    description: record?.description ?? '',
    email: record?.email ?? '',
    scope: record?.scope ?? 'global',
    scopeRef: record?.scopeRef ?? '',
    ssid: record?.ssid ?? DEFAULT_SSID,
    vlanId: record?.vlanId != null ? String(record.vlanId) : '',
    role: record?.role ?? '',
    usage: record?.usage ?? 'multi',
    maxDevices: record?.maxDevices != null ? String(record.maxDevices) : '',
    passphrase: '',
    notify: record?.notify ?? false,
  };
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-3 mt-1 border-b border-border pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
    {children}
  </div>
);
const InheritNote = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-1 text-xs italic text-muted-foreground">{children}</p>
);
const OptionalTag = () => <span className="ml-1.5 text-xs font-normal text-muted-foreground">Optional</span>;

export function PrivateSaeEditor({
  open,
  onOpenChange,
  record,
  saving,
  ssidOptions,
  roleOptions,
  onSave,
}: PrivateSaeEditorProps) {
  const isEdit = Boolean(record);
  const [form, setForm] = useState<Form>(() => fromRecord(record));
  const [reveal, setReveal] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // The SSID list always includes the default so a fresh install can create a
  // credential before any SAE WLAN has been discovered.
  const ssidChoices = useMemo(
    () => Array.from(new Set([DEFAULT_SSID, ...ssidOptions].filter(Boolean))).sort(),
    [ssidOptions]
  );

  const errors = useMemo(() => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!form.name.trim()) e.name = 'Key name is required';
    if (!form.ssid) e.ssid = 'Select an SSID';
    const p = form.passphrase;
    if (!isEdit && !p) e.passphrase = 'Passphrase is required';
    else if (p && (p.length < MIN_PASSPHRASE || p.length > MAX_PASSPHRASE))
      e.passphrase = `Passphrase must be ${MIN_PASSPHRASE}–${MAX_PASSPHRASE} characters`;
    else if (p && p.includes('|')) e.passphrase = "Passphrase must not contain '|'";
    if (form.vlanId && (!/^\d+$/.test(form.vlanId) || +form.vlanId < 1 || +form.vlanId > 4094))
      e.vlanId = 'VLAN must be 1–4094';
    if (form.maxDevices && (!/^\d+$/.test(form.maxDevices) || +form.maxDevices < 1))
      e.maxDevices = 'Max devices must be a positive number';
    if (form.scope !== 'global' && !form.scopeRef.trim()) e.scopeRef = 'Name the Site or Site Group';
    return e;
  }, [form, isEdit]);
  const valid = Object.keys(errors).length === 0;

  const generate = async () => {
    try {
      set('passphrase', await privateSaeService.generate(24));
      setReveal(true);
      toast.success('Generated a secure SAE passphrase');
    } catch {
      toast.error('Could not generate a passphrase');
    }
  };
  const revealCurrent = async () => {
    if (!record) return;
    try {
      const { passphrase } = await privateSaeService.reveal(record.id);
      set('passphrase', passphrase);
      setReveal(true);
    } catch {
      toast.error('Could not reveal the passphrase');
    }
  };

  const submit = async () => {
    const payload: SaeInput = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      email: form.email.trim() || null,
      scope: form.scope,
      scopeRef: form.scope === 'global' ? null : form.scopeRef.trim() || null,
      ssid: form.ssid,
      vlanId: form.vlanId ? Number(form.vlanId) : null,
      role: form.role.trim() || null,
      usage: form.usage,
      maxDevices: form.maxDevices ? Number(form.maxDevices) : null,
      notify: form.notify,
    };
    if (form.passphrase) payload.passphrase = form.passphrase;
    await onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{isEdit ? `Edit ${record?.keyid}` : 'Add Private SAE Key'}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-4">
          {/* KEY IDENTITY */}
          <section>
            <SectionTitle>Key Identity</SectionTitle>
            <div className="space-y-3">
              <div>
                <Label htmlFor="s-name">Key Name</Label>
                <Input id="s-name" className="mt-1" value={form.name} placeholder="New SAE Key"
                  onChange={(e) => set('name', e.target.value)} />
                {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
              </div>
              <div>
                <Label htmlFor="s-desc">Key Description<OptionalTag /></Label>
                <Input id="s-desc" className="mt-1" value={form.description} placeholder="What this key is for"
                  onChange={(e) => set('description', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="s-email">Owner Email<OptionalTag /></Label>
                <Input id="s-email" className="mt-1" type="email" value={form.email} placeholder="owner@example.com"
                  onChange={(e) => set('email', e.target.value)} />
              </div>
            </div>
          </section>

          {/* SCOPE */}
          <section>
            <SectionTitle>Scope</SectionTitle>
            <Label className="mb-2 block">Availability</Label>
            <RadioGroup value={form.scope} onValueChange={(v) => set('scope', v as SaeScope)} className="gap-2">
              {([
                ['global', 'Global — available across the entire organization'],
                ['site', 'Bind to specific Sites'],
                ['site-group', 'Bind to specific Site Groups'],
              ] as const).map(([val, label]) => (
                <div key={val} className="flex items-center gap-2">
                  <RadioGroupItem value={val} id={`sae-scope-${val}`} />
                  <Label htmlFor={`sae-scope-${val}`} className="cursor-pointer font-normal">{label}</Label>
                </div>
              ))}
            </RadioGroup>
            {form.scope === 'global' ? (
              <InheritNote>Global keys apply organization-wide — no site or site-group target is required.</InheritNote>
            ) : (
              <div className="mt-2">
                <Input value={form.scopeRef} placeholder={form.scope === 'site' ? 'Site name(s)' : 'Site Group name(s)'}
                  onChange={(e) => set('scopeRef', e.target.value)} />
                {errors.scopeRef && <p className="mt-1 text-xs text-destructive">{errors.scopeRef}</p>}
              </div>
            )}
          </section>

          {/* NETWORK */}
          <section>
            <SectionTitle>Network</SectionTitle>
            <div className="space-y-3">
              <div>
                <Label htmlFor="s-ssid">SSID (WLAN scope)</Label>
                <Select value={form.ssid} onValueChange={(v) => set('ssid', v)}>
                  <SelectTrigger id="s-ssid" className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {ssidChoices.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <InheritNote>WPA3-Personal (SAE) WLAN. Defaults to {DEFAULT_SSID}.</InheritNote>
                {errors.ssid && <p className="mt-1 text-xs text-destructive">{errors.ssid}</p>}
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label htmlFor="s-vlan">VLAN ID<OptionalTag /></Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input id="s-vlan" className="max-w-[140px]" value={form.vlanId} placeholder="(1 - 4094)"
                      onChange={(e) => set('vlanId', e.target.value)} />
                  </div>
                  {errors.vlanId ? <p className="mt-1 text-xs text-destructive">{errors.vlanId}</p>
                    : !form.vlanId && <InheritNote>No VLAN set — defaults to the WLAN (SSID) configuration.</InheritNote>}
                </div>
                <div className="flex-1">
                  <Label htmlFor="s-role">Role<OptionalTag /></Label>
                  <Select value={form.role || '__none'} onValueChange={(v) => set('role', v === '__none' ? '' : v)}>
                    <SelectTrigger id="s-role" className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None — WLAN default</SelectItem>
                      {roleOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!form.role && <InheritNote>Defaults to the WLAN (SSID) configuration.</InheritNote>}
                </div>
              </div>
            </div>
          </section>

          {/* USAGE */}
          <section>
            <SectionTitle>Usage</SectionTitle>
            <RadioGroup value={form.usage} onValueChange={(v) => set('usage', v as SaeUsage)} className="gap-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="multi" id="sae-use-multi" />
                <Label htmlFor="sae-use-multi" className="cursor-pointer font-normal">Multiple users</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="single" id="sae-use-single" />
                <Label htmlFor="sae-use-single" className="cursor-pointer font-normal">Single user</Label>
              </div>
            </RadioGroup>
            <div className="mt-3">
              <Label htmlFor="s-maxdev">Max devices<OptionalTag /></Label>
              <Input id="s-maxdev" className="mt-1 max-w-[140px]" value={form.maxDevices} placeholder="Unlimited"
                onChange={(e) => set('maxDevices', e.target.value)} />
              {errors.maxDevices ? <p className="mt-1 text-xs text-destructive">{errors.maxDevices}</p>
                : <InheritNote>Caps how many device MACs may enroll onto this key. Blank = unlimited.</InheritNote>}
            </div>
          </section>

          {/* CREDENTIAL */}
          <section>
            <SectionTitle>Credential</SectionTitle>
            <div className="mb-1 flex items-center justify-between">
              <Label htmlFor="s-pass">Passphrase</Label>
              <div className="flex items-center gap-4 text-xs font-semibold text-primary">
                {isEdit && (
                  <button type="button" className="hover:underline" onClick={() => void revealCurrent()}>Reveal current</button>
                )}
                <button type="button" className="hover:underline" onClick={() => void generate()}>Generate random</button>
              </div>
            </div>
            <div className="relative">
              <Input id="s-pass" type={reveal ? 'text' : 'password'} className="pr-10" autoComplete="off"
                value={form.passphrase} placeholder={isEdit ? '••••••• (unchanged)' : ''}
                onChange={(e) => set('passphrase', e.target.value)} />
              <button type="button" onClick={() => setReveal((r) => !r)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-label={reveal ? 'Hide' : 'Reveal'}>
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.passphrase ? <p className="mt-1 text-xs text-destructive">{errors.passphrase}</p>
              : <InheritNote>WPA3-SAE password, {MIN_PASSPHRASE}–{MAX_PASSPHRASE} characters.</InheritNote>}
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={form.notify} onCheckedChange={(v) => set('notify', v === true)} />
              Notify owner by email
            </label>
          </section>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void submit()} disabled={!valid || saving}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
