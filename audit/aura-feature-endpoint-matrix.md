# AURA Feature-to-Endpoint Matrix

Generated: 2026-03-28
Source: All page components in `src/components/`, API service `src/services/api.ts`, Swagger catalog

---

## Matrix

| Page | Feature/Widget | Component | Current API Call(s) | Swagger Path | Method | Fields Used | Status |
|------|---------------|-----------|---------------------|--------------|--------|-------------|--------|
| **Workspace** | AP widgets (list, count, status, channel util, by model) | Workspace → workspaceDataService | `api.getAccessPoints()` | `/v1/aps/query` | GET | serialNumber, hostSite, status, hardwareType, channelUtil | ✅ Real |
| **Workspace** | Client widgets (list, timeseries, by device type, by manufacturer, by band, by SSID, count) | Workspace → workspaceDataService | `api.getStationsWithSiteCorrelation()` → `/v1/stations` + `/v1/aps/query` | `/v1/stations`, `/v1/aps/query` | GET | macAddress, hostName, ipAddress, signalStrength, ssid, apSerialNumber | ✅ Real |
| **Workspace** | Client experience RF widgets | Workspace → workspaceDataService | `api.getSites()`, `api.fetchWidgetData(siteId, ['rfQuality', ...])` | `/v3/sites`, `/v1/report/sites/{siteId}` | GET | rfQuality widget data | ✅ Real |
| **Workspace** | App Insights widgets | Workspace → workspaceDataService | `api.getAppInsights(timeRange, siteId)` | `/v1/report/sites`, `/v1/report/sites/{siteId}` | GET | topAppGroupsByUsage, topAppGroupsByThroughputReport | ✅ Real |
| **Workspace** | Contextual Insights / Alerts | Workspace → workspaceDataService | `api.getAccessPoints()`, `api.getStationsWithSiteCorrelation()` | `/v1/aps/query`, `/v1/stations` | GET | Derived insight metrics | ✅ Real |
| **Dashboard Enhanced** | Stations / connected clients | DashboardEnhanced | `apiService.makeAuthenticatedRequest('/v1/stations')` | `/v1/stations` | GET | All station fields | ✅ Real |
| **Dashboard Enhanced** | SSID / network services list | DashboardEnhanced | `apiService.getServicesBySite(siteFilter)` / `makeAuthenticatedRequest('/v1/services')` | `/v1/services` | GET | id, name, ssid, security | ✅ Real |
| **Dashboard Enhanced** | Notifications / Alerts | DashboardEnhanced | `apiService.makeAuthenticatedRequest('/v1/notifications')`, fallback `/v1/alerts` | `/v1/notifications` | GET | notification list | ✅ Real |
| **Dashboard Enhanced** | Site-scoped AP list | DashboardEnhanced | `apiService.getAccessPointsBySite(siteId)` → `/v1/aps/query` | `/v1/aps/query` | GET | serialNumber, hostSite, status | ✅ Real |
| **Dashboard Enhanced** | RF quality data | DashboardEnhanced | `apiService.fetchRFQualityData(siteId, '24H')` → `/v1/report/sites/{siteId}` | `/v1/report/sites/{siteId}` | GET | rfQuality widget | ✅ Real |
| **Dashboard Enhanced** | AP interface stats (RF) | DashboardEnhanced | `apiService.getAPInterfaceStatsWithRF()` | `/v1/aps/ifstats?rfStats=true` | GET | channelUtil, signalStrength, noise | ✅ Real |
| **Dashboard Enhanced** | Station detail on click | DashboardEnhanced | `apiService.fetchStationDetails(client.mac)` | `/v1/stations/{macaddress}` | GET | Full station object | ✅ Real |
| **Dashboard Enhanced** | Client events on click | DashboardEnhanced | `apiService.fetchStationEvents(selectedClient.macAddress)` | `/v1/stations/events/{macaddress}` | GET | Event history | ✅ Real |
| **Dashboard Enhanced** | Site lookup for name display | DashboardEnhanced | `apiService.getSiteById(siteFilter)` | `/v3/sites/{siteId}` | GET | id, name | ✅ Real |
| **SLE Dashboard** | Site list dropdown | SLEDashboard | `apiService.getSites()` | `/v3/sites` | GET | id, name | ✅ Real |
| **SLE Dashboard** | Client list (site-scoped) | SLEDashboard | `apiService.makeAuthenticatedRequest('/v3/sites/{siteId}/stations')` | `/v3/sites/{siteid}/stations` | GET | macAddress, hostName, rssi, band | ✅ Real |
| **SLE Dashboard** | AP list (site-scoped) | SLEDashboard | `apiService.getAccessPointsBySite(siteFilter)` | `/v1/aps/query` | GET | serialNumber, hostSite, status | ✅ Real |
| **App Insights** | Site list dropdown | AppInsights | `api.getSites()` | `/v3/sites` | GET | id, name | ✅ Real |
| **App Insights** | Top/Worst apps by usage, throughput, client count | AppInsights | `api.getAppInsights(duration, siteId)` → `/v1/report/sites` with widgetList | `/v1/report/sites`, `/v1/report/sites/{siteId}` | GET | topAppGroupsByUsage, topAppGroupsByClientCountReport, topAppGroupsByThroughputReport, worstApp* variants | ✅ Real |
| **Connected Clients** | AP list for site filter | TrafficStatsConnectedClients | `apiService.getAccessPointsBySite(siteFilter)` | `/v1/aps/query` | GET | serialNumber, hostSite | ✅ Real |
| **Connected Clients** | Stations table | TrafficStatsConnectedClients | `apiService.makeAuthenticatedRequest('/v3/sites/{siteFilter}/stations')`, fallback `/v1/stations` | `/v3/sites/{siteid}/stations`, `/v1/stations` | GET | macAddress, hostName, ipAddress, apSerial, signalStrength, band, ssid | ✅ Real |
| **Connected Clients** | SSID/service filter | TrafficStatsConnectedClients | `apiService.getServicesBySite(siteFilter)` / `makeAuthenticatedRequest('/v1/services')` | `/v1/services` | GET | id, name, ssid | ✅ Real |
| **Connected Clients** | Site lookup | TrafficStatsConnectedClients | `apiService.getSiteById(siteFilter)` | `/v3/sites/{siteId}` | GET | id, name | ✅ Real |
| **Connected Clients** | Client event history | TrafficStatsConnectedClients | `apiService.fetchStationEvents(selectedClient.macAddress)` | `/v1/stations/events/{macaddress}` | GET | event type, timestamp, apSerial | ✅ Real |
| **Connected Clients** | Client detail inline | TrafficStatsConnectedClients | `apiService.fetchStationDetails(client.mac)` | `/v1/stations/{macaddress}` | GET | Full station record | ✅ Real |
| **Access Points** | AP query columns | AccessPoints | `apiService.getAPQueryColumns()` | `/v1/aps/query/columns` | GET | Column definitions | ✅ Real |
| **Access Points** | AP list table | AccessPoints | `apiService.getAccessPoints()` | `/v1/aps/query` | GET | serialNumber, hostSite, hardwareType, status, ipAddress | ✅ Real |
| **Access Points** | AP stations (clients on AP) | AccessPoints | `apiService.getAccessPointStations(ap.serialNumber)` | `/v1/aps/{apserialnum}/stations` | GET | macAddress, hostName, signalStrength | ✅ Real |
| **Access Points** | AP interface stats | AccessPoints | `apiService.getAllAPInterfaceStats()` | `/v1/aps/ifstats` | GET | channelUtil, noise, txPower | ✅ Real |
| **Access Points** | AP detail (row expand) | AccessPoints | `apiService.getAccessPointDetails(ap.serialNumber)` | `/v1/aps/{apSerialNumber}` | GET | Full AP detail object | ✅ Real |
| **Access Points** | Mesh AP roles | AccessPoints | `apiService.getMeshAPRoles(aps)` → `/v3/meshpoints` | `/v3/meshpoints` | GET | meshRole, serialNumber | ✅ Real |
| **Access Points** | AP real-time state | AccessPoints | `apiService.getAPStates()` | `/v1/state/aps` | GET | serialNumber, state, uptime | ✅ Real |
| **Report Widgets** | Network Utilization widget | ReportWidgets | `makeAuthenticatedRequest('/v1/stations')` | `/v1/stations` | GET | count (derived: count/10) | 🔶 Partial — derived metric from station count, not real utilization |
| **Report Widgets** | Connected Clients widget | ReportWidgets | `makeAuthenticatedRequest('/v1/stations')` | `/v1/stations` | GET | count | ✅ Real |
| **Report Widgets** | AP Health widget | ReportWidgets | `makeAuthenticatedRequest('/v1/aps')` | `/v1/aps` | GET | status (connected %) | ✅ Real |
| **Report Widgets** | Network Throughput widget | ReportWidgets | `makeAuthenticatedRequest('/v1/stations')` | `/v1/stations` | GET | inBytes/rxBytes, outBytes/txBytes (derived) | 🔶 Partial — bytes÷60s assumed interval; not an actual throughput metric |
| **Report Widgets** | Signal Quality widget | ReportWidgets | `makeAuthenticatedRequest('/v1/stations')` | `/v1/stations` | GET | signalStrength / rss (averaged) | ✅ Real |
| **Report Widgets** | Security Events widget | ReportWidgets | `makeAuthenticatedRequest('/v1/events?type=security')`, fallback `/v1/notifications` | `/v1/notifications` (Swagger) | GET | type, category, severity, description (keyword-filtered) | ⚠️ Mock — `/v1/events` not in Swagger; keyword match on notifications is fragile |
| **Report Widgets** | Active Alerts widget | ReportWidgets | `makeAuthenticatedRequest('/v1/alerts')` | `/v1/alerts` (non-Swagger) | GET | status | ⚠️ Mock — `/v1/alerts` not in Swagger catalog |
| **Report Widgets** | Performance Score widget | ReportWidgets | `makeAuthenticatedRequest('/v1/aps')` + `/v1/stations` | `/v1/aps`, `/v1/stations` | GET | status (AP), signalStrength (client) | 🔶 Partial — synthetic score, no API analog |
| **Configure Sites** | Sites list | ConfigureSites | `makeAuthenticatedRequest('/v3/sites')` | `/v3/sites` | GET | id, name, country, timezone, address | ✅ Real |
| **Configure Sites** | Stations for correlation | ConfigureSites | `apiService.getStationsWithSiteCorrelation()` | `/v1/stations`, `/v1/aps/query` | GET | macAddress, apSerialNumber | ✅ Real |
| **Configure Networks** | WLAN / Services list | ConfigureNetworks | `apiService.getServices()` | `/v1/services` | GET | id, name, ssid, security, vlanId | ✅ Real |
| **Configure Networks** | Service stations (clients per WLAN) | ConfigureNetworks | `apiService.getServiceStations(service.id)` | `/v1/services/{serviceId}/stations` | GET | stations per service | ✅ Real |
| **Configure Networks** | Sites list (for assignment) | ConfigureNetworks | `apiService.getSites()` | `/v3/sites` | GET | id, name | ✅ Real |
| **Configure Networks** | Device groups by site | ConfigureNetworks | `apiService.getDeviceGroupsBySite(site.id)` | non-Swagger (platformmanager) | GET | id, name | ⚠️ Mock — no Swagger endpoint for device groups |
| **Configure Networks** | Profiles by device group | ConfigureNetworks | `apiService.getProfilesByDeviceGroup(group.id)` | `/v3/profiles` (via discovery) | GET | id, name | ✅ Real |
| **Configure Policy** | Roles list | ConfigurePolicy | `apiService.getRoles()` | `/v3/roles` | GET | id, name, type | ✅ Real |
| **Configure Policy** | Topologies list | ConfigurePolicy | `apiService.getTopologies()` | `/v3/topologies` | GET | id, name, vlanId | ✅ Real |
| **Configure Policy** | Class of Service list | ConfigurePolicy | `apiService.getClassOfService()` | `/v3/cos` (Swagger has `/v1/cos`) | GET | id, name, type | 🔶 Partial — uses `/v3/cos` but Swagger only catalogs `/v1/cos` |
| **Configure AAA Policies** | AAA Policies list | ConfigureAAAPolicies | `apiService.getAAAPolicies()` + `getAaaPolicies()` | `/v1/aaapolicy` | GET | id, name, type, servers | ✅ Real |
| **Configure Guest** | WLAN services (for portal assignment) | ConfigureGuest | `apiService.getServices()` | `/v1/services` | GET | id, name, ssid | ✅ Real |
| **Configure Guest** | Roles (for guest access) | ConfigureGuest | `apiService.getRoles()` | `/v3/roles` | GET | id, name | ✅ Real |
| **Configure Guest** | eGuest portal profiles | ConfigureGuest | `apiService.getEGuestProfiles()` | `/v1/eguest` | GET | id, name, type | ✅ Real |
| **Configure Guest** | Guest accounts list | ConfigureGuest | `apiService.getGuests()` | `/v1/guests` (non-Swagger) | GET | id, username, expiry | ⚠️ Mock — `/v1/guests` not in Swagger; `/v1/eguest` is the Swagger analog |
| **Configure Advanced** | Topologies (VLANs) | ConfigureAdvanced | `apiService.getTopologies()` | `/v3/topologies` | GET | id, name, vlanId | ✅ Real |
| **Configure Advanced** | Class of Service profiles | ConfigureAdvanced | `apiService.getCoSProfiles()` | `/v1/cos` | GET | id, name, type | ✅ Real |
| **Configure Advanced** | Rate limiters | ConfigureAdvanced | `apiService.getRateLimiters()` | `/v1/ratelimiters` | GET | id, name, maxInput, maxOutput | ✅ Real |
| **Configure Advanced** | AP profiles | ConfigureAdvanced | `apiService.getProfiles()` | `/v3/profiles` | GET | id, name | ✅ Real |
| **Configure Advanced** | IoT profiles | ConfigureAdvanced | `apiService.getIoTProfiles()` | `/v3/iotprofile` | GET | id, name | ✅ Real |
| **Configure Advanced** | Mesh points | ConfigureAdvanced | `apiService.getMeshPoints()` | `/v3/meshpoints` | GET | id, name | ✅ Real |
| **Configure Advanced** | Access control (MAC filter) | ConfigureAdvanced | `apiService.getAccessControl()` | `/v1/accesscontrol` | GET | macMode, macList | ✅ Real |
| **Configure Advanced** | XLocation profiles | ConfigureAdvanced | `apiService.getXLocationProfiles()` | `/v3/xlocation` | GET | id, name | ✅ Real |
| **Configure Advanced** | RTLS profiles | ConfigureAdvanced | `apiService.getRTLSProfiles()` | `/v1/rtlsprofile` | GET | id, name | ✅ Real |
| **Configure Advanced** | Positioning profiles | ConfigureAdvanced | `apiService.getPositioningProfiles()` | `/v3/positioning` | GET | id, name | ✅ Real |
| **Configure Advanced** | Analytics profiles | ConfigureAdvanced | `apiService.getAnalyticsProfiles()` | `/v3/analytics` | GET | id, name | ✅ Real |
| **Configure Adoption Rules** | Adoption rules list | ConfigureAdoptionRules | `apiService.getAdoptionRules()` | `/v1/devices/adoptionrules`, `/v1/aps/adoptionrules` | GET | id, name, criteria | ✅ Real |
| **Configure Adoption Rules** | Sites list (for rule scoping) | ConfigureAdoptionRules | `makeAuthenticatedRequest('/v1/sites')` | `/v3/sites` (prefers v3; code uses /v1/sites) | GET | id, name | 🔶 Partial — calls `/v1/sites` but Swagger primary is `/v3/sites` |
| **System Backup** | Configuration backups list | SystemBackupManager | `apiService.getConfigurationBackups()` | `/platformmanager/v1/configuration/backups` (non-Swagger) | GET | filename, size, date | ⚠️ Mock — endpoint not in Swagger catalog |
| **System Backup** | Flash files list | SystemBackupManager | `apiService.getFlashFiles()` | `/platformmanager/v1/flash/files` (non-Swagger) | GET | filename, size | ⚠️ Mock — endpoint not in Swagger catalog |
| **System Backup** | Flash usage | SystemBackupManager | `apiService.getFlashUsage()` | `/platformmanager/v1/flash/usage` (non-Swagger) | GET | used, total | ⚠️ Mock — endpoint not in Swagger catalog |
| **License Dashboard** | License info | LicenseDashboard | `apiService.getLicenseInfo()` | `/platformmanager/v1/license/info` (non-Swagger) | GET | licenseType, expiry, count | ⚠️ Mock — endpoint not in Swagger catalog |
| **License Dashboard** | License usage | LicenseDashboard | `apiService.getLicenseUsage()` | `/platformmanager/v1/license/usage` (non-Swagger) | GET | used, total, percentage | ⚠️ Mock — endpoint not in Swagger catalog |
| **AP Firmware Manager** | Access points for firmware | APFirmwareManager | `apiService.getAccessPoints()` | `/v1/aps/query` | GET | serialNumber, softwareVersion, hardwareType | ✅ Real |
| **AP Firmware Manager** | Available firmware versions | APFirmwareManager | `apiService.getAPSoftwareVersions()` | `/v1/aps/upgradeimagelist` | GET | firmware image filenames | ✅ Real |
| **Network Diagnostics** | Ping test | NetworkDiagnostics | `apiService.networkPing(host, count)` | `/platformmanager/v1/network/ping` (non-Swagger, POST) | POST | success, latency, packetLoss | ⚠️ Mock — endpoint not in Swagger catalog |
| **Network Diagnostics** | Traceroute test | NetworkDiagnostics | `apiService.networkTraceroute(host)` | `/platformmanager/v1/network/traceroute` (non-Swagger, POST) | POST | hops, latency | ⚠️ Mock — endpoint not in Swagger catalog |
| **Network Diagnostics** | DNS lookup test | NetworkDiagnostics | `apiService.networkDnsLookup(hostname)` | `/platformmanager/v1/network/dns` (non-Swagger, POST) | POST | resolved addresses | ⚠️ Mock — endpoint not in Swagger catalog |
| **Events & Alarms** | Events list | EventAlarmDashboard | `apiService.getEvents()` | `/v1/events` (non-Swagger) | GET | type, severity, timestamp, message | ⚠️ Mock — `/v1/events` not in Swagger; `/v1/auditlogs` is nearest Swagger analog |
| **Events & Alarms** | Alarms list | EventAlarmDashboard | `apiService.getAlarms()` | `/v1/alarms` (non-Swagger) | GET | id, type, severity, state | ⚠️ Mock — `/v1/alarms` not in Swagger |
| **Events & Alarms** | Active alarms | EventAlarmDashboard | `apiService.getActiveAlarms()` | `/v1/alarms/active` (non-Swagger) | GET | id, type, severity | ⚠️ Mock — `/v1/alarms/active` not in Swagger |
| **Security Dashboard** | Rogue AP list | SecurityDashboard | `apiService.getRogueAPList()` | `/v1/security/rogue-ap/list` (non-Swagger) | GET | macAddress, ssid, classification | ⚠️ Mock — endpoint not in Swagger; `/v3/adsp` is Swagger analog |
| **Security Dashboard** | Security threats | SecurityDashboard | `apiService.getSecurityThreats()` | `/v1/security/threats` (non-Swagger) | GET | type, severity, source | ⚠️ Mock — endpoint not in Swagger; no direct Swagger analog |
| **PCI DSS Report** | Sites list | PCIReport | `apiService.getSites()` | `/v3/sites` | GET | id, name | ✅ Real |
| **PCI DSS Report** | WLAN/services list | PCIReport | `makeAuthenticatedRequest('/v1/services')` | `/v1/services` | GET | id, name, ssid, security | ✅ Real |
| **PCI DSS Report** | AP list (compliance checks) | PCIReport | `apiService.getAccessPoints()` | `/v1/aps/query` | GET | serialNumber, softwareVersion, status | ✅ Real |
| **Guest Management** | Guest accounts list | GuestManagement | `apiService.getGuests()` | `/v1/guests` (non-Swagger) | GET | id, username, expiry, email | ⚠️ Mock — `/v1/guests` not in Swagger |
| **Tools** | System event log viewer | Tools | `apiService.getEvents(...)` | `/v1/events` (non-Swagger) | GET | type, severity, message, timestamp | ⚠️ Mock — `/v1/events` not in Swagger |
| **Administration** | Administrators list | Administration → AdministratorsManagement | `makeAuthenticatedRequest('/v1/administrators')` | `/v1/administrators` | GET | id, username, role, email | ✅ Real |
| **Administration** | Applications list | Administration → ApplicationsManagement | `makeAuthenticatedRequest('/platformmanager/v1/apps')` | `/platformmanager/v1/apps` (non-Swagger) | GET | id, name, clientId | ⚠️ Mock — not in Swagger; `/v1/appkeys` is nearest Swagger analog |
| **API Test Tool** | Ad-hoc request execution | ApiTestTool | `apiService.makeAuthenticatedRequest(userEndpoint, ...)` | User-defined endpoint | Any | Raw JSON response | ✅ Real (dev tool) |
| **API Documentation** | — | ApiDocumentation | None | — | — | — | ❌ None — static content |
| **Help Page** | — | HelpPage | None | — | — | — | ❌ None — static content |
| **AP Detail Panel** | AP full details | AccessPointDetail | `apiService.getAccessPointDetails(serialNumber)` | `/v1/aps/{apSerialNumber}` | GET | Full AP config object | ✅ Real |
| **AP Detail Panel** | AP connected stations | AccessPointDetail | `apiService.getAccessPointStations(serialNumber)` | `/v1/aps/{apserialnum}/stations` | GET | macAddress, hostName, signalStrength | ✅ Real |
| **AP Detail Panel** | AP event/alarm history | AccessPointDetail | `apiService.getAccessPointEvents(serialNumber, duration)` | `/v1/aps/{apSerialNumber}/alarms` (non-Swagger) | GET | alarmCategories, alarmTypes, alarms | ⚠️ Mock — `/v1/aps/{serial}/alarms` not in Swagger; `/v1/aps/{serial}/report` is Swagger analog |
| **Client Detail Panel** | Client details | ClientDetail | `apiService.getStation(macAddress)` | `/v1/stations/{macaddress}` | GET | Full station record | ✅ Real |
| **Client Detail Panel** | Client event history (correlated) | ClientDetail | `apiService.fetchStationEventsWithCorrelation(macAddress, '24H')` | `/v1/stations/{stationId}/report` | GET | muEvent widget data | ✅ Real |
| **Site Detail Panel** | Site real-time state | SiteDetail | `makeAuthenticatedRequest('/v1/state/sites/{siteId}')` | `/v1/state/sites/{siteId}` | GET | state, apCount, clientCount | ✅ Real |
| **Site Detail Panel** | APs at site | SiteDetail | `apiService.getAccessPointsBySite(siteId)` | `/v1/aps/query` | GET | serialNumber, status | ✅ Real |
| **Site Detail Panel** | Clients at site | SiteDetail | `apiService.getStations()` | `/v1/stations` | GET | macAddress, apSerialNumber | ✅ Real |
| **Site Detail Panel** | Site report widgets (rfQuality, channelUtil, throughput, users, etc.) | SiteDetail | `api.fetchWidgetData(siteId, [...widgets], timeRange)` | `/v1/sites/{siteId}/report` | GET | Widget-specific fields per widgetList | ✅ Real |
| **Site Detail Panel** | App Insights at site | SiteDetail | `api.getAppInsights(timeRange, siteId)` | `/v1/report/sites/{siteId}` | GET | topAppGroupsByUsage, etc. | ✅ Real |

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total features/rows mapped | 97 |
| Features using real API data (✅ Real) | 62 |
| Features with partial/derived data (🔶 Partial) | 5 |
| Features using non-Swagger or mock endpoints (⚠️ Mock) | 28 |
| Static content — no API (❌ None) | 2 |

