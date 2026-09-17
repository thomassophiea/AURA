import { describe, it, expect } from 'vitest';
import { parseWirelessIntent } from './wirelessIntentParser.js';

describe('modify_wlan', () => {
  it('reads "enable 11k on Skynet" as a modification, not a creation', () => {
    const p = parseWirelessIntent('enable 802.11k on Skynet');
    expect(p.intent.action).toBe('modify_wlan');
    expect(p.intent.wlanName).toBe('Skynet');
    expect(p.intent.changeId).toBe('wlan.11k');
    expect(p.intent.desired).toBe(true);
  });

  it('reads "disable" as the off direction', () => {
    const p = parseWirelessIntent('disable client to client on Skynet');
    expect(p.intent.action).toBe('modify_wlan');
    expect(p.intent.changeId).toBe('wlan.clientToClient');
    expect(p.intent.desired).toBe(false);
  });

  it('takes the LAST "on <name>", so a phrasal verb is not read as the WLAN', () => {
    // "turn on mbo on Skynet" — the first "on" belongs to the verb.
    const p = parseWirelessIntent('turn on mbo on Skynet');
    expect(p.intent.wlanName).toBe('Skynet');
    expect(p.intent.changeId).toBe('wlan.mbo');
    expect(p.intent.desired).toBe(true);
  });

  it('beats the generic update_wlan path for a catalogued change', () => {
    // "hide ... ssid" also matches UPDATE_VERBS. The catalogued change wins,
    // because it is the one that can be previewed and verified.
    const p = parseWirelessIntent('hide the ssid on Skynet');
    expect(p.intent.action).toBe('modify_wlan');
    expect(p.intent.changeId).toBe('wlan.suppressSsid');
    expect(p.intent.desired).toBe(true);
  });

  it('reads unhide as the off direction of the same field', () => {
    const p = parseWirelessIntent('unhide the ssid on Skynet');
    expect(p.intent.changeId).toBe('wlan.suppressSsid');
    expect(p.intent.desired).toBe(false);
  });

  it('handles a numeric setting', () => {
    const p = parseWirelessIntent('set the pre-auth idle timeout on Skynet to 600');
    expect(p.intent.action).toBe('modify_wlan');
    expect(p.intent.changeId).toBe('wlan.idleTimeout.preAuth');
    expect(p.intent.desired).toBe(600);
    expect(p.intent.wlanName).toBe('Skynet');
  });

  it('does not mistake a creation for a modification', () => {
    const p = parseWirelessIntent('create a guest wifi called Lobby with wpa2 psk hunter2000');
    expect(p.intent.action).toBe('create_wlan');
  });

  it('leaves an uncatalogued setting alone rather than inventing a change', () => {
    // 802.11r is not in the catalogue and not on this platform. Approximating
    // it to the nearest thing Cortex CAN change would be worse than declining.
    const p = parseWirelessIntent('enable fast transition on Skynet');
    expect(p.intent.action).not.toBe('modify_wlan');
  });

  it('declines when no WLAN is named', () => {
    const p = parseWirelessIntent('enable 802.11k');
    expect(p.intent.action).not.toBe('modify_wlan');
  });

  it('declines when the direction is ambiguous', () => {
    const p = parseWirelessIntent('802.11k on Skynet');
    expect(p.intent.action).not.toBe('modify_wlan');
  });

  it('marks the change as mutating, never read-only', () => {
    const p = parseWirelessIntent('enable 802.11k on Skynet');
    expect(p.classification).toBe('mutating');
  });
});
