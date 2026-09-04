import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WirelessAssistantPanel } from './WirelessAssistantPanel';
import * as cortexApiClient from '@/services/cortexApiClient';

vi.mock('@/services/cortexApiClient', () => ({
  parseWirelessInstruction: vi.fn(),
  validateWirelessIntent: vi.fn(),
  provisionWirelessIntent: vi.fn(),
}));

const sendMessage = vi.fn();
vi.mock('@/contexts/CortexContext', () => ({
  useCortexContext: () => ({
    messages: [],
    isThinking: false,
    wirelessStage: null,
    suggestedPrompts: [],
    sendMessage,
    confirmWirelessAction: vi.fn(),
    addFeedback: vi.fn(),
    toggleReasoning: vi.fn(),
  }),
}));

vi.mock('@/contexts/AppContext', () => ({
  useAppContext: () => ({ organization: { name: 'Acme' }, siteGroup: { name: 'HQ' }, site: null }),
}));

vi.mock('@/services/api', () => ({
  apiService: { getSites: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/services/speechToText/groqSpeechToText', () => ({
  getSpeechToTextConfig: vi.fn().mockResolvedValue({ provider: 'browser', maxDurationSeconds: 60, maxUploadBytes: 8_000_000 }),
  GroqSpeechToTextProvider: class {
    transcribeAudio = vi.fn();
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cortexApiClient.parseWirelessInstruction).mockReset();
});

describe('WirelessAssistantPanel', () => {
  it('shows the chat view initially with the onboarding hint', () => {
    render(<WirelessAssistantPanel />);
    expect(screen.getByText(/AURA previews and validates changes/i)).toBeDefined();
  });

  it('routes a read-only question to the existing chat pipeline, not the workflow', async () => {
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockResolvedValue({
      intent: { action: 'validate_only', requestedBy: 'u', source: 'text', rawInstruction: 'x' },
      missingFields: [],
      ambiguities: [],
      riskLevel: 'low',
      humanReadable: 'q',
      classification: 'read_only',
    });

    render(<WirelessAssistantPanel />);
    const input = screen.getByPlaceholderText(/ask me anything/i);
    fireEvent.change(input, { target: { value: 'what wlans are at boston office' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith('what wlans are at boston office'));
    expect(screen.queryByText(/AURA interpreted/i)).toBeNull();
  });

  it('routes a mutating instruction into the workflow view instead of chat', async () => {
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockResolvedValue({
      intent: {
        action: 'create_wlan',
        siteId: 'site-1',
        siteName: 'Boston Office',
        wlanName: 'Guest',
        ssid: 'Guest',
        security: { mode: 'wpa2_personal', credentialReference: '(captured, not echoed)' },
        requestedBy: 'u',
        source: 'text',
        rawInstruction: 'create a guest wlan at boston office wpa2 password guestwifi1',
      },
      missingFields: [],
      ambiguities: [],
      riskLevel: 'high',
      humanReadable: 'Create a WLAN',
      classification: 'mutating',
      _ephemeralPassword: 'guestwifi1',
    });

    render(<WirelessAssistantPanel />);
    const input = screen.getByPlaceholderText(/ask me anything/i);
    fireEvent.change(input, { target: { value: 'create a guest wlan at boston office wpa2 password guestwifi1' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByText(/AURA interpreted/i)).toBeDefined());
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('shows a visible error instead of doing nothing when intake fails (e.g. Cortex disabled)', async () => {
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockRejectedValue(
      new Error('Cortex API error 403: AURA Cortex is disabled.')
    );

    render(<WirelessAssistantPanel />);
    const input = screen.getByPlaceholderText(/ask me anything/i);
    fireEvent.change(input, { target: { value: 'create a guest wlan' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByText(/AURA Cortex is disabled/i)).toBeDefined());
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('shows an honest "recognized, not yet supported" notice for a non-WLAN configuration domain, not chat or the workflow view', async () => {
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockResolvedValue({
      intent: { action: 'validate_only', requestedBy: 'u', source: 'text', rawInstruction: 'x' },
      missingFields: [],
      ambiguities: ['Local Controller API: POST /v3/roles'],
      riskLevel: 'low',
      humanReadable: 'Recognized "Role Configuration" — not yet supported through this assistant.',
      classification: 'unimplemented',
      domain: 'role',
    });

    render(<WirelessAssistantPanel />);
    const input = screen.getByPlaceholderText(/ask me anything/i);
    fireEvent.change(input, { target: { value: 'define traffic rules for the role' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByText(/Role Configuration/i)).toBeDefined());
    expect(sendMessage).not.toHaveBeenCalled();
    expect(screen.queryByText(/AURA interpreted/i)).toBeNull();
  });
});
