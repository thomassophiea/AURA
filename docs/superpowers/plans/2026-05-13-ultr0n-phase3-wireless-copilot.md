# Ultr0n Phase 3 — Wireless Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Ultr0n from a generic chatbot into a Marvis-like wireless AI copilot that gathers live AURA API evidence, classifies root cause deterministically, then uses Grok only for final answer composition.

**Architecture:** New `/api/ultr0n/wireless/query` pipeline: intentDetector → apiPlanner → guardrails → auraApiClient → evidenceNormalizer → rootCauseClassifier → confidenceScorer → Grok → structured JSON answer. Frontend renders structured `UltronAnswerCard` instead of plain text for wireless messages.

**Tech Stack:** Node.js ESM (server), React 19 + TypeScript 5.7 + Tailwind (frontend), Vitest (tests), node:https for controller calls.

---

## File Map

**New — server:**
- `server/ultr0n/guardrails.js` + `.test.js`
- `server/ultr0n/intentDetector.js` + `.test.js`
- `server/ultr0n/apiPlanner.js` + `.test.js`
- `server/ultr0n/auraApiClient.js` + `.test.js`
- `server/ultr0n/evidenceNormalizer.js` + `.test.js`
- `server/ultr0n/rootCauseClassifier.js` + `.test.js`
- `server/ultr0n/confidenceScorer.js` + `.test.js`
- `server/ultr0n/wirelessSystemPrompt.js` + `.test.js`
- `server/ultr0n/wirelessQueryPipeline.js` + `.test.js`

**New — frontend:**
- `src/ultr0n/types.ts`
- `src/ultr0n/components/Ultr0nProgress.tsx` + `.test.tsx`
- `src/ultr0n/components/Ultr0nEvidenceAccordion.tsx` + `.test.tsx`
- `src/ultr0n/components/Ultr0nFollowUpChips.tsx` + `.test.tsx`
- `src/ultr0n/components/Ultr0nAnswerCard.tsx` + `.test.tsx`

**Modified:**
- `server.js` — add `POST /api/ultr0n/wireless/query`
- `src/types/ultron.ts` — extend `UltronPageContext` with wireless fields
- `src/components/AgentCoworker/agentTypes.ts` — add `wirelessAnswer` to `AgentMessage`
- `src/services/ultr0nApiClient.ts` — add `queryUltr0nWireless`
- `src/components/AgentCoworker/panels/ConversationStream.tsx` — render `UltronAnswerCard`
- `src/contexts/UltronContext.tsx` — wireless routing + progress state

---

### Task 1: Frontend types (`src/ultr0n/types.ts`)

**Files:**
- Create: `src/ultr0n/types.ts`

- [ ] **Create types file**

```typescript
// src/ultr0n/types.ts

export type RootCauseCategory =
  | 'CLIENT_SPECIFIC'
  | 'COVERAGE'
  | 'RF_CONGESTION'
  | 'INTERFERENCE'
  | 'ROAMING'
  | 'AUTHENTICATION'
  | 'DHCP_OR_VLAN'
  | 'AP_INFRASTRUCTURE'
  | 'WLAN_CONFIG'
  | 'SITE_SYSTEMIC'
  | 'UNKNOWN';

export interface UltronWirelessAnswer {
  id: string;
  question: string;
  narrative: string;
  rootCause: { category: RootCauseCategory; explanation: string };
  confidence: 'High' | 'Medium' | 'Low';
  apiEvidenceUsed: string[];
  followUpChips: string[];
  requiresConfirmation?: { action: string; description: string; confirmationToken: string };
  missingData?: string[];
}

export const ROOT_CAUSE_LABELS: Record<RootCauseCategory, string> = {
  CLIENT_SPECIFIC: 'Client-Specific Issue',
  COVERAGE: 'Coverage Gap',
  RF_CONGESTION: 'RF Congestion',
  INTERFERENCE: 'RF Interference',
  ROAMING: 'Roaming Issue',
  AUTHENTICATION: 'Authentication Failure',
  DHCP_OR_VLAN: 'DHCP / VLAN Issue',
  AP_INFRASTRUCTURE: 'AP Infrastructure',
  WLAN_CONFIG: 'WLAN Configuration',
  SITE_SYSTEMIC: 'Site-Wide Issue',
  UNKNOWN: 'Unknown',
};

export const ROOT_CAUSE_COLORS: Record<RootCauseCategory, string> = {
  CLIENT_SPECIFIC: 'bg-blue-900/60 text-blue-300',
  COVERAGE: 'bg-orange-900/60 text-orange-300',
  RF_CONGESTION: 'bg-yellow-900/60 text-yellow-300',
  INTERFERENCE: 'bg-yellow-900/60 text-yellow-300',
  ROAMING: 'bg-purple-900/60 text-purple-300',
  AUTHENTICATION: 'bg-red-900/60 text-red-300',
  DHCP_OR_VLAN: 'bg-red-900/60 text-red-300',
  AP_INFRASTRUCTURE: 'bg-red-900/60 text-red-300',
  WLAN_CONFIG: 'bg-pink-900/60 text-pink-300',
  SITE_SYSTEMIC: 'bg-red-900/60 text-red-300',
  UNKNOWN: 'bg-white/10 text-white/50',
};

export const CONFIDENCE_COLORS: Record<string, string> = {
  High: 'bg-green-900/60 text-green-300',
  Medium: 'bg-yellow-900/60 text-yellow-300',
  Low: 'bg-red-900/60 text-red-300',
};

export const ALL_FOLLOW_UP_CHIPS = [
  'Show client timeline',
  'Show impacted clients',
  'Show AP RF stats',
  'Show Smart RF history',
  'Check WLAN config',
  'Check AAA policy',
  'Compare previous 24 hours',
  'Locate AP',
  'Run packet capture',
  'Download logs',
  'Reboot AP',
] as const;

export type FollowUpChip = (typeof ALL_FOLLOW_UP_CHIPS)[number];
```

- [ ] **Commit**
```bash
git add src/ultr0n/types.ts
git commit -m "feat(ultr0n): add Phase 3 wireless types"
```

---

### Task 2: Guardrails (`server/ultr0n/guardrails.js`)

**Files:**
- Create: `server/ultr0n/guardrails.js`
- Create: `server/ultr0n/guardrails.test.js`

- [ ] **Write failing test**

```javascript
// server/ultr0n/guardrails.test.js
import { describe, it, expect } from 'vitest';
import { isDisruptiveCall, checkGuardrails } from './guardrails.js';

describe('isDisruptiveCall', () => {
  it('flags AP reboot as disruptive', () => {
    expect(isDisruptiveCall('PUT', '/v1/aps/AP123/reboot')).toBe(true);
  });
  it('flags AP reset as disruptive', () => {
    expect(isDisruptiveCall('PUT', '/v1/aps/AP123/reset')).toBe(true);
  });
  it('flags AP upgrade as disruptive', () => {
    expect(isDisruptiveCall('PUT', '/v1/aps/AP123/upgrade')).toBe(true);
  });
  it('flags packet capture as disruptive', () => {
    expect(isDisruptiveCall('PUT', '/v1/aps/AP123/realcapture')).toBe(true);
  });
  it('flags log download as disruptive', () => {
    expect(isDisruptiveCall('PUT', '/v1/aps/AP123/logs')).toBe(true);
  });
  it('does not flag GET station as disruptive', () => {
    expect(isDisruptiveCall('GET', '/v1/stations/aa:bb:cc:dd:ee:ff')).toBe(false);
  });
  it('does not flag AP locate as disruptive', () => {
    expect(isDisruptiveCall('PUT', '/v1/aps/AP123/locate')).toBe(false);
  });
});

describe('checkGuardrails', () => {
  const readPlan = [{ method: 'GET', path: '/v1/stations/mac', disruptive: false }];
  const rebootPlan = [{ method: 'PUT', path: '/v1/aps/AP123/reboot', disruptive: true, description: 'Reboot AP' }];

  it('allows read-only plan without token', () => {
    const result = checkGuardrails(readPlan, undefined);
    expect(result.blocked).toBe(false);
  });
  it('blocks disruptive plan without token', () => {
    const result = checkGuardrails(rebootPlan, undefined);
    expect(result.blocked).toBe(true);
    expect(result.action).toBe('Reboot AP');
    expect(typeof result.confirmationToken).toBe('string');
  });
  it('allows disruptive plan with valid token', () => {
    const result = checkGuardrails(rebootPlan, 'some-token');
    expect(result.blocked).toBe(false);
  });
});
```

- [ ] **Run test — expect FAIL**
```bash
npx vitest run server/ultr0n/guardrails.test.js 2>&1 | tail -5
```

- [ ] **Implement**

```javascript
// server/ultr0n/guardrails.js
import crypto from 'node:crypto';

const DISRUPTIVE_RE = /\/v1\/aps\/[^/]+\/(reboot|reset|upgrade|realcapture|logs)$/;

export function isDisruptiveCall(method, path) {
  return method === 'PUT' && DISRUPTIVE_RE.test(path);
}

export function checkGuardrails(apiPlan, confirmationToken) {
  const disruptive = apiPlan.filter(c => isDisruptiveCall(c.method, c.path));
  if (disruptive.length === 0) return { blocked: false };
  if (confirmationToken) return { blocked: false };
  return {
    blocked: true,
    action: disruptive[0].description ?? disruptive[0].path,
    description: `This action (${disruptive[0].path}) requires confirmation before proceeding.`,
    confirmationToken: crypto.randomUUID(),
  };
}
```

- [ ] **Run test — expect PASS**
```bash
npx vitest run server/ultr0n/guardrails.test.js 2>&1 | tail -5
```

- [ ] **Commit**
```bash
git add server/ultr0n/guardrails.js server/ultr0n/guardrails.test.js
git commit -m "feat(ultr0n): add wireless guardrails (disruptive action detection)"
```

---

### Task 3: Intent Detector (`server/ultr0n/intentDetector.js`)

**Files:**
- Create: `server/ultr0n/intentDetector.js`
- Create: `server/ultr0n/intentDetector.test.js`

- [ ] **Write failing test**

```javascript
// server/ultr0n/intentDetector.test.js
import { describe, it, expect } from 'vitest';
import { detectIntent, isWirelessQuestion } from './intentDetector.js';

const ctx = {
  clientMac: 'aa:bb:cc:dd:ee:ff',
  apSerialNumber: 'AP001',
  siteId: 'site-1',
  serviceId: 'svc-1',
  ssid: 'CorpWifi',
  pageType: 'client-detail',
};

describe('isWirelessQuestion', () => {
  it('identifies client disconnect question', () => {
    expect(isWirelessQuestion('Why did this client disconnect?')).toBe(true);
  });
  it('identifies AP overload question', () => {
    expect(isWirelessQuestion('Which APs are overloaded?')).toBe(true);
  });
  it('does not flag generic config question', () => {
    expect(isWirelessQuestion('How do I update my password?')).toBe(false);
  });
});

describe('detectIntent', () => {
  it('maps disconnect question to client-disconnect intent', () => {
    const { intent, resolved } = detectIntent('Why did this client disconnect?', ctx);
    expect(intent).toBe('client-disconnect');
    expect(resolved.mac).toBe('aa:bb:cc:dd:ee:ff');
    expect(resolved.apSerialNumber).toBe('AP001');
  });

  it('maps poor wifi question to client-poor-wifi intent', () => {
    const { intent } = detectIntent('Why is Wi-Fi so slow for this client?', ctx);
    expect(intent).toBe('client-poor-wifi');
  });

  it('maps AP overload to ap-overloaded intent', () => {
    const { intent } = detectIntent('Which APs are overloaded?', { pageType: 'ap-list' });
    expect(intent).toBe('ap-overloaded');
  });

  it('maps auth failure to client-auth-fail intent', () => {
    const { intent } = detectIntent('Why is authentication failing?', ctx);
    expect(intent).toBe('client-auth-fail');
  });

  it('maps reboot question to action-reboot-ap intent', () => {
    const { intent } = detectIntent('Reboot this AP', ctx);
    expect(intent).toBe('action-reboot-ap');
  });

  it('returns unknown for unrecognized question', () => {
    const { intent } = detectIntent('What is the meaning of life?', {});
    expect(intent).toBe('unknown');
  });

  it('resolves site context from pageContext', () => {
    const { resolved } = detectIntent('What is the site health?', ctx);
    expect(resolved.siteId).toBe('site-1');
  });
});
```

