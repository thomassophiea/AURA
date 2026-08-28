import { describe, it, expect } from 'vitest';
import { isSafeHost, isLoopback, probeHost } from './netProbe.js';

describe('netProbe host validation', () => {
  it('accepts plain IPs and hostnames', () => {
    expect(isSafeHost('192.168.100.1')).toBe(true);
    expect(isSafeHost('8.8.8.8')).toBe(true);
    expect(isSafeHost('radius.corp.example.com')).toBe(true);
    expect(isSafeHost('fe80::1')).toBe(true);
  });

  it('rejects shell metacharacters and junk — controller fields are free text', () => {
    expect(isSafeHost('8.8.8.8; rm -rf /')).toBe(false);
    expect(isSafeHost('$(whoami)')).toBe(false);
    expect(isSafeHost('`id`')).toBe(false);
    expect(isSafeHost('host name')).toBe(false);
    expect(isSafeHost('')).toBe(false);
    expect(isSafeHost(undefined)).toBe(false);
  });

  it('probeHost refuses an unsafe host outright', async () => {
    const result = await probeHost('1.1.1.1 && curl evil', 53);
    expect(result).toEqual({ reachable: false, method: 'invalid-host' });
  });

  it('flags loopback addresses', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('localhost')).toBe(true);
    expect(isLoopback('10.0.0.1')).toBe(false);
  });
});
