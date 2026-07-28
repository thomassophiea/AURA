# System Health / Diagnostics — Controller Surface + Derivation Map

**Controller:** `https://192.168.100.12:5825/management` · probed 2026-07-28.
Controller UI area: Tools → **DASHBOARD / UTILITIES / AP SERVICE / RADIUS SERVERS / AFC SERVER**,
with **System Health** (CONFIGURATION + OPERATIONAL check lists) and **Network Health** panels.

## No config-API endpoint for the checks
Every candidate 404s: `/v1/systemhealth`, `/v1/health`, `/v1/diagnostics`, `/v1/advisor`,
`/v1/recommendations`, `/v1/faults`, `/v1/afc/server`, `/v1/radiusservers`, `/v3/api-docs`, etc.
`/v1/switches` → 200 (empty). The controller computes these health checks; there is no
single REST endpoint. **Approach: compute the checks from real data** (`/v1/aps`,
`/v1/aps/query`, `/v3/sites`, `/v1/switches`, `/v3/profiles`). No fabrication.

## System Health checks → derivation (from Image 4)

| Check (controller wording) | Severity | Derivation from real data | Class |
|---|---|---|---|
| Standard Power APs using 3–6 dBm less than configured Tx Power (AFC compliance) | alert | `/v1/aps` radios: `pwrMode6` is SP & 6 GHz & `txMaxPower−txPower` ∈ [3,6] | ✅ config |
| 6 GHz Standard Power AP using Fixed/Manually-Assigned Fallback Channel | warn | radio 6 GHz & SP & `fallbackChannels.length>0` | ✅ config |
| AP has configuration Overrides | warn | any AP field/radio `*Ovr === true` | ✅ config |
| APs not running the recommended version image | warn | distinct `softwareVersion` vs fleet mode/newest | ✅ config |
| Mesh APs poll timeout is too low | alert | AP `pollTimeout` below threshold on mesh profiles | ✅ config |
| Multicast access fully open | warn | service/role multicast filter posture | ⚠ partial |
| Mesh Root point configured to use dynamic RF management policy | warn | meshpoint + `useSmartRf` radio | ✅ config |
| Enforce Manufacturing Certificate disabled (Extreme PKI) | warn | profile `enforcePkiAuth === false` | ✅ config |
| Backup of system configuration has not been scheduled | warn | backup schedule (not in config API) | ⚠ runtime |

## Network Health panel

| Metric | Source |
|---|---|
| Access Points in local / Active / Inactive | `/v1/aps/query` `status` counts (InService vs disconnected/critical) |
| Active / Inactive / Trouble Switches | `/v1/switches` (empty on this box) |
| Synchronization / Mobility / Availability status | runtime — not in config API (label as such) |

## Tabs
- **Dashboard** — System Health (Configuration + Operational) + Network Health (built above).
- **Utilities / AP Service** — action tools (traceroute, reboot, etc.) — represent structure; live actions runtime.
- **RADIUS Servers** — from AAA policy `authenticationRadiusServers` / `accountingRadiusServers` (nested in `/v1/aaapolicy`).
- **AFC Server** — AFC system config (server URL/status) — runtime; label. Config-side AFC lives per-radio + site `afcUpdate` (see SITE_AFC_GEO_FINDINGS.md).

**Build rule:** compute every ✅ check from live data; render ⚠ items with a "runtime — not exposed by controller config API" note. Never fabricate a green/red status.
