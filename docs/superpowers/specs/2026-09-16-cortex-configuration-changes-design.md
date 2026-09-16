# Cortex-guided configuration changes

**Date:** 2026-09-16
**Status:** approved, implementing
**Scope:** AURA Cortex — `server/cortex/`, `src/cortex/`

The loop this builds: *ask Cortex for a change → it says what it can actually
change → it previews the exact diff → you approve in Cortex → it applies → it
proves the change landed.*

---

## 1. Why, and the incident that defines it

A change request arrived asking to enable 802.11r Fast Transition on the Skynet
WLAN. It was well argued: 605 roam events on one client, every one tagged
`FT[None]`, healthy RF and latency ruling out coverage and contention, and a
`reconcileConfiguration` pass showing expected/configured/observed in agreement.

It was also impossible. Probed against the live Gateway on 2026-09-16:

| Surface | Result |
|---|---|
| `/v1/services` — 50 distinct keys across 8 services | no `11r` / `ft` / `fastTransition` / `mobilityDomain` |
| `/v3/profiles` — 60 keys across 43 profiles | none |
| `roamingAssistPolicy` | `null` on every service — no template to mirror |
| 2027 vault | no coverage of 802.11r at all |

The roaming-adjacent fields that exist are `enabled11kSupport`,
`rm11kBeaconReport`, `rm11kQuietIe`, `mbo` — 802.11k/v, not 11r.
(`enable11mcSupport` is FTM ranging, unrelated.)

Two failures worth naming, because the design is shaped by both:

**The draft understated the problem.** It said FT state "was not directly
readable", implying the setting exists and is merely opaque. In fact there is no
field to write and therefore no read-back to verify it with. Submitting it would
have produced a success response and changed nothing.

**The justification inferred from an absent field.** "Expected, configured and
observed already agree, so this is a genuine capability gap" — those three agreed
about a set of fields that does not include FT. Agreement across a set that
excludes the thing in question is not evidence about the thing. This is the same
shape as reading an empty filter as an empty world, which the Cortex contract
already forbids on the read side.

Nothing in the system was positioned to catch either, because **nothing models
what is writable.** That is gap 1, and it is the centre of this design.

### The other two gaps

**Cortex can only create, never modify.** `wirelessIntentParser.js` emits
`create_wlan`, `create_vlan`, `validate_only`. `workflowEngine.execute()`'s
provision path hard-codes `action: 'create_wlan'`. "Enable X on existing WLAN Y"
has no route through the system at all.

**You cannot actually approve inside Cortex.** `renderWorkflowMessage()` renders
a preview as markdown text in the transcript; `cortexWorkflow` exists only as a
type field on `agentTypes.ts` and nothing renders it interactively. The real
Approve/Decline buttons (`ApprovalControls.tsx`) are consumed by exactly one
component — `WirelessAssistantPanel`, a separate surface. So consent in Cortex
today is a typed "do it", matched heuristically by `workflowRouter`.

### What already exists and is not being rebuilt

`workflowEngine.js` carries the whole state machine — `PLANNING →
BLOCKED_TECHNICALLY | WAITING_FOR_USER → READY_FOR_PREVIEW →
WAITING_FOR_CONFIRMATION → EXECUTING → VERIFYING` — with `buildPreview()`, a
persisted `confirmation_state` re-read inside `execute()`, and the rule already
written into it: *consent to something that was never previewed is not consent.*
`validationToken.js` already signs plan-hash tokens. `cortex_workflows` /
`cortex_blockers` already persist a half-finished task. This design extends that
machinery; it does not grow a parallel one.

---

## 2. Goals and non-goals

**Goals**

1. Cortex can answer "what can you change here?" truthfully, per Gateway.
2. Cortex can modify an existing WLAN through preview → approval → apply.
3. Every applied change is verified by read-back, and a silent drop reports as a
   failure.
4. Consent is bound to the exact plan that was previewed.

**Non-goals (deferred deliberately)**

- PSK rotation, security-mode changes (WPA2→WPA3), VLAN/topology reassignment.
  High value, but each can disconnect an entire WLAN, and the passphrase path
  needs the never-persist handling. Revisit once the safe set is proven.
