# Cortex: Page-Aware AI Network Operations Copilot

**Specification Version:** 1.0  
**Date:** 2026-05-18  
**Status:** Design Phase  
**Replaces:** Agent 1 Coworker (renamed → Cortex)

---

## Overview

Cortex is a page-aware, LLM-powered AI copilot embedded in AURA. Unlike generic chatbots, Cortex understands the current UI page, what data the user is viewing, what objects are selected, available actions, and organizational context. It provides proactive insights, predicts user intent, supports multi-turn conversations, generates configuration change plans with human approval gates, and connects to pluggable LLM providers (OpenAI, Azure, Anthropic, local models).

**Key Principle:** Cortex must never invent data, commit changes without approval, or send secrets to the LLM.

---

## Architecture

### 1. Frontend: Cortex Context Provider

#### CortexContextProvider

A React Context Provider that captures and exposes the current page state:

```typescript
type CortexPageContext = {
  route: string;                           // /clients, /devices, /insights, etc.
  pageName: string;                        // "Wireless Clients", "Access Points", etc.
  pageType: "insights" | "service-levels" | "clients" | "devices" | "configuration"
            | "roles" | "wlans" | "profiles" | "dashboard" | "unknown";
  
  // Org & Site Context
  orgId?: string;
  orgName?: string;
  siteId?: string;
  siteName?: string;
  
  // User Context
  userRole?: string;
  permissions?: string[];
  
  // Time Range (if applicable to page)
  timeRange?: {
    label: string;                         // "Last 24 hours", "Last 7 days", etc.
    start: string;                         // ISO 8601
    end: string;                           // ISO 8601
  };
  
  // Filter & Sort State
  filters?: Record<string, any>;           // {"status": "online", "type": "ap"}
  sorting?: Record<string, any>;           // {"column": "name", "direction": "asc"}
  
  // Selected Data
  selectedObject?: any;                    // Single selected AP, Client, WLAN, etc.
  selectedRows?: any[];                    // Multi-select from table
  visibleRowsSummary?: {
    rowCount: number;
    columns: string[];
    sampleRows: any[];                     // First 5–10 rows, not all 10k
    aggregateStats?: Record<string, any>;  // {"online": 95, "offline": 5}
  };
  
  // Page Metadata
  pageMetadata?: Record<string, any>;      // Custom page state
  
  // Available Page Actions
  availableActions?: {
    id: string;
    label: string;                         // "Add SSID", "Disable AP", "Reboot"
    type: "read" | "write" | "navigation" | "config-preview" | "config-commit";
    requiresConfirmation?: boolean;
  }[];
};
```

#### useCortexContext() Hook

```typescript
interface UseCortexContextReturn {
  context: CortexPageContext;
  updateContext(partial: Partial<CortexPageContext>): void;
  setSelectedObject(obj: any): void;
  setSelectedRows(rows: any[]): void;
  setVisibleRows(rows: any[]): void;
  setPageMetadata(meta: Record<string, any>): void;
  setAvailableActions(actions: CortexPageContext['availableActions']): void;
  resetContext(): void;
}

const useCortexContext = (): UseCortexContextReturn => { ... }
```

**Integration Points:**
- Wrapped at `<App>` level in `App.tsx`
- Updated whenever page route changes
- Updated when user selects rows, applies filters, changes sort, or selects an object
- Passed to `useCortex()` hook for session context enrichment

---

### 2. Frontend: Cortex UI & Hooks

#### useCortex() Hook

```typescript
interface UseCortexReturn {
  isOpen: boolean;
  openCortex(): void;
  closeCortex(): void;
  toggleCortex(): void;
  
  sessionId: string | null;
  messages: CortexMessage[];
  suggestedPrompts: string[];
  pageInsights: CortexPageAnalysis['insights'];
  isThinking: boolean;
  
  sendMessage(message: string): Promise<void>;
  refreshPageAnalysis(): Promise<void>;
  clearConversation(): void;
  
  pendingApproval?: {
    changeId: string;
    changePlan: CortexChangePlan;
    diff: CortexConfigDiff;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  approveChange(changeId: string): Promise<void>;
  rejectChange(changeId: string): void;
}

type CortexMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: Date;
  reasoning?: string;
  toolCalls?: {
    id: string;
    name: string;
    status: 'pending' | 'executing' | 'completed' | 'failed';
    args?: Record<string, any>;
    result?: any;
  }[];
};

type CortexPageAnalysis = {
  summary: string;
  insights: {
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description: string;
    evidence?: string[];
    recommendedAction?: string;
  }[];
  suggestedPrompts: string[];
  availableActions: string[];
};

type CortexChangePlan = {
  id: string;
  title: string;
  description: string;
  steps: {
    id: string;
    action: string;
    scope: { type: string; ids: string[] };
    config: Record<string, any>;
    validation?: { rule: string; expectedResult: string }[];
  }[];
  rollbackInstructions?: string;
  estimatedImpact?: { scope: string; count: number }[];
};

type CortexConfigDiff = {
  objectType: string;
  objectId: string;
  changes: {
    field: string;
    before: unknown;
    after: unknown;
  }[];
};
```

