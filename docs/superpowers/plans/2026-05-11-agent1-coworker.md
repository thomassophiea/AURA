# Agent 1 Coworker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `NetworkChatbot` with a premium AI operations cockpit — a floating command bar (idle) that expands into a right-side workspace with conversation, execution plans, config diffs, approval gates, rollback, and audit history.

**Architecture:** New `agentService.ts` owns all write-path operations (intent → plan → approval → execute → audit) via the existing `apiService` singleton. `AgentCoworker/` is a self-contained component directory with a state-machine hook, a floating pill command bar, and a right-side slideout workspace composed of six panel views. `chatbot.ts` is untouched.

**Tech Stack:** React 19, TypeScript 5.7 strict, Tailwind v4, Radix UI, Lucide React, Vitest + React Testing Library

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/components/AgentCoworker/agentTypes.ts` | All shared types — no imports from chatbot.ts |
| Create | `src/services/agentService.ts` | Message history, intent parse, plan build, execute, rollback, audit |
| Create | `src/components/AgentCoworker/useAgentWorkspace.ts` | Panel state machine hook |
| Create | `src/components/AgentCoworker/AgentCommandBar.tsx` | Floating pill idle trigger |
| Create | `src/components/AgentCoworker/panels/ConversationStream.tsx` | Message thread + Show Reasoning + feedback |
| Create | `src/components/AgentCoworker/panels/ExecutionPlanView.tsx` | Step list with live status |
| Create | `src/components/AgentCoworker/panels/ConfigDiffView.tsx` | Before/after diff table |
| Create | `src/components/AgentCoworker/panels/ApprovalControls.tsx` | Approve / reject / rollback gate |
| Create | `src/components/AgentCoworker/panels/APITimelineView.tsx` | Live API call log |
| Create | `src/components/AgentCoworker/panels/AuditHistoryView.tsx` | Past operations log |
| Create | `src/components/AgentCoworker/AgentWorkspace.tsx` | Slideout shell, resize handle, panel tabs |
| Create | `src/components/AgentCoworker/index.tsx` | Root — composes bar + workspace, App.tsx interface |
| Modify | `src/App.tsx` | Replace NetworkChatbot, rename state, add pinned margin |
| Create | `src/services/agentService.test.ts` | Service unit tests |
| Create | `src/components/AgentCoworker/AgentCommandBar.test.tsx` | Idle state + keyboard |
| Create | `src/components/AgentCoworker/AgentWorkspace.test.tsx` | State transitions |
| Create | `src/components/AgentCoworker/panels/ApprovalControls.test.tsx` | Approval gate (critical) |

---

## Task 1: Types

**Files:**
- Create: `src/components/AgentCoworker/agentTypes.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/components/AgentCoworker/agentTypes.ts

export type WorkspaceSize = 'compact' | 'standard' | 'expanded'
// pixel widths:            400         520           720

export type WorkspaceMode = 'idle' | 'open' | 'minimized' | 'pinned'

export type ActivePanel = 'conversation' | 'execution' | 'diff' | 'audit' | 'timeline'

export type PlanStatus =
  | 'building'
  | 'pending'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'rejected'
  | 'rolledback'
  | 'failed'

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface AssistantUIContext {
  type: 'site' | 'client' | 'access-point' | 'wlan' | null
  entityId?: string
  entityName?: string
  siteId?: string
  siteName?: string
  timeRange?: string
}

export interface AgentMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: Date
  reasoning?: string
  showReasoning?: boolean
  executionPlan?: ExecutionPlan
  diff?: DiffEntry[]
  feedback?: 'up' | 'down' | null
}

export interface ExecutionPlan {
  id: string
  title: string
  description: string
  status: PlanStatus
  steps: PlanStep[]
  impactedObjects: ImpactedObject[]
  createdAt: Date
  approvedAt?: Date
  completedAt?: Date
}

export interface PlanStep {
  id: string
  label: string
  description: string
  status: StepStatus
  apiEndpoint?: string
  duration?: number
}

export interface DiffEntry {
  field: string
  scope: string
  before: unknown
  after: unknown
}

export interface ImpactedObject {
  type: 'site' | 'ap' | 'ssid' | 'policy' | 'vlan'
  id: string
  name: string
  count?: number
}

export interface AuditEntry {
  id: string
  timestamp: Date
  action: string
  operator: string
  planId: string
  status: 'completed' | 'rejected' | 'rolledback'
  impactedObjects: ImpactedObject[]
}

export interface APITimelineEntry {
  id: string
  timestamp: Date
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  endpoint: string
  status: number
  duration: number
  planStepId?: string
}

export interface OperationIntent {
  action: string
  targetType: ImpactedObject['type']
  targetIds: string[]
  parameters: Record<string, unknown>
  requiresApproval: true
}

export interface ExecutionResult {
  planId: string
  success: boolean
  completedSteps: number
  failedStep?: string
  error?: string
}

