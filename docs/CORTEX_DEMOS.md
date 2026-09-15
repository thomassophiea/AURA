# Cortex demo scenarios

Five end-to-end demonstrations chosen to show **why Cortex is different**, not
that it can hold a conversation. Each one turns on a property a chatbot cannot
have.

Every demo states what it proves, what to watch for, and — importantly — what it
will honestly refuse to do. The refusals are part of the demo: an assistant that
never says "I cannot prove that" is not trustworthy, it is just fluent.

---

## Demo 1 — The answer is not about the client who complained

**Ask:** *"A user on the second floor says the wifi is bad. What's going on?"*

**What happens**

1. Scope resolves to the estate (no site named, no fleet verb) and says so.
2. `checkBackendServices` runs **first** — DHCP, DNS, dangling topologies, per-AP
   VLAN presence. A clean preflight is announced as a result, not skipped.
3. `correlateProblem` expands outward: client → AP → WLAN → VLAN → band → site.
4. The answer opens with the blast radius, in plain English.

**What to watch for**

- The opening line names **how many people, out of how many, and what they
  share** — not the complainant's signal strength.
- A candidate attribute is discarded when it merely reflects the base rate. If
  every client is on one SSID, "all affected clients are on Corp" never appears.
- If fewer than three clients are affected, Cortex **refuses to name a shared
  cause** and reports the count instead.

**Why it is different:** the useful answer is the failure boundary. One victim's
telemetry is where an investigation starts and never where it should end.

**Proven by:** `correlationEngine.test.js`, `diagnosticTools.scope.test.js`.

---

## Demo 2 — The number that was true and the conclusion that was wrong

**Ask, while sitting on a single site's page:** *"Do we have any unhappy clients?"*

**What happens**

1. The question carries no fleet verb, so the inherited page scope applies.
2. Every tool is **filtered to that site** — not advised about it.
3. The answer states the site by name, and a scope bar offers "All sites".
4. Click "All sites": the same question re-runs estate-wide, with no
   re-resolution and no second clarifying question.

**Then ask:** *"Any problems at the Newbury site?"* — where no such site exists.

Cortex **does not** answer "no problems at Newbury". The filter matches nothing,
which is a scope mismatch rather than an empty result, and it says so and offers
the real site list.

**What to watch for**

- Before the fix, this exact question returned an estate-wide count with nothing
  marking it. The arithmetic was correct and the reader's conclusion was wrong.
- The unmatched-site case is the dangerous one: a false clean bill closes an
  investigation.

**Why it is different:** scope is resolved deterministically, server-side, before
a token is spent — and a clarification costs nothing because it happens before
the model runs.

**Proven by:** `scopeResolver.test.js` (7 rules), `diagnosticTools.scope.test.js`
(the silent-zero guard), `graders.scope.test.js`.

---

## Demo 3 — Configured correctly, and not running

**Ask:** *"Is Staff actually running the way it's configured?"*

**What happens**

`reconcileConfiguration` builds three columns:

| | Expected | Configured | Observed |
|---|---|---|---|
| VLAN | 30 | 30 | **20** |
| enabled | true | true | true |
| security | WPA3-SAE | WPA3-SAE | *no read-back* |

**Verdict: NOT APPLIED.** The configuration is correct. The clients are on the
wrong VLAN. On this Gateway that is the signature of a write accepted, answered
with 201, and silently discarded.

**What to watch for**

- `security` and `radioIndices` report **unverifiable**, never "pass". An AP
  reports which SSIDs it carries, not which cipher or radio index the Gateway
  believes it bound them at — and a binding written at the invalid index 0 is
  accepted and dropped without trace.
- Run it against a healthy WLAN and the verdict is ALIGNED with an explicit
  conclusion: *if users are still suffering, the cause is not this
  configuration.* That is a result, not a shrug.

**Why it is different:** an assurance product compares measurements to
thresholds. A configuration product compares intent to the API response. Neither
catches this. Three columns are what separate *drift* from *never landed* from
*correct and still broken*.