#### Cortex UI Component

Right-side slide-out panel:
- Opens from right edge (like AgentCoworker/AgentWorkspace)
- Shows proactive page analysis on first open
- Supports conversational chat
- Shows suggested prompts based on page context
- Displays tool activity progress
- Shows change plans and diffs before commit
- Requires human approval for any write action

**Key Difference from AgentCoworker:** Cortex is *page-aware* and *action-aware*. It shows suggested prompts relevant to the current page and available actions, not generic "ask anything" prompts.

---

### 3. Frontend API Client Functions

```typescript
// src/services/cortexClient.ts

export async function createCortexSession(context: CortexPageContext): Promise<{ sessionId: string }>;

export async function sendCortexMessage(
  sessionId: string,
  message: string,
  context: CortexPageContext,
): Promise<CortexMessage>;

export async function refreshCortexContext(
  sessionId: string,
  context: CortexPageContext,
): Promise<CortexPageAnalysis>;

export async function executeCortexToolCall(
  sessionId: string,
  toolName: string,
  args: Record<string, any>,
): Promise<{ result: any; displayText: string }>;

export async function previewCortexConfigChange(
  sessionId: string,
  changePlan: CortexChangePlan,
): Promise<{
  changeId: string;
  diff: CortexConfigDiff[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  warnings?: string[];
}>;

export async function commitCortexConfigChange(
  sessionId: string,
  changeId: string,
): Promise<{ success: boolean; auditEntry: any }>;
```

---

### 4. Backend: REST Endpoints

```
POST   /api/cortex/session
       Body: { context: CortexPageContext }
       Response: { sessionId: string, sessionToken: string }

POST   /api/cortex/message
       Headers: { Authorization: sessionToken }
       Body: { message: string, context: CortexPageContext }
       Response: { message: CortexMessage, suggestedPrompts: string[] }

POST   /api/cortex/context
       Headers: { Authorization: sessionToken }
       Body: { context: CortexPageContext }
       Response: { analysis: CortexPageAnalysis }

POST   /api/cortex/tool-call
       Headers: { Authorization: sessionToken }
       Body: { toolName: string, args: Record<string, any> }
       Response: { result: any, displayText: string }

POST   /api/cortex/config/preview
       Headers: { Authorization: sessionToken }
       Body: { changePlan: CortexChangePlan }
       Response: {
         changeId: string,
         diff: CortexConfigDiff[],
         riskLevel: 'low'|'medium'|'high'|'critical',
         warnings?: string[]
       }

POST   /api/cortex/config/commit
       Headers: { Authorization: sessionToken }
       Body: { changeId: string }
       Response: { success: boolean, auditEntry: any }
```

---

### 5. Backend: LLM Provider Abstraction

#### LLM Types

```typescript
type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

type LlmMessage = {
  role: LlmRole;
  content: string;
  name?: string;                 // For tool messages
  toolCallId?: string;           // For tool responses
};

type LlmToolDefinition = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: unknown[];
    }>;
    required?: string[];
  };
};

type LlmResponse = {
  message: string;
  toolCalls?: {
    id: string;
    name: string;
    arguments: Record<string, any>;
  }[];
  raw?: any;                     // For debugging
};

interface LlmProvider {
  generateResponse(input: {
    model: string;
    messages: LlmMessage[];
    tools?: LlmToolDefinition[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<LlmResponse>;
}
```

#### Provider Implementations

