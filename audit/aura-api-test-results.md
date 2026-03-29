# AURA API Audit - Test Results

## Endpoints Currently Used (from api.ts)

### Access Points
- GET /v1/aps — getAccessPoints
- GET /v1/aps/query — used in AP filtering
- GET /v1/aps/{serial} — getAccessPointDetails
- GET /v1/aps/{serial}/stations — getAccessPointStations
- GET /v1/aps/ifstats — getAllAPInterfaceStats (bulk metrics)
- GET /v1/aps/ifstats?rfStats=true — RF stats
- GET /v1/aps/platforms — AP platform names
- GET /v1/aps/hardwaretypes — hardware type names
- GET /v1/aps/upgradeimagelist — firmware images
- PUT /v1/aps/reboot — reboot AP
- GET /v1/aps/{serial}/report — AP report
- GET /v1/report/aps/{serial}/smartrf — Smart RF report

### Sites
- GET /v3/sites — getSites
- POST /v3/sites — createSite
- PUT /v3/sites/{id} — updateSite
- DELETE /v3/sites/{id} — deleteSite
- GET /v1/state/sites — getSiteStates
- GET /v1/state/sites/{id} — single site state
- GET /v1/state/sites/{id}/aps — site AP states
- GET /v1/report/sites — getSitesReport
- GET /v1/report/sites/{id} — getSiteReport
- GET /v3/sites/{id}/report/venue — getVenueStatistics

### Clients / Stations
- GET /v1/stations — getStations
- GET /v1/stations/{mac} — getStation
- POST /v1/stations/disassociate — disassociateStations
- GET /v1/stations/events/{mac} — fetchStationEvents
- GET /platformmanager/v2/logging/stations/events/query — station events (platform)

### Reports / Analytics
- GET /v1/report/services/{id} — service report
- GET /v1/services/{id}/report — alternative service report
- GET /v1/report/stations/{id} — station report
- GET /v1/report/sites — site report (app insights)
- GET /v1/reports/widgets — widget definitions

### Configuration
- GET /v1/services — getServices
- GET /v3/roles — getRoles
- GET /v1/cos — getClassesOfService
- GET /v3/profiles — getProfiles
- GET /v3/rfmgmt — getRFMgmtPolicies
- GET /v3/adsp — getADSPProfiles
- GET /v1/rtlsprofile — getRTLSProfiles
- GET /v1/topologies — getTopologies
- GET /v1/aaa-policies — getAaaPolicies (note: Swagger uses /v3/aaa, may need verification)
- GET /v1/accesscontrol — getAccessControl
- GET /v1/radios/channels — getRadioChannels
- GET /v3/radios/smartrfchannels — getSmartRFChannels
- GET /v1/administrators — getAdministrators
- GET /v1/auditlogs — getAuditLogs

### System / Platform (non-Swagger)
- GET /platformmanager/v1/license/info — getLicenseInfo
- GET /platformmanager/v1/license/usage — getLicenseUsage
- POST /platformmanager/v1/license/install — installLicense
- GET /platformmanager/v1/configuration/backups — listBackups
- POST /platformmanager/v1/configuration/backup — createBackup
- GET /platformmanager/v1/flash/files — getFlashFiles
- GET /platformmanager/v1/version — getVersion
- GET /platformmanager/v1/cluster/status — getClusterStatus
- GET /platformmanager/v1/reports/systeminformation — getSystemInfo
- GET /platformmanager/v1/network/ping — networkPing
- POST /platformmanager/v1/network/traceroute — networkTraceroute
- POST /platformmanager/v1/network/dns — networkDnsLookup

### Security (not in Swagger)
- GET /v1/security/rogue-ap/list — getRogueAPList
- POST /v1/security/rogue-ap/detect — detectRogueAPs
- POST /v1/security/rogue-ap/{mac}/classify — classifyRogueAP
- GET /v1/security/threats — getSecurityThreats

---

## Swagger Endpoints NOT Used (Enhancement Opportunities)
- GET /v1/state/aps — AP operational state (real health data - not used in AccessPoints component)
- GET /v1/state/switches — Switch state
- GET /v1/state/entityDistribution — Entity distribution
- GET /v4/adsp/{id} — v4 ADSP individual profile detail (bulk /v4/adsp is now used; detail endpoint not yet used)
- GET /v1/aps/{serial}/lldp — LLDP info per port
- GET /v1/aps/{serial}/location — Station locations for AP
- GET /v2/report/upgrade/devices — Device upgrade report
- GET /v3/roles/{id}/rulestats — Role rule stats
- GET /v1/roles/{id}/stations — Stations with role
- GET /v1/notifications/regional — Regional notifications
- GET /v1/dpisignatures — DPI signature profiles (app analytics)
- GET /v3/meshpoints — Mesh topology
- GET /v3/switchportprofile — Switch port profiles
- GET /v1/deviceimages/{hwType} — Device images by hardware type

