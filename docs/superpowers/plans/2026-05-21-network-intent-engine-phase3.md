# Network Intent Engine Phase 3 — Backend Validation Service

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side validation engine to AURA that exposes REST endpoints for pre-provision intent validation, drift monitoring, and rollback, with Ultr0n able to query drift state conversationally.

**Architecture:** Pure-function validators (no HTTP deps) are orchestrated by an Express Router that handles all XCC fetching. A singleton DriftMonitor polls for topology/AP changes. Ultr0n gains a `getDriftAlerts` tool via a resolver pattern (no controller HTTP needed). All new code lives in `server/validationEngine/`.

**Tech Stack:** Node.js ESM, Express Router, Vitest, existing `fetchXcc` helper (new), existing `requireAuth`/`jsonParser` middleware from `server.js`.

---

## File Structure

```
server/validationEngine/
  xccClient.js                   # thin fetch wrapper — reused by router + driftMonitor
  confidenceAggregator.js        # pure: implements scoring formula from validation-rules.md
  vlanValidator.js               # pure: check VLAN in topology array
  dhcpValidator.js               # pure: check dhcpMode + dhcpServers on a topology object
  lldpTopologyResolver.js        # pure: check VLAN trunking from LLDP neighbor array
  rfCapacityAnalyzer.js          # pure: check SSID count + 6GHz band compat on profiles
  rollbackEngine.js              # in-memory snapshot store (save/get/delete/list)
  driftMonitor.js                # polling service: topology + AP change detection
  validationRouter.js            # Express router: all /api/validate/*, /api/drift, /api/rollback/*

server/ultr0n/
  toolDispatcher.js              # MODIFY: add registerResolver() + resolver dispatch branch
  toolCatalog.js                 # MODIFY: add getDriftAlerts tool spec (resolver-based)

server.js                        # MODIFY: import + mount validationRouter, register resolver
```

**Key invariants:**
- Validators are pure functions: `(data) => result`. No `fetch` calls inside them.
- The router does all XCC HTTP. Inject `fetchFn` for tests.
- `driftMonitor` is a singleton. Route handlers call `driftMonitor.configure(creds)` to refresh auth before `poll()`.
- `toolDispatcher` checks for a registered resolver before making an HTTP call.

---

### Task 1: xccClient.js + confidenceAggregator.js

**Files:**
- Create: `server/validationEngine/xccClient.js`
- Create: `server/validationEngine/xccClient.test.js`
- Create: `server/validationEngine/confidenceAggregator.js`
- Create: `server/validationEngine/confidenceAggregator.test.js`

- [ ] **Step 1: Write the failing tests**

`server/validationEngine/xccClient.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { fetchXcc } from './xccClient.js';

describe('fetchXcc', () => {
  it('fetches and returns JSON on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: '1', vlanid: 10 }],
    });
    const result = await fetchXcc('/v1/topologies', {
      authToken: 'Bearer tok',
      controllerUrl: 'https://ctrl.local',
      fetchFn: mockFetch,
    });
    expect(result).toEqual([{ id: '1', vlanid: 10 }]);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://ctrl.local/api/management/v1/topologies',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('throws with status code on non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false, status: 401, text: async () => 'Unauthorized', statusText: 'Unauthorized',
    });
    await expect(
      fetchXcc('/v1/topologies', { authToken: 'Bearer bad', controllerUrl: 'https://ctrl.local', fetchFn: mockFetch })
    ).rejects.toThrow('401');
  });
});
```

`server/validationEngine/confidenceAggregator.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { aggregateConfidence } from './confidenceAggregator.js';

const ALL_PASS = [
  { name: 'vlan_exists', result: 'pass' },
  { name: 'dhcp_scope', result: 'pass' },
  { name: 'switch_trunk', result: 'pass' },
  { name: 'ap_model_support', result: 'pass' },
  { name: 'ssid_count_limit', result: 'pass' },
  { name: 'rf_capacity', result: 'pass' },
  { name: 'band_compatibility', result: 'pass' },
];

describe('aggregateConfidence', () => {
  it('returns HIGH (≥80) when all checks pass', () => {
    const { score, band } = aggregateConfidence(ALL_PASS);
    expect(score).toBeGreaterThanOrEqual(80);
    expect(band).toBe('HIGH');
  });

  it('caps at score=40 and band=LOW when a blocking check fails', () => {
    const checks = [
      { name: 'vlan_exists', result: 'fail' },
      { name: 'dhcp_scope', result: 'pass' },
    ];
    const { score, band, blockingFailures } = aggregateConfidence(checks);
    expect(score).toBe(40);
    expect(band).toBe('LOW');
    expect(blockingFailures).toContain('vlan_exists');
  });

  it('applies operationalPattern multiplier ×1.20 when no blocking failures', () => {
    const withMult = aggregateConfidence(ALL_PASS, { operationalPattern: true });
    const without = aggregateConfidence(ALL_PASS);
    expect(withMult.score).toBeGreaterThan(without.score);
  });

  it('does NOT apply multiplier when a blocking check failed', () => {
    const checks = [{ name: 'vlan_exists', result: 'fail' }];
    expect(aggregateConfidence(checks, { operationalPattern: true }).score).toBe(40);
  });

  it('returns band=BLOCK when any check has result=block', () => {
    const checks = [{ name: 'ssid_count_limit', result: 'block' }];
    expect(aggregateConfidence(checks).band).toBe('BLOCK');
  });

  it('includes warn check names in warnings array', () => {
    const checks = [
      ...ALL_PASS.filter(c => c.name !== 'switch_trunk'),
      { name: 'switch_trunk', result: 'warn' },
    ];
    const { warnings } = aggregateConfidence(checks);
    expect(warnings).toContain('switch_trunk');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run server/validationEngine/xccClient.test.js server/validationEngine/confidenceAggregator.test.js
```
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create xccClient.js**

`server/validationEngine/xccClient.js`:
```js
import https from 'node:https';

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

export async function fetchXcc(path, { authToken, controllerUrl, fetchFn } = {}) {
  const fn = fetchFn ?? globalThis.fetch;
  const url = `${controllerUrl}/api/management${path}`;
  const init = {
    method: 'GET',
    headers: {
      Authorization: authToken ?? '',
      'Content-Type': 'application/json',
    },
  };
  if (!fetchFn && url.startsWith('https')) {
    init.agent = insecureAgent;
  }
  const resp = await fn(url, init);
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`${resp.status} ${path}: ${msg}`);
  }
  return resp.json();
}
```

- [ ] **Step 4: Create confidenceAggregator.js**

`server/validationEngine/confidenceAggregator.js`:
```js
const CONTRIBUTIONS = {
  vlan_exists:        { pass: 15, warn: 0,  fail: -25, blocking: true },
  dhcp_scope:         { pass: 10, warn: 2,  fail: -15, blocking: false },
  switch_trunk:       { pass: 12, warn: 2,  fail: -10, blocking: false },
  ap_model_support:   { pass: 8,  warn: 0,  fail: -20, blocking: true },
  ssid_count_limit:   { pass: 8,  warn: 3,  fail: -20, blocking: true },
  rf_capacity:        { pass: 5,  warn: 2,  fail: -5,  blocking: false },
  band_compatibility: { pass: 5,  warn: 0,  fail: -8,  blocking: false },
};

export function aggregateConfidence(checks, multipliers = {}) {
  // Hard limit: any 'block' result → BLOCK immediately
  const hardBlocks = checks.filter(c => c.result === 'block');
  if (hardBlocks.length > 0) {
    return { score: 0, band: 'BLOCK', blockingFailures: hardBlocks.map(c => c.name), warnings: [] };
  }

  let score = 50;
  const warnings = [];

  for (const check of checks) {
    const contrib = CONTRIBUTIONS[check.name];
    if (!contrib) continue;
    score += contrib[check.result] ?? 0;
    if (check.result === 'warn') warnings.push(check.name);
  }

  // Blocking check gate: cap at 40 if any blocking check failed
  const blockingFailures = checks
    .filter(c => CONTRIBUTIONS[c.name]?.blocking && c.result === 'fail')
    .map(c => c.name);

  if (blockingFailures.length > 0) {
    return { score: 40, band: 'LOW', blockingFailures, warnings };
  }

  // Multipliers (only when no blocking failures)
  if (multipliers.operationalPattern) score *= 1.20;
  if (multipliers.identicalService) score *= 1.10;

  score = Math.min(100, Math.round(score));
  const band = score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW';

  return { score, band, blockingFailures: [], warnings };
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run server/validationEngine/xccClient.test.js server/validationEngine/confidenceAggregator.test.js
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add server/validationEngine/xccClient.js server/validationEngine/xccClient.test.js server/validationEngine/confidenceAggregator.js server/validationEngine/confidenceAggregator.test.js
git commit -m "feat(validation): xccClient fetch helper + confidence aggregator"
```

