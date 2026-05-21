# AURA Network Intent Engine (NIE) — Design Spec

**Date:** 2026-05-21
**Status:** Approved
**Author:** thomassophiea

---

## Overview

The Network Intent Engine (NIE) transforms AURA from a monitoring platform into an AI-assisted network control plane. Natural-language operator intent becomes validated, confidence-scored, approved, provisioned, and verified — all without blindly pushing configuration.

The core differentiator is **real-time infrastructure validation before provisioning**. The AI never provisions blind. It interrogates existing Campus Controller APIs, operational telemetry, LLDP topology, and live AP state to determine whether the network can actually support the requested intent.

---

## Design Principles

1. **Validate before provisioning.** Every write is preceded by a structured validation pass using live controller APIs.
2. **Confidence gates, not prompts.** Low confidence blocks automatically. Medium requires explicit approval. High proceeds with summary.
3. **Deterministic, not generative.** The validation and provisioning pipeline is runbook-driven. The LLM reasons over evidence; it does not invent configuration.
4. **Auditable at every step.** Intent → validation → approval → provision → verify: all logged with evidence.
5. **Build on existing systems.** No parallel configuration logic. The AI layer consumes existing Campus Controller APIs as the sole source of truth.

---

## Architecture

### Operator Surface

Red Queen terminal (existing PTY in AURA, PIN-gated). Operators type natural-language provisioning intent. Claude Code runs with the enhanced AI-First skill. No UI changes needed for Phase 1–2.

### Execution Brain

AI-First Claude Code skill (enhanced). The skill orchestrates the full pipeline: parse → validate → score → approve → provision → verify.

### Diagnostic Copilot

Ultr0n (unchanged). Stays as read-only wireless diagnostic layer. Phase 3 adds a `getDriftAlerts` tool to Ultr0n so operators can query drift state conversationally.

### Phase 1–2: Skill-Layer Pipeline

```
Operator → Red Queen PTY
  ↓ natural language intent
Claude Code + AI-First skill
  │
  ├── 1. Parse Intent
  │     Intent parser extracts structured object from natural language.
  │     Missing required fields are requested from operator before proceeding.
  │
  ├── 2. Validate Infrastructure
  │     Validation runbooks run in sequence (see Phase 1 assets).
  │     Each runbook makes live XCC API calls via AURA proxy (/api/management/*).
  │     Checks: VLAN exists, DHCP scope, switch trunk (LLDP), AP capacity,
  │             RF impact, existing operational patterns, security posture.
  │
  ├── 3. Confidence Score
  │     Aggregated from all validation check results.
  │     Score 0–100 with named reasons.
  │     LOW  (<60): block, explain gap, suggest remediation
  │     MEDIUM (60–79): present findings, require explicit operator approval
  │     HIGH (80+): present summary, operator approves to proceed
  │
  ├── 4. Operator Approval Gate
  │     Skill presents validation report and confidence to operator.
  │     Operator explicitly types "approve" or "cancel".
  │     No write occurs without this gate.
  │
  ├── 5. Provision
  │     Existing ai-first scenarios execute (create-ssid, clone-ssid, etc.).
  │     Approval token passed through.
  │     Scheduling attached if intent included temporal scope.
  │
  └── 6. Closed-Loop Verify
        Re-queries operational APIs 15–30s after write.
        Confirms: SSID broadcasting, DHCP leasing, client association succeeding.
        Reports concrete outcome or failure + rollback suggestion.
```

### Phase 3–4: Backend Validation Service

New `server/validationEngine/` module. Shares `auraApiClient.js` with Ultr0n. Runs independently of skill invocations for continuous drift monitoring.

```
server/
  validationEngine/
    vlanValidator.js          Query /v1/topologies, correlate with AP uplinks
    lldpTopologyResolver.js   AP → switch → port → allowed VLANs via LLDP
    dhcpValidator.js          Scope existence + gateway reachability
    rfCapacityAnalyzer.js     Beacon overhead, SSID count per AP, channel utilization
    driftMonitor.js           Continuous poll, emit alerts on infra drift
    schedulerService.js       Maps AI schedules → XCC scheduler API objects
    confidenceAggregator.js   Merges multi-source evidence into confidence score
    rollbackEngine.js         Stores pre-provision state snapshots, enables undo

  routes (new, added to server.js):
    POST /api/validate/intent       Full pre-provision validation (returns report + token)
    GET  /api/validate/vlan/:id     Single VLAN reachability check
    GET  /api/validate/topology     LLDP topology snapshot
    POST /api/provision             Gated provision (requires validationToken)
    POST /api/verify/:jobId         Post-provision closed-loop check
    GET  /api/drift                 Current drift alerts
    POST /api/rollback/:auditId     Restore pre-provision state
```