**OpenAiLlmProvider** (primary implementation):
```typescript
class OpenAiLlmProvider implements LlmProvider {
  private apiKey: string;
  private model: string;
  
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY!;
    this.model = process.env.ULTRON_LLM_MODEL || 'gpt-4-1106-preview';
  }
  
  async generateResponse(input: ...): Promise<LlmResponse> {
    // Call OpenAI API
    // Parse response.choices[0].message
    // Extract tool_calls if present
    // Return LlmResponse
  }
}
```

**AzureOpenAiLlmProvider** (placeholder):
```typescript
class AzureOpenAiLlmProvider implements LlmProvider {
  // Uses AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT
  async generateResponse(input: ...): Promise<LlmResponse> {
    throw new Error('Not yet implemented');
  }
}
```

**AnthropicLlmProvider** (placeholder):
```typescript
class AnthropicLlmProvider implements LlmProvider {
  // Uses ANTHROPIC_API_KEY
  async generateResponse(input: ...): Promise<LlmResponse> {
    throw new Error('Not yet implemented');
  }
}
```

**MockLlmProvider** (for local development):
```typescript
class MockLlmProvider implements LlmProvider {
  async generateResponse(input: ...): Promise<LlmResponse> {
    // Return mock responses based on context
    // Do not call external APIs
    // Used when ULTRON_LLM_PROVIDER=mock
  }
}
```

#### Provider Factory

```typescript
function createLlmProvider(providerName: string): LlmProvider {
  switch (providerName) {
    case 'openai':
      return new OpenAiLlmProvider();
    case 'azure':
      return new AzureOpenAiLlmProvider();
    case 'anthropic':
      return new AnthropicLlmProvider();
    case 'mock':
      return new MockLlmProvider();
    default:
      throw new Error(`Unknown LLM provider: ${providerName}`);
  }
}
```

#### Environment Variables

```
# Required
ULTRON_LLM_PROVIDER=openai|azure|anthropic|mock
ULTRON_LLM_MODEL=gpt-4-1106-preview (for OpenAI)

# OpenAI
OPENAI_API_KEY=sk-...

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://....openai.azure.com/
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_DEPLOYMENT=...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

---

### 6. Backend: Cortex Orchestrator

#### CortexOrchestrator

```typescript
class CortexOrchestrator {
  private llmProvider: LlmProvider;
  private sessions: Map<string, CortexSession>;
  private contextEnricher: CortexContextEnricher;
  
  async createSession(context: CortexPageContext): Promise<CortexSession>;
  
  async receiveMessage(
    sessionId: string,
    userMessage: string,
    currentContext: CortexPageContext,
  ): Promise<CortexMessage>;
  
  async handleToolCall(
    sessionId: string,
    toolName: string,
    args: Record<string, any>,
  ): Promise<ToolCallResult>;
  
  async generateConfigChangePreview(
    sessionId: string,
    changePlan: CortexChangePlan,
  ): Promise<ConfigChangePreview>;
  
  async commitApprovedChange(
    sessionId: string,
    changeId: string,
  ): Promise<CommitResult>;
  
  private async buildSystemPrompt(context: CortexPageContext): Promise<string>;
  private async enrichContext(context: CortexPageContext): Promise<EnrichedContext>;
  private enforceUsageRateLimit(sessionId: string): void;
  private enforceOutputSanitization(response: LlmResponse): LlmResponse;
}

type CortexSession = {
  id: string;
  createdAt: Date;
  context: CortexPageContext;
  history: LlmMessage[];
  conversationHistory: CortexMessage[];
  tools: string[];                 // Tool names user can call in this session
  lastActivity: Date;
};
```

#### CortexContextEnricher

```typescript
class CortexContextEnricher {
  async enrich(context: CortexPageContext): Promise<EnrichedContext> {
    // Based on pageType, call backend APIs to summarize actual data
    // Do NOT send all raw data to LLM
    // Return summaries, stats, and sample data only
    
    switch (context.pageType) {
      case 'clients':
        return this.enrichClientsPage(context);
      case 'service-levels':
        return this.enrichServiceLevelsPage(context);
      case 'insights':
        return this.enrichInsightsPage(context);
      case 'devices':
        return this.enrichDevicesPage(context);
      case 'configuration':
        return this.enrichConfigurationPage(context);
      default:
        return context;
    }
  }
  
  private async enrichClientsPage(context: CortexPageContext): Promise<EnrichedContext> {
    // GET /api/clients/summary → client count, online/offline, poor SNR/RSSI
    // GET /api/clients/failures → auth failures, roaming issues
    // GET /api/clients/top-impacts → top impacted APs, sites
    // Return summary, NOT all 10k clients
  }
  
