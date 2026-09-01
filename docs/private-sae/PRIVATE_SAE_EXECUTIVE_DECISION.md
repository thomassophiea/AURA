# Private SAE on 6 GHz — executive decision

**Date:** 2026-09-01 · **Author:** overnight architecture investigation (Red Queen / ArchAngel)
**Confidence:** High on the protocol verdict and the Campus OS gap (hardware + source + standards);
Medium-High on the recommended path (AP capability proven; on-air per-user *selection* awaits a
controller-native test — one honest open item, L1).

Supporting docs in this directory: `CURRENT_PPSK_TRACE.md`, `PRIVATE_SAE_PROTOCOL_ANALYSIS.md`,
`COMPETITIVE_PRIVATE_SAE_MATRIX.md`, `PRIVATE_SAE_OPTIONS_SCORECARD.md`,
`PRIVATE_SAE_THREAT_MODEL.md`, `PRIVATE_SAE_LAB_PLAN.md`,
`PRIVATE_SAE_CAMPUS_OS_REQUIREMENTS.md`, `PRIVATE_SAE_IMPLEMENTATION_PLAN.md`, and `evidence/`.

---

## Recommendation

**Ship a two-SSID architecture: keep the working WPA2-PPSK WLAN, and add a WPA3-SAE WLAN that runs
on 6 GHz today. Deliver per-user identity on the SAE side as "Private SAE" = MAC-bound
`sae_password` entries selected by the AP, with Aura owning the credential and enrollment
lifecycle. The Campus OS AP already does everything required; the missing piece is controller
config-generation, identical in shape to the PPSK gap.**

- **Interim (now, no platform change):** the WPA3-SAE WLAN with a single strong SAE password on
  6 GHz, standing beside the WPA2-PPSK WLAN. Compliant, native on every modern client, immediate.
- **Strategic (with one Campus OS enhancement):** per-user credentials on that same SAE WLAN via
  MAC-bound `sae_password` + Aura enrollment — the real "Private SAE."

## The answers to the brief's final questions

- **Is true Private SAE possible today?** **Not in the purest sense, and not for anyone.** "One
  WPA3-SAE WLAN, many passwords, selected purely by the credential with no MAC and no client-side
  identifier" is **impossible by the SAE construction** — the AP must choose the password before it
  commits, and the client's Commit hides which password it used. The shippable form of Private SAE,
  which every vendor uses, is **MAC-bound password selection + an enrollment loop.** That form is
  **possible** and the Campus OS AP is already capable of it.
- **Can it reuse the existing RADIUS PPSK mechanism?** **No.** The working PPSK path uses **no
  RADIUS at all** — identity resolves inside the WPA2 4-way handshake by candidate-PMK matching
  against a local key file. SAE has no equivalent (no after-the-fact candidate testing), so that
  mechanism cannot carry forward. A RADIUS path for SAE would be a *new* MAC-Auth-before-Commit
  design, not a reuse.
- **Is new Campus OS/AP functionality required?** **AP: none** (proven — the AP's hostapd already
  parses multi-`sae_password` with MAC binding, per-key VLAN, identifiers, H2E, PMF, anti-clogging,
  FT-SAE). **Controller: yes** — emit the `sae_password` set, select by MAC (or accept a
  RADIUS-returned password pre-Commit), reload on change, and report the matched identity. Full
  spec in `PRIVATE_SAE_CAMPUS_OS_REQUIREMENTS.md`.
- **One WLAN, two WLANs, one SSID, or two SSID names?** **Two SSIDs.** WPA2-PPSK on its own SSID
  (2.4/5 GHz legacy), WPA3-SAE on its own SSID (5/6 GHz). **Reject** same-SSID dual-AKM and
  transition-mode approaches: 6 GHz legally forbids WPA2 and transition mode, and same-SSID dual
  security domains invite downgrade and roaming failures. Two clean SSIDs is what RUCKUS, the
  closest competitor, effectively does too.
