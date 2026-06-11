# XIQ-Native Service Levels — Design & Implementation

Wireless only. The OS-ONE Service Levels experience is unchanged; when an XIQ
site is selected the same page renders XIQ-derived SLEs through the same
honeycomb, cards, and scoring presentation. No platform badges/banners on the
page — the site selector is the only context mechanism.

Verified live against XIQ Global (account `mblack+1@…`, 132 clients / 19 APs)
on 2026-06-11.

---

## 1. XIQ Metric Inventory (site-level, verified live)

All sourced from the legacy XIQ API (`api.extremecloudiq.com`) via AURA's
`/xiq/api` proxy. Grids are **POST**, paginated (`page`/`limit`/`total_pages`),
and every row carries `site` / `building` / `floor` for scoping.

| Source | Key fields | Refresh | Confidence |
|---|---|---|---|
| `POST /dashboard/wireless/client-health/grid` | `rssi`, `snr`, `association_duration`, `authentication_response_time`, `dhcp_ip_assignation_time`, `has_authentication_issues`, `has_association_issues`, `has_ip_address_issues`, `has_roaming_issues`, `roaming_time`, `tx_client_retries`, `rx_client_retries`, `slowness`, `air_time_warning`, `frequency`, `connectionStatus`, `site` | near-real-time snapshot | High |
| `POST /dashboard/wireless/device-health/grid` | `cpu_usage_percentage`, `memory_usage_percentage`, `wifi_reboots_count`, `channel_change_count`, `has_device_health_issue`, `poe_usage_indicator`, `site` | snapshot | High |
| `POST /dashboard/wireless/usage-capacity/grid` | `radio_2dot4g_utilization_score`, `radio_5g_utilization_score`, `radio_6g_utilization_score`, `wifi0_interference_score`, `packet_loss`, `has_usage_capacity_issue`, `healthy_clients`, `unhealthy_clients`, `site` | snapshot | High |
| `GET /clients/active?views=FULL` | `client_health`, `radio_health`, `network_health` (0-100), `rssi`, `snr` | snapshot | Medium (used for client-level health, not primary) |
| `GET /locations/site` | site `id` + `name` (selector population) | static | High |

**Not available on this tenant:** PHY tx/rx rate (so throughput uses
retries/airtime/slowness as the proxy); `cpu/memory/active_clients` on `/devices`
are null (the device-health *grid* has real cpu/mem instead).

**Available but not yet wired (future):** CloudAPI v1
`/xiq/v1/network-scorecard/{wifiHealth|clientHealth|deviceHealth|networkHealth|servicesHealth}/{locationId}`
returns pre-aggregated site scorecards with time windows — these would give
native trend/history but sit on the EP1 base, not the current proxy.

---

## 2. OS-ONE → XIQ Mapping (functional parity)

| User outcome | OS-ONE basis | XIQ basis |
|---|---|---|
| Can users connect? | station `authenticated`, ip presence | `has_authentication_issues` / `has_association_issues` / `has_ip_address_issues` |
| Connect fast enough? | RSSI proxy | `association_duration + authentication_response_time + dhcp_ip_assignation_time` |
| Wireless experience healthy? | tx/rx rate vs threshold | retries + `air_time_warning` + `slowness` |
| RF healthy? | station RSSI/rate | `rssi` / `snr` thresholds |
| Roaming healthy? | sticky-client heuristic | `has_roaming_issues` / `roaming_time` |
| Capacity OK? | clients-per-AP | radio utilization scores + interference |
| Infra healthy? | AP status/power | cpu / memory / reboots / channel changes / `has_device_health_issue` |

---

## 3. Recommended XIQ SLE Categories

Same 7 ids/labels/order as OS-ONE (so the honeycomb is identical):
`time_to_connect`, `successful_connects`, `coverage`, `roaming`, `throughput`,
`capacity`, `ap_health`. Throughput is reframed as a client-experience proxy
(retries/airtime/slowness) since XIQ exposes no PHY rate.

---

## 4. Scoring Model (thresholds from the anomaly-detection reference)

- successRate = (total − failed) / total, per metric; status via existing
  `getSLEStatus` (≥95 good, ≥80 warn, else poor). One client/AP counted once.
- Coverage: weak if `rssi < -70` or `snr < 15`.
- Time to Connect: slow if summed connect phases > `5000 ms`; attributed to the
  dominant phase (Association / Authorization / DHCP).
- Successful Connects: fail on any of auth/assoc/ip issue flags → classifiers
  Authorization / Association / DHCP (same as OS-ONE).
- Roaming: fail on `has_roaming_issues` or `roaming_time > 3000 ms`.
- Throughput: fail on `tx+rx_client_retries ≥ 0.2` or `air_time_warning` or `slowness > 0`.
- Capacity (per AP): congested if any radio utilization score ≥ `70` or
  `has_usage_capacity_issue`.
- AP Health (per AP): unhealthy if `has_device_health_issue` or `cpu ≥ 85` or
  `memory ≥ 90` or `reboots ≥ 1` or `channel_changes ≥ 3`.
- Trend/timeseries: empty for now (no XIQ history feed yet).

Live result (all sites): coverage 75.8%, throughput 64.4%, capacity 52.6%, rest
100% — and distinct per site (Scruff: coverage 67.8%, capacity 71.4%).

---

## 5. Data Integration Approach

- `server.js` — added `POST /xiq/api/*` proxy (mirrors the GET one) so the grids
  are reachable; auth via `X-XIQ-Token` / `X-XIQ-Region`.
- `src/services/sle/xiqSleEngine.ts` — pure functions → 7 `SLEMetric[]`.
- `src/services/sle/xiqSleProvider.ts` — fetches the 3 grids (paged POST), scopes
  rows to the selected site by name, calls the engine; returns the shared
  `SLEPageModel`. Falls back to a graceful empty/warn state.
- `sleProviderFactory` routes XIQ sites here; OS-ONE sites stay on
  `gatewaySleProvider` (untouched). Selecting the site drives everything.
- Honeycomb/cards/scoring reused unchanged (output is `SLEMetric[]`).

### Known limitations / follow-ups
- Deep root-cause drill-down (`buildRootCause`) uses controller field names, so
  the per-device affected list is limited for XIQ; the classifier/sankey
  breakdown (from `SLEMetric.classifiers`) works.
- Threshold-edit dialog adjusts OS-ONE thresholds only; XIQ uses fixed engine
  constants (could be wired later).
- No XIQ historical trend yet → sparklines empty. Wire CloudAPI v1
  network-scorecard or collect snapshots over time to populate.

---

## Success criteria status
- OS-ONE SLEs unchanged ✓ · XIQ sites show XIQ SLEs ✓ · same page/layout ✓
- No platform indicators on the page ✓ · selected site drives source ✓
- Honeycomb pattern preserved ✓ · wireless only ✓