---

## Phase Roadmap

### Phase 1 — Validation Engine (read-only, skill-layer)

**Goal:** AI answers "Can I add X?" with a confidence-scored validation report. No writes.

| Asset | Purpose |
|---|---|
| `scenarios/validate-vlan.md` | VLAN exists in topology, has DHCP relay, used on nearby APs |
| `scenarios/validate-ap-capacity.md` | AP model support, SSID count limits, radio utilization headroom |
| `scenarios/validate-switch-path.md` | LLDP data from AP uplinks confirms VLAN is trunked |
| `scenarios/validate-rf-impact.md` | Beacon overhead estimate, channel utilization delta |
| `scenarios/validate-dhcp.md` | DHCP scope + gateway + DNS reachability |
| `references/validation-rules.md` | Hard limits, scoring formula, confidence multipliers |
| `references/lldp-api.md` | LLDP endpoint patterns on XCC |

**Deliverable:** Operator asks "Can I add a guest SSID on VLAN 120 at Building A?" → full validation report + confidence score. No provisioning attempted.

---

### Phase 2 — Assisted Provisioning (skill-layer)

**Goal:** Validated intent becomes deployable configuration. Operator approves; AI executes and verifies.

| Asset | Purpose |
|---|---|
| Enhanced `SKILL.md` workflow | New mandatory sequence: validate → score → approve → provision → verify |
| `scenarios/verify-post-provision.md` | Closed-loop check: SSID broadcasting, DHCP leasing, client success rate |
| `scenarios/schedule-ssid.md` | Natural-language schedule → XCC scheduler API objects |
| `scenarios/rollback.md` | Re-reads pre-provision snapshot, generates targeted undo steps |
| `references/scheduler-api.md` | XCC schedule endpoint patterns (recurring, one-time, event-triggered) |
| Enhanced existing scenarios | All provisioning scenarios now call validate-* first, pass confidence token |

**Deliverable:** "Create guest SSID on VLAN 120, weekends only" → validate (confidence 94) → operator approves → SSID created + schedule attached → closed-loop confirms broadcasting within 60s.

---

### Phase 3 — Closed-Loop Operations (backend service)

**Goal:** Real-time drift monitoring, server-side scheduling, push alerts. Runs continuously.

| Asset | Purpose |
|---|---|
| `server/validationEngine/driftMonitor.js` | Polls XCC operational APIs, detects infra drift (VLAN removed, trunk changed, AP moved) |
| `server/validationEngine/schedulerService.js` | Creates and manages XCC schedule objects programmatically |
| `server/validationEngine/rollbackEngine.js` | Stores pre-provision snapshots, enables one-click rollback |
| `/api/validate/intent` | Backend-powered validation (richer than skill-only) with cached infra state |
| `/api/drift` | Drift alert feed consumed by Ultr0n and Red Queen |
| Ultr0n `getDriftAlerts` tool | New tool in toolCatalog.js: operator asks "what's drifted?" |

**Deliverable:** AURA alerts: "Guest SSID operational integrity degraded — VLAN 120 removed from 4 AP uplinks." Operator responds in Red Queen or queries via Ultr0n.

---

### Phase 4 — Autonomous Network Operations (policy-gated)

**Goal:** AI acts autonomously within operator-defined policy boundaries.

| Asset | Purpose |
|---|---|
| `references/autonomy-policies.md` | Policy schema: what AI can execute without asking, what always requires approval |
| Event-triggered provisioning | Controller events (new AP onboard, site added) trigger validation + conditional provision |
| Self-healing workflows | Drift detected → AI validates remediation → auto-heals if policy permits, else raises alert |
| Full audit log | Every AI action logged: intent, evidence, confidence, operator or policy authority, outcome |

**Deliverable:** "When a new AP comes online at a site, automatically assign it to the correct profile and verify it's broadcasting within 60 seconds." Runs without operator intervention if policy permits.

---

## Key Data Structures

### Intent Object

