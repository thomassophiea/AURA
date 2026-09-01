# Skynet_PSAE — live per-user WPA3-SAE demo, proven on hardware

**Date:** 2026-09-01 · This closes lab item **L1** (on-air per-user SAE selection) that the
Broadcom side-load could not complete. No passphrases appear below (`<REDACTED>`); hostapd `-dd`
emits `[REMOVED]` for SAE key material.

## Topology (isolated from the PPSK demo by design)

```
   Skynet_PPSK  (WPA2 PPSK, UNTOUCHED)            Skynet_PSAE  (WPA3-SAE, this demo)
   ├─ Extreme AP5020 .141  wl0.4 wpa_psk_file     WLAN Pi Pro (MT7921, mac80211)
   └─ Extreme AP5020 .142  wl0.4 wpa_psk_file      = hostapd 2.11 (CONFIG_SAE), ch6
                                                    + dnsmasq DHCP 192.168.90.0/24 + NAT→eth0
        (Campus Controller APs, no controller       client: macOS en1, PRIVATE (randomized) MAC
         writes tonight — PPSK demo safe)
```

The SAE AP runs on the WLAN Pi's MT7921 (mac80211 stack, "Device supports SAE with
AUTHENTICATE command") — no Broadcom `device_ap_sme=1` AUTH-frame interception, so the full
4-frame SAE completes. The Campus Controller APs were **not** reconfigured, so the hand-injected
`wpa_psk_file` powering the Skynet_PPSK demo is intact (verified byte-identical: 13-line psk file,
`hostapd0` up, `wl0.4 bss up` on both .141 and .142, before and after).

## Why the Pi, not an Extreme AP, for the SAE AP

Side-loading SAE onto a controller-managed Broadcom VAP fails (AUTH mgmt frames are swallowed by
the firmware SME — see `sae-hardware-evidence-2026-09-01.md` E6), and provisioning Skynet_PSAE on
the controller would regenerate the APs' seccfg and **wipe the PPSK injection**, breaking today's
PPSK demo. The Pi is the safe, isolated way to prove per-user SAE on real silicon with a real
native client. On a shipping deployment the AP is the Campus OS AP and the controller emits the
same `sae_password` file (requirements R1–R6) — the Pi stands in for that not-yet-built controller
step only.

## Credential set on the AP (the exact Aura artifact shape)

```
sae_password=<REDACTED>                              # Aura-Enroll : wildcard enrollment
sae_password=<REDACTED>|mac=b2:41:08:ca:20:f0        # Aura-Alpha  : bound to the client's private MAC
sae_password=<REDACTED>|mac=00:11:22:33:44:55        # Aura-Bravo  : bound to a DIFFERENT MAC
```

No `|id=` (SAE Password Identifier) — see the negative finding below. This is exactly what
AURA's `GET /api/v1/private-sae/keyfile` now renders (native-safe, keyid as a comment).

## Results — all on real hardware, native macOS client, randomized MAC

| # | Step | Client presents | MAC (private) | Result | Evidence |
|---|---|---|---|---|---|
| 1 | **Enrollment** | Aura-Enroll (wildcard) | `b2:41:08:ca:20:f0` | **connected** | `SAE ... status=126 (SAE_HASH_TO_ELEMENT)` → `RX confirm status=0 (SUCCESS)` → `association OK (aid 1)` → `AP-STA-CONNECTED b2:41:08:ca:20:f0` |
| 2 | **Per-user join (bound cred)** | Aura-Alpha (bound to this MAC) | `b2:41:08:ca:20:f0` | **connected + IP + internet** | `AP-STA-CONNECTED` + DHCP lease `192.168.90.127` + `internet via en1: REACHABLE` |
| 3 | **Wrong credential** | WrongPass | `b2:41:08:ca:20:f0` | **rejected** | no `RX confirm SUCCESS`, no `AP-STA-CONNECTED`; station torn down |

Row 2 is the headline: **a native macOS client, using a randomized/private MAC, completed
WPA3-SAE (H2E, PMF) with a per-user credential bound to that MAC, got an address and internet.**
That is Private SAE working end-to-end. Row 3 shows SAE integrity: a bad credential cannot
authenticate. The MAC `b2:` has the locally-administered bit set — a randomized MAC that was never
disabled and was learned only at enrollment.

## The decisive negative finding (confirms the whole thesis)

With `|id=<keyid>` (SAE Password Identifier) on the bound entry, macOS repeatedly completed **SAE
authentication** (`RX confirm status=0`) but then **failed at association** with err **-3912** and
never reached `AP-STA-CONNECTED`. Removing `|id=` — pure MAC binding — connected cleanly and
immediately. This is exactly what the client-support research predicted: **no native client can
use a Password Identifier**, and advertising one breaks native association. It is why the AURA
keyfile renderer now omits `id=` by default (`fix(private-sae): sae_password file is
native-client-safe`). MAC binding is the mechanism that works with native clients; identifiers are
not.

## Randomized-MAC survival, observed

The macOS client presented a per-SSID **private MAC** for Skynet_PSAE (`b2:41:08:ca:20:f0`,
distinct from its hardware/other-SSID MAC). Enrollment bound *that* MAC; the per-user join
selected the credential by *that* MAC. Identity lived in the credential + enrollment record; the
randomized MAC was simply the cache key — never disabled, never the identity. This is the
randomized-MAC requirement satisfied on real hardware.

## PPSK guard (before and after)

`.141` and `.142`: `wpa_psk_file=/tmp/skynet_ppsk.psk` present, 13 lines, `hostapd0` running,
`wl0.4 bss up`, live Skynet station counts normal (4 / 3). No controller object created or
modified. Skynet_PPSK demo is safe.

## Reproduce / tear down

Bring-up scripts (scratchpad, secrets are lab-only test values):
`pi-ap5.sh` (AP), `psae-noid.sh` (native-safe bound set), NAT+dnsmasq block above.
Tear down: `sudo pkill -f 'hostapd.*psae.conf'; sudo pkill dnsmasq; sudo iptables -t nat -F;
sudo ip addr flush dev wlan0`, then `wlanpi ssh 'sudo wlanpi-kit restore'` to return the Pi to
sensor mode. The Extreme APs need no cleanup — they were never touched.
