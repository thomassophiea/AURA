import { describe, it, expect } from 'vitest';
import { buildWirelessPrompt } from './wirelessSystemPrompt.js';

const baseEvidence = {
  client: { mac: 'aa:bb', rssi: -78, snr: 15, apName: 'AP-1', ssid: 'Corp' },
  ap: { channelUtil2g: 40 },
  events: [{ type: 'DEAUTH', description: 'low signal', timestamp: '2026-01-01T00:00:00Z' }],
  missingData: [],
};
const rootCause = { category: 'COVERAGE', explanation: 'Low RSSI detected.' };

describe('buildWirelessPrompt', () => {
  it('returns system and user messages', () => {
    const { systemMsg, userMsg } = buildWirelessPrompt({
      question: 'Why did this client disconnect?',
      pageContext: {},
      evidence: baseEvidence,
      rootCause,
      confidence: 'High',
    });
    expect(systemMsg.role).toBe('system');
    expect(userMsg.role).toBe('user');
  });

  it('system prompt contains wireless copilot identity', () => {
    const { systemMsg } = buildWirelessPrompt({ question: 'test', pageContext: {}, evidence: baseEvidence, rootCause, confidence: 'High' });
    expect(systemMsg.content).toContain('Cortex');
    expect(systemMsg.content).toContain('wireless');
  });

  it('system prompt includes evidence', () => {
    const { systemMsg } = buildWirelessPrompt({ question: 'test', pageContext: {}, evidence: baseEvidence, rootCause, confidence: 'High' });
    expect(systemMsg.content).toContain('-78');
    expect(systemMsg.content).toContain('DEAUTH');
  });

  it('system prompt includes root cause', () => {
    const { systemMsg } = buildWirelessPrompt({ question: 'test', pageContext: {}, evidence: baseEvidence, rootCause, confidence: 'High' });
    expect(systemMsg.content).toContain('COVERAGE');
  });

  it('user message contains the original question', () => {
    const { userMsg } = buildWirelessPrompt({ question: 'Why did it fail?', pageContext: {}, evidence: baseEvidence, rootCause, confidence: 'Medium' });
    expect(userMsg.content).toBe('Why did it fail?');
  });
});
