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

describe('AgentService — getAPITimeline / logAPICall', () => {
  let service: AgentService;

  beforeEach(() => {
    service = new AgentService();
  });

  it('starts with an empty timeline', () => {
    expect(service.getAPITimeline()).toHaveLength(0);
  });

  it('logAPICall adds an entry with id and timestamp', () => {
    service.logAPICall({
      method: 'GET',
      endpoint: '/v1/aps',
      status: 200,
      duration: 42,
    });
    const timeline = service.getAPITimeline();
    expect(timeline).toHaveLength(1);
    expect(timeline[0].method).toBe('GET');
    expect(timeline[0].endpoint).toBe('/v1/aps');
    expect(timeline[0].status).toBe(200);
    expect(timeline[0].duration).toBe(42);
    expect(timeline[0].id).toBeTruthy();
    expect(timeline[0].timestamp).toBeInstanceOf(Date);
  });

  it('logAPICall preserves optional planStepId', () => {
    service.logAPICall({
      method: 'PUT',
      endpoint: '/v1/services/123',
      status: 204,
      duration: 80,
      planStepId: 'step-abc',
    });
    const [entry] = service.getAPITimeline();
    expect(entry.planStepId).toBe('step-abc');
  });

  it('getAPITimeline returns a copy — mutations do not affect internal state', () => {
    service.logAPICall({ method: 'GET', endpoint: '/v1/sites', status: 200, duration: 10 });
    const first = service.getAPITimeline();
    first.pop();
    expect(service.getAPITimeline()).toHaveLength(1);
  });

  it('caps timeline at 200 entries', () => {
    for (let i = 0; i < 210; i++) {
      service.logAPICall({ method: 'GET', endpoint: `/v1/test/${i}`, status: 200, duration: 1 });
    }
    const timeline = service.getAPITimeline();
    expect(timeline.length).toBe(200);
    // newest entries kept — last pushed should be the most recent endpoint
    expect(timeline[timeline.length - 1].endpoint).toBe('/v1/test/209');
  });

  it('multiple entries are appended in order', () => {
    service.logAPICall({ method: 'GET', endpoint: '/v1/aps', status: 200, duration: 5 });
    service.logAPICall({ method: 'POST', endpoint: '/v1/aps/reboot', status: 202, duration: 15 });
    const timeline = service.getAPITimeline();
    expect(timeline).toHaveLength(2);
    expect(timeline[0].method).toBe('GET');
    expect(timeline[1].method).toBe('POST');
  });
});

describe('AgentService — rollbackOperation', () => {
  let service: AgentService;

  beforeEach(() => {
    service = new AgentService();
  });

  it('throws if planId is unknown', async () => {
    await expect(service.rollbackOperation('no-such-plan')).rejects.toThrow('Plan not found');
  });

  it('marks plan as rolledback and writes audit entry', async () => {
    const intent: OperationIntent = {
      action: 'disable-ssid',
      targetType: 'ssid',
      targetIds: ['ssid-42'],
      parameters: {},
      requiresApproval: true,
    };
    const plan = await service.buildExecutionPlan(intent);
    await service.rollbackOperation(plan.id);

    const audit = service.getAuditHistory();
    expect(audit.length).toBeGreaterThanOrEqual(1);
    const entry = audit.find((a) => a.planId === plan.id);
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('rolledback');
  });
});

describe('AgentService — getPageInsights', () => {
  it('returns an empty array for any page type', () => {
    const service = new AgentService();
    expect(service.getPageInsights('service-levels')).toEqual([]);
    expect(service.getPageInsights('devices')).toEqual([]);
  });
});

describe('AgentService — parseIntent target extraction', () => {
  let service: AgentService;

  beforeEach(() => {
    service = new AgentService();
  });

  it('extracts quoted target names as targetIds', async () => {
    const intent = await service.parseIntent('change the password for "CorpWifi" SSID');
    expect(intent).not.toBeNull();
    expect(intent!.targetIds).toContain('CorpWifi');
  });

  it('extracts AP names matching AP-<name> pattern', async () => {
    const intent = await service.parseIntent('disable AP-floor2 please');
    expect(intent).not.toBeNull();
    expect(intent!.targetIds.some((id) => id.toLowerCase().includes('floor2'))).toBe(true);
  });

  it('falls back to (from context) when no identifiers found', async () => {
    const intent = await service.parseIntent('disable some random AP');
    expect(intent).not.toBeNull();
    expect(intent!.targetIds).toContain('(from context)');
  });
});

describe('AgentService — sendMessage write intent path', () => {
  let service: AgentService;

  beforeEach(() => {
    service = new AgentService();
  });

  it('returns an agent message with an executionPlan for write intents', async () => {
    const reply = await service.sendMessage('disable AP-roof-01');
    expect(reply.role).toBe('agent');
    expect(reply.executionPlan).toBeDefined();
    expect(reply.executionPlan!.status).toBe('pending');
    expect(reply.reasoning).toMatch(/write intent/i);
  });
});

describe('AgentService — sendMessage query path content matching', () => {
  let service: AgentService;

  beforeEach(() => {
    service = new AgentService();
  });

  it('mentions clients/stations in response to a client query', async () => {
    const reply = await service.sendMessage('how many clients are connected?');
    expect(reply.role).toBe('agent');
    expect(reply.content).toMatch(/client/i);
  });

  it('mentions sites in response to a site query', async () => {
    const reply = await service.sendMessage('how many sites are configured?');
    expect(reply.role).toBe('agent');
    expect(reply.content).toMatch(/site/i);
  });

  it('prepends page context name when context.pageName is provided', async () => {
    const reply = await service.sendMessage('how many sites are there?', {
      route: '/service-levels',
      pageName: 'Dashboard',
      pageType: 'service-levels',
    });
    expect(reply.content).toContain('Dashboard');
  });
});
