# Cortex as an AI-first wireless engineer — engineering report

**Date:** 2026-09-15
**Branch:** `plm-dev-mode`
**Baseline:** 4,528 tests passing → **4,750 passing, 0 failing** (+222)
**Not deployed.** All work is local and committed; nothing has been pushed to
Integration or Production.

---

## What was built

Six new modules, three new diagnostic tools, one migration, one route, two UI
components, and the wiring that makes them take effect. In priority order —
correctness, evidence, correlation, root cause, API accuracy, history,
configuration awareness, remediation, verification, UX.

| Module | Purpose | Tests |
|---|---|---|
| `scopeResolver.js` | Seven deterministic rules deciding what a question is about, before a token is spent | 37 |
| `evidenceGraph.js` | Epistemic tiers + confidence computed from the ledger, not narrated by the model | 27 |
| `correlationEngine.js` | Blast-radius expansion and counterfactual comparison | 15 |
| `stateReconciler.js` | Expected → Configured → Observed | 24 |
| `verificationEngine.js` | The five-rung proof ladder | 17 |
| `apiGapCatalog.js` | Records what the platform could not answer | 15 |
| `diagnosticTools.scope.test.js` | The scope-binding bug fix, proven | 18 |
| `investigationAgent.evidence.test.js` | Graph wiring inside the loop | 14 |
| `wlanProvisioningEngine.ladder.test.js` | The ladder on the real write path | 7 |
| `graders.scope.test.js` | Five new behavioural graders | 23 |
| `CortexScopeBar.test.tsx` | Scope bar + clarification chips | 11 |

New tools: `listSites`, `correlateProblem`, `reconcileConfiguration`.
New route: `GET /api/cortex/api-gaps`. New migration: `0022_cortex_api_gaps.sql`.

---

## Architecture

```
question
   │
   ├─► scopeResolver ──► needs clarification? ──► SSE `clarify` ──► STOP
   │      (deterministic, server-side, zero tokens)     (chips; no model turn)
   │
   ├─► createDiagnosticTools({ scope: { siteNames } })
   │      every site-filterable handler bound; empty filter ⇒ scope_matched_nothing
   │
   ├─► runInvestigation
   │      ├─ tool result ──► digestToolResult ──► ledger[].digest
   │      ├─ buildEvidenceGraph(ledger) ──► computed confidence
   │      └─ appended to the LAST tool result (cached prefix preserved)
   │
   ├─► answer (two-register: plain outcome + blast radius, then evidence)
   │
   └─► SSE `evidence` { assessment, scope, remediation, audit }
          └─► recordGapsFromInvestigation  (best-effort, never fails the answer)
```

Writes keep their existing deterministic path and now additionally report the
five-rung ladder.

---

## Defects found and fixed

### 1. Site scope reached no tool at all

`createDiagnosticTools({ session, scope, capabilities })` accepted `scope` and
used it in exactly two places — client resolution and the history source lookup.
**`scope.siteName` reached no tool.** It appeared only as an advisory line in the
system prompt labelled *"UI SCOPE (inherited, operator can change)"*, with no
rule for when to honour it.

Consequence: an operator on one site asking *"do we have unhappy clients?"* got
`getSiteOverview()` unfiltered and an **estate-wide count presented as theirs**.
This is visible in the screenshot that started this work.

**Fixed:** `scope.siteNames` is now bound into every site-filterable handler, and
each result echoes `scopeApplied`.

### 2. A site filter that matched nothing read as good news

```js
const scoped = siteName ? unique.filter((r) => r.SiteName === siteName) : unique;
```

Exact string equality. `src/App.tsx:521` fills the UI's site name from
`displayName || name || siteName`, so a display label was compared against a
telemetry value and matched **zero rows** — which flowed onward as
`clientsWithFindings: 0` and was reported, in good faith, as *"no problems at
that site"*.

The doctrine already says an empty poll table means UNCONFIGURED rather than
healthy. Nothing applied that to an empty **filter**.

**Fixed:** matching is normalised (case and punctuation folded), and an empty
result from a non-empty source returns `status: 'scope_matched_nothing'` with
the available site list and an explicit instruction not to report health. It is
also counted as a **failed** ledger entry, so it cannot contribute to confidence.