---

## Critical Issues Found and Fixed

| # | Component | Issue | Fix Applied |
|---|-----------|-------|-------------|
| 1 | AccessPoints.tsx | Debug logging with hardcoded serial 'CV012408S-C0102' | Removed |
| 2 | SitesOverview.tsx | Health always 100%, status always 'online', clients always 0 | Fixed: uses /v1/state/sites + /v1/stations |
| 3 | PerformanceAnalytics.tsx | health=85, uptime=95 hardcoded fallbacks | Fixed: uses null for missing data |
| 4 | ClientDetail.tsx | Hardcoded debug site UUID c7395471... | Removed |
| 5 | APInsights.tsx | Zero values (idle AP) filtered as "no data" | Fixed: 0 is now a valid reading |
| 6 | sleDataCollection.ts | Math.random() for successful_connects, ap_health, switch_health | Fixed: removed random; uses real RSSI-based calculation or omits metric |
| 7 | sleDataCollection.ts | Coverage metric inverted (% poor = higher worse) | Fixed: now % good coverage (higher = better) |
| 8 | ServiceLevelsEnhanced.tsx | Math.random() for reliability, uptime, successRate, errorRate | Fixed: omitted (no real data source) |
| 9 | ServiceLevelsEnhanced.tsx | Math.random() in time-series generation | Fixed: removed random variation |
| 10 | api.ts | /v3/adsp deprecated by Swagger (v4 available) | Fixed: upgraded all ADSP calls to /v4/adsp |
| 11 | api.ts | getAaaPolicies used /v1/aaa-policies (path not in Swagger) | Fixed: corrected to /v1/aaapolicy |
| 12 | APFirmwareManager.tsx | Version match used substring (false positives) | Fixed: exact match with split fallback |
| 13 | ApplicationsManagement.tsx | Client ID/secret generated with Math.random() (insecure) | Fixed: uses crypto.getRandomValues() |
| 14 | SiteDetail.tsx | All data was hardcoded/mock (AP count, clients, status) | Fixed: real API calls to state/sites, aps, stations |
| 15 | RFAnalyticsWidget.tsx | channelUtilization used Math.random() * 60 fallback | Fixed: skips radios with no utilization data |

---

