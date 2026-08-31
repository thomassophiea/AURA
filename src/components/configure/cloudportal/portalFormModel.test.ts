import { describe, expect, it } from 'vitest';
import type { PortalConfigView } from '../../../services/portalConfigService';
import {
  changedSettings,
  contrastAgainstWhite,
  formFromView,
  isAcceptableBrandColor,
  selectedAccessPolicy,
  updateFromForm,
  validationIssues,
} from './portalFormModel';

function makeView(overrides: Partial<PortalConfigView> = {}): PortalConfigView {
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
      guestFields: [{ id: 'fullName', required: false }],
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
    ...overrides,
  };
}

describe('formFromView', () => {
  it('defaults the secure-access switch to on, mirroring the portal null', () => {
    expect(formFromView(makeView()).secureAccessEnabled).toBe(true);
  });

  it('respects a stored secure-access override', () => {
    const view = makeView();
    view.stored.secureAccessEnabled = false;
    expect(formFromView(view).secureAccessEnabled).toBe(false);
  });

  it('tolerates a portal that predates the switch (field absent)', () => {
    const view = makeView();
    delete view.stored.secureAccessEnabled;
    expect(formFromView(view).secureAccessEnabled).toBe(true);
  });

  it('derives field modes from effective fields when unmanaged', () => {
    const form = formFromView(makeView());
    expect(form.fieldModes).toEqual({ fullName: 'optional', email: 'off' });
  });
});

describe('updateFromForm', () => {
  it('round-trips a draft including the secure-access switch', () => {
    const form = formFromView(makeView());
    form.secureAccessEnabled = false;
    form.fieldModes = { fullName: 'required', email: 'optional' };
    const update = updateFromForm(form);
    expect(update.secureAccessEnabled).toBe(false);
    expect(update.guestFieldsEnabled).toEqual(['fullName', 'email']);
    expect(update.guestFieldsRequired).toEqual(['fullName']);
  });

  it('sends null for blank lists so the portal falls back to its environment', () => {
    const update = updateFromForm(formFromView(makeView()));
    expect(update.sponsorAllowedDomains).toBeNull();
    expect(update.sponsorAllowedAddresses).toBeNull();
    expect(update.sponsorshipTtlSeconds).toBeNull();
  });
});

describe('validationIssues', () => {
  it('is empty for a clean default draft', () => {
    const view = makeView();
    expect(validationIssues(formFromView(view), view)).toEqual([]);
  });

  it('flags malformed domains and addresses as errors', () => {
    const view = makeView();
    const form = formFromView(view);
    form.domainsText = 'extremenetworks.com, not a domain';
    form.addressesText = 'nobody';
    const issues = validationIssues(form, view);
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(2);
  });

  it('warns when sponsorship is on without an email transport', () => {
    const view = makeView();
    view.effective.emailTransport = null;
    const issues = validationIssues(formFromView(view), view);
    expect(issues).toEqual([
      expect.objectContaining({ severity: 'warning', text: expect.stringContaining('email') }),
    ]);
  });

  it('warns when secure access is on but unconfigured or unreadable', () => {
    const unconfigured = makeView();
    unconfigured.effective.secureAccess = {
      configured: false,
      enabled: false,
      network: null,
      credentialSource: 'shared-passphrase',
    };
    expect(validationIssues(formFromView(unconfigured), unconfigured)).toEqual([
      expect.objectContaining({
        severity: 'warning',
        text: expect.stringContaining('secure WLAN'),
      }),
    ]);

    const unreadable = makeView();
    unreadable.effective.secureAccess!.network = null;
    expect(validationIssues(formFromView(unreadable), unreadable)).toEqual([
      expect.objectContaining({ severity: 'warning', text: expect.stringContaining('gateway') }),
    ]);
  });

  it('range-checks the sponsorship numbers', () => {
    const view = makeView();
    const form = formFromView(view);
    form.ttlSeconds = 30;
    form.maxPerSession = 11;
    expect(validationIssues(form, view).filter((i) => i.severity === 'error')).toHaveLength(2);
  });
});

describe('changedSettings', () => {
  it('names exactly what the draft changes', () => {
    const view = makeView();
    const initial = formFromView(view);
    const form = { ...initial, fieldModes: { ...initial.fieldModes } };
    expect(changedSettings(form, initial)).toEqual([]);
    form.secureAccessEnabled = false;
    form.fieldModes.email = 'optional';
    expect(changedSettings(form, initial)).toEqual(['Secure access offer', 'Guest details']);
  });
});

