# Aura Cortex — troubleshooting capability & API gap matrix

**Generated from a live probe of the lab Gateway**, not from the OpenAPI spec.
Appliance: VE6120, Campus Controller **10.20.1.0-020R**, 6 APs / 37 clients.
Probed: `2026-09-10T13:34:39.468Z`.

> Why this file exists: an earlier version of this analysis was spec-derived and
> was wrong in **both** directions — it promised fields through an endpoint that
> returns 500 on every call, and it marked working data as unavailable. Every row
> below was either returned by a real call or looked for and not found.

## Summary

| Status | Count | Meaning |
|---|---|---|
| ✅ available | 30 | A named field, in a call that returned real data |
| 🔶 derived | 4 | Needs 2+ fields or a time comparison; Cortex does the derivation |
| 🟡 partial | 3 | Works for some entities and not others (measured, not assumed) |
| ⚠️ inert | 3 | Feature exists on this Gateway but is switched off or unconfigured |
| ⛔ unavailable | 12 | Looked for, not found. Cortex says so rather than substituting something |

**37 of 52 capabilities are usable**; the other 15 are
declared to the model in its system prompt so it stops attempting them and
reports the gap instead.

## Corrections this probe made to the previously documented model

These four were wrong in the reference material and would each have produced a
tool that fails at runtime in front of an operator:

| Endpoint | Previously believed | **Measured on this build** |
|---|---|---|
| `/v1/stations/events/{mac}` | needed live discovery | **500 `"This feature is disabled."`** — hard dead. `muEvent` is the only client timeline |
| `/v1/auditlogs` | params optional | **422 unless BOTH `startTime` and `endTime` are epoch ms.** `start`/`end` and `fromTime`/`toTime` are rejected |
| `/v1/aps/ifstats` | 500 always | **partial** — 200 fleet-wide, 500 for `AP5010-LAB` specifically. Never load-bearing; `ApTable` is the stable route |
| `SmartRfNeighborTable` | 147 rows | works, **150 rows**; the first attempt failed only on timeout |

Two further measured facts that shape the design:

- **`entityStatus.troubles[]` is empty even on a `critical` AP.** Absence of
  troubles is not evidence of health, so no disconnect *reason* is derivable.
- **The QoE scoring layer is dark**: `siteQoE`/`apQoE` return `"enable": false`
  with empty tables, and `/v3/sites/{id}/report/impact` is a hard 404 despite
  appearing in the spec. Every SLE-shaped answer is therefore computed from raw
  telemetry rather than read off a dashboard.

## The four sources that answer almost everything

| Source | Call | Carries |
|---|---|---|
| **MuTable** | `flex("MuTable")` | 85 columns of per-client, per-sample telemetry — signal, RFQI, the three-way latency split, loss, role, IP, SSID, site |
| **ApTable** | `flex("ApTable")` | 34 columns of per-radio airtime, noise, power. **The working replacement for `ifstats`** |
| **Client report widgets** | `report("station", mac, [...])` | `muEvent` timeline + the Gateway's own learned baseline envelope (90 points per metric) |
| **Neighbour table** | `flex("SmartRfNeighborTable")` | 150 rows naming co-channel offenders |

Flex frames arrive `base64(zlib(json))`. **The report API accepts exactly one
duration on this build — `3H`**; every other value 500s after ~31 s.

## Sentinel values — the anti-fabrication layer

The appliance uses in-band magic numbers for "not measured". Read naively they
look like catastrophic readings, and this is the single largest source of
invented incidents:

| Field | Sentinel | Naive reading | Correct reading |
|---|---|---|---|
| `WirelessRTT`/`NetworkRTT`/`DNSRTT` | `65535` | 65-second latency | not measured |
| `SNR` | `-10000` | absurd noise | idle/unassociated placeholder row |
| `Rss` | `0` | perfect signal | placeholder |
| `Noise` | `0` | perfectly quiet band | **the radio is off** |
| `DLRetryAttempts` | `0` fleet-wide | no retries ever | inert on this build — use loss |

Measured on one live run: **97 sentinel readings suppressed, 125 genuine
readings kept.** Every accessor returns `null` rather than a number, so an
absent value cannot be scored, averaged, or stated as a fact.

## Full matrix