- [ ] **Run test — expect FAIL**
```bash
npx vitest run server/ultr0n/intentDetector.test.js 2>&1 | tail -5
```

- [ ] **Implement**

```javascript
// server/ultr0n/intentDetector.js

const WIRELESS_TERMS = [
  'client', 'station', 'ap', 'access point', 'ssid', 'wlan', 'rf',
  'roam', 'disconnect', 'authenticate', 'authentication', 'dhcp',
  'signal', 'snr', 'rssi', 'channel', 'retry', 'throughput',
  'wifi', 'wi-fi', 'wireless', 'poe', 'uplink', 'band', 'dfs',
  'smart rf', 'captive', 'portal', 'radius', 'eap', '802.1x',
  'ppsk', 'wpa', 'overload', 'utilization', 'interference', 'noise',
  'lldp', 'ethernet', 'reboot', 'reset', 'upgrade', 'packet capture',
  'logs', 'sticky', 'roaming',
];

const INTENT_PATTERNS = [
  { re: /poor wi.?fi|bad wi.?fi|slow wi.?fi|poor wireless|bad wireless|wi.?fi suck/i, intent: 'client-poor-wifi' },
  { re: /disconnect|dropped|lost connection|kicked off|why.*left/i, intent: 'client-disconnect' },
  { re: /roam(ing)?\s*(too much|a lot|constantly|frequently)|excessive roam|sticky/i, intent: 'client-roaming' },
  { re: /slow|low throughput|poor speed|low speed|low rate/i, intent: 'client-slow' },
  { re: /2\.4\s*g?hz|stuck on 2\.4|not on 5|band stuck|5 ?ghz/i, intent: 'client-band-stuck' },
  { re: /auth(entication)?\s*fail|can.?t connect|cannot connect|802\.1x fail|eap fail|radius fail/i, intent: 'client-auth-fail' },
  { re: /dhcp fail|no ip|ip address fail|dhcp problem/i, intent: 'client-dhcp-fail' },
  { re: /ppsk fail|wpa3 fail|personal psk|pre.?shared key fail/i, intent: 'client-ppsk-fail' },
  { re: /captive portal|guest portal|splash page|portal fail/i, intent: 'client-captive-fail' },
  { re: /low rssi|low signal|weak signal|poor rssi|signal strength/i, intent: 'clients-low-rssi' },
  { re: /high retry|retry rate|retries/i, intent: 'clients-high-retry' },
  { re: /failed auth|authentication failures|auth failed clients/i, intent: 'clients-auth-failed' },
  { re: /sticky client|not roaming|client stuck on ap/i, intent: 'clients-sticky' },
  { re: /ap.*(overload|too many client)|overloaded ap/i, intent: 'ap-overloaded' },
  { re: /channel util|high utilization|congested channel/i, intent: 'ap-high-utilization' },
  { re: /interference|co.?channel|cci/i, intent: 'ap-cci' },
  { re: /channel change|power change|smart rf change|rrm change/i, intent: 'ap-channel-power-change' },
  { re: /dfs|radar/i, intent: 'ap-dfs' },
  { re: /ap.*(offline|down|reboot)|rebooting ap|offline ap/i, intent: 'ap-offline' },
  { re: /uplink|bad uplink|lldp|ethernet error|crc/i, intent: 'ap-bad-uplink' },
  { re: /poe|underpowered|power issue|low power/i, intent: 'ap-underpowered' },
  { re: /ap client history|client count history/i, intent: 'ap-client-history' },
  { re: /radio stats|rf stats|ap radio stats|ifstats/i, intent: 'ap-radio-stats' },
  { re: /neighbor(ing)? ap|rf context|nearby ap/i, intent: 'ap-rf-context' },
  { re: /wlan.*fail|ssid.*fail|worst wlan|most failures/i, intent: 'wlan-most-failures' },
  { re: /client count|how many client|most client|highest client|client load/i, intent: 'wlan-client-count' },
  { re: /wlan.*auth|ssid.*auth|wlan.*authentication problem/i, intent: 'wlan-auth-issues' },
  { re: /where.*wlan|where.*ssid|deployed|which site.*wlan/i, intent: 'wlan-deployed-where' },
  { re: /compare.*ssid|compare.*wlan|ssid performance|wlan performance/i, intent: 'wlan-compare' },
  { re: /site.*health|wireless health|how.*site.*doing/i, intent: 'site-health' },
  { re: /worst site|poor site|bad site|sites.*issue|which site.*problem/i, intent: 'sites-poor' },
  { re: /ap.*impact.*site|impacting site|which ap.*site/i, intent: 'site-ap-impact' },
  { re: /what changed|config change|before.*issue|audit|recent change/i, intent: 'config-change-before-issue' },
  { re: /fix first|prioritize|what should.*fix|top issue|where.*start/i, intent: 'what-to-fix' },
  { re: /packet capture|capture packet|packet trace/i, intent: 'action-packet-capture' },
  { re: /download log|ap log|get log/i, intent: 'action-download-logs' },
  { re: /reboot ap|restart ap|cycle ap/i, intent: 'action-reboot-ap' },
];

export function isWirelessQuestion(question) {
  const q = question.toLowerCase();
  return WIRELESS_TERMS.some(t => q.includes(t));
}

export function detectIntent(question, pageContext = {}) {
  const resolved = {
    mac: pageContext.clientMac,
    stationId: pageContext.stationId,
    apSerialNumber: pageContext.apSerialNumber,
    apName: pageContext.apName,
    siteId: pageContext.siteId,
    siteName: pageContext.siteName,
    serviceId: pageContext.serviceId,
    ssid: pageContext.ssid,
    floorId: pageContext.floorId,
  };

  // Resolve time window
  if (pageContext.selectedTimeWindow) {
    resolved.startTime = pageContext.selectedTimeWindow.startTime;
    resolved.endTime = pageContext.selectedTimeWindow.endTime;
  } else {
    const now = new Date();
    resolved.endTime = now.toISOString();
    resolved.startTime = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  }

  for (const { re, intent } of INTENT_PATTERNS) {
    if (re.test(question)) {
      return { intent, resolved };
    }
  }

  return { intent: 'unknown', resolved };
}
```

- [ ] **Run test — expect PASS**
```bash
npx vitest run server/ultr0n/intentDetector.test.js 2>&1 | tail -5
```

- [ ] **Commit**
```bash
git add server/ultr0n/intentDetector.js server/ultr0n/intentDetector.test.js
git commit -m "feat(ultr0n): add wireless intent detector"
```

---

### Task 4: API Planner (`server/ultr0n/apiPlanner.js`)

**Files:**
- Create: `server/ultr0n/apiPlanner.js`
- Create: `server/ultr0n/apiPlanner.test.js`

- [ ] **Write failing test**

```javascript
// server/ultr0n/apiPlanner.test.js
import { describe, it, expect } from 'vitest';
import { planApiCalls } from './apiPlanner.js';

const resolved = {
  mac: 'aa:bb:cc:dd:ee:ff',
  stationId: 'sta-1',
  apSerialNumber: 'AP001',
  siteId: 'site-1',
  serviceId: 'svc-1',
  startTime: '2026-01-01T00:00:00Z',
  endTime: '2026-01-02T00:00:00Z',
};

describe('planApiCalls', () => {
  it('returns array for client-disconnect intent', () => {
    const plan = planApiCalls('client-disconnect', resolved);
    expect(Array.isArray(plan)).toBe(true);
    expect(plan.length).toBeGreaterThan(0);
  });

  it('client-disconnect plan includes station events call', () => {
    const plan = planApiCalls('client-disconnect', resolved);
    expect(plan.some(c => c.path.includes('events'))).toBe(true);
  });

  it('client-disconnect plan includes AP state call', () => {
    const plan = planApiCalls('client-disconnect', resolved);
    expect(plan.some(c => c.path.includes('state/aps'))).toBe(true);
  });

  it('action-reboot-ap plan has a disruptive call', () => {
    const plan = planApiCalls('action-reboot-ap', resolved);
    expect(plan.some(c => c.disruptive)).toBe(true);
  });

  it('unknown intent returns empty array', () => {
    const plan = planApiCalls('unknown', resolved);
    expect(plan).toEqual([]);
  });

  it('each plan call has method, path, disruptive', () => {
    const plan = planApiCalls('client-poor-wifi', resolved);
    for (const call of plan) {
      expect(typeof call.method).toBe('string');
      expect(typeof call.path).toBe('string');
      expect(typeof call.disruptive).toBe('boolean');
    }
  });

  it('plan resolves mac address into path', () => {
    const plan = planApiCalls('client-disconnect', resolved);
    const eventsCall = plan.find(c => c.path.includes('events'));
    expect(eventsCall.path).toContain('aa:bb:cc:dd:ee:ff');
  });
});
```

- [ ] **Run test — expect FAIL**
```bash
npx vitest run server/ultr0n/apiPlanner.test.js 2>&1 | tail -5
```

- [ ] **Implement**

