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
