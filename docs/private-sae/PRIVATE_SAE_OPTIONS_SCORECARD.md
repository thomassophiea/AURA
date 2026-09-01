# Private SAE — options scorecard

**Date:** 2026-09-01 · Weighted 1–5 (5 = best). Weights from the brief. Confidence and evidence
per score. Outcome labels: **Proven now** · **Promising, needs Campus OS/AP engineering** ·
**Client-limited** · **Migration workaround** · **Rejected**.

## Weights

| Criterion | Wt |
|---|---|
| Works with randomized MAC | 15 |
| 6 GHz standards compliance | 15 |
| Campus OS feasibility | 15 |
| Native client interoperability | 15 |
| Security | 10 |
| User onboarding experience | 10 |
| Operational simplicity | 5 |
| Revocation behavior | 5 |
| Policy assignment | 5 |
| Scale | 5 |

## Scores (weighted totals out of 500)

| Option | randMAC 15 | 6GHz 15 | CampusOS 15 | client 15 | sec 10 | onbrd 10 | ops 5 | revoke 5 | policy 5 | scale 5 | **Total** | Outcome |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **A** Native multi-password SAE, no MAC/no id | 5 | 5 | 1 | 1 | 2 | 2 | 3 | 3 | 3 | 3 | **250** | **Rejected** (protocol-impossible: SAE can't select) |
| **B** SAE Password Identifiers | 4 | 5 | 3 | **1** | 3 | 2 | 3 | 4 | 4 | 4 | **300** | **Client-limited / Rejected as primary** |
| **C** Vendor-style Private SAE = MAC-bound `sae_password` + Aura enrollment | 4 | 5 | 3 | 5 | 4 | 4 | 3 | 4 | 5 | 4 | **410** | **Promising, needs Campus OS eng** ← recommended strategic |
| **D** Two SSIDs (WPA2-PPSK + WPA3-SAE) | 4 | 5 | 4 | 5 | 4 | 3 | 4 | 4 | 4 | 4 | **420** | **Migration workaround** ← recommended interim |
| **E** One SSID, two AKMs (WPA2 + SAE band-split) | 3 | 2 | 2 | 3 | 2 | 3 | 2 | 3 | 3 | 3 | **265** | **Rejected** (downgrade/roam/6GHz-transition-illegal) |
| **F** Transition WPA2/WPA3 one WLAN + SAE on 6 GHz | 3 | 3 | 2 | 4 | 2 | 4 | 3 | 3 | 4 | 3 | **300** | **Rejected as target** (6 GHz forbids transition; RUCKUS's model, MAC-bound) |
| **G** WPA3-Enterprise (EAP-TLS/TEAP) | 4 | 5 | 4 | 4 | 5 | 2 | 2 | 5 | 5 | 4 | **395** | **Alternate tier** (different UX, not PPSK-like) |
| **H** DPP / managed onboarding | 5 | 5 | 2 | 2 | 5 | 3 | 2 | 4 | 4 | 3 | **345** | **Provisioning layer only** (client gaps: no iOS/Windows DPP) |
| **I** Per-identity WLAN/BSSID | 5 | 5 | 2 | 5 | 4 | 3 | 1 | 5 | 5 | 1 | **370** | **Rejected** (MBSSID/beacon/scale collapse past a handful) |

Scoring notes (confidence H/M/L, evidence):

- **A** — randMAC/6GHz score high in the abstract, but CampusOS=1 and client=1 because the AP
  *cannot select* the password without a selector (H, protocol proof + hardware E6). The high
  weighted total is an artifact of scoring dimensions independently; the **feasibility gate fails
  outright**, so it is Rejected regardless of total. *A high score with a failed gate is still a
  no — the gates (feasibility, 6 GHz, client) are necessary conditions, not just weights.*
- **B** — client=1 is decisive (H, source-verified absence across Windows/macOS/iOS/Android/
  ChromeOS). Even a perfect protocol score can't rescue a feature no shipping client can use.
- **C** — client=5 because the client only needs to enter a **normal SAE password** (the MAC
  binding is AP-side); CampusOS=3 because the AP is proven-capable but the controller must build
  selector + reload + report (M-H). randMAC=4 (needs the enrollment loop; loses a point for the
  re-enroll event). **Highest *viable* strategic score.**
- **D** — the honest interim: ship a WPA3-SAE WLAN (single strong SAE password or enterprise) on
  6 GHz beside the existing WPA2-PPSK WLAN; per-user identity on the SAE side arrives with C.
  CampusOS=4 (single-PSK SAE the controller can already emit — E5). Highest total, but it does
  **not by itself** deliver per-user SAE — it's the safe bridge to C.
- **E/F** — Rejected: 6 GHz legally forbids transition mode and WPA2 (H, WFA spec + E5); same-SSID
  dual-AKM invites downgrade and roaming failures the brief says must not be recommended without
  broad proof, which doesn't exist.
- **G** — genuine 6 GHz identity + policy, best security, but it's **not the PPSK experience**
  (certificates/802.1X, MDM-driven). Keep as an explicit alternate tier, don't silently
  substitute (the brief's rule 10).
- **H** — DPP provisions a per-device SAE credential elegantly, but only Android is an enrollee;
  iOS and Windows don't speak DPP (H). Useful as an *optional* provisioning path inside C for
  Android, never the whole answer.
- **I** — proves the boundary: one BSSID per identity destroys the airtime/beacon budget past a
  few identities (H, well-known MBSSID limits). Rejected.

## Reading the table honestly

The two highest totals (D=420, C=410) are the recommendation: **D as the interim bridge, C as the
strategic target.** Options that score high on paper but **fail a necessary gate** (A: feasibility;
B: client; E/F: 6 GHz legality) are rejected despite their totals — a weighted average cannot
override a hard constraint. G is the parallel enterprise tier; H is a provisioning enhancement to
fold into C for Android; I is the proven-bad boundary case.