```javascript
// server/ultr0n/apiPlanner.js

function r(path, resolved) {
  return path
    .replace('{macaddress}', encodeURIComponent(resolved.mac ?? ''))
    .replace('{stationId}', encodeURIComponent(resolved.stationId ?? resolved.mac ?? ''))
    .replace('{apSerialNumber}', encodeURIComponent(resolved.apSerialNumber ?? ''))
    .replace('{apserialnum}', encodeURIComponent(resolved.apSerialNumber ?? ''))
    .replace('{siteId}', encodeURIComponent(resolved.siteId ?? ''))
    .replace('{siteid}', encodeURIComponent(resolved.siteId ?? ''))
    .replace('{serviceId}', encodeURIComponent(resolved.serviceId ?? ''))
    .replace('{serviceid}', encodeURIComponent(resolved.serviceId ?? ''))
    .replace('{floorId}', encodeURIComponent(resolved.floorId ?? ''));
}

function q(path, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return qs ? `${path}?${qs}` : path;
}

function call(method, pathTpl, resolved, extra = {}) {
  const path = q(r(pathTpl, resolved), extra);
  return { method, path, disruptive: false, description: `${method} ${pathTpl}`, label: pathTpl };
}

function disruptiveCall(method, pathTpl, resolved, description) {
  const path = r(pathTpl, resolved);
  return { method, path, disruptive: true, description, label: pathTpl };
}

const FOLLOW_UP_CHIPS_BY_INTENT = {
  'client-poor-wifi': ['Show client timeline', 'Show AP RF stats', 'Show Smart RF history', 'Check WLAN config', 'Compare previous 24 hours'],
  'client-disconnect': ['Show client timeline', 'Show AP RF stats', 'Check WLAN config', 'Check AAA policy', 'Compare previous 24 hours'],
  'client-roaming': ['Show client timeline', 'Show AP RF stats', 'Show Smart RF history', 'Check WLAN config'],
  'client-slow': ['Show client timeline', 'Show AP RF stats', 'Show impacted clients', 'Compare previous 24 hours'],
  'client-band-stuck': ['Show AP RF stats', 'Check WLAN config', 'Show client timeline'],
  'client-auth-fail': ['Show client timeline', 'Check WLAN config', 'Check AAA policy', 'Show impacted clients'],
  'client-dhcp-fail': ['Show client timeline', 'Check WLAN config', 'Show impacted clients'],
  'client-ppsk-fail': ['Show client timeline', 'Check WLAN config', 'Check AAA policy'],
  'client-captive-fail': ['Show client timeline', 'Check WLAN config'],
  'clients-low-rssi': ['Show AP RF stats', 'Show impacted clients', 'Show Smart RF history'],
  'clients-high-retry': ['Show AP RF stats', 'Show impacted clients', 'Show Smart RF history'],
  'clients-auth-failed': ['Check WLAN config', 'Check AAA policy', 'Show impacted clients'],
  'clients-sticky': ['Show client timeline', 'Show AP RF stats', 'Show Smart RF history'],
  'ap-overloaded': ['Show AP RF stats', 'Show impacted clients', 'Locate AP', 'Compare previous 24 hours'],
  'ap-high-utilization': ['Show AP RF stats', 'Show Smart RF history', 'Show impacted clients'],
  'ap-cci': ['Show AP RF stats', 'Show Smart RF history'],
  'ap-channel-power-change': ['Show Smart RF history', 'Show AP RF stats'],
  'ap-dfs': ['Show Smart RF history', 'Show AP RF stats'],
  'ap-offline': ['Locate AP', 'Reboot AP', 'Show AP RF stats'],
  'ap-bad-uplink': ['Locate AP', 'Show AP RF stats'],
  'ap-underpowered': ['Locate AP', 'Show AP RF stats'],
  'ap-client-history': ['Show impacted clients', 'Show AP RF stats'],
  'ap-radio-stats': ['Show Smart RF history', 'Show impacted clients'],
  'ap-rf-context': ['Show Smart RF history', 'Show AP RF stats'],
  'wlan-most-failures': ['Check WLAN config', 'Check AAA policy', 'Show impacted clients'],
  'wlan-client-count': ['Show impacted clients', 'Check WLAN config'],
  'wlan-auth-issues': ['Check WLAN config', 'Check AAA policy', 'Show impacted clients'],
  'wlan-deployed-where': ['Check WLAN config'],
  'wlan-compare': ['Check WLAN config', 'Show impacted clients'],
  'site-health': ['Show AP RF stats', 'Show Smart RF history', 'Show impacted clients', 'Compare previous 24 hours'],
  'sites-poor': ['Show AP RF stats', 'Show Smart RF history'],
  'site-ap-impact': ['Show AP RF stats', 'Locate AP', 'Reboot AP'],
  'config-change-before-issue': ['Compare previous 24 hours', 'Show AP RF stats'],
  'what-to-fix': ['Show AP RF stats', 'Show impacted clients', 'Show Smart RF history'],
  'action-packet-capture': ['Download logs'],
  'action-download-logs': ['Run packet capture'],
  'action-reboot-ap': ['Locate AP', 'Show AP RF stats'],
};

const PLANS = {
  'client-poor-wifi': (resolved) => [
    call('GET', '/v1/stations/{macaddress}', resolved),
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/stations/{stationId}/report', resolved, { duration: '24h' }),
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved, { rfStats: 'true' }),
    call('GET', '/v1/state/aps/{apSerialNumber}', resolved),
    call('GET', '/v1/report/aps/{apSerialNumber}/smartrf', resolved, { duration: '24h' }),
  ],
  'client-disconnect': (resolved) => [
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/stations/{macaddress}', resolved),
    call('GET', '/v1/stations/{stationId}/report', resolved, { duration: '24h' }),
    call('GET', '/v1/state/aps/{apSerialNumber}', resolved),
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved, { rfStats: 'true' }),
  ],
  'client-roaming': (resolved) => [
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/stations/{stationId}/report', resolved, { duration: '24h' }),
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved, { rfStats: 'true' }),
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v1/services/{serviceId}', resolved),
  ],
  'client-slow': (resolved) => [
    call('GET', '/v1/stations/{macaddress}', resolved),
    call('GET', '/v1/stations/{stationId}/report', resolved, { duration: '24h' }),
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved, { rfStats: 'true' }),
    call('GET', '/v1/report/aps/{apSerialNumber}', resolved, { duration: '24h' }),
  ],
  'client-band-stuck': (resolved) => [
    call('GET', '/v1/stations/{macaddress}', resolved),
    call('GET', '/v1/services/{serviceId}', resolved),
    call('GET', '/v1/aps/{apSerialNumber}', resolved),
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved, { rfStats: 'true' }),
  ],
  'client-auth-fail': (resolved) => [
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/services/{serviceId}', resolved),
    call('GET', '/v1/aaapolicy', resolved),
  ],
  'client-dhcp-fail': (resolved) => [
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/stations/{macaddress}', resolved),
    call('GET', '/v1/services/{serviceId}', resolved),
    call('GET', '/v1/report/sites/{siteId}', resolved, { duration: '24h' }),
  ],
  'client-ppsk-fail': (resolved) => [
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/services/{serviceId}', resolved),
    call('GET', '/v1/aaapolicy', resolved),
  ],
  'client-captive-fail': (resolved) => [
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/services/{serviceId}', resolved),
    call('GET', '/v1/eguest', resolved),
  ],
  'clients-low-rssi': (resolved) => [
    call('GET', '/v1/stations/query', resolved),
    call('GET', '/v1/state/aps', resolved),
  ],
  'clients-high-retry': (resolved) => [
    call('GET', '/v1/stations/query', resolved),
    call('GET', '/v1/aps/ifstats', resolved, { rfStats: 'true' }),
  ],
  'clients-auth-failed': (resolved) => [
    call('GET', '/v1/stations/query', resolved),
    call('GET', '/v1/services', resolved),
  ],
  'clients-sticky': (resolved) => [
    call('GET', '/v1/stations/query', resolved),
    call('GET', '/v1/aps/ifstats', resolved, { rfStats: 'true' }),
  ],
  'ap-overloaded': (resolved) => [
    call('GET', '/v1/aps/ifstats', resolved, { rfStats: 'true' }),
    call('GET', '/v1/state/aps', resolved),
    call('GET', '/v1/aps/{apserialnum}/stations', resolved),
  ],
  'ap-high-utilization': (resolved) => [
    call('GET', '/v1/aps/ifstats', resolved, { rfStats: 'true' }),
  ],
  'ap-cci': (resolved) => [
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v1/report/aps/{apSerialNumber}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v1/aps/ifstats', resolved, { rfStats: 'true' }),
  ],
  'ap-channel-power-change': (resolved) => [
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v1/report/aps/{apSerialNumber}/smartrf', resolved, { duration: '24h' }),
  ],
  'ap-dfs': (resolved) => [
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v1/report/aps/{apSerialNumber}/smartrf', resolved, { duration: '24h' }),
  ],
  'ap-offline': (resolved) => [
    call('GET', '/v1/state/aps', resolved),
    call('GET', '/v1/state/aps/{apSerialNumber}', resolved),
    call('GET', '/v1/report/aps/{apSerialNumber}', resolved, { duration: '24h' }),
  ],
  'ap-bad-uplink': (resolved) => [
    call('GET', '/v1/aps/{apserialnum}/lldp', resolved),
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved),
    call('GET', '/v1/state/aps/{apSerialNumber}', resolved),
  ],
  'ap-underpowered': (resolved) => [
    call('GET', '/v1/aps/{apSerialNumber}', resolved),
    call('GET', '/v1/state/aps/{apSerialNumber}', resolved),
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved),
    call('GET', '/v1/aps/{apserialnum}/lldp', resolved),
  ],
  'ap-client-history': (resolved) => [
    call('GET', '/v1/report/aps/{apSerialNumber}', resolved, { duration: '24h' }),
  ],
  'ap-radio-stats': (resolved) => [
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved, { rfStats: 'true' }),
  ],
  'ap-rf-context': (resolved) => [
    call('GET', '/v1/report/aps/{apSerialNumber}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
  ],
  'wlan-most-failures': (resolved) => [
    call('GET', '/v1/services', resolved),
    call('GET', '/v1/services/{serviceId}/report', resolved, { duration: '24h' }),
    call('GET', '/v1/services/{serviceId}/stations', resolved),
  ],
  'wlan-client-count': (resolved) => [
    call('GET', '/v1/services', resolved),
    call('GET', '/v1/services/{serviceId}/stations', resolved),
  ],
  'wlan-auth-issues': (resolved) => [
    call('GET', '/v1/services', resolved),
    call('GET', '/v1/services/{serviceId}/stations', resolved),
    call('GET', '/v1/services/{serviceId}/report', resolved, { duration: '24h' }),
    call('GET', '/v1/aaapolicy', resolved),
  ],
  'wlan-deployed-where': (resolved) => [
    call('GET', '/v1/services', resolved),
    call('GET', '/v1/services/{serviceId}/siteids', resolved),
    call('GET', '/v1/services/{serviceId}/deviceids', resolved),
  ],
  'wlan-compare': (resolved) => [
    call('GET', '/v1/services', resolved),
    call('GET', '/v1/services/{serviceId}/report', resolved, { duration: '24h' }),
  ],
  'site-health': (resolved) => [
    call('GET', '/v1/state/sites/{siteId}', resolved),
    call('GET', '/v1/state/sites/{siteId}/aps', resolved),
    call('GET', '/v1/report/sites/{siteId}', resolved, { duration: '24h' }),
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v3/sites/{siteid}/stations', resolved),
  ],
  'sites-poor': (resolved) => [
    call('GET', '/v1/state/sites', resolved),
    call('GET', '/v1/report/sites', resolved, { duration: '24h' }),
  ],
  'site-ap-impact': (resolved) => [
    call('GET', '/v1/state/sites/{siteId}/aps', resolved),
    call('GET', '/v1/aps/ifstats', resolved, { rfStats: 'true' }),
    call('GET', '/v1/report/sites/{siteId}', resolved, { duration: '24h' }),
  ],
  'config-change-before-issue': (resolved) => [
    call('GET', '/v1/auditlogs', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/report/sites/{siteId}', resolved, { duration: '24h' }),
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
  ],
  'what-to-fix': (resolved) => [
    call('GET', '/v1/state/sites/{siteId}', resolved),
    call('GET', '/v1/report/sites/{siteId}', resolved, { duration: '24h' }),
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v1/aps/ifstats', resolved, { rfStats: 'true' }),
    call('GET', '/v1/stations/query', resolved),
  ],
  'action-packet-capture': (resolved) => [
    disruptiveCall('PUT', '/v1/aps/{apSerialNumber}/realcapture', resolved, 'Start real-time AP packet capture'),
    call('GET', '/v1/aps/{apSerialNumber}/traceurls', resolved),
  ],
  'action-download-logs': (resolved) => [
    disruptiveCall('PUT', '/v1/aps/{apSerialNumber}/logs', resolved, 'Enable AP log download'),
    call('GET', '/v1/aps/{apSerialNumber}/traceurls', resolved),
  ],
  'action-reboot-ap': (resolved) => [
    disruptiveCall('PUT', '/v1/aps/{apSerialNumber}/reboot', resolved, 'Reboot AP'),
  ],
};

export function planApiCalls(intent, resolved) {
  const planFn = PLANS[intent];
  if (!planFn) return [];
  return planFn(resolved).filter(c => {
    // Skip calls with empty required path params
    if (!c.disruptive && c.path.includes('%')) return true;
    if (c.path.includes('undefined') || c.path.includes('%3A%3A')) return false;
    return true;
  });
}

export function getFollowUpChips(intent) {
  return FOLLOW_UP_CHIPS_BY_INTENT[intent] ?? ['Show AP RF stats', 'Show impacted clients', 'Compare previous 24 hours'];
}
```

- [ ] **Run test — expect PASS**
```bash
npx vitest run server/ultr0n/apiPlanner.test.js 2>&1 | tail -5
```

