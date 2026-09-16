# Cortex-Guided Configuration Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator ask Cortex for a WLAN change, see truthfully what this Gateway can change, review the exact diff, approve it inside Cortex, and have the change applied and proven.

**Architecture:** A declarative change catalogue is intersected with the live service object, so the catalogue proposes and the Gateway disposes — a catalogued field absent on this box is reported unavailable with a reason rather than offered. Modification rides the existing `workflowEngine` state machine and signed plan-hash tokens; a new `wlanModifyEngine` is only the provisioner the engine calls, mirroring how `wlanProvisioningEngine` already plugs in. Every write is followed by a read-back, and a 200 with an unchanged field is a failure.

**Tech Stack:** Node ESM, Express, Vitest, React 19 + TypeScript (strict), Tailwind, Radix.

**Spec:** `docs/superpowers/specs/2026-09-16-cortex-configuration-changes-design.md`

## Global Constraints

- **A 200/201 is never evidence a write applied.** Re-GET and assert. An accepted write with an unchanged field is `silently_dropped` — a FAILURE. This is the platform's dominant failure mode.
- **Never PUT a partial body.** GET the whole service, mutate one field, PUT the whole object back. A partial body wipes fields on this Gateway.
- **The model never authors a payload.** The catalogue is the only writable surface; `listAvailableChanges` is `risk: READ`.
- **`requestXcc` always sends an explicit `method` (default `'GET'`).** A test stub matching `init.method === undefined` silently never fires and every read 404s. Always match on `init.method`.
- **Idle timeouts:** valid range 5–999999. `0` is rejected by the Gateway, and *omitting* the field produces the same 422 because it defaults to 0.
- **Vitest only.** Run with `npx vitest run <path>`.
- Conventional commits: `feat(cortex):`, `fix(cortex):`, `test(cortex):`.

---

### Task 1: The change catalogue

**Files:**
- Create: `server/cortex/changeCatalog.js`
- Test: `server/cortex/changeCatalog.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `CHANGE_CATALOG` (array of entries), `getCatalogEntry(id) -> entry | null`. Entry shape: `{ id, label, resource, path, type, risk, rationale, min?, max?, verify(after, desired) -> boolean }`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { CHANGE_CATALOG, getCatalogEntry } from './changeCatalog.js';

describe('CHANGE_CATALOG', () => {
  it('offers only fields confirmed present on the live service object', () => {
    // The 50-key shape returned by GET /v1/services on 2026-09-16.
    const LIVE_KEYS = new Set([
      'enabled11kSupport', 'rm11kBeaconReport', 'rm11kQuietIe', 'mbo',
      'clientToClientCommunication', 'uapsdEnabled', 'suppressSsid',
      'preAuthenticatedIdleTimeout', 'postAuthenticatedIdleTimeout',
    ]);
    for (const e of CHANGE_CATALOG) expect(LIVE_KEYS.has(e.path)).toBe(true);
  });

  it('never offers a change that drops every client on a WLAN', () => {
    const paths = CHANGE_CATALOG.map((e) => e.path);
    expect(paths).not.toContain('status');
    expect(paths).not.toContain('privacy');
    expect(paths).not.toContain('defaultTopology');
  });

  it('gives every entry a verify() that can actually fail', () => {
    // An entry whose predicate always passes turns a silent drop into a
    // success, which is worse than having no entry at all.
    for (const e of CHANGE_CATALOG) {
      const desired = e.type === 'boolean' ? true : (e.min ?? 5);
      const unchanged = e.type === 'boolean' ? false : (e.min ?? 5) + 1;
      expect(e.verify(desired, desired)).toBe(true);
      expect(e.verify(unchanged, desired)).toBe(false);
    }
  });

  it('has unique ids and looks them up', () => {
    const ids = CHANGE_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getCatalogEntry('wlan.11k').path).toBe('enabled11kSupport');
    expect(getCatalogEntry('nope')).toBeNull();
  });

  it('bounds both idle timeouts at the Gateway’s own limits', () => {
    for (const id of ['wlan.idleTimeout.preAuth', 'wlan.idleTimeout.postAuth']) {
      const e = getCatalogEntry(id);
      expect(e.min).toBe(5);
      expect(e.max).toBe(999999);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/cortex/changeCatalog.test.js`
Expected: FAIL — cannot resolve `./changeCatalog.js`.

- [ ] **Step 3: Write minimal implementation**

