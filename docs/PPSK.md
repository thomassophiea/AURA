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

Configure ▸ **Private Pre-Shared Key** (`configure-ppsk`), built to match the golden
EP1 "Pre-Shared Keys" design:

- **DECOUPLED banner** — states that a key is an independent object (may reference a
  Role, never owned by one) with live **Global / Site-bound / Stored-locally** counts.
- **Status filter pills** — All · Active · Paused · Expired · Site-bound · Global, with
  counts. *Paused* = disabled; *Expired* = past `expiresAt`; both derived, not stored.
- **Grid** — Key Name, Key Description, Email, Passphrase, Usage, SSID, VLAN ID, Role,
  Status. `VLAN ID`/`Role` render *WLAN default* (italic) when unset.
- **Toolbar** — Filter · Reveal Passphrases (bulk, via the audited reveal path) · Audit
  Trail · Import (CSV) · Export (CSV) · wpa_psk_file preview · Delete · Add Key.
- **Add / Edit Key modal** — KEY IDENTITY (name, description, owner email) · SCOPE
  (Global / Bind to Sites / Bind to Site Groups) · NETWORK (SSID filtered to Private-PSK
  WLANs from the controller, VLAN, Role) · USAGE (Multiple users, or Single user bound to
  the first device or a specified MAC) · CREDENTIAL (passphrase, reveal/generate, notify).
- **Import** parses `name, ssid, passphrase, vlan_id, mac, usage, role, email,
  notify_on_create_or_edit` and bulk-creates through the audited API; a sample CSV is
  downloadable. **Export** writes the same shape (passphrases only when Reveal is on).
- **Audit Trail** lists every `ppsk.*` action (who, when, which keyid) — never a passphrase.

Marked *Experimental* because controller-driven provisioning is not yet available; the
`wpa_psk_file` preview is the out-of-band path.

## Applying it out of band (lab runbook)

Until the controller emits the key file, `scripts/ppsk-provision-lab.sh` is the
concrete "apply out of band" path — the repeatable form of the hardware proof.
It side-loads a second hostapd on a **spare, controller-unused VAP** (e.g.
`wl0.4`), so it never touches the live controller-managed BSSes, and refuses any
VAP that is not a spare `down` interface. **Lab only** — a controller re-sync
will not touch the spare VAP, but this is not a production path.

```bash
# 1. Render the key file from AURA (operator token; see docs/PPSK_HARDWARE_FINDINGS.md)
curl -s "$AURA/api/v1/ppsk/keyfile?ssid=Aura-PPSK-Lab" \
  -H "Authorization: Bearer $TOK" -H "X-Controller-URL: $CTRL" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["content"])' > aura.psk

# 2. Provision to a lab AP (spare VAP, channel-matched to the live radio)
scripts/ppsk-provision-lab.sh --ap 192.168.100.141 --pass '<ap-pw>' \
  --ssid Aura-PPSK-Lab --keyfile aura.psk --iface wl0.4

# 3. Join from a client with any key in the file; read the matched identity
ssh admin@192.168.100.141 'grep AP-STA-CONNECTED /tmp/aura_ppsk.log'
#   → AP-STA-CONNECTED <mac> keyid=Thomas-Test

# 4. Revoke: disable the key in AURA, re-render, re-push, reload
ssh admin@192.168.100.141 'kill -HUP $(pgrep -f aura_ppsk.cfg)'

# 5. Tear down (leaves the AP pristine; asserts the live radio is untouched)
scripts/ppsk-provision-lab.sh --ap 192.168.100.141 --pass '<ap-pw>' --teardown --iface wl0.4
```

The script prints the live radio's station count before and after bring-up so an
operator can confirm the production BSSes were undisturbed.

## Tests

- `server/ppsk/pmk.test.js` — crypto vectors, validation, key-file rendering.
- `server/ppsk/ppskRouter.test.js` — RBAC, 400/409/501/503, honest enforcement,
  in-process HTTP driver with an injected store.
- `server/ppsk/ppskStore.db.test.js` — real-PostgreSQL integration (encryption at
  rest, `(ssid, keyid)` unique constraint, the enabled/unexpired key-file filter).
  Runs only with `TEST_DATABASE_URL` set; **skips loudly** otherwise, so a green
  run without it never implies the SQL was checked.