---

### Task 2: vlanValidator.js + dhcpValidator.js

**Files:**
- Create: `server/validationEngine/vlanValidator.js`
- Create: `server/validationEngine/vlanValidator.test.js`
- Create: `server/validationEngine/dhcpValidator.js`
- Create: `server/validationEngine/dhcpValidator.test.js`

Field name reminder from gotchas.md: topology fields use `vlanid` (lowercase d), `name`, `dhcpMode`, `dhcpServers`.

- [ ] **Step 1: Write failing tests**

`server/validationEngine/vlanValidator.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { validateVlanExists } from './vlanValidator.js';

const topologies = [
  { id: 'a1', name: 'Corp', vlanid: 1, dhcpMode: 'DHCPRelay', dhcpServers: '10.0.0.1' },
  { id: 'b2', name: 'Guest', vlanid: 120, dhcpMode: 'DHCPRelay', dhcpServers: '10.1.120.1' },
];

describe('validateVlanExists', () => {
  it('returns pass when vlan found', () => {
    const r = validateVlanExists(topologies, 120);
    expect(r.result).toBe('pass');
    expect(r.topology.name).toBe('Guest');
    expect(r.evidence).toContain('120');
  });

  it('returns fail when vlan not found', () => {
    const r = validateVlanExists(topologies, 999);
    expect(r.result).toBe('fail');
    expect(r.topology).toBeNull();
    expect(r.evidence).toContain('999');
  });

  it('returns fail for non-array input', () => {
    const r = validateVlanExists(null, 1);
    expect(r.result).toBe('fail');
  });

  it('matches vlanid by number equality (not string)', () => {
    // vlanid is a number in XCC responses — confirm no coercion issues
    expect(validateVlanExists(topologies, '120').result).toBe('fail'); // string '120' should not match
    expect(validateVlanExists(topologies, 120).result).toBe('pass');
  });
});
```

`server/validationEngine/dhcpValidator.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { validateDhcp } from './dhcpValidator.js';

describe('validateDhcp', () => {
  it('returns pass for DHCPRelay with server configured', () => {
    const r = validateDhcp({ name: 'Corp', dhcpMode: 'DHCPRelay', dhcpServers: '10.0.0.1' });
    expect(r.result).toBe('pass');
    expect(r.evidence).toContain('DHCPRelay');
  });

  it('returns warn for DHCPNone', () => {
    const r = validateDhcp({ name: 'Corp', dhcpMode: 'DHCPNone', dhcpServers: '' });
    expect(r.result).toBe('warn');
  });

  it('returns warn for DHCPRelay with empty dhcpServers', () => {
    const r = validateDhcp({ name: 'Corp', dhcpMode: 'DHCPRelay', dhcpServers: '' });
    expect(r.result).toBe('warn');
    expect(r.evidence).toContain('empty');
  });

  it('returns pass for DHCPLocal (no relay needed)', () => {
    const r = validateDhcp({ name: 'Corp', dhcpMode: 'DHCPLocal', dhcpServers: '' });
    expect(r.result).toBe('pass');
  });

  it('returns fail when topology is null', () => {
    expect(validateDhcp(null).result).toBe('fail');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run server/validationEngine/vlanValidator.test.js server/validationEngine/dhcpValidator.test.js
```
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create vlanValidator.js**

`server/validationEngine/vlanValidator.js`:
```js
export function validateVlanExists(topologies, vlanId) {
  if (!Array.isArray(topologies)) {
    return {
      result: 'fail',
      topology: null,
      evidence: 'GET /v1/topologies → response is not an array',
    };
  }
  const match = topologies.find(t => t.vlanid === vlanId);
  if (!match) {
    return {
      result: 'fail',
      topology: null,
      evidence: `GET /v1/topologies → no topology with vlanid=${vlanId} (${topologies.length} checked)`,
    };
  }
  return {
    result: 'pass',
    topology: match,
    evidence: `GET /v1/topologies → id=${match.id} name='${match.name}' vlanid=${match.vlanid}`,
  };
}
```

- [ ] **Step 4: Create dhcpValidator.js**

`server/validationEngine/dhcpValidator.js`:
```js
export function validateDhcp(topology) {
  if (!topology) {
    return { result: 'fail', evidence: 'No topology provided for DHCP check' };
  }
  const { name, dhcpMode, dhcpServers } = topology;
  if (!dhcpMode || dhcpMode === 'DHCPNone') {
    return {
      result: 'warn',
      evidence: `topology '${name}': dhcpMode=${dhcpMode ?? 'unset'} — no DHCP configured on this VLAN`,
    };
  }
  if (dhcpMode === 'DHCPRelay' && (!dhcpServers || String(dhcpServers).trim() === '')) {
    return {
      result: 'warn',
      evidence: `topology '${name}': dhcpMode=DHCPRelay but dhcpServers is empty`,
    };
  }
  return {
    result: 'pass',
    evidence: `topology '${name}': dhcpMode=${dhcpMode} dhcpServers='${dhcpServers ?? 'local'}'`,
  };
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run server/validationEngine/vlanValidator.test.js server/validationEngine/dhcpValidator.test.js
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add server/validationEngine/vlanValidator.js server/validationEngine/vlanValidator.test.js server/validationEngine/dhcpValidator.js server/validationEngine/dhcpValidator.test.js
git commit -m "feat(validation): VLAN existence + DHCP validators (pure functions)"
```

---

### Task 3: lldpTopologyResolver.js

**Files:**
- Create: `server/validationEngine/lldpTopologyResolver.js`
- Create: `server/validationEngine/lldpTopologyResolver.test.js`

LLDP field notes from gotchas.md:
- Response is a bare JSON array (not wrapped object).
- Empty `{}` entries are normal — filter by `systemName || switchPort`.
- Extreme Switch Engine 4220 does NOT expose `vlanMembership` → always WARN, never FAIL for those neighbors.
- Port field is `switchPort` (not `portId`).

- [ ] **Step 1: Write failing tests**

`server/validationEngine/lldpTopologyResolver.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { resolveLldpForVlan } from './lldpTopologyResolver.js';

const trunked = n => ({
  switchPort: '1', systemName: 'sw1',
  vlanMembership: { tagged: [120], untagged: [] },
  ...n,
});

const missing = n => ({
  switchPort: '2', systemName: 'sw1',
  vlanMembership: { tagged: [1, 2], untagged: [1] },
  ...n,
});

const extreme = n => ({ switchPort: '3', systemName: 'EX4220', ...n }); // no vlanMembership

describe('resolveLldpForVlan', () => {
  it('returns pass when all APs have the VLAN trunked', () => {
    const lldpByAp = [
      { apSerial: 'AP1', neighbors: [trunked()] },
      { apSerial: 'AP2', neighbors: [trunked()] },
    ];
    const r = resolveLldpForVlan(lldpByAp, 120);
    expect(r.result).toBe('pass');
    expect(r.affectedAps).toHaveLength(0);
  });

  it('returns fail when ≥50% of APs are missing the VLAN', () => {
    const lldpByAp = [
      { apSerial: 'AP1', neighbors: [missing()] },
      { apSerial: 'AP2', neighbors: [missing()] },
      { apSerial: 'AP3', neighbors: [trunked()] },
    ];
    // 2 of 3 missing = 67% → fail
    const r = resolveLldpForVlan(lldpByAp, 120);
    expect(r.result).toBe('fail');
    expect(r.affectedAps.some(s => s.includes('AP1'))).toBe(true);
  });

  it('returns warn when <50% of APs are missing the VLAN', () => {
    const lldpByAp = [
      { apSerial: 'AP1', neighbors: [missing()] },
      { apSerial: 'AP2', neighbors: [trunked()] },
      { apSerial: 'AP3', neighbors: [trunked()] },
    ];
    const r = resolveLldpForVlan(lldpByAp, 120);
    expect(r.result).toBe('warn');
  });

  it('returns warn (not fail) for Extreme switch with no vlanMembership', () => {
    const lldpByAp = [
      { apSerial: 'AP1', neighbors: [extreme()] },
      { apSerial: 'AP2', neighbors: [extreme()] },
    ];
    // All indeterminate due to Extreme switch — should be warn, not fail
    const r = resolveLldpForVlan(lldpByAp, 120);
    expect(r.result).toBe('warn');
  });

  it('filters out empty neighbor entries', () => {
    const lldpByAp = [
      { apSerial: 'AP1', neighbors: [{}, trunked()] }, // empty entry + real entry
    ];
    const r = resolveLldpForVlan(lldpByAp, 120);
    expect(r.result).toBe('pass');
  });

  it('returns warn when lldpByAp is empty', () => {
    expect(resolveLldpForVlan([], 120).result).toBe('warn');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run server/validationEngine/lldpTopologyResolver.test.js
```
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create lldpTopologyResolver.js**