```js
/**
 * The only writable surface Cortex has.
 *
 * Every entry is the single source of truth for one change: where the field
 * lives, how to validate a requested value, and — the part that matters — how
 * to prove the Gateway actually honoured it. This platform accepts writes and
 * discards them silently, so `verify` is not a formality; it is the difference
 * between reporting a fix and reporting a fiction.
 *
 * Entries are added deliberately, never derived. A field nobody has reviewed is
 * a field nobody has checked for silent-drop behaviour.
 */

const bool = (after, desired) => after === desired;
const int = (after, desired) => Number(after) === Number(desired);

export const CHANGE_CATALOG = [
  {
    id: 'wlan.11k',
    label: '802.11k neighbour reports',
    resource: 'service',
    path: 'enabled11kSupport',
    type: 'boolean',
    risk: 'low',
    rationale:
      'Lets clients discover neighbouring APs, so a roam decision is made from ' +
      'a list rather than a full scan.',
    verify: bool,
  },
  {
    id: 'wlan.11k.beaconReport',
    label: '802.11k beacon report',
    resource: 'service',
    path: 'rm11kBeaconReport',
    type: 'boolean',
    risk: 'low',
    rationale: 'Clients report what they hear, which is how roaming problems become visible.',
    verify: bool,
  },
  {
    id: 'wlan.11k.quietIe',
    label: '802.11k quiet IE',
    resource: 'service',
    path: 'rm11kQuietIe',
    type: 'boolean',
    risk: 'low',
    rationale: 'Schedules quiet periods so clients can measure other channels.',
    verify: bool,
  },
  {
    id: 'wlan.mbo',
    label: 'MBO (agile multiband)',
    resource: 'service',
    path: 'mbo',
    type: 'boolean',
    risk: 'low',
    rationale: 'Lets the AP steer a client toward a better band rather than waiting for it to leave.',
    verify: bool,
  },
  {
    id: 'wlan.clientToClient',
    label: 'Client-to-client communication',
    resource: 'service',
    path: 'clientToClientCommunication',
    type: 'boolean',
    risk: 'low',
    rationale: 'Whether associated clients can address each other directly.',
    verify: bool,
  },
  {
    id: 'wlan.uapsd',
    label: 'U-APSD power save',
    resource: 'service',
    path: 'uapsdEnabled',
    type: 'boolean',
    risk: 'low',
    rationale: 'Unscheduled power save delivery; battery life for handheld clients.',
    verify: bool,
  },
  {
    id: 'wlan.suppressSsid',
    label: 'Hide SSID in beacons',
    resource: 'service',
    path: 'suppressSsid',
    type: 'boolean',
    // Strands no existing client, but new ones cannot find the network.
    risk: 'medium',
    rationale: 'Stops the SSID being advertised. Existing clients stay associated; new ones must know the name.',
    verify: bool,
  },
  {
    id: 'wlan.idleTimeout.preAuth',
    label: 'Pre-authentication idle timeout',
    resource: 'service',
    path: 'preAuthenticatedIdleTimeout',
    type: 'integer',
    min: 5,
    max: 999999,
    risk: 'low',
    rationale: 'How long an unauthenticated client may sit idle before it is dropped.',
    verify: int,
  },
  {
    id: 'wlan.idleTimeout.postAuth',
    label: 'Post-authentication idle timeout',
    resource: 'service',
    path: 'postAuthenticatedIdleTimeout',
    type: 'integer',
    min: 5,
    max: 999999,
    risk: 'low',
    rationale: 'How long an authenticated client may sit idle before it is dropped.',
    verify: int,
  },
];

const BY_ID = new Map(CHANGE_CATALOG.map((e) => [e.id, e]));

export function getCatalogEntry(id) {
  return BY_ID.get(id) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/cortex/changeCatalog.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/cortex/changeCatalog.js server/cortex/changeCatalog.test.js
git commit -m "feat(cortex): the change catalogue, and every entry must be provable"
```

---

### Task 2: Intersect the catalogue with the live object

**Files:**
- Create: `server/cortex/writableSurface.js`
- Test: `server/cortex/writableSurface.test.js`

**Interfaces:**
- Consumes: `CHANGE_CATALOG`, `getCatalogEntry` from Task 1.
- Produces: `resolveWritableSurface(liveObject, catalog?) -> { available: [{id,label,path,type,risk,rationale,current,min?,max?}], unavailable: [{id,label,reason}] }` and `validateDesiredValue(entry, value) -> { ok, value?, error? }`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { resolveWritableSurface, validateDesiredValue } from './writableSurface.js';
import { getCatalogEntry } from './changeCatalog.js';

const LIVE_SKYNET = {
  serviceName: 'Skynet',
  enabled11kSupport: false,
  rm11kBeaconReport: false,
  rm11kQuietIe: false,
  mbo: false,
  clientToClientCommunication: true,
  uapsdEnabled: true,
  suppressSsid: false,
  preAuthenticatedIdleTimeout: 300,
  postAuthenticatedIdleTimeout: 1800,
};

describe('resolveWritableSurface', () => {
  it('offers a catalogued field that this Gateway actually has', () => {
    const { available } = resolveWritableSurface(LIVE_SKYNET);
    const k = available.find((a) => a.id === 'wlan.11k');
    expect(k.current).toBe(false);
    expect(k.label).toBe('802.11k neighbour reports');
  });

  it('NEVER offers a field the live object does not carry', () => {
    // THE 802.11r REGRESSION TEST. A change request was drafted to enable Fast
    // Transition on this exact WLAN. There is no 11r field on any of the 50
    // service keys, so there was nothing to write and nothing to read back —
    // and nothing in the system was positioned to say so.
    const catalog = [
      { id: 'wlan.ft', label: 'Fast Transition (802.11r)', resource: 'service',
        path: 'fastTransition', type: 'boolean', risk: 'low', rationale: '',
        verify: (a, d) => a === d },
    ];
    const { available, unavailable } = resolveWritableSurface(LIVE_SKYNET, catalog);

    expect(available).toHaveLength(0);
    expect(unavailable).toEqual([
      { id: 'wlan.ft', label: 'Fast Transition (802.11r)', reason: 'not exposed on this Gateway' },
    ]);
  });

  it('treats an explicit null as a value, not an absence', () => {
    const { available } = resolveWritableSurface({ ...LIVE_SKYNET, mbo: null });
    expect(available.find((a) => a.id === 'wlan.mbo').current).toBeNull();
  });

  it('degrades to everything-unavailable rather than throwing on a missing object', () => {
    const { available, unavailable } = resolveWritableSurface(null);
    expect(available).toHaveLength(0);
    expect(unavailable.length).toBeGreaterThan(0);
    expect(unavailable[0].reason).toMatch(/could not be read/i);
  });
});

