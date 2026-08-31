/**
 * Legal & privacy: the editable legal documents (terms override, privacy
 * terms, marketing consent) and the read-only truths — the storage
 * prohibition, session lifetimes, and the portal's Captive Portal API
 * (RFC 8908 / RFC 8910) posture. Facts name where the real control lives,
 * so the page never suggests a switch that does not exist.
 */
import { Badge } from '../../ui/badge';
import { Section } from '../_kit/Section';
import { SwitchField } from '../system/systemFields';
import type { PortalConfigView } from '../../../services/portalConfigService';
import { TextAreaField, type EditorSectionProps } from './editorSections';

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 text-sm">
      <span className="w-44 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

export function LegalDocumentsSection({ view, form, patch }: EditorSectionProps) {
  const supported = view.effective.legal !== undefined;
  const defaultTerms = view.preview?.messages[view.preview.defaultLocale]?.consent.terms;
  return (
    <Section
      title="Legal and privacy"
      description="Nothing here needs a URL. Every document ships with working text — paste over it, or leave it blank to keep the shipped default."
    >
      {!supported && (
        <p className="text-sm text-muted-foreground">
          This portal service predates the legal-documents surface; update the OS-ONE-CWP deployment
          to manage them from here.
        </p>
      )}
      <TextAreaField
        label="Terms of Service"
        value={form.termsText}
        onChange={(value) => patch({ termsText: value })}
        placeholder={defaultTerms ?? 'Shipped default terms render when this is blank.'}
        description="Always required on the consent page. Blank keeps the shipped, fully-translated default; an override is single-language and renders as plain text."
        disabled={!supported}
      />
      <SwitchField
        label="Require acceptance of the Privacy Terms"
        checked={form.privacyPolicyEnabled}
        onChange={(checked) => patch({ privacyPolicyEnabled: checked })}
        description="Adds a second required tick on the guest page, enforced by the portal server like the first one."
        disabled={!supported}
      />
      {form.privacyPolicyEnabled && (
        <TextAreaField
          label="Privacy Terms"
          value={form.privacyPolicyText}
          onChange={(value) => patch({ privacyPolicyText: value })}
          placeholder={view.envDefaults.privacyPolicyText ?? ''}
          description="Blank keeps the shipped default text."
          disabled={!supported}
        />
      )}
      <SwitchField
        label="Ask for marketing consent, and show the policy"
        checked={form.marketingEnabled}
        onChange={(checked) => patch({ marketingEnabled: checked })}
        description="An optional tick. Access to the network is never conditional on it, and the guest's answer is recorded as a consent flag, not personal data."
        disabled={!supported}
      />
      {form.marketingEnabled && (
        <TextAreaField
          label="Marketing policy"
          value={form.marketingText}
          onChange={(value) => patch({ marketingText: value })}
          placeholder={view.envDefaults.marketingText ?? ''}
          description="Blank keeps the shipped default text."
          disabled={!supported}
        />
      )}
    </Section>
  );
}

export function LegalPrivacySection({ view }: { view: PortalConfigView }) {
  const session = view.effective.session;
  const capport = view.effective.capport;
  return (
    <div className="space-y-6">
      <Section
        title="Enforced by the portal"
        description="The portal's privacy posture lives in its storage layer, not on this page — these are the guarantees the consent form makes."
      >
        <FactRow label="Storage prohibition">
          &ldquo;Do not store my personal data&rdquo; is always offered — whether or not any details
          are collected — and is honoured by never building the write, not by deleting afterwards.
        </FactRow>
        <FactRow label="Operational data">
          Device identifier (MAC), access point and timestamps are always kept: they are how the
          network functions, and the prohibition covers what the guest typed about themselves.
        </FactRow>
        <FactRow label="Credentials">
          Secure-network credential material is read from the gateway at issue time and never
          appears in the portal&apos;s database, page HTML, URLs or logs.
        </FactRow>
      </Section>

      <Section
        title="Captive Portal API"
        description="The IETF standard that lets the network tell a device it is captive, instead of the device probing and inferring."
      >
        <FactRow label="RFC 8908 (the API)">
          {capport ? (
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant={capport.tokenConfigured ? 'default' : 'secondary'}>
                {capport.tokenConfigured ? 'Served' : 'Served — token not configured'}
              </Badge>
              <span>
                <code className="text-xs">{capport.apiPath}</code> answers in{' '}
                <code className="text-xs">application/captive+json</code>; an unidentified client is
                told it is captive, and a guest mid&ndash;secure-setup is not.
              </span>
            </span>
          ) : (
            'Reported by the updated portal service.'
          )}
        </FactRow>
        <FactRow label="RFC 8910 (discovery)">
          The network&apos;s half: DHCP option 114 or an IPv6 RA hands the device the API URL. The
          Campus Controller cannot emit option 114 today, so the API stays dormant until the network
          advertises it — nothing on the portal side is waiting on code.
        </FactRow>
        <FactRow label="What it buys">
          The device&apos;s operating system opens its sign-in sheet deliberately and closes it the
          moment this portal authorizes the session, instead of probing a website and guessing.
        </FactRow>
      </Section>

      <Section
        title="Session & authorization"
        description="Lifetimes come from the portal service environment; network-side timeouts (session timeout, idle timeouts) belong to the WLAN on the gateway."
      >
        {session ? (
          <>
            <FactRow label="Portal session window">
              {Math.round(session.portalSessionTtlSeconds / 60)} minutes for a guest to complete the
              consent flow before the session expires.
            </FactRow>
            <FactRow label="Approval URL lifetime">
              {session.approvalUrlTtlSeconds} seconds — the signed authorization URL is minted per
              guest and expires quickly by design.
            </FactRow>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Session lifetimes are published by the updated portal service.
          </p>
        )}
        <FactRow label="Audit trail">
          Every session transition and every configuration change on this page is recorded in the
          portal&apos;s audit log, with the operator&apos;s name on the change.
        </FactRow>
      </Section>
    </div>
  );
}
