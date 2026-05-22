# Cortex Phase 3 — Wireless AI Copilot Design

**Date:** 2026-05-13  
**Status:** Approved  
**Scope:** Transform Cortex from a generic chatbot into a Marvis-like wireless AI copilot that diagnoses wireless issues using live AURA API evidence.

---

## Context

Cortex Phase 1 shipped the floating command bar and right-side slide-out workspace. Phase 2 wired in the Grok LLM backend (session management, context sanitization, `/api/cortex/message` route). Phase 3 adds wireless intelligence: live API evidence gathering, deterministic root cause classification, structured answer cards, and safety guardrails for disruptive actions.

### What exists today

| Asset | Location | Status |
|---|---|---|
| Floating command bar | `src/components/AgentCoworker/AgentCommandBar.tsx` | Unchanged |
| Right-side slide-out | `src/components/AgentCoworker/AgentWorkspace.tsx` | Minor update |
| Conversation rendering | `src/components/AgentCoworker/panels/ConversationStream.tsx` | Updated |
| React context | `src/contexts/CortexContext.tsx` | Updated |
| Frontend API client | `src/services/cortexApiClient.ts` | Updated |
| LLM provider | `server/cortexLlmProvider.js` | Unchanged |
| Orchestrator | `server/cortexOrchestrator.js` | Updated (new system prompt) |
| Context sanitizer | `server/cortexContextSanitizer.js` | Unchanged |
| Backend routes | `server.js` lines 1363–1414 | New route added |

### What is NOT changing

- `AgentCommandBar.tsx`
- `AgentWorkspace.tsx` (shell only — no structural changes)
- All `AgentCoworker/panels/` except `ConversationStream.tsx`
- Existing `/api/cortex/session`, `/api/cortex/message`, `/api/cortex/context` routes
- `server/cortexLlmProvider.js`
- `server/cortexContextSanitizer.js`

---

## System Prompt

The wireless system prompt replaces the current generic one when processing wireless queries. It is enforced for the `/api/cortex/wireless/query` pipeline only; the existing generic session path keeps its current prompt.

```
You are Cortex, a wireless AI copilot for AURA and Campus Controller. You are not a generic chatbot. You diagnose wireless issues using live API evidence only. Infer context from the current UI page. If the user says "this client," "this AP," "this site," or "this WLAN," resolve it from page context. Never invent metrics. Never invent API results. If evidence is missing, say what is missing. Every answer must include short answer, evidence, likely root cause, confidence, recommended next actions, and API evidence used. Do not perform disruptive actions without confirmation.
```

### Required response format

```
Short answer:
{one sentence}

What I found:
- Client:
- AP:
- WLAN:
- Site:
- Time window:
- Key events:
- RF indicators:
- AP indicators:
- WLAN/auth indicators:

Likely root cause:
{classification and explanation}

Confidence:
High / Medium / Low

Recommended next actions:
1. {action}
2. {action}
3. {action}

API evidence used:
- {METHOD /path}
- {METHOD /path}
```

---

## Architecture

### Request flow

```
User question + page context
  ↓
CortexContext.sendMessage()
  ↓ (wireless question detected)
POST /api/cortex/wireless/query
  ↓
intentDetector        → resolves intent type + entities from page context
  ↓
apiPlanner            → maps intent → ordered API call list
  ↓
guardrails (pre)      → block disruptive calls unless confirmationToken present
  ↓
auraApiClient         → calls Campus Controller via CAMPUS_CONTROLLER_URL
  ↓
evidenceNormalizer    → shapes raw responses into WirelessEvidence
  ↓
rootCauseClassifier   → deterministic threshold-based classification
  ↓
confidenceScorer      → High / Medium / Low
  ↓
Grok (compose)        → structured prompt with evidence; returns formatted answer
  ↓
CortexWirelessAnswer  → JSON returned to frontend
  ↓
CortexAnswerCard      → rendered in ConversationStream
```

Non-wireless questions (general config, help, navigation) continue through the existing `/api/cortex/message` session path unchanged.

