# PPSK / MPSK — private pre-shared keys

AURA owns the PPSK identity lifecycle for a WPA2-Personal WLAN: many keys on one
SSID, where **the key determines the identity** — no MAC pre-registration. The
Campus OS AP enforces it by matching the presented key against the 4-way-handshake
MIC in a `wpa_psk_file` and tagging the station with the matched `keyid`. That
mechanism was proven on real hardware; see `docs/PPSK_HARDWARE_FINDINGS.md`.

```
Operator ── AURA (this feature) ─────────────────────────────► identity lifecycle
                 │  create / rotate / enable / disable / revoke
                 │  passphrase stored AES-256-GCM encrypted
                 ▼
           wpa_psk_file  (rendered by /v1/ppsk/keyfile)
                 │  keyid=<identity> [vlanid=N] 00:00:00:00:00:00 <passphrase>
                 ▼
     Campus OS AP hostapd ── candidate-PMK match on the 4-way handshake
                 │  AP-STA-CONNECTED <mac> keyid=<identity>
                 ▼
              Station gets identity + role/VLAN from the matched key
```

## Status: experimental — one honest gap

The AP dataplane is ready. The **Campus OS controller does not yet emit the key
file** (it renders a single static PSK per WLAN). So this feature manages
identities and renders the exact `wpa_psk_file` to push, but the last mile —
controller provisions + reloads the AP — is not automated. The UI says so:

- Every enable/disable/delete returns an `enforcement` object with
  `attempted: false, applied: false` and a reason. AURA never claims a key is
  live on the gateway when it is not.
- `GET /v1/ppsk/keyfile?ssid=…` returns `provisioning.supported: false`. An
  operator can copy the rendered file and apply it out of band (exactly how it
  was proven in the lab) until the controller enhancement ships.

The controller change required is specified in `docs/PPSK_HARDWARE_FINDINGS.md`.

## Data model

AURA-owned Postgres table `ppsk_identities` (migration `0014_ppsk.sql`, lazy-ensure
twin in `server/ppsk/ppskStore.js`, advisory-lock key `8270119004461014`). A PPSK
identity is **operational** data, not personal — always kept. The passphrase is
stored **recoverably encrypted** (the AP needs the plaintext to derive the PMK, so
a one-way hash is impossible), AES-256-GCM under `PPSK_ENCRYPTION_KEY`.

| Field | Meaning |
|---|---|
| `name` → `keyid` | identity tag the AP echoes on connect |
| `ssid` | the WPA2-Personal WLAN; the PMK is bound to it |
| `passphrase` | 8–63 printable-ASCII chars; encrypted at rest, revealed only via the audited path |
| `role`, `vlanId` | per-key authorization; `vlanId` becomes `vlanid=` in the key file |
| `scope` / `scopeRef` | global \| site-group \| site \| gateway (reuses AURA's targeting) |
| `enabled`, `expiresAt`, `maxDevices` | lifecycle |

## API (`/api/v1/ppsk`)

Reads require **viewer**; mutations and passphrase reveal require **operator**,
validated against the named gateway. Every mutation is audited (`ppsk.create`,
`ppsk.update`, `ppsk.enable`, `ppsk.disable`, `ppsk.delete`, `ppsk.reveal`,
`ppsk.keyfile.render`). Passphrases never appear in the list, a log line, or the
JS bundle — only through `GET /v1/ppsk/:id/reveal`.

- `GET /v1/ppsk[?ssid=]` · `POST /v1/ppsk` · `GET|PUT|DELETE /v1/ppsk/:id`
- `POST /v1/ppsk/:id/enable` · `/disable` — returns honest `enforcement`
- `GET /v1/ppsk/:id/reveal` — decrypts one passphrase (audited)
- `POST /v1/ppsk/generate` — secure passphrase, no persistence
- `GET /v1/ppsk/keyfile?ssid=…` — render the `wpa_psk_file` (operator)

Without `PPSK_ENCRYPTION_KEY`, create/reveal return **501 NOT_CONFIGURED**;
without a database, everything returns **503**. Reads still work in both cases
where they can.

## Crypto correctness

`server/ppsk/pmk.js` derives the PMK as `PBKDF2-HMAC-SHA1(passphrase, ssid, 4096,
256 bits)`, verified against the IEEE 802.11i Annex H.4.2 reference vector
(`("password","IEEE")` → `f42c6fc5…9710a12e`). Passphrase generation is
rejection-sampled from an unambiguous alphabet. See `server/ppsk/pmk.test.js`.

## UI

Configure ▸ **Private Pre-Shared Key** (`configure-ppsk`) — a `ResourceGridPage`
of identities (create / edit / enable-disable / delete / reveal / generate) plus a
**wpa_psk_file** preview dialog per SSID. Marked *Experimental* in the header
because provisioning is not yet controller-driven.
