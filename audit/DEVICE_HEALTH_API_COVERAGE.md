# AP Device Health — API coverage and gaps

What the platform can and cannot answer about an access point's own health, and
what Cortex does about each.

**Measured against the lab Gateway (`192.168.100.12:5825`, OS ONE 10.20.01) on
2026-09-17**, cross-checked against `public/swagger.json` (1.0 MB, 243 paths,
390 schemas). Nothing in this table is inferred from the spec alone — every
"unavailable" was probed, and every "available" was read back with real values.

That distinction matters: a spec says what a resource *may* carry, and three of
the fields below are in the schema and empty on this build.

---

## Summary

| | Count |
|---|---|
| Required for a health verdict, available | 7 |
| Available and used, not required | 4 |
| **Not exposed by the platform at all** | **5** |
| In the API but empty or unreliable on this build | 3 |

The five genuine absences are CPU, memory, temperature, a restart reason code,
and a support-bundle endpoint. Three of those are the first things a support
engineer asks for.

---

## Coverage

Legend — **Verdict**: `available` read back with real data · `derived` computed
by AURA from something else · `partial` answers sometimes or incompletely ·
`absent` does not exist anywhere.

### 1. Identity and operational state

| Need | Verdict | Endpoint | Field | Notes |
|---|---|---|---|---|
| Serial, model, MAC, hostname, site | available | `GET /v1/aps/query` | `serialNumber`, `platformName`, `hardwareType`, `macAddress`, `apName`, `hostSite` | Site is a NAME; there is no `siteId` on the row |
| Adoption / in-service state | available | `GET /v1/aps/query`, `GET /v1/state/aps/{serial}` | `status`, `entityStatus.operationalStatus` | **An adoption state, not a health verdict** |
| Trouble flags | partial | `GET /v1/state/aps/{serial}` | `entityStatus.troubles[]` | Measured empty even on a critical AP. Absence of troubles is not evidence of health |
| Gateway tunnels + MTU | available | `GET /v1/state/aps/{serial}` | `controllerApTunnelStatus[]` | See the MTU note below |

> **Inventory is not a fleet.** An AP that is removed, or fully loses adoption,
> DISAPPEARS from `/v1/aps/query` rather than appearing as unhealthy, and
> `/v1/aps/{serial}` then answers `422 "Can not find AP"`. A clean sweep is
> therefore not proof that nothing is wrong. Cortex carries this caveat on every
> fleet answer and points at `findVanishedDevices`.

### 2. Firmware

| Need | Verdict | Endpoint | Notes |
|---|---|---|---|
| Running version | available | `GET /v1/aps/query` → `softwareVersion` | |
| **Expected / target version per AP** | **absent** | — | Nothing in 243 paths publishes a per-AP target. `/v1/aps/upgradeimagelist` lists available images, not an assignment |
| Comparable-peer consistency | derived | same-model, same-site cohort over `/v1/aps/query` | Cortex's definition of "expected": what comparable APs run. Stated as an inference, never as a published target |
| Is an upgrade in progress? | available | `GET /v2/report/upgrade/devices` | Returns `{upgradeGroups: []}`. **Previously unused by AURA.** It is what separates a firmware outlier from a device mid-upgrade |

### 3. System resources — the real gap

| Need | Verdict | Evidence |
|---|---|---|
| **AP CPU utilisation** | **absent** | No CPU field on `/v1/aps/query`, `/v1/aps/{serial}`, `/v1/state/aps/{serial}` or the AP report widget set. `/v1/aps/{serial}/statistics` → **404**. `grep -c cpu public/swagger.json` over AP schemas → **0**. The controller appliance reports its own CPU; an AP does not |
| **AP memory utilisation** | **absent** | Same, on every AP endpoint |
| **AP temperature / thermal** | **absent** | No thermal field on any AP resource. `/v1/ap/environment/{serial}` is the RF *deployment* environment (indoor/outdoor), not a sensor, and its schema resolves to zero properties. Onboard sensors are reachable from the AP shell only |

`src/components/AccessPoints.tsx` has long carried CPU and Memory columns that
probe nine speculative field names across two endpoints and come back blank.
Those columns are the clearest existing evidence that these three do not exist.

**What Cortex does:** reports them as `platform_gap` on every assessment,
including a healthy one, and refuses to substitute a nearby measurement. The
answer contract requires the closing sentence that names them; `auditAnswer` and
`gradeNoInventedDeviceMetrics` both fail an answer that states a figure for any
of the three.

### 4. Uptime and restarts