```json
{
  "action": "create_ssid",
  "ssid_name": "Guest-Building-A",
  "site": "Building A",
  "vlan": 120,
  "security": "WPA2-PSK",
  "broadcast_scope": "Site",
  "schedule": {
    "type": "recurring",
    "days": ["Saturday", "Sunday"],
    "start": "08:00",
    "end": "22:00",
    "timezone": "America/New_York"
  },
  "requestedBy": "operator",
  "timestamp": "2026-05-21T17:00:00Z"
}
```

### Validation Report

```json
{
  "intent": { },
  "checks": [
    { "name": "vlan_exists",        "result": "pass", "evidence": "VLAN 120 found in topology 'Building-A-Corp'" },
    { "name": "dhcp_scope",         "result": "pass", "evidence": "DHCP relay 10.1.120.1 reachable" },
    { "name": "switch_trunk",       "result": "warn", "evidence": "AP-03, AP-04 uplinks missing VLAN 120" },
    { "name": "rf_capacity",        "result": "pass", "evidence": "6 APs, avg 3.2 SSIDs/radio, headroom OK" },
    { "name": "ap_model_support",   "result": "pass", "evidence": "All APs support WPA2-PSK" },
    { "name": "ssid_limit",         "result": "pass", "evidence": "Max 8 SSIDs/AP, currently 4" },
    { "name": "operational_pattern","result": "pass", "evidence": "VLAN 120 already in use on 10 nearby APs" }
  ],
  "confidence": {
    "score": 78,
    "band": "MEDIUM",
    "blocking_issues": [],
    "warnings": ["AP-03 and AP-04 uplinks not trunked for VLAN 120 — clients on those APs will drop"]
  },
  "recommendation": "Proceed with approval. Recommend fixing AP-03/AP-04 switch trunks before enabling.",
  "provisioningToken": "vtok_abc123",
  "expiresAt": "2026-05-21T17:30:00Z"
}
```

### Confidence Scoring Formula

```
base_score = 50

per check:
  pass  → +8 to +15 (weight by criticality)
  warn  → +0 to +3
  fail  → -15 to -30 (weight by criticality)

multipliers:
  operational_pattern match (nearby APs using same VLAN) → ×1.2
  identical service exists at another site              → ×1.1
  any blocking check fails                              → score capped at 40

bands:
  HIGH   ≥ 80  → present summary, approve to proceed
  MEDIUM 60–79 → present findings, require explicit operator approval
  LOW    < 60  → block, explain gap, suggest remediation steps
```

### Audit Log Entry

```json
{
  "id": "audit_xyz789",
  "timestamp": "2026-05-21T17:04:33Z",
  "operator": "admin",
  "rawIntent": "create guest SSID Building A VLAN 120 weekends only",
  "parsedIntent": { },
  "validationReport": { },
  "approval": {
    "by": "admin",
    "at": "2026-05-21T17:05:01Z",
    "method": "explicit"
  },
  "preProvisionSnapshot": { },
  "provisionResult": {
    "status": "success",
    "serviceId": "svc-abc",
    "profilesUpdated": 51
  },
  "verifyResult": {
    "broadcasting": true,
    "clientsAssociating": true,
    "dhcpLeasing": true,
    "verifiedAt": "2026-05-21T17:05:45Z"
  },
  "durationMs": 4200
}
```

---

## Error Handling and Rollback

### Validation Failures

| Failure type | Behavior |
|---|---|
| Blocking check fails (VLAN missing, DHCP scope absent) | Score capped at 40 → blocked. Skill explains gap + suggests remediation (e.g., "Create VLAN 120 topology first"). No provision attempted. |
| Warning-only (switch trunk partial) | Score MEDIUM. Skill presents warnings prominently. Operator can acknowledge and approve. |
| API unreachable during validation | Validation fails open-safe: score drops to LOW, provision blocked. |

### Provisioning Failures

| Failure type | Behavior |
|---|---|
| XCC returns 4xx on write | Skill reports error + exact API response. No partial state. |
| Partial write (some profiles updated, some not) | Skill reports partial success, lists which profiles failed. Operator can retry failed profiles or rollback. |
| Closed-loop verify fails (SSID not broadcasting after 60s) | Skill reports failure, presents rollback option. Pre-provision snapshot allows targeted undo. |

### Rollback

Before every write, the skill captures a pre-provision snapshot:
- Current service IDs and their configuration
- Profile assignments for each AP in scope
- Existing schedule objects (if any)