  private async enrichServiceLevelsPage(context: CortexPageContext): Promise<EnrichedContext> {
    // GET /api/service-levels → failing SLs, degraded metrics
    // GET /api/service-levels/{id}/impacted → impacted sites, clients
    // GET /api/service-levels/{id}/trends → direction, forecast
  }
  
  // ... other page types
}
```

---

### 7. System Prompt for Cortex

```
You are Cortex, an AI network operations and configuration copilot embedded in Extreme Platform ONE (AURA).

You are page-aware. You understand:
- The current page the user is viewing
- What data is selected or visible
- What filters and sorts are applied
- What site/org context the user is working in
- What role and permissions the user has
- What actions are available on this page

Your job is to:
1. Summarize what the user is viewing in context
2. Identify important issues or anomalies
3. Predict what the user likely wants to do next
4. Recommend useful next actions
5. Answer network operations questions conversationally
6. Call tools to fetch real data when needed
7. Generate safe configuration change plans when requested
8. Require explicit human approval before committing changes

Rules:
- Do not invent data. Only use provided page context, enriched backend summaries, tool results, and conversation history.
- If data is missing, say exactly what data is missing and why it matters.
- Do not commit configuration changes automatically. Always require explicit human review and approval.
- For write actions, generate a change plan, show before/after diff, and explain impact.
- Keep responses concise and operational. Prefer specific findings over generic advice.
- When on a specific page, make your response directly relevant to that page and available actions.
- Never expose secrets, passwords, or PII in responses.
- Prioritize safety, accuracy, and compliance.

Current Context:
{enrichedContext}

You have access to the following tools:
{toolList}

When the user asks for a configuration change:
1. Generate a detailed change plan with specific steps
2. Explain what will change and why
3. Show the before/after state
4. Identify potential risks or side effects
5. Do NOT commit automatically
6. Wait for explicit user approval
7. Only then call the commit tool

