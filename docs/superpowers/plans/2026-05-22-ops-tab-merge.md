# Ops Tab Merge — AURA Engine Slideout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge Ultr0n and Red Queen into a single two-tab AURA Engine slideout: Terminal tab (Red Queen PTY, unchanged) + Ops tab (7 sub-panels: Chat, Validate, Drift, Execution, Diff, Audit, Timeline).

**Architecture:** `AgentWorkspace.tsx` gains a primary tab bar (Terminal | Ops). Terminal renders `<RedQueenShell />` as before. Ops renders a secondary nav strip and one of 7 sub-panels. Conversation state comes from `UltronContext` (already wired with `sendMessage`, `messages`, `isThinking`, etc.). ValidationPanel and DriftPanel are new components that call Phase 3 backend endpoints directly. No external Ultr0n UI exists separately — `openUltr0n`/`closeUltr0n` calls in `AgentCoworker/index.tsx` stay as-is since they track context sync, not a separate render.

**Tech Stack:** React 19, TypeScript strict, Tailwind CSS, Radix UI. Phase 3 backend endpoints: `POST /api/validate/intent`, `GET /api/drift`, `DELETE /api/drift`.

---

### Task 1: Extend agentTypes.ts with PrimaryTab and new panel names

**Files:**
- Modify: `src/components/AgentCoworker/agentTypes.ts`

- [ ] **Step 1: Add PrimaryTab type and extend ActivePanel**

Open `src/components/AgentCoworker/agentTypes.ts`. Change lines 10-10 and add one new type:

```typescript
export type PrimaryTab = 'terminal' | 'ops';

export type ActivePanel = 'conversation' | 'execution' | 'diff' | 'audit' | 'timeline' | 'validate' | 'drift';
```

Full diff — replace the existing `ActivePanel` line and insert `PrimaryTab` before it:

```typescript
export type PrimaryTab = 'terminal' | 'ops';

export type ActivePanel =
  | 'conversation'
  | 'execution'
  | 'diff'
  | 'audit'
  | 'timeline'
  | 'validate'
  | 'drift';
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run type-check 2>&1 | tail -20`

Expected: zero errors (existing code uses `'conversation' | 'execution' | 'diff' | 'audit' | 'timeline'` — all still valid, two new values added).

- [ ] **Step 3: Commit**

```bash
git add src/components/AgentCoworker/agentTypes.ts
git commit -m "feat(workspace): add PrimaryTab type and validate/drift to ActivePanel"
```

---

### Task 2: Add primaryTab state to useAgentWorkspace

**Files:**
- Modify: `src/components/AgentCoworker/useAgentWorkspace.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/AgentCoworker/useAgentWorkspace.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentWorkspace } from './useAgentWorkspace';

beforeEach(() => {
  localStorage.clear();
});

describe('useAgentWorkspace primaryTab', () => {
  it('defaults to terminal', () => {
    const { result } = renderHook(() => useAgentWorkspace());
    expect(result.current.primaryTab).toBe('terminal');
  });

  it('setPrimaryTab switches to ops', () => {
    const { result } = renderHook(() => useAgentWorkspace());
    act(() => {
      result.current.setPrimaryTab('ops');
    });
    expect(result.current.primaryTab).toBe('ops');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- useAgentWorkspace --run 2>&1 | tail -20`

Expected: FAIL — `primaryTab` not found.

- [ ] **Step 3: Add primaryTab to the hook**

In `src/components/AgentCoworker/useAgentWorkspace.ts`:

1. Import `PrimaryTab` (add to existing import):

```typescript
import type { WorkspaceMode, WorkspaceSize, ActivePanel, PrimaryTab } from './agentTypes';
```

2. Add to `WorkspacePrefs` interface:

```typescript
interface WorkspacePrefs {
  size: WorkspaceSize;
  mode: WorkspaceMode;
  primaryTab?: PrimaryTab;
}
```

3. Add to `AgentWorkspaceState` interface:

```typescript
export interface AgentWorkspaceState {
  mode: WorkspaceMode;
  size: WorkspaceSize;
  primaryTab: PrimaryTab;
  activePanel: ActivePanel;
  inputValue: string;
  isListening: boolean;
  pendingPlanId: string | null;
}
```

4. Add to `AgentWorkspaceActions` interface:

