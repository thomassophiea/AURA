# Agent 1 Coworker — Design Spec
**Date:** 2026-05-11  
**Approach:** C — New component family + new `agentService.ts`  
**Replaces:** `NetworkChatbot.tsx` + `chatbot.ts` (retained for read-only Q&A, not removed)

---

## Overview

Agent 1 Coworker is a premium AI operations assistant embedded persistently in AURA. It presents as a floating command bar when idle and expands into a right-side operational workspace on engagement. It supports natural language operations, staged execution plans, before/after config diffs, human approval gates, rollback, and full audit history.

It is not a chatbot. It is an AI-native network engineering cockpit.

---

## Approach

**New `agentService.ts`** owns all write-path operations: intent parsing, execution plan generation, approval execution, rollback, and audit. It calls the existing `apiService` singleton for all HTTP — no new HTTP client.

**`chatbot.ts`** is retained unchanged. It continues to serve read-only Q&A via the legacy `NetworkChatbot` if that component is ever re-enabled. There is no shared state between the two services.

**`AgentCoworker/`** is a self-contained component directory registered in `App.tsx` in place of `NetworkChatbot`.

---

## File Structure

```
src/
  services/
    agentService.ts                  ← new: operations engine

  components/
    AgentCoworker/
      index.tsx                      ← root export, App.tsx integration point
      AgentCommandBar.tsx            ← idle floating pill trigger
      AgentWorkspace.tsx             ← right-side slideout shell + resize handle
      agentTypes.ts                  ← all shared types (no chatbot.ts cross-imports)
      useAgentWorkspace.ts           ← workspace state machine hook
      panels/
        ConversationStream.tsx       ← message thread, Show Reasoning, feedback
        ExecutionPlanView.tsx        ← step-by-step plan with live status dots
        ConfigDiffView.tsx           ← before/after field diff table
        ApprovalControls.tsx         ← approve / reject / rollback gate
        APITimelineView.tsx          ← live API call log (method, endpoint, status, ms)
        AuditHistoryView.tsx         ← past operations log

  test/
    agentService.test.ts             ← unit tests for service methods
    AgentCommandBar.test.tsx         ← idle state rendering + keyboard trigger
    AgentWorkspace.test.tsx          ← open/minimize/pin state transitions
    ApprovalControls.test.tsx        ← approval gate (write blocked until approved)
```

---

## Types (`agentTypes.ts`)

```ts
export type WorkspaceSize = 'compact' | 'standard' | 'expanded'
// pixel widths:          400         520           720

export type WorkspaceMode = 'idle' | 'open' | 'minimized' | 'pinned'

export type PlanStatus =
  | 'building'    // agent is generating the plan
  | 'pending'     // awaiting human approval
  | 'approved'    // user clicked approve, not yet executing
  | 'executing'   // steps running
  | 'completed'   // all steps done
  | 'rejected'    // user rejected
  | 'rolledback'  // user triggered rollback after completion
  | 'failed'      // execution error

export interface AgentMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: Date
  reasoning?: string          // chain-of-thought, hidden by default
  showReasoning?: boolean     // toggled by Show Reasoning control
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
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  apiEndpoint?: string
  duration?: number           // ms, populated after completion
}

export interface DiffEntry {
  field: string
  scope: string               // e.g. "Site: Main Campus / SSID: CorpNet"
  before: unknown
  after: unknown
}

export interface ImpactedObject {
  type: 'site' | 'ap' | 'ssid' | 'policy' | 'vlan'
  id: string
  name: string
  count?: number              // e.g. "42 APs"
}

export interface AuditEntry {
  id: string
  timestamp: Date
  action: string
  operator: string            // username from auth context
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
  duration: number            // ms
  planStepId?: string         // links entry to a plan step
}

export interface OperationIntent {
  action: string
  targetType: ImpactedObject['type']
  targetIds: string[]
  parameters: Record<string, unknown>
  requiresApproval: true      // always true — all write intents require approval
}

export interface ExecutionResult {
  planId: string
  success: boolean
  completedSteps: number
  failedStep?: string
  error?: string
}
```

---

## `agentService.ts` Public API

```ts
class AgentService {
  // Conversation
  sendMessage(content: string, context?: AssistantUIContext): Promise<AgentMessage>
  getMessages(): AgentMessage[]
  clearHistory(): void

  // Operations
  parseIntent(input: string): Promise<OperationIntent>
  buildExecutionPlan(intent: OperationIntent): Promise<ExecutionPlan>
  executeApprovedPlan(planId: string): Promise<ExecutionResult>   // ONLY write entry point
  rollbackOperation(planId: string): Promise<void>

  // Observability
  getAuditHistory(): AuditEntry[]
  getAPITimeline(): APITimelineEntry[]

  // Internal
  private logAPICall(entry: Omit<APITimelineEntry, 'id' | 'timestamp'>): void
}

export const agentService = new AgentService()
```

