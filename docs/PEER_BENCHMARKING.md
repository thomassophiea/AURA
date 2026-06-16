# AURA Peer Benchmarking — Metrics, Defaults & APIs

> Source of truth: `src/services/peerBenchmarkData.ts`, `src/hooks/usePeerBenchmark.ts`, `src/components/PeerBenchmarking.tsx`
> Generated: 2026-05-28

Peer Benchmarking ranks the customer's wireless network against either an **industry vertical baseline** or its own **historical self** across six weighted metrics, then emits prescriptive recommendations when underperformance crosses per-rule deltas.

> ⚠ **Heads-up for Emre:** the vertical baselines below are curated reference data shipped with AURA (not live peer telemetry), and the "current network metrics" in the hook are presently a stub (`getCurrentNetworkMetrics()` returns fixed values). Wiring those to the SLE engine is the known production-readiness gap — code comment at `src/hooks/usePeerBenchmark.ts:28` calls it out explicitly.

---

## 1. The Six Benchmark Metrics

`BenchmarkMetrics` in `peerBenchmarkData.ts`:

| Key | Label | Unit | Direction | Weight |
|---|---|---|---|---:|
| `avgThroughput`        | Avg client throughput          | Mbps | higher is better | **0.20** |
| `apUptime`             | AP uptime                      | %    | higher is better | **0.20** |
| `roamingSuccessRate`   | Roaming success rate           | %    | higher is better | 0.15 |
| `meanTimeToAssociate`  | Mean time to associate         | s    | **lower is better** | 0.15 |
| `clientDensityPerAP`   | Client density per AP (peak)   | (count) | higher is better | 0.15 |
| `highBandAdoption`     | 5 GHz / 6 GHz adoption         | %    | higher is better | 0.15 |

Weights sum to **1.00**.

---

## 2. Vertical Baselines (curated reference data)

`VERTICALS` array — 8 industries, each with a peer-count anchor and the six metric medians:

| Vertical       | Peer Count | Throughput | AP Uptime | Roam Success | MTA (s) | Clients / AP | High-Band |
|----------------|-----------:|-----------:|----------:|-------------:|--------:|-------------:|----------:|
| Enterprise     | 3,842 | 210.5 | 99.6 | 96.2 | 3.2 | 18.5 | 72.4 |
| Healthcare     | 1,893 | 175.8 | 99.8 | 97.1 | 2.8 | 14.2 | 68.9 |
| **Education** (default) | 1,247 | 164.3 | 99.2 | 93.8 | 4.5 | 32.7 | 58.2 |
| Retail         | 2,156 | 142.6 | 99.1 | 91.4 | 5.1 | 22.3 | 52.7 |
| Hospitality    | 1,654 | 156.2 | 99.3 | 94.5 | 3.9 | 26.1 | 61.8 |
| Government     |   987 | 195.4 | 99.7 | 95.8 | 3.5 | 12.8 | 65.3 |
| Manufacturing  | 1,432 | 132.7 | 99.4 | 92.6 | 4.8 |  8.4 | 48.5 |
| Logistics      | 1,108 | 118.9 | 99.0 | 90.2 | 5.6 | 10.6 | 44.1 |

Default selection on first load: **Education** (`usePeerBenchmark.ts:41`).

---

## 3. Scoring Algorithm

### Per-metric score (vertical mode)

```ts
ratio = lowerIsBetter ? (baseline / value) : (value / baseline)
score = clamp(ratio * 50, 0, 100)         // 50 == parity with baseline
```

### Overall score (vertical mode)

```ts
overall  = round(clamp(Σ score(metric) × weight(metric), 0, 100))
topPercent = max(1, 100 − overall)        // "You are in the top X% of peers"
```

### Self-benchmark mode

```ts
overall = round((countMetricsImproved / 6) × 100)   // % of metrics that improved vs window
```

### Neutral band

A delta whose absolute value is **< 2 %** is flagged `isNeutral: true` and does not trigger recommendations.

---

## 4. Recommendation Rules

When a metric is **worse than baseline by ≥ rule threshold**, the rule fires:

| Metric | Threshold | Severity | Title | Action |
|---|---:|---|---|---|
| `apUptime`             |  1 % | **critical** | Investigate AP reliability      | Check AP health logs, PoE+ power, firmware |
| `avgThroughput`        | 10 % | warning      | Improve client throughput       | Band steering, reduce co-channel, Wi-Fi 6E/7 |
| `roamingSuccessRate`   |  5 % | warning      | Optimize roaming experience     | Enable 802.11r FT + 802.11k, ≥ −67 dBm overlap |
| `highBandAdoption`     | 10 % | warning      | Increase 5GHz / 6GHz adoption   | Band steering policies, RSSI gates on 2.4 GHz |
| `meanTimeToAssociate`  | 15 % | info         | Reduce association latency      | DHCP / DNS response, PMKID / OKC, RADIUS timeouts |
| `clientDensityPerAP`   | 20 % | info         | Review AP placement density     | Add APs in congested areas, enable load balancing |

Order in the recommendations panel is rule-array order (not severity-sorted).

---

## 5. Self-Benchmark Windows

`SELF_BENCHMARK_WINDOWS`:

| Label    | Days |
|----------|-----:|
| 30 days (default) | 30 |
| 60 days  | 60 |
| 90 days  | 90 |

> The 30/60/90-day historical baseline is currently produced by `generateMockHistoricalMetrics()` — a deterministic-ish jitter around `current × (1 − daysAgo/1000)`. Replace with real time-series queries when self-benchmark goes live.

---

## 6. Defaults Summary

| Setting | Default | Source |
|---|---|---|
| Benchmark mode        | `vertical` | `usePeerBenchmark.ts:42` |
| Selected vertical     | `education` | `usePeerBenchmark.ts:41` |
| Self window           | 30 days | `SELF_BENCHMARK_WINDOWS[0]` |
| Neutral band          | ± 2 % | `NEUTRAL_THRESHOLD` |
| Weights total         | 1.00  | `METRIC_WEIGHTS` |
| Per-metric score base | 50 at parity | `computeMetricScore()` |

---

## 7. APIs Used

### Today (shipped state)

| Data | Source | Notes |
|---|---|---|
| Vertical baselines       | **Static, in-bundle**: `VERTICALS` array in `src/services/peerBenchmarkData.ts` | No network call |
| Current network metrics  | **Stub**: `getCurrentNetworkMetrics()` in `src/hooks/usePeerBenchmark.ts:29` | Returns fixed values — **needs SLE wiring** |
| Self-historical metrics  | **Mock**: `generateMockHistoricalMetrics(current, daysAgo)` | Deterministic jitter, not real history |

**There is currently no REST API call in the Peer Benchmarking flow.** The widget is self-contained until the SLE wiring lands.

### Production wiring target (planned)

When `getCurrentNetworkMetrics()` is connected to the live SLE engine, these are the endpoints that will source each metric:

| Metric | Endpoint | Method |
|---|---|---|
| `avgThroughput`       | `/v1/stations` (aggregate tx+rx across wireless clients) | GET |
| `apUptime`            | `/v1/aps/query` (operational state + uptime) | GET |
| `roamingSuccessRate`  | Roaming SLE (`computeRoaming()`) → `/v1/stations` | GET |
| `meanTimeToAssociate` | Time-to-Connect SLE (`computeTimeToConnect()`) | derived |
| `clientDensityPerAP`  | `/v1/stations` ÷ `/v1/aps/query` | GET, GET |
| `highBandAdoption`    | `/v1/stations` (band/channel fields) | GET |

For historical (self-benchmark) mode, the same metrics will sample from the 1-min station/AP poll already maintained by `sleDataCollectionService` (`src/services/sleDataCollection.ts`).

---

## 8. File Reference

| Path | Purpose |
|---|---|
| `src/services/peerBenchmarkData.ts` | Verticals, weights, scoring, recommendation rules, mock historical generator |
| `src/hooks/usePeerBenchmark.ts` | State (vertical / mode / window), score memo, recommendations memo, **stub current-metrics** |
| `src/components/PeerBenchmarking.tsx` | UI shell (vertical picker, score gauge, deltas, recommendations) |
| `src/hooks/usePeerBenchmark.test.ts` | Unit tests for the hook |
| `src/services/peerBenchmarkData.test.ts` | Unit tests for scoring + recommendation logic |
