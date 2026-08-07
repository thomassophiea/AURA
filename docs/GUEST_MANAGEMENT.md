# Guest management

AURA is the management plane for guests of the **AURA-CWP** captive web portal.
It owns none of the data: the portal's database says who *may* connect, the
gateway says who *is* connected, and AURA joins the two and applies operator
intent to both.

```
AURA UI  (Clients → Guest Users)
   │
   ▼
AURA backend   /api/v1/guests
   ├── OS-ONE-CWP  /api/internal/guests   (Railway private network)
   │        └── PostgresCWP — authorization ledger + portal session history
   └── XCC gateway /v1/stations           (live association, role, IP)
```

## Why the portal keeps its data

PostgresCWP belongs to OS-ONE-CWP, which owns its Prisma schema and runs its
migrations. AURA reaches guest data through that service's REST surface rather
than by opening a second connection to its database, for two reasons:

1. A direct connection would make AURA a silent second writer against a schema
   it does not own — every portal migration would be a potential AURA outage.
2. The portal-side rules cannot be enforced from outside it. The portal decides
   whether to show the consent form, and it must consult the ledger while
   handling a signed redirect. That logic has to live where the redirect lands.

The AURA database is untouched by this feature — no new tables, no new columns.

## Data model (PostgresCWP)

`GuestAuthorization` is the standing answer to "may this device use the guest
network?", one row per station MAC.

| Field | Meaning |
|---|---|
| `macAddress` | canonical `aa:bb:cc:dd:ee:ff`, unique |
| `source` | `CAPTIVE_PORTAL` \| `MANUAL` \| `GATEWAY` |
| `status` | `ACTIVE` \| `REVOKED` \| `EXPIRED` |
| `displayName`, `email`, `phone`, `notes` | identity, when there is any |
| `ssid`, `wlan`, `gatewayHost`, `apName`, `apSerial`, `siteId` | last portal-observed context |
| `firstSeen`, `lastSeen`, `authorizedAt`, `expiresAt`, `revokedAt`, `revokedBy` | lifecycle |
| `lastSessionId` | most recent portal visit |

`GuestSession` is unchanged — it remains the per-visit audit record — except
that `SessionStatus` gained `REVOKED`.

**Expiry is derived, never a job.** A row whose `expiresAt` has passed reads as
`EXPIRED` whether or not anything has swept it. `markExpired()` exists so the
stored value catches up; nothing depends on it having run.

### Identity

This portal collects no name or email, so the MAC **is** the guest identifier
and the UI says so ("Unnamed guest") rather than inventing one. The schema
carries `displayName` / `email` / `phone` so that stops being true the day the
portal starts asking.

## Authorization semantics

| Source | Portal behaviour on redirect |
|---|---|
| `MANUAL`, `ACTIVE` | consent form **skipped**; the signed `/ext_approval.php` URL is issued immediately |
| `CAPTIVE_PORTAL`, `ACTIVE` | consent form shown as before |
| any, `REVOKED` | refused at `/portal/error?code=revoked`, before a session is minted |
| no record | consent form shown as before |

A guest who consented last week still sees the terms on their next visit. The
consent record is per-visit and is the point of the portal; turning a past visit
into a standing bypass would quietly retire it. Only an operator vouching for a
device skips it.

## Determining "Connected Now"

Not "a recent row exists". The gateway's `GET /v1/stations` is fetched **once**
for the whole controller — never once per guest — and memoised for 5 seconds, so
a table of a hundred guests, the summary, and a detail view share one round-trip.
A station present and not `INACTIVE` is connected.

When the gateway cannot be reached, connection is reported as `unknown` and
`connectedNow` is `null`. A zero would be a claim that nobody is on the network,
which is a different and false statement.

## Granting and withdrawing on the gateway

The ECP approval callback can only be fetched by the station's own browser
(`hwc_ip` is intercepted on the wireless link — see `docs/ECP_PROTOCOL.md` in
OS-ONE-CWP), so AURA cannot replay it. It uses the gateway's own API instead,
which reaches the same end state:

| Action | Gateway calls |
|---|---|
| Add a guest who is already associated | `POST /v1/stations/assignrole` → the WLAN's `authenticatedUserDefaultRoleID` |
| Add a guest who is not associated | none; the portal approves it on arrival |
| Revoke | `assignrole` → the WLAN's pre-auth role, then `POST /v1/stations/disassociate` |

Both endpoints answer **200 with a zero-length body**. Parsing that as JSON
reports a completed action as failed, which is worse than the action failing —
an operator would retry, or believe access was still granted. `postAction()`
in `server/guests/gatewayStations.js` exists for that reason.

The portal record is written **before** the gateway is touched, so a failure
halfway leaves the guest blocked rather than still authorized. What the gateway
did is reported in `activation` / `enforcement` rather than folded into a
success/failure boolean.

## REST API

All routes validate the caller's token against the gateway named in
`X-Controller-URL`, the same policy the monitoring API uses. A bearer header
alone is not enough: these endpoints grant and withdraw network access.

```
GET    /api/v1/guests            ?status= &search= &start_time= &end_time= &limit= &cursor=
GET    /api/v1/guests/summary
GET    /api/v1/guests/{id}
POST   /api/v1/guests            { mac_address, display_name?, notes?, duration_minutes? }
POST   /api/v1/guests/{id}/revoke
DELETE /api/v1/guests/{id}
```

`status` takes the UI vocabulary: `connected`, `authorized`, `disconnected`,
`expired`, `revoked`, `manually_added`, `failed`. An unknown value is a 400 —
ignoring it would hand back the unfiltered list, which reads as "there are none"
to a caller who asked for exactly those.

`DELETE` deletes only an entry no device has ever used; anything with history is
revoked instead, and the response says which happened (`outcome`).

### Failure modes

| Condition | Response |
|---|---|
| `CWP_INTERNAL_API_*` unset | `501 NOT_CONFIGURED` — the UI explains what to set |
| portal unreachable / 5xx | `503` naming the captive portal service |
| gateway unreachable | list still returns history; `gateway.reachable=false` |
| gateway un-authenticatable | `503` naming the gateway (auth cannot be skipped) |

## Configuration

| Service | Variable | Value |
|---|---|---|
| OS-ONE-CWP | `INTERNAL_API_TOKEN` | ≥24 chars; the internal API is **disabled** without it |
| OS-ONE-CWP | `PORT` | `8080` |
| Integration (AURA) | `CWP_INTERNAL_API_URL` | `http://${{OS-ONE-CWP.RAILWAY_PRIVATE_DOMAIN}}:8080` |
| Integration (AURA) | `CWP_INTERNAL_API_TOKEN` | `${{OS-ONE-CWP.INTERNAL_API_TOKEN}}` |
| Integration (AURA) | `CWP_INTERNAL_API_TIMEOUT_MS` | optional, default 8000 |

Both AURA variables are Railway **service references**, so the token is never
copied and rotating it on OS-ONE-CWP propagates automatically.

## Known limitations

- **The gateway must be reachable over a chain the container trusts.** The lab
  controller's management port (5825) presents a self-signed certificate;
  production Node will not accept it and `X-Controller-URL` must name the port
  with a valid certificate (443 on this deployment). The permissive HTTPS agent
  used elsewhere in AURA has no effect under `fetch` — undici ignores
  `init.agent` — so there is no silent TLS bypass here.
- **`connectedSince` is usually blank.** XCC reports an association *duration*
  on some builds and nothing on others; a start time is derived when a duration
  is present and left empty otherwise rather than back-computed from `lastSeen`.
- **`failed` comes only from a portal session the gateway refused**
  (`AUTH_FAILED` / `ERROR`). It is never inferred from an absence.
- **The summary covers the most recent 500 guests.** `truncated` says so.
- **Pagination is cursor-based on the ledger**, but the status narrowing for
  live-only states (`connected`, `disconnected`, `manually_added`, `failed`)
  happens after the merge, so those filters apply within the fetched page.