| Need | Verdict | Source | Notes |
|---|---|---|---|
| Current uptime | available | `GET /v1/aps/query` → `sysUptime` | **Undocumented** — absent from swagger, present on every row. Measured 271,327 s on AP5020-PVT-01 |
| **Reboot / restart history** | **derived (new)** | `metric_samples` → `ap.uptime_seconds` | The Gateway serves no reboot log and no restart counter. A restart is reconstructed as a DECREASE in the stored uptime series. **This metric was added by this work**; before it, the question was unanswerable |
| **Restart reason code** | **absent** | — | Not in REST anywhere. It is in the tech-support archive |
| Watchdog / crash events | absent | — | Same |

Two properties of the derived history that must travel with any claim built on
it: it is **forward-only** (it says nothing about the period before the
collector first ran), and a restart within 30 minutes of a firmware change is
classified as an upgrade rather than a fault.

A long current uptime is itself a lower bound on time-since-restart — three days
of uptime *proves* no restart in three days — so a missing series does not make
an AP unassessable, only its longer-term pattern unknown.

### 5. Ethernet, PoE and the uplink

| Need | Verdict | Source | Notes |
|---|---|---|---|
| Link speed, duplex, port list | available | `/v1/aps/query` → `ethPorts[]`, `ethSpeed`, `ethMode` | `speedNA` on a second port is an unused port, not a fault |
| PoE status | available | `ethPowerStatus` | Three values measured across the fleet: `normal` (4 APs), `low` (3), `high` (1). **They are not three grades of one thing** — `low` means the port supplies less than the AP wants; `high` is headroom |
| Measured power draw | available | `pwrUsage` (W) | Also collected to `metric_samples` as `ap.power_watts` |
| **PoE budget and 802.3af/at/bt class** | **absent** | — | The PoE schemas in the spec belong to switch port profiles, not AP telemetry |
| **Ethernet error / discard counters** | **partial → effectively absent** | `GET /v1/aps/ifstats/{serial}` → `wired[]` | The per-AP route answers **200**, and `wired` comes back as an **empty array** on this build (AP5020, measured). The counters exist in `IfStatsElement` and are not populated. The bulk `/v1/aps/ifstats` route 500s |
| Per-radio error counters + admin/oper state | available | same resource → `wireless[]` | `inErrors`, `outErrors`, `adminStatus`, `operStatus`. **Previously unread by anything in the product** |
| Upstream switch and port | available | `GET /v1/aps/{serial}/lldp` | `systemName: "Thomas-4220-01"`, `switchPort: "46"`. `switchSerial` is often empty. This is what turns an upstream finding into a port someone can go and check |

> **The MTU pair.** Every tunnel on the lab fleet reports
> `configMtuTunnelStatus: "Normal"` alongside
> `internalManagementTunnelStatus: "MtuFailed"` — 8 of 8 APs. The data path and
> the management path are not the same finding, and scoring either put the whole
> fleet into Degraded. Cortex scores the **data path** only (that is what carries
> client traffic and what a client symptom hangs off) and reports the management
> state without scoring it.

### 6. Radios

| Need | Verdict | Notes |
|---|---|---|
| Channel, power, mode, client count | available | `/v1/aps/query` → `radios[]` |
| On-air state | derived | `opChannel` present and `txPower > 0`. **`opChannel` is the literal string `"Off"`**, not null — a truthiness test reads a disabled radio as tuned |
| AFC state | available | `opChannel: "AFC-PENDING"` on 6 GHz awaiting Automated Frequency Coordination. A regulatory wait, not a fault |
| **Radio admin vs failed** | **absent as a discriminator** | `adminState` is `true` on every radio on the fleet **including those reporting `"Off"` at 0 dBm**. The platform does not separate a deliberately-disabled radio from one that is enabled and not on the air |
| Radio reset / failure counter | absent | SmartRF channel changes exist; radio *failures* do not |

Because `adminState` does not discriminate, Cortex reports an off-air radio as a
condition with **four named candidate causes** — no WLAN bound, a regulatory
hold, power shedding, or the radio itself — and lets the isolation ladder
attribute it. Claiming hardware from these fields alone is a guess, and on this
fleet it would have been wrong three times out of three.

### 7. Events, alarms and logs

| Need | Verdict | Source | Notes |
|---|---|---|---|
| Per-AP alarm history | partial | `GET /v1/aps/{serial}/alarms?startTime&endTime` | **Not in the published catalogue.** Answers 200 here and returned an empty list over 7 days; 404s on builds without it. An empty list and a missing endpoint are different answers |
| Active alerts | available | `GET /v1/aps/{serial}/report` → `activeAlerts[]` | |
| Configuration audit log | available | `GET /v1/auditlogs?startTime=<ms>&endTime=<ms>` | Both params required as epoch ms or 422 |
| Infrastructure probes | available | AURA Sentinel — 8 active probes incl. `ap_status` and `firmware_consistency` | Genuinely independent of Gateway telemetry |
| **Syslog** | **absent** | — | No ingestion of any kind |