### 3. Sites were derived from client telemetry

`sitesInTelemetry` was built from client rows, so a site with no clients did not
exist as far as Cortex was concerned — and a site with no clients is either idle
or entirely broken.

**Fixed:** `listSites` reads `/v3/sites` (verified live to exist) and joins it to
telemetry. A site with `hasTelemetry: false` carries `basis: 'unknown'`, never
"healthy".

### 4. The verification ladder claimed non-contiguous depth

Found by a test during this pass. Rung 4 reads the reconciliation and can pass on
its own terms while rung 3 was never run, so `reachedStage` reported *"proven as
far as operational state"* when no AP had been asked.

**Fixed:** `provenDepth` counts **contiguous** passes from rung 1. The individual
stage results stay accurate; the claimed depth cannot skip a gap.

### 5. The eval harness would have graded the new behaviour as inert

`scripts/cortex-eval.mjs` built tools without resolved scope and passed neither
`scope` nor `assessment` to the graders — so every new scope and confidence
grader would have passed on **absence** rather than on behaviour, which is the
precise failure mode that harness exists to prevent.

**Fixed:** the runner now resolves and binds scope exactly as the route does, and
passes both fields through.

---

## Real infrastructure testing

**What was verified live** (lab Gateway 192.168.100.12):

| Check | Result |
|---|---|
| Reachability, `.12` and `.13` | Both reachable |
| HTTPS service port | 5825 and 8443 answer; 443 does not |
| `/management/v3/sites` | **HTTP 401** — the route exists |
| `/management/v1/services` | HTTP 401 |
| `/management/v1/topologies` | HTTP 401 |
| `/management/v1/aps/query` | HTTP 401 |
| `/management/v3/profiles` | HTTP 401 |
| `/management/v1/report/flex/MuTable` | HTTP 401 |

401 rather than 404 confirms every route the new tools depend on genuinely
exists on the live appliance. This closes the one uncertainty flagged at design
time: `listSites` is built on a real endpoint, not an assumed one.

**What was NOT verified live, and why.** No authenticated run was performed. The
lab login window is effectively **one attempt**, and this session held two
conflicting candidate passwords for `.12`. Guessing risked locking the box for an
hour for no analytical gain. The following therefore remain unproven against
real data:

- the `/v3/sites` response **shape** (field names are handled defensively);
- an end-to-end LLM evaluation run;
- the API gap catalogue's database path (no `TEST_DATABASE_URL`).

---

## Test results

```
Test Files  386 passed | 6 skipped (392)
     Tests  4750 passed | 106 skipped (4856)
```

Skips are the database-integration suites, which require `TEST_DATABASE_URL`.

Type-check (`tsc --noEmit`): clean.
Every changed server module passes `node --check`.

**Failed tests: none.**

Two tests failed during development and both found real defects rather than
needing their expectations relaxed — the site-phrase extractor swallowing a whole
clause, and the non-contiguous ladder depth. Both were fixed in the code.

---

## API gaps discovered

Recorded in the catalogue's vocabulary; each was probed, not assumed.

| Capability | Kind | Why it matters |
|---|---|---|
| `client.radius_reject_reason` | capability | No per-client RADIUS decision exists. Blocks the entire authentication-diagnosis class beyond "a stage failed". |
| `client.roam_duration` | telemetry | Roams are visible; how long they took is not. Blocks "did the roam fail". |
| `ap.reboot_reason` | field | REST gives that it happened and on what firmware. The reason is in the tech-support archive. |
| `dhcp.pool_utilisation` | telemetry | Pool config visible, live lease counts not. "Are leases exhausted" is unanswerable. |
| `client.history` (Gateway) | retention | 3-hour window, no other duration served. |
| `wlan.cipher_readback` | field | No operational read-back, so a security change cannot be proven to have landed. |
| `wlan.radio_index_readback` | field | An index-0 binding is accepted and silently dropped, and cannot be read back. |
| `path.beyond_ap` | endpoint | The Gateway sees to the AP and no further. |

---

## What Cortex can now do that a basic AI wireless assistant cannot