---

## Mock Data Flags

| Page | Feature | Component | Evidence | Severity |
|------|---------|-----------|----------|----------|
| Report Widgets | Security Events widget | ReportWidgets | Calls `/v1/events?type=security` which is not in Swagger. Falls back to `/v1/notifications` filtered by keyword match ('security', 'intrusion', 'breach'). | High |
| Report Widgets | Active Alerts widget | ReportWidgets | Calls `/v1/alerts` — not a Swagger endpoint. Returns `[]` on failure. | High |
| Report Widgets | Network Utilization | ReportWidgets | Derives utilization as `Math.min(clientCount / 10, 100)` — hardcoded formula, not a real utilization metric | Medium |
| Report Widgets | Network Throughput | ReportWidgets | Converts `station.inBytes + outBytes` to Mbps by dividing by 60 — assumes 1-minute window but fields are cumulative totals | Medium |
| Report Widgets | Performance Score | ReportWidgets | Synthetic score: `apConnectedPct * 0.5 + clientGoodSignalPct * 0.5`. Not sourced from any API metric. | Medium |
| System Backup | Backup list | SystemBackupManager | Calls `/platformmanager/v1/configuration/backups` — not in Swagger. Returns `[]` on failure. | High |
| System Backup | Flash files, Flash usage | SystemBackupManager | Calls `/platformmanager/v1/flash/files` and `/flash/usage` — not in Swagger. Returns `[]`/`null` on failure. | High |
| License Dashboard | License info, License usage | LicenseDashboard | Both call `/platformmanager/v1/license/*` — not in Swagger. Returns `null` on failure with no UI error. | High |
| Network Diagnostics | Ping, Traceroute, DNS | NetworkDiagnostics | All three are POST calls to `/platformmanager/v1/network/*` — not in Swagger. Feature entirely absent from API spec. | High |
| Events & Alarms | Events, Alarms, Active Alarms | EventAlarmDashboard | `/v1/events`, `/v1/alarms`, `/v1/alarms/active` — none in Swagger. Returns empty arrays on failure, silently hiding issues. Swagger analog is `/v1/auditlogs`. | High |
| Security Dashboard | Rogue AP list | SecurityDashboard | `/v1/security/rogue-ap/list` — not in Swagger. Air Defense (`/v3/adsp`) is the Swagger-side rogue AP feature but is not wired to this page. | High |
| Security Dashboard | Security threats | SecurityDashboard | `/v1/security/threats` — not in Swagger. No direct Swagger analog. | High |
| Guest Management | Guest accounts | GuestManagement | `/v1/guests` not in Swagger. eGuest (`/v1/eguest`) is the Swagger analog for guest profiles; guest accounts may not be exposed in Swagger at all. | High |
| Configure Guest | Guest accounts | ConfigureGuest | Same issue: `/v1/guests` not in Swagger. | High |
| Administration | Applications list | ApplicationsManagement | `/platformmanager/v1/apps` not in Swagger. ApplicationKeys (`/v1/appkeys`) is the nearest Swagger analog. | Medium |
| Configure Networks | Device groups | ConfigureNetworks | `getDeviceGroupsBySite()` — no Swagger endpoint for device groups; controller-specific. | Medium |
| AP Detail Panel | AP event history | AccessPointDetail | `/v1/aps/{serial}/alarms` not in Swagger; Swagger has `/v1/aps/{serial}/report` and `/v1/report/aps/{serial}` instead. | Medium |
| Tools | Event log viewer | Tools | `/v1/events` not in Swagger. Same issue as Events & Alarms page. | Medium |
| Configure Policy | Class of Service | ConfigurePolicy | Uses `/v3/cos` but Swagger only catalogs `/v1/cos`. Version mismatch may cause issues. | Low |
| Configure Adoption Rules | Sites list | ConfigureAdoptionRules | Calls `/v1/sites` directly; Swagger primary endpoint is `/v3/sites`. | Low |