### 8. Support bundle

**There is no techsupport, show-support or support-bundle endpoint.** `grep` of
all 243 paths for `techsupport`, `showsupport`, `supportbundle` → zero hits each.

The nearest equivalent is a three-step per-AP trace collection:

| Step | Call | Class | Measured |
|---|---|---|---|
| 1 | `PUT /v1/aps/{serial}/logs` | **disruptive write** | `OPTIONS` returns `Allow: OPTIONS,PUT` |
| 2 | `GET /v1/aps/{serial}/traceurls` | read | **404 on this build**, though the path is catalogued |
| 3 | `GET /v1/aps/downloadtrace/{file,file,…}` | read | Comma-joined in one request |

**Cortex does not invoke step 1.** Its investigation path is read-only by
construction, `guardrails.js` classifies that path as disruptive, and quietly
poking hardware to enrich a report would break the read-only contract for a
convenience. The RMA package names all three calls, marks step 1 as an operator
action, and carries the measured 404 on step 2 so nobody wastes time on it.

### 9. Client and service impact

| Need | Verdict | Source |
|---|---|---|
| Clients per AP | available | `radios[].clients`, `/v1/stations`, `flex(MuTable)` |
| Clients with findings on this AP | available | scored through the existing findings engine |
| Association / disconnect events **per AP** | partial | Only reachable MAC-by-MAC; there is no AP-scoped event stream |
| Service levels per site | available | AURA's collector (`metric_samples`, family `sle`) |

---

## What changed in the platform surface

Three things this work uses that nothing in AURA read before:

1. **`GET /v2/report/upgrade/devices`** — present in the spec, unused. It is the
   only authority on whether an AP is mid-upgrade, which is what stops a planned
   change being reported as a firmware defect.
2. **`ifstats[].wireless[].adminStatus` / `operStatus`** — a radio the AP itself
   reports as admin-up and operationally down is the strongest single radio
   signal the platform produces.
3. **`GET /v1/aps/{serial}/lldp`** — the upstream switch and port.

And one metric added:

4. **`ap.uptime_seconds`** in `metric_samples`, written by the existing
   `energy_ap_state` collector from the `/v1/aps/query` response it already
   fetches — one extra series per AP per poll, no extra request. Carries the
   running firmware in `dimensions` so an upgrade restart can be told from a
   fault.

---

## Gaps worth raising with Engineering / Product

Ranked by how often they block an answer, not by how hard they look.

| # | Gap | Consequence | Would be satisfied by |
|---|---|---|---|
| 1 | No AP CPU or memory | The two metrics every support engineer asks for first cannot be answered at all. Every device-health answer carries a disclaimer instead | Any field on any AP resource |
| 2 | No restart reason code | "Why did it reboot?" is unanswerable from REST even when the restart itself is visible | A reason on a restart event |
| 3 | No reboot log | AURA has to reconstruct restarts from a stored uptime series it had to start collecting. Forward-only, so a new deployment is blind for its first week | A per-AP restart history endpoint |
| 4 | `adminState` does not distinguish a disabled radio from a failed one | An off-air radio cannot be attributed without inference | A distinct operational state per radio |
| 5 | `ifstats.wired` is empty | Uplink error rate — the direct evidence for a marginal cable — is unavailable, so cable health is a link-state check only | Populating the existing `IfStatsElement` fields |
| 6 | No AP temperature | Thermal cannot be eliminated as a cause before recommending replacement | Any sensor read over REST |
| 7 | No support bundle, and `traceurls` 404s | The evidence package cannot include device logs; an operator has to collect them by hand | A working trace listing, or a bundle endpoint |
| 8 | No PoE budget or class | "Is the switch giving it enough?" is answered from a three-valued status rather than from watts available vs required | Negotiated class and port budget |
| 9 | No per-AP association/disconnect event stream | Per-AP client impact over time requires fanning out MAC by MAC | An AP-scoped event query |

Gaps 1, 2 and 6 are recorded automatically into `cortex_api_gaps` on **every**
device-health assessment — including successful ones — because a gap reached by
a tool that answers its question anyway would otherwise never be counted.
`GET /api/cortex/api-gaps` reports them by demand.

---

## Reproducing this

```bash
GW_PW=… node scripts/device-health-live.mjs                 # fleet
GW_PW=… node scripts/device-health-live.mjs --ap AP5020-PVT-01
GW_PW=… node scripts/device-health-live.mjs --bundle CV012408S-C0102
```

Read-only. The script asserts, before doing anything else, that no write or
disruptive tool is exposed to the model, and exits 3 if one is.