If rollback is requested, the skill executes targeted DELETE/PUT calls to restore prior state. Rollback is always explicit — never automatic in Phase 1–2.

---

## Validation Runbook Structure

Each `scenarios/validate-*.md` follows this format:

```
## Trigger
When to run this check (which actions require it).

## API Calls
Ordered list of XCC API calls with expected response shapes.

## Pass Conditions
Specific field values / presence checks that constitute a pass.

## Warn Conditions
Conditions that are degraded but not blocking.

## Fail Conditions
Conditions that block provisioning.

## Confidence Contribution
Score contribution on pass / warn / fail (absolute points, not percentages).

## Evidence Format
How to present the result in the validation report.

## Remediation Suggestions
Concrete steps to resolve fail or warn conditions.
```

---

## XCC API Surface Used

### Configuration APIs (validation input)

| API | Use |
|---|---|
| `GET /v1/topologies` | VLAN existence, DHCP relay config |
| `GET /v1/services` | Existing WLANs, dot1dPortNumber in use |
| `GET /v1/aps` | AP inventory, model, firmware, profile assignment |
| `GET /v3/profiles` | Profile-to-radioIfList binding, site scope |
| `GET /v1/schedulers` | Existing schedule objects |

### Operational / State APIs (validation input)

| API | Use |
|---|---|
| `GET /v1/state/aps` | AP online state, uplink port, LLDP neighbor |
| `GET /v1/state/sites` | Site health, AP rollup |
| `GET /v1/stations` | Client associations, DHCP state |
| `GET /v1/aps/{serial}/lldp` | Switch port, allowed VLANs, native VLAN, PoE, STP |

### Write APIs (provisioning only, gated)

| API | Use |
|---|---|
| `POST /v1/services` | Create WLAN service |
| `PUT /v1/services/{id}` | Modify existing service |
| `POST /v3/profiles/{id}/radioIfList` | Bind service to radio |
| `POST /v1/schedulers` | Create schedule object |
| `DELETE /v1/services/{id}` | Rollback: remove created service |

---

## Security Constraints

- Write operations require an explicit operator `approve` gate — no autonomous writes in Phase 1–2.
- `provisioningToken` has a 30-minute TTL. Expired tokens block execution.
- All LLM context is sanitized by `ultr0nContextSanitizer.js` — no credentials, tokens, or raw API keys reach the LLM.
- LLDP data and AP uplink state are treated as read-only validation evidence only.
- Phase 4 autonomy requires a separate `autonomy-policies.md` configuration explicitly authored by the operator before any autonomous writes.

---

## Integration Points

| System | Role |
|---|---|
| Red Queen terminal | Operator surface for all NIE interactions (Phase 1–4) |
| AI-First Claude skill | Execution brain — enhanced with validation, verify, rollback, scheduling |
| Ultr0n copilot | Diagnostic layer (unchanged Phase 1–2); gains `getDriftAlerts` tool in Phase 3 |
| AURA proxy (`server.js`) | All XCC API calls route through existing `/api/management/*` proxy |
| `auraApiClient.js` | Shared HTTP client; used by both ultr0n pipeline and validationEngine |
| `driftDetectionService.ts` | Existing frontend drift detection; Phase 3 replaces/extends with server-side monitor |

---

## Out of Scope

- Replacement of existing AURA configuration UI (SSID forms, profile editors). NIE is an additive AI layer, not a replacement for the existing operator workflows.
- Non-XCC network infrastructure (third-party switches beyond LLDP data available via XCC).
- Natural-language queries about non-wireless domains (NIE = wireless provisioning only; Ultr0n handles diagnostic queries).
- OpenAI / Groq / Gemini-backed provisioning. AI-First skill uses Claude Code (Sonnet 4.6 / Opus 4.7). Model selection for NIE is separate from the multi-provider picker.

---

## Success Criteria by Phase

| Phase | Success |
|---|---|
| 1 | Operator asks "Can I add X?" and gets a confidence-scored validation report using live XCC data. No writes occur. |
| 2 | End-to-end: natural language → validate → approve → SSID deployed → closed-loop confirms broadcasting within 60s. |
| 3 | AURA alerts on drift without operator asking. Operator can query drift state via Ultr0n. |
| 4 | New AP onboarded → automatically profiled and verified → no operator action required (under policy). |
