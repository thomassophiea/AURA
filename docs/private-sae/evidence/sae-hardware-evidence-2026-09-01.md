# SAE hardware evidence — sanitized bundle

**Date:** 2026-08-31 → 2026-09-01 · **APs:** AP5020-WW `.141`/`.142` (fw 10.20.1.0-020R,
`mapleleaf`, identifi/XCC-adopted) · **Client:** WLAN Pi Pro, MediaTek MT7921, wpa_supplicant
v2.10, wlan0 `e8:bf:b8:73:a1:e0`. No passphrases, PT seeds, or keys appear below (hostapd `-dd`
emits `[REMOVED]` for those; the controller PSKs are shown `[REDACTED]`).

## E1 — AP hostapd SAE capability (config plane), AP5020

`hostapd v2.10-MLO`. `wpa_supplicant v2.10` also present. SAE strings in the binary:

```
sae_pwe · sae_groups · sae_require_mfp · sae_anti_clogging_threshold · sae_sync
sae_confirm_immediate · transition_disable · SAE_HASH_TO_ELEMENT · SAE_PK
SAE: Received Password Identifier · SAE: own Password Identifier: %s
UNKNOWN_PASSWORD_IDENTIFIER · SAE: The included Password Identifier does not match the expected one
key_mgmt: SAE · FT-SAE · FT-SAE-EXT-KEY · OWE
Assigned VLAN ID %d from wpa_psk_file to <mac>       (per-key VLAN, PSK path)
Failed to assign VLAN ID %d from sae_password to <mac>  (per-key VLAN, SAE path)
Invalid VLAN ID %d in sae_password · enc_sae_password
ANTI_CLOGGING_TOKEN_REQ · Comeback: Invalid anti-clogging token …
No PSK for STA trying to use SAE with PMKSA caching · RSN: Cache PMK from SAE
```

Interpretation: the AP authenticator carries the **complete** per-user-SAE runtime —
multiple `sae_password` entries, `|mac=` binding, `|id=` password identifiers, `|vlanid=`
per-password VLAN, H2E, anti-clogging, FT-SAE, SAE-PK. This is exactly the primitive set
every competitor's WPA3 multi-password feature is built on.

## E2 — AP accepts + activates a 4-entry multi-SAE WLAN

Config side-loaded to a spare VAP (`wl0.5`), 3–4 `sae_password` entries (wildcard + `|mac=` +
`|id=` + `|vlanid=`). hostapd startup:

```
SAE: Derive PT - group 19            ← one PT derived PER configured password (H2E)
SAE: SSID - "Aura-SAE-Lab"
SAE: password identifier: alpha      ← identifier entries loaded and indexed
SAE: password identifier: bravo
wl0.5: AP-ENABLED
```

`PT count = 4` for four passwords. No parse errors. The identifier + vlanid syntax
(`sae_password=<pw>|vlanid=101|id=alpha`) parsed cleanly once `id` was placed last
(hostapd requires the identifier as the final `|`-field). **Config-plane multi-SAE:
proven.**

## E3 — AP beacons valid WPA3-SAE, seen over the air

Independent scan from the WLAN Pi:

```
SSID           BSSID              MHz    dBm  SECURITY
Aura-SAE-Lab   18:49:f8:6c:22:25  5180   -85  WPA3-SAE     (5 GHz VAP on .141)
Aura-SAE-Lab   18:49:f8:6c:22:15  2412   -74  WPA3-SAE     (2.4 GHz VAP on .141)
Aura-SAE-Lab   18:49:f8:6c:13:95  2437   -??  WPA3-SAE     (2.4 GHz VAP on .142)
```

RSNE advertised WPA3-SAE with PMF; the client parsed `rsn_ie_len=20 caps=0xd11`.

## E4 — Client completes H2E PT and transmits SAE Commit

Real wpa_supplicant on the MT7921, config `key_mgmt=SAE ieee80211w=2 sae_pwe=1`:

```
SAE: Derive PT - group 19        ← client H2E, matches AP
SAE: Derive PT - group 20
wlan0: SME: Trying to authenticate with 18:49:f8:6c:13:95 (Aura-SAE-Lab) freq=2437 MHz
```

The client selected the BSS, derived PT, and put SAE Commit frames on air (four retries).

## E5 — Controller emits single-PSK SAE only (the gap)

`/tmp/seccfg_*.cfg` (controller-generated, live on the AP) for every WPA2-Personal WLAN:

```
ssid=Skynet · wpa_key_mgmt=WPA-PSK · enc_wpa_passphrase=[REDACTED]   ← ONE static PSK
```

WPA3-Enterprise WLAN (`Skynet_Secure`): `wpa_key_mgmt=WPA-EAP-SUITE-B-192`, RADIUS wired.
Controller OpenAPI `WpaSaeElement`: a single `presharedKey` (from `PskElement`) + `pmfMode`
(readOnly "required"). **No** multi-password field, **no** password-identifier field, **no**
per-key VLAN. The controller's SAE support is single-password WPA3-Personal, mirroring the
PPSK gap exactly.

## E6 — Lab-method limitation (honest, and itself informative)

The side-loaded-hostapd technique that **proved PPSK** (`AP-STA-CONNECTED keyid=…` on `wl0.4`)
**cannot** complete the SAE handshake on a spare VAP: the client's Commit reaches the air but
the foreign hostapd never logs receiving it. Cause: Broadcom `device_ap_sme=1` — the firmware
station-management entity intercepts 802.11 **AUTH management** frames on an unprovisioned VAP
and, finding no matching password of its own, drops them. PPSK survived the same trick because
its credential exchange is **EAPOL data** frames, which the firmware forwards to hostapd; SAE
Commit/Confirm are AUTH management frames, which it does not.

Consequence: the on-air **password-selection** step (AP matches `|mac=`/`|id=` and completes
4-frame SAE) is **UNVERIFIED via side-load** and can only be proven with **controller-native
SAE provisioning** (so the firmware SME routes to the real authenticator) or a standalone
hostapd owning a dedicated radio. This is not an AP limitation — controller-provisioned
`Skynet_Secure` runs the SAE-family firmware SME path today — it is a limitation of the
non-destructive side-load method, and it independently proves the controller is the necessary
place for the change.

## Cleanup / guard

Both APs returned clean: `aura_sae` process count 0, spare VAPs `bss down`, live radios
`wl0.0/wl1.0 bss up` throughout, `Skynet_PPSK` (`seccfg_00_4.cfg`) untouched. No controller
object was created or modified. Pi returned to monitor-default.