- [ ] **Commit**
```bash
git add server/ultr0n/apiPlanner.js server/ultr0n/apiPlanner.test.js
git commit -m "feat(ultr0n): add wireless API planner (37 intent→call mappings)"
```

---

### Task 5: AURA API Client (`server/ultr0n/auraApiClient.js`)

**Files:**
- Create: `server/ultr0n/auraApiClient.js`
- Create: `server/ultr0n/auraApiClient.test.js`

- [ ] **Write failing test**

```javascript
// server/ultr0n/auraApiClient.test.js
import { describe, it, expect, vi } from 'vitest';
import { executeApiPlan } from './auraApiClient.js';

describe('executeApiPlan', () => {
  it('returns results keyed by label', async () => {
    const plan = [{ method: 'GET', path: '/v1/stations', label: '/v1/stations', disruptive: false }];
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    const results = await executeApiPlan(plan, {
      authToken: 'Bearer tok',
      controllerUrl: 'https://ctrl.local',
      fetchFn: mockFetch,
    });
    expect(results['/v1/stations']).toBeDefined();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('records failed calls in missingData', async () => {
    const plan = [{ method: 'GET', path: '/v1/stations/bad', label: '/v1/stations/{mac}', disruptive: false }];
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'Not Found' });
    const results = await executeApiPlan(plan, {
      authToken: 'Bearer tok',
      controllerUrl: 'https://ctrl.local',
      fetchFn: mockFetch,
    });
    expect(results.__missingData__).toContain('/v1/stations/{mac}');
  });

  it('skips disruptive calls', async () => {
    const plan = [{ method: 'PUT', path: '/v1/aps/AP1/reboot', label: '/v1/aps/{sn}/reboot', disruptive: true }];
    const mockFetch = vi.fn();
    await executeApiPlan(plan, { authToken: 'Bearer tok', controllerUrl: 'https://ctrl.local', fetchFn: mockFetch });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Run test — expect FAIL**
```bash
npx vitest run server/ultr0n/auraApiClient.test.js 2>&1 | tail -5
```

- [ ] **Implement**

```javascript
// server/ultr0n/auraApiClient.js
import https from 'node:https';

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function defaultFetch(url, init) {
  const isHttps = url.startsWith('https');
  return fetch(url, isHttps ? { ...init, agent: insecureAgent } : init);
}

async function callOne(call, { authToken, controllerUrl, fetchFn }) {
  const fn = fetchFn ?? defaultFetch;
  const url = `${controllerUrl}/api/management${call.path}`;
  const resp = await fn(url, {
    method: call.method,
    headers: {
      Authorization: authToken ?? '',
      'Content-Type': 'application/json',
    },
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`${resp.status} ${msg}`);
  }
  return resp.json();
}

export async function executeApiPlan(plan, opts) {
  const results = {};
  const missing = [];

  for (const call of plan) {
    if (call.disruptive) continue;
    try {
      results[call.label] = await callOne(call, opts);
    } catch (err) {
      console.warn(`[AuraApiClient] ${call.method} ${call.path} failed: ${err.message}`);
      missing.push(call.label);
    }
  }

  if (missing.length) results.__missingData__ = missing;
  return results;
}

export async function executeDisruptiveCall(call, opts) {
  const result = await callOne(call, opts);
  return result;
}
```

- [ ] **Run test — expect PASS**
```bash
npx vitest run server/ultr0n/auraApiClient.test.js 2>&1 | tail -5
```

- [ ] **Commit**
```bash
git add server/ultr0n/auraApiClient.js server/ultr0n/auraApiClient.test.js
git commit -m "feat(ultr0n): add AURA API client for wireless pipeline"
```

---

### Task 6: Evidence Normalizer (`server/ultr0n/evidenceNormalizer.js`)

**Files:**
- Create: `server/ultr0n/evidenceNormalizer.js`
- Create: `server/ultr0n/evidenceNormalizer.test.js`

- [ ] **Write failing test**

```javascript
// server/ultr0n/evidenceNormalizer.test.js
import { describe, it, expect } from 'vitest';
import { normalizeEvidence } from './evidenceNormalizer.js';

describe('normalizeEvidence', () => {
  it('extracts client fields from station response', () => {
    const raw = {
      '/v1/stations/{macaddress}': {
        macAddress: 'aa:bb:cc:dd:ee:ff',
        hostname: 'TestDevice',
        rssi: -72,
        snr: 18,
        radioBand: '5GHz',
        apName: 'AP-Floor2',
        ssid: 'CorpWifi',
        stationState: 'CONNECTED',
        retryPercent: 25,
      },
    };
    const ev = normalizeEvidence(raw, 'client-disconnect', {});
    expect(ev.client.rssi).toBe(-72);
    expect(ev.client.snr).toBe(18);
    expect(ev.client.apName).toBe('AP-Floor2');
    expect(ev.client.retryRate).toBe(25);
  });

  it('extracts AP ifstats fields', () => {
    const raw = {
      '/v1/aps/ifstats/{apSerialNumber}': {
        radio0: { channelUtilization: 80, noise: -95 },
        radio1: { channelUtilization: 45 },
        clientCount: 38,
      },
    };
    const ev = normalizeEvidence(raw, 'ap-overloaded', {});
    expect(ev.ap.channelUtil2g).toBe(80);
    expect(ev.ap.clientCount).toBe(38);
  });

  it('extracts events array', () => {
    const raw = {
      '/v1/stations/events/{macaddress}': [
        { timestamp: '2026-01-01T00:00:00Z', eventType: 'DEAUTH', description: 'Deauthenticated' },
      ],
    };
    const ev = normalizeEvidence(raw, 'client-disconnect', {});
    expect(ev.events.length).toBe(1);
    expect(ev.events[0].type).toBe('DEAUTH');
  });

  it('populates missingData from __missingData__', () => {
    const raw = { __missingData__: ['/v1/stations/{mac}'] };
    const ev = normalizeEvidence(raw, 'client-disconnect', {});
    expect(ev.missingData).toContain('/v1/stations/{mac}');
  });
});
```

- [ ] **Run test — expect FAIL**
```bash
npx vitest run server/ultr0n/evidenceNormalizer.test.js 2>&1 | tail -5
```

- [ ] **Implement**

```javascript
// server/ultr0n/evidenceNormalizer.js

function findByKeyPattern(raw, ...patterns) {
  for (const key of Object.keys(raw)) {
    if (patterns.some(p => key.includes(p))) return raw[key];
  }
  return null;
}

function extractClient(raw) {
  const station = findByKeyPattern(raw, '/v1/stations/', 'stations/{mac');
  if (!station || Array.isArray(station)) return undefined;
  return {
    mac: station.macAddress,
    name: station.hostname ?? station.clientName,
    rssi: station.rssi ?? station.signalStrength,
    snr: station.snr,
    band: station.radioBand ?? station.band,
    apName: station.apName ?? station.accessPointName,
    ssid: station.ssid ?? station.serviceName,
    state: station.stationState ?? station.connectionState,
    retryRate: station.retryPercent ?? station.txRetryPercent,
  };
}

function extractAp(raw) {
  const ifstats = findByKeyPattern(raw, 'ifstats');
  const state = findByKeyPattern(raw, 'state/aps/');
  const ap = {};
  if (ifstats && !Array.isArray(ifstats)) {
    ap.channelUtil2g = ifstats.radio0?.channelUtilization ?? ifstats.channelUtilization2g;
    ap.channelUtil5g = ifstats.radio1?.channelUtilization ?? ifstats.channelUtilization5g;
    ap.noise = ifstats.radio0?.noise ?? ifstats.noise;
    ap.clientCount = ifstats.clientCount ?? ifstats.stationCount;
    ap.txRetryRate = ifstats.txRetryPercent;
    ap.rxBytes = ifstats.rxBytes;
    ap.txBytes = ifstats.txBytes;
  }
  if (state && !Array.isArray(state)) {
    ap.serial = state.serialNumber ?? state.apSerialNumber;
    ap.name = state.apName ?? state.name;
    ap.state = state.operationalState ?? state.connectionState;
    ap.uptimeSeconds = state.uptime;
    ap.rebootCount = state.rebootCount;
  }
  return Object.keys(ap).length ? ap : undefined;
}

function extractEvents(raw) {
  const events = findByKeyPattern(raw, 'events/');
  if (!Array.isArray(events)) return [];
  return events.map(e => ({
    timestamp: e.timestamp ?? e.eventTime,
    type: e.eventType ?? e.type,
    description: e.description ?? e.message,
  }));
}

function extractWlan(raw) {
  const svc = findByKeyPattern(raw, '/v1/services/', '/v1/services/{');
  if (!svc || Array.isArray(svc)) return undefined;
  return {
    id: svc.id ?? svc.serviceId,
    ssid: svc.ssid ?? svc.name,
    security: svc.securityMode ?? svc.security,
    aaaPolicy: svc.aaaPolicyId ?? svc.aaaPolicyName,
  };
}

function extractSite(raw) {
  const state = findByKeyPattern(raw, 'state/sites/');
  if (!state || Array.isArray(state)) return undefined;
  return {
    id: state.siteId ?? state.id,
    name: state.siteName ?? state.name,
    state: state.operationalState ?? state.healthState,
  };
}

function extractSmartRf(raw) {
  const report = findByKeyPattern(raw, 'smartrf');
  if (!report) return undefined;
  const items = Array.isArray(report) ? report : (report.items ?? []);
  return {
    channelChanges: items.filter(e => e.action === 'CHANNEL_CHANGE' || e.eventType === 'CHANNEL_CHANGE').length,
    powerChanges: items.filter(e => e.action === 'POWER_CHANGE' || e.eventType === 'POWER_CHANGE').length,
    dfsEvents: items.filter(e => e.action === 'DFS' || e.eventType === 'DFS' || e.type === 'DFS').length,
  };
}

function extractAuditLogs(raw) {
  const logs = findByKeyPattern(raw, 'auditlogs');
  if (!Array.isArray(logs)) return [];
  return logs.slice(0, 20).map(l => ({
    timestamp: l.timestamp ?? l.time,
    user: l.user ?? l.operator,
    change: l.description ?? l.action,
  }));
}

export function normalizeEvidence(raw, intent, resolved) {
  return {
    client: extractClient(raw),
    ap: extractAp(raw),
    wlan: extractWlan(raw),
    site: extractSite(raw),
    events: extractEvents(raw),
    smartRf: extractSmartRf(raw),
    auditLogs: extractAuditLogs(raw),
    missingData: raw.__missingData__ ?? [],
    intent,
    resolved,
  };
}
```

- [ ] **Run test — expect PASS**
```bash
npx vitest run server/ultr0n/evidenceNormalizer.test.js 2>&1 | tail -5
```

- [ ] **Commit**
```bash
git add server/ultr0n/evidenceNormalizer.js server/ultr0n/evidenceNormalizer.test.js
git commit -m "feat(ultr0n): add wireless evidence normalizer"
```

---

### Task 7: Root Cause Classifier (`server/ultr0n/rootCauseClassifier.js`)

**Files:**
- Create: `server/ultr0n/rootCauseClassifier.js`
- Create: `server/ultr0n/rootCauseClassifier.test.js`

- [ ] **Write failing test**

```javascript
// server/ultr0n/rootCauseClassifier.test.js
import { describe, it, expect } from 'vitest';
import { classifyRootCause } from './rootCauseClassifier.js';

