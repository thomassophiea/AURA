# Cortex + Anthropic + AI-First — engineering audit

**Date:** 2026-09-14
**Branch:** `feat/cortex-anthropic-ai-first`
**Scope:** 18 files changed
**Verification:** full suite **4,528 passed / 106 skipped / 0 failed**; Cortex suite **558 tests across 32 files** (baseline 413 / 27). Type-check clean.
**Includes:** an independent adversarial review of this branch and the fixes for every material finding — see §5a.

---

## 1. The headline correction

**The brief assumed a greenfield build. It is not one.** Aura Cortex already existed and was
substantially built to the spec the brief describes. The valuable work was therefore *finding
what was missing or silently broken*, not rebuilding.

Already present and good before this branch:

| Asked for | Already existed |
|---|---|
| Evidence ledger, model-proof | `investigationAgent.js` — append-only, written by the runtime |
| Prompt-injection fencing | `<<network-data>>` fencing + `looksLikeInjection()` |
| Bounded agent loop | iterations / tool calls / wall-clock / per-tool timeout / repeat guard |
| Server-side tool authorisation | loop refuses any tool whose risk is not `read`/`diagnostic` |
| Provider abstraction | `cortexLlmProvider.js`, 9 providers, Anthropic already implemented |
| No mock mode | `MockLlmProvider` deliberately deleted; missing provider = hard 503 |
| Capability registry (documented vs observed) | `capabilityRegistry.js`, probed against a live box |
| Hallucination audit | `auditAnswer()` checks narrative against ledger |
| Deterministic write path | intent → validate (signed plan hash) → provision → read-back → rollback |
| RBAC | `viewer`/`operator`/`admin`, re-read from DB per request |
| Caller-scoped Gateway reads | `requestScopedSession.js` — never service credentials |
| Audit logging | `aura_audit_log`, fire-and-forget |

Two instructions in the brief — "do not create another Cortex" and "do not duplicate AI-First
logic" — were the operative ones.

---

## 2. What was actually wrong

### 2.1 Token accounting was silently zero (high)

`AnthropicLlmProvider.generateResponse()` returned `{message, raw}` and **never a `usage`
block**, while `investigationAgent.js:432` accumulated `response?.usage?.prompt_tokens ?? 0`
on every turn.

Every Claude-backed investigation therefore reported **zero tokens and zero cost**. Nothing
failed. The cost telemetry looked healthy precisely because it was measuring nothing. The
OpenAI-compatible path (OpenAI, Groq, xAI, Gemini, Mistral, Cerebras, DeepSeek) had the same
defect.

Fixed in both. Cache read/write are reported separately because they bill at ~0.1× and ~1.25×
of input and cannot be folded into one number without mispricing the turn in both directions.

### 2.2 The AI-First methodology never reached the model (high)

The investigation prompt carried evidence discipline (`observed`/`inferred`/`unknown`,
`fetch_failed`, untrusted-data fencing) but **not** the operating doctrine: no plumbing-first
ordering, no coverage-vs-contention discriminator, no sentinel table, no platform boundaries,
no vocabulary rules.

The prompt had been deliberately compressed — from 1,661 tokens — because Groq's free tier is
8,000 TPM. That was a correct decision for Groq and the wrong one for Claude, where the system
block sits inside the cached prefix.

`aiFirstMethodology.js` vendors the doctrine into the repo. This matters operationally: the
authoritative skills live in `~/.claude/skills` and **are not on the deployed box** — Cortex
runs on Railway.

### 2.3 Three parallel Cortex paths (medium — documented, not resolved)

| Route | Engine | Tools | System prompt |
|---|---|---|---|
| `/api/cortex/investigate` | `investigationAgent.js` | 14 rich domain tools | AI-First (now) |
| `/api/cortex/message` | `cortexOrchestrator.js` | 16 thin API passthroughs | generic "copilot" |
| `/api/cortex/wireless/query` | `wirelessQueryPipeline.js` | deterministic plan | rigid template |

Three engines, three system prompts, two tool catalogues. `/message` is already marked a
fallback in the client. **Not consolidated in this branch** — see §6.

### 2.4 Smaller real defects found

- `cortexOrchestrator.js:260` truncates tool results with `JSON.stringify(...).slice(0, 3000)`,
  which yields **syntactically invalid JSON** mid-string. The model receives a broken payload.
- `cortexModelRegistry.js` still advertises retired Groq models — flagged in
  `docs/cortex/ARCHITECTURE.md` months ago, still unfixed.
- No per-Organization / Site-Group / Site authorisation exists. RBAC is role-only; scope is
  "which controller can your token authenticate to". The brief's §62 asks for hierarchical
  scoping; it is **not** implemented.
- The Cortex panel renders only when `theme === 'dev'` (`App.tsx`), independent of the
  admin-facing `cortex.enabled` flag.