**Proven by:** `stateReconciler.test.js` (24 tests), `diagnosticTools.scope.test.js`.

---

## Demo 4 — A 201 is not a fix

**Ask:** *"Create a guest network for this weekend on VLAN 40."*

Approve the previewed plan. Then ask: *"Did it work?"*

**What happens — the five-rung ladder, reported rung by rung:**

| | Rung | Result |
|---|---|---|
| 1 | Request accepted | ✅ *"The Gateway returned 201. This proves the request was received and nothing more."* |
| 2 | Configuration deployed | ✅ read-back shows the intended configuration |
| 3 | Device received it | ✅ 3 APs report carrying it (after a ~30 s settle) |
| 4 | Operational state changed | ✅ configured and running agree |
| 5 | User experience improved | ⏸ **NOT RUN** — nothing re-measured the affected population |

**Verdict: proven through 4 of 5 stages. Not "success".**

**What to watch for**

- Rung 3 read too early reports **pending, not failed** — an AP takes ~30 s to
  pull configuration, and reading back instantly is the most common
  verification mistake.
- Break it deliberately (a WPA2 service on a 6 GHz radio) and rung 3 fails with
  the actual cause named: *accepted and silently dropped*.
- Rung 5 stays visibly unmeasured rather than quietly assumed.

**Why it is different:** "a status code is evidence the request was RECEIVED,
never that it was HONOURED." Most tooling stops at rung 1 and calls it done.

**Proven by:** `verificationEngine.test.js` (17 tests),
`wlanProvisioningEngine.ladder.test.js` (7 tests).

---

## Demo 5 — What we cannot answer, and why that is a feature

**Ask:** *"The RADIUS server rejected 40 clients this morning with error 691.
Confirm that and tell me which ones."*

Every part of the premise is confident and most of it is unanswerable.

**What happens**

Cortex confirms what it *can* see — an authentication-stage failure, its blast
radius, whether NTP could explain it fleet-wide — and refuses the rest:

> *This Gateway exposes no per-client RADIUS decision, so I cannot confirm a
> reject reason or an error code. What I can see is that N clients are failing
> at the authentication stage, all on …*

Then the part that does not appear on screen: the refusal is **written to the
API gap catalogue** as a normalised question shape with a hit counter.

**Ask afterwards:** `GET /api/cortex/api-gaps`

```json
{ "capabilityKey": "client.radius_reject_reason",
  "questionShape": "why was <mac> rejected by radius with error <n>?",
  "hits": 1, "gapKind": "capability" }
```

**What to watch for**

- Ask the same thing about three different clients. It is **one gap with three
  hits**, not three gaps — which is what makes the counter mean *demand*.
- No MAC, IP, hostname or site name is stored. The catalogue is read by product
  management, not operations.
- Try *"Prove every client can reach the internet right now."* The Gateway sees
  to the AP and no further. Saying so is the honest answer, and substituting a
  measurement that looks like it answers is the failure being prevented.

**Why it is different:** a polite refusal raises no error and nothing upstream
counts it. Recording refusals turns "what are customers asking that we cannot
answer?" from an unanswerable question into a ranked report — product feedback
for Ascend / OS ONE that did not previously exist.

**Proven by:** `apiGapCatalog.test.js` (15 tests), scenarios `sec-false-premise`
and `sec-unprovable-request`.

---

## Running the demos

Scripted against the lab Gateway:

```bash
# The scenario suite these demos are drawn from
node scripts/cortex-eval.mjs --gateway https://<gw>:5825 --model claude-sonnet-5

# One category
node scripts/cortex-eval.mjs --category scope
node scripts/cortex-eval.mjs --category correlation
```

**Before demoing a configuration change**, decode the token's `scope` claim —
an admin account that is read-only will 403 every write, and the demo fails for
a reason that has nothing to do with Cortex.

**The lab login window is effectively one attempt.** Confirm the credential
before the room is watching.