describe('classifyRootCause', () => {
  it('classifies low RSSI as COVERAGE', () => {
    const ev = { client: { rssi: -78, snr: 12 }, ap: {}, events: [], missingData: [] };
    const result = classifyRootCause(ev, 'client-disconnect');
    expect(result.category).toBe('COVERAGE');
  });

  it('classifies high channel utilization as RF_CONGESTION', () => {
    const ev = { client: { rssi: -55, snr: 30 }, ap: { channelUtil2g: 85, clientCount: 45 }, events: [], missingData: [] };
    const result = classifyRootCause(ev, 'ap-overloaded');
    expect(result.category).toBe('RF_CONGESTION');
  });

  it('classifies auth failure events as AUTHENTICATION', () => {
    const ev = {
      client: { rssi: -55, snr: 30 },
      ap: {},
      events: [{ type: 'AUTH_FAILURE', description: 'RADIUS timeout' }],
      missingData: [],
    };
    const result = classifyRootCause(ev, 'client-auth-fail');
    expect(result.category).toBe('AUTHENTICATION');
  });

  it('classifies DHCP fail event as DHCP_OR_VLAN', () => {
    const ev = {
      client: { rssi: -60, snr: 25 },
      ap: {},
      events: [{ type: 'DHCP_FAIL', description: 'No DHCP response' }],
      missingData: [],
    };
    const result = classifyRootCause(ev, 'client-dhcp-fail');
    expect(result.category).toBe('DHCP_OR_VLAN');
  });

  it('classifies AP offline as AP_INFRASTRUCTURE', () => {
    const ev = { client: {}, ap: { state: 'DISCONNECTED', rebootCount: 3 }, events: [], missingData: [] };
    const result = classifyRootCause(ev, 'ap-offline');
    expect(result.category).toBe('AP_INFRASTRUCTURE');
  });

  it('returns UNKNOWN when no signals found', () => {
    const ev = { client: {}, ap: {}, events: [], missingData: ['/v1/stations/{mac}'] };
    const result = classifyRootCause(ev, 'unknown');
    expect(result.category).toBe('UNKNOWN');
  });
});
```

- [ ] **Run test — expect FAIL**
```bash
npx vitest run server/ultr0n/rootCauseClassifier.test.js 2>&1 | tail -5
```

- [ ] **Implement**

```javascript
// server/ultr0n/rootCauseClassifier.js

const THRESHOLDS = {
  lowRssiDbm: -70,
  criticalRssiDbm: -75,
  lowSnrDb: 20,
  criticalSnrDb: 15,
  highRetryPercent: 20,
  highChannelUtilizationPercent: 70,
  criticalChannelUtilizationPercent: 85,
  highClientCountPerRadio: 40,
  excessiveRoamsPerHour: 6,
  highDhcpFailureCount: 3,
  highAuthFailureCount: 3,
};

function hasEventType(events, ...types) {
  return events.some(e => types.some(t => (e.type ?? '').toUpperCase().includes(t.toUpperCase())));
}

function countEventType(events, ...types) {
  return events.filter(e => types.some(t => (e.type ?? '').toUpperCase().includes(t.toUpperCase()))).length;
}

export function classifyRootCause(evidence, intent) {
  const { client = {}, ap = {}, events = [], missingData = [] } = evidence;

  // AP_INFRASTRUCTURE
  if (ap.state === 'DISCONNECTED' || ap.state === 'OFFLINE' || (ap.rebootCount ?? 0) > 1) {
    return { category: 'AP_INFRASTRUCTURE', explanation: 'AP is offline, disconnected, or has rebooted recently.' };
  }

  // AUTHENTICATION
  if (
    intent === 'client-auth-fail' || intent === 'client-ppsk-fail' ||
    hasEventType(events, 'AUTH_FAIL', 'EAP_FAIL', 'RADIUS', '802.1X', 'PPSK', 'WPA_FAIL')
  ) {
    return { category: 'AUTHENTICATION', explanation: 'Authentication failure events detected — check AAA policy and RADIUS config.' };
  }

  // DHCP_OR_VLAN
  if (
    intent === 'client-dhcp-fail' ||
    hasEventType(events, 'DHCP_FAIL', 'DHCP_TIMEOUT', 'DHCP_ERROR', 'NO_IP')
  ) {
    return { category: 'DHCP_OR_VLAN', explanation: 'DHCP failure after successful association — likely VLAN or DHCP scope issue.' };
  }

  // COVERAGE
  const lowRssi = (client.rssi ?? 0) !== 0 && client.rssi < THRESHOLDS.lowRssiDbm;
  const lowSnr = (client.snr ?? 99) < THRESHOLDS.lowSnrDb;
  if (lowRssi || lowSnr) {
    const critical = (client.rssi ?? 0) < THRESHOLDS.criticalRssiDbm || (client.snr ?? 99) < THRESHOLDS.criticalSnrDb;
    return {
      category: 'COVERAGE',
      explanation: `${critical ? 'Critical' : 'Low'} signal: RSSI ${client.rssi ?? 'N/A'} dBm, SNR ${client.snr ?? 'N/A'} dB. Coverage gap likely.`,
    };
  }

  // RF_CONGESTION
  const highUtil = Math.max(ap.channelUtil2g ?? 0, ap.channelUtil5g ?? 0) > THRESHOLDS.highChannelUtilizationPercent;
  const highClients = (ap.clientCount ?? 0) > THRESHOLDS.highClientCountPerRadio;
  const highRetry = (client.retryRate ?? 0) > THRESHOLDS.highRetryPercent;
  if (highUtil || (highClients && highRetry)) {
    return {
      category: 'RF_CONGESTION',
      explanation: `High RF load: channel utilization ${Math.max(ap.channelUtil2g ?? 0, ap.channelUtil5g ?? 0)}%, ${ap.clientCount ?? 'N/A'} clients, retry rate ${client.retryRate ?? 'N/A'}%.`,
    };
  }

  // ROAMING (excessive roam events)
  const roamCount = countEventType(events, 'ROAM', 'REASSOC');
  if (roamCount > THRESHOLDS.excessiveRoamsPerHour || intent === 'client-roaming') {
    return { category: 'ROAMING', explanation: `${roamCount} roaming events detected — possible sticky client or RF overlap.` };
  }

  // INTERFERENCE (DFS/noise with ok RSSI)
  if (evidence.smartRf?.dfsEvents > 0) {
    return { category: 'INTERFERENCE', explanation: `${evidence.smartRf.dfsEvents} DFS events detected — radar interference causing channel changes.` };
  }

  // WLAN_CONFIG (intent-driven)
  if (['wlan-most-failures', 'wlan-auth-issues', 'client-captive-fail', 'client-ppsk-fail'].includes(intent)) {
    return { category: 'WLAN_CONFIG', explanation: 'Failures correlated with WLAN/SSID configuration — check security, AAA, and captive portal settings.' };
  }

  // SITE_SYSTEMIC
  if (['site-health', 'sites-poor', 'site-ap-impact'].includes(intent)) {
    return { category: 'SITE_SYSTEMIC', explanation: 'Site-wide wireless degradation detected across multiple APs or WLANs.' };
  }

  // CLIENT_SPECIFIC (single client, good infrastructure)
  if (client.rssi && client.rssi > THRESHOLDS.lowRssiDbm && !highUtil) {
    return { category: 'CLIENT_SPECIFIC', explanation: 'Infrastructure appears healthy. Issue may be client-specific — device driver, supplicant, or OS.' };
  }

  return { category: 'UNKNOWN', explanation: 'Insufficient evidence to determine root cause. Missing data: ' + (missingData.join(', ') || 'none identified') };
}
```

- [ ] **Run test — expect PASS**
```bash
npx vitest run server/ultr0n/rootCauseClassifier.test.js 2>&1 | tail -5
```

- [ ] **Commit**
```bash
git add server/ultr0n/rootCauseClassifier.js server/ultr0n/rootCauseClassifier.test.js
git commit -m "feat(ultr0n): add deterministic root cause classifier"
```

---

### Task 8: Confidence Scorer (`server/ultr0n/confidenceScorer.js`)

**Files:**
- Create: `server/ultr0n/confidenceScorer.js`
- Create: `server/ultr0n/confidenceScorer.test.js`

- [ ] **Write failing test**

```javascript
// server/ultr0n/confidenceScorer.test.js
import { describe, it, expect } from 'vitest';
import { scoreConfidence } from './confidenceScorer.js';

describe('scoreConfidence', () => {
  it('returns High when root cause is clear with good evidence', () => {
    const ev = {
      client: { rssi: -80, snr: 10 },
      ap: { channelUtil2g: 45, clientCount: 10 },
      events: [{ type: 'DEAUTH', description: 'low signal' }],
      missingData: [],
    };
    const rc = { category: 'COVERAGE' };
    expect(scoreConfidence(ev, rc)).toBe('High');
  });

  it('returns Low when most data is missing', () => {
    const ev = { client: {}, ap: {}, events: [], missingData: ['/v1/stations/{mac}', '/v1/stations/events/{mac}', '/v1/aps/ifstats/{sn}'] };
    const rc = { category: 'UNKNOWN' };
    expect(scoreConfidence(ev, rc)).toBe('Low');
  });

  it('returns Medium for UNKNOWN root cause with some data', () => {
    const ev = { client: { rssi: -65 }, ap: {}, events: [], missingData: ['/v1/stations/events/{mac}'] };
    const rc = { category: 'UNKNOWN' };
    expect(scoreConfidence(ev, rc)).toBe('Medium');
  });

  it('returns Medium when root cause is clear but events are missing', () => {
    const ev = { client: { rssi: -77 }, ap: {}, events: [], missingData: ['/v1/stations/events/{mac}'] };
    const rc = { category: 'COVERAGE' };
    expect(scoreConfidence(ev, rc)).toBe('Medium');
  });
});
```

- [ ] **Run test — expect FAIL**
```bash
npx vitest run server/ultr0n/confidenceScorer.test.js 2>&1 | tail -5
```

- [ ] **Implement**

```javascript
// server/ultr0n/confidenceScorer.js

export function scoreConfidence(evidence, rootCause) {
  let score = 0;

  if (rootCause.category === 'UNKNOWN') {
    score -= 2;
  } else {
    score += 2;
  }

  // Data availability signals
  if (evidence.client && Object.keys(evidence.client).length > 2) score += 1;
  if (evidence.ap && Object.keys(evidence.ap).length > 2) score += 1;
  if (evidence.events && evidence.events.length > 0) score += 1;
  if (evidence.smartRf) score += 1;

  // Missing data penalizes
  const missingCount = (evidence.missingData ?? []).length;
  score -= Math.min(missingCount, 3);

  if (score >= 3) return 'High';
  if (score >= 1) return 'Medium';
  return 'Low';
}
```

- [ ] **Run test — expect PASS**
```bash
npx vitest run server/ultr0n/confidenceScorer.test.js 2>&1 | tail -5
```

- [ ] **Commit**
```bash
git add server/ultr0n/confidenceScorer.js server/ultr0n/confidenceScorer.test.js
git commit -m "feat(ultr0n): add confidence scorer"
```

---

### Task 9: Wireless System Prompt (`server/ultr0n/wirelessSystemPrompt.js`)

**Files:**
- Create: `server/ultr0n/wirelessSystemPrompt.js`
- Create: `server/ultr0n/wirelessSystemPrompt.test.js`

- [ ] **Write failing test**

```javascript
// server/ultr0n/wirelessSystemPrompt.test.js
import { describe, it, expect } from 'vitest';
import { buildWirelessPrompt } from './wirelessSystemPrompt.js';

const baseEvidence = {
  client: { mac: 'aa:bb', rssi: -78, snr: 15, apName: 'AP-1', ssid: 'Corp' },
  ap: { channelUtil2g: 40 },
  events: [{ type: 'DEAUTH', description: 'low signal', timestamp: '2026-01-01T00:00:00Z' }],
  missingData: [],
};
const rootCause = { category: 'COVERAGE', explanation: 'Low RSSI detected.' };

