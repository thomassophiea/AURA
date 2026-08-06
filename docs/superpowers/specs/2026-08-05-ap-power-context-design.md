# AP Power Context — Green AP Initiative

**Date:** 2026-08-05
**Status:** Implemented
**Scope:** AP Insights full-screen view — explain power consumption at a locked timeline point.

## Problem

Locking a point on the AP Insights charts showed a power value with no context. For a
green-AP initiative the operator needs three things at that instant: what the AP actually
drew, what else was happening, and what can be done about it.

Investigation against the live lab controller (XCC 10.18.1.0-011R, AP5020-PVT-03_MESH_ROOT
`CV012408S-C0078`) surfaced four findings that shaped the design.

### Finding 1 — power was rendered 1000x too large

`apPowerConsumptionTimeseries` reports `unit: "mW"`. `formatValue()` treated `'W'` and
`'mW'` identically:

```ts
if (unit === 'W' || unit === 'mW') return `${value.toFixed(1)} W`;
```

An AP5020 drawing **18.67 W** displayed as **"18670 W"**. The Y-axis, the locked badge, and
the Avg Power summary tile were all affected.

### Finding 2 — no available series explains the observed spike

All seven series were pulled and correlated against power across the 3-hour window:

| Series | Pearson r vs power |
| --- | --- |
| Unique clients | +0.28 |
| Co-channel 5 GHz | +0.29 |
| Client RSS | −0.29 |
| Noise R1 | +0.26 |
| Upload | +0.12 |
| Total throughput | +0.07 |

At the 18.67 W peak (**+33%** over the 14.07 W window median) throughput was 4.83 Mbps —
unremarkable — clients 12 of a 8–14 range, co-channel 6%. Nothing accounts for it.

### Finding 3 — the causal signals do not exist as timeseries

Fourteen candidate widget names were probed on `/v1/report/aps/{serial}`
(`txPowerTimeseries`, `radioPowerTimeseries`, `apCpuUtilization`, `apMemoryUtilization`,
`poeStatus`, `ethernetPortStats`, `smartRfEvents`, `apChannelChange`, …). All returned
HTTP 200 with the widget key absent — the controller silently ignores unknown widgets. Only
the eight documented widgets exist.

`/v1/aps/{serial}/alarms` responds but returned **zero events in the 3-hour window**; a
14-day query yielded only `Discovery` / adoption events from six days prior. No channel-change
or power-adjustment events on this build.

### Finding 4 — configuration predicts the floor, not the delta

Per-AP power across the fleet, against radio configuration:

| AP | Model | min W | median | max | range | radios |
| --- | --- | --- | --- | --- | --- | --- |
| AP5020-PVT-01 | AP5020 | 13.10 | 13.33 | 13.84 | **0.74** | 20/40/80 @ 17/17/12 dBm |
| AP5020-PVT-02 | AP5020 | 13.08 | 13.49 | 16.88 | **3.80** | 20/40/80 @ 18/18/12 dBm |
| AP5020-PVT-03 | AP5020 | 13.53 | 14.09 | 18.67 | **5.14** | 20/40/80 @ 18/18/12 dBm |
| AP4020-PVT-05 | AP4020X | 8.47 | 8.74 | 10.20 | 1.73 | 802.3**at** |
| ap5010-lab | AP5010U | 9.75 | 9.90 | 10.30 | 0.55 | 1 Gbps eth |
| ap5050-lab-afc | AP5050D | 9.84 | 9.86 | 9.89 | 0.05 | — |

Three AP5020s with effectively identical configuration share a ~13.1 W floor but swing
0.74 W, 3.80 W, and 5.14 W. **This is why the design carries no per-component watt
breakdown** — a "radios drew 4.2 W" figure would be invented, and demonstrably unable to
distinguish PVT-01 from PVT-03.

## Design

Three layers, ordered by confidence, with the confidence stated in the UI:

| Layer | Confidence | Behaviour |
| --- | --- | --- |
| Unit correction | Measured fact | mW → W, driven by the API's `unit` field |
| Correlation at locked time | Measured | Every live series at T with delta, z-score, correlation |
| Config levers | Config certain, savings unverified | Names what is adjustable and its cost |

### Decisions

- **Baseline = rolling median of the loaded window.** Self-contained, no extra API calls,
  adapts when the duration changes. Rejected: multi-day profile (extra fetch), same-model
  fleet peers (N-AP fan-out per page load).
- **Advisory levers only.** Every lever is writable via `PUT /v1/aps/{serial}`, but
  coverage-affecting writes do not belong behind one click on a monitoring page. The card
  names the config location; the user makes the change.
- **All-null series are omitted, not charted.** `Interference`, `ClientData`, and
  `Available` return the string `"null"` for every sample on this build. A flat zero line
  reads as a measured value of nothing.
- **The verdict may be "unexplained."** That is the truthful answer for the observed spike,
  and the card says so along with why no further attribution is possible.

### Components

| File | Responsibility |
| --- | --- |
| `src/types/power.ts` | `PowerContext`, `SeriesMovement`, `PowerLever`, `PowerVerdict` |
| `src/services/powerAnalysis.ts` | `buildPowerContext()`, `derivePowerLevers()` — pure, no I/O |
| `src/components/insights/PowerContextCard.tsx` | Three-column presentation + verdict banner |
| `src/components/insights/PowerChart.tsx` | Power chart, extracted with the unit fix |
| `src/test/fixtures/apInsights.fixture.ts` | 90-sample live capture (the spike is in it) |
| `src/test/fixtures/apDetails.fixture.ts` | Live power-related AP config |

`buildPowerContext` reads the raw `APInsightsResponse` rather than the transformed chart
rows, because `transformReportData` collapses `"null"` to `0` via `parseFloat(v) || 0` —
which would make absent measurements indistinguishable from real zeroes.

### Statistics

- **Robust z-score** via median absolute deviation (`sigma = MAD × 1.4826`), falling back to
  standard deviation when MAD is 0 (common for integer series like client count), and `null`
  for a genuinely flat series. Chosen over a plain z-score so a single large spike does not
  inflate its own sigma and hide itself.
- **Verdict** requires both a local movement (|z| ≥ 2) **and** window-wide correlation
  (|r| ≥ 0.5) before claiming `explained`. A series that moves at T but does not track power
  overall is reported as likely coincidental — not as a cause.
- **Persistence** counts consecutive samples above the halfway point between baseline and
  the locked reading. ≥3 reads as sustained. The observed spike is a single sample: transient.

### Levers derived

From `/v1/aps/{serial}`: per-radio `channelwidth` (>20 MHz), 2.4 GHz `adminState` (only when
another band is up), `usbPower`, `psePower`, `iotEnabled`, `ledStatus`, `autoTxPowerMin`,
`forcePoEPlus`. Already-optimal levers are returned flagged rather than dropped, so the
operator can see what was checked. On AP5020-PVT-03 that is five already-optimal and three
actionable.

## Testing

44 tests. `powerAnalysis.test.ts` (33) covers unit conversion in both directions, unknown
units passing through unscaled, the real capture's floor/baseline/percentile, the
`unexplained` verdict on live data, all-null exclusion, z-score ranking, flat-series null
handling, sustained detection, single-sample and empty edge cases, and every lever branch.
`APInsights.test.tsx` (11) covers hidden-when-unlocked, watts-not-milliwatts when locked,
the verdict text, lever rendering, and graceful degradation when the AP config read fails.

## Out of scope — observed, not fixed

- **`duration=24H` / `7D` / `30D` return HTTP 500** on this controller for every widget,
  including `throughputReport`. Three of the four dropdown options are dead against this
  build. Only `3H` works.
- `Interference` / `ClientData` / `Available` all-null — server-side; hidden, not fixed.
- `apQoE` returns `enable: false` with an empty series.
- Extracting the remaining six chart cases from `APInsights.tsx` (still ~1450 lines).
