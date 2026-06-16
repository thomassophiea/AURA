# Controller-Specific Direct Config — Design

**Date:** 2026-06-16
**Status:** Approved (pending written-spec review)
**Author:** thomassophiea + Claude

## Problem

Configure → Networks runs in **Direct Mode**: edits to WLANs/services apply to the
controller immediately, with no staging. Today the "DIRECT MODE" badge tells you saves
apply instantly, but **not which physical controller/gateway you are writing to**.

A `SiteGroup` already maps 1:1 to a Controller (`SiteGroup.controller_url`,
`tenantService.controllerToSiteGroup()`), and the controller's **Locking ID** is already
parsed from `/system/info` (regex near `api.ts:5373`) — but that identity is discarded and
never surfaced. At Org scope (multiple Site Groups visible), Direct Config currently allows
cross-controller editing, so it is possible to edit without a clear sense of the target box.

We want the **Site Group selection to be, visibly, the controller selection**, identified by
**hostname + Locking ID**, and Direct Config to require a single Site Group before any edit.

## Goals

- Make **hostname + Locking ID** the visible identity of the active Site Group's controller.
- Source that identity **live from `/system/info`** (reuse existing parsing — no new regex).
- In **Direct Config**, require a single Site Group (= one controller) before edits are
  allowed; show the target controller's identity in the header.
- Surface the same identity in **Site Selection** (Site Group selector + Sites & Groups page)
  so choosing a Site Group is visibly choosing a controller/gateway.

## Non-Goals (YAGNI)

- No persistence of identity to the controllers record (live fetch only; an optional
  unreachable-fallback is noted but not built now).
- No multi-controller / "apply to many" editing flow (explicitly require one group).
- No eager fetch of identity for **every** Site Group in the list (lazy: active group only).
- No re-keying of Site Groups on Locking ID (keep current controller id as the key).

## Approach (chosen: A — Context-driven identity)

On `enterSiteGroup()`, AppContext fetches the active controller's `/system/info` once,
extracts `hostname` + `lockingId`, and stores them as `activeControllerIdentity` in context.
A single reusable `<ControllerIdentityBadge>` reads context and renders wherever needed.
The badge is a dumb reader, so the selector and the Direct Config header can never drift.

Rejected:
- **B. Per-component fetch** — duplicate `/system/info` calls; selector and header can show
  inconsistent state.
- **C. Persisted identity on the controllers record** — fights the "live from `/system/info`"
  decision; kept only as a possible future fallback.

## Data Model

New typed identity (in-memory only; not persisted):

```ts
interface ControllerIdentity {
  hostname: string;      // from /system/info
  lockingId: string;     // from /system/info (existing regex)
  fetchedAt: string;     // ISO timestamp; drives staleness tooltip
  status: 'ok' | 'unreachable';
}
```

- Reuse the existing system-info parsing that already reads `lockingId` (and the hostname
  field) into `OSOneInfo` around `api.ts:5320–5393`. Expose hostname + lockingId; add no new
  parsing logic.
- Identity is **not** persisted. It lives in AppContext for the active Site Group and is
  re-fetched on entry. On fetch failure: `status: 'unreachable'`, and the badge shows the
  friendly name with a "Locking ID unavailable" note.

## Components & Wiring

### 1. AppContext (`src/contexts/AppContext.tsx`)
- Add state `activeControllerIdentity: ControllerIdentity | null` and an action
  `refreshControllerIdentity()`.
- In `enterSiteGroup(sg)` — **after** `apiService.setBaseUrl(...)` is applied — fire a single
  `/system/info` fetch, parse hostname + lockingId, dispatch into state.
- Clear identity on site-group exit / change so a stale identity never lingers.
- Expose via `useAppContext()` so every screen reads one source of truth.

### 2. `<ControllerIdentityBadge>` (new, `src/components/`)
- Reads `activeControllerIdentity` from context (or accepts an identity prop for list rows).
- Renders `hostname` + truncated `Locking ID`; tooltip shows full Locking ID + `fetchedAt`.
- `status: 'unreachable'` → shows friendly name + "Locking ID unavailable".
- Radix Tooltip + Tailwind only (per project conventions).

### 3. Direct Config (`src/components/ConfigureNetworks.tsx`)
- When `navigationScope === 'global'` (Org scope) **and** no single Site Group is active:
  render an **empty-state prompt** — *"Select a Site Group to configure its controller"* —
  plus the Site Group picker. **No edits allowed** until one controller is the target.
  (Do **not** auto-select a default group.)
- Once a single Site Group is active: render the grid as today, with
  `<ControllerIdentityBadge>` beside the existing "DIRECT MODE" badge in the header:

  ```
  ┌────────────────────────────────────────────────────────────┐
  │ Configure Networks   [DIRECT MODE]  changes apply on save    │
  │ ▸ Controller:  xcc-lab-01   ·   Locking ID: 1A2B-3C4D-…      │
  └────────────────────────────────────────────────────────────┘
  ```
- If `status: 'unreachable'`: badge shows friendly name + "Locking ID unavailable"; optionally
  soft-warn before save.

### 4. Site Selection
- `SiteGroupFilterDropdown` and the Sites & Groups page entries show the controller identity.
- **Lazy:** only the **active** Site Group gets live `/system/info` identity. Non-active groups
  show their friendly name until entered. (Per-group eager fetch can be added later if wanted.)

## Data Flow

```
User picks Site Group  →  enterSiteGroup(sg)
   →  apiService.setBaseUrl(sg.controller_url + '/management')
   →  fetch /system/info  →  parse { hostname, lockingId }
   →  dispatch activeControllerIdentity { ..., status:'ok'|'unreachable', fetchedAt }
   →  useAppContext() consumers re-render
        →  <ControllerIdentityBadge> in Direct Config header
        →  <ControllerIdentityBadge> in Site Group selector
```

## Error Handling

- `/system/info` fetch fails / times out → `status: 'unreachable'`; UI degrades to friendly
  name + "Locking ID unavailable". Editing is still gated only on a single Site Group being
  active, not on identity success (but an unreachable controller may surface a soft save-warn).
- Site-group change mid-flight: clear identity first, then fetch, so no cross-group leakage.

## Testing

- **Unit:** parsing exposes `hostname` + `lockingId` from a sample `/system/info` payload;
  returns `status: 'unreachable'` on fetch failure.
- **Context:** `enterSiteGroup` populates `activeControllerIdentity`; exit/change clears it.
- **Component:** Direct Config shows the empty-state prompt at Org scope with no group selected;
  shows the badge once a single group is active; `<ControllerIdentityBadge>` renders the
  unreachable state correctly.

## Open Questions / Future

- Optional: persist last-known identity to the controllers record as an unreachable fallback.
- Optional: eager per-group identity fetch so the whole selector list shows hostnames upfront.
- Optional: a hard (not soft) block on save when the target controller is unreachable.