describe('buildWirelessPrompt', () => {
  it('returns system and user messages', () => {
    const { systemMsg, userMsg } = buildWirelessPrompt({
      question: 'Why did this client disconnect?',
      pageContext: {},
      evidence: baseEvidence,
      rootCause,
      confidence: 'High',
    });
    expect(systemMsg.role).toBe('system');
    expect(userMsg.role).toBe('user');
  });

  it('system prompt contains wireless copilot identity', () => {
    const { systemMsg } = buildWirelessPrompt({ question: 'test', pageContext: {}, evidence: baseEvidence, rootCause, confidence: 'High' });
    expect(systemMsg.content).toContain('Ultr0n');
    expect(systemMsg.content).toContain('wireless');
  });

  it('system prompt includes evidence', () => {
    const { systemMsg } = buildWirelessPrompt({ question: 'test', pageContext: {}, evidence: baseEvidence, rootCause, confidence: 'High' });
    expect(systemMsg.content).toContain('-78');
    expect(systemMsg.content).toContain('DEAUTH');
  });

  it('system prompt includes root cause', () => {
    const { systemMsg } = buildWirelessPrompt({ question: 'test', pageContext: {}, evidence: baseEvidence, rootCause, confidence: 'High' });
    expect(systemMsg.content).toContain('COVERAGE');
  });

  it('user message contains the original question', () => {
    const { userMsg } = buildWirelessPrompt({ question: 'Why did it fail?', pageContext: {}, evidence: baseEvidence, rootCause, confidence: 'Medium' });
    expect(userMsg.content).toBe('Why did it fail?');
  });
});
```

- [ ] **Run test — expect FAIL**
```bash
npx vitest run server/ultr0n/wirelessSystemPrompt.test.js 2>&1 | tail -5
```

- [ ] **Implement**

```javascript
// server/ultr0n/wirelessSystemPrompt.js

const WIRELESS_SYSTEM_PROMPT = `You are Ultr0n, a wireless AI copilot for AURA and Campus Controller. You are not a generic chatbot. You diagnose wireless issues using live API evidence only. Never invent metrics. Never invent API results. If evidence is missing, say what is missing.

Your answer MUST follow this exact format:

Short answer:
{one sentence}

What I found:
- Client: {client summary or N/A}
- AP: {AP summary or N/A}
- WLAN: {WLAN summary or N/A}
- Site: {site summary or N/A}
- Time window: {time window}
- Key events: {key events or none}
- RF indicators: {RF indicators or none}
- AP indicators: {AP indicators or none}
- WLAN/auth indicators: {WLAN/auth indicators or none}

Likely root cause:
{explanation based ONLY on evidence provided}

Confidence:
{High / Medium / Low — use the value provided}

Recommended next actions:
1. {action}
2. {action}
3. {action}

Do not add sections outside this format. Do not invent data not present in the evidence.`;

function evidenceToText(evidence) {
  const lines = ['## Live Evidence Collected'];

  if (evidence.client && Object.keys(evidence.client).length) {
    lines.push('\n### Client');
    for (const [k, v] of Object.entries(evidence.client)) {
      if (v !== undefined && v !== null) lines.push(`- ${k}: ${v}`);
    }
  }

  if (evidence.ap && Object.keys(evidence.ap).length) {
    lines.push('\n### AP');
    for (const [k, v] of Object.entries(evidence.ap)) {
      if (v !== undefined && v !== null) lines.push(`- ${k}: ${v}`);
    }
  }

  if (evidence.wlan) {
    lines.push('\n### WLAN');
    for (const [k, v] of Object.entries(evidence.wlan)) {
      if (v !== undefined && v !== null) lines.push(`- ${k}: ${v}`);
    }
  }

  if (evidence.site) {
    lines.push('\n### Site');
    for (const [k, v] of Object.entries(evidence.site)) {
      if (v !== undefined && v !== null) lines.push(`- ${k}: ${v}`);
    }
  }

  if (evidence.events?.length) {
    lines.push('\n### Station Events (most recent first)');
    for (const e of evidence.events.slice(0, 10)) {
      lines.push(`- [${e.timestamp}] ${e.type}: ${e.description}`);
    }
  }

  if (evidence.smartRf) {
    lines.push('\n### Smart RF');
    lines.push(`- Channel changes: ${evidence.smartRf.channelChanges}`);
    lines.push(`- Power changes: ${evidence.smartRf.powerChanges}`);
    lines.push(`- DFS events: ${evidence.smartRf.dfsEvents}`);
  }

  if (evidence.auditLogs?.length) {
    lines.push('\n### Recent Config Changes');
    for (const l of evidence.auditLogs.slice(0, 5)) {
      lines.push(`- [${l.timestamp}] ${l.user}: ${l.change}`);
    }
  }

  if (evidence.missingData?.length) {
    lines.push('\n### Missing Data (APIs that returned no results)');
    for (const m of evidence.missingData) lines.push(`- ${m}`);
  }

  return lines.join('\n');
}

export function buildWirelessPrompt({ question, pageContext, evidence, rootCause, confidence }) {
  const systemContent = [
    WIRELESS_SYSTEM_PROMPT,
    '',
    evidenceToText(evidence),
    '',
    '## Deterministic Analysis',
    `Root cause category: ${rootCause.category}`,
    `Root cause explanation: ${rootCause.explanation}`,
    `Confidence: ${confidence}`,
    '',
    'Use ONLY the evidence above. Do not invent data. The confidence level is determined — use it exactly as provided.',
  ].join('\n');

  return {
    systemMsg: { role: 'system', content: systemContent },
    userMsg: { role: 'user', content: question },
  };
}
```

- [ ] **Run test — expect PASS**
```bash
npx vitest run server/ultr0n/wirelessSystemPrompt.test.js 2>&1 | tail -5
```

- [ ] **Commit**
```bash
git add server/ultr0n/wirelessSystemPrompt.js server/ultr0n/wirelessSystemPrompt.test.js
git commit -m "feat(ultr0n): add wireless system prompt builder"
```

---

### Task 10: Wireless Query Pipeline (`server/ultr0n/wirelessQueryPipeline.js`)

**Files:**
- Create: `server/ultr0n/wirelessQueryPipeline.js`
- Create: `server/ultr0n/wirelessQueryPipeline.test.js`

- [ ] **Write failing test**

```javascript
// server/ultr0n/wirelessQueryPipeline.test.js
import { describe, it, expect, vi } from 'vitest';
import { runWirelessQuery } from './wirelessQueryPipeline.js';

const ctx = { clientMac: 'aa:bb:cc:dd:ee:ff', apSerialNumber: 'AP001', siteId: 'site-1', pageType: 'client-detail' };

const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ macAddress: 'aa:bb:cc:dd:ee:ff', rssi: -65, snr: 22, stationState: 'CONNECTED' }),
});

describe('runWirelessQuery', () => {
  it('returns a UltronWirelessAnswer shaped object', async () => {
    const result = await runWirelessQuery({
      question: 'Why did this client disconnect?',
      pageContext: ctx,
      authToken: 'Bearer tok',
      controllerUrl: 'https://ctrl.local',
      fetchFn: mockFetch,
      llmProvider: { generateResponse: async () => ({ message: 'Short answer:\nTest answer.\n\nWhat I found:\n- Client: ok' }) },
    });
    expect(typeof result.id).toBe('string');
    expect(result.narrative).toContain('answer');
    expect(['High', 'Medium', 'Low']).toContain(result.confidence);
    expect(Array.isArray(result.apiEvidenceUsed)).toBe(true);
    expect(Array.isArray(result.followUpChips)).toBe(true);
  });

  it('returns requiresConfirmation for disruptive intent without token', async () => {
    const result = await runWirelessQuery({
      question: 'Reboot this AP',
      pageContext: ctx,
      authToken: 'Bearer tok',
      controllerUrl: 'https://ctrl.local',
      fetchFn: mockFetch,
      llmProvider: { generateResponse: async () => ({ message: 'ok' }) },
    });
    expect(result.requiresConfirmation).toBeDefined();
    expect(result.requiresConfirmation.confirmationToken).toBeTruthy();
  });

  it('executes disruptive call when confirmationToken provided', async () => {
    const putFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const result = await runWirelessQuery({
      question: 'Reboot this AP',
      pageContext: ctx,
      confirmationToken: 'valid-token',
      authToken: 'Bearer tok',
      controllerUrl: 'https://ctrl.local',
      fetchFn: putFetch,
      llmProvider: { generateResponse: async () => ({ message: 'Rebooting AP AP001.' }) },
    });
    expect(result.requiresConfirmation).toBeUndefined();
    expect(putFetch).toHaveBeenCalled();
  });
});
```

- [ ] **Run test — expect FAIL**
```bash
npx vitest run server/ultr0n/wirelessQueryPipeline.test.js 2>&1 | tail -5
```

- [ ] **Implement**

```javascript
// server/ultr0n/wirelessQueryPipeline.js
import crypto from 'node:crypto';
import { detectIntent } from './intentDetector.js';
import { planApiCalls, getFollowUpChips } from './apiPlanner.js';
import { checkGuardrails } from './guardrails.js';
import { executeApiPlan, executeDisruptiveCall } from './auraApiClient.js';
import { normalizeEvidence } from './evidenceNormalizer.js';
import { classifyRootCause } from './rootCauseClassifier.js';
import { scoreConfidence } from './confidenceScorer.js';
import { buildWirelessPrompt } from './wirelessSystemPrompt.js';
import { createLlmProvider } from '../ultr0nLlmProvider.js';

export async function runWirelessQuery({
  question,
  pageContext = {},
  confirmationToken,
  authToken,
  controllerUrl,
  fetchFn,
  llmProvider,
}) {
  const { intent, resolved } = detectIntent(question, pageContext);
  const apiPlan = planApiCalls(intent, resolved);

  // Guardrail check
  const guard = checkGuardrails(apiPlan, confirmationToken);
  if (guard.blocked) {
    return {
      id: crypto.randomUUID(),
      question,
      narrative: `This action requires confirmation before proceeding.\n\n**Action:** ${guard.action}\n\n${guard.description}`,
      rootCause: { category: 'UNKNOWN', explanation: 'Action pending confirmation.' },
      confidence: 'High',
      apiEvidenceUsed: [],
      followUpChips: [],
      requiresConfirmation: {
        action: guard.action,
        description: guard.description,
        confirmationToken: guard.confirmationToken,
      },
    };
  }

  // Execute read-only calls
  const readPlan = apiPlan.filter(c => !c.disruptive);
  const disruptivePlan = apiPlan.filter(c => c.disruptive);
  const opts = { authToken, controllerUrl, fetchFn };

  const rawResults = await executeApiPlan(readPlan, opts);

  // Execute disruptive calls if token provided
  if (confirmationToken && disruptivePlan.length > 0) {
    for (const call of disruptivePlan) {
      try {
        rawResults[call.label] = await executeDisruptiveCall(call, opts);
      } catch (err) {
        rawResults.__missingData__ = [...(rawResults.__missingData__ ?? []), call.label];
      }
    }
  }

  const evidence = normalizeEvidence(rawResults, intent, resolved);
  const rootCause = classifyRootCause(evidence, intent);
  const confidence = scoreConfidence(evidence, rootCause);

  // Build LLM prompt and get narrative
  const { systemMsg, userMsg } = buildWirelessPrompt({ question, pageContext, evidence, rootCause, confidence });

  const provider = llmProvider ?? createLlmProvider({});
  let narrative = '';
  try {
    const llmResp = await provider.generateResponse({
      model: process.env.ULTR0N_LLM_MODEL ?? 'grok-3',
      messages: [systemMsg, userMsg],
      temperature: 0.2,
      maxTokens: 1500,
    });
    narrative = llmResp.message;
  } catch (err) {
    narrative = `Short answer:\nUnable to generate full analysis (LLM error: ${err.message}).\n\nLikely root cause:\n${rootCause.explanation}\n\nConfidence:\n${confidence}`;
  }

  const apiEvidenceUsed = [...readPlan, ...(confirmationToken ? disruptivePlan : [])].map(c => `${c.method} ${c.label}`);
  const followUpChips = getFollowUpChips(intent);

  return {
    id: crypto.randomUUID(),
    question,
    narrative,
    rootCause,
    confidence,
    apiEvidenceUsed,
    followUpChips,
    missingData: evidence.missingData,
  };
}
```

- [ ] **Run test — expect PASS**
```bash
npx vitest run server/ultr0n/wirelessQueryPipeline.test.js 2>&1 | tail -5
```

- [ ] **Commit**
```bash
git add server/ultr0n/wirelessQueryPipeline.js server/ultr0n/wirelessQueryPipeline.test.js
git commit -m "feat(ultr0n): add wireless query pipeline (end-to-end orchestration)"
```

---

### Task 11: Backend Route (`server.js`)

**Files:**
- Modify: `server.js` (add wireless route after line 1416)

- [ ] **Add import and route**

Add after `import { ultr0nOrchestrator } from './server/ultr0nOrchestrator.js';` at line 9:
```javascript
import { runWirelessQuery } from './server/ultr0n/wirelessQueryPipeline.js';
```

Add after the existing `// ==================== End Ultr0n Routes ====================` comment (after line 1417, before the proxy middleware):
```javascript
app.post('/api/ultr0n/wireless/query', requireAuth, ultr0nRateLimit, jsonParser, async (req, res) => {
  try {
    const { question, pageContext, confirmationToken } = req.body ?? {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question is required' });
    }
    const controllerUrl = getControllerUrl(req);
    const authToken = req.headers.authorization;
    const answer = await runWirelessQuery({ question, pageContext: pageContext ?? {}, confirmationToken, authToken, controllerUrl });
    res.json(answer);
  } catch (err) {
    console.error('[Ultr0n] wireless/query error:', err.message);
    res.status(500).json({ error: err.message || 'Wireless query failed' });
  }
});
```