```typescript
export interface AgentWorkspaceActions {
  open: () => void;
  minimize: () => void;
  pin: () => void;
  dismiss: () => void;
  setSize: (s: WorkspaceSize) => void;
  setPrimaryTab: (t: PrimaryTab) => void;
  setActivePanel: (p: ActivePanel) => void;
  setInput: (v: string) => void;
  startListening: () => void;
  stopListening: () => void;
  setPendingPlan: (id: string | null) => void;
  toggle: () => void;
}
```

5. Inside `useAgentWorkspace()`, add state after existing `size` state:

```typescript
const [primaryTab, setPrimaryTabState] = useState<PrimaryTab>(prefs.primaryTab ?? 'terminal');
```

6. Add callback:

```typescript
const setPrimaryTab = useCallback((t: PrimaryTab) => {
  setPrimaryTabState(t);
  savePrefs({ size, mode, primaryTab: t });
}, [size, mode]);
```

7. Return it in the return object (alongside existing fields):

```typescript
primaryTab,
setPrimaryTab,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- useAgentWorkspace --run 2>&1 | tail -20`

Expected: PASS — 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentCoworker/useAgentWorkspace.ts src/components/AgentCoworker/useAgentWorkspace.test.ts
git commit -m "feat(workspace): add primaryTab state to useAgentWorkspace"
```

---

### Task 3: Create ValidationPanel.tsx

**Files:**
- Create: `src/components/AgentCoworker/panels/ValidationPanel.tsx`
- Create: `src/components/AgentCoworker/panels/ValidationPanel.test.tsx`

The component renders a form with four fields, submits to `POST /api/validate/intent`, and shows a confidence report with a "Copy Token" button.

**Backend contract** (`POST /api/validate/intent`):

Request body:
```json
{
  "intent": {
    "action": "provision-ssid",
    "ssidName": "Corp-WiFi",
    "vlanId": 10,
    "securityType": "WPA3",
    "site": "main"
  }
}
```

Response (200):
```json
{
  "confidence": 85,
  "band": "HIGH",
  "checks": [
    { "name": "VLAN exists", "passed": true, "detail": "VLAN 10 found" },
    { "name": "Topology reachable", "passed": true, "detail": "2 topologies found" }
  ],
  "recommendation": "Ready to provision.",
  "provisioningToken": "tok_abc123",
  "expiresAt": "2026-05-22T12:00:00Z"
}
```

- [ ] **Step 1: Write the failing test**

Create `src/components/AgentCoworker/panels/ValidationPanel.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ValidationPanel } from './ValidationPanel';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

describe('ValidationPanel', () => {
  it('renders the form fields', () => {
    render(<ValidationPanel />);
    expect(screen.getByLabelText(/SSID Name/i)).toBeDefined();
    expect(screen.getByLabelText(/VLAN ID/i)).toBeDefined();
    expect(screen.getByLabelText(/Security/i)).toBeDefined();
    expect(screen.getByLabelText(/Site/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Validate/i })).toBeDefined();
  });

  it('shows confidence band on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        confidence: 85,
        band: 'HIGH',
        checks: [{ name: 'VLAN exists', passed: true, detail: 'VLAN 10 found' }],
        recommendation: 'Ready to provision.',
        provisioningToken: 'tok_abc',
        expiresAt: '2026-05-22T12:00:00Z',
      }),
    });

    render(<ValidationPanel />);
    fireEvent.change(screen.getByLabelText(/SSID Name/i), { target: { value: 'Corp-WiFi' } });
    fireEvent.change(screen.getByLabelText(/VLAN ID/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Validate/i }));

    await waitFor(() => {
      expect(screen.getByText('HIGH')).toBeDefined();
      expect(screen.getByText(/Ready to provision/i)).toBeDefined();
    });
  });

  it('shows error message on failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });

    render(<ValidationPanel />);
    fireEvent.change(screen.getByLabelText(/SSID Name/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Validate/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed/i)).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- ValidationPanel --run 2>&1 | tail -20`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement ValidationPanel.tsx**

Create `src/components/AgentCoworker/panels/ValidationPanel.tsx`:

```typescript
import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Copy, Check } from 'lucide-react';
import { cn } from '../../ui/utils';

interface ValidationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface ValidationResult {
  confidence: number;
  band: 'HIGH' | 'MEDIUM' | 'LOW';
  checks: ValidationCheck[];
  recommendation: string;
  provisioningToken: string;
  expiresAt: string;
}

const BAND_STYLES: Record<ValidationResult['band'], string> = {
  HIGH: 'text-green-300 bg-green-900/30 border-green-700/40',
  MEDIUM: 'text-amber-300 bg-amber-900/30 border-amber-700/40',
  LOW: 'text-red-300 bg-red-900/30 border-red-700/40',
};

