# Current PPSK Trace — how the working implementation actually resolves a key

**Date:** 2026-08-31/09-01 · **Status:** verified on hardware (see evidence links)
**Scope:** the WPA2-Personal PPSK path that is live in Aura + the lab today. This is the
baseline the Private SAE work must not break.

---

## The one-sentence answer to "where is the credential resolved?"

**On the AP, inside the 4-way handshake, by candidate-PMK matching against a local
`wpa_psk_file` — there is no RADIUS transaction anywhere in the working PPSK path.**

This matters for SAE because the entire "can the RADIUS PPSK exchange be reused for SAE?"
question dissolves: there is no RADIUS PPSK exchange to reuse. The working design is
*local key-set on the authenticator*, which is also the shape SAE would need — but SAE
changes *when* the credential must be selected (see `PRIVATE_SAE_PROTOCOL_ANALYSIS.md`).

## End-to-end sequence (observed, not inferred)

```
┌─────────┐    ┌──────────────────┐    ┌───────────────┐    ┌──────────────┐
│ Operator │    │ AURA (Railway)   │    │  AP hostapd    │    │  Client      │
└────┬────┘    └────────┬─────────┘    └───────┬───────┘    └──────┬───────┘
     │ POST /api/v1/ppsk │                      │                   │
     │──────────────────►│ ppskRouter.js        │                   │
     │                   │  validate 8–63 ASCII │                   │
     │                   │  AES-256-GCM encrypt │                   │
     │                   │  INSERT ppsk_identities (0014/0015)      │
     │                   │  audit('ppsk.create')│                   │
     │ GET /v1/ppsk/keyfile?ssid=…              │                   │
     │──────────────────►│ decrypt + render:    │                   │
     │                   │  keyid=<name> [vlanid=N] 00:00:00:00:00:00 <passphrase>
     │   (out-of-band)   │                      │                   │
     │ ppsk-provision-lab.sh ──── scp/ssh ─────►│ wpa_psk_file      │
     │                   │                      │ (spare VAP or injected seccfg) │
     │                   │                      │◄── auth/assoc ────│ (open auth)
     │                   │                      │◄── EAPOL 1/4 ─────│
     │                   │                      │─── EAPOL 2/4 ────►│ (client MIC)
     │                   │                      │ "Searching a PSK for <mac>"     │
     │                   │                      │  PMK_i = PBKDF2(pw_i, ssid)     │
     │                   │                      │  test MIC per candidate         │
     │                   │                      │─── EAPOL 3/4, 4/4 ─────────────►│
     │                   │                      │ AP-STA-CONNECTED <mac> keyid=<identity>
     │ POST /v1/ppsk/observed (collector, stopgap)                  │
     │                   │◄─────────────────────│ (hostapd -dd scrape)            │
     │                   │ Clients ▸ Username overlay               │
     │ revoke: disable key → re-render → re-push → SIGHUP           │
     │                   │                      │ next attempt: "mic mis-match" → DISCONNECT
```

## Where each piece lives

| Concern | Location | Notes |
|---|---|---|
| Data model | `server/db/migrations/0014_ppsk.sql`, `0015_ppsk_identity_fields.sql` | `ppsk_identities`: keyid, ssid, encrypted passphrase, role, vlanId, scope, enabled, expiresAt, maxDevices |
| Crypto at rest | `server/ppsk/ppskCrypto.js` | AES-256-GCM under `PPSK_ENCRYPTION_KEY`; `v1:` ciphertext only in DB |
| PMK correctness | `server/ppsk/pmk.js` | PBKDF2-HMAC-SHA1(passphrase, ssid, 4096, 256b), verified vs IEEE 802.11i H.4.2 vector |
| API + RBAC + audit | `server/ppsk/ppskRouter.js` | viewer reads, operator mutations/reveal; every write audited; honest `enforcement.applied=false` |
| Key-file render | `GET /api/v1/ppsk/keyfile?ssid=…` | exact `wpa_psk_file` format the AP consumed in the hardware proof |
| Out-of-band push | `scripts/ppsk-provision-lab.sh` | spare-VAP guard; lab-only |
| Identity readback | `server/ppsk/ppskObservedStore.js` (0016) + `scripts/ppsk-identity-collector.sh` | stopgap; keyid only visible at hostapd `-dd` |
| UI | `src/components/configure/ppsk/` | Configure ▸ Private Pre-Shared Key, marked Experimental |

## Credential artifact inventory (the brief's checklist)

- **What the store holds:** the cleartext passphrase, recoverably encrypted. Not a hash —
  the AP needs the passphrase (or PMK) to run candidates. This constraint carries over to
  SAE (the AP needs the actual password to derive PT/PWE; a one-way server-side hash is
  impossible for SAE too).
- **Who possesses the PSK at auth time:** the **AP** (plaintext file in `/tmp`, tmpfs).
  The Gateway/controller holds only its own single-PSK WLANs (`enc_wpa_passphrase`,
  obfuscated). RADIUS holds nothing; no RADIUS server participates.
- **When identity resolves:** during EAPOL 2/4 MIC verification — *after* association,
  *after* the client has committed to the handshake. Cheap per-candidate check (one PRF +
  HMAC per candidate against a message already in hand). **This is the property SAE does
  not have** — see the protocol analysis.
- **MAC's role:** none in selection. `00:00:00:00:00:00` wildcard entries; MAC is recorded
  operationally (session records) only. Proven with a randomized MAC that flipped identity
  purely by key (`PPSK_HARDWARE_FINDINGS.md`, acceptance row 2).
- **Revocation:** remove line → SIGHUP → live station disassociated, next attempt fails
  `mic mis-match`; other keys unaffected. Observed.
- **Controller involvement:** zero at auth time. The controller's only (missing) job is
  config distribution — it still emits one `enc_wpa_passphrase` per WLAN and never
  `wpa_psk_file` (verified again 2026-08-31 on AP5020 `/tmp/seccfg_*.cfg`).

## RADIUS, for completeness

The AP's hostapd carries `wpa_psk_radius` (MAC-keyed Access-Request before the handshake,
`Tunnel-Password` as per-station PSK). It is **not used** by the working PPSK path and
**cannot** meet the randomized-MAC requirement, because the lookup key is the MAC itself.
Any SAE design that "just uses RADIUS like PPSK" would inherit that MAC dependence — and
the working PPSK doesn't even use RADIUS. Both reasons independently kill that route.

## Evidence

- `docs/PPSK_HARDWARE_FINDINGS.md` — full hardware verdict + acceptance matrix
- `docs/ppsk-evidence/ppsk-hardware-evidence-2026-08-31.txt` — raw AP log
- `docs/PPSK.md` — management-plane design, in-band vs out-of-band provisioning
- Live state re-verified 2026-08-31 23:14: `Skynet_PPSK` running from injected
  `seccfg_00_4.cfg`/`seccfg_01_4.cfg` with `wpa_psk_file=/tmp/skynet_ppsk.psk` (13 lines)
  on AP 192.168.100.141 — untouched by this investigation.
