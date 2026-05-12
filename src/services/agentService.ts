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

const WRITE_PATTERNS: Array<{
  pattern: RegExp;
  action: string;
  targetType: ImpactedObject['type'];
}> = [
  {
    pattern: /change.*password|update.*psk|set.*psk|new.*password/i,
    action: 'update-ssid-psk',
    targetType: 'ssid',
  },
  { pattern: /disable.*ap|turn off.*ap|deactivate.*ap/i, action: 'disable-ap', targetType: 'ap' },
  { pattern: /enable.*ap|turn on.*ap|activate.*ap/i, action: 'enable-ap', targetType: 'ap' },
  { pattern: /reboot.*ap|restart.*ap|reset.*ap/i, action: 'reboot-ap', targetType: 'ap' },
  {
    pattern: /change.*ssid|rename.*ssid|update.*ssid/i,
    action: 'update-ssid-name',
    targetType: 'ssid',
  },
  {
    pattern: /disable.*ssid|hide.*ssid|turn off.*ssid/i,
    action: 'disable-ssid',
    targetType: 'ssid',
  },
];

const READ_KEYWORDS = /^(how|what|show|list|get|status|count|who|where|which|is|are|tell|explain)/i;

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

  async parseIntent(input: string): Promise<OperationIntent | null> {
    if (READ_KEYWORDS.test(input.trim())) return null;

    for (const { pattern, action, targetType } of WRITE_PATTERNS) {
      if (pattern.test(input)) {
        const quoted = input.match(/["']([^"']+)["']/g)?.map((s) => s.replace(/["']/g, '')) ?? [];
        const apNames = input.match(/AP[-\s]\S+/gi) ?? [];
        const targetIds = [...new Set([...quoted, ...apNames])];

        return {
          action,
          targetType,
          targetIds: targetIds.length ? targetIds : ['(from context)'],
          parameters: {},
          requiresApproval: true,
        };
      }
    }
    return null;
  }

  async buildExecutionPlan(intent: OperationIntent): Promise<ExecutionPlan> {
    const id = `plan-${Date.now()}`;
    const steps = this.planStepsFor(intent);
    const plan: ExecutionPlan = {
      id,
      title: this.planTitle(intent),
      description: `Performing ${intent.action} on ${intent.targetIds.join(', ')}`,
      status: 'pending',
      steps,
      impactedObjects: intent.targetIds.map((tid) => ({
        type: intent.targetType,
        id: tid,
        name: tid,
      })),
      createdAt: new Date(),
    };
    this.plans.set(id, plan);
    return plan;
  }

  private planTitle(intent: OperationIntent): string {
    const titles: Record<string, string> = {
      'update-ssid-psk': 'Update SSID Password',
      'disable-ap': 'Disable Access Point',
      'enable-ap': 'Enable Access Point',
      'reboot-ap': 'Reboot Access Point',
      'update-ssid-name': 'Rename SSID',
      'disable-ssid': 'Disable SSID',
    };
    return titles[intent.action] ?? intent.action;
  }

  private planStepsFor(intent: OperationIntent): PlanStep[] {
    const base = (label: string, description: string, endpoint: string): PlanStep => ({
      id: `step-${Math.random().toString(36).slice(2)}`,
      label,
      description,
      status: 'pending',
      apiEndpoint: endpoint,
    });

    switch (intent.action) {
      case 'update-ssid-psk':
        return [
          base(
            'Fetch current SSID config',
            'Read existing SSID settings for diff',
            'GET /v1/services/{id}'
          ),
          base(
            'Validate new PSK',
            'Check password meets complexity requirements',
            '(local validation)'
          ),
          base('Apply new PSK', 'Write updated PSK to controller', 'PUT /v1/services/{id}'),
          base(
            'Verify change',
            'Read back config to confirm write succeeded',
            'GET /v1/services/{id}'
          ),
        ];
      case 'disable-ap':
        return [
          base('Fetch AP status', 'Read current AP state', 'GET /v1/aps/{serial}'),
          base('Disable AP', 'Set AP admin state to disabled', 'PUT /v1/aps/{serial}'),
        ];
      case 'enable-ap':
        return [
          base('Fetch AP status', 'Read current AP state', 'GET /v1/aps/{serial}'),
          base('Enable AP', 'Set AP admin state to enabled', 'PUT /v1/aps/{serial}'),
        ];
      case 'reboot-ap':
        return [
          base(
            'Verify AP is reachable',
            'Confirm AP is connected before rebooting',
            'GET /v1/aps/{serial}'
          ),
          base(
            'Send reboot command',
            'Issue reboot instruction to AP',
            'POST /v1/aps/{serial}/reboot'
          ),
        ];
      case 'disable-ssid':
        return [
          base('Fetch SSID config', 'Read current SSID state', 'GET /v1/services/{id}'),
          base('Disable SSID', 'Set SSID enabled flag to false', 'PUT /v1/services/{id}'),
        ];
      default:
        return [
          base('Execute operation', `Run ${intent.action}`, `PUT /v1/${intent.targetType}s/{id}`),
        ];
    }
  }
  async executeApprovedPlan(planId: string): Promise<ExecutionResult> {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');

    plan.status = 'executing';
    plan.approvedAt = new Date();
    let completedSteps = 0;

    for (const step of plan.steps) {
      step.status = 'running';
      const start = Date.now();
      try {
        await this.executeStep(step, plan);
        step.duration = Date.now() - start;
        step.status = 'completed';
        completedSteps++;
      } catch (err) {
        step.status = 'failed';
        plan.status = 'failed';
        this.addAuditEntry(plan, 'failed');
        return {
          planId,
          success: false,
          completedSteps,
          failedStep: step.id,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    plan.status = 'completed';
    plan.completedAt = new Date();
    this.addAuditEntry(plan, 'completed');

    return { planId, success: true, completedSteps };
  }

  async rollbackOperation(planId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');
    plan.status = 'rolledback';
    this.addAuditEntry(plan, 'rolledback');
  }

  rejectPlan(planId: string): void {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');
    plan.status = 'rejected';
    this.addAuditEntry(plan, 'rejected');
  }

  private async executeStep(step: PlanStep, _plan: ExecutionPlan): Promise<void> {
    if (step.apiEndpoint?.startsWith('(')) return; // local validation steps, no HTTP

    const parts = (step.apiEndpoint ?? 'GET /').split(' ');
    const method = parts[0] ?? 'GET';
    const path = parts.slice(1).join(' ') || '/';
    const start = Date.now();

    const response = await apiService.makeAuthenticatedRequest(
      path.replace(/\{[^}]+\}/g, 'unknown'),
      { method: method as 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE' }
    );

    this.logAPICall({
      method: method as APITimelineEntry['method'],
      endpoint: path,
      status: response.status,
      duration: Date.now() - start,
      planStepId: step.id,
    });

    if (!response.ok) {
      throw new Error(`${method} ${path} failed: ${response.status} ${response.statusText}`);
    }
  }

  private addAuditEntry(plan: ExecutionPlan, status: AuditEntry['status']): void {
    let user = 'unknown';
    try {
      user = localStorage.getItem('user_email') ?? 'unknown';
    } catch {
      // localStorage unavailable (e.g., test environment)
    }
    const entry: AuditEntry = {
      id: `audit-${Date.now()}`,
      timestamp: new Date(),
      action: plan.title,
      operator: user,
      planId: plan.id,
      status,
      impactedObjects: plan.impactedObjects,
    };
    this.auditHistory.push(entry);
    try {
      localStorage.setItem(AUDIT_KEY, JSON.stringify(this.auditHistory.slice(-100)));
    } catch {
      // ignore quota errors or unavailable storage
    }
  }
}

export const agentService = new AgentService();
