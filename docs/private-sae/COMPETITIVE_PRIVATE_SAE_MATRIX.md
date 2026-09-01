# Competitive Private-SAE matrix

**Date:** 2026-09-01 · Full per-vendor evidence with URLs and access dates:
`evidence/research-vendor-matrix.md`, `evidence/research-ruckus-dpsk3.md`,
`evidence/research-sae-identifiers-clients.md`. This file is the distilled comparison; the
evidence files carry the DOCUMENTED/INFERRED/UNKNOWN labels and source links behind every cell.

## The distinction that matters: WPA2-MPSK vs WPA3-SAE multi-password

Many vendors advertise "MPSK/PPSK" and "WPA3" on the same data sheet without saying the two
don't combine. The real question is: **unique per-user/device credentials on ONE WLAN under
WPA3-SAE.** Answered honestly:

| Vendor / product | Unique creds under **WPA3-SAE** on one WLAN | Selection mechanism | Randomized-MAC behavior | 6 GHz | Per-cred VLAN/policy | Evidence |
|---|---|---|---|---|---|---|
| **RUCKUS DPSK3 ("Dynamic SAE")** | **Yes, but WPA2/WPA3 mixed-mode only** | WPA2 enrollment leg binds passphrase (MAC-keyed), then presented to SAE | Each new MAC must re-bind via the WPA2 leg; rotating-MAC undocumented | **Bound clients only; "do not configure 6 GHz-only"; 6 GHz-only clients incompatible** | Yes (per-DPSK VLAN/role) | DOCUMENTED (RUCKUS One doc set) + Redway whitepaper |
| **Cisco Catalyst 9800 + ISE** | **Yes** — WPA3-SAE-H2E iPSK, IOS-XE 17.9.2+ | MAB Access-Request returns per-client `psk` av-pair pre-SAE | MAC-keyed; randomized MAC → wrong/default psk unless re-registered | Not documented as supported for iPSK | Yes (ISE authz) | DOCUMENTED (Cisco config guide) |
| **Juniper Mist** | **Yes** — Access Assurance "RADIUS PSK" (SAE) | MAC/OUI → passphrase pre-registration; unknown MAC → default PSK | Requires registration per MAC; randomized MAC breaks lookup | Per-AP-model; not clearly 6 GHz | Yes (per-PSK VLAN/role) | DOCUMENTED (Mist docs) |
| **Fortinet FortiAP** | **Yes** — MPSK WPA3-SAE / SAE-transition, FortiOS 7.4.4+/7.6 | Per-key MAC binding; RADIUS-MAC variant 7.4.5 | MAC-keyed | Not clearly documented | Yes (per-key) | DOCUMENTED (FortiOS docs) |
| **Arista (AGNI/Cognitive)** | **Yes** — UPSK for WPA2 **and** WPA3 | SSO/QR/admin **enrollment** creates MAC→UPSK-group binding (no handshake crack) | Enrollment re-binds new MAC; MSS-G segmentation per UPSK | Not explicitly stated 6 GHz-only-safe | Yes (MSS-G) | DOCUMENTED (AGNI app note) |
| **Cambium** | **Yes** — ePSK for WPA3, Enterprise 6.6.1 (Wi-Fi 6/6E) | Onboard with WLAN passphrase, then register personal ePSK | Registration-based; community reports rough UX | Wi-Fi 6E APs | Yes | DOCUMENTED (release note); mechanism community-only |
| **HPE Aruba** | **No** — "MPSK passphrase works only with wpa2-psk-aes" | n/a (WPA2 only) | n/a | No | Yes (WPA2 only) | DOCUMENTED (Aruba docs) |
| **Cisco Meraki** | **No** — both iPSK modes "do not support WPA3"; iPSK SSIDs refuse to broadcast on 6 GHz | n/a | Meraki "Easy PSK" solves randomization but WPA2 only | No | Yes (WPA2 only) | DOCUMENTED (Meraki docs) |
| **ExtremeCloud IQ (IQ Engine)** | **No** — PPSK "not available for 6 GHz"; relies on the WPA2 candidate trick | WPA2 candidate-PMK match | n/a on 6 GHz | **No** | Yes (WPA2 only) | DOCUMENTED (ExtremeCloud IQ docs / staff) |
| **hostapd (reference)** | **Yes** — multiple `sae_password` with `\|mac=`, `\|id=`, `\|vlanid=` | MAC binding, identifier, or trial-and-error | Depends on selector | Yes | Yes (`\|vlanid=`) | DOCUMENTED (hostapd source) |
| **Campus OS AP (this lab, AP5020)** | **AP-capable today; controller does not drive it** | Same hostapd primitives as reference (E1/E2) | Depends on controller-built selector | AP radio yes; controller SAE config single-PSK | AP-capable (`sae_password\|vlanid=`) | HARDWARE-PROVEN (config plane); selection UNVERIFIED via side-load |

## The five conclusions

1. **Nobody ships pure identifier-based or crack-based per-user SAE.** Every WPA3 multi-password
   product on the market selects the password **by MAC before the handshake.** The differentiator
   is who owns the table and how it's populated.
2. **The population method is the real product.** The strong offerings (Arista, Cambium, and even
   RUCKUS's WPA2 leg) are built around an **enrollment flow** that binds the current MAC to a
   credential. That is the piece Aura would own — and Aura already has the portal, identity, and
   lifecycle machinery for it (the CWP, sponsorship, and PPSK work).
3. **RUCKUS DPSK3 is the closest reference and confirms the constraint, not an escape from it.**
   Its "Dynamic SAE" is a WPA2 enrollment leg + MAC binding + SAE presentation, explicitly
   **not 6 GHz-only capable.** Extreme can match it with the AP hardware it already has; the gap
   is controller config-gen + Aura enrollment.
4. **6 GHz narrows the field sharply.** Aruba, Meraki, and ExtremeCloud IQ have **no** WPA3
   multi-password at all; ExtremeCloud IQ's PPSK explicitly excludes 6 GHz. A Campus OS Private
   SAE with genuine 6 GHz support (SAE + H2E + PMF, no WPA2 leg required if enrollment is
   out-of-band) would be **ahead of Extreme's own cloud line and level with RUCKUS/Cisco.**
5. **The WFA is forcing the migration.** 6 GHz bans PSK AKM and transition mode; Wi-Fi 7 EHT/MLO
   bans PSK AKM on all bands. The WPA2-MPSK trick that ExtremeCloud IQ and the current Campus OS
   PPSK depend on has a hard expiry on new silicon. SAE per-user is the only future-proof form.

## Source caveat

`docs.commscope.com` now redirects RUCKUS SmartZone docs behind a gated Vistance portal;
SmartZone-specific HTML is unreachable. RUCKUS findings rest on the fully public RUCKUS One doc
set (same GUID as the seed URL), official blogs/datasheets, and the Redway Networks third-party
whitepaper. hostapd upstream `w1.fi` is anti-bot-walled for some pages; `sae_track_password`
runtime behavior is therefore INFERRED from source structure, not a rendered doc. All access
dates 2026-08-31 in the evidence files.