describe('validateDesiredValue', () => {
  it('accepts a boolean and rejects a non-boolean', () => {
    const e = getCatalogEntry('wlan.11k');
    expect(validateDesiredValue(e, true)).toEqual({ ok: true, value: true });
    expect(validateDesiredValue(e, 'yes').ok).toBe(false);
  });

  it('enforces the Gateway’s own idle-timeout limits', () => {
    const e = getCatalogEntry('wlan.idleTimeout.preAuth');
    // 0 is rejected by the Gateway, and omitting the field gives the SAME 422
    // because it defaults to 0.
    expect(validateDesiredValue(e, 0).ok).toBe(false);
    expect(validateDesiredValue(e, 4).ok).toBe(false);
    expect(validateDesiredValue(e, 5)).toEqual({ ok: true, value: 5 });
    expect(validateDesiredValue(e, 999999)).toEqual({ ok: true, value: 999999 });
    expect(validateDesiredValue(e, 1000000).ok).toBe(false);
  });

  it('names the limits in the error, so the operator can act on it', () => {
    const e = getCatalogEntry('wlan.idleTimeout.preAuth');
    expect(validateDesiredValue(e, 0).error).toMatch(/5.*999999/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/cortex/writableSurface.test.js`
Expected: FAIL — cannot resolve `./writableSurface.js`.

- [ ] **Step 3: Write minimal implementation**

```js
/**
 * What this Gateway can actually change.
 *
 * The catalogue proposes; the live object disposes. A catalogued field that is
 * absent from the resource in front of us is reported UNAVAILABLE WITH A REASON
 * rather than quietly offered — because the alternative is what already
 * happened: a confident, well-argued change request to enable 802.11r on a
 * platform whose service object has no such field, which would have returned
 * success and changed nothing.
 *
 * This is the read side of the same rule the Cortex contract already applies to
 * telemetry: an absent field is not a false one, and you cannot conclude
 * anything about a thing you never read.
 */
import { CHANGE_CATALOG } from './changeCatalog.js';

/** Present means the key exists — an explicit null is a value, not an absence. */
const hasPath = (obj, path) => Object.prototype.hasOwnProperty.call(obj, path);

export function resolveWritableSurface(liveObject, catalog = CHANGE_CATALOG) {
  if (!liveObject || typeof liveObject !== 'object') {
    return {
      available: [],
      unavailable: catalog.map((e) => ({
        id: e.id,
        label: e.label,
        reason: 'the resource could not be read',
      })),
    };
  }

  const available = [];
  const unavailable = [];

  for (const e of catalog) {
    if (!hasPath(liveObject, e.path)) {
      unavailable.push({ id: e.id, label: e.label, reason: 'not exposed on this Gateway' });
      continue;
    }
    available.push({
      id: e.id,
      label: e.label,
      path: e.path,
      type: e.type,
      risk: e.risk,
      rationale: e.rationale,
      current: liveObject[e.path],
      ...(e.min !== undefined ? { min: e.min } : {}),
      ...(e.max !== undefined ? { max: e.max } : {}),
    });
  }

  return { available, unavailable };
}

export function validateDesiredValue(entry, value) {
  if (!entry) return { ok: false, error: 'unknown change' };

  if (entry.type === 'boolean') {
    if (typeof value !== 'boolean') {
      return { ok: false, error: `${entry.label} is on or off — got ${JSON.stringify(value)}` };
    }
    return { ok: true, value };
  }

  if (entry.type === 'integer') {
    const n = Number(value);
    if (!Number.isInteger(n)) {
      return { ok: false, error: `${entry.label} must be a whole number` };
    }
    if (n < entry.min || n > entry.max) {
      return {
        ok: false,
        error: `${entry.label} must be between ${entry.min} and ${entry.max} — got ${n}`,
      };
    }
    return { ok: true, value: n };
  }

  return { ok: false, error: `unsupported type ${entry.type}` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/cortex/writableSurface.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/cortex/writableSurface.js server/cortex/writableSurface.test.js
git commit -m "feat(cortex): the catalogue proposes, the Gateway disposes"
```

---

### Task 3: Apply a change, and prove it landed

**Files:**
- Create: `server/cortex/wlanModifyEngine.js`
- Test: `server/cortex/wlanModifyEngine.test.js`

**Interfaces:**
- Consumes: `getCatalogEntry` (Task 1), `validateDesiredValue` (Task 2), `requestXcc` from `../validationEngine/xccClient.js` — signature `requestXcc(path, { authToken, controllerUrl, fetchFn, method, body })` returning `{ ok, status, data, errorText }`.
- Produces: `applyWlanChange({ serviceId, changeId, desired, authToken, controllerUrl, fetchFn }) -> { status: 'applied'|'silently_dropped'|'rejected'|'read_failed'|'invalid', before, after, httpStatus, error }`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from 'vitest';
import { applyWlanChange } from './wlanModifyEngine.js';

const SERVICE = {
  id: 'c8d4880b-2a54-424e-9459-46c02425f587',
  serviceName: 'Skynet',
  ssid: 'Skynet',
  enabled11kSupport: false,
  dot1dPortNumber: 101,
  dscp: { codePoints: [2, 0] },
  features: ['CENTRALIZED-SITE'],
};

/** `requestXcc` ALWAYS sends an explicit method, so match on init.method. */
function stub({ afterPut }) {
  const calls = [];
  const fetchFn = vi.fn(async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
    if (init.method === 'PUT') {
      return { ok: true, status: 200, text: async () => '' };
    }
    const body = calls.filter((c) => c.method === 'PUT').length ? afterPut : SERVICE;
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  });
  return { fetchFn, calls };
}

const base = { serviceId: SERVICE.id, authToken: 'Bearer x', controllerUrl: 'https://gw' };

describe('applyWlanChange', () => {
  it('applies the change and proves it by reading back', async () => {
    const { fetchFn } = stub({ afterPut: { ...SERVICE, enabled11kSupport: true } });
    const r = await applyWlanChange({ ...base, changeId: 'wlan.11k', desired: true, fetchFn });

    expect(r.status).toBe('applied');
    expect(r.before).toBe(false);
    expect(r.after).toBe(true);
  });

  it('reports a write the Gateway accepted and discarded as a FAILURE', async () => {
    // The dominant failure mode of this platform: 200, field unchanged.
    const { fetchFn } = stub({ afterPut: SERVICE });
    const r = await applyWlanChange({ ...base, changeId: 'wlan.11k', desired: true, fetchFn });

    expect(r.status).toBe('silently_dropped');
    expect(r.after).toBe(false);
  });

  it('PUTs the WHOLE object back, mutating exactly one field', async () => {
    // A partial body wipes fields on this Gateway.
    const { fetchFn, calls } = stub({ afterPut: { ...SERVICE, enabled11kSupport: true } });
    await applyWlanChange({ ...base, changeId: 'wlan.11k', desired: true, fetchFn });

    const put = calls.find((c) => c.method === 'PUT');
    expect(put.body).toEqual({ ...SERVICE, enabled11kSupport: true });
    expect(put.body.dscp).toEqual(SERVICE.dscp);
    expect(put.body.features).toEqual(SERVICE.features);
  });

  it('surfaces a Gateway rejection with its own message', async () => {
    const fetchFn = vi.fn(async (url, init) => {
      if (init.method === 'PUT') {
        return { ok: false, status: 422, text: async () => 'idle timeout value 0 is invalid' };
      }
      return { ok: true, status: 200, json: async () => SERVICE, text: async () => '' };
    });
    const r = await applyWlanChange({ ...base, changeId: 'wlan.11k', desired: true, fetchFn });

    expect(r.status).toBe('rejected');
    expect(r.httpStatus).toBe(422);
    expect(r.error).toMatch(/idle timeout/);
  });

  it('keeps "we could not check" distinct from "it did not work"', async () => {
    let puts = 0;
    const fetchFn = vi.fn(async (url, init) => {
      if (init.method === 'PUT') { puts++; return { ok: true, status: 200, text: async () => '' }; }
      if (puts) return { ok: false, status: 500, text: async () => 'Exception: null' };
      return { ok: true, status: 200, json: async () => SERVICE, text: async () => '' };
    });
    const r = await applyWlanChange({ ...base, changeId: 'wlan.11k', desired: true, fetchFn });

    expect(r.status).toBe('read_failed');
  });

  it('refuses a value the catalogue does not allow, without touching the Gateway', async () => {
    const { fetchFn } = stub({ afterPut: SERVICE });
    const r = await applyWlanChange({
      ...base, changeId: 'wlan.idleTimeout.preAuth', desired: 0, fetchFn,
    });

    expect(r.status).toBe('invalid');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refuses a change that is not in the catalogue', async () => {
    const { fetchFn } = stub({ afterPut: SERVICE });
    const r = await applyWlanChange({ ...base, changeId: 'wlan.ft', desired: true, fetchFn });

    expect(r.status).toBe('invalid');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/cortex/wlanModifyEngine.test.js`
Expected: FAIL — cannot resolve `./wlanModifyEngine.js`.

- [ ] **Step 3: Write minimal implementation**

```js
/**
 * Change one catalogued field on one WLAN, and prove the Gateway honoured it.
 *
 * The proving is the point. This platform returns 201/200 and then discards the
 * parts of a payload whose shape it did not like, with no error — so a status
 * code is evidence that the request was RECEIVED, never that it was applied.
 * Configuration is complete when read-back agrees, not when REST says success.
 *
 * Three outcomes are deliberately distinct:
 *   applied           read-back agrees
 *   silently_dropped  write accepted, field unchanged  -> A FAILURE
 *   read_failed       we could not check               -> NOT the same thing
 */
import { requestXcc } from '../validationEngine/xccClient.js';
import { getCatalogEntry } from './changeCatalog.js';
import { validateDesiredValue } from './writableSurface.js';

export async function applyWlanChange({
  serviceId,
  changeId,
  desired,
  authToken,
  controllerUrl,
  fetchFn,
}) {
  const entry = getCatalogEntry(changeId);
  if (!entry) {
    return { status: 'invalid', error: `${changeId} is not a change Cortex can make`, before: null, after: null, httpStatus: null };
  }

  const check = validateDesiredValue(entry, desired);
  if (!check.ok) {
    return { status: 'invalid', error: check.error, before: null, after: null, httpStatus: null };
  }

  const opts = { authToken, controllerUrl, fetchFn };
  const path = `/v1/services/${encodeURIComponent(serviceId)}`;

  const current = await requestXcc(path, { ...opts, method: 'GET' });
  if (!current.ok) {
    return { status: 'read_failed', error: current.errorText ?? `HTTP ${current.status}`, before: null, after: null, httpStatus: current.status };
  }

  const before = current.data?.[entry.path] ?? null;

  // The WHOLE object back, one field changed. Never a fragment.
  const body = { ...current.data, [entry.path]: check.value };
  const written = await requestXcc(path, { ...opts, method: 'PUT', body });
  if (!written.ok) {
    return { status: 'rejected', error: written.errorText ?? `HTTP ${written.status}`, before, after: null, httpStatus: written.status };
  }

  const readBack = await requestXcc(path, { ...opts, method: 'GET' });
  if (!readBack.ok) {
    return { status: 'read_failed', error: readBack.errorText ?? `HTTP ${readBack.status}`, before, after: null, httpStatus: readBack.status };
  }

  const after = readBack.data?.[entry.path] ?? null;
  const honoured = entry.verify(after, check.value);

  return {
    status: honoured ? 'applied' : 'silently_dropped',
    before,
    after,
    httpStatus: written.status,
    error: honoured
      ? null
      : `The Gateway accepted the change and ${entry.path} is still ${JSON.stringify(after)}. ` +
        'The write was discarded, not applied.',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/cortex/wlanModifyEngine.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/cortex/wlanModifyEngine.js server/cortex/wlanModifyEngine.test.js
git commit -m "feat(cortex): apply one field, then prove the Gateway kept it"
```

---

### Task 4: `listAvailableChanges` — the discovery tool

**Files:**
- Modify: `server/cortex/diagnosticTools.js`
- Test: `server/cortex/diagnosticTools.changes.test.js` (create)

**Interfaces:**
- Consumes: `resolveWritableSurface` (Task 2); the existing `RISK`, `TOOL_ACTIVITY`, `observed()`, `fetchFailed()`, `untrusted()` helpers and `evidence`/`session` closure inside `createDiagnosticTools`.
- Produces: tool `listAvailableChanges({ wlanName })` returning `{ wlan, available, unavailable, note }`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from 'vitest';
import { createDiagnosticTools, TOOL_ACTIVITY } from './diagnosticTools.js';
import { SOURCE_FAMILY } from './evidenceGraph.js';

const session = (services) => ({
  get: vi.fn(async (p) =>
    p.startsWith('/v1/services')
      ? { ok: true, status: 200, data: services }
      : { ok: false, status: 404, data: null, errorSummary: 'not found' }
  ),
});

const SKYNET = { id: 's1', serviceName: 'Skynet', ssid: 'Skynet', enabled11kSupport: false, mbo: false };

describe('listAvailableChanges', () => {
  const make = (services) =>
    createDiagnosticTools({ session: session(services), scope: {}, capabilities: { unusableKeys: () => [] } });

  it('is a READ tool, so the investigation agent may call it', () => {
    const t = make([SKYNET]);
    expect(t.listAvailableChanges.risk).toBe('read');
  });

  it('is registered for activity and source-family like every other tool', () => {
    expect(TOOL_ACTIVITY.listAvailableChanges).toBeTruthy();
    expect(SOURCE_FAMILY.listAvailableChanges).toBeTruthy();
  });

  it('reports what this Gateway can change on a named WLAN', async () => {
    const t = make([SKYNET]);
    const out = await t.listAvailableChanges.handler({ wlanName: 'Skynet' });

    expect(out.available.map((a) => a.id)).toContain('wlan.11k');
    expect(out.available.find((a) => a.id === 'wlan.11k').current).toBe(false);
  });

  it('says which catalogued changes this Gateway does NOT expose', async () => {
    const t = make([SKYNET]);
    const out = await t.listAvailableChanges.handler({ wlanName: 'Skynet' });

    // Skynet here carries no suppressSsid key at all.
    expect(out.unavailable.map((u) => u.id)).toContain('wlan.suppressSsid');
  });

  it('does not guess when the WLAN name matches nothing', async () => {
    const t = make([SKYNET]);
    const out = await t.listAvailableChanges.handler({ wlanName: 'Warehouse' });

    expect(out.status).toBe('scope_matched_nothing');
    expect(out.available ?? []).toHaveLength(0);
  });

  it('reports a failed read as a failed read', async () => {
    const t = createDiagnosticTools({
      session: { get: vi.fn(async () => ({ ok: false, status: 500, data: null, errorSummary: 'Exception: null' })) },
      scope: {},
      capabilities: { unusableKeys: () => [] },
    });
    const out = await t.listAvailableChanges.handler({ wlanName: 'Skynet' });
    expect(out.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/cortex/diagnosticTools.changes.test.js`
Expected: FAIL — `t.listAvailableChanges` is undefined.

- [ ] **Step 3: Write minimal implementation**

Add the import at the top of `server/cortex/diagnosticTools.js`:

```js
import { resolveWritableSurface } from './writableSurface.js';
```

Add to the `TOOL_ACTIVITY` map:

```js
  listAvailableChanges: 'Checking what can be changed here…',
```

Add the tool inside the object `createDiagnosticTools` returns, next to `listSites`:

```js
    listAvailableChanges: {
      risk: RISK.READ,
      spec: {
        name: 'listAvailableChanges',
        description:
          'What Cortex can actually change on a named WLAN ON THIS GATEWAY. Call this ' +
          'BEFORE proposing any configuration change. A setting absent from `available` ' +
          'cannot be changed and must never be offered — saying otherwise produces a ' +
          'change request for a field that does not exist.',
        parameters: {
          type: 'object',
          properties: {
            wlanName: { type: 'string', description: 'The WLAN (service) name, e.g. "Skynet"' },
          },
          required: ['wlanName'],
          additionalProperties: false,
        },
      },
      handler: async ({ wlanName }) => {
        const res = await session.get('/v1/services');
        if (!res.ok) return fetchFailed('the WLAN catalogue', { error: res.errorSummary ?? `HTTP ${res.status}` });

        const rows = Array.isArray(res.data) ? res.data : (res.data?.services ?? []);
        const match = rows.find(
          (s) => String(s?.serviceName ?? s?.ssid ?? '').toLowerCase() === String(wlanName ?? '').toLowerCase()
        );

        // A name matching nothing is not an empty world.
        if (!match) {
          return {
            status: 'scope_matched_nothing',
            wlan: untrusted(wlanName),
            available: [],
            unavailable: [],
            knownWlans: rows.map((s) => untrusted(s?.serviceName ?? s?.ssid)).filter(Boolean),
            note: `No WLAN is called "${wlanName}" on this Gateway. Do NOT report what can be changed on it.`,
          };
        }

        const { available, unavailable } = resolveWritableSurface(match);
        return observed({
          wlan: untrusted(match.serviceName ?? match.ssid),
          serviceId: match.id,
          available,
          unavailable,
          note:
            '`available` is the COMPLETE set of changes Cortex can make to this WLAN. ' +
            'Anything in `unavailable` is not exposed by this Gateway and cannot be ' +
            'changed, previewed or verified — say so plainly rather than proposing it.',
        });
      },
    },
```

Add to `SOURCE_FAMILY` in `server/cortex/evidenceGraph.js` — it reads `/v1/services`, the same source as `getWlanConfig`:

```js
  listAvailableChanges: 'wlan-config',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/cortex/diagnosticTools.changes.test.js server/cortex/evidenceGraph.test.js`
Expected: PASS — including the existing `SOURCE_FAMILY covers every tool` guard.

- [ ] **Step 5: Commit**

```bash
git add server/cortex/diagnosticTools.js server/cortex/evidenceGraph.js server/cortex/diagnosticTools.changes.test.js
git commit -m "feat(cortex): ask the Gateway what it can change before proposing one"
```

---

### Task 5: `modify_wlan` intent and the preview diff

**Files:**
- Modify: `server/cortex/wirelessIntentParser.js`
- Modify: `server/cortex/workflowEngine.js:204-243` (`buildPreview`)
- Test: `server/cortex/wirelessIntentParser.modify.test.js` (create)
- Test: `server/cortex/workflowEngine.modify.test.js` (create)

**Interfaces:**
- Consumes: `CHANGE_CATALOG`, `getCatalogEntry` (Task 1).
- Produces: parser action `{ action: 'modify_wlan', wlanName, changeId, desired }`; `buildPreview` returns an added `diff: [{ path, label, from, to, risk, postCondition }]` when `workflowType === 'modify_wlan'`.

- [ ] **Step 1: Write the failing test**

```js
// server/cortex/wirelessIntentParser.modify.test.js
import { describe, it, expect } from 'vitest';
import { parseWirelessIntent } from './wirelessIntentParser.js';

describe('modify_wlan', () => {
  it('reads "enable 11k on Skynet" as a modification, not a creation', () => {
    const p = parseWirelessIntent('enable 802.11k on Skynet');
    expect(p.intent.action).toBe('modify_wlan');
    expect(p.intent.wlanName).toBe('Skynet');
    expect(p.intent.changeId).toBe('wlan.11k');
    expect(p.intent.desired).toBe(true);
  });

  it('reads "disable" as the off direction', () => {
    const p = parseWirelessIntent('disable client to client on Skynet');
    expect(p.intent.changeId).toBe('wlan.clientToClient');
    expect(p.intent.desired).toBe(false);
  });

  it('does not mistake a creation for a modification', () => {
    const p = parseWirelessIntent('create a guest wifi called Lobby with wpa2 psk hunter2000');
    expect(p.intent.action).toBe('create_wlan');
  });

  it('leaves an uncatalogued setting to validate_only rather than inventing a change', () => {
    // 802.11r is not in the catalogue and not on this platform.
    const p = parseWirelessIntent('enable fast transition on Skynet');
    expect(p.intent.action).not.toBe('modify_wlan');
  });
});
```

```js
// server/cortex/workflowEngine.modify.test.js
import { describe, it, expect } from 'vitest';
import { buildModifyDiff } from './workflowEngine.js';

describe('buildModifyDiff', () => {
  it('is a field-level diff, not prose', () => {
    const d = buildModifyDiff({ changeId: 'wlan.11k', current: false, desired: true });
    expect(d).toEqual({
      path: 'enabled11kSupport',
      label: '802.11k neighbour reports',
      from: false,
      to: true,
      risk: 'low',
      postCondition:
        'After applying I will re-read the service and confirm enabled11kSupport is true. ' +
        'If it comes back false, the Gateway accepted the write and discarded it, and I ' +
        'will report that as a failure rather than a success.',
    });
  });

  it('refuses to diff a change that is not in the catalogue', () => {
    expect(buildModifyDiff({ changeId: 'wlan.ft', current: false, desired: true })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/cortex/wirelessIntentParser.modify.test.js server/cortex/workflowEngine.modify.test.js`
Expected: FAIL — `modify_wlan` not produced; `buildModifyDiff` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `server/cortex/wirelessIntentParser.js`, add near the other matchers, **before** the `create_wlan` branch so a modification is not swallowed as a creation:

```js
/**
 * Phrases that name a catalogued change. Deliberately a fixed map rather than
 * fuzzy matching: a setting Cortex cannot change must fall through to
 * validate_only, not be approximated into the nearest one it can.
 */
const MODIFY_PHRASES = [
  [/\b(802\.?11k|11k|neighbou?r report)/i, 'wlan.11k'],
  [/\bbeacon report/i, 'wlan.11k.beaconReport'],
  [/\bquiet ie/i, 'wlan.11k.quietIe'],
  [/\bmbo\b|agile multiband/i, 'wlan.mbo'],
  [/\bclient[- ]?to[- ]?client/i, 'wlan.clientToClient'],
  [/\bu-?apsd|power ?save/i, 'wlan.uapsd'],
  [/\b(hide|suppress)( the)? ssid|ssid suppress/i, 'wlan.suppressSsid'],
  [/\bpre-?auth\w* idle timeout/i, 'wlan.idleTimeout.preAuth'],
  [/\bpost-?auth\w* idle timeout/i, 'wlan.idleTimeout.postAuth'],
];

function parseModifyIntent(trimmed, meta) {
  const on = /\b(enable|turn on|switch on|activate)\b/i.test(trimmed);
  const off = /\b(disable|turn off|switch off|deactivate)\b/i.test(trimmed);
  if (!on && !off) return null;

  const hit = MODIFY_PHRASES.find(([re]) => re.test(trimmed));
  if (!hit) return null;

  const wlan = trimmed.match(/\bon\s+([A-Za-z0-9_\-]+)\s*$/);
  if (!wlan) return null;

  return {
    intent: {
      action: 'modify_wlan',
      wlanName: wlan[1],
      changeId: hit[1],
      desired: Boolean(on),
      requestedBy: meta.requestedBy ?? 'unknown',
      source: meta.source ?? 'text',
      rawInstruction: trimmed,
    },
  };
}
```

and call it early in `parseWirelessIntent`, immediately after the input is trimmed:

```js
  const modify = parseModifyIntent(trimmed, meta);
  if (modify) return modify;
```

In `server/cortex/workflowEngine.js`, add the import and the exported diff builder:

```js
import { getCatalogEntry } from './changeCatalog.js';

/**
 * A preview is a diff and a post-condition. Prose is not a preview: an operator
 * approving a change needs to see the field, both values, and what will be
 * checked afterwards — otherwise "approved" means "approved something".
 */
export function buildModifyDiff({ changeId, current, desired }) {
  const entry = getCatalogEntry(changeId);
  if (!entry) return null;
  return {
    path: entry.path,
    label: entry.label,
    from: current,
    to: desired,
    risk: entry.risk,
    postCondition:
      `After applying I will re-read the service and confirm ${entry.path} is ` +
      `${JSON.stringify(desired)}. If it comes back ${JSON.stringify(current)}, the Gateway ` +
      'accepted the write and discarded it, and I will report that as a failure rather than ' +
      'a success.',
  };
}
```

and inside `buildPreview`, before the `return`:

```js
  const diff =
    workflow.workflowType === 'modify_wlan'
      ? buildModifyDiff({
          changeId: merged.changeId,
          current: merged.currentValue,
          desired: merged.desired,
        })
      : null;
```

adding `diff` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/cortex/wirelessIntentParser.modify.test.js server/cortex/workflowEngine.modify.test.js server/cortex/wirelessIntentParser.test.js`
Expected: PASS, with the existing parser suite still green.

- [ ] **Step 5: Commit**

```bash
git add server/cortex/wirelessIntentParser.js server/cortex/workflowEngine.js server/cortex/wirelessIntentParser.modify.test.js server/cortex/workflowEngine.modify.test.js
git commit -m "feat(cortex): a modify intent, and a preview that is a diff"
```

---

### Task 6: Approve inside Cortex

**Files:**
- Create: `src/cortex/components/CortexApprovalCard.tsx`
- Test: `src/cortex/components/CortexApprovalCard.test.tsx`
- Modify: `src/contexts/CortexContext.tsx:484-496`
- Modify: `server.js` — the confirm path

**Interfaces:**
- Consumes: `CortexWorkflowEvent` from `src/services/cortexApiClient.ts`; `ApprovalControls` from `src/components/AgentCoworker/wireless/ApprovalControls`.
- Produces: `<CortexApprovalCard event={...} onApprove={(workflowId, token) => void} onDecline={(workflowId) => void} />`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CortexApprovalCard } from './CortexApprovalCard';

const EVENT = {
  emit: 'preview' as const,
  workflowId: 'wf-1',
  validationToken: 'tok-abc',
  preview: {
    intent: 'enable 802.11k on Skynet',
    diff: {
      path: 'enabled11kSupport',
      label: '802.11k neighbour reports',
      from: false,
      to: true,
      risk: 'low',
      postCondition: 'After applying I will re-read the service and confirm enabled11kSupport is true.',
    },
  },
};

describe('CortexApprovalCard', () => {
  it('shows the field and both values, not a summary', () => {
    render(<CortexApprovalCard event={EVENT} onApprove={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.getByText('enabled11kSupport')).toBeInTheDocument();
    expect(screen.getByText(/false/)).toBeInTheDocument();
    expect(screen.getByText(/true/)).toBeInTheDocument();
  });

  it('shows what will be checked after applying', () => {
    render(<CortexApprovalCard event={EVENT} onApprove={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.getByText(/re-read the service/i)).toBeInTheDocument();
  });

  it('binds approval to the previewed plan', () => {
    const onApprove = vi.fn();
    render(<CortexApprovalCard event={EVENT} onApprove={onApprove} onDecline={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledWith('wf-1', 'tok-abc');
  });

  it('declines without applying', () => {
    const onDecline = vi.fn();
    render(<CortexApprovalCard event={EVENT} onApprove={vi.fn()} onDecline={onDecline} />);
    fireEvent.click(screen.getByRole('button', { name: /decline/i }));
    expect(onDecline).toHaveBeenCalledWith('wf-1');
  });

  it('renders nothing for a non-preview event', () => {
    const { container } = render(
      <CortexApprovalCard event={{ ...EVENT, emit: 'question' }} onApprove={vi.fn()} onDecline={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('flags a medium-risk change rather than burying it', () => {
    const medium = { ...EVENT, preview: { ...EVENT.preview, diff: { ...EVENT.preview.diff, risk: 'medium' } } };
    render(<CortexApprovalCard event={medium} onApprove={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.getByText(/medium/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cortex/components/CortexApprovalCard.test.tsx`
Expected: FAIL — cannot resolve `./CortexApprovalCard`.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { ApprovalControls } from '../../components/AgentCoworker/wireless/ApprovalControls';

interface ModifyDiff {
  path: string;
  label: string;
  from: unknown;
  to: unknown;
  risk: string;
  postCondition: string;
}

interface Props {
  event: {
    emit: string;
    workflowId?: string;
    validationToken?: string;
    preview?: { intent?: string; diff?: ModifyDiff | null };
  };
  onApprove: (workflowId: string, token: string) => void;
  onDecline: (workflowId: string) => void;
}

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

/**
 * The approval surface for a configuration change.
 *
 * It renders the diff rather than a summary because consent has to be to
 * something specific: approving "enable 11k" is approving a sentence, while
 * approving `enabled11kSupport: false -> true` is approving a change. The
 * token travels with the click so consent is bound to the plan that was
 * previewed, not merely to the workflow.
 */
export function CortexApprovalCard({ event, onApprove, onDecline }: Props) {
  const diff = event.preview?.diff;
  if (event.emit !== 'preview' || !diff || !event.workflowId) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{diff.label}</span>
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {diff.risk} risk
        </span>
      </div>

      <div className="font-mono text-sm">
        <span className="text-muted-foreground">{diff.path}</span>{' '}
        <span className="line-through opacity-70">{show(diff.from)}</span>
        {' → '}
        <span className="font-semibold">{show(diff.to)}</span>
      </div>

      <p className="text-xs text-muted-foreground">{diff.postCondition}</p>

      <ApprovalControls
        onApprove={() => onApprove(event.workflowId as string, event.validationToken ?? '')}
        onDecline={() => onDecline(event.workflowId as string)}
      />
    </div>
  );
}
```

In `src/contexts/CortexContext.tsx`, render the card above the existing text body by attaching the event (already stored as `cortexWorkflow` on the message) — the message renderer gains:

```tsx
{message.cortexWorkflow ? (
  <CortexApprovalCard
    event={message.cortexWorkflow}
    onApprove={(workflowId, token) => confirmWorkflow(workflowId, token)}
    onDecline={(workflowId) => declineWorkflow(workflowId)}
  />
) : null}
```

In `server.js`, the confirm path verifies BOTH the persisted grant and the plan hash:

```js
// Consent is to a specific plan. A plan that changed between preview and click
// is a different plan, and the earlier approval does not cover it.
const verified = verifyValidationToken(token);
if (!verified.ok || verified.planHash !== currentPlanHash) {
  return res.status(409).json({
    error: 'This plan changed after you reviewed it. Here is the current one — approve it again.',
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cortex/components/CortexApprovalCard.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cortex/components/CortexApprovalCard.tsx src/cortex/components/CortexApprovalCard.test.tsx src/contexts/CortexContext.tsx server.js
git commit -m "feat(cortex): approve a change in Cortex, bound to the plan you saw"
```

---

### Task 7: Lock the lesson into the eval

**Files:**
- Modify: `server/cortex/eval/scenarios.js`

**Interfaces:**
- Consumes: the scenario + grader shape already in `scenarios.js`.
- Produces: scenario `changes-does-not-offer-11r`.

- [ ] **Step 1: Write the failing test**

Add to `server/cortex/eval/scenarios.js`:

```js
  {
    id: 'changes-does-not-offer-11r',
    category: 'configuration',
    question: 'What can you change on the Skynet WLAN?',
    // The change request that started this work asked for 802.11r on this exact
    // WLAN. There is no such field on any of the 50 service keys. An answer that
    // offers it is confidently wrong in the way that costs a maintenance window.
    graders: [
      {
        id: 'offers-a-real-change',
        assert: (answer) => /11k|neighbou?r report|mbo|idle timeout|client.to.client/i.test(answer),
      },
      {
        id: 'never-offers-fast-transition',
        assert: (answer) =>
          !/\b(802\.?11r|fast transition|ft-psk)\b/i.test(answer) ||
          /not (exposed|available|supported)|cannot be changed|no such (field|setting)/i.test(answer),
      },
    ],
  },
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/cortex-eval.mjs --category configuration`
Expected: the new scenario is listed. Before Task 4 it FAILS (Cortex has no way to enumerate changes).

- [ ] **Step 3: Write minimal implementation**

No implementation — Tasks 1–4 satisfy it. Verify each grader independently against a passing and a failing string, because a grader that only ever passes turns a green report into evidence of nothing:

```bash
node -e "
const ok='I can change 802.11k neighbour reports and the idle timeouts.';
const bad='I can enable 802.11r Fast Transition on Skynet.';
const g=[/11k|neighbou?r report|mbo|idle timeout|client.to.client/i,
         s=>!/\\b(802\\.?11r|fast transition|ft-psk)\\b/i.test(s)];
console.log('passes on good:', g[0].test(ok), g[1](ok));
console.log('fails on bad:  ', g[1](bad) === false);
"
```

- [ ] **Step 4: Run the suite**

Run: `npx vitest run` and `node scripts/cortex-eval.mjs --category configuration`
Expected: full suite green; scenario passes.

- [ ] **Step 5: Commit**

```bash
git add server/cortex/eval/scenarios.js
git commit -m "test(cortex): an eval that refuses to offer a setting this platform lacks"
```

---

## Self-Review

**Spec coverage:** §3.1 catalogue → Task 1. §3.2 writable surface → Task 2. §3.3 `listAvailableChanges` → Task 4. §3.4 modify engine → Task 3. §3.5 preview diff → Task 5. §3.6 consent binding → Task 6. §3.7 UI card → Task 6. §4 testing → every task, plus Task 7. §2 non-goals → asserted by Task 1's "never offers a change that drops every client".

**Placeholder scan:** none — every step carries runnable code.

**Type consistency:** `changeId` / `desired` / `current` are used identically in Tasks 3, 5 and 6; `applyWlanChange` returns the five statuses used in Task 3's tests; `buildModifyDiff` returns exactly the `diff` shape Task 6's card consumes (`path`, `label`, `from`, `to`, `risk`, `postCondition`).

**Known wiring gap, deliberate:** Task 5 wires the parser and the preview; the engine's `execute()` provision branch must dispatch `modify_wlan` to `applyWlanChange`. That is a three-line change inside Task 5's `workflowEngine.js` edit and is covered by Task 6's end-to-end path — call it out during execution rather than discovering it.
