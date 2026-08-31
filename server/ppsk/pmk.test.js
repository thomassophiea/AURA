import { describe, it, expect } from 'vitest';
import {
  derivePmk,
  validatePassphrase,
  generatePassphrase,
  keyidFor,
  pskFileLine,
  renderPskFile,
  WILDCARD_MAC,
} from './pmk.js';

describe('derivePmk — IEEE 802.11i reference vectors', () => {
  // Annex H.4.2, Test 1. This is the canonical published PMK and is the proof
  // that the derivation is standards-correct — do not change it.
  it('matches ("password","IEEE")', () => {
    expect(derivePmk('password', 'IEEE')).toBe(
      'f42c6fc52df0ebef9ebb4b90b38a5f902e83fe1b135a70e23aed762e9710a12e'
    );
  });

  it('binds the PMK to the SSID (same passphrase, different SSID ⇒ different PMK)', () => {
    expect(derivePmk('Thomas-7284', 'Aura-PPSK-Lab')).not.toBe(
      derivePmk('Thomas-7284', 'Other-SSID')
    );
  });

  it('returns 64 hex chars (256 bits)', () => {
    expect(derivePmk('anypass1', 'ssid')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('validatePassphrase', () => {
  it('accepts an 8–63 char printable-ASCII passphrase', () => {
    expect(validatePassphrase('Thomas-7284')).toBeNull();
  });
  it('rejects too-short and too-long', () => {
    expect(validatePassphrase('short')).toMatch(/at least 8/);
    expect(validatePassphrase('x'.repeat(64))).toMatch(/at most 63/);
  });
  it('rejects a newline (would corrupt an unrelated key-file line)', () => {
    expect(validatePassphrase('good-one\nkeyid=evil 00:00:00:00:00:00 hijack')).toMatch(/printable ASCII/);
  });
});

describe('generatePassphrase', () => {
  it('generates the requested length from the unambiguous alphabet', () => {
    const p = generatePassphrase(20);
    expect(p).toHaveLength(20);
    expect(p).not.toMatch(/[0O1lI]/);
    expect(validatePassphrase(p)).toBeNull();
  });
  it('is effectively unique across calls', () => {
    const set = new Set(Array.from({ length: 50 }, () => generatePassphrase(16)));
    expect(set.size).toBe(50);
  });
});

describe('keyidFor', () => {
  it('strips whitespace and unsafe characters', () => {
    expect(keyidFor('Thomas Test #1')).toBe('Thomas-Test-1');
  });
  it('never returns empty', () => {
    expect(keyidFor('   ')).toBe('identity');
    expect(keyidFor('@@@')).toBe('identity');
  });
});

describe('renderPskFile', () => {
  it('renders wildcard-MAC lines with keyid and optional vlan', () => {
    const line = pskFileLine({ keyid: 'Printer-Test', passphrase: 'Printer-3829', vlanId: 30 });
    expect(line).toBe(`vlanid=30 keyid=Printer-Test ${WILDCARD_MAC} Printer-3829`);
  });
  it('omits vlanid when not set and includes every entry', () => {
    const body = renderPskFile([
      { keyid: 'Thomas-Test', passphrase: 'Thomas-7284', vlanId: null },
      { keyid: 'Printer-Test', passphrase: 'Printer-3829', vlanId: 30 },
    ]);
    expect(body).toContain(`keyid=Thomas-Test ${WILDCARD_MAC} Thomas-7284`);
    expect(body).toContain(`vlanid=30 keyid=Printer-Test ${WILDCARD_MAC} Printer-3829`);
    expect(body.trimEnd().split('\n').filter((l) => !l.startsWith('#'))).toHaveLength(2);
  });
  it('is empty-safe', () => {
    expect(renderPskFile([])).toContain('# wpa_psk_file');
  });
});
