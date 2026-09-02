/**
 * Experience group: the look of the guest page (primary colour, alignment,
 * footer) and the languages offered to guests. Both drive the live preview.
 * Logo and background-image upload need an asset store the portal does not
 * have yet, so the page says so instead of drawing dead drop zones.
 */
import { Check } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { cn } from '../../ui/utils';
import { Section } from '../_kit/Section';
import { SelectField } from '../system/systemFields';
import {
  BRAND_SWATCHES,
  contrastAgainstWhite,
  isAcceptableBrandColor,
  type FormState,
} from './portalFormModel';
import type { EditorSectionProps } from './editorSections';

// Radix Select refuses an empty-string item value, so the default carries a
// sentinel and is mapped back to '' (no override) on change.
const ALIGNMENT_DEFAULT = 'default';
const ALIGNMENT_OPTIONS = [
  { id: ALIGNMENT_DEFAULT, label: 'Centred (default)' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
] as const;

const FOOTER_OPTIONS = [
  { id: 'default', label: 'Portal name (default)' },
  { id: 'powered', label: '“Powered by Extreme Platform ONE”' },
  { id: 'none', label: 'No footer line' },
] as const;

export function BrandingSection({ view, form, patch }: EditorSectionProps) {
  const supported = view.effective.branding !== undefined;
  const effectiveColor = form.brandColor || view.effective.branding?.color || '#2563eb';
  const customValid = form.brandColor === '' || isAcceptableBrandColor(form.brandColor);
  return (
    <Section
      title="Look"
      description="What a guest actually notices. Everything here shows up in the preview as you set it. Every swatch clears 4.5:1 against white, and the portal re-checks contrast on save."
    >
      {!supported && (
        <p className="text-sm text-muted-foreground">
          This portal service predates the branding surface; update the OS-ONE-CWP deployment to
          manage the look from here.
        </p>
      )}
      <div className="space-y-1.5">
        <span className="text-sm">Primary colour</span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => patch({ brandColor: '' })}
            className={cn(
              'rounded-md border px-2.5 py-1.5 text-xs transition-colors',
              form.brandColor === '' ? 'border-primary font-medium' : 'border-border'
            )}
            disabled={!supported}
          >
            Portal default
          </button>
          {BRAND_SWATCHES.map((swatch) => (
            <button
              key={swatch.hex}
              type="button"
              onClick={() => patch({ brandColor: swatch.hex })}
              disabled={!supported}
              aria-label={`${swatch.label} ${swatch.hex}`}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors',
                form.brandColor === swatch.hex ? 'border-primary font-medium' : 'border-border'
              )}
            >
              <span
                className="inline-flex h-4 w-4 items-center justify-center rounded"
                style={{ backgroundColor: swatch.hex }}
              >
                {form.brandColor === swatch.hex && <Check className="h-3 w-3 text-white" />}
              </span>
              {swatch.label}
            </button>
          ))}
          <Input
            value={form.brandColor}
            onChange={(e) => patch({ brandColor: e.target.value.trim() })}
            placeholder={view.envDefaults.brandColor ?? '#2563eb'}
            disabled={!supported}
            aria-label="Custom brand colour (hex)"
            className={cn('w-28 font-mono text-xs', !customValid && 'border-destructive')}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {form.brandColor === ''
            ? `Using the portal default (${effectiveColor}).`
            : customValid
              ? `White text on ${form.brandColor} measures ${contrastAgainstWhite(form.brandColor).toFixed(2)}:1.`
              : 'Enter a #rrggbb colour whose white text clears 4.5:1.'}
        </p>
      </div>
      <SelectField
        label="Alignment"
        value={form.brandAlignment === '' ? ALIGNMENT_DEFAULT : form.brandAlignment}
        onChange={(value) =>
          patch({
            brandAlignment:
              value === ALIGNMENT_DEFAULT ? '' : (value as FormState['brandAlignment']),
          })
        }
        options={ALIGNMENT_OPTIONS}
        disabled={!supported}
        description="Header alignment on the guest card."
      />
      <SelectField
        label="Footer"
        value={form.brandFooter}
        onChange={(value) => patch({ brandFooter: value as FormState['brandFooter'] })}
        options={FOOTER_OPTIONS}
        disabled={!supported}
        description="The one line under the page, on every guest screen."
      />
      <p className="text-xs text-muted-foreground">
        Logo and background-image upload need an asset store the portal does not have yet — the
        guest page renders its shipped layout until then.
      </p>
    </Section>
  );
}

