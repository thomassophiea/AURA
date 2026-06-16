# Controller-Specific Direct Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the active controller's identity (hostname + Locking ID, live from `/system/info`) as the Site Group identity, and gate Direct Config to a single Site Group target.

**Architecture:** A single `apiService.getControllerIdentity()` fetch resolves hostname + Locking ID from `/system/info`. AppContext holds `activeControllerIdentity` as the one source of truth; `enterSiteGroup()` populates it. A reusable `<ControllerIdentityBadge>` is a dumb reader rendered in the Direct Config header and the Site Group selector. Direct Config refuses edits at org scope until a single Site Group is chosen via the existing `orgSiteGroupFilter`.

**Tech Stack:** React 19, TypeScript 5.7 (strict), Vitest + React Testing Library, Radix UI, Tailwind, Lucide icons.

---

## Toolchain note (read once)

This repo lives on `/Volumes/redq`, where `npx`/`npm run` are broken (non-symlink volume — see project memory). Run tests via the real entry point and commit with `--no-verify`:

```bash
# Run a single test file:
node node_modules/vitest/vitest.mjs run src/path/to/file.test.tsx
# Commit:
git commit --no-verify -m "..."
```
If `node_modules/vitest/vitest.mjs` is absent, use `node node_modules/.bin/../vitest/vitest.mjs` or the path printed by `find node_modules -name vitest.mjs`.

---

## File Structure

- **Create:** `src/types/controllerIdentity.ts` — the `ControllerIdentity` type (one small, focused type file; avoids bloating the 23KB `api.ts` types).
- **Modify:** `src/types/api.ts:779-789` — add `hostName?: string` to `OSOneSystemInfo`.
- **Modify:** `src/services/api.ts` — add `parseOSOneSystemInfo` hostname parse (~`5346`) and a new `getControllerIdentity()` method (after `getOSOneInfo`, ~`5285`).
- **Modify:** `src/contexts/AppContext.tsx` — add `activeControllerIdentity` state + `refreshControllerIdentity()` action; populate on `enterSiteGroup`; clear on `exitSiteGroup`.
- **Create:** `src/components/ControllerIdentityBadge.tsx` — reusable badge (hostname + truncated Locking ID, Radix tooltip).
- **Modify:** `src/components/ConfigureNetworks.tsx` — empty-state gate at org scope + badge in header; fetch identity for the chosen group.
- **Modify:** `src/components/SiteGroupFilterDropdown.tsx` — show identity for the active/selected group.
- **Tests:** colocated `*.test.ts(x)` next to each unit.

---

## Task 1: `ControllerIdentity` type + hostname parsing

**Files:**
- Create: `src/types/controllerIdentity.ts`
- Modify: `src/types/api.ts:779-789` (add `hostName?` to `OSOneSystemInfo`)
- Modify: `src/services/api.ts` (parse `Host Name:` in `parseOSOneSystemInfo`)
- Test: `src/services/api.controllerIdentity.test.ts`

- [ ] **Step 1: Create the type**

`src/types/controllerIdentity.ts`:
```ts
/**
 * In-memory identity of the controller backing the active Site Group.
 * Sourced live from /system/info; never persisted.
 */
export interface ControllerIdentity {
  /** Controller hostname (parsed from /system/info, falls back to URL host). */
  hostname: string;
  /** Locking ID parsed from manufacturing info; empty string if unavailable. */
  lockingId: string;
  /** ISO timestamp of when this identity was fetched. */
  fetchedAt: string;
  /** 'ok' when /system/info responded; 'unreachable' on fetch failure. */
  status: 'ok' | 'unreachable';
}
```

- [ ] **Step 2: Add `hostName` to the system info type**

In `src/types/api.ts`, inside `interface OSOneSystemInfo` (line 779), add after `raw: string;`:
```ts
  /** Controller host name parsed from "Host Name:" line, when present. */
  hostName?: string;
```

- [ ] **Step 3: Write the failing test for hostname parsing**

`src/services/api.controllerIdentity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { apiService } from './api';

describe('parseOSOneSystemInfo hostname', () => {
  it('extracts Host Name from raw system info', () => {
    const raw = 'System Up Time: 1 day\nHost Name: xcc-lab-01\nCPU Utilization: 5.0';
    // @ts-expect-error - exercising the private parser directly
    const parsed = apiService.parseOSOneSystemInfo({ result: raw });
    expect(parsed.hostName).toBe('xcc-lab-01');
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run src/services/api.controllerIdentity.test.ts`
Expected: FAIL — `parsed.hostName` is `undefined`.