| Capability | Status | Source (measured) | Notes / gap |
|---|---|---|---|
| `ap.power` | ✅ available | `ethPowerStatus + currentPowerLevel + ApTable.PowerConsumption` |  |
| `ap.radio_state` | ✅ available | `AP radios[]: channel Off/null + txPower 0 + adminState` |  |
| `ap.status` | ✅ available | `/v1/aps/query status + /v1/state/aps operationalStatus` |  |
| `ap.tunnel_state` | ✅ available | `/v1/state/aps/{serial} controllerApTunnelStatus[]` |  |
| `backend.dns` | ✅ available | `MuTable.DNSRTT` |  |
| `client.ap` | ✅ available | `MuTable.ApName + ApSerial + RadioID` |  |
| `client.auth_problem_events` | ✅ available | `muEvent statName "Auth Problem"` |  |
| `client.baseline` | ✅ available | `report(station, mac, ["baseliningRss","baseliningRFQI",...])` | The Gateway's own learned envelope — a better anomaly signal than a global threshold |
| `client.capability` | ✅ available | `MuTable.Dot11Capability + 11Protocol + 11nAdvanced` |  |
| `client.downlink_loss` | ✅ available | `MuTable.DLLostPkts vs RxPkts` | DLRetryAttempts is 0 for every client on this build — use loss, not retries |
| `client.ip` | ✅ available | `MuTable.IP` |  |
| `client.latency_split` | ✅ available | `MuTable.WirelessRTT / NetworkRTT / DNSRTT` | 65535 means not measured and is suppressed, not scored |
| `client.link_quality` | ✅ available | `MuTable.RFQI (1-5)` |  |
| `client.list` | ✅ available | `flex(MuTable)` |  |
| `client.roaming` | ✅ available | `muEvent Roaming events, with FT[...] and the radio pair in Details` |  |
| `client.role` | ✅ available | `MuTable.RoleName + RoleUUID` |  |
| `client.signal` | ✅ available | `MuTable.Rss + MuTable.SNR` |  |
| `client.throughput` | ✅ available | `MuTable.ThroughputBps / Rx / Tx` |  |
| `client.timeline` | ✅ available | `report(station, mac, ["muEvent"])` | statNames: Association, Disassociation, Roaming, "Auth Problem" |
| `client.wlan` | ✅ available | `MuTable.SSID + RFSUUID` |  |
| `config.aaa_policies` | ✅ available | `/v1/aaapolicy` |  |
| `config.audit_log` | ✅ available | `/v1/auditlogs?startTime=<ms>&endTime=<ms>` | BOTH params required as epoch ms, or 422. start/end and fromTime/toTime are rejected. |
| `config.profiles` | ✅ available | `/v3/profiles` |  |
| `config.roles` | ✅ available | `/v3/roles` |  |
| `config.services` | ✅ available | `/v1/services` |  |
| `config.sites` | ✅ available | `/v3/sites` |  |
| `config.topologies` | ✅ available | `/v1/topologies` |  |
| `rf.airtime_split` | ✅ available | `flex(ApTable): clientData / ChannelUtilizationAdjusted / interference / available` | The four shares sum to 100 — verified on 45/45 rows, which is what makes attribution safe |
| `rf.neighbours` | ✅ available | `flex(SmartRfNeighborTable)` | 150 rows on a 6-AP lab; names the co-channel offenders |
| `rf.noise` | ✅ available | `ApTable.Noise` | Noise 0 means the radio is off, not a quiet floor |
| `backend.dhcp_outcome` | 🔶 derived | `MuTable: associated + measurable RF + no IP` | Cleanest backend signal available: good radio, no address |
| `backend.ntp` | 🔶 derived | `Gateway telemetry timestamps vs this host clock` | An inference. Confirm with CLI `show time`. Skew breaks 802.1X and captive portal with no RF symptom. |
| `backend.vlan_resolution` | 🔶 derived | `service.defaultTopology resolved against /v1/topologies; apVlanStatus per AP` | A dangling topology reference passes no traffic and warns nowhere |
| `client.vlan` | 🔶 derived | `MuTable.RFSUUID -> service.defaultTopology -> topology.vlanid` | MuTable carries no VLAN column; the VLAN is resolved through the service |
| `client.hostname` | 🟡 partial | `MuTable.Hostname` | 58/76 rows carry a hostname |
| `rf.ifstats` | 🟡 partial | `/v1/aps/ifstats` | Measured: 200 fleet-wide, 500 for AP5010-LAB. Never rely on it — ApTable is the stable route. |
| `rf.smartrf_history` | 🟡 partial | `report(ap) smartRFChannelInspector*, smartRFMitigation*` | Widgets present; idle on this box — no mitigation events recorded |
| `auth.server_health` | ⚠️ inert | `report(site) radius widgets: authFailVsIssued, serverDownHist, radiusHealthTable` | Widget family exists but no RADIUS server is configured on this Gateway to drive it |
| `l2.storm_control` | ⚠️ inert | `report l2port page: l2portUnicast/Multicast/Broadcast` | Requires an L2 port to report against |
| `sle.qoe_scores` | ⚠️ inert | `siteQoE / apQoE / ApQoETable / SiteQoETable` | "enable": false and empty tables on this build. SLE answers are computed from raw telemetry. |
| `ap.disconnect_reason` | ⛔ unavailable | `entityStatus.troubles[]` | Measured empty even on a critical AP. Nearest signals are tunnel status and sysUptime. |
| `ap.ethernet_errors` | ⛔ unavailable | `IfStatsElement.inErrors/outErrors` | Only reachable through the unreliable ifstats route for APs |
| `auth.active_test` | ⛔ unavailable | `CLI radtest` | The only active auth test on the platform is CLI-side; not reachable over REST |
| `backend.dhcp_pool_state` | ⛔ unavailable | `—` | Gateway exposes pool configuration, never live lease counts. Exhaustion is not visible. |
| `client.arp` | ⛔ unavailable | `—` |  |
| `client.connect_phase_timings` | ⛔ unavailable | `—` | No per-phase durations. We can count connect failures, not time association/auth/DHCP. |
| `client.events_rest` | ⛔ unavailable | `/v1/stations/events/{mac}` | Returns 500 "This feature is disabled." on this build. muEvent is the only timeline. |
| `client.internet_reachability` | ⛔ unavailable | `—` | Nothing tests reachability past the Gateway. Needs a real client on the SSID. |
| `client.radius_reject_reason` | ⛔ unavailable | `—` | No per-client RADIUS reject reason in REST. An auth-stage failure can be located, not explained. |
| `client.roam_duration` | ⛔ unavailable | `—` | The roam record says whether FT was used, never how long the roam took |
| `client.username` | ⛔ unavailable | `MuTable.Username` | 0/76 rows carry a username |
| `sle.impact_attribution` | ⛔ unavailable | `/v3/sites/{id}/report/impact` | Hard 404 despite being in the OpenAPI spec |