- [ ] **Run full test suite**
```bash
npm test 2>&1 | tail -15
```

- [ ] **Commit**
```bash
git add server.js server/ultr0n/
git commit -m "feat(ultr0n): add POST /api/ultr0n/wireless/query route"
```

---

### Task 12: Frontend type updates + API client

**Files:**
- Modify: `src/types/ultron.ts` — extend `UltronPageContext`
- Modify: `src/components/AgentCoworker/agentTypes.ts` — add `wirelessAnswer` to `AgentMessage`
- Modify: `src/services/ultr0nApiClient.ts` — add `queryUltr0nWireless`

- [ ] **Extend UltronPageContext in `src/types/ultron.ts`**

Add these fields to the `UltronPageContext` interface after the `availableActions?` field:
```typescript
  apSerialNumber?: string;
  apName?: string;
  clientMac?: string;
  stationId?: string;
  clientName?: string;
  serviceId?: string;
  ssid?: string;
  wlanName?: string;
  floorId?: string;
  buildingId?: string;
  selectedTimeWindow?: {
    startTime: string;
    endTime: string;
    duration?: string;
  };
```

- [ ] **Add `wirelessAnswer` to AgentMessage in `src/components/AgentCoworker/agentTypes.ts`**

Add import after existing imports:
```typescript
import type { UltronWirelessAnswer } from '@/ultr0n/types';
```

Add field to `AgentMessage` interface after `feedback?`:
```typescript
  wirelessAnswer?: UltronWirelessAnswer;
```

- [ ] **Add `queryUltr0nWireless` to `src/services/ultr0nApiClient.ts`**

Add after `refreshUltr0nContext`:
```typescript
import type { UltronWirelessAnswer } from '@/ultr0n/types';

export async function queryUltr0nWireless(
  question: string,
  context: UltronPageContext,
  confirmationToken?: string
): Promise<UltronWirelessAnswer> {
  return ultr0nFetch('/api/ultr0n/wireless/query', { question, pageContext: context, confirmationToken });
}
```

- [ ] **Run type check**
```bash
npm run type-check 2>&1 | tail -10
```

- [ ] **Commit**
```bash
git add src/types/ultron.ts src/components/AgentCoworker/agentTypes.ts src/services/ultr0nApiClient.ts src/ultr0n/types.ts
git commit -m "feat(ultr0n): extend types and API client for wireless pipeline"
```

---

### Task 13: UltronProgress component

**Files:**
- Create: `src/ultr0n/components/UltronProgress.tsx`
- Create: `src/ultr0n/components/UltronProgress.test.tsx`

- [ ] **Write failing test**

```typescript
// src/ultr0n/components/UltronProgress.test.tsx
import { render, screen } from '@testing-library/react';
import { UltronProgress } from './UltronProgress';

describe('UltronProgress', () => {
  it('renders current step label', () => {
    render(<UltronProgress step={2} />);
    expect(screen.getByText(/Resolving context/i)).toBeInTheDocument();
  });

  it('renders first step when step=0', () => {
    render(<UltronProgress step={0} />);
    expect(screen.getByText(/Understanding question/i)).toBeInTheDocument();
  });

  it('renders done state when step=7', () => {
    render(<UltronProgress step={7} />);
    expect(screen.getByText(/Ready/i)).toBeInTheDocument();
  });
});
```

- [ ] **Run test — expect FAIL**
```bash
npx vitest run src/ultr0n/components/UltronProgress.test.tsx 2>&1 | tail -5
```

- [ ] **Implement**

```typescript
// src/ultr0n/components/UltronProgress.tsx
import { cn } from '@/components/ui/utils';

const STEPS = [
  'Understanding question',
  'Resolving context',
  'Planning API calls',
  'Checking wireless evidence',
  'Correlating results',
  'Building root cause',
  'Ready',
];

interface UltronProgressProps {
  step: number;
  className?: string;
}

export function UltronProgress({ step, className }: UltronProgressProps) {
  const label = STEPS[Math.min(step, STEPS.length - 1)] ?? STEPS[0];
  const pct = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className={cn('flex flex-col gap-2 py-2', className)}>
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
        <span className="text-xs text-white/60">{label}</span>
      </div>
      <div className="h-0.5 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full bg-violet-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Run test — expect PASS**
```bash
npx vitest run src/ultr0n/components/UltronProgress.test.tsx 2>&1 | tail -5
```

- [ ] **Commit**
```bash
git add src/ultr0n/components/UltronProgress.tsx src/ultr0n/components/UltronProgress.test.tsx
git commit -m "feat(ultr0n): add UltronProgress component"
```

---

### Task 14: UltronEvidenceAccordion

**Files:**
- Create: `src/ultr0n/components/UltronEvidenceAccordion.tsx`
- Create: `src/ultr0n/components/UltronEvidenceAccordion.test.tsx`

- [ ] **Write failing test**

```typescript
// src/ultr0n/components/UltronEvidenceAccordion.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { UltronEvidenceAccordion } from './UltronEvidenceAccordion';

describe('UltronEvidenceAccordion', () => {
  it('renders collapsed by default', () => {
    render(<UltronEvidenceAccordion apiCalls={['GET /v1/stations/{mac}', 'GET /v1/aps/ifstats/{sn}']} />);
    expect(screen.queryByText('GET /v1/stations/{mac}')).not.toBeInTheDocument();
  });

  it('shows API calls after clicking toggle', () => {
    render(<UltronEvidenceAccordion apiCalls={['GET /v1/stations/{mac}']} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('GET /v1/stations/{mac}')).toBeInTheDocument();
  });

  it('shows missing data when provided', () => {
    render(
      <UltronEvidenceAccordion
        apiCalls={['GET /v1/stations/{mac}']}
        missingData={['/v1/stations/events/{mac}']}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/events/i)).toBeInTheDocument();
  });
});
```

- [ ] **Run test — expect FAIL**
```bash
npx vitest run src/ultr0n/components/UltronEvidenceAccordion.test.tsx 2>&1 | tail -5
```

- [ ] **Implement**

```typescript
// src/ultr0n/components/UltronEvidenceAccordion.tsx
import { useState } from 'react';
import { ChevronDown, ChevronUp, Database, AlertCircle } from 'lucide-react';
import { cn } from '@/components/ui/utils';

interface UltronEvidenceAccordionProps {
  apiCalls: string[];
  missingData?: string[];
  className?: string;
}

