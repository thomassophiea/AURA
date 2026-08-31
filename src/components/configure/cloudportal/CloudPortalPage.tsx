/**
 * Configure → Cloud Captive Portal.
 *
 * Operator overlay on the OS-ONE-CWP portal's own configuration: employee
 * sponsorship policy (allowed domains, optional sponsor allowlist, approval
 * window, per-session limit) and which guest details the consent form
 * collects. The portal stores and validates everything; this page shows the
 * stored overrides beside the *effective* values, because "what did I set"
 * and "what is actually running" are different questions when the service
 * environment provides the fallbacks.
 *
 * Email transport is deliberately read-only here — it names credentials, and
 * credentials stay on the service environment.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert';
import { Badge } from '../../ui/badge';
import { Section } from '../_kit/Section';
import { SettingsShell } from '../system/SettingsShell';
import { NumberField, SelectField, SwitchField, TextField } from '../system/systemFields';
import {
  getPortalConfig,
  updatePortalConfig,
  PortalConfigError,
  type PortalConfigUpdate,
  type PortalConfigView,
} from '../../../services/portalConfigService';

type FieldMode = 'off' | 'optional' | 'required';

interface FormState {
  sponsorshipEnabled: boolean;
  /** Comma-separated; blank = use the service environment's domains. */
  domainsText: string;
  /** Comma-separated; blank = any mailbox at an allowed domain. */
  addressesText: string;
  ttlSeconds: number | '';
  maxPerSession: number | '';
  fieldModes: Record<string, FieldMode>;
}

const FIELD_LABELS: Record<string, string> = {
  fullName: 'Full name',
  email: 'Email address',
  phone: 'Phone number',
  company: 'Company',
  roomNumber: 'Room number',
};

const FIELD_MODE_OPTIONS = [
  { id: 'off', label: 'Not collected' },
  { id: 'optional', label: 'Optional' },
  { id: 'required', label: 'Required' },
] as const;

