import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWirelessAssistant } from './useWirelessAssistant';
import * as cortexApiClient from '@/services/cortexApiClient';
import type { ParsedWirelessIntent, WirelessValidationReport } from '@/types/wirelessAssistant';

vi.mock('@/services/cortexApiClient', () => ({
  parseWirelessInstruction: vi.fn(),
  validateWirelessIntent: vi.fn(),
  provisionWirelessIntent: vi.fn(),
}));

const READ_ONLY: ParsedWirelessIntent = {
  intent: { action: 'validate_only', requestedBy: 'u', source: 'text', rawInstruction: 'x' },
  missingFields: [],
  ambiguities: [],
  riskLevel: 'low',
  humanReadable: 'question',
  classification: 'read_only',
};

const COMPLETE_CREATE: ParsedWirelessIntent = {
  intent: {
    action: 'create_wlan',
    siteId: 'site-1',
    siteName: 'Boston Office',
    wlanName: 'Guest',
    ssid: 'Guest',
    vlanId: 40,
    security: { mode: 'wpa2_personal', credentialReference: '(captured, not echoed)' },
    requestedBy: 'u',
    source: 'text',
    rawInstruction: 'create a guest wlan at boston office wpa2 password guestwifi1',
  },
  missingFields: [],
  ambiguities: [],
  riskLevel: 'high',
  humanReadable: 'Create a wpa2_personal WLAN named "Guest"...',
  classification: 'mutating',
  _ephemeralPassword: 'guestwifi1',
};

const INCOMPLETE_CREATE: ParsedWirelessIntent = {
  ...COMPLETE_CREATE,
  intent: { ...COMPLETE_CREATE.intent, siteId: undefined, siteName: undefined },
  missingFields: ['siteId'],
};

function makeReport(overrides: Partial<WirelessValidationReport> = {}): WirelessValidationReport {
  return {
    intent: COMPLETE_CREATE.intent,
    checks: [],
    confidence: { score: 90, band: 'HIGH', blockingIssues: [], warnings: [] },
    recommendation: 'Ready for operator approval.',
    planHash: 'hash-1',
    validationToken: 'tok-1',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useWirelessAssistant — intake', () => {
  it('returns read_only and does not enter the mutating workflow for a question', async () => {
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockResolvedValue(READ_ONLY);
    const { result } = renderHook(() => useWirelessAssistant());

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.submitInstruction('what wlans are at boston office', 'text');
    });

    expect(outcome).toBe('read_only');
    expect(result.current.workflowState).toBe('idle');
  });

  it('surfaces an intake failure instead of leaving the operator with no feedback', async () => {
    // e.g. an admin has Cortex disabled — /api/cortex/wireless/intent 403s.
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockRejectedValue(
      new Error('Cortex API error 403: AURA Cortex is disabled.')
    );
    const { result } = renderHook(() => useWirelessAssistant());

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.submitInstruction('create a guest wlan', 'text');
    });

    expect(outcome).toBe('error');
    expect(result.current.error).toContain('AURA Cortex is disabled');
    // Falls back to idle (not stuck mid-flow) so the chat view — and this
    // error — stay visible instead of a blank panel.
    expect(result.current.workflowState).toBe('idle');
    expect(result.current.parsedIntent).toBeNull();
  });

  it('enters missing_information when required fields are absent', async () => {
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockResolvedValue(INCOMPLETE_CREATE);
    const { result } = renderHook(() => useWirelessAssistant());

    await act(async () => {
      await result.current.submitInstruction('create a guest wlan wpa2 password guestwifi1', 'text');
    });

    expect(result.current.workflowState).toBe('missing_information');
    expect(result.current.parsedIntent?.missingFields).toContain('siteId');
  });

  it('clears the missing field once the operator supplies it, and it no longer blocks progress', async () => {
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockResolvedValue(INCOMPLETE_CREATE);
    const { result } = renderHook(() => useWirelessAssistant());
    await act(async () => {
      await result.current.submitInstruction('create a guest wlan wpa2 password guestwifi1', 'text');
    });

    act(() => {
      result.current.updateIntentField({ siteId: 'site-1', siteName: 'Boston Office' });
    });

    expect(result.current.parsedIntent?.missingFields).not.toContain('siteId');
    expect(result.current.workflowState).toBe('entering_text');
  });
});