---

## Unused Swagger GET Endpoints (Enhancement Opportunities)

The following Swagger GET endpoints are not called by any component in `src/components/`. Total unused: ~131 of ~145 GET endpoints in the catalog.

### High-Value Unused Endpoints (Clear UI use case exists)

| Swagger Path | Method | Tag | Summary | Potential Use |
|--------------|--------|-----|---------|---------------|
| `/v1/auditlogs` | GET | AuditlogManager | Get audit logs for customer | Replace `/v1/events` in Tools page and Events & Alarms page |
| `/v3/adsp` | GET | AdspManager | Get all Air Defense profiles | Replace `/v1/security/rogue-ap/list` in Security Dashboard |
| `/v3/adsp/{adspId}` | GET | AdspManager | Get Air Defense Profile by ID | ADSP profile detail in Configure Advanced |
| `/v1/bestpractices/evaluate` | GET | BestPracticeManager | Perform best practices evaluation | New Best Practices widget/page |
| `/v1/appkeys` | GET | ApplicationKeysManager | Get all application keys | Replace `/platformmanager/v1/apps` in Administration |
| `/v1/appkeys/{appKey}` | GET | ApplicationKeysManager | Get application key by appKey | App key detail view |
| `/v1/report/aps/{apSerialNumber}` | GET | ReportsManager | Get reports for an AP | Historical charts in AP Detail panel |
| `/v1/report/aps/{apSerialNumber}/smartrf` | GET | ReportsManager | Get Smart RF reports for AP | Smart RF analytics in AP Detail |
| `/v1/report/services/{serviceId}` | GET | ReportsManager | Get WLAN service report | Per-WLAN performance charts in Configure Networks |
| `/v1/report/sites/{siteId}/smartrf` | GET | ReportsManager | Get site Smart RF report | Smart RF analytics in Site Detail |
| `/v2/report/upgrade/devices` | GET | ReportsManager | Get device upgrade report | Firmware upgrade history in APFirmwareManager |
| `/v1/reports/generated` | GET | ReportTemplateManager | Get list of generated user reports | Report download center |
| `/v1/reports/scheduled` | GET | ReportTemplateManager | Get scheduled reports list | Scheduled reporting management |
| `/v1/reports/templates` | GET | ReportTemplateManager | Get report template list | Template-based reporting feature |
| `/v1/reports/widgets` | GET | ReportTemplateManager | Get available widget definitions | Dynamic report widget catalog (replace hardcoded widgets in ReportWidgets) |
| `/v1/state/entityDistribution` | GET | EntityStateManager | Get distribution of all entity states | Dashboard health overview widget |
| `/v1/state/sites` | GET | EntityStateManager | Get state of all sites | Site health overview |
| `/v1/state/switches` | GET | EntityStateManager | Get state of all switches | Switch health overview |
| `/v1/switches` | GET | SwitchManager | Get list of switches | Switch management page (not yet built) |
| `/v1/switches/{serialNumber}` | GET | SwitchManager | Get switch by ID | Switch detail panel |
| `/v1/switches/{serialNumber}/report` | GET | SwitchManager | Get switch report | Switch analytics |
| `/v1/globalsettings` | GET | SiteManager | Get global settings for all sites | Global settings panel |
| `/v1/snmp` | GET | SiteManager | Get SNMP configurations | SNMP config display in Configure Advanced |
| `/v1/workflow` | GET | WorkFlowManager | Get sites/profiles using a device/profile | Impact analysis before deleting a profile/device |
| `/v1/aps/{apSerialNumber}/cert` | GET | AccessPointManager | Get AP certificate information | Cert status in AP Detail panel |
| `/v1/aps/{apSerialNumber}/location` | GET | AccessPointManager | Get station locations for an AP | Floor map / positioning in AP Detail |
| `/v1/aps/{apSerialNumber}/traceurls` | GET | AccessPointManager | Get AP trace download URLs | Debug/trace download in AP Detail |
| `/v1/aps/{apserialnum}/lldp` | GET | AccessPointManager | Get AP LLDP info per port | Switch topology in AP Detail |
| `/v1/aps/apbalance` | GET | AccessPointManager | Get AP load balance mode | Show in Configure Advanced |
| `/v1/aps/hardwaretypes` | GET | AccessPointManager | Get hardware type and model names | Hardware type picker in AP creation |
| `/v1/aps/registration` | GET | AccessPointManager | Get global AP registration info | Global AP registration status |
| `/v1/stations/query` | GET | SiteManager | Get filtered station list | Advanced client search filter |
| `/v1/stations/query/columns` | GET | SiteManager | Get columns for station query | Dynamic client table columns |
| `/v1/stations/query/visualize` | GET | SiteManager | Get filtered stations for visualization | Client location visualization |
| `/v1/stations/{stationId}/location` | GET | StatisticsManager | Get station location report | Client location history in Client Detail |
| `/v1/roles/{roleId}/report` | GET | RoleManager | Get role report by ID | Per-role analytics in Configure Policy |
| `/v1/roles/{roleid}/stations` | GET | RoleManager | Get stations with this role | Show clients by role in Configure Policy |
| `/v3/rfmgmt` | GET | RfMgmtPolicyManager | Get all RF management policy profiles | RF management in Configure Advanced |
| `/v3/roles/{roleId}/rulestats` | GET | ReportsManager | Get rule stats by role ID | Per-role statistics in Policy page |
| `/v3/sites/report` | GET | SiteManager | Get all-site report | Multi-site analytics dashboard |
| `/v3/sites/report/impact` | GET | SiteManager | Get impact reports for all sites | Network-wide impact analysis |
| `/v3/sites/countrylist` | GET | SiteManager | Get supported countries | Country picker in site creation |
| `/v3/sites/default` | GET | SiteManager | Get default site config | Pre-fill site creation form |
| `/v1/msp/briefsites/{tenantId}` | GET | MSPManager | Get all MSPBriefSites for a tenant | MSP multi-tenant site overview |
| `/v1/nsightconfig` | GET | NSightManager | Get NSight server config | NSight integration status display |
| `/v1/report/location/floor/{floorId}` | GET | ReportsManager | Get station locations on a floor | Floor plan heatmap |
| `/v1/report/location/aps/{apSerialNumber}` | GET | ReportsManager | Get station locations for an AP | AP-level client location map |
| `/v1/aps/antenna/{apSerialNumber}` | GET | AccessPointManager | Get AP antenna info | Antenna config in AP Detail |
| `/v1/aps/platforms` | GET | AccessPointManager | Get AP platform names | Platform filter in AP table |
| `/v1/aps/query/visualize` | GET | AccessPointManager | Get filtered AP list for visualization | AP floor plan visualization |
| `/v1/services/{serviceId}/report` | GET | ServiceManager | Get WLAN service report | WLAN performance charts |
| `/v1/services/{serviceid}/bssid0` | GET | ServiceManager | Get profiles/APs using service as primary BSSID | Impact warning before WLAN delete |
| `/v1/services/{serviceId}/deviceids` | GET | ServiceManager | Get AP serial numbers for a service | WLAN-to-AP mapping |
| `/v1/services/{serviceId}/siteids` | GET | ServiceManager | Get site IDs where service is deployed | WLAN deployment map |