1. **Tell three different configuration faults apart.** Expected ≠ Configured is
   drift. Configured ≠ Observed is a write silently dropped. All three agreeing
   while users suffer means stop rewriting configuration. A two-state product
   cannot express the middle case, which is this Gateway's dominant failure mode.
2. **Attach a confidence it did not write.** Computed from independent-source
   count, whether the plumbing preflight ran, whether the discriminating reading
   was a capability gap, and cohort size — then capped, never averaged.
3. **Refuse to manufacture corroboration.** Three tools reading the same
   telemetry table count as one source.
4. **Report an unverifiable attribute as unverifiable.** Never as a pass. This is
   the single most common way a silently dropped write is announced as a fix.
5. **Say which sites an answer covered**, on every answer, with one-click
   re-scoping.
6. **Refuse a verdict below a cohort of three.**
7. **Discard a correlation that merely reflects the base rate** — lift, not
   coverage.
8. **Record what it could not answer**, as normalised shapes with hit counts and
   no client identifiers.
9. **Ask exactly one question, and only when a guess would mislead** — before any
   model call, so it costs nothing.
10. **Report a change as the rung it reached**, not as a boolean.

---

## Remaining work

| # | Item | Why it matters | Size |
|---|---|---|---|
| 1 | **Live authenticated validation** | Everything above is proven against recorded shapes. Needs one confirmed credential. | S |
| 2 | **Proactive findings surface** | The one large capability gap vs the benchmark. All inputs exist; needs a sweep, suppression, and impact ranking. | L |
| 3 | **Rung 5 on remediation** | Capture impact before a write, re-measure after. Closes the loop the architecture is built around. | M |
| 4 | **Per-client history collection** | Converts six ◐ rows to ✅ and makes "yesterday at 14:15" answerable. | M |
| 5 | **Broader write actions** | `change_psk`, enable/disable, rebind radios — each with its own read-back and ladder. | L |
| 6 | **Retire the duplicate `/api/cortex/` path** | `cortexOrchestrator.js` carries a competing system prompt that *mandates* markdown tables, and will drift from everything above. | M |
| 7 | **Gap catalogue DB path** | Migration written, only the memory fallback is tested. | S |
| 8 | **RADIUS path validation** | A CLI `radtest` runner converts the largest ❌ to a ◐. | M |
| 9 | **Learning loop** | Thumbs-down is captured and consumed by nothing. | M |
| 10 | **`/v3/sites` shape confirmation** | Route existence proven; field names inferred. | S |

---

## Top 10 next improvements

1. Confirm one lab credential and run `scripts/cortex-eval.mjs` end to end.
2. Build the proactive surface, suppression rule first.
3. Wire impact-before / impact-after into the remediation ladder.
4. Extend the collector to per-client history (pseudonymised, as designed).
5. Delete the duplicate orchestrator path.
6. Add `change_psk` with full read-back and ladder.
7. Confirm the `/v3/sites` body shape and tighten `listSites`.
8. Run the gap-catalogue tests against a disposable Postgres.
9. Feed thumbs-down into scenario selection.
10. Add a Gateway-CLI `radtest` runner for active authentication testing.

---

## Files changed

**New (13 source + 13 test/doc):** `scopeResolver`, `evidenceGraph`,
`correlationEngine`, `stateReconciler`, `verificationEngine`, `apiGapCatalog`,
`0022_cortex_api_gaps.sql`, `CortexScopeBar.tsx`, `CortexClarifyPrompt.tsx`,
plus their tests and `docs/CORTEX_{CAPABILITY_MATRIX,VS_MARVIS,DEMOS}.md`.

**Modified:** `server.js` (scope resolution, clarify event, gap recording,
assessment in the evidence event, gap report route), `diagnosticTools.js` (scope
binding, zero-match guard, three new tools), `investigationAgent.js` (digest,
computed confidence, answer shape, scope block), `gatewayEvidence.js`
(`sites()`), `wlanProvisioningEngine.js` (ladder), `eval/graders.js` and
`eval/scenarios.js`, `scripts/cortex-eval.mjs`, and five frontend files.

**No existing functionality was removed or replaced.** Every change is additive;
`status`, `ledger`, `audit` and `remediation` keep their existing shapes.
