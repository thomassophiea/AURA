# AURA Service Levels (SLE) — Metrics, Thresholds & Defaults

> Source of truth: `src/types/sle.ts`, `src/services/sleCalculationEngine.ts`, `src/components/sle/SLEDashboard.tsx`
> Generated: 2026-05-28

AURA tracks **Service Level Expectations (SLEs)** modeled after the Mist/Juniper SLE framework. Each SLE is a percentage of client-minutes (or AP-count) meeting a configured threshold, classified by status:

| Status | Success Rate | Color |
|---|---|---|
| Good   | ≥ 95% | Green  (`#22c55e`) |
| Warn   | 80 – 94% | Amber  (`#f59e0b`) |
| Poor   | < 80%  | Red    (`#ef4444`) |

Status function: `getSLEStatus(rate)` in `src/types/sle.ts`.

---

## 1. Wireless SLEs (7 metrics)

All seven wireless SLEs are computed by `computeAllWirelessSLEs()` in `src/services/sleCalculationEngine.ts`. Each returns a `SLEMetric` containing `successRate`, `status`, classifiers (failure-mode breakdown), and a time series.

### 1.1 Time to Connect
- **ID:** `time_to_connect`
- **Unit:** seconds
- **Default threshold:** `5 s` max acceptable connection time
- **Range (UI slider):** 1 – 30 s, step 1
- **Failure proxy:** clients with RSSI < −75 dBm (weak signal extends association/auth/DHCP)
- **Classifiers:** Association · Authorization · DHCP (sub: Unresponsive, Nack, Stuck) · Internet Services
- **Description:** Percentage of clients connecting within acceptable time thresholds

### 1.2 Successful Connects
- **ID:** `successful_connects`
- **Unit:** percent
- **Default threshold:** `95 %` minimum success rate
- **Range (UI slider):** 50 – 100 %, step 1
- **Failure logic:** `authenticated === false` OR missing IP after auth
- **Classifiers:** Authorization · Association · DHCP (sub: Nack, Renew Unresponsive, Discover Unresponsive, Incomplete) · DNS · ARP
- **Description:** Percentage of connection attempts that succeed

### 1.3 Coverage
- **ID:** `coverage`
- **Unit:** percent
- **Default threshold:** `−70 dBm` minimum RSSI
- **Range (UI slider):** −90 to −50 dBm, step 1
- **Failure logic:**
  - Weak Signal: `rssi < −70 dBm`
  - Asymmetry Uplink: `rxRate / txRate > 3`
  - Asymmetry Downlink: `txRate / rxRate > 3`
- **Classifiers:** Weak Signal · Asymmetry Uplink · Asymmetry Downlink
- **Description:** Percentage of client-minutes with adequate signal strength

### 1.4 Roaming
- **ID:** `roaming`
- **Unit:** percent (latency budget in ms)
- **Default threshold:** `500 ms` max roam latency
- **Range (UI slider):** 50 – 2000 ms, step 50
- **Failure logic:** "Sticky client" = `rssi < −75 dBm` AND `uptime > 300 s` (stuck on weak AP)
- **Classifiers:**
  - Signal Quality (sub: Sticky Client, Interband Roam, Suboptimal Roam)
  - Latency (sub: Slow 11r Roam, Slow Standard Roam, Slow OKC Roam)
  - Stability (sub: Failed To Fast Roam)
- **Description:** Percentage of successful and timely AP transitions

### 1.5 Throughput
- **ID:** `throughput`
- **Unit:** percent (rate floor in Mbps)
- **Default threshold:** `1 Mbps` minimum combined tx+rx data rate
- **Range (UI slider):** 1 – 100 Mbps, step 1
- **Failure logic:** active clients (tx+rx > 0) with combined rate below floor
- **Classifiers:**
  - Coverage (RSSI < −70 driving low throughput)
  - Device Capability (802.11b / g / a legacy protocols)
  - Network Issues (other)
  - Capacity (sub: Excessive Client Load > 30 per AP, WiFi Interference, Non-WiFi Interference, High Bandwidth Utilization)