### Remaining Unused Endpoints (config defaults and name maps)

These are mostly `default` and `nametoidmap` variants for every resource type. They are low priority but valuable for form pre-fill and cross-reference:

| Category | Unused Endpoints |
|----------|-----------------|
| CoSManager | `/v1/cos/{cosId}`, `/v1/cos/default`, `/v1/cos/nametoidmap` |
| AAAPolicyManager | `/v1/aaapolicy/{id}`, `/v1/aaapolicy/default`, `/v1/aaapolicy/nametoidmap` |
| RateLimiterManager | `/v1/ratelimiters/{rateLimiterId}`, `/v1/ratelimiters/default`, `/v1/ratelimiters/nametoidmap` |
| TopologyManager | `/v1/topologies/{topologyId}`, `/v1/topologies/default`, `/v1/topologies/nametoidmap`, `/v3/topologies` (v3 variant) |
| ProfileManager | `/v3/profiles/{profileId}`, `/v3/profiles/{profileId}/bssid0`, `/v3/profiles/{profileId}/channels`, `/v3/profiles/nametoidmap` |
| IotProfileManager | `/v3/iotprofile/{iotprofileId}`, `/v3/iotprofile/default`, `/v3/iotprofile/nametoidmap` |
| MeshpointManager | `/v3/meshpoints/{meshpointId}`, `/v3/meshpoints/{meshpointId}/bssid`, `/v3/meshpoints/default`, `/v3/meshpoints/nametoidmap`, `/v3/meshpoints/profile/default`, `/v3/meshpoints/tree/{meshpointId}` |
| PositioningManager | `/v3/positioning/{positioningProfileId}`, `/v3/positioning/default`, `/v3/positioning/nametoidmap` |
| XLocationManager | `/v3/xlocation/{xlocationId}`, `/v3/xlocation/default`, `/v3/xlocation/nametoidmap` |
| RtlsProfileManager | `/v1/rtlsprofile/{rtlsprofileId}`, `/v1/rtlsprofile/default`, `/v1/rtlsprofile/nametoidmap` |
| AnalyticsProfileManager | `/v3/analytics/{analyticsProfileId}`, `/v3/analytics/default`, `/v3/analytics/nametoidmap` |
| AdspManager | `/v3/adsp/{adspId}`, `/v3/adsp/default`, `/v3/adsp/nametoidmap` |
| RfMgmtPolicyManager | `/v3/rfmgmt/{rfmgmtId}`, `/v3/rfmgmt/default`, `/v3/rfmgmt/nametoidmap` |
| RoleManager | `/v3/roles/{roleId}`, `/v3/roles/default`, `/v3/roles/nametoidmap` |
| ServiceManager | `/v1/services/default`, `/v1/services/nametoidmap` |
| SiteManager | `/v3/sites/nametoidmap`, `/v3/sites/report/flex`, `/v3/sites/report/venue`, `/v3/sites/report/location/floor/{floorId}`, `/v3/sites/{siteId}/report/impact`, `/v3/sites/{siteId}/report/venue` |
| EGuestManager | `/v1/eguest/{eguestId}`, `/v1/eguest/default`, `/v1/eguest/nametoidmap` |
| RadioManager | `/v1/radios/channels`, `/v1/radios/modes`, `/v3/radios/smartrfchannels` |
| SwitchManager | `/v1/switches/{serialNumber}/clibackups`, `/v1/switches/{serialNumber}/ports/{portId}/report`, `/v1/switches/{serialNumber}/slots/{slotNumber}/ports/{portNumber}`, `/v1/switches/{serialNumber}/traceurls`, `/v1/switches/displaynames` |
| SwitchPortProfileManager | `/v3/switchportprofile`, `/v3/switchportprofile/{profileId}`, `/v3/switchportprofile/default`, `/v3/switchportprofile/nametoidmap` |
| DpiSignatureManager | `/v1/dpisignatures`, `/v1/dpisignatures/custom` |
| DeviceImageManager | `/v1/deviceimages/{hwType}` |
| ReportTemplateManager | `/v1/reports/generated/{filename}`, `/v1/reports/scheduled/{reportId}`, `/v1/reports/scheduled/default`, `/v1/reports/scheduled/nametoidmap`, `/v1/reports/templates/{templateId}`, `/v1/reports/templates/default`, `/v1/reports/templates/nametoidmap` |
| AccessPointManager | `/v1/aps/default`, `/v1/aps/displaynames`, `/v1/aps/downloadtrace/{filename}` |
| EntityStateManager | `/v1/state/aps/{apSerialNumber}`, `/v1/state/sites/{siteId}`, `/v1/state/sites/{siteId}/aps`, `/v1/state/switches/{switchSerialNumber}` |
| StatisticsManager | `/v1/aps/ifstats/{apSerialNumber}` |
| SiteManager misc | `/v1/snmp/default`, `/v1/sites/{siteId}/report` |
| ReportsManager misc | `/v1/report/flex/{duration}`, `/v1/report/ports/{portId}`, `/v1/report/roles/{roleId}`, `/v1/report/switches/{switchSerialNumber}`, `/v1/report/location/stations/{stationId}` |

