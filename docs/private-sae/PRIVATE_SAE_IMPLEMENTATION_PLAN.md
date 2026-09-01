# Private SAE — phased Aura implementation plan

**Date:** 2026-09-01 · Principle: **build only what evidence supports, behind a flag, reusing the
PPSK machinery.** The credential-lifecycle layer is real Aura work with value today (it drives the
enrollment UX and, later, controller provisioning). The wireless enforcement is a controller
dependency (`PRIVATE_SAE_CAMPUS_OS_REQUIREMENTS.md`) and is surfaced honestly, exactly as PPSK
surfaces `enforcement.applied=false`.

## Design stance

Private SAE is **PPSK's identity model on the SAE AKM.** The credential store, crypto, RBAC, audit,
scope targeting, reveal path, and the honest two-plane reporting are the same — so the plan is
mostly *extend*, not *build new*. The genuinely new part is the **enrollment loop** that binds the
current MAC to a credential (the piece every competitor's product is actually made of).

## Phase 0 — Feature flag + shared model (no wireless dependency)

- `PRIVATE_SAE_ENABLED` env flag; everything gated. Off ⇒ zero behavior change (PPSK untouched).
- Migration `0017_private_sae.sql` (+ lazy-ensure twin, new advisory-lock key). Reuse the PPSK
  column set; add `akm` (`wpa2-psk` | `wpa3-sae`) so one table can express both, and an
  `sae_bindings` child table `{credential_id, mac, bound_at, last_seen}` for MAC→credential.
- Reuse `server/ppsk/ppskCrypto.js` verbatim for at-rest encryption (`PPSK_ENCRYPTION_KEY`; SAE
  passwords are the same recoverable-plaintext constraint).
- New `server/privateSae/` mirroring `server/ppsk/`: `saeStore.js`, `saeRouter.js`
  (`createPrivateSaeRouter({...injectables})`, `requireRole('operator')` on mutations),
  `saeCredential.js` (generation: ≥ 20-char rejection-sampled, WPA3-appropriate). Tests alongside
  (`*.test.js`, `*.db.test.js`) following the PPSK pattern — RBAC, 400/409/501/503, honest
  enforcement, real-Postgres store.

## Phase 1 — Credential lifecycle API (buildable + testable now, no hardware)

- `GET/POST/PUT/DELETE /api/v1/private-sae`, `/:id/enable|disable`, `/:id/reveal` (audited),
  `/generate`, and `/keyfile?wlan=…` rendering the **`sae_password` file** (the R1 artifact) —
  the SAE analogue of the PPSK `wpa_psk_file` preview.
- Audit events `sae.*` (create/update/enable/disable/delete/reveal/keyfile.render/bind/revoke).
- **Honest enforcement:** every mutation returns `enforcement {attempted:false, applied:false,
  reason:"controller does not yet emit sae_password sets"}` until R1 ships. `keyfile` returns
  `provisioning.supported:false`. Never claim a credential is live on air.
- Unit + integration + security tests green; this phase is a clean, real feature that manages SAE
  identities and renders the exact file the controller (or an out-of-band lab step) will apply.

## Phase 2 — Enrollment loop (the product differentiator; partial value now)

- `POST /api/v1/private-sae/enroll` — an authenticated-guest/portal flow that, given a credential
  token, records the **current** station MAC as a binding for that credential. Reuse the CWP/
  sponsorship portal patterns for the user-facing side (QR / secure link / short code).
- Binding update is what R4 pushes to the controller. Until R1/R4 exist, bindings are stored and
  shown (and can be applied out-of-band in the lab), with the same honest banner.
- This is where randomized-MAC survival lives: re-enroll re-binds; per-SSID stable MAC makes it
  rare. DPP-based enrollment (Android) can be an *optional* provisioning path here (research: only
  Android is a DPP enrollee — never the sole path).

## Phase 3 — Controller provisioning (blocked on Campus OS R1–R6)

- Implement the controller push: render `sae_password` set + bindings to the WLAN scope, reload,
  read matched `keyid` back into Clients ▸ Username (R3 — likely zero Aura change once the
  controller populates `userName`). Flip `enforcement.applied=true` only when the acceptance
  criteria (requirements doc) pass on hardware.
- Reuse the PPSK observed-identity bridge (`0016`) as the interim readback until R3 lands.

## Phase 4 — Product surface (Configure ▸ Private Access Groups)

- One screen unifying PPSK (WPA2) and Private SAE (WPA3) as **Private Access Groups**, per the
  brief's target UX: create a group, choose **WPA2-PPSK / WPA3-Private-SAE / Auto (two-WLAN
  compatibility)**, generate credentials, assign role/VLAN/expiry/maxDevices, deliver via secure
  link/QR/managed profile, view sessions (MAC as session attribute, not identity), revoke/rotate,
  and **migrate a credential WPA2→WPA3**.
- Band/-client support badges + a hard warning when 6 GHz requirements can't be met (e.g. a
  WPA2-only credential can't ride 6 GHz). Built to the golden EP1 design (`golden-design` skill).
- Marked **Experimental** until Phase 3 hardware acceptance, same discipline as PPSK.

## Migration story (existing PPSK users → WPA3)

- A PPSK credential's passphrase can seed an SAE credential (same secret, new AKM) — the store
  already holds it recoverably. "Migrate to WPA3-SAE" creates the SAE credential on the WPA3 WLAN
  (Option D: separate SSID), keeps the WPA2-PPSK credential live during transition, and retires it
  on the operator's timeline. No user re-typing if the passphrase is reused; new-passphrase
  rotation offered.
- Interim (Option D) requires **no controller change**: the WPA3-SAE WLAN can run today with the
  controller's existing single-password SAE (E5) as a shared-password 6 GHz WLAN, while per-user
  selection waits for Phase 3. That gives customers a compliant 6 GHz network immediately and a
  per-user upgrade path.

## Testing / rollout

- Unit (crypto vectors, generation, file render), integration (real Postgres, RBAC, scope),
  security (no secret in logs/bundle/response; audited reveal only), failure-path (no key → 501,
  no DB → 503, controller-down → honest enforcement).
- Run full existing suite + lint; flag OFF must be byte-identical to today.
- Rollout: flag on in Integration → QA → Release, never straight to prod; the wireless plane stays
  `applied=false` until Campus OS acceptance, so no production risk from the Aura side.

## What NOT to build

- No Password-Identifier-dependent flow (no client support).
- No same-SSID dual-AKM WLAN (downgrade/roam risk; 6 GHz forbids transition).
- No trial-and-error SAE (DoS + non-scalable).
- No fallback-to-default-password on unknown MAC (fail closed).
