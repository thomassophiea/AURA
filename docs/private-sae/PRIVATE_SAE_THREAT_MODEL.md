# Private SAE — threat model (Red Queen)

**Date:** 2026-09-01 · Target: the recommended architecture (Option C — MAC-bound `sae_password`
selected by the AP, credentials + enrollment owned by Aura, per-key VLAN, controller-provisioned).
Each item: attack → what happens → mitigation → residual risk. "Fails safe" = the default outcome
of a partial/compromised path is *no access*, never *shared access*.

## Credential and key handling

| Attack | Behavior / mitigation | Residual |
|---|---|---|
| **Offline dictionary on SAE** | SAE is a PAKE — a passive capture yields nothing to grind. Mitigation is intrinsic to WPA3. Enforce a strong generated passphrase (≥ 20 chars, rejection-sampled, as PPSK already does). | Weak *user-chosen* passwords — so **generate, don't accept** by default. |
| **Offline attack on Aura's store** | SAE passwords stored AES-256-GCM under a KMS-held key, exactly as PPSK (`ppskCrypto.js`). Never hashed (the AP needs plaintext to derive PT — same constraint as PPSK). DB holds only `v1:` ciphertext. | Compromise of both DB **and** KMS key. Split them; rotate the KMS key. |
| **Secret in logs / bundle / URL / pcap** | Reuse the PPSK discipline: passphrase only via the audited reveal path, never in list/log/JS. hostapd `-dd` emits `[REMOVED]` for SAE material (verified E-bundle). Identifiers, if ever used, ARE cleartext on air — another reason to avoid Option B. | Operator screen-capture during reveal (procedural). |
| **Every AP must hold all passwords?** | **No** — with MAC-bound selection the AP needs only the `sae_password` entries for stations it serves, but in practice the controller pushes the WLAN's key set to every AP running it (like `wpa_psk_file`). Treat the AP key file as a **crown-jewel artifact**: tmpfs only, 0600, wiped on WLAN teardown, never in a backup. | A rooted AP exposes its WLAN's key set. Scope key sets per Site/Gateway so blast radius = one site, not the org. |

## SAE / RF protocol attacks

| Attack | Behavior / mitigation | Residual |
|---|---|---|
| **Commit flooding / CPU exhaustion** | AP binary carries anti-clogging tokens (`ANTI_CLOGGING_TOKEN_REQ`, verified E1) + `sae_anti_clogging_threshold`. With MAC-bound selection the AP derives **one** PWE per association, not one per candidate — no multiplication. | DoS still possible at extreme scale; rate-limit + anti-clog threshold tuned per AP. |
| **Trial-and-error candidate multiplication** | Explicitly **not used** — selector (c) rejected. Only the MAC-bound single-PWE path ships. | n/a (by design). |
| **Downgrade to WPA2** | 6 GHz WLAN is SAE-only by law (no PSK AKM, no transition — WFA spec). On 2.4/5 the interim keeps WPA2-PPSK on a **separate SSID** (Option D), not a same-SSID transition, so there's no in-SSID downgrade surface. | A user manually joining the legacy WPA2 SSID — acceptable and visible; retire it on the migration timeline. |
| **Evil twin** | PMF required (verified: `WpaSaeElement.pmfMode` readOnly "required") protects mgmt frames; SAE mutual auth means the rogue can't complete without the password. SAE-PK is available in the binary if a shared-password AP ever needs anti-evil-twin (not relevant to per-user). | Pre-auth deauth pre-PMF-association window (standard, small). |
| **Password Identifier enumeration** | Avoided — identifiers are cleartext on air and we do not use them. | n/a. |

## Identity, MAC, and lifecycle

