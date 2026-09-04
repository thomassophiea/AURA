import { describe, it, expect } from 'vitest';
import { parseWirelessIntent } from './wirelessIntentParser.js';

describe('parseWirelessIntent — classification', () => {
  it('classifies a create request as mutating', () => {
    const r = parseWirelessIntent('Create a guest wlan');
    expect(r.classification).toBe('mutating');
    expect(r.intent.action).toBe('create_wlan');
  });

  it('classifies a question as read_only', () => {
    const r = parseWirelessIntent('What WLANs are configured at Boston Office?');
    expect(r.classification).toBe('read_only');
    expect(r.intent.action).toBe('validate_only');
  });

  it('defaults ambiguous phrasing to read_only (never silently mutates)', () => {
    const r = parseWirelessIntent('the guest network');
    expect(r.classification).toBe('read_only');
  });
});

describe('parseWirelessIntent — create_wlan slot fill', () => {
  it('extracts a quoted WLAN name, VLAN, site and WPA2 security with password', () => {
    const r = parseWirelessIntent(
      'Add a WLAN "Guest" on VLAN 40 at Boston Office using WPA2 with password guestwifi1'
    );
    expect(r.intent.action).toBe('create_wlan');
    expect(r.intent.wlanName).toBe('Guest');
    expect(r.intent.vlanId).toBe(40);
    expect(r.intent.siteName).toBe('Boston Office');
    expect(r.intent.security.mode).toBe('wpa2_personal');
    expect(r.missingFields).toEqual([]);
  });

  it('flags missing site as a required field rather than inferring Global', () => {
    const r = parseWirelessIntent('Create a WLAN "Guest" with WPA2 password guestwifi1');
    expect(r.missingFields).toContain('siteId');
  });

  it('flags missing security mode rather than guessing', () => {
    const r = parseWirelessIntent('Create a WLAN "Guest" at Boston Office');
    expect(r.missingFields).toContain('security.mode');
  });

  it('flags missing credential when a personal security mode is given with no password', () => {
    const r = parseWirelessIntent('Create a WPA3 WLAN "Guest" at Boston Office');
    expect(r.missingFields).toContain('security.credentialReference');
  });

  it('never returns a plaintext password on the intent object', () => {
    const r = parseWirelessIntent('Create a WLAN "Guest" at Boston Office WPA2 password hunter22');
    expect(JSON.stringify(r.intent)).not.toContain('hunter22');
    expect(r._ephemeralPassword).toBe('hunter22');
  });

  it('recognizes Open security with no password required', () => {
    const r = parseWirelessIntent('Create an Open WLAN "Lobby" at Boston Office');
    expect(r.intent.security.mode).toBe('open');
    expect(r.missingFields).not.toContain('security.credentialReference');
  });

  it('recognizes recognized-but-unimplemented actions honestly', () => {
    const r = parseWirelessIntent('Delete the Guest wlan at Boston Office');
    expect(r.intent.action).toBe('delete_wlan');
    expect(r.classification).toBe('mutating');
    expect(r.ambiguities.some((a) => a.includes('not yet implemented'))).toBe(true);
  });
});
