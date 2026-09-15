# Cortex Capability Matrix

What Aura Cortex can answer on an Extreme Networks Gateway (OS ONE / Platform ONE),
what evidence it uses, and where the platform stops.

**Scope of this document.** Every "yes" below corresponds to code in
`server/cortex/` with tests in the same directory. Every "no" is a boundary that
was probed rather than assumed — either against the live lab Gateway
(VE6120, 10.20.1.0-020R) or against the capability registry built from it.

**Status as of 2026-09-15.** Unit and integration tests: 4,750 passing.
A live end-to-end evaluation run against the lab Gateway has **not** been
executed in this pass (see *Known limitations*), so rows marked ✅ are proven by
test against recorded Gateway shapes, not by a fresh live run.

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Implemented and covered by tests |
| ◐ | Partially supported — works within a stated limit |
| ❌ | Not supported; the platform cannot supply the evidence |
| — | Not applicable to this question |

Columns: **Hist** = can answer about the past · **Corr** = correlates across
objects · **Diag** = reaches a root cause · **Rec** = recommends a fix ·
**Rem** = Cortex can execute the fix · **Ver** = can prove the fix worked ·
**Conf** = a computed confidence level is attached.

---

## Client experience

| Question | Sup | Evidence required | Source | Hist | Corr | Diag | Rec | Rem | Ver | Conf | Known gap |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Why is this client unhappy? | ✅ | Association, auth stage, addressing, RF pair | `flex(MuTable)`, `/v1/services`, `/v1/topologies` | ◐ | ✅ | ✅ | ✅ | ◐ | ◐ | ✅ | Telemetry window is 3 h |
| Why can't this client connect? | ✅ | Connection lifecycle ladder | `flex(MuTable)` + `muEvent` | ◐ | ✅ | ✅ | ✅ | ◐ | ◐ | ✅ | No RADIUS reject reason |
| Why is this client slow? | ✅ | Latency split: Wireless / Network / DNS RTT | `flex(MuTable)` | ◐ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | 65535 = not measured |
| Why does this client keep disconnecting? | ◐ | Roam events, RF series, uptime | `muEvent`, `flex(MuTable)` | ◐ | ✅ | ◐ | ✅ | ❌ | ❌ | ✅ | No deauth reason code |
| Why is this client roaming poorly? | ◐ | Roam pairs, Fast Transition state | `muEvent` | ◐ | ✅ | ◐ | ✅ | ❌ | ❌ | ✅ | **Roam duration not exposed** |
| What happened to this client at 14:15 yesterday? | ◐ | Stored history + audit log | AURA Postgres (30 d), `/v1/auditlogs` | ◐ | ◐ | ◐ | ◐ | — | — | ✅ | Gateway serves 3 h only; per-client history is pseudonymised |
| Did the problem follow the client or the AP? | ✅ | Same client on other APs; peers on this AP | `flex(MuTable)` | ◐ | ✅ | ✅ | ✅ | — | — | ✅ | Needs ≥3 peers for a verdict |
| Is this one client or a broader problem? | ✅ | Blast-radius expansion across 11 dimensions | `correlateProblem` | ◐ | ✅ | ✅ | ✅ | — | — | ✅ | Cohort floor of 3 enforced |

## Authentication

| Question | Sup | Evidence required | Source | Hist | Corr | Diag | Rec | Rem | Ver | Conf | Known gap |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Why is authentication failing? | ◐ | Lifecycle stage + NTP + cert window | `flex(MuTable)`, `checkBackendServices` | ◐ | ✅ | ◐ | ✅ | ❌ | ❌ | ✅ | **No per-client RADIUS decision** |
| Is RADIUS responding? | ❌ | Server-side reachability / response time | — | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | — | No RADIUS health endpoint; needs CLI `radtest` |
| Are credentials being rejected? | ❌ | Reject reason per client | — | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | — | **Provably absent.** Reason lives in RADIUS logs |
| Is it WLAN, RADIUS, certificate, policy or client? | ◐ | Stage localisation + cohort shape | lifecycle + `correlateProblem` | ◐ | ✅ | ◐ | ✅ | ❌ | ❌ | ✅ | Can narrow to a stage, not to a reason |
| Which clients have authentication failures? | ✅ | Failing lifecycle stage across population | `flex(MuTable)` | ◐ | ✅ | ✅ | ✅ | — | — | ✅ | — |