`server/validationEngine/lldpTopologyResolver.js`:
```js
export function resolveLldpForVlan(lldpByAp, vlanId) {
  if (!lldpByAp?.length) {
    return { result: 'warn', affectedAps: [], evidence: 'No LLDP data available for any AP' };
  }

  const failing = [];
  const indeterminate = [];

  for (const { apSerial, neighbors } of lldpByAp) {
    const active = (neighbors ?? []).filter(n => n.systemName || n.switchPort);
    if (!active.length) {
      indeterminate.push(`${apSerial}:no-neighbors`);
      continue;
    }
    const neighbor = active[0]; // check primary uplink neighbor
    if (!neighbor.vlanMembership) {
      // Extreme Switch Engine 4220 — never expose VLAN membership via LLDP
      indeterminate.push(`${apSerial}:no-vlanMembership`);
      continue;
    }
    const tagged = Array.isArray(neighbor.vlanMembership.tagged) ? neighbor.vlanMembership.tagged : [];
    const untagged = Array.isArray(neighbor.vlanMembership.untagged) ? neighbor.vlanMembership.untagged : [];
    if (!tagged.includes(vlanId) && !untagged.includes(vlanId)) {
      failing.push(`${apSerial}(port:${neighbor.switchPort})`);
    }
  }

  const total = lldpByAp.length;
  if (failing.length >= Math.ceil(total / 2)) {
    return {
      result: 'fail',
      affectedAps: failing,
      evidence: `${failing.length}/${total} APs missing VLAN ${vlanId} on uplink trunk: ${failing.join(', ')}`,
    };
  }
  if (failing.length > 0 || indeterminate.length > 0) {
    const affected = [...failing, ...indeterminate];
    return {
      result: 'warn',
      affectedAps: affected,
      evidence: `VLAN ${vlanId} trunk: ${failing.length} failing, ${indeterminate.length} indeterminate of ${total} APs`,
    };
  }
  return {
    result: 'pass',
    affectedAps: [],
    evidence: `All ${total} APs confirmed VLAN ${vlanId} on uplink trunks`,
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run server/validationEngine/lldpTopologyResolver.test.js
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/validationEngine/lldpTopologyResolver.js server/validationEngine/lldpTopologyResolver.test.js
git commit -m "feat(validation): LLDP topology resolver — VLAN trunk check per AP"
```

---

### Task 4: rfCapacityAnalyzer.js

**Files:**
- Create: `server/validationEngine/rfCapacityAnalyzer.js`
- Create: `server/validationEngine/rfCapacityAnalyzer.test.js`

Profile field notes from gotchas.md:
- Profile name is `name` (not `profileName`).
- Radio band is in `radios[].radioName` (e.g. `"Radio 3 - 6 GHz"`), not `radios[].band`.
- `radioIfList` entries contain `{serviceId, index}` only.
- `radioIfList` can exceed 8 — API does NOT enforce the limit at write time.

Returns two check results: `ssidResult` (maps to `ssid_count_limit` check) and `bandResult` (maps to `band_compatibility` check).

- [ ] **Step 1: Write failing tests**

`server/validationEngine/rfCapacityAnalyzer.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { analyzeRfCapacity } from './rfCapacityAnalyzer.js';

function makeProfile(name, ssidCountOnRadio1, hasRadio6Ghz = false) {
  const radioIfList = Array.from({ length: ssidCountOnRadio1 }, (_, i) => ({
    serviceId: `svc-${i}`,
    index: 1,
  }));
  const radios = [
    { radioName: 'Radio 1 - 2.4 GHz', adminState: true, index: 1 },
    { radioName: 'Radio 2 - 5 GHz', adminState: true, index: 2 },
    ...(hasRadio6Ghz ? [{ radioName: 'Radio 3 - 6 GHz', adminState: true, index: 3 }] : []),
  ];
  return { name, radioIfList, radios };
}

describe('analyzeRfCapacity', () => {
  it('returns pass for profiles with headroom', () => {
    const profiles = [makeProfile('Site-A', 4), makeProfile('Site-B', 3)];
    const { ssidResult } = analyzeRfCapacity(profiles, 'WPA2-PSK');
    expect(ssidResult.result).toBe('pass');
  });

  it('returns warn when a profile has 7 SSIDs on a radio', () => {
    const profiles = [makeProfile('Site-A', 7)];
    const { ssidResult } = analyzeRfCapacity(profiles, 'WPA2-PSK');
    expect(ssidResult.result).toBe('warn');
    expect(ssidResult.evidence).toContain('Site-A');
  });

  it('returns block when a profile has 8 SSIDs on a radio', () => {
    const profiles = [makeProfile('Site-A', 8)];
    const { ssidResult } = analyzeRfCapacity(profiles, 'WPA2-PSK');
    expect(ssidResult.result).toBe('block');
    expect(ssidResult.evidence).toContain('8/8');
  });

  it('returns band warn when WPA2-PSK targets a profile with a 6GHz radio', () => {
    const profiles = [makeProfile('Site-A', 2, true)];
    const { bandResult } = analyzeRfCapacity(profiles, 'WPA2-PSK');
    expect(bandResult.result).toBe('warn');
    expect(bandResult.evidence).toContain('6 GHz');
  });

  it('returns band pass when WPA3-SAE targets a profile with a 6GHz radio', () => {
    const profiles = [makeProfile('Site-A', 2, true)];
    const { bandResult } = analyzeRfCapacity(profiles, 'WPA3-SAE');
    expect(bandResult.result).toBe('pass');
  });

  it('returns pass for empty profile list', () => {
    const { ssidResult } = analyzeRfCapacity([], 'WPA2-PSK');
    expect(ssidResult.result).toBe('pass');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run server/validationEngine/rfCapacityAnalyzer.test.js
```
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create rfCapacityAnalyzer.js**

