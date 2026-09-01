# AURA_LAB — Extreme hardware integration lab

**Canonical hardware integration + POC site for all Aura features needing real WLAN/AP/Gateway
validation.** Blast-radius boundary: **only** the resources below may be changed. Verify the target
resolves to this chain before any write; if it does not, STOP.

```
Site        AURA_LAB          (US / America/New_York)
Device grp  5010-LAB1
AP profile  AP5010-LAB1
RF policy   HQ Smart RF
AP          AP5010-LAB   model AP5010U-WW   serial WM012243W-30032   mgmt 192.168.100.111
Gateway     Campus Controller (VE6120) 192.168.100.12:5825 / tsophiea.ddns.net:443
```

SSH to the AP: `admin` / `Admin123` (confirmed enabled on the box, 2026-09-01).

## Hardware baseline (verified on hardware 2026-09-01, read-only)

AP5010-LAB, fw **10.20.1.0-020R**, board `maple`, personality `identifi` (XCC-adopted). `wl` at
**`/usr/bin/wl`** (not `/usr/sbin/wl` as on the AP5020/mapleleaf). **Three radios:**

| Radio | Band | Current chanspec | 6 GHz chanspecs | VAPs up |
|---|---|---|---|---|
| `wl0` | 2.4 GHz (`b`) | ch1 | 0 | `wl0.0`=AURA-CWP, `wl0.1`=AURA_PPSK |
| `wl1` | 5 GHz (`a`) | ch56 | 0 | `wl1.0`=AURA-CWP, `wl1.1`=AURA_PPSK |
| `wl2` | **6 GHz (`6g`)** | **6g149/160** | **228** | **none (idle)** |

Board capability map (`/etc/ap_version.txt`): `RADIO0_6GHz_CAP`, `RADIO2_6GHz_CAP`,
`RADIO0_TRIPLEBAND_CAP`, `R0_R2_6G_SPLIT_CAP` — this is a **tri-band (Wi-Fi 6E) AP; 6 GHz is real
and currently idle.** wl2 is the target radio for AURA_PSAE. Each radio exposes VAPs `.0`–`.8`.

AP hostapd (`/sbin/hostapd`) carries SAE: `sae_pwe`, `enc_sae_password`, per-`sae_password` VLAN
assignment, `wpa_psk_file`, `wpa_psk_radius` — same firmware capability set as the AP5020.

## Current WLANs (controller definitions, verified via API 2026-09-01)

| WLAN | SSID | controller privacy type | Reality |
|---|---|---|---|
| AURA_PPSK | AURA_PPSK | `WpaPskElement` | **Single static WPA2-PSK** — `enc_wpa_passphrase`, `wpa_key_mgmt=WPA-PSK`, **no `wpa_psk_file`**. A normal PSK network, **not** per-user PPSK. |
| AURA-CWP | AURA-CWP | `None` (open) | Open + captive portal (Cloud Captive Web Portal). On wl0.0/wl1.0. |

**Honest baseline finding (Mission 1):** "AURA_PPSK is already working" is true only in the sense
that it is a functioning WPA2-PSK WLAN. The **per-user / multiple-independently-managed-credential
PPSK feature is NOT running on this AP** — the controller emits one shared PSK. Per-user PPSK
("key determines identity") was previously proven only via a **hand-injected `wpa_psk_file`**
out-of-band on the AP5020s (`docs/PPSK_HARDWARE_FINDINGS.md`); it has not been applied here. This
matches the standing controller-config-gen gap (controller never emits `wpa_psk_file`/`sae_password`
sets). See the experiment log for the plan to (a) make AURA_PPSK genuinely per-user here and
(b) build AURA_PSAE.

## Nomenclature (current)

- **Aura PPSK** — SSID `AURA_PPSK`. ("Skynet PPSK" is obsolete; do not reintroduce.)
- **Aura Private SAE** — SSID `AURA_PSAE` (to be built on wl2 / 6 GHz).
- Keep `AURA-CWP` as-is.

## AAA / Gateway relationship

Campus Controller (VE6120) adopts the AP (XCC/identifi). Guest/CWP AAA policy *Local onboarding*
and role *Enterprise User* are the shared objects (see archangel credentials). RADIUS is **not**
currently wired on AURA_PPSK or AURA-CWP (no `auth_server_addr` in their seccfg). RADIUS-backed SAE
/ PMK-from-AAA is an open investigation (Mission 2).

## Architecture constraint carried in from prior work

Side-loading a **foreign** hostapd on an unprovisioned VAP cannot complete **SAE** on Broadcom APs:
`device_ap_sme=1` makes the firmware SME intercept 802.11 AUTH management frames, which a foreign
hostapd never receives (PPSK survived the same trick only because its exchange is EAPOL *data*
frames). **Consequence for AURA_PSAE:** the SAE `sae_password` set must be consumed by the
**controller-provisioned main hostapd** that legitimately owns the VAP (inject into that instance's
seccfg + reload), not a side-loaded one — so SAE AUTH frames route correctly. This is the same
"out-of-band inject into the real seccfg" method that made per-user PPSK work on the AP5020, and it
runs the security on the **Extreme AP**, not a Pi.

## Roles of the WLAN Pi (allowed) vs. not allowed

Allowed: packet capture, RADIUS diagnostics/test-AAA server, client emulation, traffic gen,
logging, protocol inspection. **Not allowed:** the Pi implementing a Wi-Fi security function the
Extreme AP/Gateway is supposed to provide. AURA_PSAE success requires the **Extreme AP** to run the
SAE. (In the prior session the Pi was the *AP* to prove the SAE mechanism in isolation; under this
mission the AP must be the Extreme AP5010-LAB.)

## Test methodology

Red Queen: for every apparent success, enumerate alternative explanations (cached PMK, wrong band,
roam to another AP, stale WLAN, shared password, Pi providing the function, stored client creds,
MAC-randomization change) and disprove them with logs/pcaps. Verify band from the AP (`wl -i <vap>
chanspec`) and client, not from assumptions.

## Open questions (live)

- Can the controller assign a WLAN to wl2 (6 GHz) for this profile via API? (to test)
- Does injecting a `sae_password` set into the controller's SAE seccfg + reloading the main hostapd
  complete per-user SAE on the Extreme AP? (core hypothesis, to test)
- Does the Gateway/AP support any AAA-backed SAE (PMK-from-RADIUS, RADIUS-selected sae_password)?
- 6 GHz SAE (H2E+PMF) association on wl2 with a native randomized-MAC client — end to end.

See `EXPERIMENT_LOG.md` for hypotheses, tests, and results (including failures).