- Disabling a WLAN (`status`). Drops every client; fails the safe bar.
- Profile/radio binding changes. Owned by the existing deploy path.
- Any change the model composes itself. The catalogue is the only writable
  surface, and the model never authors a payload.

---

## 3. Architecture

```
operator question
   │
   ├─ "what can you change on Skynet?"
   │      └─ listAvailableChanges (READ tool)
   │             └─ writableSurface.resolve(liveObject, changeCatalog)
   │                    → available[]   (catalogued AND present on this box)
   │                    → unavailable[] (catalogued, absent here, WITH REASON)
   │
   └─ "enable 11k on Skynet"
          └─ wirelessIntentParser → { action: 'modify_wlan', ... }
                 └─ workflowEngine.begin/advance      (existing)
                        └─ buildPreview  → field-level diff + the assertion
                               └─ WAITING_FOR_CONFIRMATION
                                      └─ operator clicks Approve (plan hash)
                                             └─ execute({ provision })
                                                    └─ wlanModifyEngine
                                                           GET whole service
                                                           mutate ONE field
                                                           PUT whole body
                                                           re-GET
                                                           assert verify()
                                                    → APPLIED | FAILED
```

### 3.1 `changeCatalog.js`

A declarative registry. Each entry is the single source of truth for one change:

```js
{
  id: 'wlan.11k',
  label: '802.11k neighbour reports',
  resource: 'service',
  path: 'enabled11kSupport',          // dot-path on the live object
  type: 'boolean',
  risk: 'low',                         // low | medium
  // Why an operator would want it, shown in the preview.
  rationale: 'Lets clients discover neighbouring APs, so a roam decision is ' +
             'made from a list rather than a scan.',
  // What must be true after the write for this to count as applied.
  verify: (after, desired) => after === desired,
}
```

`risk` is advisory metadata for the preview, never a gate — the gate is the
operator's approval.

**v1 entries** (every one confirmed present on the live Skynet object):

| id | path | type | risk |
|---|---|---|---|
| `wlan.11k` | `enabled11kSupport` | boolean | low |
| `wlan.11k.beaconReport` | `rm11kBeaconReport` | boolean | low |
| `wlan.11k.quietIe` | `rm11kQuietIe` | boolean | low |
| `wlan.mbo` | `mbo` | boolean | low |
| `wlan.clientToClient` | `clientToClientCommunication` | boolean | low |
| `wlan.uapsd` | `uapsdEnabled` | boolean | low |
| `wlan.suppressSsid` | `suppressSsid` | boolean | medium |
| `wlan.idleTimeout.preAuth` | `preAuthenticatedIdleTimeout` | integer 5–999999 | low |
| `wlan.idleTimeout.postAuth` | `postAuthenticatedIdleTimeout` | integer 5–999999 | low |

`suppressSsid` is medium: it strands no existing client but hides the network
from new ones. Both idle timeouts reject `0` explicitly — the Gateway returns a
422 naming limits 5–999999, and **omitting the field produces the same error**
because it defaults to 0.

### 3.2 `writableSurface.js`

```js
resolve(liveObject, catalog) -> { available: [...], unavailable: [{entry, reason}] }
```

An entry is **available** only when its `path` is present on the live object.
Absent means unavailable with `reason: 'not exposed on this Gateway'`.

This is the FT guard, stated as code. It is also why the answer to "what can you
change?" is honest on a Gateway we have never seen: the catalogue proposes, the
live object disposes.

A field present but `null` is still available — null is a value, not an absence,
and several of these are legitimately null before first use.

### 3.3 `listAvailableChanges` — a read tool

Registered in `diagnosticTools.js` with `risk: READ`, a `SOURCE_FAMILY` entry and
a `TOOL_ACTIVITY` label, so the investigation agent may call it. It answers the
discovery half of the loop without going anywhere near a write. The agent's
existing refusal of non-read tools is unchanged.

### 3.4 `wlanModifyEngine.js`

```js
applyWlanChange({ serviceId, entry, desired, session }) -> {
  status: 'applied' | 'silently_dropped' | 'rejected' | 'read_failed',
  before, after, httpStatus, error
}
```

Rules, each of which exists because this platform breaks in that specific way:

- **GET the whole service, mutate one field, PUT the whole body.** Never a
  partial body — a partial PUT wipes fields on this Gateway.
