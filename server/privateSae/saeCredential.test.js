import { describe, it, expect } from 'vitest';
import {
  MIN_PASSPHRASE,
  MAX_PASSPHRASE,
  validatePassphrase,
  generatePassphrase,
  keyidFor,
  canonicalMac,
  saePasswordLine,
  renderSaePasswordFile,
} from './saeCredential.js';

describe('validatePassphrase', () => {
  it('accepts a strong printable-ASCII passphrase', () => {
    expect(validatePassphrase('Zephyr-Quill-Cobalt-9284')).toBeNull();
  });
  it('rejects too-short (SAE minimum is stronger than WPA2)', () => {
    expect(validatePassphrase('short')).toMatch(new RegExp(`at least ${MIN_PASSPHRASE}`));
    expect(validatePassphrase('x'.repeat(MIN_PASSPHRASE - 1))).toMatch(/at least/);
  });
  it('rejects too-long', () => {
    expect(validatePassphrase('x'.repeat(MAX_PASSPHRASE + 1))).toMatch(/at most 63/);
  });
  it("rejects '|' (the sae_password field separator)", () => {
    expect(validatePassphrase('good-password-here|mac=evil')).toMatch(/field separator/);
  });
  it('rejects a newline (would corrupt an unrelated credential line)', () => {
    expect(validatePassphrase('good-password-here\nsae_password=hijack')).toMatch(/printable ASCII/);
  });
});

describe('generatePassphrase — invariants', () => {
  it('generates at least the SAE minimum length by default', () => {
    const p = generatePassphrase();
    expect(p.length).toBeGreaterThanOrEqual(MIN_PASSPHRASE);
  });
  it('honours a requested length within bounds', () => {
    expect(generatePassphrase(32)).toHaveLength(32);
  });
  it('clamps a too-short request up to the minimum', () => {
    expect(generatePassphrase(4)).toHaveLength(MIN_PASSPHRASE);
  });
  it('clamps a too-long request down to the maximum', () => {
    expect(generatePassphrase(200)).toHaveLength(MAX_PASSPHRASE);
  });
  it('uses only the unambiguous alphabet (no 0/O/1/l/I, no separators)', () => {
    const p = generatePassphrase(63);
    expect(p).not.toMatch(/[0O1lI|=]/);
    expect(p).toMatch(/^[A-Za-z2-9]+$/);
  });
  it('every generated passphrase validates', () => {
    for (let i = 0; i < 25; i++) expect(validatePassphrase(generatePassphrase(20 + (i % 40)))).toBeNull();
  });
  it('is effectively unique across calls', () => {
    const set = new Set(Array.from({ length: 50 }, () => generatePassphrase(24)));
    expect(set.size).toBe(50);
  });
});

describe('keyidFor', () => {
  it('strips whitespace and separators', () => {
    expect(keyidFor('Thomas Test #1')).toBe('Thomas-Test-1');
    expect(keyidFor('a|b=c')).toBe('a-b-c');
  });
  it('never returns empty', () => {
    expect(keyidFor('   ')).toBe('credential');
    expect(keyidFor('@@@')).toBe('credential');
  });
});

describe('canonicalMac', () => {
  it('normalizes to lowercase colon form', () => {
    expect(canonicalMac('A4:83:E7:2C:19:D0')).toBe('a4:83:e7:2c:19:d0');
    expect(canonicalMac('a483.e72c.19d0')).toBe('a4:83:e7:2c:19:d0');
  });
  it('rejects a non-MAC', () => {
    expect(canonicalMac('nope')).toBe('');
    expect(canonicalMac('a4:83:e7:2c:19')).toBe('');
  });
});

describe('saePasswordLine — id is always last', () => {
  it('renders a wildcard line (no mac) with id last', () => {
    expect(saePasswordLine({ keyid: 'Thomas', passphrase: 'pass-word-value-1234' })).toBe(
      'sae_password=pass-word-value-1234|id=Thomas'
    );
  });
  it('includes mac and vlanid in order, id last', () => {
    expect(
      saePasswordLine({ keyid: 'Printer', passphrase: 'pass-word-value-1234', mac: 'a4:83:e7:2c:19:d0', vlanId: 30 })
    ).toBe('sae_password=pass-word-value-1234|mac=a4:83:e7:2c:19:d0|vlanid=30|id=Printer');
  });
  it('omits vlanid when unset', () => {
    expect(saePasswordLine({ keyid: 'K', passphrase: 'pass-word-value-1234', mac: 'a4:83:e7:2c:19:d0' })).toBe(
      'sae_password=pass-word-value-1234|mac=a4:83:e7:2c:19:d0|id=K'
    );
  });
});

describe('renderSaePasswordFile', () => {
  it('emits a wildcard line for a credential with no bindings', () => {
    const body = renderSaePasswordFile([{ keyid: 'Solo', passphrase: 'pass-word-value-1234', vlanId: null, macs: [] }]);
    expect(body).toContain('sae_password=pass-word-value-1234|id=Solo');
    expect(body).not.toContain('|mac=');
  });
  it('emits one line per bound MAC for a multi-binding credential', () => {
    const body = renderSaePasswordFile([
      {
        keyid: 'Shared',
        passphrase: 'pass-word-value-1234',
        vlanId: 40,
        macs: ['a4:83:e7:2c:19:d0', 'b4:83:e7:2c:19:d1'],
      },
    ]);
    const lines = body.trimEnd().split('\n').filter((l) => !l.startsWith('#'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('sae_password=pass-word-value-1234|mac=a4:83:e7:2c:19:d0|vlanid=40|id=Shared');
    expect(lines[1]).toBe('sae_password=pass-word-value-1234|mac=b4:83:e7:2c:19:d1|vlanid=40|id=Shared');
  });
  it('is empty-safe', () => {
    expect(renderSaePasswordFile([])).toContain('# sae_password file');
  });
});