## DHCP and addressing

| Question | Sup | Evidence required | Source | Hist | Corr | Diag | Rec | Rem | Ver | Conf | Known gap |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Why isn't this client getting an address? | ✅ | Associated + usable radio + no IPv4 | `checkBackendServices` | ◐ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | — |
| Is DHCP responding? | ◐ | Share of associated clients without IPv4 | `flex(MuTable)` | ◐ | ✅ | ◐ | ✅ | ❌ | ❌ | ✅ | Inferred from clients, not from the server |
| Are leases exhausted? | ❌ | Live lease counts | — | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | — | **Pool config visible, live leases are not** |
| Is the failure isolated to a VLAN / site / WLAN? | ✅ | Blast radius by VLAN, site, WLAN | `correlateProblem` | ◐ | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Did DHCP latency increase? | ❌ | DHCP transaction timing | — | ❌ | ❌ | ❌ | — | — | — | — | Not collected on this platform |

## DNS

| Question | Sup | Evidence required | Source | Hist | Corr | Diag | Rec | Rem | Ver | Conf | Known gap |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Are clients having DNS problems? | ✅ | DNSRTT distribution over measured clients | `flex(MuTable)` | ◐ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | 65535 = not measured, excluded |
| Is DNS slow or unavailable? | ◐ | p50 / p90 DNSRTT | `flex(MuTable)` | ◐ | ✅ | ◐ | ✅ | ❌ | ❌ | ✅ | Zero measured clients ≠ fast DNS |
| Is it DNS or general reachability? | ◐ | Latency split | `flex(MuTable)` | ◐ | ✅ | ◐ | ✅ | ❌ | ❌ | ✅ | **Gateway sees to the AP and no further** |

## RF

| Question | Sup | Evidence required | Source | Hist | Corr | Diag | Rec | Rem | Ver | Conf | Known gap |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Which APs have poor RF conditions? | ✅ | Per-radio scoring | `flex(ApTable)` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | — |
| Where is interference high? | ✅ | Airtime split incl. non-Wi-Fi energy | `flex(ApTable)` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | Energy is reported; **the emitter is not identified** |
| Which clients have poor RSSI or SNR? | ✅ | Signal + RFQI pair | `flex(MuTable)` | ◐ | ✅ | ✅ | ✅ | — | — | ✅ | Idle rows carry placeholder values |
| Is airtime utilization excessive? | ✅ | Busy-time split | `flex(ApTable)` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | `ChannelUtilizationAdjusted` is the co-channel component only |
| Coverage, interference, congestion or capacity? | ✅ | **Signal + RFQI pair** — opposite fixes | `flex(MuTable)` + `flex(ApTable)` | ◐ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | — |
| Is the client simply too far from the AP? | ✅ | Weak signal + low RFQI | `flex(MuTable)` | ◐ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | — |
| Spectrum scan / classify the emitter | ❌ | Spectrum capture | — | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | — | Needs a capture; not in REST |

## Roaming

| Question | Sup | Evidence required | Source | Hist | Corr | Diag | Rec | Rem | Ver | Conf | Known gap |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Why did this client roam? | ◐ | Roam events with radio pair | `muEvent` | ◐ | ✅ | ◐ | ✅ | ❌ | ❌ | ✅ | Trigger is not recorded |
| Why didn't it roam / is it sticky? | ◐ | Held AP vs stronger candidate | `flex(MuTable)` + `flex(ApTable)` | ◐ | ✅ | ◐ | ✅ | ❌ | ❌ | ✅ | Candidate named, cause not asserted |
| Did the roam fail? | ◐ | Roam events, FT state | `muEvent` | ◐ | ✅ | ◐ | ✅ | ❌ | ❌ | ✅ | **Roam duration and per-phase timing absent** |
| Was the target AP actually better? | ✅ | Signal at both radios | `flex(MuTable)` + `flex(ApTable)` | ◐ | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Are roaming problems site-wide? | ✅ | Roam findings across the population | `correlateProblem` | ◐ | ✅ | ✅ | ✅ | — | — | ✅ | — |

