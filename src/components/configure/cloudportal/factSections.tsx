/**
 * The read-only sections of the Cloud Captive Portal editor: languages,
 * legal & privacy posture, and session lifetimes. These render portal truth
 * rather than settings — each fact names where the real control lives, so
 * the page never suggests a switch that does not exist.
 */
import { Badge } from '../../ui/badge';
import { Section } from '../_kit/Section';
import type { PortalConfigView } from '../../../services/portalConfigService';

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 text-sm">
      <span className="w-44 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function LanguagesSection({ view }: { view: PortalConfigView }) {
  const preview = view.preview;
  return (
    <Section
      title="Languages"
      description="Every guest page ships fully translated. A missing translation is a build error on the portal, not a string that silently renders in English — so completeness is guaranteed, not audited."
    >
      {preview ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {preview.locales.map((l) => (
              <Badge
                key={l.code}
                variant={l.code === preview.defaultLocale ? 'default' : 'outline'}
              >
                {l.nativeName}
                {l.code === preview.defaultLocale && ' · default'}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A guest&apos;s language is their own selection first (kept in a cookie for the visit),
            then the browser&apos;s Accept-Language, then {preview.defaultLocale.toUpperCase()}.
            Never geolocation. SSIDs, security modes and OS menu names stay untranslated because the
            guest has to find them on their own screen.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          The language catalogue is published by the updated portal service.
        </p>
      )}
    </Section>
  );
}

export function LegalPrivacySection({ view }: { view: PortalConfigView }) {
  const session = view.effective.session;
  return (
    <div className="space-y-6">
      <Section
        title="Legal & privacy"
        description="The portal's privacy posture is enforced in its storage layer, not by this page — these are the guarantees the consent form makes."
      >
        <FactRow label="Terms of use">
          Shown in full on the consent page, in the guest&apos;s language, behind a
          deliberate-action gate the guest&apos;s operating system cannot satisfy on their behalf.
        </FactRow>
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
