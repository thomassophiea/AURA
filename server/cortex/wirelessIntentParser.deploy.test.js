import { describe, it, expect } from 'vitest';
import { parseWirelessIntent } from './wirelessIntentParser.js';

describe('deploy_wlan', () => {
  it('reads "deploy Skynet to PrimarySite" as a site deployment', () => {
    const p = parseWirelessIntent('deploy Skynet to PrimarySite');
    expect(p.intent.action).toBe('deploy_wlan');
    expect(p.intent.wlanName).toBe('Skynet');
    expect(p.intent.siteName).toBe('PrimarySite');
  });

  it('handles "roll out ... across"', () => {
    const p = parseWirelessIntent('roll out Skynet across EAL-PT-N');
    expect(p.intent.action).toBe('deploy_wlan');
    expect(p.intent.wlanName).toBe('Skynet');
    expect(p.intent.siteName).toBe('EAL-PT-N');
  });

  it('handles "push X to every AP at Y"', () => {
    const p = parseWirelessIntent('push Skynet to every AP at PrimarySite');
    expect(p.intent.action).toBe('deploy_wlan');
    expect(p.intent.wlanName).toBe('Skynet');
    expect(p.intent.siteName).toBe('PrimarySite');
  });

  it('keeps a site name that contains hyphens intact', () => {
    const p = parseWirelessIntent('deploy Skynet to EAL-PT-S');
    expect(p.intent.siteName).toBe('EAL-PT-S');
  });

  it('beats the generic assign path, which has no site concept', () => {
    // "deploy ... to ..." also matches ASSIGN_VERBS; the site reading is the
    // one that can be planned, previewed and verified.
    const p = parseWirelessIntent('deploy Skynet to PrimarySite');
    expect(p.intent.action).not.toBe('assign_wlan');
  });

  it('is mutating, never read-only', () => {
    expect(parseWirelessIntent('deploy Skynet to PrimarySite').classification).toBe('mutating');
  });

  it('does not fire without a site', () => {
    const p = parseWirelessIntent('deploy Skynet');
    expect(p.intent.action).not.toBe('deploy_wlan');
  });

  it('does not mistake a question about deployment for an instruction', () => {
    const p = parseWirelessIntent('where is Skynet deployed?');
    expect(p.intent.action).not.toBe('deploy_wlan');
  });

  it('does not swallow a creation', () => {
    const p = parseWirelessIntent('create a guest wifi called Lobby with wpa2 psk hunter2000');
    expect(p.intent.action).toBe('create_wlan');
  });
});