## WLAN

| Question | Sup | Evidence required | Source | Hist | Corr | Diag | Rec | Rem | Ver | Conf | Known gap |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Why is this WLAN performing badly? | ✅ | WLAN-scoped findings + config | `getWlanConfig` + `correlateProblem` | ◐ | ✅ | ✅ | ✅ | ◐ | ◐ | ✅ | — |
| Which WLAN produces the worst experience? | ✅ | Findings grouped by SSID | `correlateProblem` | ◐ | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Is this WLAN configured differently at affected sites? | ✅ | **Expected → Configured → Observed** | `reconcileConfiguration` | ◐ | ✅ | ✅ | ✅ | ◐ | ◐ | ✅ | Cipher + radio index have no read-back |
| Is it actually running the way it is configured? | ✅ | Config vs AP `services[]` vs client VLAN | `reconcileConfiguration` | — | ✅ | ✅ | ✅ | ◐ | ✅ | ✅ | — |
| Why is the SSID not broadcasting? | ✅ | Four-layer ladder, stop at first failure | `getWlanConfig`, `getApHealth` | — | ✅ | ✅ | ✅ | ◐ | ✅ | ✅ | Index-0 binding is **silently dropped and unreadable** |
| What changed? | ◐ | Audit log + uptime + stored history | `/v1/auditlogs`, AURA Postgres | ◐ | ✅ | ◐ | ✅ | — | — | ✅ | Client telemetry does not reach back |

## AP

| Question | Sup | Evidence required | Source | Hist | Corr | Diag | Rec | Rem | Ver | Conf | Known gap |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Why is this AP unhealthy? | ✅ | Status + radio admin state + tunnel | `/v1/aps/query`, `/v1/state/aps/{s}` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | An AP reports InService with radios off air |
| Are clients on this AP unhappy? | ✅ | Client findings scoped to the AP | `correlateProblem` | ◐ | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Is the AP the problem or something upstream? | ✅ | Per-AP VLAN presence, tunnel MTU | `checkBackendServices` | ◐ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | — |
| Is this isolated or systemic? | ✅ | Clustering by model, firmware, site, switch | `correlateProblem` | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Why did this AP reboot? | ❌ | Reboot reason code | — | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | — | **REST gives that it happened, not why.** Reason is in the tech-support archive |
| Is this a bad cable / PoE problem? | ◐ | Negotiated speed, power state | `/v1/state/aps/{s}` | ◐ | ✅ | ◐ | ✅ | ❌ | ❌ | ✅ | — |

## Site and fleet

| Question | Sup | Evidence required | Source | Hist | Corr | Diag | Rec | Rem | Ver | Conf | Known gap |
|---|---|---|---|---|---|---|---|---|---|---|---|
| What's wrong with this site? | ✅ | Site-scoped findings, attributed | `getSiteOverview` (scope-bound) | ◐ | ✅ | ✅ | ✅ | ◐ | ◐ | ✅ | — |
| Which site has the worst experience? | ✅ | Ranked across the catalogue | `listSites` + `getSiteOverview` | ◐ | ✅ | ✅ | ✅ | — | — | ✅ | — |
| What are the top three problems? | ✅ | Findings ranked by severity × scope | `getSiteOverview` | ◐ | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Which sites exist at all? | ✅ | Configured list joined to telemetry | `/v3/sites` | — | — | — | — | — | — | — | A site with no telemetry reads as **unknown, never healthy** |
| Which problems affect the most users? | ✅ | Measured blast radius per finding | `correlateProblem` | ◐ | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Are several sites hitting the same cause? | ✅ | Shared attributes across sites | `correlateProblem` | ◐ | ✅ | ✅ | ✅ | — | — | ✅ | — |
| What changed overnight? | ◐ | Audit log + stored history | `/v1/auditlogs`, AURA Postgres | ◐ | ✅ | ◐ | ✅ | — | — | ✅ | 3 h Gateway window; audit log needs epoch-ms bounds |
| What should I worry about today? | ✅ | Ranked by impact × scope × severity | `getSiteOverview`, `correlateProblem` | ◐ | ✅ | ✅ | ✅ | — | — | ✅ | **Reactive only** — no proactive sweep (out of scope this pass) |

