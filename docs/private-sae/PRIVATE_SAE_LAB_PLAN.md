# Private SAE — lab plan (reproducible)

**Date:** 2026-09-01 · Lab: APs `.141`/`.142` (AP5020, fw 10.20.1.0-020R), WLAN Pi Pro
`192.168.100.113` (MT7921), Campus Controller `192.168.100.12:5825`. Everything here is safe and
reversible; **never touch the controller-managed BSSes or the `Skynet_PPSK` proof.**

## What is already verified (this pass)

- **A1 AP config-plane multi-SAE** — hostapd accepts 4 `sae_password` entries (wildcard/`mac`/
  `id`/`vlanid`), derives H2E PT per password, loads identifiers. ✅ (`evidence/`, E2)
- **A2 Over-air WPA3-SAE beacon** — Pi scan sees `Aura-SAE-Lab` as WPA3-SAE on 2.4 & 5 GHz. ✅ (E3)
- **A3 Client H2E + Commit TX** — real wpa_supplicant derives PT and transmits SAE Commit. ✅ (E4)
- **A4 Controller emits single-PSK SAE only** — `WpaSaeElement.presharedKey`, `seccfg` static PSK. ✅ (E5)
- **A5 Side-load cannot complete SAE** — Broadcom `device_ap_sme=1` intercepts AUTH mgmt frames on
  an unprovisioned VAP; PPSK (EAPOL data) survives it, SAE (AUTH mgmt) does not. ✅ documented as a
  **method** limit (E6).

## What remains UNVERIFIED and how to prove it

### L1 — On-air SAE password selection (the key open item)

**Blocker:** the side-load method (A5). Two ways to unblock, in preference order:

1. **Controller-native SAE WLAN (needs the enhancement).** Once the controller can emit a
   `sae_password` set, the firmware SME routes AUTH frames to the real authenticator and selection
   can be observed. This is the acceptance test for the Campus OS enhancement (see requirements
   doc), not something to fake earlier.
2. **Standalone hostapd on a dedicated radio** (WiNG-personality AP, or a spare AP not adopted by
   the controller, or a Linux box + supported NIC). No `device_ap_sme` interception; full 4-frame
   SAE completes. Procedure:
   - AP config: `wpa_key_mgmt=SAE`, `ieee80211w=2`, `sae_pwe=1`, entries:
     `sae_password=UserA|mac=<STA-MAC>|vlanid=101`, `sae_password=Enroll|vlanid=900` (wildcard).
   - **T-pos:** STA (MAC bound) presents `UserA` → expect `AP-STA-CONNECTED`, `Assigned VLAN ID 101
     from sae_password`, VLAN 101 DHCP.
   - **T-neg-1 (selection):** STA presents `Enroll` while its MAC is bound to `UserA` → AP selects
     the `mac=`-bound `UserA` PWE → **Confirm fails** → rejected. Proves MAC selection overrides
     the presented password.
   - **T-neg-2 (revoke):** remove `UserA`, reload → bound STA disassociated, re-auth fails; wildcard
     `Enroll` still works.
   - **T-id (identifier, informational only):** add `|id=alpha`; STA with `sae_password_id=alpha`
     (wpa_supplicant only) → connects; confirm no native OS can do this.

### L2 — Native client matrix on a real WPA3-SAE WLAN (controller-provisioned, single password)

This is buildable **today** on 6 GHz with the controller's existing single-PSK SAE. Stand up a
controller WLAN `Aura-SAE-6G` (WPA3-SAE, PMF required) on 6 GHz and record, per client:

| Field | Windows 11 | macOS | iOS/iPadOS | Android | ChromeOS | Linux/supplicant | 6E WPA3 client | IoT |
|---|---|---|---|---|---|---|---|---|
| OS/version, adapter/driver | | | | | | | | |
| Bands, private-MAC setting | | | | | | | | |
| AKM / cipher / PMF / H2E | | | | | | | | |
| Auth result, VLAN/role | | | | | | | | |
| Roam result, revoke result | | | | | | | | |

Expected (from research): all modern OSes join WPA3-SAE-H2E-PMF on 6 GHz natively; **none** accept
a Password Identifier. This matrix proves the *envelope* (SAE/H2E/PMF/6 GHz works everywhere) so
that when L1 lands, per-user selection is the only new variable.

### L3 — Randomized-MAC re-enrollment behavior

Per client: connect (bind MAC) → "forget network" → rejoin → observe new MAC → confirm the
enrollment loop re-binds. Record whether each OS uses a stable per-SSID MAC (expected default) or
rotates, and the re-enroll frequency.

## Packet-capture filters (WLAN Pi monitor, `wlanpi capture <ch> <secs>`)

- SAE auth: `wlan.fc.type_subtype == 0x0b` (Authentication) — Commit/Confirm, algorithm = SAE (3).
- Password Identifier element presence: inspect the SAE Commit for the identifier element (proves
  cleartext exposure for the threat model).
- PMF: `wlan.fixed.capabilities` + RSN capabilities MFPR/MFPC bits.
- 4-way handshake: `eapol`. FT: `wlan.tag.number == 55` (MDE) / `== 54` (FTE).
- **Never** log decrypted material; captures are for frame *structure*, not contents.

## Rollback (every experiment)

- Spare-VAP hostapd: `kill $(cat /tmp/aura_sae.pid); wl -i <vap> bss down; ifconfig <vap> down; rm
  -f /tmp/aura_sae.*`. Assert `wl -i wl0.0 bss = up` and `Skynet_PPSK` seccfg present before/after.
- Controller WLAN (L2/L1-native): delete the test WLAN via the API; it is a normal object, safe to
  remove. Never delete or edit `AURA-CWP`, `Skynet*`, or the PPSK objects.
- Pi: `wlanpi ssh 'sudo wlanpi-kit restore'`.