- **How do existing PPSK users migrate?** A PPSK credential's stored passphrase can seed an SAE
  credential (same secret, WPA3 AKM, new SSID). The WPA2-PPSK credential stays live during
  transition; retire it on the operator's timeline. No forced re-typing.
- **How does identity survive randomized MAC changes?** Identity lives in the **credential + the
  enrollment record**, never in the MAC. The MAC is a refreshable cache key for one selector
  lookup; when it rotates, the client re-enrolls (re-binds). Apple/Android default to a **stable
  per-SSID** MAC, so re-enrollment is rare. A new/unknown MAC **fails closed** to the enrollment
  WLAN — never to a shared password.
- **What does onboarding look like?** Create a Private Access Group in Aura → generate a
  credential (role/VLAN/expiry/maxDevices) → deliver by secure link, QR, or managed profile → the
  user joins WPA3-SAE with a **normal SAE password** (no identifier, no custom supplicant) → the
  enrollment step binds the current MAC. Revoke/rotate per credential, immediate.
- **What can be built immediately?** (1) The interim 6 GHz WPA3-SAE WLAN — today, no platform
  change. (2) The full Aura credential-lifecycle + enrollment layer behind `PRIVATE_SAE_ENABLED`,
  with honest `enforcement.applied=false` until the controller can provision — real, tested,
  valuable now (drives enrollment UX and the eventual push).
- **What remains a platform dependency?** Controller emission of the `sae_password` set + MAC
  selection + reload + identity readback + revoke-propagation-with-ack + max-offline fail-closed
  (R1–R6). Until those pass the hardware acceptance criteria, per-user SAE is **UNVERIFIED** and
  Aura must say so.
- **What evidence proves this?** hostapd v2.10-MLO on AP5020 accepting/deriving multi-SAE (E1/E2),
  over-air WPA3-SAE beacon + client H2E Commit (E3/E4), controller emitting single-PSK SAE only
  (E5), the side-load AUTH-frame interception that both blocks the last lab step and proves the
  controller is the right place for the fix (E6); three source-labeled research reports (RUCKUS
  DPSK3, vendor matrix, SAE/client support) in `evidence/`; IEEE/WFA standards for the 6 GHz
  envelope. The single unproven step — on-air per-user *selection* — is called out (L1), not
  papered over.

## What works now vs. what does not

| | Status |
|---|---|
| WPA3-SAE on 6 GHz, native on all modern clients (single shared password) | **Works now** (controller emits single-PSK SAE; H2E/PMF proven) |
| AP capability for per-user MAC-bound SAE (multi-`sae_password`, per-key VLAN, H2E, PMF, FT-SAE) | **Proven on hardware** (config plane) |
| Per-user SAE **selection** on air (AP picks the credential by MAC, completes 4-frame SAE) | **Unverified via lab side-load** (Broadcom AUTH-frame interception); needs controller-native test |
| Controller emitting a per-key `sae_password` set + reload + identity readback | **Does not exist** — the enhancement (R1–R6) |
| SAE Password Identifiers as the product mechanism | **Dead** — no mainstream client can provision one |
| Pure no-MAC/no-identifier multi-password SAE | **Impossible** by the SAE construction (no vendor does it) |
| Same-SSID dual-AKM / WPA2-WPA3 transition on 6 GHz | **Rejected** — forbidden on 6 GHz; downgrade/roam risk elsewhere |
| Reusing the working RADIUS-PPSK exchange for SAE | **N/A** — the working PPSK path uses no RADIUS |

## Why this is the right call

It preserves the working PPSK implementation untouched, gives customers a **standards-compliant
6 GHz network immediately**, matches the strongest competitor (RUCKUS DPSK3) with hardware Extreme
already ships, and confines the platform ask to a **single, well-specified, PPSK-shaped controller
enhancement** — while Aura builds the credential + enrollment lifecycle that is the actual product
value and the piece no amount of controller work provides. It refuses the three tempting dead ends
(identifier-based, no-MAC-magic, same-SSID transition) with protocol and standards evidence rather
than taste, and it fails **closed** everywhere the safe default is "no access, not shared access."
