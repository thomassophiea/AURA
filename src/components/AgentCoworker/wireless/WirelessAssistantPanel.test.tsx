import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WirelessAssistantPanel } from './WirelessAssistantPanel';
import * as cortexApiClient from '@/services/cortexApiClient';
import type { ParsedWirelessIntent } from '@/types/wirelessAssistant';

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
    expect(screen.getByText(/backed by evidence read from the Gateway/i)).toBeDefined();
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

describe('the configuration review never flashes on a read-only question', () => {
  const readOnly = (text: string): ParsedWirelessIntent => ({
    intent: { action: 'validate_only', requestedBy: 'tester', source: 'text', rawInstruction: text },
    missingFields: [],
    ambiguities: [],
    riskLevel: 'low',
    humanReadable: text,
    classification: 'read_only',
  });

  const ask = (text: string) => {
    const input = screen.getByPlaceholderText(/ask me anything/i);
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: 'Enter' });
  };

  it('stays out of the workflow view WHILE the parse is still in flight', async () => {
    // The reported glitch: the review panel appeared for a split second on a
    // read-only question. Every existing test asserted only the settled state,
    // so none of them could see it. This holds the parse open and asserts on
    // the intermediate frame, which is where the bug actually lived.
    let release!: (v: ParsedWirelessIntent) => void;
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockReturnValue(
      new Promise<ParsedWirelessIntent>((resolve) => { release = resolve; })
    );

    render(<WirelessAssistantPanel />);
    ask('how is EAL-PT-S-5th-Floor');

    // Mid-parse: the chat view must still be the thing on screen.
    await waitFor(() => expect(screen.getByPlaceholderText(/ask me anything/i)).toBeDefined());
    expect(screen.queryByText(/AURA interpreted/i)).toBeNull();
    expect(screen.queryByText(/What you said/i)).toBeNull();
    expect(screen.queryByText(/Live validation/i)).toBeNull();

    release(readOnly('how is EAL-PT-S-5th-Floor'));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith('how is EAL-PT-S-5th-Floor'));
    expect(screen.queryByText(/AURA interpreted/i)).toBeNull();
  });

  it('does not render the PREVIOUS question\'s intent while the next one parses', async () => {
    // The precise mechanism: `parsedIntent` was never cleared, so the second
    // read-only question rendered the first one's intent against the new
    // transcript until its own parse returned.
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockResolvedValueOnce(readOnly('first'));
    render(<WirelessAssistantPanel />);
    ask('how is EAL-PT-N-5th-Floor');
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));

    let release!: (v: ParsedWirelessIntent) => void;
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockReturnValue(
      new Promise<ParsedWirelessIntent>((resolve) => { release = resolve; })
    );
    ask('how is EAL-PT-S-5th-Floor');

    await waitFor(() => expect(screen.getByPlaceholderText(/ask me anything/i)).toBeDefined());
    expect(screen.queryByText(/AURA interpreted/i)).toBeNull();

    release(readOnly('second'));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
  });

  it('still shows the review for a mutating instruction, but only once parsed', async () => {
    // The guard must not suppress the panel where it belongs.
    let release!: (v: ParsedWirelessIntent) => void;
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockReturnValue(
      new Promise<ParsedWirelessIntent>((resolve) => { release = resolve; })
    );

    render(<WirelessAssistantPanel />);
    ask('create a guest wlan at boston office wpa2 password guestwifi1');

    await waitFor(() => expect(screen.getByPlaceholderText(/ask me anything/i)).toBeDefined());
    expect(screen.queryByText(/AURA interpreted/i)).toBeNull();

    release({
      intent: {
        action: 'create_wlan',
        siteId: 'site-1',
        siteName: 'boston office',
        wlanName: 'guest',
        requestedBy: 'tester',
        source: 'text',
        rawInstruction: 'create a guest wlan at boston office wpa2 password guestwifi1',
      },
      missingFields: [],
      ambiguities: [],
      riskLevel: 'medium',
      humanReadable: 'create guest',
      classification: 'mutating',
    });
    await waitFor(() => expect(screen.getByText(/AURA interpreted/i)).toBeDefined());
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
