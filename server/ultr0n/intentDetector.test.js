import { describe, it, expect } from 'vitest';
import { detectIntent, isWirelessQuestion } from './intentDetector.js';

const ctx = {
  clientMac: 'aa:bb:cc:dd:ee:ff',
  apSerialNumber: 'AP001',
  siteId: 'site-1',
  serviceId: 'svc-1',
  ssid: 'CorpWifi',
  pageType: 'client-detail',
};

describe('isWirelessQuestion', () => {
  it('identifies client disconnect question', () => {
    expect(isWirelessQuestion('Why did this client disconnect?')).toBe(true);
  });
  it('identifies AP overload question', () => {
    expect(isWirelessQuestion('Which APs are overloaded?')).toBe(true);
  });
  it('identifies site health question via intent pattern', () => {
    expect(isWirelessQuestion('How is this site doing?')).toBe(true);
  });
  it('identifies what-to-fix question via intent pattern', () => {
    expect(isWirelessQuestion('What should I fix first?')).toBe(true);
  });
  it('does not flag generic config question', () => {
    expect(isWirelessQuestion('How do I update my password?')).toBe(false);
  });
  it('does not flag generic network health question', () => {
    expect(isWirelessQuestion('Summarize the current network health.')).toBe(false);
  });
});

describe('detectIntent', () => {
  it('maps disconnect question to client-disconnect intent', () => {
    const { intent, resolved } = detectIntent('Why did this client disconnect?', ctx);
    expect(intent).toBe('client-disconnect');
    expect(resolved.mac).toBe('aa:bb:cc:dd:ee:ff');
    expect(resolved.apSerialNumber).toBe('AP001');
  });

  it('maps poor wifi question to client-poor-wifi intent', () => {
    const { intent } = detectIntent('Why is Wi-Fi so slow for this client?', ctx);
    expect(intent).toBe('client-poor-wifi');
  });

  it('maps AP overload to ap-overloaded intent', () => {
    const { intent } = detectIntent('Which APs are overloaded?', { pageType: 'ap-list' });
    expect(intent).toBe('ap-overloaded');
  });

  it('maps auth failure to client-auth-fail intent', () => {
    const { intent } = detectIntent('Why is authentication failing?', ctx);
    expect(intent).toBe('client-auth-fail');
  });

  it('maps reboot question to action-reboot-ap intent', () => {
    const { intent } = detectIntent('Reboot this AP', ctx);
    expect(intent).toBe('action-reboot-ap');
  });

  it('returns unknown for unrecognized question', () => {
    const { intent } = detectIntent('What is the meaning of life?', {});
    expect(intent).toBe('unknown');
  });

  it('resolves site context from pageContext', () => {
    const { resolved } = detectIntent('What is the site health?', ctx);
    expect(resolved.siteId).toBe('site-1');
  });
});
