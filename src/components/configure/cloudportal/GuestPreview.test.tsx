import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type {
  PortalConfigView,
  PortalPreviewMessages,
} from '../../../services/portalConfigService';
import { formFromView } from './portalFormModel';
import { GuestPreview } from './GuestPreview';

function messagesFor(lang: 'en' | 'de'): PortalPreviewMessages {
  const de = lang === 'de';
  return {
    common: {
      portalName: 'OS-ONE-CWP',
      optional: de ? 'optional' : 'optional',
      required: de ? 'erforderlich' : 'required',
    },
    consent: {
      title: de ? 'Gast-WLAN-Zugang' : 'Guest Wi-Fi Access',
      subtitle: de ? 'Nutzungsbedingungen prüfen.' : 'Review and accept the terms.',
      terms: de ? 'Bedingungen…' : 'Terms…',
      agree: de ? 'Ich stimme zu.' : 'I agree.',
      submitOpen: de ? 'Mit dem Internet verbinden' : 'Connect to the Internet',
      tickToContinue: de ? 'Kästchen ankreuzen.' : 'Tick the box above to continue.',
      or: de ? 'oder' : 'or',
    },
    privacy: {
      checkbox: de ? 'Meine Daten nicht speichern' : 'Do not store my personal data',
      explainer: de ? 'Erklärung…' : 'Explainer…',
    },
    fields: {
      heading: de ? 'Ihre Angaben' : 'Your details',
      subheading: de ? 'Für den Zugang.' : 'These are used to give you access.',
      fullName: { label: de ? 'Vollständiger Name' : 'Full name', placeholder: 'Alex Morgan' },
      email: { label: de ? 'E-Mail-Adresse' : 'Email address', placeholder: 'you@example.com' },
    },
    secureOffer: {
      title: de ? 'Sicherer Gastzugang' : 'Secure Guest Access',
      body: de ? 'Sicheres WLAN…' : 'Set up this device on our encrypted network.',
      submit: de ? 'Sicher verbinden' : 'Accept & Connect Securely',
      note: de ? 'Hinweis…' : "You'll get internet access first.",
    },
    sponsorship: {
      offerTitle: de ? 'Mitarbeiter-Sponsoring' : 'Employee Sponsorship',
      offerBody: de ? 'Zu Besuch?' : 'Visiting someone?',
      sponsorEmailLabel: de ? 'E-Mail des Sponsors' : "Sponsor's work email",
      sponsorEmailPlaceholder: 'name@{domain}',
      identityNote: de ? 'Name und E-Mail erforderlich.' : 'Your name and email are required.',
      submit: de ? 'Zugang anfragen' : 'Request Sponsored Access',
    },
    security: { 'wpa2-psk': de ? 'WPA2 Personal' : 'WPA2 Personal' },
  };
}

function makeView(): PortalConfigView {
  return {
    stored: {
      sponsorshipEnabled: null,
      sponsorAllowedDomains: null,
      sponsorAllowedAddresses: null,
      sponsorshipTtlSeconds: null,
      sponsorshipMaxPerSession: null,
      guestFieldsEnabled: null,
      guestFieldsRequired: null,
      secureAccessEnabled: null,
      accessPolicy: null,
      updatedBy: null,
      updatedAt: null,
    },
    effective: {
      sponsorship: {
        enabled: true,
        domains: ['extremenetworks.com'],
        addresses: [],
        ttlSeconds: 1800,
        maxPerSession: 3,
      },
      emailTransport: 'resend',
      guestFields: [
        { id: 'fullName', required: true },
        { id: 'email', required: false },
      ],
      secureAccess: {
        configured: true,
        enabled: true,
        network: {
          ssid: 'Skynet',
          security: 'wpa2-psk',
          securityLabel: 'WPA2 Personal',
          hidden: false,
          qr: true,
          appleProfile: true,
        },
        credentialSource: 'shared-passphrase',
      },
      session: { portalSessionTtlSeconds: 900, approvalUrlTtlSeconds: 60 },
    },
    fieldCatalogue: [
      { id: 'fullName', personal: true },
      { id: 'email', personal: true },
    ],
    envDefaults: { sponsorAllowedDomains: ['extremenetworks.com'] },
    preview: {
      locales: [
        { code: 'en', nativeName: 'English' },
        { code: 'de', nativeName: 'Deutsch' },
      ],
      defaultLocale: 'en',
      messages: { en: messagesFor('en'), de: messagesFor('de') },
    },
  };
}

