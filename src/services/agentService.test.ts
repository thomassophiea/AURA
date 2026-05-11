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