- **Description:** Percentage of clients meeting minimum throughput expectations

### 1.6 Capacity
- **ID:** `capacity`
- **Unit:** percent
- **Default threshold:** `80 %` max channel utilization
- **Range (UI slider):** 50 – 100 %, step 5
- **AP overload threshold:** > 25 clients per AP
- **High-usage client threshold:** tx+rx > 50 Mbps
- **Classifiers:** Client Usage · WiFi Interference · Non-WiFi Interference · Client Count
- **Description:** Percentage of APs operating within capacity limits

### 1.7 AP Health
- **ID:** `ap_health`
- **Unit:** percent
- **Threshold:** Status-based (not user-configurable; UI disables editor)
- **Default target:** 95 % (informational)
- **Failure logic:**
  - Disconnected: status contains "disconnect" / "offline" / "outofservice"
  - Low Power: `lowPower` flag OR powerMode contains "low"
  - Network: status contains "degraded" / "warning"
- **Classifiers:** Network · Low Power · AP Disconnected (sub: AP Reboot, Site Down, AP Unreachable)
- **Description:** Percentage of access points operating in a healthy state

---

## 2. Wired SLEs

Currently **placeholder** in AURA. The wired tab in the SLE Dashboard renders a "Coming Soon" card listing the planned metrics:

- Switch Health
- Throughput
- Successful Connect
- Switch Bandwidth

`SLEDataPoint.scope` already supports `'wired'` and `'wan'` for future expansion.

---

## 3. Defaults Reference Table

Constant: `DEFAULT_SLE_THRESHOLDS` in `src/types/sle.ts`.

| SLE | Field | Default | UI Range | Step | Unit |
|---|---|---|---|---|---|
| Time to Connect    | `timeToConnect.maxSeconds`        | **5**         | 1 – 30      | 1   | s    |
| Successful Connects| `successfulConnects.minSuccessRate` | **95**      | 50 – 100    | 1   | %    |
| Coverage           | `coverage.rssiMin`                | **−70**       | −90 to −50  | 1   | dBm  |
| Roaming            | `roaming.maxLatencyMs`            | **500**       | 50 – 2000   | 50  | ms   |
| Throughput         | `throughput.minRateBps`           | **1,000,000** (1 Mbps) | 1 – 100 Mbps | 1 | Mbps |
| Capacity           | `capacity.maxChannelUtil`         | **80**        | 50 – 100    | 5   | %    |
| AP Health          | (status-based)                    | n/a           | n/a         | n/a | n/a  |

Thresholds are **per-site**, persisted in `localStorage` under key `sle_thresholds_<siteId>` (or `sle_thresholds_all` for org scope). They are merged with defaults on load so partial overrides are safe.

---

## 4. Data Collection Defaults

Source: `src/services/sleDataCollection.ts`

| Setting | Default | Notes |
|---|---|---|
| `COLLECTION_INTERVAL_MS` | 60,000 ms (1 min) | Client polling cadence |
| `MAX_DATA_POINTS`        | 10,000            | Sliding window in localStorage |
| `POOR_RSSI_THRESHOLD`    | −70 dBm           | Used by collector for `poorSignalCount` |
| Time-range selector      | `1h`, `24h` (default), `7d`, `30d` | Dashboard filter |

---

## 5. Status Color Map

```ts
SLE_STATUS_COLORS = {
  good: { text: 'text-green-500', bg: 'bg-green-500', hex: '#22c55e' },
  warn: { text: 'text-amber-500', bg: 'bg-amber-500', hex: '#f59e0b' },
  poor: { text: 'text-red-500',   bg: 'bg-red-500',   hex: '#ef4444' },
}
```

---

## 6. APIs Used to Source SLE Data

All SLE inputs come from the Extreme Campus Controller REST API, proxied through `/api/management` by AURA's Express server, then wrapped by the `apiService` singleton in `src/services/api.ts`. Multi-controller deployments inject the target via the `X-Controller-URL` header.