Keep your tone:
- Professional and operational
- Confident but not arrogant
- Helpful and predictive
- Safety-conscious
```

---

### 8. Tool Calling

#### Available Tools

```typescript
const ULTRON_TOOLS: LlmToolDefinition[] = [
  {
    name: 'getClientsSummary',
    description: 'Get a summary of wireless clients: count, online/offline, connection quality issues',
    parameters: {
      type: 'object',
      properties: {
        siteId: { type: 'string', description: 'Optional: filter by site' },
        filters: { type: 'object', description: 'Optional: additional filters' },
      },
    },
  },
  {
    name: 'getClientDetails',
    description: 'Get detailed info on a specific client: IP, SSID, AP, signal, authentication, roaming',
    parameters: {
      type: 'object',
      properties: {
        clientId: { type: 'string', description: 'Client MAC or ID' },
      },
      required: ['clientId'],
    },
  },
  {
    name: 'getServiceLevelSummary',
    description: 'Get service level status: which are degraded/failing, impacted sites/clients',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'getInsightsSummary',
    description: 'Get highest-severity insights and repeated issues',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max insights to return (default 10)' },
      },
    },
  },
  {
    name: 'getDeviceHealth',
    description: 'Get AP/controller health: offline devices, degraded state, firmware versions, alarms',
    parameters: {
      type: 'object',
      properties: {
        siteId: { type: 'string', description: 'Optional: filter by site' },
      },
    },
  },
  {
    name: 'getWlanConfig',
    description: 'Get WLAN (SSID) configuration, security, assignments, radio bindings',
    parameters: {
      type: 'object',
      properties: {
        wlanId: { type: 'string', description: 'WLAN/SSID ID' },
      },
      required: ['wlanId'],
    },
  },
  {
    name: 'getProfileConfig',
    description: 'Get AP or other profile configuration, inherited settings, overrides',
    parameters: {
      type: 'object',
      properties: {
        profileType: { type: 'string', enum: ['ap', 'service', 'firewall', 'wlan'], description: 'Profile type' },
        profileId: { type: 'string', description: 'Profile ID' },
      },
      required: ['profileType', 'profileId'],
    },
  },
  {
    name: 'getConfigDrift',
    description: 'Check if assigned configuration matches actual device state (drift detection)',
    parameters: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'Device ID' },
      },
      required: ['deviceId'],
    },
  },
  {
    name: 'generateConfigChangePlan',
    description: 'Generate a step-by-step configuration change plan based on user intent',
    parameters: {
      type: 'object',
      properties: {
        intent: { type: 'string', description: 'What the user wants to change (e.g., "increase channel width on 5GHz")' },
        scope: { type: 'string', description: 'Scope: "site", "device", "profile", "global"' },
        scopeIds: { type: 'array', items: { type: 'string' }, description: 'IDs affected' },
      },
      required: ['intent', 'scope'],
    },
  },
  {
    name: 'generateConfigDiff',
    description: 'Show before/after field-by-field diff for a proposed change',
    parameters: {
      type: 'object',
      properties: {
        changePlanId: { type: 'string', description: 'ID of the change plan' },
      },
      required: ['changePlanId'],
    },
  },
  {
    name: 'validateConfigRisk',
    description: 'Validate a config change for risks, conflicts, and side effects',
    parameters: {
      type: 'object',
      properties: {
        changePlanId: { type: 'string', description: 'ID of the change plan' },
      },
      required: ['changePlanId'],
    },
  },
];
```

#### Tool Classification

Every tool is classified:

```typescript
const TOOL_METADATA: Record<string, {
  readWrite: 'read' | 'write';
  requiresApproval: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}> = {
  getClientsSummary: { readWrite: 'read', requiresApproval: false, riskLevel: 'low' },
  // ... read tools don't require approval
  
  commitApprovedConfigChange: { readWrite: 'write', requiresApproval: true, riskLevel: 'high' },
  // ... write tools MUST have approval before execution
};
```

**Safety Rule:** Any tool with `readWrite: 'write'` or `requiresApproval: true` is blocked at the LLM layer. The LLM can *propose* tool calls, but the frontend must get explicit user approval before allowing the call to execute.

---

### 9. Proactive Page Analysis

When Cortex opens:

1. Frontend calls `POST /api/cortex/session` with current page context
2. Backend enriches context with real API data (via `CortexContextEnricher`)
3. Backend calls LLM with special system prompt: *"Analyze this page and user context. Provide: (1) A 2-3 sentence summary of what's on this page, (2) 3–5 key insights or issues, (3) 4–6 suggested prompts the user might ask, (4) 2–3 available next actions."*
4. Frontend receives `CortexPageAnalysis` and displays:
   - Summary paragraph
   - Insights with severity badges
   - Suggested prompts (clickable)
   - Available actions

#### Page Analysis Examples

**Clients Page:**
```
Summary: Viewing 412 wireless clients. 98% connected, 2% poor link quality.

Insights:
- [CRITICAL] 12 clients failing to authenticate on new WPA3 SSID
- [WARNING] 5 clients roaming excessively between APs
- [INFO] AP5020-01 handling 35% of load; consider load balancing

Suggested Prompts:
- "Why are these clients failing to authenticate?"
- "Which APs are causing the most client issues?"
- "Show me roaming patterns for this client."
- "What's the typical client density per AP?"

Available Actions:
- Add SSID
- Disable AP
- Trigger client reassociation
```

**Service Levels Page:**
```
Summary: Monitoring 8 service levels. 1 degraded, 7 passing.

Insights:
- [CRITICAL] Voice SL degraded: 94% uptime (SLA: 99.5%), impacting 45 users at Site-East
- [WARNING] Data SL trending down: 2 hours ago was 99.2%, now 98.1%
- [INFO] No issues detected in Guest SL

Suggested Prompts:
- "Why is Voice service degraded?"
- "Which site is causing the failure?"
- "Show me the last 24 hours of Voice SL metrics."
- "Create an action plan to recover Voice SL."