`server/validationEngine/rfCapacityAnalyzer.js`:
```js
const SIX_GHZ = /6\s*ghz/i;
const WPA2_PSK_INCOMPATIBLE = SIX_GHZ;

export function analyzeRfCapacity(profiles, targetSecurity) {
  const ssidCounts = [];
  let bandWarned = false;

  for (const profile of profiles ?? []) {
    // Count SSIDs per radio index
    const perRadio = {};
    for (const entry of profile.radioIfList ?? []) {
      perRadio[entry.index] = (perRadio[entry.index] ?? 0) + 1;
    }
    const maxSsids = Object.values(perRadio).length > 0 ? Math.max(...Object.values(perRadio)) : 0;
    ssidCounts.push({ name: profile.name, maxSsids });

    // Band compatibility: WPA2-PSK on 6 GHz is silently dropped (gotchas.md)
    if (!bandWarned && targetSecurity === 'WPA2-PSK') {
      for (const radio of profile.radios ?? []) {
        if (WPA2_PSK_INCOMPATIBLE.test(radio.radioName ?? '')) {
          bandWarned = true;
          break;
        }
      }
    }
  }

  // SSID count result
  const blockedProfiles = ssidCounts.filter(p => p.maxSsids >= 8);
  const warnProfiles = ssidCounts.filter(p => p.maxSsids === 7);

  let ssidResult;
  if (blockedProfiles.length > 0) {
    ssidResult = {
      result: 'block',
      evidence: `${blockedProfiles.length} profile(s) at 8/8 SSIDs/radio: ${blockedProfiles.map(p => p.name).join(', ')}`,
    };
  } else if (warnProfiles.length > 0) {
    ssidResult = {
      result: 'warn',
      evidence: `${warnProfiles.length} profile(s) at 7/8 SSIDs/radio: ${warnProfiles.map(p => p.name).join(', ')}`,
    };
  } else {
    const avg = ssidCounts.length > 0
      ? (ssidCounts.reduce((s, p) => s + p.maxSsids, 0) / ssidCounts.length).toFixed(1)
      : 0;
    ssidResult = {
      result: 'pass',
      evidence: `${ssidCounts.length} profile(s) checked; avg ${avg} SSIDs/radio`,
    };
  }

  const bandResult = bandWarned
    ? { result: 'warn', evidence: 'WPA2-PSK on a 6 GHz radio will be silently dropped (gotchas.md §Profile/radio binding)' }
    : { result: 'pass', evidence: 'Band/security compatibility OK' };

  return { ssidResult, bandResult };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run server/validationEngine/rfCapacityAnalyzer.test.js
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/validationEngine/rfCapacityAnalyzer.js server/validationEngine/rfCapacityAnalyzer.test.js
git commit -m "feat(validation): RF capacity analyzer — SSID count + 6GHz band compat"
```

---

### Task 5: rollbackEngine.js

**Files:**
- Create: `server/validationEngine/rollbackEngine.js`
- Create: `server/validationEngine/rollbackEngine.test.js`

In-memory store. Snapshots are keyed by `auditId`. Each snapshot is opaque — the caller stores whatever it needs to undo a provision. The engine provides lifecycle management only.

- [ ] **Step 1: Write failing tests**

`server/validationEngine/rollbackEngine.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { RollbackEngine } from './rollbackEngine.js';

describe('RollbackEngine', () => {
  let engine;
  beforeEach(() => { engine = new RollbackEngine(); });

  it('saves and retrieves a snapshot', () => {
    engine.save('audit-1', { serviceId: 'svc-abc', profiles: [1, 2, 3] });
    const snap = engine.get('audit-1');
    expect(snap.serviceId).toBe('svc-abc');
    expect(snap.savedAt).toBeDefined();
  });

  it('returns null for unknown auditId', () => {
    expect(engine.get('nope')).toBeNull();
  });

  it('deletes a snapshot', () => {
    engine.save('audit-2', { serviceId: 'x' });
    engine.delete('audit-2');
    expect(engine.get('audit-2')).toBeNull();
  });

  it('lists all snapshots with auditId and savedAt', () => {
    engine.save('a1', { serviceId: 'svc1' });
    engine.save('a2', { serviceId: 'svc2' });
    const list = engine.list();
    expect(list).toHaveLength(2);
    expect(list.map(s => s.auditId)).toContain('a1');
    expect(list[0]).not.toHaveProperty('serviceId'); // snapshot data not leaked in list
  });

  it('overwrites an existing snapshot on re-save', () => {
    engine.save('audit-3', { serviceId: 'old' });
    engine.save('audit-3', { serviceId: 'new' });
    expect(engine.get('audit-3').serviceId).toBe('new');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run server/validationEngine/rollbackEngine.test.js
```
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create rollbackEngine.js**

`server/validationEngine/rollbackEngine.js`:
```js
export class RollbackEngine {
  #snapshots = new Map();

  save(auditId, snapshot) {
    this.#snapshots.set(auditId, { ...snapshot, savedAt: new Date().toISOString() });
  }

  get(auditId) {
    return this.#snapshots.get(auditId) ?? null;
  }

  delete(auditId) {
    this.#snapshots.delete(auditId);
  }

  list() {
    return [...this.#snapshots.entries()].map(([auditId, { savedAt }]) => ({ auditId, savedAt }));
  }
}

export const rollbackEngine = new RollbackEngine();
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run server/validationEngine/rollbackEngine.test.js
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/validationEngine/rollbackEngine.js server/validationEngine/rollbackEngine.test.js
git commit -m "feat(validation): rollback engine — in-memory pre-provision snapshot store"
```

---

### Task 6: driftMonitor.js

**Files:**
- Create: `server/validationEngine/driftMonitor.js`
- Create: `server/validationEngine/driftMonitor.test.js`

Tracks topology (VLAN) and AP-profile assignment changes. On each poll, compares current XCC state to last known state. Alert format: `{ type, detail, detectedAt }`.

Alert types: `topology_removed`, `topology_added`, `ap_profile_changed`.

`configure()` updates auth credentials. `poll()` is async — callable directly for tests and manually from routes. `startPolling()` / `stopPolling()` manage the interval. On 401, the monitor stops and marks itself `authExpired`.

- [ ] **Step 1: Write failing tests**

`server/validationEngine/driftMonitor.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DriftMonitor } from './driftMonitor.js';

function makeTopologies(items) {
  return items.map(([id, name, vlanid]) => ({ id, name, vlanid }));
}

function makeAps(items) {
  // /v1/aps returns { data: [...] } with apSerialNum + apAssignedProfileId
  return { data: items.map(([apSerialNum, apAssignedProfileId]) => ({ apSerialNum, apAssignedProfileId })) };
}

describe('DriftMonitor', () => {
  let monitor;
  beforeEach(() => { monitor = new DriftMonitor(); });

  it('returns empty alerts on first poll (no prior state)', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeTopologies([['t1', 'Corp', 1]]) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeAps([['AP1', 'profile-A']]) });

    monitor.configure({ authToken: 'Bearer tok', controllerUrl: 'https://ctrl', fetchFn: mockFetch });
    await monitor.poll();

    expect(monitor.getAlerts()).toHaveLength(0);
  });

  it('detects topology_removed when a topology disappears', async () => {
    const fetchFirst = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeTopologies([['t1', 'Corp', 1], ['t2', 'Guest', 120]]) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeAps([]) });

    monitor.configure({ authToken: 'Bearer tok', controllerUrl: 'https://ctrl', fetchFn: fetchFirst });
    await monitor.poll(); // establish baseline

    const fetchSecond = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeTopologies([['t1', 'Corp', 1]]) }) // t2 removed
      .mockResolvedValueOnce({ ok: true, json: async () => makeAps([]) });

    monitor.configure({ authToken: 'Bearer tok', controllerUrl: 'https://ctrl', fetchFn: fetchSecond });
    await monitor.poll();

    const alerts = monitor.getAlerts();
    expect(alerts.some(a => a.type === 'topology_removed' && a.detail.includes('120'))).toBe(true);
  });

  it('detects ap_profile_changed when an AP switches profile', async () => {
    const fetchFirst = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeTopologies([['t1', 'Corp', 1]]) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeAps([['AP1', 'profile-A']]) });

    monitor.configure({ authToken: 'Bearer tok', controllerUrl: 'https://ctrl', fetchFn: fetchFirst });
    await monitor.poll();

    const fetchSecond = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeTopologies([['t1', 'Corp', 1]]) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeAps([['AP1', 'profile-B']]) }); // profile changed

    monitor.configure({ authToken: 'Bearer tok', controllerUrl: 'https://ctrl', fetchFn: fetchSecond });
    await monitor.poll();

    const alerts = monitor.getAlerts();
    expect(alerts.some(a => a.type === 'ap_profile_changed' && a.detail.includes('AP1'))).toBe(true);
  });

  it('clears alerts', async () => {
    monitor.configure({ authToken: 'Bearer tok', controllerUrl: 'https://ctrl', fetchFn: vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => makeAps([]) }),
    });
    await monitor.poll();
    monitor.clearAlerts();
    expect(monitor.getAlerts()).toHaveLength(0);
  });

  it('sets authExpired=true on 401 and stops adding alerts', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized', statusText: 'Unauthorized' });
    monitor.configure({ authToken: 'Bearer expired', controllerUrl: 'https://ctrl', fetchFn: mockFetch });
    await monitor.poll();
    expect(monitor.getStatus().authExpired).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run server/validationEngine/driftMonitor.test.js
```
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create driftMonitor.js**

