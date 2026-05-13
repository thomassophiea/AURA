import { describe, it, expect, vi } from 'vitest';
import { runWirelessQuery } from './wirelessQueryPipeline.js';

const baseOpts = {
  question: 'Why did client aa:bb:cc disconnect?',
  pageContext: { clientMac: 'aa:bb:cc', apSerial: 'SN123' },
  authToken: 'Bearer tok',
  controllerUrl: 'https://controller.local',
};

const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ rssi: -80, snr: 10, apName: 'AP-1', ssid: 'Corp', macAddress: 'aa:bb:cc' }),
});

const mockLlm = vi.fn().mockResolvedValue('The client disconnected due to low signal.');

describe('runWirelessQuery', () => {
  it('returns null for non-wireless questions', async () => {
    const result = await runWirelessQuery({ ...baseOpts, question: 'What is the weather today?', fetchFn: mockFetch, llmFn: mockLlm });
    expect(result).toBeNull();
  });

  it('returns a wireless answer with all required fields', async () => {
    const result = await runWirelessQuery({ ...baseOpts, fetchFn: mockFetch, llmFn: mockLlm });
    expect(result).not.toBeNull();
    expect(result.id).toBeDefined();
    expect(result.question).toBe(baseOpts.question);
    expect(result.narrative).toContain('low signal');
    expect(['High', 'Medium', 'Low']).toContain(result.confidence);
    expect(result.rootCause.category).toBeDefined();
    expect(Array.isArray(result.apiEvidenceUsed)).toBe(true);
    expect(Array.isArray(result.followUpChips)).toBe(true);
  });

  it('blocks disruptive actions without confirmationToken', async () => {
    const result = await runWirelessQuery({
      ...baseOpts,
      question: 'Reboot this AP',
      pageContext: { apSerial: 'SN123' },
      fetchFn: mockFetch,
      llmFn: mockLlm,
    });
    expect(result.requiresConfirmation).toBeDefined();
    expect(result.requiresConfirmation.confirmationToken).toBeDefined();
  });

  it('executes disruptive actions with valid confirmationToken', async () => {
    const prereq = await runWirelessQuery({
      ...baseOpts,
      question: 'Reboot this AP',
      pageContext: { apSerial: 'SN123' },
      fetchFn: mockFetch,
      llmFn: mockLlm,
    });
    const token = prereq.requiresConfirmation.confirmationToken;

    const result = await runWirelessQuery({
      ...baseOpts,
      question: 'Reboot this AP',
      pageContext: { apSerial: 'SN123' },
      confirmationToken: token,
      fetchFn: mockFetch,
      llmFn: mockLlm,
    });
    expect(result.requiresConfirmation).toBeUndefined();
    expect(result.narrative).toContain('low signal');
  });
});