Available Actions:
- View detailed metrics
- Trigger diagnostics
- Escalate to engineering
```

---

### 10. Data Safety & Sanitization

#### Sanitizer Function

```typescript
function sanitizeCortexContext(context: CortexPageContext): CortexPageContext {
  const redacted = { ...context };
  
  // Recursively redact secrets
  const secretPatterns = [
    /password/i,
    /psk/i,
    /secret/i,
    /token/i,
    /apikey/i,
    /api_key/i,
    /privatekey/i,
    /private_key/i,
    /sharedsecret/i,
    /radiussecret/i,
    /jwt/i,
    /bearer/i,
  ];
  
  const redactValue = (obj: any): any => {
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'object' && obj !== null) {
      const result = Array.isArray(obj) ? [...obj] : { ...obj };
      for (const key in result) {
        if (secretPatterns.some(p => p.test(key))) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = redactValue(result[key]);
        }
      }
      return result;
    }
    return obj;
  };
  
  return redactValue(redacted);
}
```

#### Before Sending to LLM

- Redact all secrets via `sanitizeCortexContext()`
- Remove or redact PII (MACs, IPs where possible)
- Summarize large tables instead of sending all rows (max 10–20 samples)
- Include aggregate stats, not raw rows
- Remove unnecessary fields

---

### 11. Configuration Change Flow

**Step 1: User Intent**
```
User: "Increase the channel width on all 5GHz APs to 80MHz"
```

**Step 2: Cortex Generates Change Plan**
- Calls tool: `generateConfigChangePlan(intent, scope, scopeIds)`
- Backend returns `CortexChangePlan` with:
  - Title, description
  - Step-by-step changes
  - Affected objects (25 APs)
  - Validation checks
  - Rollback instructions

**Step 3: Validate Risk**
- Calls tool: `validateConfigRisk(changePlanId)`
- Returns `riskLevel: 'medium'` with warnings:
  - "Increasing channel width may reduce coverage in fringe areas"
  - "15 of 25 APs will reboot to apply change"

**Step 4: Show Preview**
- Calls tool: `generateConfigDiff(changePlanId)`
- Frontend renders:
  - Summary card
  - Before: `channelWidth: 40MHz`
  - After: `channelWidth: 80MHz`
  - Affected AP count: 25
  - Risk level badge: **MEDIUM**
  - Warnings list
  - Rollback instructions

**Step 5: Human Approval**
- User reviews and clicks **Commit**
- Frontend calls `POST /api/cortex/config/commit` with `changeId`

**Step 6: Execute**
- Backend executes change plan steps
- Returns audit entry

**Never:** Allow LLM to directly call commit without explicit frontend approval.

---

## Deliverables Checklist

- [ ] `src/providers/CortexContextProvider.tsx` — React Context + hook
- [ ] `src/hooks/useCortexContext.ts` — useCortexContext() hook
- [ ] `src/hooks/useCortex.ts` — useCortex() hook
- [ ] `src/components/Cortex/` — UI components (index, ConversationStream, PageAnalysis, ChangePlanPreview, etc.)
- [ ] `src/types/cortex.ts` — All TypeScript interfaces
- [ ] `src/services/cortexClient.ts` — Frontend API client functions
- [ ] `backend/services/llm/llmProvider.ts` — LLM provider interface
- [ ] `backend/services/llm/providers/` — OpenAI, Azure, Anthropic, Mock implementations
- [ ] `backend/services/cortexOrchestrator.ts` — Session management, message handling
- [ ] `backend/services/cortexContextEnricher.ts` — Page context enrichment
- [ ] `backend/services/cortexSanitizer.ts` — Data safety sanitization
- [ ] `backend/services/cortexToolHandler.ts` — Tool call execution
- [ ] `backend/routes/api/cortex.ts` — REST endpoints
- [ ] `docs/ULTRON.md` — User guide
- [ ] `.env.example` — Updated with ULTRON_* variables
- [ ] Tests — Unit + integration tests for all components

---

## Key Decisions

1. **Page-Aware Design:** Cortex is never generic; it always knows the page, selected data, and available actions.
2. **Pluggable LLM Providers:** No hardcoded single provider; environment variables determine which backend to use.
3. **Mandatory Human Approval:** LLM can propose config changes, but only humans can commit.
4. **Data Sanitization:** Secrets are redacted before sending to LLM; large tables are summarized.
5. **Zero Automatic Actions:** No writes, no commits, no state changes without explicit user action.
6. **Tool-Based Extensibility:** New tools can be added without changing LLM code.
7. **Graceful Degradation:** If LLM is unavailable, UI still works; if backend API is slow, frontend shows loading states.

---

## Success Criteria

- Cortex opens on command (⌘K)
- Shows proactive page analysis within 1 second of opening
- Suggested prompts are relevant to the current page
- Multi-turn conversations work end-to-end
- Tool calls execute correctly with real data
- Config change previews show accurate diffs
- Human approval gate is enforced (no accidental commits)
- Secrets are never exposed to LLM
- App behaves gracefully when LLM is unavailable
- All tests pass (unit + integration)