`server/validationEngine/driftMonitor.js`:
```js
import { fetchXcc } from './xccClient.js';

export class DriftMonitor {
  #lastTopologies = null; // Map<id, {name, vlanid}>
  #lastApProfiles = null; // Map<apSerial, profileId>
  #alerts = [];
  #authToken = null;
  #controllerUrl = null;
  #fetchFn = null;
  #timer = null;
  #authExpired = false;
  #lastPollAt = null;

  configure({ authToken, controllerUrl, fetchFn }) {
    this.#authToken = authToken;
    this.#controllerUrl = controllerUrl;
    this.#fetchFn = fetchFn ?? null;
    this.#authExpired = false; // reset on re-configure with fresh creds
  }

  async poll() {
    if (!this.#controllerUrl) return;
    const opts = { authToken: this.#authToken, controllerUrl: this.#controllerUrl, fetchFn: this.#fetchFn };

    let topologies, aps;
    try {
      [topologies, aps] = await Promise.all([
        fetchXcc('/v1/topologies', opts),
        fetchXcc('/v1/aps', opts),
      ]);
    } catch (err) {
      if (err.message.startsWith('401')) {
        this.#authExpired = true;
        this.stopPolling();
      }
      console.warn('[DriftMonitor] poll failed:', err.message);
      return;
    }

    this.#lastPollAt = new Date().toISOString();
    const topoArr = Array.isArray(topologies) ? topologies : [];
    const apArr = Array.isArray(aps?.data) ? aps.data : Array.isArray(aps) ? aps : [];

    const currentTopos = new Map(topoArr.map(t => [t.id, { name: t.name, vlanid: t.vlanid }]));
    const currentAps = new Map(apArr.map(a => [a.apSerialNum, a.apAssignedProfileId ?? a.profileId ?? '']));

    if (this.#lastTopologies !== null) {
      // Detect topology_removed
      for (const [id, info] of this.#lastTopologies) {
        if (!currentTopos.has(id)) {
          this.#alerts.push({ type: 'topology_removed', detail: `VLAN ${info.vlanid} (${info.name}) removed`, detectedAt: this.#lastPollAt });
        }
      }
      // Detect topology_added
      for (const [id, info] of currentTopos) {
        if (!this.#lastTopologies.has(id)) {
          this.#alerts.push({ type: 'topology_added', detail: `VLAN ${info.vlanid} (${info.name}) added`, detectedAt: this.#lastPollAt });
        }
      }
    }

    if (this.#lastApProfiles !== null) {
      for (const [serial, profileId] of this.#lastApProfiles) {
        const current = currentAps.get(serial);
        if (current !== undefined && current !== profileId) {
          this.#alerts.push({ type: 'ap_profile_changed', detail: `${serial}: profile ${profileId} → ${current}`, detectedAt: this.#lastPollAt });
        }
      }
    }

    this.#lastTopologies = currentTopos;
    this.#lastApProfiles = currentAps;
  }

  startPolling(intervalMs = 60_000) {
    this.stopPolling();
    this.#timer = setInterval(() => this.poll(), intervalMs);
  }

  stopPolling() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  getAlerts() {
    return [...this.#alerts];
  }

  clearAlerts() {
    this.#alerts = [];
  }

  getStatus() {
    return {
      polling: this.#timer !== null,
      lastPollAt: this.#lastPollAt,
      alertCount: this.#alerts.length,
      authExpired: this.#authExpired,
    };
  }
}

export const driftMonitor = new DriftMonitor();
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run server/validationEngine/driftMonitor.test.js
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/validationEngine/driftMonitor.js server/validationEngine/driftMonitor.test.js
git commit -m "feat(validation): drift monitor — topology + AP profile change detection"
```

---

### Task 7: validationRouter.js

**Files:**
- Create: `server/validationEngine/validationRouter.js`
- Create: `server/validationEngine/validationRouter.test.js`

Routes (all under the `/api` prefix — the router is mounted at `/api` in server.js):
- `POST /api/validate/intent` — full pre-provision validation (returns report + confidence)
- `GET /api/validate/vlan/:vlanId` — single VLAN reachability check
- `GET /api/validate/topology` — current LLDP topology snapshot (AP → switch → port)
- `GET /api/drift` — current drift alerts
- `DELETE /api/drift` — clear drift alerts
- `POST /api/rollback/:auditId` — restore pre-provision snapshot (stubs instructions in Phase 3)

Auth headers pattern: `x-controller-url` or `process.env.CAMPUS_CONTROLLER_URL` and `x-controller-auth` or `authorization`.

- [ ] **Step 1: Write failing tests**

`server/validationEngine/validationRouter.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createValidationRouter } from './validationRouter.js';
import { driftMonitor } from './driftMonitor.js';
import { rollbackEngine } from './rollbackEngine.js';

// supertest is available via existing project devDependencies (vitest uses it indirectly).
// If not present, run: npm install --save-dev supertest

function makeApp(fetchFn) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.headers['authorization'] = 'Bearer test-tok';
    req.headers['x-controller-url'] = 'https://ctrl.local';
    next();
  });
  app.use('/api', createValidationRouter({ fetchFn }));
  return app;
}

const TOPOLOGIES = [
  { id: 't1', name: 'Corp', vlanid: 1, dhcpMode: 'DHCPRelay', dhcpServers: '10.0.0.1' },
];

const APS = { data: [{ apSerialNum: 'AP1', apAssignedProfileId: 'prof-1' }] };
const LLDP = [{ switchPort: '1', systemName: 'sw1', vlanMembership: { tagged: [1], untagged: [] } }];
const PROFILES = [{ name: 'Site-A', radioIfList: [{ serviceId: 's1', index: 1 }], radios: [{ radioName: 'Radio 1 - 2.4 GHz', index: 1 }] }];

describe('validationRouter', () => {
  beforeEach(() => {
    driftMonitor.clearAlerts();
    // Reset rollbackEngine if needed
  });

  it('POST /api/validate/intent returns a validation report', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => TOPOLOGIES })     // /v1/topologies
      .mockResolvedValueOnce({ ok: true, json: async () => APS })             // /v1/aps
      .mockResolvedValueOnce({ ok: true, json: async () => LLDP })            // /v1/aps/AP1/lldp
      .mockResolvedValueOnce({ ok: true, json: async () => PROFILES });       // /v3/profiles

    const app = makeApp(mockFetch);
    const res = await request(app)
      .post('/api/validate/intent')
      .send({ intent: { action: 'create_ssid', ssid_name: 'Test', vlan: 1, security: 'WPA2-PSK' } });

    expect(res.status).toBe(200);
    expect(res.body.checks).toBeDefined();
    expect(res.body.confidence).toBeDefined();
    expect(res.body.confidence.band).toMatch(/HIGH|MEDIUM|LOW/);
  });

  it('POST /api/validate/intent returns 400 when intent.vlan is missing', async () => {
    const app = makeApp(vi.fn());
    const res = await request(app).post('/api/validate/intent').send({ intent: {} });
    expect(res.status).toBe(400);
  });

  it('GET /api/validate/vlan/:vlanId returns pass for existing VLAN', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => TOPOLOGIES });
    const app = makeApp(mockFetch);
    const res = await request(app).get('/api/validate/vlan/1');
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('pass');
  });

  it('GET /api/validate/vlan/:vlanId returns fail for missing VLAN', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => TOPOLOGIES });
    const app = makeApp(mockFetch);
    const res = await request(app).get('/api/validate/vlan/999');
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('fail');
  });

  it('GET /api/drift returns empty alerts initially', async () => {
    const app = makeApp(vi.fn());
    const res = await request(app).get('/api/drift');
    expect(res.status).toBe(200);
    expect(res.body.alerts).toEqual([]);
  });
});
```

- [ ] **Step 2: Check supertest is available**

```bash
grep '"supertest"' /home/redq/Documents/NobaraShare/GitHub/AURA/package.json
```
If not present, install it: `npm install --save-dev supertest`

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx vitest run server/validationEngine/validationRouter.test.js
```
Expected: FAIL with "Cannot find module"

- [ ] **Step 4: Create validationRouter.js**

`server/validationEngine/validationRouter.js`:
```js
import { Router } from 'express';
import { fetchXcc } from './xccClient.js';
import { validateVlanExists } from './vlanValidator.js';
import { validateDhcp } from './dhcpValidator.js';
import { resolveLldpForVlan } from './lldpTopologyResolver.js';
import { analyzeRfCapacity } from './rfCapacityAnalyzer.js';
import { aggregateConfidence } from './confidenceAggregator.js';
import { driftMonitor } from './driftMonitor.js';
import { rollbackEngine } from './rollbackEngine.js';