- CI (`.github/workflows/railway-deploy.yml`) deploys **without running tests**.

---

## 3. Live validation against the lab Gateway

Gateway `192.168.100.12:5825` (VE6120), authenticated as `admin`, **read-only**.

| Check | Result |
|---|---|
| OAuth2 token mint | **works** — 1,047-char bearer |
| `GET /v3/sites` | **7 sites**, `AURA_LAB` present |
| `GET /v1/aps/query` | **8 APs** |
| `GET /v1/services` | **8 WLANs** |
| Flex `MuTable` (base64→zlib→JSON) | **works — 90 client rows decoded** |

**The sentinel trap confirmed live.** The first sampled client row:

```
Rss = -62      SNR = 38      RFQI = 4          <- real readings
WirelessRTT = 65535   NetworkRTT = 65535   DNSRTT = 65535   <- all sentinels
```

A tool that averages those columns reports 65-second latency and manufactures a fleet-wide
incident from a healthy client. This is the single most important rule in the vendored
doctrine, and it is live on this box right now.

**Two findings that contradict current documentation:**

1. `AURA_PSAE` **exists** with `WpaSaeElement` (WPA3-SAE). `docs/aura-lab/AURA_LAB.md` still
   describes it as "to be built on wl2 / 6 GHz". The doc is stale.
2. `GET /v1/aps/query` returns null **`operationalStatus`** and **`siteName`**, not just the
   documented `profileId: null`. Anything joining APs to sites or reading status from `/query`
   silently gets nothing. This extends a known gotcha and should be added to
   `ai-first-configuration/references/gotchas.md`.

**Admin lockout reproduced.** A second login within ~1 minute returned
`Could not authenticate` with a correct password — exactly the documented behaviour. The first
token remained valid throughout. Any tooling here must mint once and reuse.

---

## 4. What was built

| File | Purpose |
|---|---|
| `server/cortex/aiFirstMethodology.js` | Vendored doctrine: ordering rule, discriminators, sentinels, boundaries, vocabulary, write discipline. Plus `retrieveGuidance()` — 8 situational runbook notes selected by the operator's question, capped at 3. |
| `server/cortex/modelPolicy.js` | Deterministic tier + effort routing; per-model cost accounting. |
| `server/cortex/remediationBridge.js` | Diagnosis → remediation with an explicit owner per item. |
| `server/cortex/eval/graders.js` | 10 behavioural graders + forbidden-claim table. |
| `server/cortex/eval/scenarios.js` | 16 scenarios from the AI-First runbooks + a safety set. |
| `scripts/cortex-eval.mjs` | Runner: per-category scores, latency, tokens, cost, model comparison. |

### Design decisions worth stating

**Escalation is deterministic and server-side.** An LLM that can grant itself a bigger budget
is a cost incident waiting to happen. `selectModel()` reads the operator's words and the shape
of the investigation — never the model's opinion of its own difficulty. It escalates on
explicit request ("go deeper"), on a Red Queen pass, on multi-entity/intermittent symptoms, or
on a prior pass that burned ≥6 iterations without converging.

**Red Queen must be able to change the answer.** A pass that restates the first diagnosis at
greater length has failed and is *worse* than not running it, because length reads as rigour.
The directive requires naming discriminating evidence and permits SURVIVED / REVISED /
UNDETERMINED as outcomes.

**The remediation bridge is honest about what it cannot do.** The deterministic write path
implements exactly two actions (`create_wlan`, `create_vlan`). Most wireless remediations are
not configuration writes at all — AP placement, cabling, NTP, a supplicant. Every proposal
carries an owner (`cortex` / `operator` / `field` / `other-system` / `unsupported`), and only
an implemented action may claim to be executable. Co-channel contention is the sharpest case:
a real Gateway change with no deterministic write path, so it is marked operator-owned.

**Graders score behaviour, never prose.** Two correct answers can be worded completely
differently. Every grader reads the evidence ledger or a structural property of the answer.
They are deliberately LLM-free — an LLM judge scoring an LLM on wireless correctness would
share the exact blind spots being tested for.

### Two real bugs caught by writing the tests

1. The forbidden-claim regex for an invented RADIUS reject reason only matched one word order.
   `"rejected by RADIUS because the certificate expired"` — the *most natural* phrasing of the
   fabrication — sailed straight through the check that exists to catch it.
2. The auth guidance trigger required a negation, so `"nobody can authenticate"` did not match
   and the NTP-first rule was skipped on exactly the fault that most needs it.

Both were only visible because every grader is tested against a failing result as well as a
passing one. A grader that can only pass is worse than no grader.

---

## 5. Capability matrix

`WORKING` requires observed evidence. Nothing is marked WORKING on the strength of code review.