## Endpoint Validation Notes
- /v1/security/* endpoints: Not in Swagger v1.25.1. May be proprietary to specific controller versions.
- /platformmanager/v1/* endpoints: Not in main Swagger. Separate Platform Manager API.
- /v1/aaa-policies: Swagger shows /v3/aaa — verify actual path on controller.
- AP model field: API may return model in hardwareType, apModel, or platformName rather than model field.

---

# Plan 2 Findings: Monitor & Dashboard API Audit

Generated: 2026-03-28
Scope: 7 Monitor/Dashboard pages + 3 detail panels

## Plan 2 Summary

| Metric | Count |
|--------|-------|
| Pages audited | 10 (7 pages + 3 detail panels) |
| Endpoints validated | 37 |
| Issues found | 11 |
| Code fixes applied | 8 |
| Enhancement opportunities documented | 14 |
| Pages cleaner than expected | 5 (AppInsights, ConnectedClients, AccessPoints, ClientDetail, SiteDetail) |

## Workspace

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/v1/aps/query` | YES | REAL | — |
| `/v1/stations` | YES | REAL | — |
| `/v3/sites` | YES | REAL | — |
| `/v1/report/sites/{siteId}` | YES | REAL | — |
| `/v1/notifications` | YES | REAL (after fix) | fetchAlertsList now uses /v1/notifications |
| `/v1/alarms/active` (via getActiveAlarms) | NO | NON-SWAGGER | fetchAlarmsList now uses /v1/notifications filtered |
| `/v1/aps/{serial}/alarms` (contextual_insights.*) | NO | NON-SWAGGER | Documented — see AP Detail fix |
| `/v1/auditlogs` | YES | REAL | — |

Fixes: 2

## Dashboard Enhanced

All 11 endpoints are Swagger-documented. Notifications chain (`/v1/notifications` → `/v1/alerts` fallback) acceptable. No fixes needed.

## SLE Dashboard

All 4 endpoints are Swagger-documented. SLE calculations are legitimate derived metrics from station RSSI/SNR/txRate fields. No fixes needed.

## App Insights

Both endpoints (`/v3/sites`, `/v1/report/sites`) are Swagger-documented. Cleanest page in scope. No fixes needed.

## Connected Clients

All 6 endpoints are Swagger-documented. Reference pattern page. No fixes needed.

## Access Points

All 7 endpoints are Swagger-documented. Cable health is correctly derived from `ap.ethPorts[].speed`. No fixes needed.

## Report Widgets (highest priority)

| Widget | Pre-Fix Status | Fix Applied |
|--------|----------------|-------------|
| Network Utilization (→ Client Load Index) | PARTIAL: `count/10` formula | Renamed + formula fixed (raw count) |
| Connected Clients | REAL | — |
| AP Health | REAL | — |
| Network Throughput (→ Total Traffic Volume) | PARTIAL: `bytes/60` assumes 60s window | Renamed + shows cumulative MB |
| Signal Quality | REAL | — |
| Security Events (→ Security Notifications) | MOCK: `/v1/events?type=security` not in Swagger | Fixed: uses `/v1/notifications` filtered |
| Active Alerts | MOCK: `/v1/alerts` not in Swagger | Fixed: uses `/v1/notifications` severity filter |
| Performance Score (→ Performance Score Derived) | PARTIAL: synthetic composite | Labeled "(Derived)" with code comment |

Fixes: 5

## AP Detail Panel

| Endpoint | Swagger? | Fix Applied |
|----------|----------|-------------|
| `/v1/aps/{serial}` | YES | — |
| `/v1/aps/{serial}/stations` | YES | — |
| `/v1/aps/{serial}/alarms` | NO | try/catch added — returns [] on failure with warn log |

Fix: `getAccessPointEvents()` now returns `[]` instead of throwing when alarms endpoint unavailable.

## Client Detail Panel

Both endpoints (`/v1/stations/{mac}`, `/v1/stations/{stationId}/report`) are Swagger-documented. No fixes needed.

## Site Detail Panel

All 3 endpoints (`/v1/state/sites/{siteId}`, `/v1/aps/query`, `/v1/stations`) are Swagger-documented. SiteDetail is simpler than the feature matrix suggested — does not call fetchWidgetData or getAppInsights. No fixes needed.

## Enhancement Opportunities (Plan 5)

| Page | Endpoint | Use Case |
|------|----------|----------|
| Workspace | `/v1/state/entityDistribution` | Health overview widget |
| Workspace | `/v1/bestpractices/evaluate` | Best practices widget |
| Dashboard Enhanced | `/v1/state/sites` | Site health in header |
| Report Widgets | `/v1/reports/widgets` | Dynamic widget catalog |
| Report Widgets | `/v1/report/sites/{siteId}` channelUtil | Real channel utilization |
| Access Points | `/v1/aps/{serial}/cert` | Certificate expiry |
| Access Points | `/v1/aps/{serial}/lldp` | Switch topology |
| Access Points | `/v1/aps/hardwaretypes` | Model filter |
| AP Detail | `/v1/aps/{serial}/report` | Migrate from non-Swagger /alarms |
| AP Detail | `/v1/report/aps/{serial}/smartrf` | Smart RF analytics |
| Client Detail | `/v1/stations/{stationId}/location` | Location history |
| Site Detail | `/v1/report/sites/{siteId}/smartrf` | Site Smart RF data |

---

# Plan 3 Findings: Configure & System Pages API Audit

Generated: 2026-03-28
Scope: 7 Configure pages + 8 System pages + 5 Tools/Admin pages (20 total)

## Plan 3 Summary

| Metric | Count |
|--------|-------|
| Pages audited | 20 |
| Endpoints validated | 43 |
| Issues found | 11 |
| Code fixes applied | 10 |
| Platform Manager pages with new info banners | 3 |
| Enhancement opportunities documented | 6 |

---

## Task 1: Configure Pages

### ConfigureSites

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/v3/sites` | YES | REAL | — |
| `/v1/stations` + `/v1/aps/query` | YES | REAL | — |

All endpoints Swagger-documented. CRUD operations (POST/PUT/DELETE /v3/sites) also Swagger-documented. No fixes needed.

### ConfigureNetworks

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/v1/services` | YES | REAL | — |
| `/v1/services/{serviceId}/stations` | YES | REAL | — |
| `/v3/sites` | YES | REAL | — |
| `getDeviceGroupsBySite()` → platformmanager | NO | NON-SWAGGER | Documented — no Swagger analog for device groups |
| `/v3/profiles` | YES | REAL | — |

One non-Swagger endpoint (`getDeviceGroupsBySite`). This is a controller-specific feature with no Swagger analog. Documented as enhancement gap.

### ConfigurePolicy

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/v3/roles` | YES | REAL | — |
| `/v3/topologies` | YES | REAL | — |
| `/v3/cos` → `/v1/cos` | PARTIAL | FIXED | `getClassOfService()` in api.ts updated to use `/v1/cos` (Swagger-documented) |

Fix: `getClassOfService()` was calling `/v3/cos` which is not in Swagger. Corrected to `/v1/cos`.

### ConfigureAAAPolicies

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/v1/aaapolicy` (getAAAPolicies) | YES | REAL | — |
| `/v1/aaapolicy` (getAaaPolicies) | YES | REAL | — |

Duplicate calls to same endpoint merged via `Promise.all`. Both are Swagger-documented. No fix needed.

### ConfigureGuest

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/v1/services` | YES | REAL | — |
| `/v3/roles` | YES | REAL | — |
| `/v1/eguest` | YES | REAL | — |
| `/v1/guests` | NO | NON-SWAGGER | `getGuests()` now throws on non-ok (was silently returning []); ConfigureGuest tracks `guestAccountsApiAvailable` state; shows unavailable notice instead of misleading empty state |

Fix: `/v1/guests` is not in Swagger. The `getGuests()` API method was modified to throw on failure. ConfigureGuest now shows an explicit "Guest accounts API not available" message instead of "No guest accounts" when the endpoint is unavailable.

Note: `/v1/eguest` (eGuest profiles) and `/v1/guests` (guest accounts) serve different purposes. `/v1/eguest` is Swagger-documented and works correctly for captive portal profile management. Guest account provisioning (`/v1/guests`) is a separate resource not in Swagger.

### ConfigureAdvanced

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/v3/topologies` | YES | REAL | — |
| `/v1/cos` | YES | REAL | — |
| `/v1/ratelimiters` | YES | REAL | — |
| `/v3/profiles` | YES | REAL | — |
| `/v3/iotprofile` | YES | REAL | — |
| `/v3/meshpoints` | YES | REAL | — |
| `/v1/accesscontrol` | YES | REAL | — |
| `/v3/xlocation` | YES | REAL | — |
| `/v1/rtlsprofile` | YES | REAL | — |
| `/v3/positioning` | YES | REAL | — |
| `/v3/analytics` | YES | REAL | — |

All 11 endpoints are Swagger-documented. Minor: several load functions use silent `catch { setItems([]) }` without user-visible error messages. These are noted as minor quality issues but not critical (all endpoints are Swagger-real).

### ConfigureAdoptionRules

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/v1/devices/adoptionrules` or `/v1/aps/adoptionrules` | YES | REAL | — |
| `/v3/sites` (was `/v1/sites`) | YES | FIXED | Updated `makeAuthenticatedRequest('/v1/sites')` → `/v3/sites` |

Fix: The inline `makeAuthenticatedRequest('/v1/sites')` was using the deprecated v1 path. Changed to `/v3/sites` to match the Swagger primary endpoint.

---

## Task 2: System Pages (Non-Swagger)

### SystemBackupManager

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/platformmanager/v1/configuration/backups` | NO | PLATFORM MGR | Info banner added |
| `/platformmanager/v1/flash/files` | NO | PLATFORM MGR | Silent error logged |
| `/platformmanager/v1/flash/usage` | NO | PLATFORM MGR | Info banner added |

Fix: Added Platform Manager dependency info banner to page header. The `loadFlashInfo` catch block had no user feedback — added a code comment explaining why (intentionally silent for flash info, which is supplementary). Main backup load already had `toast.error`.

### LicenseDashboard

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/platformmanager/v1/license/info` | NO | PLATFORM MGR | Info banner added |
| `/platformmanager/v1/license/usage` | NO | PLATFORM MGR | Info banner added |

Fix: Added Platform Manager dependency info banner above license stats grid.

### NetworkDiagnostics

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/platformmanager/v1/network/ping` | NO | PLATFORM MGR | Info banner added |
| `/platformmanager/v1/network/traceroute` | NO | PLATFORM MGR | Info banner added |
| `/platformmanager/v1/network/dns` | NO | PLATFORM MGR | Info banner added |

Fix: Added Platform Manager dependency info banner. The error messages ("Ping failed. Please check the hostname and try again") were already visible to users but didn't explain the underlying Platform Manager dependency.

### EventAlarmDashboard

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/v1/events` → `/v1/auditlogs` | YES (after fix) | FIXED | Replaced with `/v1/auditlogs` via `getAuditLogs()` |
| `/v1/alarms` | NO | NON-SWAGGER | Using `Promise.allSettled`; warns on failure |
| `/v1/alarms/active` | NO | NON-SWAGGER | Using `Promise.allSettled`; warns on failure |

Fix: The "Events" tab now fetches `/v1/auditlogs` (Swagger-documented) instead of `/v1/events` (non-Swagger). Audit log fields are mapped to the event display model:
- `log.action || log.actionType || log.resourceType` → `event.type`
- `log.severity` → `event.severity`
- `log.description || log.message` → `event.message`
- `log.timestamp || log.time` → `event.timestamp`

The `/v1/alarms` and `/v1/alarms/active` endpoints have no Swagger analog. Kept with `Promise.allSettled` so failures are handled gracefully with console warnings.

### SecurityDashboard

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/v1/security/rogue-ap/list` | NO | NON-SWAGGER | `Promise.allSettled`; API unavailable banner when both fail |
| `/v1/security/threats` | NO | NON-SWAGGER | `Promise.allSettled`; API unavailable banner when both fail |

ADSP assessment: `/v3/adsp` and `/v4/adsp` return **Air Defense profile configurations** (settings objects with detection thresholds, exclusion lists, etc.), NOT detected rogue AP instances. They are fundamentally different resources. Replacing `/v1/security/rogue-ap/list` with `/v3/adsp` would break the rogue AP table entirely.

Fix: Kept current endpoints but improved error handling — `Promise.allSettled` now tracks API availability. When both security endpoints fail, an explicit "Security API endpoints not available on this controller" banner is shown instead of the misleading "No rogue access points detected / environment is secure" empty state.

---

## Task 3: Remaining System Pages

### APFirmwareManager

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/v1/aps/query` | YES | REAL | — |
| `/v1/aps/upgradeimagelist` | YES | REAL | — |

Both endpoints are Swagger-documented. Error handling uses `toast.error`. No fixes needed.

Enhancement opportunity: `/v2/report/upgrade/devices` could provide firmware upgrade history.

### PCIReport

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/v3/sites` | YES | REAL | — |
| `/v1/services` | YES | REAL | — |
| `/v1/aps/query` | YES | REAL | — |

All 3 endpoints are Swagger-documented with proper `toast.error` handling. PCI compliance check logic is sound (derives encryption type, checks for outdated firmware, validates VLAN assignments). No fixes needed.

### GuestManagement

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/v1/guests` | NO | NON-SWAGGER | `getGuests()` now throws on failure; shows API unavailable state |

Fix: Same as ConfigureGuest. `getGuests()` now throws on non-ok responses. GuestManagement tracks `guestsApiAvailable` state. When the endpoint fails, shows "Guest accounts API not available on this controller" instead of the misleading "No guest accounts" empty state.

---

## Task 4: Tools & Admin Pages

### Tools (System Logs tab)

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/v1/events` → `/v1/auditlogs` | YES (after fix) | FIXED | Replaced with `getAuditLogs()` |

Fix: The System Logs panel was calling `getEvents()` which used `/v1/events` (non-Swagger). Updated to `getAuditLogs()` which uses `/v1/auditlogs` (Swagger-documented). Added log-level client-side filtering since `/v1/auditlogs` doesn't have a severity query param.

### Administration (ApplicationsManagement)

| Endpoint | Swagger? | Status | Fix Applied |
|----------|----------|--------|-------------|
| `/platformmanager/v1/apps` | NO | PLATFORM MGR | Error message improved |

Assessment: `/platformmanager/v1/apps` returns installed applications with status/version fields. `/v1/appkeys` returns OAuth API key credentials (clientId, clientSecret). These serve different purposes — not a compatible replacement. Component already has `apiNotAvailable` state with a proper UI fallback. Improved the error message to clarify why Platform Manager is needed and that `/v1/appkeys` is not a substitute.

### ApiTestTool

Developer tool using user-defined endpoints. Auth headers properly attached via `makeAuthenticatedRequest`. No endpoint fixes needed — by design.

### ApiDocumentation, HelpPage

Static content only. No API calls. No fixes needed.

---

## Plan 3 Enhancement Opportunities

| Page | Endpoint | Use Case |
|------|----------|----------|
| APFirmwareManager | `/v2/report/upgrade/devices` | Firmware upgrade history |
| EventAlarmDashboard | `/v1/alarms` (Swagger TBD) | Proper alarm data if endpoint added to spec |
| SecurityDashboard | `/v1/security/*` (Swagger TBD) | Rogue AP data if endpoints added to spec |
| ConfigureNetworks | Device groups API | Controller-specific; no Swagger analog currently |
| GuestManagement | `/v1/guests` (Swagger TBD) | Guest accounts if endpoint added to spec |
| ConfigureAdvanced | All 11 endpoints | Add user-visible error toasts to silent catch blocks |