**Critical invariant:** No config write API call occurs unless `executeApprovedPlan()` is called. `buildExecutionPlan()` is read-only — it constructs the plan object and fetches current state for diff generation, but issues no mutations.

---

## `useAgentWorkspace.ts` Hook

```ts
interface WorkspaceState {
  mode: WorkspaceMode
  size: WorkspaceSize
  activePanel: 'conversation' | 'execution' | 'diff' | 'audit' | 'timeline'
  inputValue: string
  isListening: boolean
  pendingPlanId: string | null   // non-null when approval gate is active
}

interface WorkspaceActions {
  open(): void
  minimize(): void
  pin(): void
  dismiss(): void
  setSize(s: WorkspaceSize): void
  setActivePanel(p: WorkspaceState['activePanel']): void
  setInput(v: string): void
  startListening(): void
  stopListening(): void
  setPendingPlan(id: string | null): void
}
```

State is local to the hook (no Context needed — only one instance in App.tsx). Persisted to `localStorage` for mode/size across sessions.

---

## Component Designs

### `AgentCommandBar`

- Position: `fixed bottom-6 left-1/2 -translate-x-1/2 z-[99998]`
- Shape: `rounded-full h-14 min-w-[480px] max-w-[640px]`
- Background: `hsl(268 20% 8%)` + `border border-white/10`
- Shadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)`
- Layout: `flex items-center gap-3 px-4`
  - Left: AURA triangle logo `text-[#bb86fc]` 20px
  - Center: input or placeholder text `text-sm text-white/40`
  - Right: external-link icon + grid icon `text-white/30 hover:text-white/70`
- Active/thinking state: violet glow `box-shadow: 0 0 24px hsl(268 80% 65% / 0.2)`
- Hides when workspace `mode === 'open'`; shows as compact trigger when `minimized` or `pinned`
- Keyboard: `⌘K` opens workspace

### `AgentWorkspace`

- Position: `fixed top-0 right-0 h-screen z-[99997]`
- Width: 400 / 520 / 720px based on `size`
- Background: `hsl(268 20% 8%)`
- Border-left: `1px solid hsl(268 15% 16%)`
- Shadow: `-24px 0 64px rgba(0,0,0,0.5), -8px 0 24px rgba(0,0,0,0.3)`
- Transition: `transform 320ms cubic-bezier(0.16, 1, 0.3, 1)`
  - Open: `translateX(0)`
  - Closed: `translateX(100%)`
- Backdrop: `fixed inset-0 bg-black/30 backdrop-blur-[2px]` — renders behind panel, pointer-events pass to AURA for pinned mode (backdrop removed)
- Left edge: 4px drag handle `cursor-ew-resize` for resize
- Header bar:
  - AURA logo + "Agent ONE" text + `Coworker` badge (`bg-violet-900/60 text-violet-300 text-xs`)
  - Right: minimize icon, pin icon, expand icon, close `×`
- Panel tab strip below header: Conversation · Plan · Diff · Timeline · Audit
- Content area: renders active panel, `overflow-y-auto`
- `minimized` mode: collapses to 48px-wide right-edge strip showing AURA icon vertically

### `ConversationStream`

- Renders `AgentMessage[]` from `agentService.getMessages()`
- User turn: right-aligned pill `bg-primary/90 rounded-2xl rounded-br-sm px-4 py-2`
- Agent turn: left-aligned, AURA avatar + content, no bubble background
- Show Reasoning: collapsible `<details>` element, `text-xs text-white/40 font-mono`
- Feedback row: `ThumbsUp ThumbsDown Copy MoreHorizontal` icons + `text-xs text-white/30` relative timestamp
- Loading: 3-dot bounce in agent avatar position
- Bottom: "Suggested Questions" collapsible section when history is empty
- Input bar: `AgentCommandBar` visually reproduced at panel bottom (same pill aesthetic)
  - Voice mic icon (left of send), Send button (right)

### `ExecutionPlanView`

- Title + description at top
- Steps list: each step shows:
  - Status dot: grey (pending) / pulse violet (running) / green check (completed) / red X (failed)
  - Step label `text-sm text-white/90`
  - API endpoint `text-xs text-white/40 font-mono` (if present)
  - Duration chip `text-xs` (after completion)
- Impacted objects summary: icon chips (`42 APs`, `3 SSIDs`, etc.)
- `PlanStatus` banner at top: color-coded status pill

### `ConfigDiffView`

- Table: `Scope | Field | Before | After`
- Removed values: `text-red-400 line-through`
- Added values: `text-green-400`
- Unchanged context: `text-white/40`
- Monospace font for values
- Scrollable if diff > viewport

### `ApprovalControls`

- Renders only when `pendingPlanId !== null`
- Three buttons:
  - **Approve** — `bg-green-600 hover:bg-green-500` → calls `agentService.executeApprovedPlan(planId)`
  - **Reject** — `bg-red-900/60 hover:bg-red-800` → marks plan `rejected`, no API calls
  - **Rollback** (post-execution only) → calls `agentService.rollbackOperation(planId)`
- Warning text: "This will apply changes to live infrastructure. Review the diff before approving."
- Disabled state during execution with spinner

### `APITimelineView`

- Chronological list of `APITimelineEntry`
- Each row: `METHOD` badge (colored by verb) + endpoint + status code chip + ms badge
- Auto-scrolls to bottom on new entry
- Filter by plan step or show all
- Monospace font throughout

### `AuditHistoryView`

- List of `AuditEntry` newest-first
- Each row: timestamp + action label + operator + status badge + impacted objects
- Expandable per entry to show full details
- Empty state: "No operations recorded yet"

---

## App.tsx Changes

```tsx
// Remove:
import type { AssistantContext } from './components/NetworkChatbot'
const NetworkChatbot = lazy(() => import('./components/NetworkChatbot')...)

// Add:
import { AgentCoworker } from './components/AgentCoworker'

// State rename:
const [isAgentOpen, setIsAgentOpen] = useState(false)  // was isChatbotOpen

// Render (replaces NetworkChatbot block):
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

// Pinned mode: add dynamic right margin to <main>
// useAgentWorkspace exposes isPinned + panelWidth for this
```

---

## Animation Spec

```css
/* Workspace slide */
.agent-workspace {
  transition: transform 320ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* Panel cross-dissolve */
.agent-panel {
  transition: opacity 150ms ease;
}

/* Plan step stagger */
.plan-step {
  animation: fadeInUp 200ms ease forwards;
  animation-delay: calc(var(--step-index, 0) * 60ms);
}

/* Command bar glow on active */
.agent-bar--active {
  box-shadow:
    0 8px 32px rgba(0,0,0,0.4),
    0 0 0 1px rgba(187,134,252,0.2),
    0 0 32px rgba(187,134,252,0.1);
}
```

No spring physics. No excessive keyframe sequences. Controlled deceleration only.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` | Toggle workspace open/closed |
| `Escape` | Dismiss workspace (or minimize if pinned) |
| `⌘⇧A` | Focus command bar input |
| `⌘Enter` | Approve pending plan |
| `⌘⇧R` | Rollback last operation |

---

## Testing Strategy

- **`agentService.test.ts`**: Mock `apiService`. Verify `buildExecutionPlan()` issues zero write calls. Verify `executeApprovedPlan()` calls the correct endpoints in step order. Verify `rollbackOperation()` calls inverse endpoints.
- **`ApprovalControls.test.tsx`**: Assert Approve/Reject buttons present only when plan is `pending`. Assert `executeApprovedPlan` not called until Approve clicked.
- **`AgentCommandBar.test.tsx`**: `⌘K` fires `onToggle`. Renders correctly in idle state.
- **`AgentWorkspace.test.tsx`**: Open/minimize/pin/dismiss state transitions. Size changes apply correct width class.

---

## Build Sequence

1. `agentTypes.ts` — types first, no dependencies
2. `agentService.ts` — service, depends on `apiService`
3. `useAgentWorkspace.ts` — hook, depends on types
4. `AgentCommandBar.tsx` — leaf component
5. `panels/ConversationStream.tsx` — leaf panel
6. `panels/ExecutionPlanView.tsx` — leaf panel
7. `panels/ConfigDiffView.tsx` — leaf panel
8. `panels/ApprovalControls.tsx` — leaf panel
9. `panels/APITimelineView.tsx` — leaf panel
10. `panels/AuditHistoryView.tsx` — leaf panel
11. `AgentWorkspace.tsx` — composes panels
12. `AgentCoworker/index.tsx` — root, composes bar + workspace
13. `App.tsx` — wire up, remove NetworkChatbot
14. Tests across all new units
