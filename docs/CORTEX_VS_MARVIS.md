# Cortex vs. the benchmark

A working document for deciding what to build, not a competitive datasheet.

## How to read this

**The Cortex column is measured.** A capability is marked supported only when
there is code in `server/cortex/` and a test that fails if it breaks. Nothing is
marked supported because it is planned, prompted for, or nearly working.

**The benchmark column is not measured.** It records what Juniper Mist/Marvis
*publicly documents*, taken at face value. Extreme has not run Marvis
side-by-side against the same network, so nothing here is a measured comparison
and none of it should be quoted as one. Treating a competitor's documentation as
ground truth would make this table exactly the marketing artifact it is meant to
replace.

**The useful column is the last one.** "What this actually means" is where the
decision lives.

Legend: ✅ supported · ◐ partial, with a stated limit · ❌ absent ·
**?** not assessed.

---

## Where Cortex is genuinely ahead

These are not "we also have it" rows. They are capabilities that follow from
Cortex being one system across assurance *and* configuration, which is an
architectural choice rather than a feature.

| Capability | Cortex | Benchmark | What this actually means |
|---|---|---|---|
| **Expected → Configured → Observed** | ✅ `stateReconciler.js` | **?** — assurance and configuration are separate products | The differentiator. A two-state product compares measurements to thresholds, or intent to API response. Neither catches a Gateway that accepts a write, returns 201, and silently discards the payload. Three columns separate *drift* (config changed) from *not applied* (write dropped) from *correct and still broken* — and the third is what licenses an investigation to stop rewriting configuration and look elsewhere. |
| **Confidence computed from evidence, not narrated** | ✅ `evidenceGraph.js` | **?** — confidence is surfaced, derivation not documented | The level is derived by the runtime from the ledger: how many *independent* sources agree, whether the plumbing preflight ran, whether the discriminating reading was a capability gap, cohort size. The model is told the level and forbidden to raise it. A confident paragraph cannot outrank the calls that produced it. |
| **Independent-source accounting** | ✅ `SOURCE_FAMILY` | **?** | Three tools reading the same telemetry table are one source, not three. Without this rule, corroboration is trivially manufactured and every verdict inflates to HIGH. |
| **Five-rung verification ladder** | ✅ `verificationEngine.js` | ◐ — change verification documented, granularity unclear | REQUEST ACCEPTED / CONFIGURATION DEPLOYED / DEVICE RECEIVED / OPERATIONAL STATE / USER EXPERIENCE, reported as the rung reached. A boolean "success" collapses five outcomes into the most optimistic one. |
| **Unverifiable is a distinct outcome** | ✅ | **?** | The cipher suite and the radio index have no operational read-back on this platform. They report `unverifiable`, never `pass`. This is the single most common way a silently dropped write is announced as a fix. |
| **API gap catalogue** | ✅ `apiGapCatalog.js` + migration `0022` | ❌ not a published capability | Every question the platform could not answer is recorded as a normalised shape with a hit counter. A refusal raises no error, so "what are customers asking that we cannot answer" has no data source unless refusals are deliberately written down. This is product feedback for Ascend / OS ONE that did not previously exist. |
| **Scope stated on every answer** | ✅ `scopeResolver.js` | **?** | Every count says which sites it covers. The failure this closes: an operator on one site asked "do we have unhappy clients?" and received an estate-wide number presented as theirs. The arithmetic was right and the conclusion was wrong. |
| **Refuses a verdict below a cohort of three** | ✅ `MIN_COHORT` | **?** | Two clients with the same symptom is a coincidence. Writing it down as a shared cause is how a coincidence becomes a work order. |
| **Lift-based correlation, not coverage** | ✅ `correlationEngine.js` | **?** | "All affected clients are on SSID Corp" is true, useless, and reads as a finding when Corp is the only SSID. A candidate must be common among the affected *and* rare among the healthy. |
| **Named platform boundaries** | ✅ `PLATFORM_BOUNDARIES` | **?** | Six things the Gateway provably cannot report are carried in the prompt every turn and asserted by tests. "I cannot prove that with the telemetry available" is a supported answer, not a failure. |

---

## Where the benchmark is ahead, and we should say so