/**
 * Accessibility is a guarantee the portal makes, not a setting — there is no
 * switch here because there is nothing to turn on or off. Shipped 2026-09-02
 * (WCAG 2.1 AA), triggered by a field-team report from SUNY Potsdam: a
 * visually impaired student could not self-register for guest Wi-Fi with a
 * screen reader. Worth surfacing here rather than only in the portal's own
 * docs — it is a real answer to a public-sector procurement question ("does
 * your captive portal have an ACR / VPAT position"), and this is the page an
 * SE pulls up mid-call.
 */
export function AccessibilitySection() {
  return (
    <Section
      title="Accessibility"
      description="Every guest page meets WCAG 2.1 AA out of the box. Nothing below is a toggle — there is no setting because it is never off."
    >
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Screen readers get the right language.</span>{' '}
          <code className="text-xs">&lt;html lang&gt;</code> and the page title follow the guest&apos;s
          resolved locale on every page, not a hardcoded default.
        </li>
        <li>
          <span className="font-medium text-foreground">A session that&apos;s about to expire says so.</span>{' '}
          Consent, the sponsor wait screen, and secure setup all warn at the two-minute mark with a
          keyboard-operable way to extend, instead of silently dropping the guest.
        </li>
        <li>
          <span className="font-medium text-foreground">State changes are announced.</span> Sponsor
          approval and denial are read out to a screen reader the moment they happen — not only shown
          visually.
        </li>
        <li>
          <span className="font-medium text-foreground">Contrast is measured, not eyeballed.</span> The
          4.5:1 check on the brand colour above is the same check the portal itself re-runs on save.
        </li>
        <li>
          <span className="font-medium text-foreground">It stays that way.</span> A WCAG 2.x automated
          scan runs in the portal&apos;s CI on every change and fails the build on a real violation.
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">
        Independent third-party audit and a portal-specific VPAT/ACR are not done yet — that is a
        procurement step, not a code change.
      </p>
    </Section>
  );
}

export function LanguagesSection({ view, form, patch }: EditorSectionProps) {
  const catalogue = view.preview?.locales ?? [];
  const supported = view.effective.enabledLocales !== undefined && catalogue.length > 0;
  const enabled = (code: string) =>
    form.localeSubset.length === 0 || form.localeSubset.includes(code);
  const toggle = (code: string) => {
    const current =
      form.localeSubset.length === 0 ? catalogue.map((l) => l.code) : [...form.localeSubset];
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    if (next.length === 0) return; // at least one locale is always offered
    // Storing the full set is the same as storing none — keep the override minimal.
    patch({ localeSubset: next.length === catalogue.length ? [] : next });
  };
  const defaultCode = enabled('en') ? 'en' : (catalogue.find((l) => enabled(l.code))?.code ?? 'en');
  return (
    <Section
      title="Languages"
      description="Which of the shipped locales guests are offered. Every string is translated, not machine-filled; the guest's browser picks, and the default catches the rest."
    >
      {supported ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {catalogue.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => toggle(l.code)}
                aria-pressed={enabled(l.code)}
                className="rounded-md"
              >
                <Badge variant={enabled(l.code) ? 'default' : 'outline'}>
                  {l.nativeName}
                  {l.code === defaultCode && enabled(l.code) && ' · default'}
                </Badge>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A guest&apos;s language is their own selection first, then the browser&apos;s
            Accept-Language, then the default — never geolocation. Turning a locale off hides it
            from the picker and the resolution; at least one is always offered.
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