### Wireless question detection

A question is routed to the wireless pipeline if it matches any of these signals:
- Contains wireless entity terms: client, station, AP, access point, SSID, WLAN, RF, roam, disconnect, authenticate, DHCP, signal, SNR, RSSI, channel, retry, throughput
- Page type is `client-detail`, `client-list`, `ap-detail`, `ap-list`, `wlan-list`, `wlan-detail`, `rf-dashboard`, `site-dashboard`, `alerts`
- Matches any of the 37 mapped question patterns

---

## Backend Additions

All new backend files live in `server/cortex/`.

### `server/cortex/intentDetector.js`

Maps a natural language question to one of ~37 wireless intents. Entity resolution uses page context to fill:
- `macaddress` / `stationId` from `pageContext.clientMac`
- `apSerialNumber` from `pageContext.apSerialNumber`
- `siteId` from `pageContext.siteId`
- `serviceId` / `ssid` from `pageContext.serviceId` or `pageContext.ssid`

Intent types:
```
client-poor-wifi | client-disconnect | client-roaming | client-slow |
client-band-stuck | client-auth-fail | client-dhcp-fail | client-ppsk-fail |
client-captive-fail | clients-low-rssi | clients-high-retry | clients-auth-failed |
clients-sticky | ap-overloaded | ap-high-utilization | ap-cci |
ap-channel-power-change | ap-dfs | ap-offline | ap-bad-uplink |
ap-underpowered | ap-client-history | ap-radio-stats | ap-rf-context |
wlan-most-failures | wlan-client-count | wlan-auth-issues | wlan-deployed-where |
wlan-compare | site-health | sites-poor | site-ap-impact |
config-change-before-issue | what-to-fix | action-packet-capture |
action-download-logs | action-reboot-ap
```

### `server/cortex/apiPlanner.js`

Maps each intent to an ordered list of API calls. Each call entry:

```js
{
  method: 'GET',
  path: '/v1/stations/{macaddress}',
  params: { macaddress: '{resolved.macaddress}' },
  required: true,           // false = skip if entity missing
  disruptive: false,
}
```

Implements the full 37-question API mapping from the spec. Templates use `{resolved.*}` placeholders filled by `intentDetector` output.

### `server/cortex/auraApiClient.js`

Executes API calls against the Campus Controller. Uses `CAMPUS_CONTROLLER_URL` env var as base. Forwards the session's auth token. Returns raw JSON or throws with status code. Parallel execution where calls are independent; sequential where one result feeds the next (e.g., resolve station ID before fetching report).

### `server/cortex/evidenceNormalizer.js`

Shapes raw multi-API responses into a typed `WirelessEvidence` object:

```js
{
  client: { mac, name, rssi, snr, band, apName, ssid, state, retryRate },
  ap: { serial, name, state, channelUtil2g, channelUtil5g, clientCount, noise },
  wlan: { id, ssid, security, aaaPolicy },
  site: { id, name, state },
  events: [{ timestamp, type, description }],
  smartRf: { channelChanges, powerChanges, dfsEvents },
  auditLogs: [{ timestamp, user, change }],
  missingData: ['GET /v1/stations/events/{mac}'],  // calls that returned 404/empty
}
```

### `server/cortex/rootCauseClassifier.js`

Deterministic classification. Thresholds:

```js
LOW_RSSI_DBM = -70
CRITICAL_RSSI_DBM = -75
LOW_SNR_DB = 20
CRITICAL_SNR_DB = 15
HIGH_RETRY_PERCENT = 20
HIGH_CHANNEL_UTIL_PERCENT = 70
CRITICAL_CHANNEL_UTIL_PERCENT = 85
HIGH_CLIENT_COUNT_PER_RADIO = 40
EXCESSIVE_ROAMS_PER_HOUR = 6
HIGH_DHCP_FAILURE_COUNT = 3
HIGH_AUTH_FAILURE_COUNT = 3
```

Root cause categories:

| Category | Primary signals |
|---|---|
| `CLIENT_SPECIFIC` | One client impacted; nearby clients healthy; client-initiated disconnect |
| `COVERAGE` | RSSI < LOW_RSSI_DBM; SNR < LOW_SNR_DB; cell-edge roaming |
| `RF_CONGESTION` | Channel util > HIGH; high retries across multiple clients |
| `INTERFERENCE` | High noise; low SNR with acceptable RSSI; DFS events |
| `ROAMING` | Roam count > EXCESSIVE; sticky client; AP bouncing |
| `AUTHENTICATION` | 802.1X/EAP/RADIUS/PPSK/WPA failure events |
| `DHCP_OR_VLAN` | Assoc+auth success; DHCP fail event; role/VLAN mismatch |
| `AP_INFRASTRUCTURE` | AP offline/reboot; uplink errors; PoE/CRC issues |
| `WLAN_CONFIG` | Failures clustered by SSID; recent WLAN config change |
| `SITE_SYSTEMIC` | Many APs + WLANs impacted; site-wide degradation |
| `UNKNOWN` | Insufficient evidence |

### `server/cortex/confidenceScorer.js`

```
High:   Multiple APIs agree; clear scope; timeline supports cause; direct action available
Medium: Strong signal exists; one confirming source missing; scope partially clear
Low:    One weak signal; missing event timeline or report data; conflicting evidence
```

### `server/cortex/wirelessSystemPrompt.js`

Exports `buildWirelessSystemMessage(evidence, rootCause, confidence)` — assembles the Grok prompt from normalized evidence + classifier output. Grok's role is answer composition only; it does not decide root cause.

### `server/cortex/guardrails.js`

```js
DISRUPTIVE_ACTIONS = [
  'PUT /v1/aps/{apSerialNumber}/reboot',
  'PUT /v1/aps/{apSerialNumber}/reset',
  'PUT /v1/aps/{apSerialNumber}/upgrade',
  'PUT /v1/aps/{apSerialNumber}/realcapture',
  'PUT /v1/aps/{apSerialNumber}/logs',
]
```

When a planned API call is disruptive and no `confirmationToken` is present in the request, the pipeline short-circuits and returns a `requiresConfirmation: true` answer with the action description. The frontend shows a "Confirm" button; clicking sends the same question with `confirmationToken` included.

### New backend route

```
POST /api/cortex/wireless/query
Body: { question, pageContext, confirmationToken? }
Auth: requireAuth + cortexRateLimit
Returns: CortexWirelessAnswer
```

`CortexWirelessAnswer` shape:
```js
{
  id: string,
  question: string,
  shortAnswer: string,
  whatIFound: { client, ap, wlan, site, timeWindow, keyEvents, rfIndicators, apIndicators, wlanAuthIndicators },
  rootCause: { category, explanation },
  confidence: 'High' | 'Medium' | 'Low',
  nextActions: string[],
  apiEvidenceUsed: string[],           // ['GET /v1/stations/{mac}', ...]
  followUpChips: string[],             // selected from standard chip list
  requiresConfirmation?: { action, description, confirmationToken },
  missingData?: string[],
}
```

---

## Frontend Additions

### `src/cortex/types.ts`

TypeScript interfaces for `CortexWirelessAnswer`, `RootCauseCategory`, `WirelessEvidence`, `FollowUpChip`, `ConfirmationRequest`.

### `src/cortex/components/CortexAnswerCard.tsx`

Renders a `CortexWirelessAnswer`:
- Root cause badge (category + color-coded by severity)
- Confidence badge (High=green, Medium=amber, Low=red)
- "What I found" bullet list
- Recommended next actions numbered list
- `CortexEvidenceAccordion` (collapsed by default)
- `CortexFollowUpChips`
- Confirm button (shown only when `requiresConfirmation` present)

### `src/cortex/components/CortexProgress.tsx`

7-step animated progress indicator shown while `/api/cortex/wireless/query` is in flight:

1. Understanding question
2. Resolving context
3. Planning API calls
4. Checking wireless evidence
5. Correlating results
6. Building root cause
7. Ready

Driven by SSE or polling — backend streams progress events, or frontend advances on a timer if SSE is not implemented initially (acceptable for Phase 3).

### `src/cortex/components/CortexEvidenceAccordion.tsx`

Collapsible section showing:
- Each API call used (`METHOD /path`) with response status
- Key fields extracted from each response (not raw JSON — summarized)

### `src/cortex/components/CortexFollowUpChips.tsx`

Chip strip rendered below each answer card. Standard chip list:

```
Show client timeline | Show impacted clients | Show AP RF stats |
Show Smart RF history | Check WLAN config | Check AAA policy |
Compare previous 24 hours | Locate AP | Run packet capture |
Download logs | Reboot AP
```

Clicking a chip sends that chip text as a new question with the current page context.

---

## Modified Files

### `src/contexts/CortexContext.tsx`

- Add `progressStep: number | null` to state
- `sendMessage`: check if question is wireless → call `/api/cortex/wireless/query` → set `progressStep` during flight → set `progressStep = null` on completion
- Non-wireless questions continue through existing session path

### `src/services/cortexApiClient.ts`

Add `queryCortexWireless(question, context, confirmationToken?)` function calling `POST /api/cortex/wireless/query`.

### `src/components/AgentCoworker/panels/ConversationStream.tsx`

- If message has `wirelessAnswer` field → render `<CortexAnswerCard>`
- Otherwise → existing plain text rendering (unchanged)

### `server/cortexOrchestrator.js`

- No structural changes
- Generic session path continues working as-is

### `server.js`

- Add `POST /api/cortex/wireless/query` route wiring to new pipeline

---

## Page Context Type (wireless-extended)

The existing `CortexPageContext` in `src/types/cortex.ts` is extended with wireless-specific fields:

```ts
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
selectedTimeWindow?: { startTime: string; endTime: string; duration?: string };
```

These fields are set by page components (AP detail, client detail, WLAN detail) via `setPageMetadata` or direct context updates.

---

## Follow-up chip → intent mapping

| Chip | Detected intent |
|---|---|
| Show client timeline | `client-disconnect` (with resolved MAC) |
| Show impacted clients | `clients-low-rssi` or `clients-high-retry` |
| Show AP RF stats | `ap-radio-stats` |
| Show Smart RF history | `ap-rf-context` |
| Check WLAN config | `wlan-most-failures` |
| Check AAA policy | `client-auth-fail` |
| Compare previous 24 hours | re-runs prior intent with adjusted time window |
| Locate AP | read-only, blinks AP via PUT /locate (no confirmation needed per spec) |
| Run packet capture | `action-packet-capture` (disruptive — confirm) |
| Download logs | `action-download-logs` (disruptive — confirm) |
| Reboot AP | `action-reboot-ap` (disruptive — confirm) |

---

## Default Time Windows

| Query type | Window |
|---|---|
| Real-time health | `showActive=true` |
| Troubleshooting | Last 24 hours |
| Today | Current local day |
| This week | Last 7 days |
| Recently | Last 24 hours |
| Specific historical time | Narrow window around requested time |

---

## Testing

- Unit tests for `rootCauseClassifier.js` (threshold scenarios per category)
- Unit tests for `intentDetector.js` (question → intent mapping)
- Unit tests for `confidenceScorer.js`
- Unit tests for `guardrails.js` (disruptive call detection)
- Integration test for `/api/cortex/wireless/query` with mock `auraApiClient`
- Frontend component tests for `CortexAnswerCard`, `CortexProgress`, `CortexEvidenceAccordion`

---

## Out of Scope (Phase 3)

- SSE streaming of progress steps (timer-based advancement acceptable initially)
- Floor map / location overlay
- Multi-turn wireless conversation memory (each wireless query is self-contained)
- Batch queries across multiple clients simultaneously
- Webhook or alert-triggered auto-analysis