describe('acceptance policy — the design fast-path choice', () => {
  it('round-trips: stored value in, explicit value out, blank stays null', () => {
    const view = makeView();
    view.stored.accessPolicy = 'sponsored';
    const form = formFromView(view);
    expect(form.accessPolicy).toBe('sponsored');
    expect(updateFromForm(form).accessPolicy).toBe('sponsored');
    form.accessPolicy = '';
    expect(updateFromForm(form).accessPolicy).toBeNull();
  });

  it('ignores an unrecognised stored value', () => {
    const view = makeView();
    view.stored.accessPolicy = 'passphrase';
    expect(formFromView(view).accessPolicy).toBe('');
  });

  it('selects: explicit draft > portal effective > derivation from fields', () => {
    const view = makeView();
    view.effective.accessPolicy = 'terms';
    const form = formFromView(view);
    expect(selectedAccessPolicy(form, view)).toBe('terms');
    form.accessPolicy = 'open';
    expect(selectedAccessPolicy(form, view)).toBe('open');
    delete view.effective.accessPolicy;
    form.accessPolicy = '';
    // fullName is collected in the fixture, so the derivation says form.
    expect(selectedAccessPolicy(form, view)).toBe('form');
    form.fieldModes = { fullName: 'off', email: 'off' };
    expect(selectedAccessPolicy(form, view)).toBe('terms');
  });

  it('warns that sponsored falls back to terms without a transport', () => {
    const view = makeView();
    view.effective.emailTransport = null;
    const form = formFromView(view);
    form.accessPolicy = 'sponsored';
    const texts = validationIssues(form, view).map((i) => i.text);
    expect(texts.some((t) => t.includes('fall back to terms'))).toBe(true);
  });

  it('warns that open access hides sponsorship and secure access', () => {
    const view = makeView();
    const form = formFromView(view);
    form.accessPolicy = 'open';
    const texts = validationIssues(form, view).map((i) => i.text);
    expect(texts.some((t) => t.includes('draws no page'))).toBe(true);
    expect(texts.some((t) => t.includes('not collected under this access method'))).toBe(true);
  });

  it('warns when form is selected with no fields enabled', () => {
    const view = makeView();
    const form = formFromView(view);
    form.accessPolicy = 'form';
    form.fieldModes = { fullName: 'off', email: 'off' };
    const texts = validationIssues(form, view).map((i) => i.text);
    expect(texts.some((t) => t.includes('renders like Terms'))).toBe(true);
  });

  it('names the change for the save summary', () => {
    const view = makeView();
    const initial = formFromView(view);
    const form = {
      ...initial,
      fieldModes: { ...initial.fieldModes },
      accessPolicy: 'open' as const,
    };
    expect(changedSettings(form, initial)).toEqual(['Access method']);
  });
});

describe('look, language and legal round-trips', () => {
  it('maps stored values into the draft and back', () => {
    const view = makeView();
    view.stored.displayName = 'Conference Guest Portal';
    view.stored.brandColor = '#4b449b';
    view.stored.brandFooterEnabled = true;
    view.stored.localesEnabled = ['en', 'de'];
    view.stored.privacyPolicyEnabled = true;
    const form = formFromView(view);
    expect(form.displayName).toBe('Conference Guest Portal');
    expect(form.brandColor).toBe('#4b449b');
    expect(form.brandFooter).toBe('powered');
    expect(form.localeSubset).toEqual(['en', 'de']);
    expect(form.privacyPolicyEnabled).toBe(true);
    const update = updateFromForm(form);
    expect(update.brandColor).toBe('#4b449b');
    expect(update.brandFooterEnabled).toBe(true);
    expect(update.localesEnabled).toEqual(['en', 'de']);
    expect(update.privacyPolicyEnabled).toBe(true);
  });

  it('blank drafts clear to null so the portal falls back to its defaults', () => {
    const update = updateFromForm(formFromView(makeView()));
    expect(update.displayName).toBeNull();
    expect(update.brandColor).toBeNull();
    expect(update.brandFooterEnabled).toBeNull();
    expect(update.localesEnabled).toBeNull();
    expect(update.termsText).toBeNull();
    expect(update.privacyPolicyEnabled).toBeNull();
    expect(update.marketingEnabled).toBeNull();
  });

  it('mirrors the portal contrast rule and blocks a failing colour', () => {
    expect(isAcceptableBrandColor('#4b449b')).toBe(true);
    expect(isAcceptableBrandColor('#f9c56f')).toBe(false);
    expect(contrastAgainstWhite('#000000')).toBeCloseTo(21, 0);
    const view = makeView();
    const form = formFromView(view);
    form.brandColor = '#f9c56f';
    const errors = validationIssues(form, view).filter((i) => i.severity === 'error');
    expect(errors.some((i) => i.text.includes('fails contrast'))).toBe(true);
  });

  it('open access names the hidden legal ticks too', () => {
    const view = makeView();
    const form = formFromView(view);
    form.accessPolicy = 'open';
    form.privacyPolicyEnabled = true;
    form.marketingEnabled = true;
    const text = validationIssues(form, view)
      .map((i) => i.text)
      .join(' ');
    expect(text).toContain('privacy-terms tick');
    expect(text).toContain('marketing tick');
  });

  it('names each change for the save summary', () => {
    const view = makeView();
    const initial = formFromView(view);
    const form = { ...initial, fieldModes: { ...initial.fieldModes } };
    form.brandColor = '#4b449b';
    form.localeSubset = ['en'];
    form.termsText = 'Custom terms.';
    expect(changedSettings(form, initial)).toEqual([
      'Primary colour',
      'Languages',
      'Terms of service',
    ]);
  });
});
