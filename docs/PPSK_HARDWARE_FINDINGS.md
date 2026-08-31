# Campus OS PPSK / MPSK — Hardware Verdict and the Exact Gap

**Date:** 2026-08-31 · **Author:** engineering investigation (Red Queen / ArchAngel)
**Hardware:** Extreme **AP5020-WW** (`CV012408S-C0102`, board `mapleleaf`), firmware
**10.20.1.0-020R**, `identifi` personality, adopted by the lab Campus Controller
(VE6120, 10.20.01.0024) at `192.168.100.12`.
**Client:** macOS, per-SSID randomized MAC `B6:11:D3:DD:F7:EC`.
**Raw log:** `docs/ppsk-evidence/ppsk-hardware-evidence-2026-08-31.txt`.

---

## TL;DR

True key-derives-identity PPSK **works on the Campus OS AP dataplane today** — it was
proven on real hardware. The **only** missing piece is the Campus OS **controller's WLAN
config generator**: it emits a single static PSK per WLAN and never emits the per-key
directive the AP's own authenticator already supports. This is a controller-side config
feature, not an AP firmware limitation and not a protocol impossibility.

- **Outcome achieved:** the acceptance test — one WPA2-Personal SSID, multiple keys, a
  never-registered client whose identity is set by the *key* — passed on an Extreme AP.
