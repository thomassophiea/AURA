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