- **A 200/201 is not evidence.** Re-GET and evaluate `entry.verify(after,
  desired)`. If the write was accepted and the field did not change, the status
  is `silently_dropped`, which is a **failure**. This is the dominant failure
  mode of the platform and the single most important line in the module.
- A failed read-back is `read_failed`, kept distinct from `silently_dropped` —
  "we could not check" is not "it did not work".

### 3.5 Preview

`buildPreview()` gains a field-level diff for modify workflows:

```
Skynet — 802.11k neighbour reports
  enabled11kSupport:  false → true

After applying I will re-read the service and confirm enabled11kSupport is true.
If it comes back false, the Gateway accepted the write and discarded it, and I
will report that as a failure rather than a success.
```

Prose is not a preview. The diff and the post-condition are.

### 3.6 Consent binding

The Approve click returns the workflow id **and** a `validationToken` carrying a
hash of the previewed plan. `execute()` re-reads the persisted
`confirmation_state = 'granted'` (unchanged) **and** verifies the hash matches
the plan it is about to apply. A plan that changed between preview and click
voids consent.

Typed approval ("do it", routed by `workflowRouter`) continues to work and
remains bound to the persisted confirmation; the click additionally binds the
hash.

### 3.7 UI — `CortexApprovalCard.tsx`

Renders a `cortexWorkflow` event of `emit: 'preview'` as an interactive card in
the Cortex panel: the diff, the risk label, the post-condition, and
Approve/Decline. Reuses `ApprovalControls`. On approve it calls the confirm
endpoint with the workflow id and token, then streams the execute + verify result
back into the transcript.

`renderWorkflowMessage()` keeps producing its text body as the accessible and
copyable fallback; the card renders above it.

---

## 4. Testing

Behaviour, not implementation:

- **Catalogue** — every entry has a `verify` that passes on the desired value and
  fails on the unchanged one. A catalogue entry whose `verify` cannot fail is
  worse than no entry, because it turns a silent drop into a success.
- **Writable surface** — a field absent from the live object is reported
  unavailable with a reason and never offered. **This is the 802.11r regression
  test**, written against the real 50-key service shape.
- **Modify engine** — applied; silently dropped (200, field unchanged) must
  report failure; rejected (422); read-back failure distinct from drop; and a
  PUT body assertion that the whole object went back, not a fragment.
- **Idle timeouts** — 0 rejected, 4 rejected, 5 accepted, 999999 accepted,
  1000000 rejected.
- **Consent** — execute refuses without a persisted grant; refuses when the plan
  hash no longer matches.
- **UI** — the card renders the diff, Approve fires with the token, Decline
  cancels, and the text fallback is still present.
- **Eval scenario** — "what can you change on Skynet?" must not offer 802.11r,
  graded both ways (a grader that only ever passes is worse than none).

---

## 5. Risks

**A second write path.** Mitigated by reusing `workflowEngine` and
`validationToken` rather than growing a parallel pipeline; `wlanModifyEngine` is
only the provisioner the engine calls, mirroring how `wlanProvisioningEngine`
already plugs in.

**Catalogue drift.** A field renamed or withdrawn by a Gateway release becomes
`unavailable` rather than an error — the intersection degrades correctly by
construction.

**Over-trusting `verify`.** An entry whose predicate is `() => true` would mark
every silent drop as success. The catalogue test asserts each predicate fails on
the unchanged value.

**Scope creep toward the deferred set.** PSK and security-mode changes are out
until the safe set is proven in use, and the catalogue is the only way to add
one, which makes the boundary explicit rather than cultural.

---

## 6. File manifest

**New**

- `server/cortex/changeCatalog.js` + test
- `server/cortex/writableSurface.js` + test
- `server/cortex/wlanModifyEngine.js` + test
- `src/cortex/components/CortexApprovalCard.tsx` + test

**Modified**

- `server/cortex/wirelessIntentParser.js` — `modify_wlan`
- `server/cortex/workflowEngine.js` — modify provision path, diff preview
- `server/cortex/diagnosticTools.js` — `listAvailableChanges`
- `src/contexts/CortexContext.tsx` — render the card
- `server.js` — confirm endpoint carries the plan hash