describe('GuestPreview', () => {
  it("renders the portal's own copy with the draft's fields and offers", () => {
    const view = makeView();
    render(<GuestPreview view={view} form={formFromView(view)} />);
    expect(screen.getByText('Guest Wi-Fi Access')).toBeInTheDocument();
    expect(screen.getByText('Full name')).toBeInTheDocument();
    // fullName is effectively required, email optional.
    expect(screen.getByText('required')).toBeInTheDocument();
    expect(screen.getByText('optional')).toBeInTheDocument();
    expect(screen.getByText('Secure Guest Access')).toBeInTheDocument();
    expect(screen.getByText('Skynet')).toBeInTheDocument();
    expect(screen.getByText('Employee Sponsorship')).toBeInTheDocument();
    expect(screen.getByText('name@extremenetworks.com')).toBeInTheDocument();
  });

  it('drops blocks the draft switches off', () => {
    const view = makeView();
    const form = formFromView(view);
    form.secureAccessEnabled = false;
    form.sponsorshipEnabled = false;
    form.fieldModes = { fullName: 'off', email: 'off' };
    render(<GuestPreview view={view} form={form} />);
    expect(screen.queryByText('Secure Guest Access')).not.toBeInTheDocument();
    expect(screen.queryByText('Employee Sponsorship')).not.toBeInTheDocument();
    expect(screen.queryByText('Your details')).not.toBeInTheDocument();
    // The storage prohibition is always on the page, collected fields or not.
    expect(screen.getByText('Do not store my personal data')).toBeInTheDocument();
  });

  it('hides sponsorship when the portal has no email transport, whatever the switch says', () => {
    const view = makeView();
    view.effective.emailTransport = null;
    render(<GuestPreview view={view} form={formFromView(view)} />);
    expect(screen.queryByText('Employee Sponsorship')).not.toBeInTheDocument();
  });

  it('renders the acceptance policy the guest experiences', () => {
    // Open: no page at all.
    const openView = makeView();
    const openForm = formFromView(openView);
    openForm.accessPolicy = 'open';
    const { unmount } = render(<GuestPreview view={openView} form={openForm} />);
    expect(screen.getByText('No portal page is drawn')).toBeInTheDocument();
    expect(screen.queryByText('Guest Wi-Fi Access')).not.toBeInTheDocument();
    unmount();

    // Terms: page drawn, fields not collected, prohibition still present.
    const termsView = makeView();
    const termsForm = formFromView(termsView);
    termsForm.accessPolicy = 'terms';
    termsForm.sponsorshipEnabled = false; // otherwise sponsor-identity fields widen the form
    const second = render(<GuestPreview view={termsView} form={termsForm} />);
    expect(screen.queryByText('Your details')).not.toBeInTheDocument();
    expect(screen.getByText('Do not store my personal data')).toBeInTheDocument();
    expect(screen.getByText('Connect to the Internet')).toBeInTheDocument();
    second.unmount();

    // Sponsored: the request is the only way on; secure and connect are gone.
    const sponsoredView = makeView();
    const sponsoredForm = formFromView(sponsoredView);
    sponsoredForm.accessPolicy = 'sponsored';
    render(<GuestPreview view={sponsoredView} form={sponsoredForm} />);
    expect(screen.queryByText('Connect to the Internet')).not.toBeInTheDocument();
    expect(screen.queryByText('Secure Guest Access')).not.toBeInTheDocument();
    expect(screen.getByText('Request Sponsored Access')).toBeInTheDocument();
    // The portal widens the sponsored form with the identity fields, optional.
    expect(screen.getByText('Full name')).toBeInTheDocument();
    expect(screen.queryByText('required')).not.toBeInTheDocument();
  });

  it('explains itself when the portal predates the preview catalogue', () => {
    const view = makeView();
    delete view.preview;
    render(<GuestPreview view={view} form={formFromView(view)} />);
    expect(screen.getByText(/needs the updated portal service/)).toBeInTheDocument();
  });
});
