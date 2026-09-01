# Private SAE — required Campus OS enhancement

**Date:** 2026-09-01 · This is the platform dependency for Option C. The **AP needs nothing new**
(hardware-proven: `evidence/`, E1/E2). Everything below is **controller-side** config-generation,
distribution, and telemetry — the same class of gap as PPSK (`PPSK_HARDWARE_FINDINGS.md`), one
protocol generation forward. Relates to epic [[NVO-8110 PPSK]] in the Ascend vault.

## R1 — Emit a per-key SAE credential set (not a single PSK)

Today the controller renders `WpaSaeElement` as one `enc_wpa_passphrase`-equivalent
`sae_password`. Required: for a WLAN in **Private SAE** mode, render a **set** of `sae_password`
lines to the AP authenticator (a `sae_password_file`, mirroring `wpa_psk_file`):

```
sae_password=<passphrase>|mac=<STA-MAC>|vlanid=<N>|id=<keyid>
sae_password=<enrollment-passphrase>|vlanid=<quarantine-vlan>     # wildcard, optional
```

- `mac=` is the **selector** (the AP picks the password by station MAC pre-Commit). This is the
  primitive the AP binary already carries (`Failed/Assigned VLAN ID %d from sae_password`, E1).
- `vlanid=` gives per-credential VLAN with **no RADIUS** (proven-present directive).
- `id=` optional; **not** relied upon (no client support — protocol analysis). Include only for
  diagnostics/future.
- Passphrase is plaintext in the file (AP derives PT). Store recoverably-encrypted in Aura.

**API shape (new):** extend the security element or add a sibling to `WpaSaeElement`, e.g.
`WpaSaePrivateElement { mode: "private-sae", credentials: [{ keyid, passphrase, mac?, vlanId?,
expiresAt? }], enrollment?: {...} }`, plus a `PATCH` to add/revoke individual credentials without
rewriting the WLAN.

## R2 — Reload on change, without dropping unaffected stations

On credential add/revoke/rotate: re-render the file and reload the authenticator
(`hostapd_cli reload` / SIGHUP — proven to disassociate only the affected station for PPSK).
Add/rotate must be **make-before-break**; revoke must disassociate the target immediately.

## R3 — Report the matched identity back to the client record

The AP knows the matched `keyid`/credential on `AP-STA-CONNECTED`. The controller must surface it
in the station/accounting record's `userName` (or a dedicated `keyid` field). Aura already maps
Clients ▸ Username → station `userName`, so this lights up identity **with zero Aura changes**
(the PPSK observed-identity bridge, `0016`, is the stopgap until this ships).

## R4 — Selector population: MAC binding from enrollment or RADIUS

The controller needs one of these to obtain the MAC→credential binding (Aura owns the source):

- **(preferred) Controller-pushed bindings:** Aura sends `{keyid, passphrase, mac?, vlanId}`;
  controller renders `mac=` lines. MAC is learned at enrollment (Aura-driven) and pushed as a
  binding update. Unknown MAC → wildcard enrollment entry (quarantine) or deny.
- **(alternative) RADIUS MAC-Auth pre-Commit:** controller does a MAB Access-Request keyed on STA
  MAC and consumes a returned `sae_password` before its Commit (the Cisco/Mist shape). Requires
  the AP to accept a RADIUS-supplied SAE password pre-handshake — a larger AP/controller change
  than R1. Document as Phase 2.

## R5 — Distribution, scope, and fail-safe (from the threat model)

- Push the credential set to **every AP running the WLAN** and **both HA gateways**, scoped by
  Site/Site-Group/Gateway (reuse existing targeting). Blast radius = one scope, not the org.
- Key file is a **crown-jewel artifact**: tmpfs, 0600, wiped on WLAN teardown, **never** in a
  config backup or export.
- **Revocation propagation with ack:** a credential is only "revoked" once every AP acks the
  reload. Flush PMKSA/FT cache on revoke (or a roamed station rides the cache past revocation).
- **Max-offline TTL:** a partitioned AP that cannot reach the controller for T must **fail closed**
  (stop honoring the key set) rather than serve possibly-revoked credentials. This is the single
  most important safety requirement (threat model residual #1).

## R6 — Telemetry / operational

Per-credential: last-auth time, bound MAC(s), AP/site, active-session count, revoke-ack status per
AP. Anti-clogging counters exposed for DoS visibility. All secret-free.

## Acceptance criteria (what "supported" means — brief rules 7–8)

A Campus OS build satisfies this **only when all hold on real hardware**, not on schema acceptance:

1. A Private-SAE WLAN with ≥ 2 credentials is provisioned by the controller; the AP file shows
   multiple `sae_password` entries. *(config plane — provable now via API once R1 exists)*
2. Two stations, each with a different credential, both associate via SAE on the **same WLAN**;
   `AP-STA-CONNECTED` shows the correct `keyid` per station. *(the L1 test that side-load can't do)*
3. Each station lands on its credential's `vlanid` (`Assigned VLAN ID … from sae_password`).
4. It works on a **6 GHz** radio (SAE + H2E + PMF), with clients using randomized MACs, no client
   config beyond a normal SAE password.
5. Revoking one credential disassociates only that station and is refused on re-auth; other
   credentials keep working; every AP acks; a partitioned AP fails closed after the TTL.
6. The matched `keyid` reaches the client/accounting record (R3).
7. No passphrase appears in any log, backup, export, or API response outside the audited reveal.

Until (2)–(6) are demonstrated on hardware, the capability is **UNVERIFIED** and Aura must present
Private SAE as a controller dependency, exactly as PPSK presents `enforcement.applied=false`.
