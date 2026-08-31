/**
 * The editable sections of the Cloud Captive Portal editor: employee
 * sponsorship, secure guest access, and the guest details form. Each renders
 * the stored draft beside the *effective* state, because "what did I set"
 * and "what is actually running" are different questions when the service
 * environment provides the fallbacks.
 */
import { Alert, AlertDescription } from '../../ui/alert';
import { Badge } from '../../ui/badge';
import { Section } from '../_kit/Section';
import { NumberField, SelectField, SwitchField, TextField } from '../system/systemFields';
import type { PortalConfigView } from '../../../services/portalConfigService';
import {
  CREDENTIAL_SOURCE_LABELS,
  FIELD_LABELS,
  FIELD_MODE_OPTIONS,
  type FieldMode,
  type FormState,
} from './portalFormModel';

export interface EditorSectionProps {
  view: PortalConfigView;
  form: FormState;
  patch: (partial: Partial<FormState>) => void;
}

export function SponsorshipSection({ view, form, patch }: EditorSectionProps) {
  const s = view.effective.sponsorship;
  const transport = view.effective.emailTransport;
  return (
    <Section
      title="Employee sponsorship"
      description="A guest names an employee sponsor; the sponsor approves or denies from their inbox. Approval releases the same network authorization as the standard guest flow."
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Currently</span>
        <Badge variant={s.enabled ? 'default' : 'secondary'}>
          {s.enabled ? 'Offered to guests' : 'Not offered'}
        </Badge>
        <span className="text-muted-foreground">
          Email transport: {transport ?? 'none configured'}
        </span>
      </div>
      {transport === null && (
        <Alert variant="warning">
          <AlertDescription>
            The portal has no email transport, so sponsorship cannot be offered regardless of the
            switch below. Transports are configured on the portal service environment (Resend API
            key or SMTP relay).
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
        placeholder={view.envDefaults.sponsorAllowedDomains.join(', ') || 'extremenetworks.com'}
        description={`Comma-separated, exact match. Blank uses the service default (currently: ${
          s.domains.join(', ') || '—'
        }).`}
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
        description={`How long a sponsor has to decide. Blank uses the portal default (currently ${Math.round(
          s.ttlSeconds / 60
        )} minutes).`}
      />
      <NumberField
        label="Requests per guest session"
        value={form.maxPerSession}
        onChange={(value) => patch({ maxPerSession: value })}
        min={1}
        max={10}
        description={`Abuse cap. Blank uses the portal default (currently ${s.maxPerSession}).`}
      />
    </Section>
  );
}

export function SecureAccessSection({ view, form, patch }: EditorSectionProps) {
  const secure = view.effective.secureAccess;
  if (!secure) {
    return (
      <Section
        title="Secure guest access"
        description="Optional second workflow on the consent form: the guest gets online first, then sets this device up on the encrypted Wi-Fi network."
      >
        <Alert>
          <AlertDescription>
            This portal service predates the secure-access configuration surface. Update the
            OS-ONE-CWP deployment to manage the offer from here.
          </AlertDescription>
        </Alert>
      </Section>
    );
  }
  const methods: string[] = [];
  if (secure.network?.appleProfile) methods.push('Apple configuration profile');
  if (secure.network?.qr) methods.push('Wi-Fi QR code (for another device)');
  methods.push('Manual setup (SSID and passphrase revealed on tap)');
  return (
    <Section
      title="Secure guest access"
      description="Optional second workflow on the consent form: the guest gets online first, then sets this device up on the encrypted Wi-Fi network. Setup is never a prerequisite for getting online."
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Currently</span>
        <Badge variant={secure.enabled && secure.network ? 'default' : 'secondary'}>
          {!secure.configured
            ? 'Not configured'
            : !secure.enabled
              ? 'Not offered'
              : secure.network
                ? 'Offered to guests'
                : 'Suppressed — gateway unreadable'}
        </Badge>
      </div>
      {!secure.configured && (
        <Alert>
          <AlertDescription>
            No secure WLAN is configured on the portal service (SECURE_WLAN_SSID /
            SECURE_WLAN_SERVICE_ID), so the offer cannot appear regardless of the switch below.
          </AlertDescription>
        </Alert>
      )}
      <SwitchField
        label="Offer secure guest access"
        checked={form.secureAccessEnabled}
        onChange={(checked) => patch({ secureAccessEnabled: checked })}
        description="Turning this off hides the second workflow on the consent form and stops new secure setups. Devices already on the secure network are unaffected."
      />
      {secure.network && (
        <div className="space-y-1.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Destination network</span>
            <span className="font-medium">{secure.network.ssid}</span>
            <Badge variant="outline">{secure.network.securityLabel}</Badge>
            {secure.network.hidden && <Badge variant="outline">Hidden SSID</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Credential source</span>
            <span className="font-medium">
              {CREDENTIAL_SOURCE_LABELS[secure.credentialSource] ?? secure.credentialSource}
            </span>
            <span className="text-xs text-muted-foreground">
              read live from the gateway, never stored by the portal
            </span>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <span className="text-muted-foreground">Provisioning methods</span>
            <span>{methods.join(' · ')}</span>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        The destination network and credential source are read from the gateway&apos;s live WLAN
        configuration — rotate the key or change the security mode there and the portal follows.
        Per-device keys (PPSK) arrive as a new credential source, not a new page.
      </p>
    </Section>
  );
}

export function GuestFieldsSection({ view, form, patch }: EditorSectionProps) {
  return (
    <Section
      title="Guest details"
      description="What the consent form asks a guest for. Name and email are always required on the sponsorship path so the sponsor knows who is asking; the portal's storage prohibition applies to every personal value."
    >
      {view.fieldCatalogue.map((field) => (
        <div key={field.id} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <SelectField
              label={
                <span className="flex items-center gap-2">
                  {FIELD_LABELS[field.id] ?? field.id}
                  {field.personal && (
                    <Badge variant="outline" className="text-[10px]">
                      Personal data
                    </Badge>
                  )}
                </span>
              }
              value={form.fieldModes[field.id] ?? 'off'}
              onChange={(value) =>
                patch({ fieldModes: { ...form.fieldModes, [field.id]: value as FieldMode } })
              }
              options={FIELD_MODE_OPTIONS}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Fields marked personal are covered by the storage prohibition: when a guest ticks &ldquo;Do
        not store my personal data&rdquo;, nothing they typed is written down.
      </p>
    </Section>
  );
}