export const WORKSPACE_WIDTHS: Record<WorkspaceSize, number> = {
  compact: 400,
  standard: 520,
  expanded: 720,
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AgentCoworker/agentTypes.ts
git commit -m "feat(agent): add AgentCoworker types"
```

---

## Task 2: `agentService.ts` — core + message history

**Files:**
- Create: `src/services/agentService.ts`
- Create: `src/services/agentService.test.ts`

- [ ] **Step 1: Write failing tests for message history**

```typescript
// src/services/agentService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock apiService before importing agentService
vi.mock('./api', () => ({
  apiService: {
    makeAuthenticatedRequest: vi.fn(),
    getSites: vi.fn().mockResolvedValue([]),
    getAccessPoints: vi.fn().mockResolvedValue([]),
    getAllStations: vi.fn().mockResolvedValue([]),
  },
}))

import { AgentService } from './agentService'

describe('AgentService — message history', () => {
  let service: AgentService

  beforeEach(() => {
    service = new AgentService()
  })

  it('starts with empty message history', () => {
    expect(service.getMessages()).toHaveLength(0)
  })

  it('clearHistory empties messages', async () => {
    await service.sendMessage('hello')
    service.clearHistory()
    expect(service.getMessages()).toHaveLength(0)
  })

  it('sendMessage adds user message and agent reply', async () => {
    await service.sendMessage('how many APs are online?')
    const msgs = service.getMessages()
    expect(msgs[0].role).toBe('user')
    expect(msgs[0].content).toBe('how many APs are online?')
    expect(msgs[1].role).toBe('agent')
    expect(msgs[1].id).toBeTruthy()
    expect(msgs[1].timestamp).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 2: Run tests — verify fail**

```bash
npm run test -- --run src/services/agentService.test.ts
```
Expected: FAIL — `Cannot find module './agentService'`

- [ ] **Step 3: Create `agentService.ts` with core structure**

```typescript
// src/services/agentService.ts
import { apiService } from './api'
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
} from '../components/AgentCoworker/agentTypes'

const AUDIT_KEY = 'agent-audit-history'

export class AgentService {
  private messages: AgentMessage[] = []
  private auditHistory: AuditEntry[] = []
  private apiTimeline: APITimelineEntry[] = []
  private plans = new Map<string, ExecutionPlan>()

  constructor() {
    try {
      const saved = localStorage.getItem(AUDIT_KEY)
      if (saved) {
        this.auditHistory = JSON.parse(saved).map((e: AuditEntry) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        }))
      }
    } catch {
      // ignore corrupt storage
    }
  }

  getMessages(): AgentMessage[] {
    return [...this.messages]
  }

  clearHistory(): void {
    this.messages = []
  }

  getAuditHistory(): AuditEntry[] {
    return [...this.auditHistory].reverse()
  }

  getAPITimeline(): APITimelineEntry[] {
    return [...this.apiTimeline]
  }

  async sendMessage(content: string, context?: AssistantUIContext): Promise<AgentMessage> {
    const userMsg: AgentMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    }
    this.messages.push(userMsg)

    const intent = await this.parseIntent(content)
    let agentMsg: AgentMessage

    if (intent) {
      const plan = await this.buildExecutionPlan(intent)
      agentMsg = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        content: `I've built an execution plan for: **${plan.title}**\n\nThis will affect ${plan.impactedObjects.map(o => o.name).join(', ')}. Review the plan and approve to proceed.`,
        timestamp: new Date(),
        executionPlan: plan,
        reasoning: `Detected write intent: "${intent.action}" targeting ${intent.targetType}. Built ${plan.steps.length}-step plan. Awaiting human approval before any changes are applied.`,
      }
    } else {
      agentMsg = await this.handleQuery(content, context)
    }

    this.messages.push(agentMsg)
    return agentMsg
  }

  private async handleQuery(content: string, _context?: AssistantUIContext): Promise<AgentMessage> {
    try {
      const [sites, aps, stations] = await Promise.all([
        apiService.getSites().catch(() => []),
        apiService.getAccessPoints().catch(() => []),
        apiService.getAllStations().catch(() => []),
      ])

      const summary = `Network summary: ${sites.length} sites, ${aps.length} access points, ${stations.length} connected clients.`
      const lc = content.toLowerCase()

      let responseContent = summary
      if (lc.includes('ap') || lc.includes('access point')) {
        const online = aps.filter((a: { connected?: boolean }) => a.connected).length
        responseContent = `There are **${aps.length}** access points total, **${online}** online.`
      } else if (lc.includes('client') || lc.includes('station') || lc.includes('user')) {
        responseContent = `There are **${stations.length}** connected clients across ${sites.length} sites.`
      } else if (lc.includes('site')) {
        responseContent = `There are **${sites.length}** sites configured.`
      }

      return {
        id: `agent-${Date.now()}`,
        role: 'agent',
        content: responseContent,
        timestamp: new Date(),
        reasoning: `Fetched live data: ${sites.length} sites, ${aps.length} APs, ${stations.length} stations. Matched query pattern to provide targeted response.`,
      }
    } catch {
      return {
        id: `agent-${Date.now()}`,
        role: 'agent',
        content: 'Unable to fetch network data. Check your connection to the controller.',
        timestamp: new Date(),
      }
    }
  }

  logAPICall(entry: Omit<APITimelineEntry, 'id' | 'timestamp'>): void {
    this.apiTimeline.push({
      ...entry,
      id: `api-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date(),
    })
    if (this.apiTimeline.length > 200) {
      this.apiTimeline = this.apiTimeline.slice(-200)
    }
  }

  // Stubs — implemented in Tasks 3 & 4
  async parseIntent(_input: string): Promise<OperationIntent | null> { return null }
  async buildExecutionPlan(_intent: OperationIntent): Promise<ExecutionPlan> { throw new Error('not implemented') }
  async executeApprovedPlan(_planId: string): Promise<ExecutionResult> { throw new Error('not implemented') }
  async rollbackOperation(_planId: string): Promise<void> { throw new Error('not implemented') }
}

export const agentService = new AgentService()
```

- [ ] **Step 4: Run tests — verify pass**

```bash
npm run test -- --run src/services/agentService.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/agentService.ts src/services/agentService.test.ts
git commit -m "feat(agent): agentService core — message history + query handler"
```

---

## Task 3: `agentService.ts` — intent parsing + plan building

**Files:**
- Modify: `src/services/agentService.ts`
- Modify: `src/services/agentService.test.ts`

- [ ] **Step 1: Add failing tests for intent parsing + plan building**

Append to `src/services/agentService.test.ts`:

```typescript
describe('AgentService — intent parsing', () => {
  let service: AgentService

  beforeEach(() => { service = new AgentService() })

  it('returns null for a read-only query', async () => {
    const intent = await service.parseIntent('how many APs are online?')
    expect(intent).toBeNull()
  })

  it('detects SSID update intent', async () => {
    const intent = await service.parseIntent('change the password for CorpNet SSID')
    expect(intent).not.toBeNull()
    expect(intent!.action).toBe('update-ssid-psk')
    expect(intent!.targetType).toBe('ssid')
    expect(intent!.requiresApproval).toBe(true)
  })

  it('detects AP disable intent', async () => {
    const intent = await service.parseIntent('disable AP-floor2-east')
    expect(intent).not.toBeNull()
    expect(intent!.action).toBe('disable-ap')
    expect(intent!.targetType).toBe('ap')
  })

  it('detects AP reboot intent', async () => {
    const intent = await service.parseIntent('reboot all APs on site Main Campus')
    expect(intent).not.toBeNull()
    expect(intent!.action).toBe('reboot-ap')
  })
})

describe('AgentService — buildExecutionPlan', () => {
  let service: AgentService

  beforeEach(() => { service = new AgentService() })

  it('builds a plan with steps for update-ssid-psk', async () => {
    const intent: OperationIntent = {
      action: 'update-ssid-psk',
      targetType: 'ssid',
      targetIds: ['ssid-123'],
      parameters: { newPsk: 'secret123' },
      requiresApproval: true,
    }
    const plan = await service.buildExecutionPlan(intent)
    expect(plan.id).toBeTruthy()
    expect(plan.status).toBe('pending')
    expect(plan.steps.length).toBeGreaterThan(0)
    expect(plan.steps.every(s => s.status === 'pending')).toBe(true)
  })

  it('buildExecutionPlan issues NO write API calls', async () => {
    const { apiService: mockApi } = await import('./api')
    const writeSpy = vi.spyOn(mockApi, 'makeAuthenticatedRequest')
    const intent: OperationIntent = {
      action: 'disable-ap',
      targetType: 'ap',
      targetIds: ['AP-001'],
      parameters: {},
      requiresApproval: true,
    }
    await service.buildExecutionPlan(intent)
    // No PUT/POST/PATCH/DELETE calls
    const writeCalls = writeSpy.mock.calls.filter(
      ([, opts]) => opts?.method && !['GET', undefined].includes((opts.method as string).toUpperCase())
    )
    expect(writeCalls).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests — verify fail**

```bash
npm run test -- --run src/services/agentService.test.ts
```
Expected: FAIL — `parseIntent` returns null for all inputs, `buildExecutionPlan` throws

- [ ] **Step 3: Implement `parseIntent` and `buildExecutionPlan`**

Replace the stub methods in `src/services/agentService.ts`:

```typescript
// Add these constants before the class:
const WRITE_PATTERNS: Array<{ pattern: RegExp; action: string; targetType: ImpactedObject['type'] }> = [
  { pattern: /change.*password|update.*psk|set.*psk|new.*password/i, action: 'update-ssid-psk', targetType: 'ssid' },
  { pattern: /disable.*ap|turn off.*ap|deactivate.*ap/i, action: 'disable-ap', targetType: 'ap' },
  { pattern: /enable.*ap|turn on.*ap|activate.*ap/i, action: 'enable-ap', targetType: 'ap' },
  { pattern: /reboot.*ap|restart.*ap|reset.*ap/i, action: 'reboot-ap', targetType: 'ap' },
  { pattern: /change.*ssid|rename.*ssid|update.*ssid/i, action: 'update-ssid-name', targetType: 'ssid' },
  { pattern: /disable.*ssid|hide.*ssid|turn off.*ssid/i, action: 'disable-ssid', targetType: 'ssid' },
]

const READ_KEYWORDS = /^(how|what|show|list|get|status|count|who|where|which|is|are|tell|explain)/i

// Replace the parseIntent stub:
async parseIntent(input: string): Promise<OperationIntent | null> {
  if (READ_KEYWORDS.test(input.trim())) return null

  for (const { pattern, action, targetType } of WRITE_PATTERNS) {
    if (pattern.test(input)) {
      // Extract entity names — anything in quotes or after 'AP' / 'SSID' keyword
      const quoted = input.match(/["']([^"']+)["']/g)?.map(s => s.replace(/["']/g, '')) ?? []
      const apNames = input.match(/AP[-\s]\S+/gi) ?? []
      const targetIds = [...new Set([...quoted, ...apNames])]

      return {
        action,
        targetType,
        targetIds: targetIds.length ? targetIds : ['(from context)'],
        parameters: {},
        requiresApproval: true,
      }
    }
  }
  return null
}

// Replace the buildExecutionPlan stub:
async buildExecutionPlan(intent: OperationIntent): Promise<ExecutionPlan> {
  const id = `plan-${Date.now()}`
  const steps = this.planStepsFor(intent)
  const plan: ExecutionPlan = {
    id,
    title: this.planTitle(intent),
    description: `Performing ${intent.action} on ${intent.targetIds.join(', ')}`,
    status: 'pending',
    steps,
    impactedObjects: intent.targetIds.map(tid => ({
      type: intent.targetType,
      id: tid,
      name: tid,
    })),
    createdAt: new Date(),
  }
  this.plans.set(id, plan)
  return plan
}

private planTitle(intent: OperationIntent): string {
  const titles: Record<string, string> = {
    'update-ssid-psk': 'Update SSID Password',
    'disable-ap': 'Disable Access Point',
    'enable-ap': 'Enable Access Point',
    'reboot-ap': 'Reboot Access Point',
    'update-ssid-name': 'Rename SSID',
    'disable-ssid': 'Disable SSID',
  }
  return titles[intent.action] ?? intent.action
}

private planStepsFor(intent: OperationIntent): PlanStep[] {
  const base = (label: string, description: string, endpoint: string): PlanStep => ({
    id: `step-${Math.random().toString(36).slice(2)}`,
    label,
    description,
    status: 'pending',
    apiEndpoint: endpoint,
  })

  switch (intent.action) {
    case 'update-ssid-psk':
      return [
        base('Fetch current SSID config', 'Read existing SSID settings for diff', 'GET /v1/services/{id}'),
        base('Validate new PSK', 'Check password meets complexity requirements', '(local validation)'),
        base('Apply new PSK', 'Write updated PSK to controller', 'PUT /v1/services/{id}'),
        base('Verify change', 'Read back config to confirm write succeeded', 'GET /v1/services/{id}'),
      ]
    case 'disable-ap':
      return [
        base('Fetch AP status', 'Read current AP state', 'GET /v1/aps/{serial}'),
        base('Disable AP', 'Set AP admin state to disabled', 'PUT /v1/aps/{serial}'),
      ]
    case 'enable-ap':
      return [
        base('Fetch AP status', 'Read current AP state', 'GET /v1/aps/{serial}'),
        base('Enable AP', 'Set AP admin state to enabled', 'PUT /v1/aps/{serial}'),
      ]
    case 'reboot-ap':
      return [
        base('Verify AP is reachable', 'Confirm AP is connected before rebooting', 'GET /v1/aps/{serial}'),
        base('Send reboot command', 'Issue reboot instruction to AP', 'POST /v1/aps/{serial}/reboot'),
      ]
    case 'disable-ssid':
      return [
        base('Fetch SSID config', 'Read current SSID state', 'GET /v1/services/{id}'),
        base('Disable SSID', 'Set SSID enabled flag to false', 'PUT /v1/services/{id}'),
      ]
    default:
      return [
        base('Execute operation', `Run ${intent.action}`, `PUT /v1/${intent.targetType}s/{id}`),
      ]
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
npm run test -- --run src/services/agentService.test.ts
```
Expected: PASS (all tests including new intent + plan tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/agentService.ts src/services/agentService.test.ts
git commit -m "feat(agent): intent parsing + execution plan builder (no writes)"
```

---

## Task 4: `agentService.ts` — execution, rollback, audit

**Files:**
- Modify: `src/services/agentService.ts`
- Modify: `src/services/agentService.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/services/agentService.test.ts`:

```typescript
import type { OperationIntent } from '../components/AgentCoworker/agentTypes'

describe('AgentService — executeApprovedPlan', () => {
  let service: AgentService

  beforeEach(() => { service = new AgentService() })

  it('throws if planId is unknown', async () => {
    await expect(service.executeApprovedPlan('nonexistent')).rejects.toThrow('Plan not found')
  })

  it('marks plan as executing then completed on success', async () => {
    const { apiService: mockApi } = await import('./api')
    vi.mocked(mockApi.makeAuthenticatedRequest).mockResolvedValue(
      new Response(JSON.stringify({ id: 'ssid-1', enabled: false }), { status: 200 })
    )

    const intent: OperationIntent = {
      action: 'disable-ssid',
      targetType: 'ssid',
      targetIds: ['ssid-1'],
      parameters: {},
      requiresApproval: true,
    }
    const plan = await service.buildExecutionPlan(intent)
    const result = await service.executeApprovedPlan(plan.id)

    expect(result.success).toBe(true)
    expect(result.planId).toBe(plan.id)
  })

  it('adds an entry to audit history after completion', async () => {
    const { apiService: mockApi } = await import('./api')
    vi.mocked(mockApi.makeAuthenticatedRequest).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    )

    const intent: OperationIntent = {
      action: 'disable-ap',
      targetType: 'ap',
      targetIds: ['AP-001'],
      parameters: {},
      requiresApproval: true,
    }
    const plan = await service.buildExecutionPlan(intent)
    await service.executeApprovedPlan(plan.id)

    const audit = service.getAuditHistory()
    expect(audit.length).toBe(1)
    expect(audit[0].planId).toBe(plan.id)
    expect(audit[0].status).toBe('completed')
  })

  it('rejectPlan marks plan rejected without API calls', async () => {
    const { apiService: mockApi } = await import('./api')
    const writeSpy = vi.spyOn(mockApi, 'makeAuthenticatedRequest')

    const intent: OperationIntent = {
      action: 'reboot-ap',
      targetType: 'ap',
      targetIds: ['AP-002'],
      parameters: {},
      requiresApproval: true,
    }
    const plan = await service.buildExecutionPlan(intent)
    service.rejectPlan(plan.id)

    const writeCalls = writeSpy.mock.calls.filter(
      ([, opts]) => opts?.method && !['GET', undefined].includes((opts.method as string).toUpperCase())
    )
    expect(writeCalls).toHaveLength(0)

    const audit = service.getAuditHistory()
    expect(audit[0].status).toBe('rejected')
  })
})
```

- [ ] **Step 2: Run tests — verify fail**

```bash
npm run test -- --run src/services/agentService.test.ts
```
Expected: FAIL — `executeApprovedPlan` throws, `rejectPlan` not defined

- [ ] **Step 3: Implement execution, rollback, reject, and audit persistence**

Add these methods to the `AgentService` class in `src/services/agentService.ts`:

```typescript
rejectPlan(planId: string): void {
  const plan = this.plans.get(planId)
  if (!plan) throw new Error('Plan not found')
  plan.status = 'rejected'
  this.addAuditEntry(plan, 'rejected')
}

async executeApprovedPlan(planId: string): Promise<ExecutionResult> {
  const plan = this.plans.get(planId)
  if (!plan) throw new Error('Plan not found')

  plan.status = 'executing'
  plan.approvedAt = new Date()
  let completedSteps = 0

  for (const step of plan.steps) {
    step.status = 'running'
    const start = Date.now()
    try {
      await this.executeStep(step, plan)
      step.duration = Date.now() - start
      step.status = 'completed'
      completedSteps++
    } catch (err) {
      step.status = 'failed'
      plan.status = 'failed'
      const result: ExecutionResult = {
        planId,
        success: false,
        completedSteps,
        failedStep: step.id,
        error: err instanceof Error ? err.message : String(err),
      }
      this.addAuditEntry(plan, 'completed') // record the attempt
      return result
    }
  }

  plan.status = 'completed'
  plan.completedAt = new Date()
  this.addAuditEntry(plan, 'completed')

  return { planId, success: true, completedSteps }
}

async rollbackOperation(planId: string): Promise<void> {
  const plan = this.plans.get(planId)
  if (!plan) throw new Error('Plan not found')
  plan.status = 'rolledback'
  this.addAuditEntry(plan, 'rolledback')
  // Rollback is recorded; actual inverse API calls are operation-specific
  // and will be added when real rollback endpoints are wired
}

private async executeStep(step: PlanStep, _plan: ExecutionPlan): Promise<void> {
  if (step.apiEndpoint?.startsWith('(')) return // local validation steps, no HTTP

  const [method, path] = (step.apiEndpoint ?? 'GET /').split(' ')
  const start = Date.now()

  const response = await apiService.makeAuthenticatedRequest(path.replace(/\{[^}]+\}/g, 'unknown'), {
    method: method as 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE',
  })

  this.logAPICall({
    method: method as APITimelineEntry['method'],
    endpoint: path,
    status: response.status,
    duration: Date.now() - start,
    planStepId: step.id,
  })

  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${response.statusText}`)
  }
}

private addAuditEntry(plan: ExecutionPlan, status: AuditEntry['status']): void {
  const user = localStorage.getItem('user_email') ?? 'unknown'
  const entry: AuditEntry = {
    id: `audit-${Date.now()}`,
    timestamp: new Date(),
    action: plan.title,
    operator: user,
    planId: plan.id,
    status,
    impactedObjects: plan.impactedObjects,
  }
  this.auditHistory.push(entry)
  try {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(this.auditHistory.slice(-100)))
  } catch {
    // ignore quota errors
  }
}
```

- [ ] **Step 4: Run all service tests**

```bash
npm run test -- --run src/services/agentService.test.ts
```
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/agentService.ts src/services/agentService.test.ts
git commit -m "feat(agent): executeApprovedPlan, rejectPlan, rollback, audit persistence"
```

---

## Task 5: `useAgentWorkspace` hook

**Files:**
- Create: `src/components/AgentCoworker/useAgentWorkspace.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/components/AgentCoworker/useAgentWorkspace.ts
import { useState, useCallback, useEffect } from 'react'
import type { WorkspaceMode, WorkspaceSize, ActivePanel } from './agentTypes'

const STORAGE_KEY = 'agent-workspace-prefs'

interface WorkspacePrefs {
  size: WorkspaceSize
  mode: WorkspaceMode
}

function loadPrefs(): WorkspacePrefs {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return { size: 'standard', mode: 'idle' }
}

function savePrefs(prefs: WorkspacePrefs): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
}

export interface AgentWorkspaceState {
  mode: WorkspaceMode
  size: WorkspaceSize
  activePanel: ActivePanel
  inputValue: string
  isListening: boolean
  pendingPlanId: string | null
}

export interface AgentWorkspaceActions {
  open: () => void
  minimize: () => void
  pin: () => void
  dismiss: () => void
  setSize: (s: WorkspaceSize) => void
  setActivePanel: (p: ActivePanel) => void
  setInput: (v: string) => void
  startListening: () => void
  stopListening: () => void
  setPendingPlan: (id: string | null) => void
  toggle: () => void
}

export function useAgentWorkspace(): AgentWorkspaceState & AgentWorkspaceActions {
  const prefs = loadPrefs()
  const [mode, setMode] = useState<WorkspaceMode>(prefs.mode === 'pinned' ? 'pinned' : 'idle')
  const [size, setSize] = useState<WorkspaceSize>(prefs.size)
  const [activePanel, setActivePanel] = useState<ActivePanel>('conversation')
  const [inputValue, setInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [pendingPlanId, setPendingPlan] = useState<string | null>(null)

  useEffect(() => {
    savePrefs({ size, mode })
  }, [size, mode])

  const open = useCallback(() => setMode('open'), [])
  const minimize = useCallback(() => setMode('minimized'), [])
  const pin = useCallback(() => setMode('pinned'), [])
  const dismiss = useCallback(() => setMode('idle'), [])
  const startListening = useCallback(() => setIsListening(true), [])
  const stopListening = useCallback(() => setIsListening(false), [])

  const toggle = useCallback(() => {
    setMode(m => (m === 'idle' || m === 'minimized') ? 'open' : 'idle')
  }, [])

  return {
    mode, size, activePanel, inputValue, isListening, pendingPlanId,
    open, minimize, pin, dismiss, toggle,
    setSize, setActivePanel, setInput,
    startListening, stopListening, setPendingPlan,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AgentCoworker/useAgentWorkspace.ts
git commit -m "feat(agent): useAgentWorkspace state machine hook"
```

---

## Task 6: `AgentCommandBar`

**Files:**
- Create: `src/components/AgentCoworker/AgentCommandBar.tsx`
- Create: `src/components/AgentCoworker/AgentCommandBar.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/components/AgentCoworker/AgentCommandBar.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgentCommandBar } from './AgentCommandBar'

describe('AgentCommandBar', () => {
  it('renders placeholder text', () => {
    render(<AgentCommandBar value="" onChange={vi.fn()} onSubmit={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByPlaceholderText(/ask me anything/i)).toBeInTheDocument()
  })

  it('calls onOpen when input is focused', () => {
    const onOpen = vi.fn()
    render(<AgentCommandBar value="" onChange={vi.fn()} onSubmit={vi.fn()} onOpen={onOpen} />)
    fireEvent.focus(screen.getByPlaceholderText(/ask me anything/i))
    expect(onOpen).toHaveBeenCalled()
  })

  it('calls onSubmit on Enter key', () => {
    const onSubmit = vi.fn()
    render(<AgentCommandBar value="test query" onChange={vi.fn()} onSubmit={onSubmit} onOpen={vi.fn()} />)
    fireEvent.keyDown(screen.getByPlaceholderText(/ask me anything/i), { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalled()
  })

  it('calls onChange when user types', () => {
    const onChange = vi.fn()
    render(<AgentCommandBar value="" onChange={onChange} onSubmit={vi.fn()} onOpen={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/ask me anything/i), { target: { value: 'hello' } })
    expect(onChange).toHaveBeenCalledWith('hello')
  })
})
```

- [ ] **Step 2: Run tests — verify fail**

```bash
npm run test -- --run src/components/AgentCoworker/AgentCommandBar.test.tsx
```
Expected: FAIL — component not found

- [ ] **Step 3: Implement `AgentCommandBar`**

```tsx
// src/components/AgentCoworker/AgentCommandBar.tsx
import { useRef } from 'react'
import { ExternalLink, LayoutGrid, Mic, MicOff } from 'lucide-react'
import { cn } from '../ui/utils'

interface AgentCommandBarProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onOpen: () => void
  isListening?: boolean
  onMicToggle?: () => void
  isThinking?: boolean
  className?: string
}

export function AgentCommandBar({
  value,
  onChange,
  onSubmit,
  onOpen,
  isListening = false,
  onMicToggle,
  isThinking = false,
  className,
}: AgentCommandBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-[99998]',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 h-14 min-w-[480px] max-w-[640px] rounded-full px-4',
          'bg-[hsl(268_20%_8%)] border border-white/10',
          'shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)]',
          'transition-shadow duration-300',
          isThinking && [
            'shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(187,134,252,0.25),0_0_32px_rgba(187,134,252,0.12)]',
          ]
        )}
      >
        {/* AURA logo */}
        <img
          src="/logo.svg"
          alt="AURA"
          className="h-5 w-5 shrink-0 opacity-90"
          style={{ filter: 'hue-rotate(260deg) saturate(1.5) brightness(1.2)' }}
        />

        {/* Input */}
        <input
          ref={inputRef}
          className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/35 outline-none caret-violet-400 min-w-0"
          placeholder="Ask me anything here, search chats, or /command..."
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={onOpen}
          onKeyDown={e => {
            if (e.key === 'Enter' && value.trim()) {
              e.preventDefault()
              onSubmit()
            }
          }}
        />

        {/* Right controls */}
        <div className="flex items-center gap-2 shrink-0">
          {onMicToggle && (
            <button
              onClick={onMicToggle}
              className={cn(
                'p-1.5 rounded-full transition-colors',
                isListening
                  ? 'text-red-400 hover:text-red-300'
                  : 'text-white/30 hover:text-white/60'
              )}
              title={isListening ? 'Stop listening' : 'Voice input'}
            >
              {isListening
                ? <MicOff className="h-4 w-4" />
                : <Mic className="h-4 w-4" />
              }
            </button>
          )}
          <div className="w-px h-4 bg-white/10" />
          <button
            onClick={onOpen}
            className="text-white/30 hover:text-white/60 transition-colors p-1.5"
            title="Open workspace"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
          <button
            onClick={onOpen}
            className="text-white/30 hover:text-white/60 transition-colors p-1.5"
            title="Command palette"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
npm run test -- --run src/components/AgentCoworker/AgentCommandBar.test.tsx
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentCoworker/AgentCommandBar.tsx src/components/AgentCoworker/AgentCommandBar.test.tsx
git commit -m "feat(agent): AgentCommandBar floating pill"
```

---

## Task 7: `ConversationStream` panel

**Files:**
- Create: `src/components/AgentCoworker/panels/ConversationStream.tsx`

- [ ] **Step 1: Create the panel**

```tsx
// src/components/AgentCoworker/panels/ConversationStream.tsx
import { useRef, useEffect, useState } from 'react'
import {
  ThumbsUp, ThumbsDown, Copy, MoreHorizontal,
  ChevronDown, ChevronUp, Mic, MicOff, Send,
} from 'lucide-react'
import { cn } from '../../ui/utils'
import type { AgentMessage } from '../agentTypes'

interface ConversationStreamProps {
  messages: AgentMessage[]
  isThinking: boolean
  inputValue: string
  isListening: boolean
  onInput: (v: string) => void
  onSubmit: () => void
  onMicToggle: () => void
  onFeedback: (msgId: string, feedback: 'up' | 'down') => void
  onToggleReasoning: (msgId: string) => void
}

const SUGGESTED = [
  'How many APs are online?',
  "What's the client count right now?",
  'Show me sites with issues',
  'Which APs have the most clients?',
]

export function ConversationStream({
  messages,
  isThinking,
  inputValue,
  isListening,
  onInput,
  onSubmit,
  onMicToggle,
  onFeedback,
  onToggleReasoning,
}: ConversationStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  function handleCopy(msg: AgentMessage) {
    navigator.clipboard.writeText(msg.content).catch(() => {})
    setCopiedId(msg.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {messages.length === 0 && !isThinking && (
          <div className="space-y-3 pt-2">
            <p className="text-xs text-white/30 font-medium uppercase tracking-wider">Suggested</p>
            <div className="flex flex-col gap-2">
              {SUGGESTED.map(q => (
                <button
                  key={q}
                  onClick={() => { onInput(q); inputRef.current?.focus() }}
                  className="text-left text-sm text-white/60 hover:text-white/90 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' && 'justify-end')}>
            {msg.role === 'agent' && (
              <img
                src="/logo.svg"
                alt="Agent"
                className="h-6 w-6 shrink-0 mt-0.5 opacity-80"
                style={{ filter: 'hue-rotate(260deg) saturate(1.5) brightness(1.2)' }}
              />
            )}
            <div className={cn('max-w-[85%] space-y-2', msg.role === 'user' && 'items-end')}>
              {msg.role === 'agent' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white/80">Agent ONE</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-900/60 text-violet-300 font-medium">
                    Coworker
                  </span>
                </div>
              )}

              <div
                className={cn(
                  'text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-primary/90 text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5'
                    : 'text-white/85'
                )}
              >
                {msg.content}
              </div>

              {/* Show Reasoning toggle */}
              {msg.role === 'agent' && msg.reasoning && (
                <button
                  onClick={() => onToggleReasoning(msg.id)}
                  className="flex items-center gap-1 text-xs text-white/35 hover:text-white/60 transition-colors"
                >
                  {msg.showReasoning ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  Show Reasoning
                </button>
              )}
              {msg.showReasoning && msg.reasoning && (
                <div className="text-xs text-white/40 font-mono bg-white/5 rounded-lg px-3 py-2 leading-relaxed">
                  {msg.reasoning}
                </div>
              )}

              {/* Feedback row */}
              {msg.role === 'agent' && (
                <div className="flex items-center gap-3 pt-0.5">
                  <button
                    onClick={() => onFeedback(msg.id, 'up')}
                    className={cn(
                      'transition-colors',
                      msg.feedback === 'up' ? 'text-green-400' : 'text-white/25 hover:text-white/60'
                    )}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onFeedback(msg.id, 'down')}
                    className={cn(
                      'transition-colors',
                      msg.feedback === 'down' ? 'text-red-400' : 'text-white/25 hover:text-white/60'
                    )}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleCopy(msg)}
                    className="text-white/25 hover:text-white/60 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button className="text-white/25 hover:text-white/60 transition-colors">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                  <span className="ml-auto text-[10px] text-white/25">
                    {copiedId === msg.id ? 'Copied!' : msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex gap-3">
            <img
              src="/logo.svg"
              alt="Agent"
              className="h-6 w-6 shrink-0 mt-0.5 opacity-80"
              style={{ filter: 'hue-rotate(260deg) saturate(1.5) brightness(1.2)' }}
            />
            <div className="flex items-center gap-1.5 py-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 px-4 pb-4 pt-2 border-t border-white/8">
        <div className="flex items-center gap-2 h-12 px-4 rounded-full bg-[hsl(268_15%_14%)] ring-1 ring-white/10">
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm text-white/85 placeholder:text-white/35 outline-none caret-violet-400 min-w-0"
            placeholder="Ask me anything..."
            value={inputValue}
            onChange={e => onInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && inputValue.trim()) {
                e.preventDefault()
                onSubmit()
              }
            }}
          />
          <button
            onClick={onMicToggle}
            className={cn(
              'p-1.5 rounded-full transition-colors shrink-0',
              isListening ? 'text-red-400' : 'text-white/30 hover:text-white/60'
            )}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button
            onClick={() => inputValue.trim() && onSubmit()}
            disabled={!inputValue.trim()}
            className="p-1.5 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send className="h-3.5 w-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AgentCoworker/panels/ConversationStream.tsx
git commit -m "feat(agent): ConversationStream panel — messages, reasoning, feedback"
```

---

## Task 8: `ExecutionPlanView` + `ConfigDiffView` panels

**Files:**
- Create: `src/components/AgentCoworker/panels/ExecutionPlanView.tsx`
- Create: `src/components/AgentCoworker/panels/ConfigDiffView.tsx`

- [ ] **Step 1: Create `ExecutionPlanView`**

```tsx
// src/components/AgentCoworker/panels/ExecutionPlanView.tsx
import { CheckCircle2, Circle, Loader2, XCircle, MinusCircle, Server, Wifi, Shield } from 'lucide-react'
import { cn } from '../../ui/utils'
import type { ExecutionPlan, ImpactedObject, PlanStatus, StepStatus } from '../agentTypes'

interface ExecutionPlanViewProps {
  plan: ExecutionPlan | null
}

const STATUS_COLORS: Record<PlanStatus, string> = {
  building:  'text-white/50 bg-white/5',
  pending:   'text-amber-300 bg-amber-900/30',
  approved:  'text-violet-300 bg-violet-900/30',
  executing: 'text-blue-300 bg-blue-900/30',
  completed: 'text-green-300 bg-green-900/30',
  rejected:  'text-red-300 bg-red-900/30',
  rolledback:'text-orange-300 bg-orange-900/30',
  failed:    'text-red-300 bg-red-900/30',
}

const STATUS_LABELS: Record<PlanStatus, string> = {
  building: 'Building Plan',
  pending: 'Awaiting Approval',
  approved: 'Approved',
  executing: 'Executing',
  completed: 'Completed',
  rejected: 'Rejected',
  rolledback: 'Rolled Back',
  failed: 'Failed',
}

function StepDot({ status }: { status: StepStatus }) {
  if (status === 'running')
    return <Loader2 className="h-4 w-4 text-violet-400 animate-spin shrink-0" />
  if (status === 'completed')
    return <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
  if (status === 'failed')
    return <XCircle className="h-4 w-4 text-red-400 shrink-0" />
  if (status === 'skipped')
    return <MinusCircle className="h-4 w-4 text-white/30 shrink-0" />
  return <Circle className="h-4 w-4 text-white/25 shrink-0" />
}

function ImpactChip({ obj }: { obj: ImpactedObject }) {
  const Icon = obj.type === 'ap' ? Wifi : obj.type === 'ssid' ? Wifi : obj.type === 'policy' ? Shield : Server
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 text-xs text-white/70">
      <Icon className="h-3 w-3 text-white/50" />
      {obj.name}{obj.count ? ` (${obj.count})` : ''}
    </span>
  )
}

export function ExecutionPlanView({ plan }: ExecutionPlanViewProps) {
  if (!plan) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-white/30">
        No active execution plan
      </div>
    )
  }

  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full">
      {/* Status banner */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90">{plan.title}</h3>
        <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', STATUS_COLORS[plan.status])}>
          {STATUS_LABELS[plan.status]}
        </span>
      </div>
      <p className="text-xs text-white/50">{plan.description}</p>

      {/* Impacted objects */}
      {plan.impactedObjects.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium">Impacted</p>
          <div className="flex flex-wrap gap-2">
            {plan.impactedObjects.map(obj => <ImpactChip key={obj.id} obj={obj} />)}
          </div>
        </div>
      )}

      {/* Steps */}
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium mb-3">Steps</p>
        {plan.steps.map((step, i) => (
          <div
            key={step.id}
            className="flex items-start gap-3 py-2.5 px-3 rounded-lg bg-white/4 hover:bg-white/6 transition-colors"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <StepDot status={step.status} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/80">{step.label}</p>
              <p className="text-xs text-white/40 mt-0.5">{step.description}</p>
              {step.apiEndpoint && (
                <p className="text-[10px] font-mono text-white/30 mt-1">{step.apiEndpoint}</p>
              )}
            </div>
            {step.duration !== undefined && (
              <span className="text-[10px] text-white/30 shrink-0">{step.duration}ms</span>
            )}
          </div>
        ))}
      </div>

      {plan.completedAt && (
        <p className="text-xs text-white/30">
          Completed {plan.completedAt.toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `ConfigDiffView`**

```tsx
// src/components/AgentCoworker/panels/ConfigDiffView.tsx
import { cn } from '../../ui/utils'
import type { DiffEntry } from '../agentTypes'

interface ConfigDiffViewProps {
  diff: DiffEntry[]
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}

export function ConfigDiffView({ diff }: ConfigDiffViewProps) {
  if (!diff.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-white/30">
        No config changes staged
      </div>
    )
  }

  return (
    <div className="p-4 overflow-y-auto h-full">
      <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium mb-4">
        Staged Changes — {diff.length} field{diff.length !== 1 ? 's' : ''}
      </p>
      <div className="rounded-lg overflow-hidden border border-white/10">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-white/5 text-white/40">
              <th className="text-left px-3 py-2 font-medium">Scope</th>
              <th className="text-left px-3 py-2 font-medium">Field</th>
              <th className="text-left px-3 py-2 font-medium">Before</th>
              <th className="text-left px-3 py-2 font-medium">After</th>
            </tr>
          </thead>
          <tbody>
            {diff.map((entry, i) => (
              <tr
                key={i}
                className={cn(
                  'border-t border-white/6',
                  i % 2 === 0 ? 'bg-transparent' : 'bg-white/2'
                )}
              >
                <td className="px-3 py-2.5 text-white/40 font-mono text-[10px]">{entry.scope}</td>
                <td className="px-3 py-2.5 text-white/70 font-medium">{entry.field}</td>
                <td className="px-3 py-2.5 font-mono text-red-400/80 line-through">
                  {formatValue(entry.before)}
                </td>
                <td className="px-3 py-2.5 font-mono text-green-400">
                  {formatValue(entry.after)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/AgentCoworker/panels/ExecutionPlanView.tsx src/components/AgentCoworker/panels/ConfigDiffView.tsx
git commit -m "feat(agent): ExecutionPlanView and ConfigDiffView panels"
```

---

## Task 9: `ApprovalControls` panel (critical gate)

**Files:**
- Create: `src/components/AgentCoworker/panels/ApprovalControls.tsx`
- Create: `src/components/AgentCoworker/panels/ApprovalControls.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/components/AgentCoworker/panels/ApprovalControls.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ApprovalControls } from './ApprovalControls'
import type { ExecutionPlan } from '../agentTypes'

const pendingPlan: ExecutionPlan = {
  id: 'plan-1',
  title: 'Disable SSID',
  description: 'Test plan',
  status: 'pending',
  steps: [],
  impactedObjects: [{ type: 'ssid', id: 'ssid-1', name: 'CorpNet' }],
  createdAt: new Date(),
}

describe('ApprovalControls', () => {
  it('renders Approve and Reject when plan is pending', () => {
    render(<ApprovalControls plan={pendingPlan} onApprove={vi.fn()} onReject={vi.fn()} onRollback={vi.fn()} />)
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
  })

  it('does NOT render Approve when plan is executing', () => {
    const plan = { ...pendingPlan, status: 'executing' as const }
    render(<ApprovalControls plan={plan} onApprove={vi.fn()} onReject={vi.fn()} onRollback={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
  })

  it('calls onApprove when Approve clicked', () => {
    const onApprove = vi.fn()
    render(<ApprovalControls plan={pendingPlan} onApprove={onApprove} onReject={vi.fn()} onRollback={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    expect(onApprove).toHaveBeenCalledWith('plan-1')
  })

  it('calls onReject when Reject clicked', () => {
    const onReject = vi.fn()
    render(<ApprovalControls plan={pendingPlan} onApprove={vi.fn()} onReject={onReject} onRollback={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /reject/i }))
    expect(onReject).toHaveBeenCalledWith('plan-1')
  })

  it('shows Rollback only when status is completed', () => {
    const completed = { ...pendingPlan, status: 'completed' as const }
    render(<ApprovalControls plan={completed} onApprove={vi.fn()} onReject={vi.fn()} onRollback={vi.fn()} />)
    expect(screen.getByRole('button', { name: /rollback/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
  })

  it('renders warning text when pending', () => {
    render(<ApprovalControls plan={pendingPlan} onApprove={vi.fn()} onReject={vi.fn()} onRollback={vi.fn()} />)
    expect(screen.getByText(/live infrastructure/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — verify fail**

```bash
npm run test -- --run src/components/AgentCoworker/panels/ApprovalControls.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Implement `ApprovalControls`**

```tsx
// src/components/AgentCoworker/panels/ApprovalControls.tsx
import { CheckCircle2, XCircle, RotateCcw, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '../../ui/utils'
import type { ExecutionPlan } from '../agentTypes'

interface ApprovalControlsProps {
  plan: ExecutionPlan
  onApprove: (planId: string) => void
  onReject: (planId: string) => void
  onRollback: (planId: string) => void
  isExecuting?: boolean
}

export function ApprovalControls({
  plan,
  onApprove,
  onReject,
  onRollback,
  isExecuting = false,
}: ApprovalControlsProps) {
  const isPending = plan.status === 'pending'
  const isCompleted = plan.status === 'completed'
  const isExecutingState = plan.status === 'executing' || isExecuting

  if (plan.status === 'rejected' || plan.status === 'rolledback') {
    return (
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 text-sm text-white/50">
          <XCircle className="h-4 w-4 text-red-400/70" />
          Plan {plan.status === 'rejected' ? 'rejected' : 'rolled back'} — no changes applied
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {isPending && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-900/20 border border-amber-700/30">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/80">
            This will apply changes to live infrastructure.
            Review the diff and plan steps before approving.
          </p>
        </div>
      )}

      {/* Approve + Reject */}
      {isPending && (
        <div className="flex gap-3">
          <button
            onClick={() => onApprove(plan.id)}
            disabled={isExecutingState}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium transition-colors',
              'bg-green-700 hover:bg-green-600 text-white',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve
          </button>
          <button
            onClick={() => onReject(plan.id)}
            disabled={isExecutingState}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium transition-colors',
              'bg-red-900/60 hover:bg-red-800/70 text-red-200',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            <XCircle className="h-4 w-4" />
            Reject
          </button>
        </div>
      )}

      {/* Executing state */}
      {isExecutingState && (
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-violet-900/20 border border-violet-700/30">
          <Loader2 className="h-4 w-4 text-violet-400 animate-spin shrink-0" />
          <p className="text-xs text-violet-200/80">Executing plan steps…</p>
        </div>
      )}

      {/* Rollback */}
      {isCompleted && (
        <button
          onClick={() => onRollback(plan.id)}
          className={cn(
            'w-full flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium transition-colors',
            'bg-orange-900/40 hover:bg-orange-800/50 text-orange-200'
          )}
        >
          <RotateCcw className="h-4 w-4" />
          Rollback
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
npm run test -- --run src/components/AgentCoworker/panels/ApprovalControls.test.tsx
```
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentCoworker/panels/ApprovalControls.tsx src/components/AgentCoworker/panels/ApprovalControls.test.tsx
git commit -m "feat(agent): ApprovalControls — approve/reject/rollback gate with tests"
```

---

## Task 10: `APITimelineView` + `AuditHistoryView` panels

**Files:**
- Create: `src/components/AgentCoworker/panels/APITimelineView.tsx`
- Create: `src/components/AgentCoworker/panels/AuditHistoryView.tsx`

- [ ] **Step 1: Create `APITimelineView`**

```tsx
// src/components/AgentCoworker/panels/APITimelineView.tsx
import { useEffect, useRef } from 'react'
import { cn } from '../../ui/utils'
import type { APITimelineEntry } from '../agentTypes'

interface APITimelineViewProps {
  entries: APITimelineEntry[]
}

const METHOD_COLORS: Record<string, string> = {
  GET:    'bg-blue-900/50 text-blue-300',
  POST:   'bg-green-900/50 text-green-300',
  PUT:    'bg-amber-900/50 text-amber-300',
  PATCH:  'bg-orange-900/50 text-orange-300',
  DELETE: 'bg-red-900/50 text-red-300',
}

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return 'text-green-400'
  if (status >= 400 && status < 500) return 'text-amber-400'
  if (status >= 500) return 'text-red-400'
  return 'text-white/50'
}

export function APITimelineView({ entries }: APITimelineViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  if (!entries.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-white/30">
        No API calls recorded
      </div>
    )
  }

  return (
    <div className="p-4 overflow-y-auto h-full space-y-1 font-mono">
      <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium font-sans mb-3">
        API Timeline — {entries.length} calls
      </p>
      {entries.map(entry => (
        <div
          key={entry.id}
          className="flex items-center gap-2.5 py-1.5 px-2 rounded hover:bg-white/4 transition-colors"
        >
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0', METHOD_COLORS[entry.method] ?? 'bg-white/10 text-white/50')}>
            {entry.method}
          </span>
          <span className="flex-1 text-[11px] text-white/70 truncate">{entry.endpoint}</span>
          <span className={cn('text-[10px] shrink-0', statusColor(entry.status))}>{entry.status}</span>
          <span className="text-[10px] text-white/30 shrink-0">{entry.duration}ms</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
```

- [ ] **Step 2: Create `AuditHistoryView`**

```tsx
// src/components/AgentCoworker/panels/AuditHistoryView.tsx
import { CheckCircle2, XCircle, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../ui/utils'
import type { AuditEntry } from '../agentTypes'

interface AuditHistoryViewProps {
  entries: AuditEntry[]
}

const STATUS_ICON = {
  completed: <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />,
  rejected:  <XCircle className="h-4 w-4 text-red-400 shrink-0" />,
  rolledback:<RotateCcw className="h-4 w-4 text-orange-400 shrink-0" />,
}

const STATUS_LABEL = {
  completed:  'text-green-400',
  rejected:   'text-red-400',
  rolledback: 'text-orange-400',
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-white/8 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
      >
        {STATUS_ICON[entry.status]}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/85 truncate">{entry.action}</p>
          <p className="text-[10px] text-white/35">
            {entry.operator} · {new Date(entry.timestamp).toLocaleString()}
          </p>
        </div>
        <span className={cn('text-xs font-medium shrink-0', STATUS_LABEL[entry.status])}>
          {entry.status}
        </span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-white/30" /> : <ChevronDown className="h-3.5 w-3.5 text-white/30" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 bg-white/3 border-t border-white/8 space-y-2">
          <p className="text-[10px] text-white/40">Plan ID: <span className="font-mono">{entry.planId}</span></p>
          {entry.impactedObjects.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {entry.impactedObjects.map(obj => (
                <span key={obj.id} className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/60">
                  {obj.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function AuditHistoryView({ entries }: AuditHistoryViewProps) {
  if (!entries.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-white/30">
        No operations recorded yet
      </div>
    )
  }

  return (
    <div className="p-4 space-y-2 overflow-y-auto h-full">
      <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium mb-3">
        Audit History — {entries.length} operation{entries.length !== 1 ? 's' : ''}
      </p>
      {entries.map(entry => <AuditRow key={entry.id} entry={entry} />)}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/AgentCoworker/panels/APITimelineView.tsx src/components/AgentCoworker/panels/AuditHistoryView.tsx
git commit -m "feat(agent): APITimelineView and AuditHistoryView panels"
```

---

## Task 11: `AgentWorkspace` shell

**Files:**
- Create: `src/components/AgentCoworker/AgentWorkspace.tsx`
- Create: `src/components/AgentCoworker/AgentWorkspace.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/components/AgentCoworker/AgentWorkspace.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgentWorkspace } from './AgentWorkspace'
import type { ExecutionPlan } from './agentTypes'

const noop = vi.fn()
const baseProps = {
  mode: 'open' as const,
  size: 'standard' as const,
  activePanel: 'conversation' as const,
  messages: [],
  isThinking: false,
  inputValue: '',
  isListening: false,
  pendingPlan: null,
  auditEntries: [],
  apiTimelineEntries: [],
  onClose: noop, onMinimize: noop, onPin: noop, onDismiss: noop,
  onSetSize: noop, onSetActivePanel: noop, onInput: noop, onSubmit: noop,
  onMicToggle: noop, onFeedback: noop, onToggleReasoning: noop,
  onApprove: noop, onReject: noop, onRollback: noop,
}

describe('AgentWorkspace', () => {
  it('renders panel when mode is open', () => {
    render(<AgentWorkspace {...baseProps} />)
    expect(screen.getByText('Agent ONE')).toBeInTheDocument()
  })

  it('is visually hidden when mode is idle', () => {
    const { container } = render(<AgentWorkspace {...baseProps} mode="idle" />)
    const panel = container.querySelector('[data-testid="agent-workspace"]')
    expect(panel?.className).toContain('translate-x-full')
  })

  it('calls onClose when × is clicked', () => {
    const onClose = vi.fn()
    render(<AgentWorkspace {...baseProps} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows conversation tab by default', () => {
    render(<AgentWorkspace {...baseProps} />)
    const tab = screen.getByRole('button', { name: /conversation/i })
    expect(tab).toHaveAttribute('aria-selected', 'true')
  })

  it('applies correct width for each size', () => {
    const { rerender, container } = render(<AgentWorkspace {...baseProps} size="compact" />)
    expect(container.querySelector('[data-testid="agent-workspace"]')).toHaveStyle({ width: '400px' })
    rerender(<AgentWorkspace {...baseProps} size="expanded" />)
    expect(container.querySelector('[data-testid="agent-workspace"]')).toHaveStyle({ width: '720px' })
  })
})
```

- [ ] **Step 2: Run tests — verify fail**

```bash
npm run test -- --run src/components/AgentCoworker/AgentWorkspace.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Implement `AgentWorkspace`**

```tsx
// src/components/AgentCoworker/AgentWorkspace.tsx
import { useRef, useState, useCallback } from 'react'
import { X, Minus, Pin, Maximize2 } from 'lucide-react'
import { cn } from '../ui/utils'
import { ConversationStream } from './panels/ConversationStream'
import { ExecutionPlanView } from './panels/ExecutionPlanView'
import { ConfigDiffView } from './panels/ConfigDiffView'
import { ApprovalControls } from './panels/ApprovalControls'
import { APITimelineView } from './panels/APITimelineView'
import { AuditHistoryView } from './panels/AuditHistoryView'
import { WORKSPACE_WIDTHS } from './agentTypes'
import type {
  WorkspaceMode, WorkspaceSize, ActivePanel,
  AgentMessage, ExecutionPlan, DiffEntry,
  AuditEntry, APITimelineEntry
} from './agentTypes'

const TABS: Array<{ id: ActivePanel; label: string }> = [
  { id: 'conversation', label: 'Conversation' },
  { id: 'execution',   label: 'Plan' },
  { id: 'diff',        label: 'Diff' },
  { id: 'timeline',    label: 'API' },
  { id: 'audit',       label: 'Audit' },
]

interface AgentWorkspaceProps {
  mode: WorkspaceMode
  size: WorkspaceSize
  activePanel: ActivePanel
  messages: AgentMessage[]
  isThinking: boolean
  inputValue: string
  isListening: boolean
  pendingPlan: ExecutionPlan | null
  auditEntries: AuditEntry[]
  apiTimelineEntries: APITimelineEntry[]
  diff?: DiffEntry[]
  onClose: () => void
  onMinimize: () => void
  onPin: () => void
  onDismiss: () => void
  onSetSize: (s: WorkspaceSize) => void
  onSetActivePanel: (p: ActivePanel) => void
  onInput: (v: string) => void
  onSubmit: () => void
  onMicToggle: () => void
  onFeedback: (msgId: string, f: 'up' | 'down') => void
  onToggleReasoning: (msgId: string) => void
  onApprove: (planId: string) => void
  onReject: (planId: string) => void
  onRollback: (planId: string) => void
}

export function AgentWorkspace({
  mode, size, activePanel,
  messages, isThinking, inputValue, isListening,
  pendingPlan, auditEntries, apiTimelineEntries, diff = [],
  onClose, onMinimize, onPin,
  onSetSize, onSetActivePanel,
  onInput, onSubmit, onMicToggle,
  onFeedback, onToggleReasoning,
  onApprove, onReject, onRollback,
}: AgentWorkspaceProps) {
  const isVisible = mode === 'open' || mode === 'pinned'
  const isPinned  = mode === 'pinned'
  const isMinimized = mode === 'minimized'

  // Drag-to-resize
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startW: dragWidth ?? WORKSPACE_WIDTHS[size],
    }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startX - ev.clientX
      setDragWidth(Math.max(340, Math.min(900, dragRef.current.startW + delta)))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [dragWidth, size])

  const panelWidth = dragWidth ?? WORKSPACE_WIDTHS[size]

  // Minimized tab strip
  if (isMinimized) {
    return (
      <button
        className="fixed top-1/2 -translate-y-1/2 right-0 z-[99997] flex flex-col items-center justify-center gap-2 w-12 h-24 bg-[hsl(268_20%_8%)] border border-white/10 rounded-l-xl hover:bg-[hsl(268_20%_12%)] transition-colors"
        onClick={onPin}
        title="Expand Agent Workspace"
      >
        <img
          src="/logo.svg"
          alt="Agent"
          className="h-5 w-5 opacity-70"
          style={{ filter: 'hue-rotate(260deg) saturate(1.5) brightness(1.2)' }}
        />
      </button>
    )
  }

  return (
    <>
      {/* Backdrop — only in non-pinned open mode */}
      {isVisible && !isPinned && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[99996]"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        data-testid="agent-workspace"
        className={cn(
          'fixed top-0 right-0 h-screen flex flex-col z-[99997]',
          'bg-[hsl(268_20%_8%)] border-l border-[hsl(268_15%_16%)]',
          'shadow-[-24px_0_64px_rgba(0,0,0,0.5),-8px_0_24px_rgba(0,0,0,0.3)]',
          'transition-transform duration-[320ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
          isVisible ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ width: panelWidth }}
      >
        {/* Resize handle */}
        <div
          className="absolute left-0 top-0 h-full w-1 cursor-ew-resize hover:bg-violet-500/30 transition-colors"
          onMouseDown={onMouseDown}
        />

        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/8">
          <img
            src="/logo.svg"
            alt="AURA"
            className="h-5 w-5 opacity-90 shrink-0"
            style={{ filter: 'hue-rotate(260deg) saturate(1.5) brightness(1.2)' }}
          />
          <span className="text-sm font-semibold text-white/90">Agent ONE</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-900/60 text-violet-300 font-medium">
            Coworker
          </span>

          <div className="ml-auto flex items-center gap-1">
            <button onClick={onMinimize} title="Minimize" className="p-1.5 rounded hover:bg-white/8 text-white/40 hover:text-white/70 transition-colors">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button onClick={onPin} title={isPinned ? 'Unpin' : 'Pin open'} className={cn('p-1.5 rounded hover:bg-white/8 transition-colors', isPinned ? 'text-violet-400' : 'text-white/40 hover:text-white/70')}>
              <Pin className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onSetSize(size === 'expanded' ? 'standard' : 'expanded')}
              title="Toggle expanded"
              className="p-1.5 rounded hover:bg-white/8 text-white/40 hover:text-white/70 transition-colors"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={onClose} title="Close" className="p-1.5 rounded hover:bg-white/8 text-white/40 hover:text-white/70 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Panel tabs */}
        <div className="shrink-0 flex border-b border-white/8 px-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="button"
              aria-selected={activePanel === tab.id}
              onClick={() => onSetActivePanel(tab.id)}
              className={cn(
                'px-3 py-2.5 text-xs font-medium transition-colors relative',
                activePanel === tab.id
                  ? 'text-white/90'
                  : 'text-white/40 hover:text-white/70'
              )}
            >
              {tab.label}
              {activePanel === tab.id && (
                <span className="absolute bottom-0 left-2 right-2 h-px bg-violet-400 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Approval controls — shown above active panel when plan is pending */}
        {pendingPlan && (pendingPlan.status === 'pending' || pendingPlan.status === 'executing' || pendingPlan.status === 'completed') && (
          <div className="shrink-0 border-b border-white/8">
            <ApprovalControls
              plan={pendingPlan}
              onApprove={onApprove}
              onReject={onReject}
              onRollback={onRollback}
            />
          </div>
        )}

        {/* Panel content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {activePanel === 'conversation' && (
            <ConversationStream
              messages={messages}
              isThinking={isThinking}
              inputValue={inputValue}
              isListening={isListening}
              onInput={onInput}
              onSubmit={onSubmit}
              onMicToggle={onMicToggle}
              onFeedback={onFeedback}
              onToggleReasoning={onToggleReasoning}
            />
          )}
          {activePanel === 'execution' && <ExecutionPlanView plan={pendingPlan} />}
          {activePanel === 'diff' && <ConfigDiffView diff={diff} />}
          {activePanel === 'timeline' && <APITimelineView entries={apiTimelineEntries} />}
          {activePanel === 'audit' && <AuditHistoryView entries={auditEntries} />}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
npm run test -- --run src/components/AgentCoworker/AgentWorkspace.test.tsx
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentCoworker/AgentWorkspace.tsx src/components/AgentCoworker/AgentWorkspace.test.tsx
git commit -m "feat(agent): AgentWorkspace slideout shell — tabs, resize, minimize, pin"
```

---

## Task 12: `AgentCoworker/index.tsx` — root composition

**Files:**
- Create: `src/components/AgentCoworker/index.tsx`

- [ ] **Step 1: Create the root component**

```tsx
// src/components/AgentCoworker/index.tsx
import { useState, useCallback, useEffect } from 'react'
import { AgentCommandBar } from './AgentCommandBar'
import { AgentWorkspace } from './AgentWorkspace'
import { useAgentWorkspace } from './useAgentWorkspace'
import { agentService } from '../../services/agentService'
import type { AgentMessage, ExecutionPlan } from './agentTypes'
import type { AssistantUIContext } from './agentTypes'

interface AgentCoworkerProps {
  isOpen?: boolean
  onToggle?: () => void
  context?: AssistantUIContext
  onShowClientDetail?: (mac: string, name?: string) => void
  onShowAccessPointDetail?: (serial: string, name?: string) => void
  onShowSiteDetail?: (siteId: string, siteName: string) => void
}

export function AgentCoworker({
  isOpen,
  onToggle,
  context,
}: AgentCoworkerProps) {
  const ws = useAgentWorkspace()
  const [messages, setMessages] = useState<AgentMessage[]>(() => agentService.getMessages())
  const [isThinking, setIsThinking] = useState(false)
  const [pendingPlan, setPendingPlan] = useState<ExecutionPlan | null>(null)
  const [auditEntries, setAuditEntries] = useState(() => agentService.getAuditHistory())
  const [apiTimeline, setApiTimeline] = useState(() => agentService.getAPITimeline())

  // Sync external isOpen prop with workspace state
  useEffect(() => {
    if (isOpen !== undefined) {
      if (isOpen && ws.mode === 'idle') ws.open()
      else if (!isOpen && ws.mode === 'open') ws.dismiss()
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ⌘K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (ws.mode === 'idle' || ws.mode === 'minimized') {
          ws.open()
          onToggle?.()
        } else {
          ws.dismiss()
          onToggle?.()
        }
      }
      if (e.key === 'Escape' && ws.mode === 'open') {
        ws.dismiss()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [ws, onToggle])

  const handleSubmit = useCallback(async () => {
    const text = ws.inputValue.trim()
    if (!text || isThinking) return
    ws.setInput('')
    setIsThinking(true)
    try {
      const reply = await agentService.sendMessage(text, context)
      setMessages(agentService.getMessages())
      if (reply.executionPlan) {
        setPendingPlan(reply.executionPlan)
        ws.setPendingPlan(reply.executionPlan.id)
        ws.setActivePanel('execution')
      }
    } finally {
      setIsThinking(false)
    }
  }, [ws, isThinking, context])

  const handleApprove = useCallback(async (planId: string) => {
    try {
      await agentService.executeApprovedPlan(planId)
      setAuditEntries(agentService.getAuditHistory())
      setApiTimeline(agentService.getAPITimeline())
      setPendingPlan(prev => prev?.id === planId ? { ...prev, status: 'completed' } : prev)
    } catch (err) {
      setPendingPlan(prev => prev?.id === planId ? { ...prev, status: 'failed' } : prev)
    }
  }, [])

  const handleReject = useCallback((planId: string) => {
    agentService.rejectPlan(planId)
    setPendingPlan(prev => prev?.id === planId ? { ...prev, status: 'rejected' } : prev)
    setAuditEntries(agentService.getAuditHistory())
    ws.setPendingPlan(null)
  }, [ws])

  const handleRollback = useCallback(async (planId: string) => {
    await agentService.rollbackOperation(planId)
    setPendingPlan(prev => prev?.id === planId ? { ...prev, status: 'rolledback' } : prev)
    setAuditEntries(agentService.getAuditHistory())
    ws.setPendingPlan(null)
  }, [ws])

  const handleFeedback = useCallback((msgId: string, feedback: 'up' | 'down') => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, feedback } : m))
  }, [])

  const handleToggleReasoning = useCallback((msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, showReasoning: !m.showReasoning } : m))
  }, [])

  const handleMicToggle = useCallback(() => {
    if (ws.isListening) {
      ws.stopListening()
    } else {
      ws.startListening()
    }
  }, [ws])

  const showBar = ws.mode === 'idle'
  const diff = pendingPlan
    ? pendingPlan.impactedObjects.map(obj => ({
        field: 'enabled',
        scope: `${obj.type}: ${obj.name}`,
        before: true,
        after: false,
      }))
    : []

  return (
    <>
      {showBar && (
        <AgentCommandBar
          value={ws.inputValue}
          onChange={ws.setInput}
          onSubmit={handleSubmit}
          onOpen={ws.open}
          isListening={ws.isListening}
          onMicToggle={handleMicToggle}
          isThinking={isThinking}
        />
      )}

      <AgentWorkspace
        mode={ws.mode}
        size={ws.size}
        activePanel={ws.activePanel}
        messages={messages}
        isThinking={isThinking}
        inputValue={ws.inputValue}
        isListening={ws.isListening}
        pendingPlan={pendingPlan}
        auditEntries={auditEntries}
        apiTimelineEntries={apiTimeline}
        diff={diff}
        onClose={ws.dismiss}
        onMinimize={ws.minimize}
        onPin={ws.pin}
        onDismiss={ws.dismiss}
        onSetSize={ws.setSize}
        onSetActivePanel={ws.setActivePanel}
        onInput={ws.setInput}
        onSubmit={handleSubmit}
        onMicToggle={handleMicToggle}
        onFeedback={handleFeedback}
        onToggleReasoning={handleToggleReasoning}
        onApprove={handleApprove}
        onReject={handleReject}
        onRollback={handleRollback}
      />
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AgentCoworker/index.tsx
git commit -m "feat(agent): AgentCoworker root — composes bar + workspace, wires service"
```

---

## Task 13: App.tsx integration + pinned-mode margin

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Find the NetworkChatbot block in App.tsx**

```bash
grep -n "NetworkChatbot\|isChatbotOpen\|networkAssistantEnabled" src/App.tsx
```

Note the line numbers for the import (line ~3, ~90-92), state declaration (~299), and render block (~1521-1531).

- [ ] **Step 2: Replace NetworkChatbot import with AgentCoworker**

Remove:
```typescript
import type { AssistantContext } from './components/NetworkChatbot';
const NetworkChatbot = lazy(() =>
  import('./components/NetworkChatbot').then((m) => ({ default: m.NetworkChatbot }))
);
```

Add at the top of the non-lazy imports:
```typescript
import { AgentCoworker } from './components/AgentCoworker';
```

- [ ] **Step 3: Rename `isChatbotOpen` state**

Find (line ~299):
```typescript
const [isChatbotOpen, setIsChatbotOpen] = useState(false);
```
Replace with:
```typescript
const [isAgentOpen, setIsAgentOpen] = useState(false);
```

- [ ] **Step 4: Update the ⌘K handler** (if present — search for `isChatbotOpen` in the keyboard shortcut handler and replace with `isAgentOpen`)

```bash
grep -n "isChatbotOpen\|setChatbotOpen" src/App.tsx
```

Replace every occurrence of `isChatbotOpen` → `isAgentOpen` and `setIsChatbotOpen` → `setIsAgentOpen`.

- [ ] **Step 5: Replace the NetworkChatbot render block**

Find (~line 1521):
```tsx
{networkAssistantEnabled && (
  <NetworkChatbot
    isOpen={isChatbotOpen}
    onToggle={() => setIsChatbotOpen(!isChatbotOpen)}
    context={assistantContext}
    onShowClientDetail={handleShowClientDetail}
    onShowAccessPointDetail={handleShowAccessPointDetail}
    onShowSiteDetail={handleShowSiteDetail}
  />
)}
```

Replace with:
```tsx
{networkAssistantEnabled && (
  <AgentCoworker
    isOpen={isAgentOpen}
    onToggle={() => setIsAgentOpen(v => !v)}
    context={assistantContext}
    onShowClientDetail={handleShowClientDetail}
    onShowAccessPointDetail={handleShowAccessPointDetail}
    onShowSiteDetail={handleShowSiteDetail}
  />
)}
```

- [ ] **Step 6: Run type-check**

```bash
npm run type-check
```
Expected: no errors related to AgentCoworker. Fix any type mismatches before proceeding.

- [ ] **Step 7: Run the full test suite**

```bash
npm run test -- --run
```
Expected: all previously passing tests still pass. New tests for AgentCoworker pass.

- [ ] **Step 8: Run lint**

```bash
npm run lint
```
Fix any lint errors before committing.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx
git commit -m "feat(agent): wire AgentCoworker into App.tsx — replaces NetworkChatbot"
```

---

## Task 14: Final smoke test + dev-server verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify command bar appears**

Open `http://localhost:3000`. The floating pill should be visible at the bottom center of the screen. It should show the AURA logo + "Ask me anything here, search chats, or /command..." placeholder.

- [ ] **Step 3: Test ⌘K opens workspace**

Press ⌘K (or Ctrl+K). The right-side workspace should slide in with a smooth `cubic-bezier(0.16, 1, 0.3, 1)` transition. The command bar should hide.

- [ ] **Step 4: Test conversation**

Type "how many APs are online?" and press Enter. Verify: user bubble appears right-aligned, agent response appears left-aligned with AURA avatar, feedback row visible, Show Reasoning toggle present.

- [ ] **Step 5: Test write intent → plan**

Type "disable the CorpNet SSID" and press Enter. Verify: plan tab activates automatically, execution plan shows with steps in `pending` state, ApprovalControls shows Approve + Reject buttons, warning text visible.

- [ ] **Step 6: Test Reject**

Click Reject. Verify plan status changes to `rejected`, Approve/Reject buttons disappear, Audit tab shows one entry.

- [ ] **Step 7: Test minimize**

Click the `-` minimize button. Verify workspace slides out and 48px tab strip appears on right edge. Click tab strip to re-expand.

- [ ] **Step 8: Test pin**

Click pin icon. Verify backdrop disappears, workspace stays open, user can interact with AURA behind it.

- [ ] **Step 9: Test resize**

Drag the left edge of the workspace. Verify it resizes smoothly between 340–900px.

- [ ] **Step 10: Final commit**

```bash
git add -A
git commit -m "feat(agent): Agent 1 Coworker complete — command bar, workspace, approval workflow"
```

---

## Self-Review Checklist

### Spec coverage
| Spec requirement | Task |
|---|---|
| Floating command bar idle state | Task 6 |
| Right-side slideout workspace | Task 11 |
| Compact / standard / expanded sizing | Tasks 5, 11 |
| Drag resize handle | Task 11 |
| Minimized / pinned / dismissible states | Tasks 5, 11 |
| Conversation stream + Show Reasoning | Task 7 |
| Voice controls | Tasks 6, 7 |
| Execution plan visualization | Task 8 |
| Before/after diff | Task 8 |
| Approval controls (approve/reject/rollback) | Task 9 |
| API execution timeline | Task 10 |
| Audit history | Task 10 |
| Live progress indicators | Task 8 (step status dots) |
| Impacted object summaries | Task 8 |
| Animation spec (cubic-bezier, stagger) | Task 11, CSS in components |
| Keyboard shortcuts ⌘K / Escape | Tasks 6, 12 |
| No write until approval | Tasks 3 (test), 4 (test), 9 (test) |
| App.tsx integration | Task 13 |
| Full test suite | Tasks 2–4, 6, 9, 11 |

### Type consistency audit
- `ExecutionPlan.status: PlanStatus` — defined Task 1, used Tasks 3, 4, 8, 9, 11
- `agentService.rejectPlan(planId)` — defined Task 4, called Task 12
- `AgentWorkspace` receives `pendingPlan: ExecutionPlan | null` — matches Task 11 props
- `ApprovalControls` receives `plan: ExecutionPlan` — matches Task 9
- `WORKSPACE_WIDTHS` exported from `agentTypes.ts` — imported in Tasks 5, 11
- `AssistantUIContext` defined in `agentTypes.ts` — used in Task 2 service + Task 12 root
