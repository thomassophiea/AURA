import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./api', () => ({
  apiService: {
    makeAuthenticatedRequest: vi.fn(),
    getSites: vi.fn().mockResolvedValue([]),
    getAccessPoints: vi.fn().mockResolvedValue([]),
    getAllStations: vi.fn().mockResolvedValue([]),
  },
}));

import { AgentService } from './agentService';
import type { OperationIntent } from '../components/AgentCoworker/agentTypes';

describe('AgentService — message history', () => {
  let service: AgentService;

  beforeEach(() => {
    service = new AgentService();
  });

  it('starts with empty message history', () => {
    expect(service.getMessages()).toHaveLength(0);
  });

  it('clearHistory empties messages', async () => {
    await service.sendMessage('hello');
    service.clearHistory();
    expect(service.getMessages()).toHaveLength(0);
  });

  it('sendMessage adds user message and agent reply', async () => {
    await service.sendMessage('how many APs are online?');
    const msgs = service.getMessages();
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('how many APs are online?');
    expect(msgs[1].role).toBe('agent');
    expect(msgs[1].id).toBeTruthy();
    expect(msgs[1].timestamp).toBeInstanceOf(Date);
  });
});

describe('AgentService — intent parsing', () => {
  let service: AgentService;

  beforeEach(() => {
    service = new AgentService();
  });

  it('returns null for a read-only query', async () => {
    const intent = await service.parseIntent('how many APs are online?');
    expect(intent).toBeNull();
  });

  it('detects SSID update intent', async () => {
    const intent = await service.parseIntent('change the password for CorpNet SSID');
    expect(intent).not.toBeNull();
    expect(intent!.action).toBe('update-ssid-psk');
    expect(intent!.targetType).toBe('ssid');
    expect(intent!.requiresApproval).toBe(true);
  });

  it('detects AP disable intent', async () => {
    const intent = await service.parseIntent('disable AP-floor2-east');
    expect(intent).not.toBeNull();
    expect(intent!.action).toBe('disable-ap');
    expect(intent!.targetType).toBe('ap');
  });

  it('detects AP reboot intent', async () => {
    const intent = await service.parseIntent('reboot all APs on site Main Campus');
    expect(intent).not.toBeNull();
    expect(intent!.action).toBe('reboot-ap');
  });
});

describe('AgentService — buildExecutionPlan', () => {
  let service: AgentService;

  beforeEach(() => {
    service = new AgentService();
  });

  it('builds a plan with steps for update-ssid-psk', async () => {
    const intent: OperationIntent = {
      action: 'update-ssid-psk',
      targetType: 'ssid',
      targetIds: ['ssid-123'],
      parameters: { newPsk: 'secret123' },
      requiresApproval: true,
    };
    const plan = await service.buildExecutionPlan(intent);
    expect(plan.id).toBeTruthy();
    expect(plan.status).toBe('pending');
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps.every((s) => s.status === 'pending')).toBe(true);
  });

  it('buildExecutionPlan issues NO write API calls', async () => {
    const { apiService: mockApi } = await import('./api');
    const writeSpy = vi.spyOn(mockApi, 'makeAuthenticatedRequest');
    const intent: OperationIntent = {
      action: 'disable-ap',
      targetType: 'ap',
      targetIds: ['AP-001'],
      parameters: {},
      requiresApproval: true,
    };
    await service.buildExecutionPlan(intent);
    const writeCalls = writeSpy.mock.calls.filter(
      ([, opts]) =>
        opts?.method && !['GET', undefined].includes((opts.method as string).toUpperCase())
    );
    expect(writeCalls).toHaveLength(0);
  });
});

describe('AgentService — executeApprovedPlan', () => {
  let service: AgentService;

  beforeEach(() => {
    service = new AgentService();
  });

  it('throws if planId is unknown', async () => {
    await expect(service.executeApprovedPlan('nonexistent')).rejects.toThrow('Plan not found');
  });

  it('marks plan as completed on success', async () => {
    const { apiService: mockApi } = await import('./api');
    vi.mocked(mockApi.makeAuthenticatedRequest).mockResolvedValue(
      new Response(JSON.stringify({ id: 'ssid-1', enabled: false }), { status: 200 })
    );

    const intent: OperationIntent = {
      action: 'disable-ssid',
      targetType: 'ssid',
      targetIds: ['ssid-1'],
      parameters: {},
      requiresApproval: true,
    };
    const plan = await service.buildExecutionPlan(intent);
    const result = await service.executeApprovedPlan(plan.id);

    expect(result.success).toBe(true);
    expect(result.planId).toBe(plan.id);
  });

  it('adds an entry to audit history after completion', async () => {
    const { apiService: mockApi } = await import('./api');
    vi.mocked(mockApi.makeAuthenticatedRequest).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );

    const intent: OperationIntent = {
      action: 'disable-ap',
      targetType: 'ap',
      targetIds: ['AP-001'],
      parameters: {},
      requiresApproval: true,
    };
    const plan = await service.buildExecutionPlan(intent);
    await service.executeApprovedPlan(plan.id);

    const audit = service.getAuditHistory();
    expect(audit.length).toBe(1);
    expect(audit[0].planId).toBe(plan.id);
    expect(audit[0].status).toBe('completed');
  });

  it('rejectPlan marks plan rejected without API write calls', async () => {
    const { apiService: mockApi } = await import('./api');
    const writeSpy = vi.spyOn(mockApi, 'makeAuthenticatedRequest');

    const intent: OperationIntent = {
      action: 'reboot-ap',
      targetType: 'ap',
      targetIds: ['AP-002'],
      parameters: {},
      requiresApproval: true,
    };
    const plan = await service.buildExecutionPlan(intent);
    service.rejectPlan(plan.id);

    const writeCalls = writeSpy.mock.calls.filter(
      ([, opts]) =>
        opts?.method && !['GET', undefined].includes((opts.method as string).toUpperCase())
    );
    expect(writeCalls).toHaveLength(0);

    const audit = service.getAuditHistory();
    expect(audit[0].status).toBe('rejected');
  });
});