## What this means for the product

The honest position: this is the **measurement and attribution layer** of an SLE
system, running against a Gateway whose own scoring layer is switched off.
Coverage, Throughput, Capacity and AP Health are fully scoreable today. Time to
Connect and Successful Connect have events but no per-phase durations. Roaming
has fast-transition state but no roam duration. Stability has loss and churn but
no session lifetime.

The remaining distance to a true SLE is **a denominator (user-minutes) and agreed
thresholds** — not more telemetry.

### The gaps worth escalating to OS ONE / Platform ONE

These are the rows where AURA can demonstrate a real observability hole in the
platform, in priority order:

1. **No per-client RADIUS reject reason.** Cortex can locate an
   authentication-stage failure and cannot explain it. This is the single most
   requested troubleshooting answer and the one the API cannot give.
2. **`/v1/stations/events/{mac}` is disabled**, leaving `muEvent` as the only
   client timeline — a report widget, not a queryable event API.
3. **No per-phase connect timings.** Failed connects can be counted, never
   timed, so "Time to Connect" cannot be measured as an SLE.
4. **No roam duration.** We can say whether fast transition engaged, never
   whether the roam was fast.
5. **No AP disconnect reason** — `troubles[]` is empty even on a critical AP.
6. **No DHCP timing or NAK reason**, and **no pool lease counts**, so exhaustion
   is invisible.
7. **QoE scoring and the impact/attribution endpoint are unavailable** (disabled
   and 404 respectively).
8. **Nothing tests reachability past the Gateway** — "can this client reach the
   internet" needs a real client on the SSID.
