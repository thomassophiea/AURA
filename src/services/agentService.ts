import { apiService } from './api';
import type {
  AgentMessage,
  AuditEntry,
  APITimelineEntry,
  ExecutionPlan,
  ExecutionResult,
  ImpactedObject,
  OperationIntent,
  PlanStep,
  AssistantUIContext,
} from '../components/AgentCoworker/agentTypes';

const AUDIT_KEY = 'agent-audit-history';

export class AgentService {
  private messages: AgentMessage[] = [];
  private auditHistory: AuditEntry[] = [];
  private apiTimeline: APITimelineEntry[] = [];
  private plans = new Map<string, ExecutionPlan>();

  constructor() {
    try {
      const saved = localStorage.getItem(AUDIT_KEY);
      if (saved) {
        this.auditHistory = JSON.parse(saved).map((e: AuditEntry) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        }));
      }
    } catch {
      // ignore corrupt storage
    }
  }

  getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  clearHistory(): void {
    this.messages = [];
  }

  getAuditHistory(): AuditEntry[] {
    return [...this.auditHistory].reverse();
  }

  getAPITimeline(): APITimelineEntry[] {
    return [...this.apiTimeline];
  }

  async sendMessage(content: string, context?: AssistantUIContext): Promise<AgentMessage> {
    const userMsg: AgentMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };
    this.messages.push(userMsg);

    const intent = await this.parseIntent(content);
    let agentMsg: AgentMessage;

    if (intent) {
      const plan = await this.buildExecutionPlan(intent);
      agentMsg = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        content: `I've built an execution plan for: **${plan.title}**\n\nThis will affect ${plan.impactedObjects.map((o) => o.name).join(', ')}. Review the plan and approve to proceed.`,
        timestamp: new Date(),
        executionPlan: plan,
        reasoning: `Detected write intent: "${intent.action}" targeting ${intent.targetType}. Built ${plan.steps.length}-step plan. Awaiting human approval before any changes are applied.`,
      };
    } else {
      agentMsg = await this.handleQuery(content, context);
    }

    this.messages.push(agentMsg);
    return agentMsg;
  }

  private async handleQuery(content: string, _context?: AssistantUIContext): Promise<AgentMessage> {
    try {
      const [sites, aps, stations] = await Promise.all([
        apiService.getSites().catch(() => []),
        apiService.getAccessPoints().catch(() => []),
        apiService.getAllStations().catch(() => []),
      ]);

      const summary = `Network summary: ${sites.length} sites, ${aps.length} access points, ${stations.length} connected clients.`;
      const lc = content.toLowerCase();

      let responseContent = summary;
      if (lc.includes('ap') || lc.includes('access point')) {
        const online = aps.filter(
          (a: { online?: boolean; isUp?: boolean; status?: string }) =>
            a.online ?? a.isUp ?? a.status === 'connected'
        ).length;
        responseContent = `There are **${aps.length}** access points total, **${online}** online.`;
      } else if (lc.includes('client') || lc.includes('station') || lc.includes('user')) {
        responseContent = `There are **${stations.length}** connected clients across ${sites.length} sites.`;
      } else if (lc.includes('site')) {
        responseContent = `There are **${sites.length}** sites configured.`;
      }

      return {
        id: `agent-${Date.now()}`,
        role: 'agent',
        content: responseContent,
        timestamp: new Date(),
        reasoning: `Fetched live data: ${sites.length} sites, ${aps.length} APs, ${stations.length} stations. Matched query pattern to provide targeted response.`,
      };
    } catch {
      return {
        id: `agent-${Date.now()}`,
        role: 'agent',
        content: 'Unable to fetch network data. Check your connection to the controller.',
        timestamp: new Date(),
      };
    }
  }

  logAPICall(entry: Omit<APITimelineEntry, 'id' | 'timestamp'>): void {
    this.apiTimeline.push({
      ...entry,
      id: `api-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date(),
    });
    if (this.apiTimeline.length > 200) {
      this.apiTimeline = this.apiTimeline.slice(-200);
    }
  }

  // Stubs — implemented in Tasks 3 & 4
  async parseIntent(_input: string): Promise<OperationIntent | null> {
    return null;
  }
  async buildExecutionPlan(_intent: OperationIntent): Promise<ExecutionPlan> {
    throw new Error('not implemented');
  }
  async executeApprovedPlan(_planId: string): Promise<ExecutionResult> {
    throw new Error('not implemented');
  }
  async rollbackOperation(_planId: string): Promise<void> {
    throw new Error('not implemented');
  }
  rejectPlan(_planId: string): void {
    throw new Error('not implemented');
  }
}

export const agentService = new AgentService();