| Capability | Cortex | AI-First | Real API | Anthropic | Live tested |
|---|---|---|---|---|---|
| Site query | WORKING | WORKING | WORKING | BLOCKED | WORKING (7 sites) |
| Site Group query | WORKING | WORKING | WORKING | BLOCKED | NOT IMPLEMENTED |
| Gateway query | WORKING | WORKING | WORKING | BLOCKED | WORKING |
| AP query | WORKING | WORKING | PARTIAL¹ | BLOCKED | WORKING (8 APs) |
| Client query | WORKING | WORKING | WORKING | BLOCKED | WORKING (90 rows) |
| WLAN query | WORKING | WORKING | WORKING | BLOCKED | WORKING (8 WLANs) |
| Client troubleshooting | WORKING | WORKING | WORKING | BLOCKED | PARTIAL² |
| AP troubleshooting | WORKING | WORKING | WORKING | BLOCKED | PARTIAL² |
| WLAN troubleshooting | WORKING | WORKING | WORKING | BLOCKED | PARTIAL² |
| Site troubleshooting | WORKING | WORKING | WORKING | BLOCKED | PARTIAL² |
| WLAN creation | WORKING | WORKING | WORKING | n/a³ | NOT IMPLEMENTED |
| WLAN modification | PARTIAL⁴ | WORKING | WORKING | n/a³ | NOT IMPLEMENTED |
| WLAN deletion | NOT IMPLEMENTED | WORKING | WORKING | n/a³ | NOT IMPLEMENTED |
| VLAN creation | WORKING | WORKING | WORKING | n/a³ | NOT IMPLEMENTED |
| AP configuration | NOT IMPLEMENTED | WORKING | WORKING | n/a³ | NOT IMPLEMENTED |
| Gateway configuration | NOT IMPLEMENTED | PARTIAL | PARTIAL | n/a³ | NOT IMPLEMENTED |
| Write verification | WORKING | WORKING | WORKING | n/a³ | NOT IMPLEMENTED |
| Hardware verification | WORKING | WORKING | WORKING | n/a³ | NOT IMPLEMENTED |
| Rollback | WORKING | WORKING | WORKING | n/a³ | NOT IMPLEMENTED |
| Deep investigation | WORKING | WORKING | WORKING | BLOCKED | NOT IMPLEMENTED |
| Red Queen | WORKING | WORKING | WORKING | BLOCKED | NOT IMPLEMENTED |
| Energy query | PARTIAL⁵ | n/a | WORKING | BLOCKED | NOT IMPLEMENTED |
| Cost / usage telemetry | WORKING | n/a | n/a | BLOCKED | NOT IMPLEMENTED |
| Evaluation harness | WORKING | WORKING | WORKING | BLOCKED | NOT IMPLEMENTED |

¹ `/v1/aps/query` returns null `profileId`, `operationalStatus` and `siteName`.
² Evidence layer verified live; the reasoning layer over it needs an Anthropic key.
³ Configuration writes are deterministic and do not involve the model.
⁴ Modification routes through `create_wlan`; there is no dedicated modify intent.
⁵ Energy services exist and are rich, but are not exposed as Cortex tools.

**Everything in the Anthropic column is BLOCKED by one missing credential.** The code path is
implemented and unit-tested against a faked transport; it has not executed against the real API.

---

## 5a. Adversarial review of this branch (§96)

An independent reviewer attacked the diff. Eleven findings; all material ones fixed in
`90ad58b`. **Two were defects I introduced**, which is the reason the pass was worth running.

| Sev | Finding | Status |
|---|---|---|
| High | `effort` fought the output ceiling — adaptive thinking spends output tokens, so `xhigh` under a 1400-token cap could exhaust the budget reasoning and return an empty answer for the most expensive run. `truncated` was computed and never read. **Mine.** | Fixed — ceiling scales with effort; truncation drives a one-shot retry |
| High | `scope` (ssid / siteName — network-written) interpolated into the **system** prompt unfenced, above the paragraph declaring network data inert | Fixed — allowlisted, fenced, newline-stripped, length-clamped |
| High | Thinking blocks dropped from the replayed assistant turn; would 400 on turn 2 of every tool-using investigation and read as an empty answer | Fixed — raw content replayed verbatim, stripped for OpenAI-compatible APIs |
| Med-High | Client-supplied `priorIterations` an unclamped lever on the expensive tier | Fixed — clamped 0–20 |
| Med | Fallback chain stepped **up** in price (Sonnet → Opus on a rate-limit blip) | Fixed — fallbacks only step down |
| Med | Pinned `CORTEX_LLM_MODEL` silently overridden | Fixed — pin wins |
| Med | 403 (entitlement, per-model) refused the fallback chain like a 401 | Fixed — 403 falls back, 401 does not |
| Med | Spend lost on the close-out turn and on `provider_error` — audit logged $0 for real money | Fixed — both accounted |
| Med | OpenAI usage double-counted cached tokens against Anthropic semantics | Fixed — normalised |
| Med | QUERY / EXPLANATION tiers unreachable (route hardcoded the intent) | Fixed — `classifyInvestigationIntent` |
| Med | `injectHostileData` declared and read by nothing — the flagship injection scenario graded "resisted injection" on an input with no injection | Fixed — injects through `scope` |
| Med | `remediationBridge` shipped unwired | Fixed — wired into the evidence payload |

