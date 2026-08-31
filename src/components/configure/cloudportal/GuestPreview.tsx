/**
 * Live guest preview: the consent page the captive portal actually serves,
 * rendered from the portal's own message catalogue and the operator's draft.
 * Change a field mode and it reorders; switch off sponsorship and the block
 * disappears; pick Deutsch and it renders German — the same behaviours the
 * guest page has.
 *
 * The frame deliberately keeps the guest portal's own light palette rather
 * than AURA's theme: the guest page is not an AURA surface, and a preview
 * that recolours it would be showing something that never ships.
 */
import { useMemo, useState } from 'react';
import { Lock, Smartphone } from 'lucide-react';
import { Alert, AlertDescription } from '../../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import {
  previewFieldCopy,
  type PortalConfigView,
  type PortalPreviewMessages,
} from '../../../services/portalConfigService';
import { splitList, type FormState } from './portalFormModel';

/** Substitute `{name}` placeholders the way the portal's i18n layer does. */
function format(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? `{${key}}`);
}

interface GuestPreviewProps {
  view: PortalConfigView;
  form: FormState;
}

export function GuestPreview({ view, form }: GuestPreviewProps) {
  const preview = view.preview;
  const [locale, setLocale] = useState(preview?.defaultLocale ?? 'en');

  const messages: PortalPreviewMessages | null = useMemo(() => {
    if (!preview) return null;
    return preview.messages[locale] ?? preview.messages[preview.defaultLocale] ?? null;
  }, [preview, locale]);

  if (!preview || !messages) {
    return (
      <Alert>
        <AlertDescription>
          The guest preview needs the updated portal service, which publishes its own page copy.
          Configuration still saves normally.
        </AlertDescription>
      </Alert>
    );
  }

  const enabledFields = view.fieldCatalogue.filter(
    (f) => (form.fieldModes[f.id] ?? 'off') !== 'off'
  );
  const secure = view.effective.secureAccess;
  const showSecure = form.secureAccessEnabled && secure?.configured && secure.network !== null;
  const showSponsorship = form.sponsorshipEnabled && view.effective.emailTransport !== null;
  const sponsorDomain =
    splitList(form.domainsText)[0] ??
    view.effective.sponsorship.domains[0] ??
    view.envDefaults.sponsorAllowedDomains[0] ??
    'example.com';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5" />
          Guest preview
        </span>
        <Select value={locale} onValueChange={setLocale}>
          <SelectTrigger className="h-7 w-[140px] text-xs" aria-label="Preview language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {preview.locales.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.nativeName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[24px] border-4 border-slate-800 bg-white shadow-lg">
        <div className="max-h-[560px] overflow-y-auto p-4 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {messages.common.portalName}
          </p>
          <h4 className="mt-1 text-base font-bold text-slate-900">{messages.consent.title}</h4>
          <p className="mt-0.5 text-xs text-slate-500">{messages.consent.subtitle}</p>

          {enabledFields.length > 0 && (
            <fieldset className="mt-4 rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold text-slate-900">
                {messages.fields.heading}
              </legend>
              <p className="mb-2 text-[10px] text-slate-500">{messages.fields.subheading}</p>
              <div className="flex flex-col gap-2">
                {enabledFields.map((field) => {
                  const copy = previewFieldCopy(messages, field.id);
                  const required = form.fieldModes[field.id] === 'required';
                  return (
                    <div key={field.id} className="flex flex-col gap-0.5">
                      <span className="flex items-baseline gap-1.5 text-[11px] font-medium text-slate-700">
                        <span>{copy?.label ?? field.id}</span>
                        <span className="text-[10px] font-normal text-slate-400">
                          {required ? messages.common.required : messages.common.optional}
                        </span>
                      </span>
                      <div className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-300">
                        {copy?.placeholder ?? ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          )}

          <p className="mt-4 text-[10px] leading-relaxed text-slate-500">
            {messages.consent.terms}
          </p>

          <div className="mt-3 flex items-start gap-2">
            <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border border-slate-300" />
            <span className="text-xs text-slate-700">{messages.consent.agree}</span>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border border-slate-300" />
              <span className="text-xs font-medium text-slate-900">
                {messages.privacy.checkbox}
              </span>
            </div>
            <p className="mt-1.5 pl-5 text-[10px] leading-relaxed text-slate-600">
              {messages.privacy.explainer}
            </p>
          </div>

          <div className="mt-3 w-full rounded-xl bg-slate-200 py-2.5 text-center text-xs font-semibold text-slate-400">
            {messages.consent.submitOpen}
          </div>
          <p className="mt-1.5 text-center text-[10px] text-slate-400">
            {messages.consent.tickToContinue}
          </p>

          {showSecure && secure?.network && (
            <>
              <div className="my-4 flex items-center gap-2" aria-hidden="true">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-[10px] uppercase tracking-wide text-slate-400">
                  {messages.consent.or}
                </span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h5 className="text-xs font-semibold text-slate-900">
                  {messages.secureOffer.title}
                </h5>
                <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">
                  {messages.secureOffer.body}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-slate-900">
                  <Lock className="h-3 w-3 text-slate-500" />
                  <span>{secure.network.ssid}</span>
                  <span className="text-[10px] font-normal text-slate-500">
                    {messages.security?.[secure.network.security] ?? secure.network.securityLabel}
                  </span>
                </p>
                <div className="mt-2 w-full rounded-xl border border-slate-300 py-2 text-center text-xs font-semibold text-slate-700">
                  {messages.secureOffer.submit}
                </div>
                <p className="mt-1 text-center text-[10px] text-slate-400">
                  {messages.secureOffer.note}
                </p>
              </section>
            </>
          )}

          {showSponsorship && (
            <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h5 className="text-xs font-semibold text-slate-900">
                {messages.sponsorship.offerTitle}
              </h5>
              <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">
                {messages.sponsorship.offerBody}
              </p>
              <p className="mt-2 text-[11px] font-medium text-slate-700">
                {messages.sponsorship.sponsorEmailLabel}
              </p>
              <div className="mt-0.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-300">
                {format(messages.sponsorship.sponsorEmailPlaceholder, { domain: sponsorDomain })}
              </div>
              <p className="mt-1.5 text-[10px] text-slate-500">
                {messages.sponsorship.identityNote}
              </p>
              <div className="mt-2 w-full rounded-xl border border-slate-300 py-2 text-center text-xs font-semibold text-slate-700">
                {messages.sponsorship.submit}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
