# Wi-Fi 7 (MLO) + AFC — Controller Schema Audit

**Controller:** `https://192.168.100.12:5825/management` (ExtremeCloud IQ Controller, OS ONE)
**SW:** 10.18.1.0-011R · **Admin role:** FULL (RW) · **Probed:** 2026-07-28
**Raw captures:** `audit/wifi7-probe/*.json`

> Source of truth for the AURA Wi-Fi 7 page. Every field below was read from
> the live controller, not inferred from the spec. The management API is on
> **port 5825**, not 443 (Apache on 443 returns 404 for `/management/*`).

## Fleet (Wi-Fi 7 capable hardware present)

| Serial | Name | Model | EHT (802.11be) |
|---|---|---|---|
| CV012408S-C0102 | AP5020-PVT-01 | AP5020-WW | ✅ radios `gnxbe/ancxbe/ax6be` |
| CV012408S-C0044 | AP5020-PVT-02 | AP5020-WW | ✅ |
| CV012408S-C0078 | AP5020-PVT-03_MESH_ROOT | AP5020-WW | ✅ |
| WM012243W-30032 | ap5010-lab | AP5010U-WW | ✅ |
| WM042233W-30032 | ap5050-lab-afc | AP5050D-WW | 6E (`gnx/ancx/ax6`), AFC SP |
| WF022448S-C0023 | AP4020-PVT-05_MESH_RELAY | AP4020X-WW | 6E |

## AFC — Automated Frequency Coordination

**AFC state lives on the per-radio object inside `GET /v1/aps/{serial}` → `radios[]`.**
There is **no** `/v1/afc/plans` endpoint on this controller (returns **404**) — the
existing `src/components/AFCPlanningTool.tsx` calls a route that does not exist here.

Per-radio AFC fields (real values observed):

| Field | Type | Observed values | Meaning |
|---|---|---|---|
| `afc` | boolean | `true` on 6 GHz of `ap5050-lab-afc`, else `false` | AFC coordination enabled on this radio |
| `pwrMode6` | string enum | `LPI`, `SP_WITH_LPI_FALLBACK` (spec also: `SP`) | 6 GHz power mode |
| `pwrMode6Ovr` | boolean | `false` | field overridden from profile inheritance |
| `txMaxPower` | number (dBm) | `17` | configured ceiling |
| `txPower` | number (dBm) | `9` on AFC-SP radio vs `17` on LPI | **actual** power — the gap is the AFC/SmartRF cap |
| `mode` | string | `ax6`, `ax6be` | 6 GHz radio; `be` suffix = 802.11be/Wi-Fi 7 |
| `opChannel` | string | `49e`, `23e/80` | `e` suffix = EHT/6 GHz PSC; `/80` = width |
| `channelwidth` | string | `Ch1Width_80MHz` (6 GHz can be `Ch1Width_320MHz`) | operating width |

**AFC power cap is real and visualizable:** `ap5050-lab-afc` radio 3 = `afc:true`,
`pwrMode6:SP_WITH_LPI_FALLBACK`, `txMaxPower:17` but `txPower:9` — a **8 dB AFC cap**.

**AP geolocation for AFC** (write target): `ftm.wgs84 {latitude, longitude, altitude}`
and `elevation {height, uncertainty}` on the AP body. (Lab AP currently 0/0.)

**Band-level power/channel context:** `GET /v3/rfmgmt` (SmartRF/ACS policies) →
`smartRf.powerAndChannel.bandSettings[]` with `bandId` (`Band24/Band5/Band6`),
`txMaxPower`, `txMinPower`, `channelWidth`, `acsPlan`, `acsList`.

## MLO — Multi-Link Operation

MLO is **config-plane** on this controller. Binding fields:

| Field | Location | Observed | Meaning |
|---|---|---|---|
| `mloServiceIDs` | AP body + `/v3/profiles/{id}` | `[]` everywhere (unconfigured) | service IDs grouped for MLO |
| `cb` | `radios[]` | `[]` | combined-band group members |
| `cbServiceId` | `radios[]` | `null` | combined-band service binding |
| `mode` `…be` | `radios[]` | `gnxbe/ancxbe/ax6be` on AP5020 | 802.11be EHT capability per band |

**EHT capability is derivable and real:** a radio is Wi-Fi 7 / 802.11be capable iff
its `mode` ends in `be`. AP5020 = EHT on all three bands; AP5050D/AP4020X = 6E only.

### ⚠️ Runtime per-link MLO telemetry is NOT exposed

`GET /v1/stations` returns single-link association only:
`{ macAddress, rss, channel, protocol, radioId, receivedRate, transmittedRate, capability, … }`.
There is **no** MLD MAC, **no** affiliated-link list, **no** per-link RSSI/rate.
Observed client protocols: `802.11bgn`, `802.11ax`, `802.11ac` — **zero 802.11be
clients currently associated**.

**Consequence:** the MLO surface must be **config + capability oriented** (which
radios are EHT-capable, which services are MLO-grouped across which bands, client
`protocol` readiness). Per-link MLO RSSI/throughput graphs would require data the
controller API does not return — AURA must show an honest "not exposed by
controller" state rather than fabricate it.

## Write contract (verified)

`PUT /v1/aps/{serialNumber}` with the **full** `GET` body → **200**, read-back
preserves state (idempotent round-trip tested on `ap5050-lab-afc`, 2026-07-28).
Follow ai-first discipline: GET → mutate radio/`mloServiceIDs` → PUT → re-GET verify.
Set the corresponding `*Ovr` flag (`pwrMode6Ovr`) when overriding an inherited value.

## AURA build mapping (integrated into existing Configure pages)

MLO and AFC are surfaced where the controller itself organizes them, not on a
standalone page. Writes ride the existing editor PUTs (full-record `/v1/aps/{s}`
and `/v3/profiles/{id}`), so no bespoke write service is needed.

| Surface | Where in AURA | Persistence |
|---|---|---|
| AFC config (radio `afc` + `pwrMode6`) | Configure → Access Points → radio editor (`ApRadioCard.tsx`, Band6 block) + inline `AfcPowerBar` | AP editor `PUT /v1/aps/{s}` (full record) |
| MLO grouping (`mloServiceIDs`) | Configure → Device Profiles → Networks (`NetworksTab.tsx` MLO column) + inline 802.11be capability strip; per-AP override in `WlanOvrDialog.tsx` | profile `PUT /v3/profiles/{id}` / AP `PUT /v1/aps/{s}` |
| EHT capability / power-mode badges | shared `src/components/wifi7/wifi7Viz.tsx` + `wifi7Model.ts` (`projectApRadio`, `ehtBands`, `isEht`) | read-only projection |
| Dead code to retire | `AFCPlanningTool.tsx` calls `GET /v1/afc/plans` (404) | flag / replace with the per-radio AFC surface above |