function getOpts(req, fetchFn) {
  return {
    authToken: req.headers['x-controller-auth'] ?? req.headers['authorization'] ?? '',
    controllerUrl: req.headers['x-controller-url'] ?? process.env.CAMPUS_CONTROLLER_URL ?? '',
    fetchFn: fetchFn ?? undefined,
  };
}

export function createValidationRouter({ fetchFn } = {}) {
  const router = Router();
  const json = express_json();

  // POST /api/validate/intent — full pre-provision validation
  router.post('/validate/intent', json, async (req, res) => {
    const { intent } = req.body ?? {};
    if (!intent?.vlan) {
      return res.status(400).json({ error: 'intent.vlan is required' });
    }
    const opts = getOpts(req, fetchFn);
    const checks = [];
    let multipliers = {};

    try {
      // VLAN + DHCP
      const topologies = await fetchXcc('/v1/topologies', opts);
      const vlanResult = validateVlanExists(topologies, intent.vlan);
      checks.push({ name: 'vlan_exists', ...vlanResult });
      if (vlanResult.topology) {
        const dhcpResult = validateDhcp(vlanResult.topology);
        checks.push({ name: 'dhcp_scope', ...dhcpResult });
      }

      // LLDP switch trunk
      try {
        const aps = await fetchXcc('/v1/aps', opts);
        const apList = (Array.isArray(aps?.data) ? aps.data : aps ?? []).slice(0, 15);
        const lldpByAp = await Promise.all(
          apList.map(async ap => {
            const serial = ap.apSerialNum ?? ap.serialNumber ?? ap.id;
            try {
              const neighbors = await fetchXcc(`/v1/aps/${encodeURIComponent(serial)}/lldp`, opts);
              return { apSerial: serial, neighbors: Array.isArray(neighbors) ? neighbors : [] };
            } catch {
              return { apSerial: serial, neighbors: [] };
            }
          })
        );
        const trunkResult = resolveLldpForVlan(lldpByAp, intent.vlan);
        checks.push({ name: 'switch_trunk', ...trunkResult });

        const trunkedCount = lldpByAp.filter(({ neighbors }) =>
          neighbors.some(n => {
            const tagged = n.vlanMembership?.tagged ?? [];
            const untagged = n.vlanMembership?.untagged ?? [];
            return tagged.includes(intent.vlan) || untagged.includes(intent.vlan);
          })
        ).length;
        if (trunkedCount >= 3) multipliers.operationalPattern = true;
      } catch (err) {
        console.warn('[ValidationEngine] LLDP error:', err.message);
        checks.push({ name: 'switch_trunk', result: 'warn', evidence: `LLDP fetch failed: ${err.message}` });
      }

      // RF capacity
      try {
        const profiles = await fetchXcc('/v3/profiles', opts);
        const profileList = Array.isArray(profiles?.data) ? profiles.data : profiles ?? [];
        const { ssidResult, bandResult } = analyzeRfCapacity(profileList, intent.security);
        checks.push({ name: 'ssid_count_limit', result: ssidResult.result, evidence: ssidResult.evidence });
        checks.push({ name: 'band_compatibility', result: bandResult.result, evidence: bandResult.evidence });
      } catch (err) {
        console.warn('[ValidationEngine] RF capacity error:', err.message);
      }

      const confidence = aggregateConfidence(checks, multipliers);
      driftMonitor.configure({ ...opts, fetchFn: fetchFn ?? undefined });

      return res.json({ intent, checks, confidence, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('[ValidationEngine] Fatal:', err.message);
      return res.status(503).json({ error: 'Controller unreachable during validation', detail: err.message });
    }
  });

  // GET /api/validate/vlan/:vlanId — single VLAN check
  router.get('/validate/vlan/:vlanId', async (req, res) => {
    const vlanId = Number(req.params.vlanId);
    if (!Number.isInteger(vlanId)) return res.status(400).json({ error: 'vlanId must be an integer' });
    const opts = getOpts(req, fetchFn);
    try {
      const topologies = await fetchXcc('/v1/topologies', opts);
      const result = validateVlanExists(topologies, vlanId);
      const dhcp = result.topology ? validateDhcp(result.topology) : null;
      res.json({ ...result, dhcp });
    } catch (err) {
      res.status(503).json({ error: err.message });
    }
  });

  // GET /api/validate/topology — LLDP topology snapshot
  router.get('/validate/topology', async (req, res) => {
    const opts = getOpts(req, fetchFn);
    try {
      const aps = await fetchXcc('/v1/aps', opts);
      const apList = (Array.isArray(aps?.data) ? aps.data : aps ?? []).slice(0, 15);
      const snapshot = await Promise.all(
        apList.map(async ap => {
          const serial = ap.apSerialNum ?? ap.serialNumber ?? ap.id;
          try {
            const neighbors = await fetchXcc(`/v1/aps/${encodeURIComponent(serial)}/lldp`, opts);
            return { apSerial: serial, neighbors: Array.isArray(neighbors) ? neighbors : [] };
          } catch {
            return { apSerial: serial, neighbors: [], error: 'lldp_fetch_failed' };
          }
        })
      );
      res.json({ snapshot, timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({ error: err.message });
    }
  });

  // GET /api/drift — current drift alerts
  router.get('/drift', (_req, res) => {
    res.json({ alerts: driftMonitor.getAlerts(), status: driftMonitor.getStatus() });
  });

  // DELETE /api/drift — clear alerts
  router.delete('/drift', (_req, res) => {
    driftMonitor.clearAlerts();
    res.json({ ok: true });
  });

  // POST /api/rollback/:auditId — restore pre-provision snapshot
  router.post('/rollback/:auditId', json, (req, res) => {
    const snap = rollbackEngine.get(req.params.auditId);
    if (!snap) return res.status(404).json({ error: `No snapshot for auditId=${req.params.auditId}` });
    // Phase 3: return the snapshot so the AI-First skill can execute rollback steps
    res.json({ auditId: req.params.auditId, snapshot: snap, instruction: 'Execute rollback using snapshot data' });
  });

  return router;
}

function express_json() {
  const express = await_express();
  return express.json();
}

// Inline the json middleware factory to avoid importing express in the module body
// (express is always available in the server environment)
import expressModule from 'express';
function express_json() { return expressModule.json(); }
```

Note: the inline `express_json` function duplicates itself — fix this by having a single clean version:

`server/validationEngine/validationRouter.js` (final clean version):
```js
import { Router, json as expressJson } from 'express';
import { fetchXcc } from './xccClient.js';
import { validateVlanExists } from './vlanValidator.js';
import { validateDhcp } from './dhcpValidator.js';
import { resolveLldpForVlan } from './lldpTopologyResolver.js';
import { analyzeRfCapacity } from './rfCapacityAnalyzer.js';
import { aggregateConfidence } from './confidenceAggregator.js';
import { driftMonitor } from './driftMonitor.js';
import { rollbackEngine } from './rollbackEngine.js';

function getOpts(req, fetchFn) {
  return {
    authToken: req.headers['x-controller-auth'] ?? req.headers['authorization'] ?? '',
    controllerUrl: req.headers['x-controller-url'] ?? process.env.CAMPUS_CONTROLLER_URL ?? '',
    fetchFn: fetchFn ?? undefined,
  };
}

export function createValidationRouter({ fetchFn } = {}) {
  const router = Router();
  const jsonBody = expressJson();

  router.post('/validate/intent', jsonBody, async (req, res) => {
    const { intent } = req.body ?? {};
    if (!intent?.vlan) return res.status(400).json({ error: 'intent.vlan is required' });

    const opts = getOpts(req, fetchFn);
    const checks = [];
    let multipliers = {};

    try {
      const topologies = await fetchXcc('/v1/topologies', opts);
      const vlanResult = validateVlanExists(topologies, intent.vlan);
      checks.push({ name: 'vlan_exists', result: vlanResult.result, evidence: vlanResult.evidence });

      if (vlanResult.topology) {
        const dhcpResult = validateDhcp(vlanResult.topology);
        checks.push({ name: 'dhcp_scope', result: dhcpResult.result, evidence: dhcpResult.evidence });
      }

      try {
        const aps = await fetchXcc('/v1/aps', opts);
        const apList = (Array.isArray(aps?.data) ? aps.data : (Array.isArray(aps) ? aps : [])).slice(0, 15);
        const lldpByAp = await Promise.all(
          apList.map(async ap => {
            const serial = ap.apSerialNum ?? ap.serialNumber ?? ap.id;
            try {
              const neighbors = await fetchXcc(`/v1/aps/${encodeURIComponent(serial)}/lldp`, opts);
              return { apSerial: serial, neighbors: Array.isArray(neighbors) ? neighbors : [] };
            } catch {
              return { apSerial: serial, neighbors: [] };
            }
          })
        );
        const trunkResult = resolveLldpForVlan(lldpByAp, intent.vlan);
        checks.push({ name: 'switch_trunk', result: trunkResult.result, evidence: trunkResult.evidence });

        const trunkedCount = lldpByAp.filter(({ neighbors }) =>
          neighbors.some(n => {
            const tagged = n.vlanMembership?.tagged ?? [];
            const untagged = n.vlanMembership?.untagged ?? [];
            return tagged.includes(intent.vlan) || untagged.includes(intent.vlan);
          })
        ).length;
        if (trunkedCount >= 3) multipliers.operationalPattern = true;
      } catch (err) {
        console.warn('[ValidationEngine] LLDP:', err.message);
        checks.push({ name: 'switch_trunk', result: 'warn', evidence: `LLDP unavailable: ${err.message}` });
      }

      try {
        const profiles = await fetchXcc('/v3/profiles', opts);
        const profileList = Array.isArray(profiles?.data) ? profiles.data : (Array.isArray(profiles) ? profiles : []);
        const { ssidResult, bandResult } = analyzeRfCapacity(profileList, intent.security);
        checks.push({ name: 'ssid_count_limit', result: ssidResult.result, evidence: ssidResult.evidence });
        checks.push({ name: 'band_compatibility', result: bandResult.result, evidence: bandResult.evidence });
      } catch (err) {
        console.warn('[ValidationEngine] RF capacity:', err.message);
      }

      const confidence = aggregateConfidence(checks, multipliers);
      driftMonitor.configure(opts);

      return res.json({ intent, checks, confidence, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('[ValidationEngine]', err.message);
      return res.status(503).json({ error: 'Controller unreachable during validation', detail: err.message });
    }
  });

  router.get('/validate/vlan/:vlanId', async (req, res) => {
    const vlanId = Number(req.params.vlanId);
    if (!Number.isInteger(vlanId)) return res.status(400).json({ error: 'vlanId must be an integer' });
    const opts = getOpts(req, fetchFn);
    try {
      const topologies = await fetchXcc('/v1/topologies', opts);
      const vlanResult = validateVlanExists(topologies, vlanId);
      const dhcp = vlanResult.topology ? validateDhcp(vlanResult.topology) : null;
      return res.json({ ...vlanResult, dhcp });
    } catch (err) {
      return res.status(503).json({ error: err.message });
    }
  });

  router.get('/validate/topology', async (req, res) => {
    const opts = getOpts(req, fetchFn);
    try {
      const aps = await fetchXcc('/v1/aps', opts);
      const apList = (Array.isArray(aps?.data) ? aps.data : (Array.isArray(aps) ? aps : [])).slice(0, 15);
      const snapshot = await Promise.all(
        apList.map(async ap => {
          const serial = ap.apSerialNum ?? ap.serialNumber ?? ap.id;
          try {
            const neighbors = await fetchXcc(`/v1/aps/${encodeURIComponent(serial)}/lldp`, opts);
            return { apSerial: serial, neighbors: Array.isArray(neighbors) ? neighbors : [] };
          } catch {
            return { apSerial: serial, neighbors: [], error: 'lldp_fetch_failed' };
          }
        })
      );
      return res.json({ snapshot, timestamp: new Date().toISOString() });
    } catch (err) {
      return res.status(503).json({ error: err.message });
    }
  });

  router.get('/drift', (_req, res) => {
    res.json({ alerts: driftMonitor.getAlerts(), status: driftMonitor.getStatus() });
  });

  router.delete('/drift', (_req, res) => {
    driftMonitor.clearAlerts();
    res.json({ ok: true });
  });

  router.post('/rollback/:auditId', jsonBody, (req, res) => {
    const snap = rollbackEngine.get(req.params.auditId);
    if (!snap) return res.status(404).json({ error: `No snapshot for auditId=${req.params.auditId}` });
    res.json({ auditId: req.params.auditId, snapshot: snap });
  });

  return router;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run server/validationEngine/validationRouter.test.js
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add server/validationEngine/validationRouter.js server/validationEngine/validationRouter.test.js
git commit -m "feat(validation): Express router — intent validation, VLAN check, drift, rollback routes"
```

---

### Task 8: Ultr0n integration — toolDispatcher.js + toolCatalog.js

**Files:**
- Modify: `server/ultr0n/toolDispatcher.js` (add `registerResolver` + resolver dispatch)
- Modify: `server/ultr0n/toolCatalog.js` (add `getDriftAlerts` spec)
- Modify: `server/ultr0n/toolCatalog.test.js` (add test for `getDriftAlerts`)
- Modify: `server/ultr0n/toolDispatcher.js` test file (verify resolver dispatch)

The toolDispatcher currently builds URL as `${controllerUrl}/api/management${path}` for all tools. `getDriftAlerts` reads from the DriftMonitor singleton — no HTTP needed. Add a resolver registry: `registerResolver(name, fn)` stores `fn`. In `executeTool`, if a resolver is registered for `name`, call `fn(args)` instead of HTTP.

- [ ] **Step 1: Add getDriftAlerts to toolCatalog.js and its test**

In `server/ultr0n/toolCatalog.js`, add after the `getAuditLogs` entry (before the closing `}`):

```js
  getDriftAlerts: {
    spec: {
      name: 'getDriftAlerts',
      description:
        'Return current infrastructure drift alerts — topology changes, AP profile changes, VLAN removals detected since last poll. Use when operator asks "what has changed", "is anything drifted", or "what went wrong since I last checked".',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    method: 'RESOLVER', // sentinel — handled by toolDispatcher registerResolver, not HTTP
    buildPath: () => '', // never called; required by interface
  },
```

In `server/ultr0n/toolCatalog.test.js`, add to the existing test suite:

```js
  it('getDriftAlerts tool is in catalog with a valid spec', () => {
    expect(isKnownTool('getDriftAlerts')).toBe(true);
    const tool = getTool('getDriftAlerts');
    expect(tool.spec.name).toBe('getDriftAlerts');
    expect(tool.method).toBe('RESOLVER');
  });
```

Also update the existing "does not expose any write/destructive tools" test to exclude RESOLVER:

```js
  it('does not expose any write/destructive tools', () => {
    for (const tool of Object.values(TOOLS)) {
      if (tool.method === 'RESOLVER') continue;
      expect(['POST', 'PUT', 'DELETE', 'PATCH']).not.toContain(tool.method);
    }
  });
```

- [ ] **Step 2: Run existing toolCatalog tests to confirm no regressions**

```bash
npx vitest run server/ultr0n/toolCatalog.test.js
```
Expected: New test FAIL (getDriftAlerts not yet added), existing tests PASS

- [ ] **Step 3: Apply toolCatalog.js changes**

Open `server/ultr0n/toolCatalog.js` and:
1. Add `getDriftAlerts` entry after `getAuditLogs` (before the closing `};`).
2. Add to `getToolSpecs()` — it already works since it uses `Object.values(TOOLS)`.
3. Note: `isKnownTool` and `getTool` already work by key lookup.

- [ ] **Step 4: Add resolver registry to toolDispatcher.js**

At the top of `server/ultr0n/toolDispatcher.js`, add after the imports:

```js
const resolvers = new Map(); // name → async (args) => data

export function registerResolver(name, fn) {
  resolvers.set(name, fn);
}
```

In the `executeTool` function, add a resolver check BEFORE the `!isKnownTool(name)` guard (resolvers don't need to be in the catalog to work, but getDriftAlerts is in both):

```js
export async function executeTool(name, args, { authToken, controllerUrl, fetchFn } = {}) {
  // Check resolver registry first (server-side tools, no HTTP)
  if (resolvers.has(name)) {
    const startedAt = Date.now();
    try {
      const data = await resolvers.get(name)(args ?? {});
      return { ok: true, data: truncateResult(data), callMeta: { tool: name, args, durationMs: Date.now() - startedAt } };
    } catch (err) {
      return { ok: false, error: err.message || String(err), callMeta: { tool: name, args } };
    }
  }

  if (!isKnownTool(name)) { ... }
  // ... rest of the existing function unchanged
```

- [ ] **Step 5: Run toolDispatcher tests**

```bash
npx vitest run server/ultr0n/toolCatalog.test.js
```
(toolDispatcher doesn't have a dedicated test file — the catalog test covers catalog lookups)

Expected: All tests PASS including new getDriftAlerts test

- [ ] **Step 6: Commit**

```bash
git add server/ultr0n/toolCatalog.js server/ultr0n/toolCatalog.test.js server/ultr0n/toolDispatcher.js
git commit -m "feat(ultr0n): getDriftAlerts tool + resolver registry in toolDispatcher"
```

---

### Task 9: server.js integration

**Files:**
- Modify: `server.js` (import + mount validationRouter, register getDriftAlerts resolver)

Add the import and mount after the existing Ultr0n imports. Register the getDriftAlerts resolver after both `driftMonitor` and `registerResolver` are available.

- [ ] **Step 1: Add imports to server.js**

At the top of `server.js`, after the Ultr0n imports block (after `import { attachRedQueenShell } from './server/redQueenShell.js';`):

```js
import { createValidationRouter } from './server/validationEngine/validationRouter.js';
import { driftMonitor } from './server/validationEngine/driftMonitor.js';
import { registerResolver } from './server/ultr0n/toolDispatcher.js';
```

- [ ] **Step 2: Register the getDriftAlerts resolver**

After all imports but before `app.use(helmet(...))` (near the top where `DEFAULT_CONTROLLER_URL` is defined), add:

```js
// Wire getDriftAlerts Ultr0n tool to the live drift monitor
registerResolver('getDriftAlerts', () => ({
  alerts: driftMonitor.getAlerts(),
  status: driftMonitor.getStatus(),
}));
```

- [ ] **Step 3: Mount validationRouter**

In `server.js`, find the comment `// ==================== Ultr0n AI Copilot Routes ====================` (around line 1379). Add the validation router mount BEFORE this block:

```js
// ==================== Validation Engine Routes ====================
// Must appear before /api proxy middleware so requests are handled server-side.
app.use('/api', requireAuth, createValidationRouter());
```

Note: `requireAuth` is already defined in server.js. The validationRouter's individual routes use `jsonBody` internally; no double JSON parsing.

- [ ] **Step 4: Start the dev server and smoke test the routes manually**

```bash
# In one terminal:
npm run dev

# In another terminal (replace token with a real auth token from a logged-in browser session):
curl -s -X POST http://localhost:3000/api/validate/intent \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -d '{"intent":{"action":"create_ssid","ssid_name":"Test","vlan":1,"security":"WPA2-PSK"}}' | jq .

curl -s http://localhost:3000/api/drift \
  -H 'Authorization: Bearer YOUR_TOKEN' | jq .
```

Expected for `/api/validate/intent`: JSON with `checks`, `confidence.band`, `timestamp`.
Expected for `/api/drift`: `{ alerts: [], status: { polling: false, ... } }`.

- [ ] **Step 5: Run full test suite**

```bash
npm test -- --run
```
Expected: same pass/fail ratio as before this task (2 pre-existing failures in agentService.test.ts, all new tests pass)

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat(server): mount validation engine routes + register getDriftAlerts resolver"
```

---

### Task 10: Phase 3 smoke test against lab controller

**Files:** No new files — this is a verification task using curl against `https://tsophiea.ddns.net`.

**Prerequisites:** The dev server is running with `CAMPUS_CONTROLLER_URL=https://tsophiea.ddns.net` (or Railway has the env set). An auth token is needed — log into AURA in the browser, open DevTools → Network → copy the `Authorization: Bearer` header from any `/api/management/` request.

- [ ] **Step 1: Authenticate and get a token**

```bash
curl -sk -X POST https://tsophiea.ddns.net/management/v1/oauth2/token \
  -H 'Content-Type: application/json' \
  -d '{"grantType":"password","userId":"admin","password":"Bronco3.0!"}' | jq -r '.access_token'
```
Save the returned token as `TOKEN`.

- [ ] **Step 2: Test POST /api/validate/intent**

```bash
curl -s -X POST http://localhost:3000/api/validate/intent \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Controller-URL: https://tsophiea.ddns.net' \
  -d '{"intent":{"action":"create_ssid","ssid_name":"NIE-Phase3-Test","vlan":1,"security":"WPA2-PSK"}}' | jq .
```

Expected: `checks` array with 4-6 entries, `confidence.score` and `confidence.band`, `timestamp`.

Acceptable result: any confidence band. The goal is no 500 errors. Check evidence strings include real controller data (AP names, VLAN names from lab).

- [ ] **Step 3: Test GET /api/validate/vlan/1**

```bash
curl -s http://localhost:3000/api/validate/vlan/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Controller-URL: https://tsophiea.ddns.net' | jq .
```

Expected: `{ result: "pass", topology: { name: "...", vlanid: 1, ... }, evidence: "...", dhcp: { ... } }`

- [ ] **Step 4: Test GET /api/validate/topology**

```bash
curl -s http://localhost:3000/api/validate/topology \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Controller-URL: https://tsophiea.ddns.net' | jq '.snapshot | length'
```

Expected: a number (count of APs). Lab has 6 APs so expect 6.

- [ ] **Step 5: Test GET /api/drift**

```bash
curl -s http://localhost:3000/api/drift \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected: `{ alerts: [], status: { polling: false, ... } }` (no drift on first call)

- [ ] **Step 6: Verify getDriftAlerts in Ultr0n**

In the AURA browser UI, open Ultr0n and ask: "What drift alerts are there?"

Expected: Ultr0n calls `getDriftAlerts`, receives the alerts array, responds with something like "No drift alerts detected at this time."

- [ ] **Step 7: Commit smoke test confirmation**

If any issues were found and fixed during the smoke test, commit those fixes:

```bash
git add -p  # stage only the fixes
git commit -m "fix(validation): <describe any fix found during Phase 3 smoke test>"
```

If no issues:

```bash
git commit --allow-empty -m "test(validation): Phase 3 smoke test passed against lab controller"
```

---

## Self-Review

**Spec coverage check:**

| Phase 3 spec requirement | Covered by task |
|---|---|
| `vlanValidator.js` | Task 2 |
| `lldpTopologyResolver.js` | Task 3 |
| `dhcpValidator.js` | Task 2 |
| `rfCapacityAnalyzer.js` | Task 4 |
| `confidenceAggregator.js` | Task 1 |
| `driftMonitor.js` | Task 6 |
| `rollbackEngine.js` | Task 5 |
| `POST /api/validate/intent` | Task 7 |
| `GET /api/validate/vlan/:id` | Task 7 |
| `GET /api/validate/topology` | Task 7 |
| `GET /api/drift` | Task 7 |
| `POST /api/rollback/:auditId` | Task 7 |
| Ultr0n `getDriftAlerts` tool | Task 8 |
| server.js mount | Task 9 |
| Live lab smoke test | Task 10 |

Note: `/api/provision` and `/api/verify/:jobId` from the spec are skill-layer concerns (the AI-First skill manages the provision/verify flow). Backend stubs are out of scope for Phase 3 per YAGNI.

**Placeholder scan:** No TBDs or TODOs in task steps. All code blocks complete.

**Type consistency:** `fetchXcc` signature `(path, {authToken, controllerUrl, fetchFn})` used consistently in xccClient, validationRouter, and driftMonitor tests. Validator return shapes `{result, evidence, ...}` are consistent across all 4 validators. `aggregateConfidence` receives `checks[].name` that matches the `CONTRIBUTIONS` keys exactly.
