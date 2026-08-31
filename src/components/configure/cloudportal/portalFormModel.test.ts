import { describe, expect, it } from 'vitest';
import type { PortalConfigView } from '../../../services/portalConfigService';
import { changedSettings, formFromView, updateFromForm, validationIssues } from './portalFormModel';

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