function splitList(text: string): string[] {
  return text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function formFromView(view: PortalConfigView): FormState {
  const managed = view.stored.guestFieldsEnabled !== null;
  const enabled = new Set(
    managed ? view.stored.guestFieldsEnabled! : view.effective.guestFields.map((f) => f.id)
  );
  const required = new Set(
    managed
      ? (view.stored.guestFieldsRequired ?? [])
      : view.effective.guestFields.filter((f) => f.required).map((f) => f.id)
  );
  const fieldModes: Record<string, FieldMode> = {};
  for (const field of view.fieldCatalogue) {
    fieldModes[field.id] = required.has(field.id)
      ? 'required'
      : enabled.has(field.id)
        ? 'optional'
        : 'off';
  }
  return {
    sponsorshipEnabled: view.stored.sponsorshipEnabled ?? true,
    domainsText: view.stored.sponsorAllowedDomains?.join(', ') ?? '',
    addressesText: view.stored.sponsorAllowedAddresses?.join(', ') ?? '',
    ttlSeconds: view.stored.sponsorshipTtlSeconds ?? '',
    maxPerSession: view.stored.sponsorshipMaxPerSession ?? '',
    fieldModes,
  };
}

function updateFromForm(form: FormState): PortalConfigUpdate {
  const domains = splitList(form.domainsText);
  const addresses = splitList(form.addressesText);
  const enabled: string[] = [];
  const required: string[] = [];
  for (const [id, mode] of Object.entries(form.fieldModes)) {
    if (mode !== 'off') enabled.push(id);
    if (mode === 'required') required.push(id);
  }
  return {
    sponsorshipEnabled: form.sponsorshipEnabled,
    sponsorAllowedDomains: domains.length > 0 ? domains : null,
    sponsorAllowedAddresses: addresses.length > 0 ? addresses : null,
    sponsorshipTtlSeconds: form.ttlSeconds === '' ? null : form.ttlSeconds,
    sponsorshipMaxPerSession: form.maxPerSession === '' ? null : form.maxPerSession,
    guestFieldsEnabled: enabled,
    guestFieldsRequired: required,
  };
}

export function CloudPortalPage() {
  const [view, setView] = useState<PortalConfigView | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<PortalConfigError | null>(null);
  const initial = useRef('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const adopt = useCallback((next: PortalConfigView) => {
    const nextForm = formFromView(next);
    setView(next);
    setForm(nextForm);
    initial.current = JSON.stringify(nextForm);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getPortalConfig();
      if (mountedRef.current) adopt(data);
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof PortalConfigError) {
        setLoadError(err);
      } else {
        setLoadError(new PortalConfigError(0, 'Portal configuration could not be loaded'));
      }
      setView(null);
      setForm(null);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [adopt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dirty = form !== null && JSON.stringify(form) !== initial.current;

  const save = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      const next = await updatePortalConfig(updateFromForm(form));
      if (mountedRef.current) adopt(next);
      toast.success('Saved Cloud Captive Portal configuration');
    } catch (err) {
      const description =
        err instanceof PortalConfigError
          ? [err.message, ...(err.details ?? [])].join(' — ')
          : 'Unexpected error';
      toast.error('Failed to save Cloud Captive Portal configuration', { description });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [form, adopt]);

  const patch = useCallback((partial: Partial<FormState>) => {
    setForm((current) => (current ? { ...current, ...partial } : current));
  }, []);

  const effectiveSummary = useMemo(() => {
    if (!view) return null;
    const s = view.effective.sponsorship;
    return {
      enabled: s.enabled,
      domains: s.domains.join(', ') || '—',
      ttlMinutes: Math.round(s.ttlSeconds / 60),
      maxPerSession: s.maxPerSession,
      transport: view.effective.emailTransport,
    };
  }, [view]);

  if (loadError?.isNotConfigured) {
    return (
      <Alert>
        <AlertTitle>Cloud Captive Portal is not connected</AlertTitle>
        <AlertDescription>
          Set <code>CWP_INTERNAL_API_URL</code> and <code>CWP_INTERNAL_API_TOKEN</code> on the AURA
          service so it can reach the captive portal&apos;s internal API. Guest access itself is
          unaffected — the portal keeps running on its own configuration.
        </AlertDescription>
      </Alert>
    );
  }
  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>
          {loadError.isPortalUnavailable
            ? 'Captive portal service unavailable'
            : 'Portal configuration could not be loaded'}
        </AlertTitle>
        <AlertDescription>
          {loadError.detail ?? loadError.message}{' '}
          <button className="underline" onClick={() => void refresh()}>
            Retry
          </button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsShell
        title="Cloud Captive Portal"
        description="Employee sponsorship policy and guest details for the captive web portal. Values left blank fall back to the portal service's own defaults."
        loading={loading}
        saving={saving}
        dirty={dirty}
        ready={!loading && form !== null}
        onRefresh={() => void refresh()}
        onSave={() => void save()}
      >
        {form && view && effectiveSummary && (
          <>
            <Section
              title="Employee sponsorship"
              description="A guest names an employee sponsor; the sponsor approves or denies from their inbox. Approval releases the same network authorization as the standard guest flow."
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Currently</span>
                <Badge variant={effectiveSummary.enabled ? 'default' : 'secondary'}>
                  {effectiveSummary.enabled ? 'Offered to guests' : 'Not offered'}
                </Badge>
                <span className="text-muted-foreground">
                  Email transport: {effectiveSummary.transport ?? 'none configured'}
                </span>
              </div>
              {effectiveSummary.transport === null && (
                <Alert variant="warning">
                  <AlertDescription>
                    The portal has no email transport, so sponsorship cannot be offered regardless
                    of the switch below. Transports are configured on the portal service environment
                    (Resend API key or SMTP relay).
                  </AlertDescription>
                </Alert>
              )}
              <SwitchField
                label="Offer employee sponsorship"
                checked={form.sponsorshipEnabled}
                onChange={(checked) => patch({ sponsorshipEnabled: checked })}
                description="Turning this off hides the option on the consent form. It never affects guests already online."
              />
              <TextField
                label="Allowed sponsor domains"
                value={form.domainsText}
                onChange={(value) => patch({ domainsText: value })}
                placeholder={
                  view.envDefaults.sponsorAllowedDomains.join(', ') || 'extremenetworks.com'
                }
                description={`Comma-separated, exact match. Blank uses the service default (currently: ${effectiveSummary.domains}).`}
              />
              <TextField
                label="Allowed sponsors (optional)"
                value={form.addressesText}
                onChange={(value) => patch({ addressesText: value })}
                placeholder="person@extremenetworks.com, other@extremenetworks.com"
                description="Exact addresses that may sponsor. Blank means anyone at an allowed domain."
              />
              <NumberField
                label="Approval window (seconds)"
                value={form.ttlSeconds}
                onChange={(value) => patch({ ttlSeconds: value })}
                min={60}
                max={86400}
                description={`How long a sponsor has to decide. Blank uses the portal default (currently ${effectiveSummary.ttlMinutes} minutes).`}
              />
              <NumberField
                label="Requests per guest session"
                value={form.maxPerSession}
                onChange={(value) => patch({ maxPerSession: value })}
                min={1}
                max={10}
                description={`Abuse cap. Blank uses the portal default (currently ${effectiveSummary.maxPerSession}).`}
              />
            </Section>

            <Section
              title="Guest details"
              description="What the consent form asks a guest for. Name and email are always required on the sponsorship path so the sponsor knows who is asking; the portal's storage prohibition applies to every personal value."
            >
              {view.fieldCatalogue.map((field) => (
                <SelectField
                  key={field.id}
                  label={FIELD_LABELS[field.id] ?? field.id}
                  value={form.fieldModes[field.id] ?? 'off'}
                  onChange={(value) =>
                    patch({ fieldModes: { ...form.fieldModes, [field.id]: value as FieldMode } })
                  }
                  options={FIELD_MODE_OPTIONS}
                />
              ))}
            </Section>

            {view.stored.updatedAt && (
              <p className="text-xs text-muted-foreground">
                Last saved {new Date(view.stored.updatedAt).toLocaleString()}
                {view.stored.updatedBy ? ` by ${view.stored.updatedBy}` : ''}.
              </p>
            )}
          </>
        )}
      </SettingsShell>
    </div>
  );
}
