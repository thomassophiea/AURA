# AURA_LAB experiment log

Append-only. Every hypothesis gets a result — **including failures** (a falsified hypothesis is
evidence; record it so it is not retried blindly). Format: date · hypothesis · test · evidence ·
verdict.

---

## 2026-09-01 — Baseline inventory (read-only)

**Verified topology:** AURA_LAB → 5010-LAB1 → AP5010-LAB (AP5010U-WW, WM012243W-30032) @
192.168.100.111, confirmed by controller `/aps` and by AP fingerprint. Blast-radius target locked.

**Radios:** wl0=2.4, wl1=5, **wl2=6 GHz (idle, 228 chanspecs)**. AP5010U is tri-band (Wi-Fi 6E).
6 GHz is available for AURA_PSAE.

**AURA_PPSK reality:** controller privacy `WpaPskElement` → single static WPA2-PSK, **no
`wpa_psk_file`**. Per-user PPSK is NOT active here (only ever proven via out-of-band injection on
the AP5020). AURA-CWP = open/captive.

**AP hostapd:** SAE-capable (`sae_pwe`, `enc_sae_password`, per-`sae_password` VLAN, `wpa_psk_file`,
`wpa_psk_radius`).

**Carried constraint:** foreign side-loaded hostapd cannot complete SAE on Broadcom
(`device_ap_sme=1` intercepts AUTH frames). SAE must run in the controller-provisioned main hostapd.

---

## Planned hypotheses (to execute, in order)

- **H1 — AURA_PPSK client join baseline.** A client joins the current single-PSK AURA_PPSK on
  2.4/5. *Purpose:* confirm the known-good baseline authenticates before any change. *Status:* to run.
- **H2 — Per-user PPSK on AP5010-LAB via seccfg `wpa_psk_file` injection + main-hostapd reload.**
  Inject a multi-key `wpa_psk_file` into AURA_PPSK's controller seccfg (wl0.1/wl1.1), reload the
  main hostapd; two keys on one MAC → two identities; revoke one, other survives. *Purpose:* prove
  per-user PPSK on THIS AP through the Extreme main hostapd (not a foreign instance). *Status:* to run.
- **H3 — Controller can assign a WLAN to wl2 (6 GHz).** Create AURA_PSAE (WPA3-SAE, single pass)
  scoped to AP5010-LAB1, assigned to the 6 GHz radio; confirm it beacons on wl2. *Purpose:* prove
  the controller data path reaches 6 GHz and SAE runs on the Extreme AP. *Status:* to run.
- **H4 — Native client joins AURA_PSAE over 6 GHz** (SAE H2E + PMF), randomized MAC. *Purpose:*
  the headline 6 GHz milestone on Extreme hardware. *Status:* to run.
- **H5 — Per-user SAE via `sae_password` set injection into AURA_PSAE seccfg + main-hostapd reload.**
  Multiple credentials, MAC-bound selection, on the Extreme AP, ideally on 6 GHz. Wrong cred
  rejected; revoke one, others survive. *Purpose:* per-user Private SAE on Extreme hardware.
  *Status:* to run. *Risk:* if the main hostapd also cannot select per-user SAE, capture where it
  fails and specify the exact controller/AP gap (do not fake it).
- **H6 — AAA-backed SAE (PMK-from-RADIUS / RADIUS-selected sae_password).** Investigate whether the
  Gateway/AP supports RADIUS-mediated SAE credential selection (Pi as a standards AAA server for the
  test only). *Purpose:* the randomized-MAC-friendly path that removes per-AP key files. *Status:*
  to run after H5.

Results appended below as each runs.