describe('useWirelessAssistant — validation', () => {
  it('runs validation and exposes the report', async () => {
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockResolvedValue(COMPLETE_CREATE);
    vi.mocked(cortexApiClient.validateWirelessIntent).mockResolvedValue(makeReport());
    const { result } = renderHook(() => useWirelessAssistant());
    await act(async () => {
      await result.current.submitInstruction('create a guest wlan at boston office wpa2 password guestwifi1', 'text');
    });

    await act(async () => {
      await result.current.validate();
    });

    expect(result.current.workflowState).toBe('validation_ready');
    expect(result.current.canApproveNow).toBe(true);
    expect(cortexApiClient.validateWirelessIntent).toHaveBeenCalledWith(COMPLETE_CREATE.intent, 'guestwifi1');
  });

  it('editing the intent after validation invalidates it (must re-validate)', async () => {
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockResolvedValue(COMPLETE_CREATE);
    vi.mocked(cortexApiClient.validateWirelessIntent).mockResolvedValue(makeReport());
    const { result } = renderHook(() => useWirelessAssistant());
    await act(async () => {
      await result.current.submitInstruction('create a guest wlan at boston office wpa2 password guestwifi1', 'text');
    });
    await act(async () => {
      await result.current.validate();
    });
    expect(result.current.canApproveNow).toBe(true);

    act(() => {
      result.current.updateIntentField({ vlanId: 41 });
    });

    expect(result.current.validationReport).toBeNull();
    expect(result.current.canApproveNow).toBe(false);
  });
});

describe('useWirelessAssistant — approval gating', () => {
  async function setUpValidated() {
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockResolvedValue(COMPLETE_CREATE);
    vi.mocked(cortexApiClient.validateWirelessIntent).mockResolvedValue(makeReport());
    const { result } = renderHook(() => useWirelessAssistant());
    await act(async () => {
      await result.current.submitInstruction('x', 'text');
    });
    await act(async () => {
      await result.current.validate();
    });
    return result;
  }

  it('approve(button) calls provisionWirelessIntent and reaches completed', async () => {
    vi.mocked(cortexApiClient.provisionWirelessIntent).mockResolvedValue({ status: 'completed', serviceId: 'svc-1' });
    const result = await setUpValidated();

    await act(async () => {
      await result.current.approve('button', 'operator1');
    });

    expect(result.current.workflowState).toBe('completed');
    expect(cortexApiClient.provisionWirelessIntent).toHaveBeenCalledWith(
      expect.objectContaining({ planHash: 'hash-1', validationToken: 'tok-1', approvedBy: 'operator1' })
    );
  });

  it('reaches failed when provisioning reports failed', async () => {
    vi.mocked(cortexApiClient.provisionWirelessIntent).mockResolvedValue({ status: 'failed', reason: 'invalid_or_stale_validation_token' });
    const result = await setUpValidated();

    await act(async () => {
      await result.current.approve('button', 'operator1');
    });

    expect(result.current.workflowState).toBe('failed');
  });

  it('refuses an ambiguous voice confirmation ("yes") without calling provision', async () => {
    const result = await setUpValidated();

    await act(async () => {
      await result.current.approve('voice', 'operator1', 'yes');
    });

    expect(cortexApiClient.provisionWirelessIntent).not.toHaveBeenCalled();
    expect(result.current.error).toContain('ambiguous');
  });

  it('accepts an explicit voice confirmation phrase', async () => {
    vi.mocked(cortexApiClient.provisionWirelessIntent).mockResolvedValue({ status: 'completed' });
    const result = await setUpValidated();

    await act(async () => {
      await result.current.approve('voice', 'operator1', 'Confirm and configure.');
    });

    expect(cortexApiClient.provisionWirelessIntent).toHaveBeenCalled();
    expect(result.current.workflowState).toBe('completed');
  });

  it('refuses to approve once the validation token has expired', async () => {
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockResolvedValue(COMPLETE_CREATE);
    vi.mocked(cortexApiClient.validateWirelessIntent).mockResolvedValue(
      makeReport({ expiresAt: new Date(Date.now() - 1000).toISOString() })
    );
    const { result } = renderHook(() => useWirelessAssistant());
    await act(async () => {
      await result.current.submitInstruction('x', 'text');
    });
    await act(async () => {
      await result.current.validate();
    });

    await act(async () => {
      await result.current.approve('button', 'operator1');
    });

    expect(cortexApiClient.provisionWirelessIntent).not.toHaveBeenCalled();
  });

  it('refuses to approve with no validation at all', async () => {
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockResolvedValue(COMPLETE_CREATE);
    const { result } = renderHook(() => useWirelessAssistant());
    await act(async () => {
      await result.current.submitInstruction('x', 'text');
    });

    await act(async () => {
      await result.current.approve('button', 'operator1');
    });

    expect(cortexApiClient.provisionWirelessIntent).not.toHaveBeenCalled();
  });
});

describe('useWirelessAssistant — cancel', () => {
  it('wipes transcript, intent, validation and provisioning state', async () => {
    vi.mocked(cortexApiClient.parseWirelessInstruction).mockResolvedValue(COMPLETE_CREATE);
    vi.mocked(cortexApiClient.validateWirelessIntent).mockResolvedValue(makeReport());
    const { result } = renderHook(() => useWirelessAssistant());
    await act(async () => {
      await result.current.submitInstruction('x', 'text');
    });
    await act(async () => {
      await result.current.validate();
    });

    act(() => {
      result.current.cancel();
    });

    expect(result.current.workflowState).toBe('cancelled');
    expect(result.current.transcript).toBe('');
    expect(result.current.parsedIntent).toBeNull();
    expect(result.current.validationReport).toBeNull();
  });
});
