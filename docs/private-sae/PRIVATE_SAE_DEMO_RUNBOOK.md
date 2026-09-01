# Private SAE + PPSK — coexistence demo runbook

**Date:** 2026-09-01 · Two private-identity Wi-Fi networks side by side: **Skynet_PPSK**
(WPA2 PPSK, the existing demo, on the Extreme APs) and **Skynet_PSAE** (WPA3-SAE per-user, on the
WLAN Pi). They are deliberately on separate hardware so the SAE work cannot disturb the PPSK demo.

## The story to tell

- **Skynet_PPSK** — WPA2-Personal, per-user identity by key (the AP matches the presented key
  during the 4-way handshake). Works today on 2.4/5 GHz. Not permitted on 6 GHz (WPA2 is banned
  there).
- **Skynet_PSAE** — WPA3-Personal (SAE), per-user identity by credential + MAC enrollment. This is
  the 6 GHz-capable successor: SAE + H2E + PMF. Same "one SSID, a unique credential per user" idea,
  carried onto the band where WPA2 is illegal.
- **One customer, both** — legacy/IoT clients stay on Skynet_PPSK; modern clients move to
  Skynet_PSAE. AURA manages the credential lifecycle for both from one place.

## What is live right now

- **Skynet_PSAE** is up on the WLAN Pi (`192.168.100.113`), 2.4 GHz ch6, WPA3-SAE (hostapd 2.11),
  with DHCP (`192.168.90.0/24`) and internet via NAT. Credentials loaded: a wildcard **enrollment**
  key and a per-user key **bound to the demo Mac's private MAC**.
- The macOS demo client is connected to Skynet_PSAE with a **randomized MAC**, an IP, and internet.
- **Skynet_PPSK** is untouched on the Extreme APs.

## Live demo steps

1. **Show both SSIDs.** On a phone/laptop Wi-Fi list, point out Skynet_PPSK (WPA2) and Skynet_PSAE
   (WPA3). Optional: `wlanpi scan` from another machine shows both with their security types.
2. **Join Skynet_PSAE as a new user (enrollment).** On a client with a **private/random MAC left
   on**, pick Skynet_PSAE, enter the enrollment passphrase → it connects (full WPA3-SAE, H2E, PMF).
   This is a user onboarding with a shared enrollment key.
3. **Show the identity is the credential, not the MAC.** The client used a randomized MAC; AURA
   binds *that* MAC to the user's credential at enrollment. Show the binding in
   Configure ▸ Private SAE ▸ (credential) ▸ Bound Devices.
4. **Per-user credential.** Hand the demo Mac its own credential (Aura-Alpha). It reconnects and
   the AP selects that credential by the Mac's MAC — unique identity on the shared SSID.
5. **Security.** Enter a wrong passphrase → rejected (SAE, no shared-key fallback).
6. **Revoke.** Disable the credential in AURA → re-render the sae_password file → the user is off;
   everyone else stays on. (On a shipping Campus OS AP this is a controller push + reload; in the
   lab it's a hostapd reload with the AURA-rendered file.)

## AURA side (Configure ▸ Private SAE (WPA3))

The management plane is built and flag-gated (`PRIVATE_SAE_ENABLED`). It mirrors PPSK:
create/rotate/enable/disable/revoke credentials, enroll a device (bind a MAC), and render the
**sae_password file** (the exact artifact the AP consumes). It reports honestly that controller
auto-provisioning is not yet available (`enforcement.applied=false`,
`provisioning.supported=false`) — the file is applied out of band today, exactly as PPSK is.

**Important:** the rendered file uses **pure MAC binding, no SAE Password Identifier** — proven on
hardware to be the only form native clients accept (`evidence/psae-live-demo-2026-09-01.md`).

## Do NOT (protects the PPSK demo)

- Do **not** create/modify Skynet_PSAE (or any WLAN) **on the Campus Controller** for the APs
  running PPSK — a config regen wipes the hand-injected `wpa_psk_file` and breaks Skynet_PPSK. The
  SAE demo lives on the Pi precisely to avoid this.
- Do **not** touch `wl0.4` / `/tmp/skynet_ppsk.psk` / `seccfg_00_4.cfg` on `.141`/`.142`.

## Bring it back up (if the Pi rebooted)

```
# on the Mac (drives the Pi over SSH):
scp .../scratchpad/pi-ap5.sh  wlanpi@192.168.100.113:/tmp/     # base AP (enrollment key)
scp .../scratchpad/psae-noid.sh wlanpi@192.168.100.113:/tmp/   # bound per-user set (native-safe)
ssh wlanpi@192.168.100.113 'nohup bash /tmp/psae-noid.sh >/dev/null 2>&1 &'
# then re-apply NAT+dnsmasq (see evidence doc), and join the client to Skynet_PSAE.
```

The SAE-capable hostapd is built at `/tmp/hostapd-2.11/hostapd/hostapd` on the Pi (the packaged
one is SAE-stripped). If `/tmp` was cleared, rebuild with `/tmp/build-hostapd.sh`.