export function ValidationPanel() {
  const [ssidName, setSsidName] = useState('');
  const [vlanId, setVlanId] = useState('');
  const [security, setSecurity] = useState<'WPA2' | 'WPA3' | 'WPA3_TRANSITION' | 'OPEN'>('WPA3');
  const [site, setSite] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleValidate() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const resp = await fetch('/api/validate/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: {
            action: 'provision-ssid',
            ssidName,
            vlanId: Number(vlanId),
            securityType: security,
            site: site || undefined,
          },
        }),
      });
      if (!resp.ok) {
        const msg = await resp.text().catch(() => 'Request failed');
        throw new Error(`Validation failed: ${msg}`);
      }
      setResult(await resp.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setLoading(false);
    }
  }

  function copyToken() {
    if (!result) return;
    navigator.clipboard.writeText(result.provisioningToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="vp-ssid" className="text-xs text-muted-foreground">
            SSID Name
          </label>
          <input
            id="vp-ssid"
            aria-label="SSID Name"
            className="h-8 px-2.5 rounded bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={ssidName}
            onChange={e => setSsidName(e.target.value)}
            placeholder="e.g. Corp-WiFi"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="vp-vlan" className="text-xs text-muted-foreground">
            VLAN ID
          </label>
          <input
            id="vp-vlan"
            aria-label="VLAN ID"
            type="number"
            className="h-8 px-2.5 rounded bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={vlanId}
            onChange={e => setVlanId(e.target.value)}
            placeholder="e.g. 10"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="vp-security" className="text-xs text-muted-foreground">
            Security
          </label>
          <select
            id="vp-security"
            aria-label="Security"
            className="h-8 px-2.5 rounded bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={security}
            onChange={e => setSecurity(e.target.value as typeof security)}
          >
            <option value="WPA3">WPA3</option>
            <option value="WPA3_TRANSITION">WPA3 Transition</option>
            <option value="WPA2">WPA2</option>
            <option value="OPEN">Open</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="vp-site" className="text-xs text-muted-foreground">
            Site (optional)
          </label>
          <input
            id="vp-site"
            aria-label="Site"
            className="h-8 px-2.5 rounded bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={site}
            onChange={e => setSite(e.target.value)}
            placeholder="e.g. main"
          />
        </div>

        <button
          onClick={handleValidate}
          disabled={loading || !ssidName}
          className={cn(
            'h-8 px-4 rounded text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          {loading ? (
            <span className="flex items-center gap-2 justify-center">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Validating…
            </span>
          ) : (
            'Validate'
          )}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-900/20 border border-red-700/40 rounded px-3 py-2">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'px-2 py-0.5 rounded text-xs font-semibold border',
                BAND_STYLES[result.band]
              )}
            >
              {result.band}
            </span>
            <span className="text-xs text-muted-foreground">{result.confidence}/100</span>
          </div>

          <div className="flex flex-col gap-1.5">
            {result.checks.map((check, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                {check.passed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                )}
                <span className={check.passed ? 'text-foreground/80' : 'text-red-400'}>
                  <span className="font-medium">{check.name}</span> — {check.detail}
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">{result.recommendation}</p>

          <button
            onClick={copyToken}
            className="flex items-center gap-2 h-7 px-3 rounded text-xs bg-secondary hover:bg-secondary/80 transition-colors self-start"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied!' : 'Copy Token'}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- ValidationPanel --run 2>&1 | tail -20`

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentCoworker/panels/ValidationPanel.tsx src/components/AgentCoworker/panels/ValidationPanel.test.tsx
git commit -m "feat(workspace): add ValidationPanel with intent validation form"
```

---

### Task 4: Create DriftPanel.tsx

**Files:**
- Create: `src/components/AgentCoworker/panels/DriftPanel.tsx`
- Create: `src/components/AgentCoworker/panels/DriftPanel.test.tsx`

The component polls `GET /api/drift` every 30 seconds, lists alerts, and has a Clear button (`DELETE /api/drift`).

**Backend contract** (`GET /api/drift`):

```json
{
  "alerts": [
    {
      "id": "d1",
      "type": "ssid-mismatch",
      "detail": "SSID 'Corp-WiFi' missing on AP abc123",
      "detectedAt": "2026-05-22T10:00:00Z"
    }
  ]
}
```

- [ ] **Step 1: Write the failing test**

Create `src/components/AgentCoworker/panels/DriftPanel.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DriftPanel } from './DriftPanel';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DriftPanel', () => {
  it('fetches and displays alerts on mount', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        alerts: [
          {
            id: 'd1',
            type: 'ssid-mismatch',
            detail: 'SSID Corp-WiFi missing on AP abc123',
            detectedAt: '2026-05-22T10:00:00Z',
          },
        ],
      }),
    });

    render(<DriftPanel />);

    await waitFor(() => {
      expect(screen.getByText(/ssid-mismatch/i)).toBeDefined();
      expect(screen.getByText(/Corp-WiFi missing/i)).toBeDefined();
    });
  });

  it('shows empty state when no alerts', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ alerts: [] }),
    });

    render(<DriftPanel />);

    await waitFor(() => {
      expect(screen.getByText(/no drift detected/i)).toBeDefined();
    });
  });

  it('clears alerts on DELETE button click', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          alerts: [{ id: 'd1', type: 'ssid-mismatch', detail: 'x', detectedAt: '2026-05-22T10:00:00Z' }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cleared: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ alerts: [] }) });

    render(<DriftPanel />);

    await waitFor(() => expect(screen.getByText(/ssid-mismatch/i)).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    await waitFor(() => {
      expect(screen.getByText(/no drift detected/i)).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- DriftPanel --run 2>&1 | tail -20`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement DriftPanel.tsx**

Create `src/components/AgentCoworker/panels/DriftPanel.tsx`:

```typescript
import { useEffect, useState, useCallback, useRef } from 'react';
import { AlertTriangle, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { cn } from '../../ui/utils';

interface DriftAlert {
  id: string;
  type: string;
  detail: string;
  detectedAt: string;
}

const POLL_MS = 30_000;

export function DriftPanel() {
  const [alerts, setAlerts] = useState<DriftAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const resp = await fetch('/api/drift');
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json();
      setAlerts(data.alerts ?? []);
      setError(null);
    } catch {
      setError('Failed to fetch drift alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    intervalRef.current = setInterval(fetchAlerts, POLL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAlerts]);

  async function handleClear() {
    setClearing(true);
    try {
      await fetch('/api/drift', { method: 'DELETE' });
      await fetchAlerts();
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 shrink-0">
        <span className="text-xs font-medium text-muted-foreground">
          {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchAlerts}
            className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleClear}
            disabled={clearing || alerts.length === 0}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
              'text-red-400 hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed'
            )}
            aria-label="Clear"
          >
            {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Clear
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center justify-center h-full text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && alerts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-6 w-6 opacity-30" />
            No drift detected
          </div>
        )}

        {!loading && alerts.length > 0 && (
          <div className="divide-y divide-border/40">
            {alerts.map(alert => (
              <div key={alert.id} className="px-4 py-3 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="text-xs font-mono text-amber-300 bg-amber-900/30 px-1.5 py-0.5 rounded">
                    {alert.type}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(alert.detectedAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-foreground/70 pl-5">{alert.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- DriftPanel --run 2>&1 | tail -20`

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentCoworker/panels/DriftPanel.tsx src/components/AgentCoworker/panels/DriftPanel.test.tsx
git commit -m "feat(workspace): add DriftPanel with polling and clear"
```

---

### Task 5: Wire all panels in AgentWorkspace.tsx

**Files:**
- Modify: `src/components/AgentCoworker/AgentWorkspace.tsx`

This is the main wiring task. Add:
1. A primary tab bar (Terminal | Ops) just below the header.
2. Terminal tab renders `<RedQueenShell />` (unchanged).
3. Ops tab renders a secondary nav strip (7 icons) + the selected sub-panel content.
4. Import all 7 panel components and wire them to data from `useUltronContext()`.

The `useUltronContext()` hook (from `src/contexts/UltronContext.tsx`) provides:
- `messages`, `isThinking`, `wirelessStage`, `suggestedPrompts` → ConversationStream
- `pendingPlan` → ExecutionPlanView (as `plan`)
- `messages` (last agent message `.diff`) → ConfigDiffView
- `auditEntries` → AuditHistoryView
- `apiTimeline` → APITimelineView
- `sendMessage`, `onFeedback` (via agentService), `confirmWirelessAction` → ConversationStream

- [ ] **Step 1: Write the failing test**

Create `src/components/AgentCoworker/AgentWorkspace.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentWorkspace } from './AgentWorkspace';

vi.mock('./panels/RedQueenShell', () => ({
  RedQueenShell: () => <div data-testid="red-queen-shell">Terminal</div>,
}));
vi.mock('./panels/ConversationStream', () => ({
  ConversationStream: () => <div data-testid="conversation-stream">Chat</div>,
}));
vi.mock('./panels/ValidationPanel', () => ({
  ValidationPanel: () => <div data-testid="validation-panel">Validate</div>,
}));
vi.mock('./panels/DriftPanel', () => ({
  DriftPanel: () => <div data-testid="drift-panel">Drift</div>,
}));
vi.mock('./panels/ExecutionPlanView', () => ({
  ExecutionPlanView: () => <div data-testid="execution-panel">Execution</div>,
}));
vi.mock('./panels/ConfigDiffView', () => ({
  ConfigDiffView: () => <div data-testid="diff-panel">Diff</div>,
}));
vi.mock('./panels/AuditHistoryView', () => ({
  AuditHistoryView: () => <div data-testid="audit-panel">Audit</div>,
}));
vi.mock('./panels/APITimelineView', () => ({
  APITimelineView: () => <div data-testid="timeline-panel">Timeline</div>,
}));
vi.mock('../../contexts/UltronContext', () => ({
  useUltronContext: () => ({
    messages: [],
    isThinking: false,
    wirelessStage: null,
    suggestedPrompts: [],
    pendingPlan: null,
    auditEntries: [],
    apiTimeline: [],
    sendMessage: vi.fn(),
    confirmWirelessAction: vi.fn(),
  }),
}));
vi.mock('../../hooks/useUltr0nModel', () => ({
  useUltr0nModel: () => ({ providers: [], models: [], selectedModel: null, setSelectedModel: vi.fn(), loading: false }),
}));
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: () => ({ siteGroup: null, navigationScope: 'global' }),
}));
vi.mock('../../services/agentContextService', () => ({
  writeAgentContext: vi.fn(),
}));

const defaultProps = {
  mode: 'open' as const,
  size: 'standard' as const,
  primaryTab: 'terminal' as const,
  activePanel: 'conversation' as const,
  onClose: vi.fn(),
  onMinimize: vi.fn(),
  onPin: vi.fn(),
  onDismiss: vi.fn(),
  onSetSize: vi.fn(),
  onSetPrimaryTab: vi.fn(),
  onSetActivePanel: vi.fn(),
};

describe('AgentWorkspace tabs', () => {
  it('shows Terminal tab content by default', () => {
    render(<AgentWorkspace {...defaultProps} />);
    expect(screen.getByTestId('red-queen-shell')).toBeDefined();
  });

  it('shows Ops tab content when primaryTab is ops', () => {
    render(<AgentWorkspace {...defaultProps} primaryTab="ops" />);
    expect(screen.getByTestId('conversation-stream')).toBeDefined();
  });

  it('calls onSetPrimaryTab when Ops tab is clicked', () => {
    const onSetPrimaryTab = vi.fn();
    render(<AgentWorkspace {...defaultProps} onSetPrimaryTab={onSetPrimaryTab} />);
    fireEvent.click(screen.getByRole('tab', { name: /ops/i }));
    expect(onSetPrimaryTab).toHaveBeenCalledWith('ops');
  });

  it('shows DriftPanel when activePanel is drift (Ops tab)', () => {
    render(<AgentWorkspace {...defaultProps} primaryTab="ops" activePanel="drift" />);
    expect(screen.getByTestId('drift-panel')).toBeDefined();
  });

  it('shows ValidationPanel when activePanel is validate (Ops tab)', () => {
    render(<AgentWorkspace {...defaultProps} primaryTab="ops" activePanel="validate" />);
    expect(screen.getByTestId('validation-panel')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- AgentWorkspace --run 2>&1 | tail -20`

Expected: FAIL — props `primaryTab`, `onSetPrimaryTab`, `onSetActivePanel` don't exist yet.

- [ ] **Step 3: Implement the tab UI in AgentWorkspace.tsx**

Replace `src/components/AgentCoworker/AgentWorkspace.tsx` with the following complete implementation:

```typescript
import { useRef, useState, useCallback, useEffect } from 'react';
import { X, Minus, Pin, Maximize2, Terminal, Settings2, ShieldCheck, Activity, GitCompare, ClipboardList, Clock, MessageSquare } from 'lucide-react';
import { cn } from '../ui/utils';
import { useUltr0nModel } from '../../hooks/useUltr0nModel';
import { useAppContext } from '../../contexts/AppContext';
import { useUltronContext } from '../../contexts/UltronContext';
import { writeAgentContext } from '../../services/agentContextService';
import { ModelSelector } from './ModelSelector';
import { RedQueenShell } from './panels/RedQueenShell';
import { ConversationStream } from './panels/ConversationStream';
import { ValidationPanel } from './panels/ValidationPanel';
import { DriftPanel } from './panels/DriftPanel';
import { ExecutionPlanView } from './panels/ExecutionPlanView';
import { ConfigDiffView } from './panels/ConfigDiffView';
import { AuditHistoryView } from './panels/AuditHistoryView';
import { APITimelineView } from './panels/APITimelineView';
import { WORKSPACE_WIDTHS } from './agentTypes';
import type { WorkspaceMode, WorkspaceSize, ActivePanel, PrimaryTab } from './agentTypes';

interface AgentWorkspaceProps {
  mode: WorkspaceMode;
  size: WorkspaceSize;
  primaryTab: PrimaryTab;
  activePanel: ActivePanel;
  onClose: () => void;
  onMinimize: () => void;
  onPin: () => void;
  onDismiss: () => void;
  onSetSize: (s: WorkspaceSize) => void;
  onSetPrimaryTab: (t: PrimaryTab) => void;
  onSetActivePanel: (p: ActivePanel) => void;
}

const OPS_PANELS: { id: ActivePanel; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'conversation', label: 'Chat', icon: MessageSquare },
  { id: 'validate', label: 'Validate', icon: ShieldCheck },
  { id: 'drift', label: 'Drift', icon: Activity },
  { id: 'execution', label: 'Execution', icon: Settings2 },
  { id: 'diff', label: 'Diff', icon: GitCompare },
  { id: 'audit', label: 'Audit', icon: ClipboardList },
  { id: 'timeline', label: 'Timeline', icon: Clock },
];

export function AgentWorkspace({
  mode,
  size,
  primaryTab,
  activePanel,
  onClose,
  onMinimize,
  onPin,
  onDismiss,
  onSetSize,
  onSetPrimaryTab,
  onSetActivePanel,
}: AgentWorkspaceProps) {
  const isVisible = mode === 'open' || mode === 'pinned';
  const isPinned = mode === 'pinned';

  const { siteGroup, navigationScope } = useAppContext();
  const ctx = useUltronContext();

  useEffect(() => {
    if (!isVisible) return;
    writeAgentContext({
      navigationScope,
      siteGroupName: siteGroup?.name,
      controllerUrl: siteGroup?.controller_url,
    });
  }, [isVisible, navigationScope, siteGroup]);

  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const activeHandlersRef = useRef<{ onMove: (ev: MouseEvent) => void; onUp: () => void } | null>(null);

  useEffect(() => {
    return () => {
      if (activeHandlersRef.current) {
        window.removeEventListener('mousemove', activeHandlersRef.current.onMove);
        window.removeEventListener('mouseup', activeHandlersRef.current.onUp);
      }
    };
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragRef.current = { startX: e.clientX, startW: dragWidth ?? WORKSPACE_WIDTHS[size] };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startX - ev.clientX;
        setDragWidth(Math.max(340, Math.min(900, dragRef.current.startW + delta)));
      };
      const onUp = () => {
        dragRef.current = null;
        activeHandlersRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      activeHandlersRef.current = { onMove, onUp };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [dragWidth, size]
  );

  const panelWidth = dragWidth ?? WORKSPACE_WIDTHS[size];
  const { providers, models, selectedModel, setSelectedModel, loading } = useUltr0nModel();

  // Derive diff from last agent message that has a diff property
  const lastDiff = [...ctx.messages].reverse().find(m => m.diff?.length)?.diff ?? [];

  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);

  if (mode === 'minimized') {
    return (
      <button
        data-testid="agent-workspace"
        className="fixed top-0 right-0 z-[99997] flex flex-col items-center justify-center gap-2 w-9 h-screen bg-card hover:bg-accent/20 border-l border-border transition-colors group"
        onClick={onPin}
        title="Expand AURA Agent"
      >
        <span className="absolute top-0 bottom-0 left-0 w-px bg-gradient-to-b from-transparent via-primary/40 to-transparent group-hover:via-primary/80 transition-colors" />
        <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_rgba(137,129,229,0.7)]" />
      </button>
    );
  }

  return (
    <>
      {isVisible && !isPinned && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[99996]"
          onClick={onDismiss}
        />
      )}

      <div
        data-testid="agent-workspace"
        className={cn(
          'fixed top-0 right-0 h-screen flex flex-col z-[99997]',
          'bg-card border-l border-border',
          'shadow-[-24px_0_64px_rgba(0,0,0,0.5),-8px_0_24px_rgba(0,0,0,0.3)]',
          'transition-transform duration-[320ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
          isVisible ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ width: panelWidth }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-primary/70 via-primary/15 to-transparent pointer-events-none" />
        <div
          className="absolute left-0 top-0 h-full w-1 cursor-ew-resize hover:bg-primary/30 transition-colors z-10"
          onMouseDown={onMouseDown}
        />

        {/* Header */}
        <div className="shrink-0 border-b border-border/60">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <ModelSelector
              providers={providers}
              models={models}
              selectedModel={selectedModel}
              onSelect={setSelectedModel}
              loading={loading}
            />
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={onMinimize} title="Minimize" className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onPin}
                title={isPinned ? 'Unpin' : 'Pin open'}
                className={cn('p-1 rounded hover:bg-accent/30 transition-colors', isPinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
              >
                <Pin className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onSetSize(size === 'expanded' ? 'standard' : 'expanded')} title="Toggle expanded" className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors">
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={onClose} title="Close" className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Primary tab bar */}
          <div className="flex border-t border-border/40" role="tablist">
            {(['terminal', 'ops'] as PrimaryTab[]).map(tab => (
              <button
                key={tab}
                role="tab"
                aria-selected={primaryTab === tab}
                onClick={() => onSetPrimaryTab(tab)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium transition-colors border-b-2 capitalize',
                  primaryTab === tab
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab === 'terminal' ? <Terminal className="h-3 w-3" /> : <Settings2 className="h-3 w-3" />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        {primaryTab === 'terminal' ? (
          <div className="flex-1 min-h-0 overflow-hidden">
            <RedQueenShell />
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Ops secondary nav */}
            <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border/40 shrink-0 overflow-x-auto">
              {OPS_PANELS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => onSetActivePanel(id)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs whitespace-nowrap transition-colors',
                    activePanel === id
                      ? 'bg-accent/40 text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/20'
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>

            {/* Ops panel content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {activePanel === 'conversation' && (
                <ConversationStream
                  messages={ctx.messages}
                  isThinking={ctx.isThinking}
                  inputValue={inputValue}
                  isListening={isListening}
                  onInput={setInputValue}
                  onSubmit={() => {
                    if (inputValue.trim()) {
                      ctx.sendMessage(inputValue.trim());
                      setInputValue('');
                    }
                  }}
                  onMicToggle={() => setIsListening(l => !l)}
                  onFeedback={() => {}}
                  onToggleReasoning={() => {}}
                  onFollowUp={chip => ctx.sendMessage(chip)}
                  onConfirmWireless={ctx.confirmWirelessAction}
                  wirelessStage={ctx.wirelessStage}
                  suggestedPrompts={ctx.suggestedPrompts}
                />
              )}
              {activePanel === 'validate' && <ValidationPanel />}
              {activePanel === 'drift' && <DriftPanel />}
              {activePanel === 'execution' && <ExecutionPlanView plan={ctx.pendingPlan} />}
              {activePanel === 'diff' && <ConfigDiffView diff={lastDiff} />}
              {activePanel === 'audit' && <AuditHistoryView entries={ctx.auditEntries} />}
              {activePanel === 'timeline' && <APITimelineView entries={ctx.apiTimeline} />}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- AgentWorkspace --run 2>&1 | tail -20`

Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentCoworker/AgentWorkspace.tsx src/components/AgentCoworker/AgentWorkspace.test.tsx
git commit -m "feat(workspace): add Terminal|Ops primary tabs with 7 sub-panels"
```

---

### Task 6: Wire primaryTab props through AgentCoworker/index.tsx

**Files:**
- Modify: `src/components/AgentCoworker/index.tsx`

`AgentWorkspace` now requires `primaryTab`, `activePanel`, `onSetPrimaryTab`, `onSetActivePanel` props. `useAgentWorkspace()` already provides `primaryTab`, `setPrimaryTab`, `activePanel`, `setActivePanel`.

- [ ] **Step 1: Write the failing test**

This is already covered by the existing `AgentWorkspace.test.tsx` — `index.tsx` is an integration wrapper, not unit-tested separately. Run the full test suite to confirm no new breakage.

Run: `npm run test --run 2>&1 | tail -30`

Expected: all existing tests still pass (the `AgentCoworker` in `index.tsx` will fail TypeScript until we update it in step 3).

- [ ] **Step 2: Verify TypeScript fails on missing props**

Run: `npm run type-check 2>&1 | grep AgentWorkspace | head -10`

Expected: errors about missing `primaryTab`, `activePanel`, `onSetPrimaryTab`, `onSetActivePanel`.

- [ ] **Step 3: Update AgentCoworker/index.tsx**

Replace `src/components/AgentCoworker/index.tsx` with:

```typescript
import { useEffect } from 'react';
import { AgentCommandBar } from './AgentCommandBar';
import { AgentWorkspace } from './AgentWorkspace';
import { useAgentWorkspace } from './useAgentWorkspace';
import { useUltronContext } from '../../contexts/UltronContext';

interface AgentCoworkerProps {
  onShowClientDetail?: (mac: string, name?: string) => void;
  onShowAccessPointDetail?: (serial: string, name?: string) => void;
  onShowSiteDetail?: (siteId: string, siteName: string) => void;
}

export function AgentCoworker(_props: AgentCoworkerProps) {
  const ws = useAgentWorkspace();
  const ctx = useUltronContext();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (ws.mode === 'open' || ws.mode === 'pinned') {
          ws.dismiss();
          ctx.closeUltr0n();
        } else {
          ctx.openUltr0n();
          ws.open();
        }
      }
      if (e.key === 'Escape' && ws.mode === 'open') {
        ctx.closeUltr0n();
        ws.dismiss();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [ctx, ws]);

  return (
    <>
      {ws.mode === 'idle' && (
        <AgentCommandBar
          onOpen={() => {
            ctx.openUltr0n();
            ws.open();
          }}
        />
      )}

      <AgentWorkspace
        mode={ws.mode}
        size={ws.size}
        primaryTab={ws.primaryTab}
        activePanel={ws.activePanel}
        onClose={() => {
          ws.dismiss();
          ctx.closeUltr0n();
        }}
        onMinimize={ws.minimize}
        onPin={ws.pin}
        onDismiss={() => {
          ws.dismiss();
          ctx.closeUltr0n();
        }}
        onSetSize={ws.setSize}
        onSetPrimaryTab={ws.setPrimaryTab}
        onSetActivePanel={ws.setActivePanel}
      />
    </>
  );
}
```

- [ ] **Step 4: Verify TypeScript clean**

Run: `npm run type-check 2>&1 | tail -10`

Expected: zero errors.

- [ ] **Step 5: Run full test suite**

Run: `npm run test --run 2>&1 | tail -30`

Expected: all tests pass (pre-existing failures in `agentService.test.ts` are unrelated and unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/components/AgentCoworker/index.tsx
git commit -m "feat(workspace): wire primaryTab and activePanel through AgentCoworker"
```

---

### Task 7: Final integration and push

**Files:**
- No new files

- [ ] **Step 1: Run full test suite one more time**

Run: `npm run test --run 2>&1 | tail -30`

Expected: all tests pass.

- [ ] **Step 2: Run TypeScript check**

Run: `npm run type-check 2>&1 | tail -10`

Expected: zero errors.

- [ ] **Step 3: Commit and push**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ Two primary tabs (Terminal | Ops) — Task 5
- ✅ Terminal renders RedQueenShell unchanged — Task 5
- ✅ 7 Ops sub-panels: Chat, Validate, Drift, Execution, Diff, Audit, Timeline — Task 5
- ✅ ValidationPanel: form + POST /api/validate/intent + confidence/checks/token — Task 3
- ✅ DriftPanel: GET /api/drift polling + DELETE /api/drift clear — Task 4
- ✅ ConversationStream wired to UltronContext (messages, sendMessage, etc.) — Task 5
- ✅ ExecutionPlanView wired to ctx.pendingPlan — Task 5
- ✅ ConfigDiffView wired to last diff from messages — Task 5
- ✅ AuditHistoryView wired to ctx.auditEntries — Task 5
- ✅ APITimelineView wired to ctx.apiTimeline — Task 5
- ✅ primaryTab state persisted in localStorage — Task 2
- ✅ props threaded through AgentCoworker/index.tsx — Task 6

**No placeholders present.**

**Type consistency:** `PrimaryTab` defined in Task 1, imported in Tasks 2, 5, 6. `ActivePanel` extended in Task 1 with `'validate' | 'drift'`, consumed in Task 5. `AgentWorkspaceProps` extended in Task 5 to match what Task 6 passes.