- **Gap proven:** the controller does not drive that AP capability. See
  [The exact gap](#the-exact-gap) and [Required Campus OS enhancement](#required-campus-os-enhancement).

The build did **not** fake PPSK behind a shared PSK, did not pre-register a MAC, and did
not call PSK+MBA "PPSK". Every claim below has a timestamped AP log line behind it.

---

## What was proven, on hardware

A dedicated test BSS `Aura-PPSK-Lab` (WPA2-Personal / CCMP) was stood up on a **spare,
controller-unused VAP (`wl0.4`)** on the live AP, running a second `hostapd` instance with
a two-entry `wpa_psk_file`. The four live Skynet BSSes on the same radio were never
touched (verified before/after: `wl0.0 isup=1 sta=5` throughout). The key file:

```
keyid=Thomas-Test   00:00:00:00:00:00  Thomas-7284
keyid=Printer-Test  00:00:00:00:00:00  Printer-3829
```

`00:00:00:00:00:00` is a **wildcard MAC** — "any station may present this key." No MAC is
bound in advance; the key alone selects the identity.

### Acceptance matrix — all passed

| # | Action | Key presented | AP result | Log evidence |
|---|---|---|---|---|
| 1 | Client joins | `Thomas-7284` | identity **Thomas-Test** | `AP-STA-CONNECTED b6:11:d3:dd:f7:ec keyid=Thomas-Test` |
| 2 | **Same device** forgets, rejoins | `Printer-3829` | identity **Printer-Test** | `AP-STA-CONNECTED b6:11:d3:dd:f7:ec keyid=Printer-Test` |
| 3 | Key B revoked (removed from file, `SIGHUP` reload), client retries | `Printer-3829` | **rejected** | `wpa_verify_key_mic mic mis-match` → `WPA_PTK entering state DISCONNECT` |
| 4 | Valid key after revocation | `Thomas-7284` | still connects | `AP-STA-CONNECTED b6:11:d3:dd:f7:ec keyid=Thomas-Test` |

Row 2 is the definitive result: **identical physical device, identical (randomized) MAC,
identity flipped purely because the key changed.** Row 4 confirms revoking one key does not
disturb another. The MAC's locally-administered bit is set (`B6` → `0xB2` bit), i.e. it is
a randomized MAC that was never registered anywhere — killing any "it's secretly
MAC-auth" objection.

### The mechanism (why it is genuine MPSK, not a trick)

The AP log shows `hostapd` **iterating candidate PSKs against the 4-way-handshake MIC**:

```
WPA: <mac> WPA_PTK entering state INITPSK
Searching a PSK for <mac> prev_psk=(nil)      ← try first key file entry
...
Searching a PSK for <mac> prev_psk=0x16bd4d4  ← MIC didn't match, advance to next entry
wl0.4: STA <mac> WPA: sending 3/4 msg of 4-Way Handshake   ← a PMK matched
AP-STA-CONNECTED <mac> keyid=Thomas-Test                    ← matched entry's identity tag
```

The client never transmits its passphrase. The AP derives a PMK per candidate key
(`PBKDF2-HMAC-SHA1(passphrase, SSID, 4096, 256)`), tests each against the MIC in EAPOL 2/4,
and the entry that verifies **is** the identity. That is exactly **Model B** ("candidate PMK
set") from the brief, running natively in the AP authenticator. On revocation the removed
key simply has no entry left, so its MIC never verifies — Row 3's `mic mis-match`.

---

## The exact gap

The AP is capable. The controller does not use the capability. Both halves proven:

**1. The AP firmware supports true PPSK.** `hostapd v2.10-MLO` on the AP:
- The config parser **accepts** `wpa_psk_file` and `wpa_psk_radius` cleanly (parse test
  reached driver init with no "unknown configuration item").
- The binary carries the **runtime** per-key code path, including per-key VLAN assignment:
  `Assigned VLAN ID %d from wpa_psk_file to <mac>`, `unknown wpa_psk_radius`,
  `invalid hex string in Tunnel-Password`, `radius_das_*` (CoA/DAS).
- Live proof above.

**2. The controller emits only a single static PSK.** The controller-generated hostapd
configs actually running on the AP (`/tmp/seccfg_*.cfg`) show, for **every** WPA2-Personal
WLAN (Skynet, Skynet_Junior, Skynet_Guest):

```
wpa_key_mgmt=WPA-PSK
enc_wpa_passphrase=<one obfuscated value>     ← one key for the whole SSID
```

No `wpa_psk_file`. No `wpa_psk_radius`. No `auth_server_addr` on the PSK WLANs (RADIUS is
wired only on the WPA3-Enterprise `Skynet_Secure`). One WLAN = one key.

**3. Corroboration.** Extreme's own KB: PPSK is documented for **ExtremeCloud IQ /
Platform ONE** (IQ Engine family), and **not** documented for **Campus Controller / Campus
OS**, which lists only standard WPA2-Personal PSK. Matches the finding and the product-line
constraint exactly. The Ascend vault confirms **PPSK is an in-progress epic (NVO-8110)**,
GA = internal IDM, GA+ = external RADIUS/iPSK — i.e. the controller config-generation work
is scoped but not yet shipped.

### RADIUS vs. 4-way-handshake ordering (the brief's "most important test")

For the **local** `wpa_psk_file` path proven here, **there is no pre-handshake RADIUS
transaction** — identity resolves *inside* the 4-way handshake by candidate-PMK matching.
This is strictly better than a RADIUS round-trip per association and needs no external AAA
at all. For the **RADIUS** path (`wpa_psk_radius`), upstream hostapd does a MAC-auth
Access-Request *before* the handshake and consumes `Tunnel-Password` as the per-station
PSK — but that path is **MAC-keyed** (the RADIUS lookup key is the station MAC), so it
requires the MAC to be known first and therefore does **not** satisfy the "identity from the
key, MAC unknown" bar. **The local `wpa_psk_file` path is the one that meets the
acceptance criteria.** MBA on Campus OS runs *after* PSK success and cannot gate it.

---

## Required Campus OS enhancement

Smallest change that makes this a product capability, in priority order:

> **Campus OS WPA2-Personal (and WPA3-SAE) WLANs must support a per-key mode in which the
> controller provisions a set of `{identity, passphrase, keyid, role/VLAN}` entries to the
> AP authenticator as a `wpa_psk_file`, instead of a single `enc_wpa_passphrase`. The AP
> already resolves identity by candidate-PMK matching during the 4-way handshake and tags
> the station with the matched `keyid`; the controller must (a) emit the key file, (b)
> re-emit and reload (`SIGHUP` / `hostapd_cli reload`) on key add/revoke, and (c) surface
> the matched `keyid` in station/accounting records so Aura can correlate identity → MAC →
> AP → role → session.**

Design points for the controller team, each grounded in what the hardware did:

- **Source of truth:** Aura owns the `{identity, passphrase, keyid, role, VLAN, scope,
  expiry}` set; the controller renders it to `wpa_psk_file` per WLAN per Site/Gateway
  scope (reuse the existing Site-Group → Gateway targeting; do not invent a hierarchy).
- **Key format:** plaintext passphrase in the file (the AP derives the PMK). Store
  recoverable-encrypted in Aura, never a one-way hash — the file needs the actual
  passphrase. `keyid` is the identity tag returned on `AP-STA-CONNECTED`.
- **Per-key authorization:** `wpa_psk_file` supports `vlanid=` per line (proven present in
  the binary), giving per-identity VLAN with no RADIUS. Role assignment can ride the
  existing Filter-ID/role path if RADIUS is added later.
- **Revocation semantics:** remove the line and reload. Reload **disassociates** the
  affected station immediately (observed) and refuses its next handshake (`mic mis-match`).
  Other keys are unaffected (observed).
- **Scale/cache:** the key file is a local AP artifact — no per-handshake cloud dependency.
  This is the failure-resilient design; keep it. RADIUS (`wpa_psk_radius`) is a *secondary*
  mode and is MAC-keyed, so it is not a substitute for the file path.
- **Roaming / HA:** the same key file must be pushed to every AP running the WLAN and to
  both Gateways in an HA pair; `keyid` is stable across APs so session records stitch.

---

## Aura-side work (scoped, deliberately not built yet)

A full audit of the AURA repo was completed (see the investigation notes). PPSK is
greenfield there; the closest analog is `server/guests/*` (a credential-granting model that
proxies the Gateway and reports two-plane writes honestly). The clean build is well
understood: migration `0014_ppsk.sql` + lazy-ensure twin (advisory-lock key
`8270119004461014`), `server/ppsk/ppskRouter.js` (`createPpskRouter({...injectables})`,
`requireRole('operator')`, gateway-scoped auth, `audit()` on every write),
`src/components/configure/ppsk/PpskPage.tsx` from the `_kit`, and the seven-place page
registration.

**It is intentionally not built in this pass.** Building an Aura management plane for a
controller capability the controller cannot yet render would be a PPSK-looking UI backed by
nothing — exactly what the brief forbids. The Aura feature should land **together with**
the controller enhancement above, so the "Reveal/rotate/revoke" actions map to real
`wpa_psk_file` provisioning. When that lands, Aura stores the passphrase
(app-encrypted) + `keyid` + scope, renders the file to the Gateway, and reads the matched
`keyid` back from station records to populate the identity view.

---

## Reproduce

1. Log into the AP (`ap-login` skill): `admin` / lab AP password, over `sshpass`.
2. Write `/tmp/aura_ppsk.cfg` (interface = a spare VAP such as `wl0.4`, `driver=nl80211`,
   `ssid=Aura-PPSK-Lab`, `hw_mode=g`, `channel=1` to match the radio, `wpa=2`,
   `wpa_key_mgmt=WPA-PSK`, `wpa_pairwise=CCMP`, `wpa_psk_file=/tmp/aura_ppsk.psk`).
3. Write `/tmp/aura_ppsk.psk` with two `keyid=... 00:00:00:00:00:00 <passphrase>` lines.
4. `setsid sh -c 'hostapd -dd -t /tmp/aura_ppsk.cfg > /tmp/aura_ppsk.log 2>&1 &'`
5. **`wl -i wl0.4 bss up`** — required on Broadcom; hostapd's nl80211 shim enables the BSS
   administratively but the driver only puts beacons on air after this.
6. Join from a client with key A, then forget + rejoin with key B. `grep AP-STA-CONNECTED
   /tmp/aura_ppsk.log` shows the matched `keyid` per join.
7. Revoke: rewrite the psk file without key B, `kill -HUP <hostapd-pid>`, retry key B
   (rejected, `mic mis-match`), retry key A (works).

## Cleanup (already done)

`kill <hostapd-pid>` · `wl -i wl0.4 bss down` · `ifconfig wl0.4 down` · `rm -f
/tmp/aura_ppsk.*`. Verified after: no `aura_ppsk` process, `wl0.4` BSS down, live radio
`wl0.0 isup=1 sta=5` intact. Nothing was changed on the controller; no WLAN, AAA policy,
role or profile was created or modified. The test used only a spare AP VAP the controller
was not using.

## Limitations / honesty

- Proven on **one** AP model (AP5020, Broadcom, fw 10.20.1). The `wpa_psk_file` code path
  is in the shared Extreme hostapd build, but confirm on AP3xx/AP4xx before generalizing.
- The proof used a **hand-injected** key file on a spare VAP; the controller does **not**
  do this. A controller re-sync does not touch `wl0.4`, but this is a lab demonstration of
  the AP capability, not a shipped path.
- Broadcom will not beacon a VAP the controller has not provisioned until `wl bss up` is
  issued manually — a foreign hostapd cannot be silently side-loaded in production. This
  reinforces that the **controller** is the correct and necessary place for the change.
- Per-key **VLAN** (`vlanid=`) and per-key **role** were not exercised end-to-end (the test
  kept both identities on one context to avoid moving the client off its management path);
  the directive is present in the binary and is the documented next test.