export function UltronEvidenceAccordion({ apiCalls, missingData = [], className }: UltronEvidenceAccordionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('border border-white/8 rounded-lg overflow-hidden', className)}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Database className="h-3 w-3" />
          API evidence used ({apiCalls.length} call{apiCalls.length !== 1 ? 's' : ''})
          {missingData.length > 0 && (
            <span className="text-yellow-400/70">· {missingData.length} missing</span>
          )}
        </span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-1">
          {apiCalls.map((call) => (
            <div key={call} className="text-[11px] font-mono text-white/40 leading-relaxed">
              ✓ {call}
            </div>
          ))}
          {missingData.map((m) => (
            <div key={m} className="flex items-center gap-1 text-[11px] font-mono text-yellow-400/60 leading-relaxed">
              <AlertCircle className="h-2.5 w-2.5 shrink-0" />
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Run test — expect PASS**
```bash
npx vitest run src/ultr0n/components/UltronEvidenceAccordion.test.tsx 2>&1 | tail -5
```

- [ ] **Commit**
```bash
git add src/ultr0n/components/UltronEvidenceAccordion.tsx src/ultr0n/components/UltronEvidenceAccordion.test.tsx
git commit -m "feat(ultr0n): add UltronEvidenceAccordion component"
```

---

### Task 15: UltronFollowUpChips

**Files:**
- Create: `src/ultr0n/components/UltronFollowUpChips.tsx`
- Create: `src/ultr0n/components/UltronFollowUpChips.test.tsx`

- [ ] **Write failing test**

```typescript
// src/ultr0n/components/UltronFollowUpChips.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { UltronFollowUpChips } from './UltronFollowUpChips';

describe('UltronFollowUpChips', () => {
  it('renders provided chips', () => {
    render(<UltronFollowUpChips chips={['Show AP RF stats', 'Reboot AP']} onChipClick={() => {}} />);
    expect(screen.getByText('Show AP RF stats')).toBeInTheDocument();
    expect(screen.getByText('Reboot AP')).toBeInTheDocument();
  });

  it('calls onChipClick with chip text', () => {
    const handler = vi.fn();
    render(<UltronFollowUpChips chips={['Show AP RF stats']} onChipClick={handler} />);
    fireEvent.click(screen.getByText('Show AP RF stats'));
    expect(handler).toHaveBeenCalledWith('Show AP RF stats');
  });

  it('renders nothing when chips array is empty', () => {
    const { container } = render(<UltronFollowUpChips chips={[]} onChipClick={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Run test — expect FAIL**
```bash
npx vitest run src/ultr0n/components/UltronFollowUpChips.test.tsx 2>&1 | tail -5
```

- [ ] **Implement**

```typescript
// src/ultr0n/components/UltronFollowUpChips.tsx
import { cn } from '@/components/ui/utils';
import { AlertTriangle } from 'lucide-react';

const DISRUPTIVE_CHIPS = new Set(['Reboot AP', 'Run packet capture', 'Download logs']);

interface UltronFollowUpChipsProps {
  chips: string[];
  onChipClick: (chip: string) => void;
  className?: string;
}

export function UltronFollowUpChips({ chips, onChipClick, className }: UltronFollowUpChipsProps) {
  if (!chips.length) return null;

  return (
    <div className={cn('flex flex-wrap gap-1.5 pt-1', className)}>
      {chips.map((chip) => {
        const isDisruptive = DISRUPTIVE_CHIPS.has(chip);
        return (
          <button
            key={chip}
            onClick={() => onChipClick(chip)}
            className={cn(
              'flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border transition-colors',
              isDisruptive
                ? 'border-red-500/30 text-red-400/80 hover:bg-red-500/10 hover:text-red-300'
                : 'border-white/10 text-white/50 hover:bg-white/8 hover:text-white/75'
            )}
          >
            {isDisruptive && <AlertTriangle className="h-2.5 w-2.5" />}
            {chip}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Run test — expect PASS**
```bash
npx vitest run src/ultr0n/components/UltronFollowUpChips.test.tsx 2>&1 | tail -5
```

- [ ] **Commit**
```bash
git add src/ultr0n/components/UltronFollowUpChips.tsx src/ultr0n/components/UltronFollowUpChips.test.tsx
git commit -m "feat(ultr0n): add UltronFollowUpChips component"
```

---

### Task 16: UltronAnswerCard

**Files:**
- Create: `src/ultr0n/components/UltronAnswerCard.tsx`
- Create: `src/ultr0n/components/UltronAnswerCard.test.tsx`

- [ ] **Write failing test**

```typescript
// src/ultr0n/components/UltronAnswerCard.test.tsx
import { render, screen } from '@testing-library/react';
import { UltronAnswerCard } from './UltronAnswerCard';
import type { UltronWirelessAnswer } from '../types';

const answer: UltronWirelessAnswer = {
  id: 'test-1',
  question: 'Why did this client disconnect?',
  narrative: 'Short answer:\nLow signal.\n\nWhat I found:\n- Client: RSSI -78 dBm',
  rootCause: { category: 'COVERAGE', explanation: 'Low RSSI detected.' },
  confidence: 'High',
  apiEvidenceUsed: ['GET /v1/stations/{mac}', 'GET /v1/stations/events/{mac}'],
  followUpChips: ['Show AP RF stats'],
  missingData: [],
};

describe('UltronAnswerCard', () => {
  it('renders root cause badge', () => {
    render(<UltronAnswerCard answer={answer} onChipClick={() => {}} />);
    expect(screen.getByText(/Coverage Gap/i)).toBeInTheDocument();
  });

  it('renders confidence badge', () => {
    render(<UltronAnswerCard answer={answer} onChipClick={() => {}} />);
    expect(screen.getByText(/High/i)).toBeInTheDocument();
  });

  it('renders narrative content', () => {
    render(<UltronAnswerCard answer={answer} onChipClick={() => {}} />);
    expect(screen.getByText(/Low signal/i)).toBeInTheDocument();
  });

  it('renders follow-up chip', () => {
    render(<UltronAnswerCard answer={answer} onChipClick={() => {}} />);
    expect(screen.getByText('Show AP RF stats')).toBeInTheDocument();
  });

  it('renders evidence accordion', () => {
    render(<UltronAnswerCard answer={answer} onChipClick={() => {}} />);
    expect(screen.getByText(/API evidence used/i)).toBeInTheDocument();
  });

  it('renders confirm button when requiresConfirmation present', () => {
    const withConfirm: UltronWirelessAnswer = {
      ...answer,
      requiresConfirmation: { action: 'Reboot AP', description: 'Reboots the AP.', confirmationToken: 'tok-1' },
    };
    render(<UltronAnswerCard answer={withConfirm} onChipClick={() => {}} onConfirm={() => {}} />);
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
  });
});
```

- [ ] **Run test — expect FAIL**
```bash
npx vitest run src/ultr0n/components/UltronAnswerCard.test.tsx 2>&1 | tail -5
```

- [ ] **Implement**

```typescript
// src/ultr0n/components/UltronAnswerCard.tsx
import { ShieldAlert } from 'lucide-react';
import type { UltronWirelessAnswer } from '../types';
import { ROOT_CAUSE_LABELS, ROOT_CAUSE_COLORS, CONFIDENCE_COLORS } from '../types';
import { UltronEvidenceAccordion } from './UltronEvidenceAccordion';
import { UltronFollowUpChips } from './UltronFollowUpChips';
import { cn } from '@/components/ui/utils';

interface UltronAnswerCardProps {
  answer: UltronWirelessAnswer;
  onChipClick: (chip: string) => void;
  onConfirm?: (token: string) => void;
  className?: string;
}

export function UltronAnswerCard({ answer, onChipClick, onConfirm, className }: UltronAnswerCardProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', ROOT_CAUSE_COLORS[answer.rootCause.category])}>
          {ROOT_CAUSE_LABELS[answer.rootCause.category]}
        </span>
        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', CONFIDENCE_COLORS[answer.confidence])}>
          {answer.confidence} confidence
        </span>
      </div>

      {/* Narrative */}
      <div className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">
        {answer.narrative}
      </div>

      {/* Confirmation required */}
      {answer.requiresConfirmation && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/20 border border-red-500/20">
          <ShieldAlert className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="text-xs text-red-300">{answer.requiresConfirmation.description}</p>
            <button
              onClick={() => onConfirm?.(answer.requiresConfirmation!.confirmationToken)}
              className="text-xs px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
            >
              Confirm: {answer.requiresConfirmation.action}
            </button>
          </div>
        </div>
      )}

      {/* Evidence accordion */}
      {answer.apiEvidenceUsed.length > 0 && (
        <UltronEvidenceAccordion
          apiCalls={answer.apiEvidenceUsed}
          missingData={answer.missingData}
        />
      )}

      {/* Follow-up chips */}
      <UltronFollowUpChips chips={answer.followUpChips} onChipClick={onChipClick} />
    </div>
  );
}
```

- [ ] **Run test — expect PASS**
```bash
npx vitest run src/ultr0n/components/UltronAnswerCard.test.tsx 2>&1 | tail -5
```

- [ ] **Commit**
```bash
git add src/ultr0n/components/UltronAnswerCard.tsx src/ultr0n/components/UltronAnswerCard.test.tsx
git commit -m "feat(ultr0n): add UltronAnswerCard component"
```

---

### Task 17: Wire up — ConversationStream + UltronContext

**Files:**
- Modify: `src/components/AgentCoworker/panels/ConversationStream.tsx`
- Modify: `src/contexts/UltronContext.tsx`

- [ ] **Update ConversationStream to render UltronAnswerCard**

In `ConversationStream.tsx`, add imports at top:
```typescript
import { UltronAnswerCard } from '@/ultr0n/components/UltronAnswerCard';
import { UltronProgress } from '@/ultr0n/components/UltronProgress';
```

Add `progressStep?: number | null` to `ConversationStreamProps`.

Replace the agent message content block (the `<div className={cn('text-sm leading-relaxed', ...)}>{msg.content}</div>`) with:
```typescript
{msg.wirelessAnswer ? (
  <UltronAnswerCard
    answer={msg.wirelessAnswer}
    onChipClick={onChipClick}
    onConfirm={onConfirm}
  />
) : (
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
)}
```

Replace the `isThinking` spinner block with:
```typescript
{isThinking && (
  <div className="flex gap-3">
    <Bot className="h-6 w-6 shrink-0 mt-0.5 text-violet-400" />
    <div className="flex-1 pt-1">
      {progressStep != null ? (
        <UltronProgress step={progressStep} />
      ) : (
        <div className="flex items-center gap-1.5 py-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
      )}
    </div>
  </div>
)}
```

Add `onChipClick`, `onConfirm`, `progressStep` to the `ConversationStreamProps` interface:
```typescript
  onChipClick: (chip: string) => void;
  onConfirm?: (token: string) => void;
  progressStep?: number | null;
```

- [ ] **Update UltronContext.tsx**

Add `progressStep` state:
```typescript
const [progressStep, setProgressStep] = useState<number | null>(null);
```

Add to `UltronContextValue` interface:
```typescript
  progressStep: number | null;
```

Import `queryUltr0nWireless` and `isWirelessQuestion`:
```typescript
import { queryUltr0nWireless } from '../services/ultr0nApiClient';
```

Replace `sendMessage` with wireless-aware version:
```typescript
const sendMessage = useCallback(async (message: string) => {
  const userMsg: AgentMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    content: message,
    timestamp: new Date(),
  };
  setMessages((prev) => [...prev, userMsg]);
  setIsThinking(true);

  const WIRELESS_TERMS = ['client', 'station', 'ap ', 'access point', 'ssid', 'wlan', 'rf ', 'roam',
    'disconnect', 'authenticat', 'dhcp', 'signal', 'snr', 'rssi', 'channel', 'retry', 'throughput',
    'wifi', 'wi-fi', 'wireless', 'reboot', 'packet capture', 'download log'];
  const isWireless = WIRELESS_TERMS.some(t => message.toLowerCase().includes(t));

  if (isWireless) {
    try {
      // Advance progress steps on a timer
      let step = 0;
      setProgressStep(step);
      const interval = setInterval(() => {
        step = Math.min(step + 1, 5);
        setProgressStep(step);
      }, 800);

      const answer = await queryUltr0nWireless(message, ultronContextRef.current);

      clearInterval(interval);
      setProgressStep(6);
      setTimeout(() => setProgressStep(null), 500);

      const agentMsg: AgentMessage = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        content: answer.narrative,
        timestamp: new Date(),
        wirelessAnswer: answer,
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch {
      setProgressStep(null);
      setMessages((prev) => [...prev, {
        id: `agent-${Date.now()}`,
        role: 'agent',
        content: 'Unable to complete wireless analysis. Please check your connection and try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsThinking(false);
      setProgressStep(null);
    }
    return;
  }

  // Non-wireless: existing generic path
  try {
    const intent = await agentService.parseIntent(message);
    if (intent) {
      const plan = await agentService.buildExecutionPlan(intent);
      const agentMsg: AgentMessage = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        content: `I've built an execution plan for: **${plan.title}**\n\nThis will affect ${plan.impactedObjects.map((o) => o.name).join(', ')}. Review the plan and approve to proceed.`,
        timestamp: new Date(),
        executionPlan: plan,
        reasoning: `Detected write intent: "${intent.action}" targeting ${intent.targetType}. Built ${plan.steps.length}-step plan.`,
      };
      setMessages((prev) => [...prev, agentMsg]);
      setPendingPlan(plan);
      return;
    }

    let sid = sessionIdRef.current;
    if (!sid) {
      const { sessionId: newId } = await createUltr0nSession(ultronContextRef.current);
      sid = newId;
      setSessionId(newId);
      sessionIdRef.current = newId;
    }

    const reply = await sendUltr0nMessage(sid, message, ultronContextRef.current);
    setMessages((prev) => [...prev, reply]);
  } catch {
    setMessages((prev) => [...prev, {
      id: `agent-${Date.now()}`,
      role: 'agent',
      content: 'Unable to get a response. Please check your connection and try again.',
      timestamp: new Date(),
    }]);
  } finally {
    setIsThinking(false);
  }
}, []);
```

Add `progressStep` to the `value` useMemo and its deps array.

- [ ] **Pass progressStep and chip handlers through AgentWorkspace to ConversationStream**

In `AgentWorkspace.tsx`, find where `ConversationStream` is rendered and add:
```typescript
progressStep={progressStep}
onChipClick={(chip) => { /* set input value and submit */ }}
```

Check `useAgentWorkspace.ts` for where `inputValue` and `handleSubmit` are managed, and wire chip click to call `handleSubmit` with chip as the message.

- [ ] **Run full test suite**
```bash
npm test 2>&1 | tail -20
```

- [ ] **Run type check**
```bash
npm run type-check 2>&1 | tail -10
```

- [ ] **Commit**
```bash
git add src/contexts/UltronContext.tsx src/components/AgentCoworker/panels/ConversationStream.tsx src/components/AgentCoworker/AgentWorkspace.tsx
git commit -m "feat(ultr0n): wire wireless pipeline into UI — answer cards, progress, follow-up chips"
```

---

### Final: Push

- [ ] **Push to remote**
```bash
git push origin main
```