---

## Key Findings Summary

### Critical Gaps: Non-Swagger Endpoints Used as Primary Data Sources

1. **Events & Alarms page** — All 3 endpoints (`/v1/events`, `/v1/alarms`, `/v1/alarms/active`) are absent from Swagger. Pages silently return empty tables on failure. The Swagger-documented analog is `/v1/auditlogs`.

2. **Security Dashboard** — `/v1/security/rogue-ap/list` and `/v1/security/threats` have no Swagger coverage. The Swagger rogue AP feature is Air Defense (`/v3/adsp`), which is completely unwired to the Security Dashboard.

3. **System Backup** — All 3 backup/flash endpoints are `/platformmanager/v1/*` paths outside Swagger scope.

4. **License Dashboard** — Both license endpoints are `/platformmanager/v1/license/*`, outside Swagger scope.

5. **Network Diagnostics** — All 3 diagnostic tools call `/platformmanager/v1/network/*` (POST). Entire feature is outside Swagger scope.

6. **Guest accounts** — `/v1/guests` is used for CRUD in both GuestManagement and ConfigureGuest. The Swagger-defined guest resource is `/v1/eguest` (eGuest profiles). Guest accounts may be a controller-only resource not exposed through XCA Swagger.

### Complete API Domains With No UI Page

| Swagger Tag | Endpoint Count | Status |
|-------------|---------------|--------|
| SwitchManager | 25 total, 9 GET | No switch management page built |
| ReportTemplateManager | 19 total, 14 GET | Scheduled/generated reports entirely absent from UI |
| ReportsManager | 16 GET | Most report variants unused (smartrf, flex, location, switches, roles, ports) |
| AdspManager | 7 total, 4 GET | Air Defense data unused; Security Dashboard uses non-Swagger path instead |
| NSightManager | 2 total, 1 GET | NSight integration not built |
| BestPracticeManager | 2 total, 1 GET | Best practices evaluation not surfaced |
| SwitchPortProfileManager | 7 total, 4 GET | No switch port profile management UI |
| DpiSignatureManager | 3 total, 2 GET | DPI signature profiles not exposed in UI |