## Configuration (write side)

| Question | Sup | Evidence required | Source | Hist | Corr | Diag | Rec | Rem | Ver | Conf | Known gap |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Create a WLAN / guest network | ✅ | Intent → validate → approve → write → verify | `wlanProvisioningEngine` | — | — | — | ✅ | ✅ | ✅ | — | Verified to rung 4 of 5 |
| Create a VLAN / topology | ✅ | Same deterministic path | `topologyProvisioningEngine` | — | — | — | ✅ | ✅ | ✅ | — | — |
| Change a PSK, rename, hide an SSID | ❌ | — | — | — | — | — | ✅ | ❌ | ❌ | — | **No write path implemented.** Understood and described, never executed |
| Set DTIM / other radio parameters | ❌ | — | — | — | — | — | ✅ | ❌ | ❌ | — | API exposes no write |
| Make this site match the working site | ◐ | Peer as expectation, three-way diff | `reconcileConfiguration` | — | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | Diffs and proposes; **does not apply** |
| Undo the change I just made | ◐ | — | `topologyProvisioningEngine` rollback | — | — | — | ✅ | ◐ | ◐ | — | Topology rollback only |
| Did the change actually work? | ✅ | Five-rung ladder | `verificationEngine` | — | ✅ | ✅ | ✅ | — | ✅ | — | Rung 5 (user experience) needs a before/after population |

---

## The five verification rungs

A configuration change reports the rung it reached, not a boolean.

| Rung | Proven by | Status on this platform |
|---|---|---|
| 1 REQUEST ACCEPTED | HTTP 201/200 | ✅ — and worth nothing on its own |
| 2 CONFIGURATION DEPLOYED | Read-back from the config API | ✅ |
| 3 DEVICE RECEIVED | AP `services[]` reports carrying it | ✅ — after a ~30 s settle |
| 4 OPERATIONAL STATE | Clients observed on the intended VLAN | ✅ |
| 5 USER EXPERIENCE | Affected population re-measured | ◐ — implemented; not yet driven by the create-WLAN flow, which has no before/after cohort |

**Never verifiable on this platform**, and reported as such rather than passed:
the cipher suite, and the radio index a binding was written at. An AP reports
which SSIDs it carries, not how the Gateway believes it bound them — and a
binding written at the invalid index 0 is accepted and silently discarded.

---

## Confidence

Computed by the runtime from the evidence ledger, never written by the model.

| Level | Earned by | Capped by |
|---|---|---|
| CONFIRMED | The connection ladder localises the break at a named stage | any failed read, any capability gap |
| HIGH CONFIDENCE | ≥2 **independent** sources agree, or a clean plumbing preflight licenses an RF verdict | as above |
| LIKELY | A classifier attributed the finding | a cohort below 3 |
| POSSIBLE | A finding exists but the plumbing preflight never ran | — |
| INSUFFICIENT EVIDENCE | No tool succeeded, or no classifier returned a finding | — |

Tools reading the same table count as **one** source: `diagnoseClient`,
`getSiteOverview` and `compareClientToPeers` all read MuTable, so agreement
between them is one measurement seen three times.

---

## Known limitations of this document

1. **No live evaluation run.** The lab Gateway is reachable and all six routes
   Cortex depends on answer 401 (proving they exist), but an authenticated
   end-to-end run was not performed — the login window is effectively one
   attempt, and this pass had no verified credential. Rows marked ✅ are proven
   by test against recorded Gateway response shapes.
2. **`/v3/sites` response shape is inferred.** Route existence is confirmed
   live; the field names used by `listSites` (`siteName` / `name`) are handled
   defensively but not confirmed against a real body.
3. **The API gap catalogue's database path is unexercised.** Migration `0022`
   is written; tests cover the in-memory fallback only, since no
   `TEST_DATABASE_URL` was available.
4. **Proactive detection is deliberately absent.** Cortex answers when asked.
   A scheduled sweep with impact × scope × severity × confidence ranking is
   specified but not built.
