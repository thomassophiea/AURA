/**
 * AP Adoption page.
 *
 * DIVERGENCE FROM THE GOLDEN REFERENCE — READ FIRST.
 * The golden EDS reference (aps-parity.md gap #1, feature-inventory §12) models
 * adoption as an ORDERED RULE LIST (Action · Site · Device Group · IP · CIDR ·
 * Host Name · Model · Serial, reorderable) backed by a speculative
 * /v1/adoption-rules family. That endpoint family 404s on this controller. The
 * LIVE reality — captured at api/aps-registration.json and typed as
 * ApRegistrationSettings — is a SINGLE registration-settings object at
 * GET/PUT /v1/aps/registration (ruOperationMode, dnsRetries, dnsDelay,
 * sshPassword, sshPasswordExpiry). Per the port brief we FOLLOW THE LIVE OBJECT:
 * this page is an editable form over that singleton, not a rule list. Saving
 * mutates controller-wide adoption behaviour and is therefore gated behind an
 * explicit Save + confirmation.
 *
 * sshPassword is write-only — the controller redacts it on read. The field is
 * left blank on load; it is only included in the PUT when the operator types a
 * new value, so an unedited save never clobbers the stored secret.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Radio, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Skeleton } from '../../ui/skeleton';
import { FieldRow, Section, MaskedInput, ConfirmDialog } from '../_kit';
import { ApSelect, NumberField } from '../aps/controls';
import { adoptionService } from '../../../services/configure';
import { getUserFriendlyMessage } from '../../../services/errorHandler';
import type { ApRegistrationSettings } from '../../../types/configure';

/** Documented ruOperationMode values; unknown values round-trip as raw. */
const OPERATION_MODES: Record<number, string> = {
  0: 'Allow all APs to register',
  1: 'Manual approval required',
};

export function AdoptionPage() {
  const [settings, setSettings] = useState<ApRegistrationSettings | null>(null);
  const [form, setForm] = useState<ApRegistrationSettings | null>(null);
  const [pwd, setPwd] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adoptionService.get();
      if (!mounted.current) return;
      setSettings(data);
      setForm(structuredClone(data));
      setPwd('');
      setDirty(false);
    } catch (err) {
      toast.error('Failed to load adoption settings', { description: getUserFriendlyMessage(err) });
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upd = <K extends keyof ApRegistrationSettings>(key: K, value: ApRegistrationSettings[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  };

  const save = async () => {
    if (!form) return;
    setConfirmOpen(false);
    setSaving(true);
    // Only send a new secret when the operator actually typed one.
    const payload: ApRegistrationSettings = {
      ...form,
      sshPassword: pwd.trim() ? pwd : (settings?.sshPassword ?? ''),
    };
    try {
      const saved = await adoptionService.update(payload);
      toast.success('Adoption settings updated');
      if (mounted.current) {
        setSettings(saved ?? payload);
        setForm(structuredClone(saved ?? payload));
        setPwd('');
        setDirty(false);
      }
    } catch (err) {
      toast.error('Failed to save adoption settings', { description: getUserFriendlyMessage(err) });
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const modeOptions = () => {
    const opts = Object.entries(OPERATION_MODES).map(([id, label]) => ({ id, label }));
    const cur = form?.ruOperationMode;
    if (cur != null && !(cur in OPERATION_MODES)) {
      opts.push({ id: String(cur), label: `Mode ${cur}` });
    }
    return opts;
  };

  const expiry =
    settings?.sshPasswordExpiry == null || settings.sshPasswordExpiry === ''
      ? 'No expiry set'
      : String(settings.sshPasswordExpiry);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Radio className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-medium">AP Adoption</h1>
            <p className="text-sm text-muted-foreground">
              Controller-wide AP registration settings (/v1/aps/registration)
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || saving}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Registration Settings</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !form ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              <Section title="Registration">
                <FieldRow
                  label="Registration Security Mode"
                  description="Controls whether discovered APs register automatically or require approval."
                >
                  <ApSelect
                    className="w-72"
                    value={String(form.ruOperationMode)}
                    options={modeOptions()}
                    onChange={(v) => upd('ruOperationMode', Number(v))}
                  />
                </FieldRow>
                <FieldRow label="DNS Retries" description="Registration DNS lookup retry count.">
                  <NumberField value={form.dnsRetries} min={0} max={100} onChange={(v) => upd('dnsRetries', v === '' ? 0 : v)} />
                </FieldRow>
                <FieldRow label="DNS Delay [s]" description="Delay between DNS registration retries.">
                  <NumberField value={form.dnsDelay} min={0} max={600} onChange={(v) => upd('dnsDelay', v === '' ? 0 : v)} />
                </FieldRow>
              </Section>

              <Section title="AP SSH Credentials">
                <FieldRow
                  label="SSH Password"
                  description="Write-only — the controller redacts it on read. Leave blank to keep the current password."
                >
                  <MaskedInput
                    className="w-72"
                    value={pwd}
                    placeholder="Unchanged"
                    onChange={(v) => {
                      setPwd(v);
                      setDirty(true);
                    }}
                  />
                </FieldRow>
                <FieldRow label="SSH Password Expiry">
                  <span className="text-sm text-muted-foreground">{expiry}</span>
                </FieldRow>
              </Section>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="outline" onClick={() => void load()} disabled={!dirty || saving}>
                  Discard
                </Button>
                <Button onClick={() => setConfirmOpen(true)} disabled={!dirty || saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Update controller-wide adoption settings?"
        description="These settings govern how every AP registers with this controller. Changes take effect immediately for all future adoptions."
        confirmLabel="Save"
        onConfirm={save}
      />
    </div>
  );
}

export default AdoptionPage;