| Capability | Cortex | Benchmark | What this actually means |
|---|---|---|---|
| **Proactive detection** | ❌ | ✅ Action Dashboard | The largest genuine gap. Marvis surfaces conditions before anyone asks; Cortex answers when asked. Everything needed is built — findings, blast radius, computed confidence — but nothing sweeps on a schedule or ranks by impact × scope × severity × confidence. Deliberately out of scope this pass; it depends on scope resolution being trustworthy first, which it now is. |
| **Historical depth** | ◐ 30 days, AP/radio/WLAN/site only | ✅ long-horizon, per-client | The Gateway serves a **3-hour** telemetry window and no other duration. AURA's own collector extends that to 30 days for infrastructure metrics, but **per-client history is not collected**. "What happened to this client last Tuesday" is not answerable and saying so is the honest response. |
| **Self-driving remediation breadth** | ◐ two actions | ✅ several documented | Cortex can execute exactly `create_wlan` and `create_vlan`, behind preview and approval. Everything else is described and routed to a human. This is honest rather than impressive, and the honesty is load-bearing — most wireless remediations are physical, or on another system. |
| **Packet capture / spectrum analysis** | ❌ | ✅ | Neither is reachable from Gateway REST. A capture needs an AP-side tool; spectrum classification needs hardware Cortex cannot drive. |
| **RADIUS visibility** | ❌ | ✅ documented | The Gateway exposes **no per-client RADIUS decision at all**. Cortex can say an authentication-stage failure is visible and the reason is unavailable. It cannot say why. This is a platform gap, not a Cortex one — and it is the top entry in the API gap catalogue. |
| **Wired / WAN correlation** | ❌ | ✅ | Cortex sees to the AP and no further. Switch and WAN-edge correlation is outside what this Gateway reports. |
| **Client-side agent telemetry** | ❌ | ✅ | No equivalent. "Can they reach the internet?" needs a real client on the SSID; saying so IS the answer. |

---

## Where both are comparable

| Capability | Cortex | Benchmark | Note |
|---|---|---|---|
| Natural-language troubleshooting | ✅ | ✅ | Same shape of interaction |
| Client troubleshooting | ✅ | ✅ | Cortex adds the enforced plumbing-first ordering |
| RF analysis, coverage vs interference | ✅ | ✅ | Cortex requires the signal + RFQI **pair**; the two causes have opposite fixes |
| Roaming analysis | ◐ | ✅ | Roams and FT state visible; **duration is not**, on this platform |
| Site and fleet correlation | ✅ | ✅ | — |
| "What changed?" | ◐ | ✅ | Limited by the 3-hour window; Cortex states which half it compared |
| Natural-language configuration | ✅ | ◐ | Cortex parses intent deterministically and gates on a signed plan hash |
| Explainability / raw evidence | ✅ | ◐ | Every claim traces to an append-only ledger the model cannot write |
| Feedback / learning | ◐ | ✅ | Thumbs up/down captured; no learning loop consumes it yet |

---

## What must be built for Cortex to legitimately outperform the benchmark

Ranked by value per unit of work, from what this pass established.

1. **Proactive findings surface.** The only large capability gap. All inputs
   exist; what is missing is a scheduled sweep, a suppression/dedup rule, and
   ranking by impact × scope × severity × confidence. Without suppression it
   becomes alarm spam, which is worse than silence.
2. **Per-client history collection.** Extend AURA's collector to sample
   per-client rows. This alone converts six ◐ rows to ✅ and makes
   "what happened yesterday at 14:15" answerable. Note the privacy design
   already in place: client history is pseudonymised.
3. **Rung 5 on every remediation.** The ladder supports user-experience
   verification; the create-WLAN flow does not supply a before/after cohort.
   Capturing impact before the write and re-measuring after closes the loop
   that the whole architecture is built around.
4. **Broader write actions.** `change_psk`, `enable/disable WLAN`,
   `rebind radios`, `move APs between profiles`. Each must arrive with its
   read-back and its ladder, or it makes the product less trustworthy, not more.
5. **RADIUS path validation.** A Gateway-CLI `radtest` runner with a test
   account — the only *active* authentication test the platform has. Converts
   the largest ❌ in the matrix into a ◐.
6. **Learning loop.** Thumbs-down is captured and consumed by nothing. Feeding
   it into scenario selection would make the eval suite reflect real failures
   rather than anticipated ones.

---

## The honest summary

Cortex is **not** further ahead than Marvis across the board, and this document
should not be used to claim that.

Where it is genuinely ahead is narrow and real: it joins configuration and
assurance into one evidence model, so it can tell *the configuration is wrong*
from *the configuration never landed* from *the configuration is fine and you
are looking in the wrong place* — and it computes confidence from what was
actually retrieved rather than from how the answer reads. Those are not
features that can be added to an assurance product later; they follow from
having both halves in one system.

Where it is behind is also narrow and real: it is reactive, its history is
shallow, and it can execute two configuration actions. The first is the one
that will be noticed in a demo.