### Primary endpoints in use

| Endpoint | Method | Used For | Caller |
|---|---|---|---|
| `/v1/stations` | GET | Wireless + wired client list (RSSI, tx/rx rate, auth state, IP, AP serial, protocol, uptime). Drives **Coverage, Throughput, Roaming, Time to Connect, Successful Connects, Capacity**. | `apiService.getStations()` → `getAllStations()` (api.ts:1361); also called directly by `sleDataCollectionService` 1-min poll (sleDataCollection.ts:120) |
| `/v1/aps/query` | GET | AP inventory with status / connectionState / operationalState / lowPower / powerMode. Drives **AP Health** and **Capacity** (client-per-AP fan-out). | `apiService.getAccessPoints()` (api.ts:1101); `getAccessPointsBySite()` filters this result client-side (api.ts:1596) |
| `/v3/sites` (fallback `/v1/sites`) | GET | Site picker; site-scoped threshold persistence keys. | `apiService.getSites()` (api.ts:847) — cached |
| `/v3/sites/{siteId}/stations` | GET | Per-site station query used when AURA is in **org scope** with site groups. | Inline call in `SLEDashboard.loadData()` (SLEDashboard.tsx:319) |

### Org-scope aggregation path

When `navigationScope === 'global'` and site groups exist, `SLEDashboard.loadData()` iterates each site group's controller URL, temporarily swaps `apiService.setBaseUrl()`, then concurrently fetches:

```
GET {controller_url}/management/v1/stations      → apiService.getStations()
GET {controller_url}/management/v1/aps/query     → apiService.getAccessPoints()
```

…and merges results before computing SLEs.

### Authentication

- POST `/v1/login` (or controller equivalent) → `grantType / userId / password / scope` → access/refresh tokens in `localStorage`.
- Every SLE fetch goes through `makeAuthenticatedRequest()`, which attaches `Authorization: Bearer <token>` and auto-retries on `401` after refreshing.

### Endpoints referenced in code comments but **not yet wired**

The collector explicitly notes three real-data sources that would replace current proxy heuristics:

| Endpoint | Would Improve | Code Note Location |
|---|---|---|
| `/v1/aps/ifstats` | Real channel utilization for **Capacity** (today inferred from client count > 25/AP) | sleDataCollection.ts:298 |
| `/v1/state/aps` | Real AP operational state for **AP Health** (today inferred from status strings) | sleDataCollection.ts:333 |
| `/v1/state/switches` | Wired SLE inputs (Switch Health, Bandwidth) — needed before wired tab can ship | sleDataCollection.ts:384 |

### Polling cadence

| Job | Cadence | Source |
|---|---|---|
| SLE client poll (`/v1/stations`) | 60 s | `SLEDataCollectionService.COLLECTION_INTERVAL_MS` |
| Dashboard refresh | On user click / site / timeRange change | `SLEDashboard.loadData()` |
| Token refresh | On 401, with refresh lock | `apiService` (handled centrally — do not duplicate) |

---

## 7. File Reference

| Path | Purpose |
|---|---|
| `src/types/sle.ts` | Type definitions, `DEFAULT_SLE_THRESHOLDS`, status function, colors |
| `src/services/sleCalculationEngine.ts` | Pure compute functions for all 7 wireless SLEs |
| `src/services/sleDataCollection.ts` | 1-minute polling, persistence, MAX_DATA_POINTS cap |
| `src/components/sle/SLEDashboard.tsx` | Dashboard UI, threshold editor (per-site localStorage) |
| `src/components/sle/SLERadialMap.tsx` | Radial visualization |
| `src/components/sle/SLEOctopus.tsx` | Octopus view |
| `src/components/sle/SLEHoneycomb.tsx` | Honeycomb view (default) |
| `src/components/sle/SLEWaterfall.tsx` | Waterfall view |
| `src/components/sle/SLERootCausePanel.tsx` | Classifier drill-down |
| `src/components/sle/sleRootCause.ts` | Root-cause logic |