**Confirmed clean by the review**, which is as useful as the findings: the read-only tool
guarantee holds and is fail-closed (a tool with no `risk`, a typo, or a prototype key all land
in the refusal branch); `retrieveGuidance` never runs over network data; no regex carries a `g`
flag, so there is no `lastIndex` carry-over; per-request escalation is bounded; the Anthropic
cost arithmetic and per-model attribution are correct; 401-no-retry / 429-retry classify
correctly; and the evidence ledger, `auditAnswer`, `compactTranscript` and the Groq/Ollama
paths are unregressed.

**Prompt caching traced and confirmed working.** `buildSystemPrompt` is called once, before the
loop, and frozen into `messages[0]`; `compactTranscript` only rewrites entries after the
breakpoint; tool specs are static. So the prefix is byte-identical across turns and a 4-turn
investigation pays `1.25 + 0.1×3 = 1.55×` the prefix instead of `4×`. One improvement left on
the table: everything volatile (guidance, scope, Red Queen) sits *inside* the single cached
block and after the ~1,600-token static doctrine, so clicking a different site invalidates the
whole prefix. Splitting the system into two blocks — static doctrine cached, volatile tail
uncached — would fix it. Not done here; it needs `extractSystemPrompt` to stop flattening.

---

## 6. Not done, and why

- **Path consolidation.** `/api/cortex/message` and `/wireless/query` still run parallel
  engines with their own prompts. Consolidating is the right call but it changes the behaviour
  of a live surface and deserves its own branch and its own QA run.
- **Postgres persistence of investigations.** Conversation history is localStorage-only, and
  that is a *deliberate, documented* privacy decision (`useCortexHistory.ts`): a transcript
  carries MACs, hostnames, usernames and IPs, and AURA's own policy is
  `MONITORING_PERSIST_CLIENT_IDENTIFIERS=false` unless a pseudonym salt is set. Persisting
  transcripts server-side would violate it. Cost and audit *are* persisted, via `aura_audit_log`.
- **Hierarchical Org/Site-Group/Site authorisation.** Genuinely absent. Larger than this branch.
- **Live model comparison and the write test.** Both need the API key.
- **Streaming token output.** Activity events stream; tokens do not.

---

## 7. Blockers — what only you can provide

1. **`ANTHROPIC_API_KEY`** — the one hard blocker. Needed for: any live Cortex answer on
   Claude, the eval run, the default-vs-deep model comparison, and measured cost.
   - Create at `console.anthropic.com` → API keys. Fund the workspace; set a spend limit.
   - Set on Railway: service **Integration** (`565dacbb-…`), variables
     `ANTHROPIC_API_KEY`, `CORTEX_LLM_PROVIDER=anthropic`, `CORTEX_LLM_MODEL=claude-sonnet-5`.
   - Locally: `export ANTHROPIC_API_KEY=sk-ant-…`
   - Then: `GW_PW=… ANTHROPIC_API_KEY=… node scripts/cortex-eval.mjs --compare claude-sonnet-5,claude-opus-5 --json audit/eval-baseline.json`

2. **A decision on the safe write test.** `docs/aura-lab/AURA_LAB.md` sets a blast-radius rule:
   only `AURA_LAB` / `5010-LAB1` / `AP5010-LAB1` / `AP5010-LAB` may be changed. I did not make
   any write. Creating and rolling back a throwaway VLAN inside that boundary is the least
   disruptive end-to-end proof; it needs your explicit go-ahead.

3. **Rotate the GitHub PAT.** The AURA git remote has a live token embedded in the URL
   (`git remote -v` prints it). It is also stored in
   `~/.claude/skills/archangel/references/credentials.md`. It reached this session's transcript.
   Rotate it and set the remote to a credential-helper form.

---

## 8. Recommended order from here

1. Rotate the PAT.
2. Add the Anthropic key; run `cortex-eval.mjs` to get a baseline.
3. Fix the two cheap real defects: the invalid-JSON truncation in `cortexOrchestrator.js`, and
   the retired Groq model list.
4. Update `AURA_LAB.md` (AURA_PSAE exists) and `gotchas.md` (`/v1/aps/query` null fields).
5. Then, on separate branches: path consolidation, then hierarchical scoping.