- [ ] **Step 5: Implement the hostname parse**

In `src/services/api.ts`, in `parseOSOneSystemInfo`, just before `return parsed;` (~line 5346):
```ts
    // Parse host name
    const hostMatch = result.match(/Host Name:\s*(.+)/i);
    if (hostMatch) {
      parsed.hostName = hostMatch[1].trim();
    }
```

- [ ] **Step 6: Run it to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run src/services/api.controllerIdentity.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/controllerIdentity.ts src/types/api.ts src/services/api.ts src/services/api.controllerIdentity.test.ts
git commit --no-verify -m "feat(direct-config): add ControllerIdentity type and host name parsing"
```

---

## Task 2: `apiService.getControllerIdentity()`

**Files:**
- Modify: `src/services/api.ts` (add method after `getOSOneInfo`, ~line 5285)
- Test: `src/services/api.controllerIdentity.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/services/api.controllerIdentity.test.ts`:
```ts
import { vi, beforeEach, afterEach } from 'vitest';

describe('getControllerIdentity', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns ok identity from /system/info', async () => {
    vi.spyOn(apiService, 'getOSOneInfo').mockResolvedValue({
      system: { raw: '', externalServices: [], uptime: '', cpuUtilization: 0, memoryFreePercent: 0, diskPartitions: [], ports: [], hostName: 'xcc-lab-01' },
      manufacturing: { raw: '', lockingId: '1A2B-3C4D' },
      timestamp: 0,
    } as any);

    const id = await apiService.getControllerIdentity('https://1.2.3.4');
    expect(id.status).toBe('ok');
    expect(id.hostname).toBe('xcc-lab-01');
    expect(id.lockingId).toBe('1A2B-3C4D');
    expect(typeof id.fetchedAt).toBe('string');
  });

  it('falls back to URL host when hostName missing', async () => {
    vi.spyOn(apiService, 'getOSOneInfo').mockResolvedValue({
      system: { raw: '', externalServices: [], uptime: '', cpuUtilization: 0, memoryFreePercent: 0, diskPartitions: [], ports: [] },
      manufacturing: { raw: '', lockingId: '' },
      timestamp: 0,
    } as any);

    const id = await apiService.getControllerIdentity('https://xcc.example.com:5825');
    expect(id.hostname).toBe('xcc.example.com');
    expect(id.status).toBe('ok');
  });

  it('returns unreachable on fetch failure', async () => {
    vi.spyOn(apiService, 'getOSOneInfo').mockRejectedValue(new Error('timeout'));
    const id = await apiService.getControllerIdentity('https://1.2.3.4');
    expect(id.status).toBe('unreachable');
    expect(id.hostname).toBe('1.2.3.4');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run src/services/api.controllerIdentity.test.ts`
Expected: FAIL — `getControllerIdentity is not a function`.

- [ ] **Step 3: Add the import + method**

In `src/services/api.ts`, add to the type import block that already includes `OSOneInfo` (near line 29/127):
```ts
  ControllerIdentity,
```
(import path: these types come from `../types`; add `ControllerIdentity` from `'../types/controllerIdentity'` if the barrel does not re-export it — check `src/types/index.ts` and prefer the barrel.)

Then add the method immediately after `getOSOneInfo` (after line 5285):
```ts
  /**
   * Resolve the active controller's identity (hostname + Locking ID) from
   * /system/info. Live fetch only — never persisted. Falls back the hostname
   * to the controller URL host, and reports 'unreachable' on failure.
   *
   * @param controllerBaseUrl Optional explicit controller base URL (e.g. a
   *   non-active Site Group's controller_url). Used only to derive the host
   *   fallback; the underlying calls use the current API base URL.
   */
  async getControllerIdentity(controllerBaseUrl?: string): Promise<ControllerIdentity> {
    const hostFallback = (() => {
      try {
        return controllerBaseUrl ? new URL(controllerBaseUrl).hostname : '';
      } catch {
        return controllerBaseUrl ?? '';
      }
    })();

    try {
      const info = await this.getOSOneInfo();
      const hostname = info?.system?.hostName?.trim() || hostFallback;
      const lockingId = info?.manufacturing?.lockingId?.trim() || '';
      return {
        hostname,
        lockingId,
        fetchedAt: new Date().toISOString(),
        status: 'ok',
      };
    } catch (error) {
      logger.error('[API] getControllerIdentity failed:', error);
      return {
        hostname: hostFallback,
        lockingId: '',
        fetchedAt: new Date().toISOString(),
        status: 'unreachable',
      };
    }
  }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run src/services/api.controllerIdentity.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/api.ts src/services/api.controllerIdentity.test.ts
git commit --no-verify -m "feat(direct-config): add apiService.getControllerIdentity with host fallback"
```

---

## Task 3: AppContext holds `activeControllerIdentity`

**Files:**
- Modify: `src/contexts/AppContext.tsx`
- Test: `src/contexts/AppContext.controllerIdentity.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/contexts/AppContext.controllerIdentity.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AppContextProvider, useAppContext } from './AppContext';
import { apiService } from '../services/api';
import { tenantService } from '../services/tenantService';

vi.mock('../services/api', () => ({
  apiService: {
    isAuthenticated: () => true,
    setBaseUrl: vi.fn(),
    getControllerIdentity: vi.fn(),
  },
}));
vi.mock('../services/tenantService', () => ({
  tenantService: {
    getCurrentOrganization: () => null,
    getSiteGroups: vi.fn().mockResolvedValue([]),
  },
}));

const SG = { id: 'sg1', name: 'SouthEast', controller_url: 'https://1.2.3.4' } as any;

function Probe() {
  const { activeControllerIdentity, enterSiteGroup } = useAppContext();
  return (
    <div>
      <button onClick={() => enterSiteGroup(SG)}>enter</button>
      <span data-testid="host">{activeControllerIdentity?.hostname ?? 'none'}</span>
    </div>
  );
}

describe('AppContext activeControllerIdentity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('populates identity on enterSiteGroup', async () => {
    (apiService.getControllerIdentity as any).mockResolvedValue({
      hostname: 'xcc-lab-01', lockingId: '1A2B', fetchedAt: 'x', status: 'ok',
    });
    render(
      <AppContextProvider navigationScope="global" onNavigationScopeChange={() => {}}>
        <Probe />
      </AppContextProvider>
    );
    await act(async () => { screen.getByText('enter').click(); });
    await waitFor(() => expect(screen.getByTestId('host')).toHaveTextContent('xcc-lab-01'));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run src/contexts/AppContext.controllerIdentity.test.tsx`
Expected: FAIL — `activeControllerIdentity` is undefined / not on the context value.

- [ ] **Step 3: Implement the context changes**

In `src/contexts/AppContext.tsx`:

Add to imports (line 2 area):
```ts
import type { ControllerIdentity } from '../types/controllerIdentity';
```

Add to the `AppContextValue` interface (after `device: Device | null;`, line 13):
```ts
  /** Identity (hostname + Locking ID) of the active Site Group's controller. */
  activeControllerIdentity: ControllerIdentity | null;
  /** Re-fetch controller identity for a given Site Group (live /system/info). */
  refreshControllerIdentity: (siteGroup: SiteGroup) => Promise<void>;
```

Add state (after line 48):
```ts
  const [activeControllerIdentity, setActiveControllerIdentity] = useState<ControllerIdentity | null>(null);
```

Add the action (after `refreshSiteGroups`, line 110):
```ts
  const refreshControllerIdentity = useCallback(async (sg: SiteGroup) => {
    if (!sg) return;
    const identity = await apiService.getControllerIdentity(sg.controller_url);
    setActiveControllerIdentity(identity);
  }, []);
```

In `enterSiteGroup` (line 112), after `apiService.setBaseUrl(...)` inside the `if (sg)` block:
```ts
      setActiveControllerIdentity(null); // clear stale identity before fetch
      void refreshControllerIdentity(sg);
```
Add `refreshControllerIdentity` to its dependency array.

In `exitSiteGroup` (line 123), add as the first line of the callback body:
```ts
    setActiveControllerIdentity(null);
```

Add both to the provider `value` object (after `device: activeDevice,` ~line 142 and in the actions list):
```ts
      activeControllerIdentity,
      refreshControllerIdentity,
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run src/contexts/AppContext.controllerIdentity.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AppContext.tsx src/contexts/AppContext.controllerIdentity.test.tsx
git commit --no-verify -m "feat(direct-config): track activeControllerIdentity in AppContext"
```

---

## Task 4: `<ControllerIdentityBadge>` component

**Files:**
- Create: `src/components/ControllerIdentityBadge.tsx`
- Test: `src/components/ControllerIdentityBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/ControllerIdentityBadge.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ControllerIdentityBadge } from './ControllerIdentityBadge';

describe('ControllerIdentityBadge', () => {
  it('shows hostname and truncated locking id when ok', () => {
    render(<ControllerIdentityBadge identity={{ hostname: 'xcc-lab-01', lockingId: '1A2B-3C4D-5E6F', fetchedAt: '2026-06-16T00:00:00Z', status: 'ok' }} />);
    expect(screen.getByText('xcc-lab-01')).toBeInTheDocument();
    expect(screen.getByText(/Locking ID/)).toBeInTheDocument();
  });

  it('shows unavailable note when unreachable', () => {
    render(<ControllerIdentityBadge identity={{ hostname: '1.2.3.4', lockingId: '', fetchedAt: '2026-06-16T00:00:00Z', status: 'unreachable' }} />);
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument();
    expect(screen.getByText(/Locking ID unavailable/i)).toBeInTheDocument();
  });

  it('renders nothing when identity is null', () => {
    const { container } = render(<ControllerIdentityBadge identity={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run src/components/ControllerIdentityBadge.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

`src/components/ControllerIdentityBadge.tsx`:
```tsx
import { Server } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import type { ControllerIdentity } from '@/types/controllerIdentity';

interface ControllerIdentityBadgeProps {
  identity: ControllerIdentity | null;
  className?: string;
}

/** Truncate a Locking ID to its first segment + ellipsis for compact display. */
function truncateLockingId(lockingId: string): string {
  if (!lockingId) return '';
  return lockingId.length > 12 ? `${lockingId.slice(0, 12)}…` : lockingId;
}

export function ControllerIdentityBadge({ identity, className }: ControllerIdentityBadgeProps) {
  if (!identity) return null;

  const { hostname, lockingId, fetchedAt, status } = identity;
  const lockingLabel =
    status === 'unreachable' || !lockingId
      ? 'Locking ID unavailable'
      : `Locking ID: ${truncateLockingId(lockingId)}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className ?? ''}`}
          data-testid="controller-identity-badge"
        >
          <Server className="h-3.5 w-3.5" />
          <span className="font-medium text-high-emphasis">{hostname}</span>
          <span aria-hidden>·</span>
          <span>{lockingLabel}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          <div>Controller: {hostname}</div>
          {lockingId && <div>Locking ID: {lockingId}</div>}
          <div className="text-muted-foreground">Fetched: {fetchedAt}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
```
Note: if `ui/tooltip` requires a `<TooltipProvider>` ancestor and the app does not mount one globally, wrap the return in `<TooltipProvider>` (check how other components use `Tooltip` — e.g. grep `TooltipProvider`).

- [ ] **Step 4: Run it to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run src/components/ControllerIdentityBadge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ControllerIdentityBadge.tsx src/components/ControllerIdentityBadge.test.tsx
git commit --no-verify -m "feat(direct-config): add ControllerIdentityBadge component"
```

---

## Task 5: Gate Direct Config + show the badge

**Files:**
- Modify: `src/components/ConfigureNetworks.tsx`
- Test: `src/components/ConfigureNetworks.gate.test.tsx`

Behavior: at org scope (`isOrgScope === true`), require a single Site Group via `orgSiteGroupFilter`. When `orgSiteGroupFilter === null` → render an empty-state prompt and no grid. When set → resolve that group, fetch its identity, show the badge, render the (already filtered) grid. At site-group scope, the single `siteGroup` is the target and `activeControllerIdentity` is already populated.

- [ ] **Step 1: Write the failing test**

`src/components/ConfigureNetworks.gate.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const ctx: any = {
  navigationScope: 'global',
  siteGroups: [{ id: 'sg1', name: 'SouthEast', controller_url: 'https://1.2.3.4' }],
  orgSiteGroupFilter: null,
  setOrgSiteGroupFilter: vi.fn(),
  navigateToTemplateCreation: vi.fn(),
  activeControllerIdentity: null,
  refreshControllerIdentity: vi.fn(),
  siteGroup: null,
};
vi.mock('@/contexts/AppContext', () => ({ useAppContext: () => ctx }));

import ConfigureNetworks from './ConfigureNetworks';

describe('ConfigureNetworks org-scope gate', () => {
  it('shows the empty-state prompt when no Site Group is chosen', () => {
    render(<ConfigureNetworks />);
    expect(screen.getByText(/Select a Site Group to configure its controller/i)).toBeInTheDocument();
  });
});
```
(If `ConfigureNetworks` is a named export, adjust the import. Verify with `grep "export" src/components/ConfigureNetworks.tsx | head`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run src/components/ConfigureNetworks.gate.test.tsx`
Expected: FAIL — prompt text not found.

- [ ] **Step 3: Implement the gate, identity fetch, and badge**

In `src/components/ConfigureNetworks.tsx`:

(a) Extend the context destructure (line 434):
```ts
  const {
    navigationScope,
    siteGroups,
    orgSiteGroupFilter,
    setOrgSiteGroupFilter,
    navigateToTemplateCreation,
    activeControllerIdentity,
    refreshControllerIdentity,
    siteGroup,
  } = useAppContext();
```

(b) Add imports near the top (with the other component imports):
```ts
import { ControllerIdentityBadge } from './ControllerIdentityBadge';
import { SiteGroupFilterDropdown } from './SiteGroupFilterDropdown';
```

(c) Resolve the chosen group + fetch its identity at org scope. After `const isOrgScope = navigationScope === 'global';` (line 436):
```ts
  const chosenOrgGroup = isOrgScope && orgSiteGroupFilter
    ? siteGroups.find((s) => s.id === orgSiteGroupFilter) ?? null
    : null;
  const needsGroupSelection = isOrgScope && !chosenOrgGroup;

  React.useEffect(() => {
    if (chosenOrgGroup) {
      void refreshControllerIdentity(chosenOrgGroup);
    }
  }, [chosenOrgGroup?.id]); // eslint-disable-line react-hooks/exhaustive-deps
```
(If the file imports `useEffect` directly rather than `React`, use the matching style — check the existing imports.)

(d) Render the empty-state prompt early, before the main card return. Find the top-level `return (` of the component body and insert immediately inside it:
```tsx
  if (needsGroupSelection) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Configure Networks</CardTitle>
          <CardDescription>Direct Mode — changes apply on save</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Server className="h-10 w-10 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-base font-medium text-high-emphasis">
              Select a Site Group to configure its controller
            </p>
            <p className="text-sm text-muted-foreground">
              Direct Config writes to one controller at a time. Choose the Site Group
              (controller / gateway) you want to configure.
            </p>
          </div>
          <SiteGroupFilterDropdown />
        </CardContent>
      </Card>
    );
  }
```
Ensure `Server` is imported from `lucide-react` (add to the existing lucide import if missing).

(e) Render the badge in the header, right after the `DIRECT MODE` `</span>` and before `</CardTitle>` (line 1239). The identity to show is `activeControllerIdentity` (populated for both the entered group and the chosen org group):
```tsx
                {activeControllerIdentity && (
                  <ControllerIdentityBadge
                    identity={activeControllerIdentity}
                    className="ml-3"
                  />
                )}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run src/components/ConfigureNetworks.gate.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check the touched file**

Run: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
Expected: no new errors in `ConfigureNetworks.tsx` / `AppContext.tsx`. (If the volume blocks this, note it and rely on the editor/CI.)

- [ ] **Step 6: Commit**

```bash
git add src/components/ConfigureNetworks.tsx src/components/ConfigureNetworks.gate.test.tsx
git commit --no-verify -m "feat(direct-config): gate to one Site Group and show controller identity"
```

---

## Task 6: Show identity in the Site Group selector

**Files:**
- Modify: `src/components/SiteGroupFilterDropdown.tsx`
- Test: `src/components/SiteGroupFilterDropdown.test.tsx`

Behavior (lazy): the currently-selected group's row shows the live `activeControllerIdentity` hostname under its name; other rows show the friendly name only (no eager `/system/info` per group).

- [ ] **Step 1: Write the failing test**

`src/components/SiteGroupFilterDropdown.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const ctx: any = {
  siteGroups: [
    { id: 'sg1', name: 'SouthEast', controller_url: 'https://1.2.3.4' },
    { id: 'sg2', name: 'NorthWest', controller_url: 'https://5.6.7.8' },
  ],
  orgSiteGroupFilter: 'sg1',
  setOrgSiteGroupFilter: vi.fn(),
  activeControllerIdentity: { hostname: 'xcc-lab-01', lockingId: '1A2B', fetchedAt: 'x', status: 'ok' },
};
vi.mock('@/contexts/AppContext', () => ({ useAppContext: () => ctx }));

import { SiteGroupFilterDropdown } from './SiteGroupFilterDropdown';

describe('SiteGroupFilterDropdown identity', () => {
  it('shows the active group hostname in the trigger', () => {
    render(<SiteGroupFilterDropdown />);
    expect(screen.getByText(/xcc-lab-01/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run src/components/SiteGroupFilterDropdown.test.tsx`
Expected: FAIL — hostname not rendered.

- [ ] **Step 3: Implement the identity hint**

In `src/components/SiteGroupFilterDropdown.tsx`, extend the destructure:
```ts
  const { siteGroups, orgSiteGroupFilter, setOrgSiteGroupFilter, activeControllerIdentity } = useAppContext();
```

Add a small hostname hint next to the `<Select>` for the active group. After the closing `</Select>` and before the closing `</div>`:
```tsx
      {orgSiteGroupFilter && activeControllerIdentity?.status === 'ok' && (
        <span className="text-[11px] text-muted-foreground" data-testid="sg-host-hint">
          {activeControllerIdentity.hostname}
        </span>
      )}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run src/components/SiteGroupFilterDropdown.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SiteGroupFilterDropdown.tsx src/components/SiteGroupFilterDropdown.test.tsx
git commit --no-verify -m "feat(direct-config): surface active controller hostname in Site Group selector"
```

---

## Task 7: Full suite + final verification

- [ ] **Step 1: Run the new/affected tests together**

Run:
```bash
node node_modules/vitest/vitest.mjs run \
  src/services/api.controllerIdentity.test.ts \
  src/contexts/AppContext.controllerIdentity.test.tsx \
  src/components/ControllerIdentityBadge.test.tsx \
  src/components/ConfigureNetworks.gate.test.tsx \
  src/components/SiteGroupFilterDropdown.test.tsx
```
Expected: all PASS.

- [ ] **Step 2: Manual smoke (if a controller is reachable)**

With the lab XCC (`https://tsophiea.ddns.net/management`, see project memory), enter a Site Group → confirm the Direct Config header shows hostname + Locking ID; at org scope with "All Site Groups" → confirm the empty-state prompt; pick one group → confirm grid + badge appear.

- [ ] **Step 3: Final commit (if any cleanup)**

```bash
git commit --no-verify -am "chore(direct-config): cleanup after controller-identity feature"
```

---

## Self-Review

**Spec coverage:**
- "hostname + Locking ID, live from `/system/info`" → Tasks 1–2.
- "AppContext single source of truth, populate on enterSiteGroup, clear on exit" → Task 3.
- "reusable badge, unreachable state" → Task 4.
- "Direct Config require one Site Group, empty-state prompt, badge in header" → Task 5.
- "Site Selection shows identity, lazy/active-only" → Task 6.
- Non-goal "no persistence / no eager per-group fetch / no multi-controller apply" → respected (identity is in-memory, only active/chosen group is fetched, gate is single-group).

**Spec correction noted:** the spec assumed hostname was already parsed near `api.ts:5320–5393`; it was not (only `lockingId`). Task 1 adds the `Host Name:` parse with a URL-host fallback — this is the only deviation from the written spec.

**Placeholder scan:** none — every code step shows full code and exact commands.

**Type consistency:** `ControllerIdentity { hostname, lockingId, fetchedAt, status }` is used identically across Tasks 1–6; `getControllerIdentity(controllerBaseUrl?)`, `refreshControllerIdentity(siteGroup)`, and `activeControllerIdentity` names match across context, service, and components.