| Attack | Behavior / mitigation | Residual |
|---|---|---|
| **Randomized/rotating MAC breaks the binding** | Central design point. Identity = credential + enrollment record, MAC = refreshable cache key. New MAC → no binding → **fails closed** (falls to enrollment WLAN / default-deny), then re-enrolls. Per-SSID stable MAC (Apple/Android default) makes this rare. | A user who toggles "rotate MAC" hourly re-enrolls often — degraded UX, never a security hole. |
| **Credential sharing across devices** | `maxDevices` per credential (already in the PPSK model); each bound MAC counts against it. Over-limit binding refused. | Genuinely shared secret among ≤ maxDevices colluders — inherent to any PSK; mitigate with per-credential device caps + anomaly alerts. |
| **Stolen credential** | Revoke the one credential: remove its `sae_password` line, reload; bound station disassociated; other credentials unaffected (PPSK revocation semantics, proven — `mic mis-match` analogue for SAE is a failed Confirm). | Window between theft and revoke — bounded by `expiresAt` + rotation. |
| **Admin revokes while client connected** | Reload disassociates the affected station immediately (observed for PPSK); re-auth fails. Must propagate to every AP+HA peer holding the key set. | Stale AP cache after revoke → see next row. |
| **Stale AP key-set after revoke (the dangerous one)** | Revocation MUST be a controller push + reload to **all** APs on the WLAN + both HA gateways, with an ack. Until every AP acks, the credential is still live on laggards. | A partitioned AP keeps a revoked key until it reconnects — **fail-safe requires a max-offline TTL on the key set** so an isolated AP eventually refuses all keys rather than serving revoked ones. Specify in requirements. |
| **Roaming with a revoked credential (PMKSA cache)** | Revoke must also invalidate cached PMKSA/FT keys, or a roamed station skips SAE and rides the cache. Controller must flush PMKSA on revoke. | Cache lifetime window; keep PMKSA TTL short relative to revoke SLA. |

## Multi-tenant / platform

| Attack | Behavior / mitigation | Residual |
|---|---|---|
| **Cross-tenant credential access** | Credentials scoped by Org/Site-Group/Site/Gateway (reuse Aura targeting + RBAC, as PPSK). Key sets rendered per scope; an AP gets only its scope's keys. | Misscoped WLAN assignment (config error) — validate scope on write. |
| **Compromised Gateway/controller** | It can read the key set it renders — so treat controller creds as tier-0; the KMS key for Aura's store is **not** on the controller. A rogue controller can serve access but cannot exfiltrate Aura's full history/other scopes. | Full controller compromise = that scope's current keys exposed → rotate on suspicion. |
| **Compromised Aura DB + admin account** | RBAC gates reveal/rotate/revoke; every action audited (`ppsk.*` pattern extended to `sae.*`). DB ciphertext needs the KMS key. | DB + KMS + admin together = total — standard tier-0 assumptions; MFA + audit + key split. |
| **Race during rotation** | Rotation = add new line, reload, then remove old after the new is acked (make-before-break), single-writer per credential (advisory lock, as PPSK `8270119004461014`). | Brief dual-valid window (intended, safe). |
| **Authorization bypass via fallback** | The cardinal rule: **a missing/failed lookup must deny, never fall back to a shared password.** RUCKUS/Mist fall to a *default* PSK on unknown MAC — we do **not** copy that; unknown MAC → enrollment-only WLAN or deny. | Enrollment WLAN itself must be low-privilege (VLAN quarantine) so the fail-open-to-enroll path grants nothing but the ability to enroll. |

## Residual-risk summary (ranked)

1. **Stale AP key-set after revocation** — the highest residual. Mitigation is a hard requirement:
   controller push+reload+ack to all APs/HA peers, PMKSA flush, and a **max-offline TTL** so a
   partitioned AP fails closed. (Requirements doc, acceptance criteria.)
2. **Crown-jewel key file on every AP** — scope per site to bound blast radius; tmpfs, 0600,
   never backed up.
3. **Randomized-MAC re-enrollment UX** — a UX cost, not a security hole; keep the enrollment loop
   frictionless and lean on per-SSID stable MAC defaults.
4. **Weak user-chosen passwords** — generate by default; forbid short passphrases.
5. **Fail-open-to-default** — explicitly rejected in design; unknown MAC denies or quarantines.
