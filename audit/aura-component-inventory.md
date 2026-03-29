# AURA Component Inventory

Generated: 2026-03-28

---

## Service Files (src/services/)

| File | Purpose | Makes HTTP Calls? | Endpoints / Method Categories Used |
|------|---------|-------------------|------------------------------------|
| `api.ts` | Main campus controller API service — 271+ methods covering authentication, stations, APs, services, sites, roles, profiles, analytics, security, diagnostics, firmware, licensing, etc. | Yes (`fetch` directly) | `/management/v1/*`, `/management/v3/*` — all controller REST endpoints |
| `aiBaselineService.ts` | Collects time-series metric samples and computes adaptive AI baseline thresholds stored in localStorage | No | Delegates to `aiInsights.calculateAIBaseline` and `metricsStorage` |
| `aiInsights.ts` | Pure functions that rank, correlate, and explain network events as insight cards; no external calls | No | Local computation only |
| `assignmentStorage.ts` | localStorage-backed CRUD for WLAN site and profile assignment metadata | No | localStorage only |
| `cache.ts` | Simple in-memory TTL cache used throughout `api.ts` | No | In-memory |
| `chatbaseIdentity.ts` | Fetches a Chatbase identity JWT from a Supabase edge function for AI assistant user identification | Yes (`fetch`) | `POST /functions/v1/make-server-efba0687` (Supabase edge) |
| `chatbot.ts` | NL query processor that calls apiService to answer user questions about the network | Yes (via `apiService`) | stations, APs, sites, services, events |
| `dataNormalizer.ts` | Pure field-normalization functions that map API response variants to canonical Station/AP/Service/Site shape | No | Local computation only |
| `effectiveSetCalculator.ts` | Pure functions that compute the effective profile set for a WLAN deployment mode (ALL/INCLUDE/EXCLUDE) | No | Local computation only |
| `errorHandler.ts` | Classifies errors, maps them to user-friendly messages, and provides `withRetry` retry logic | No | Local computation only |
| `logger.ts` | Dev-only console logger; no-ops in production | No | Console only |
| `macAddressUtils.ts` | Detects randomized (locally administered) MAC addresses via bit inspection | No | Local computation only |
| `metricsStorage.ts` | Stores and retrieves time-series metric snapshots in Supabase (`service_metrics_snapshots`, `network_snapshots`) | Yes (`supabase`) | Supabase tables: `service_metrics_snapshots`, `network_snapshots` |
| `notificationService.ts` | Manages in-app notifications (AP offline, SLE drops) with localStorage persistence | No | localStorage only |
| `offlineStorage.ts` | IndexedDB-based offline cache (`aura_offline_cache`) for large datasets; schema versioning + TTL | No | IndexedDB only |
| `oui-lookup.ts` | Looks up MAC address vendor names via the Express backend `/api/oui` route | Yes (`fetch`) | `GET /api/oui` (local Express server) |
| `ouiLookup.ts` | Identifies clients and suggests device type using a bundled OUI database (no network calls) | No | In-memory OUI registry |
| `serviceMapping.ts` | Caches and resolves service and role ID→name mappings via direct `fetch` (bypasses `apiService`) | Yes (`fetch` directly) | `GET /v1/services`, `GET /v1/userRoles` |
| `simpleServiceMapping.ts` | Lightweight service/role ID→name resolver; falls back immediately; wraps `serviceMapping` | Yes (via `serviceMapping`) | same as `serviceMapping.ts` |
| `simplifiedWidgetService.ts` | Fetches pre-aggregated data for Network Insights widgets using reliable endpoints | Yes (via `apiService`) | `getAccessPoints`, `getStations`, `getSites`, `getServices` |
| `siteMapping.ts` | Caches site ID→object mapping for quick lookup; thin wrapper around `apiService.getSites()` | Yes (via `apiService`) | `getSites` → `/v3/sites` |
| `sleCalculationEngine.ts` | Pure functions that compute SLE metrics and classifiers from raw `SLEDataPoint` arrays | No | Local computation only |
| `sleDataCollection.ts` | Polls client and AP data every 60 s; calculates per-site SLE metrics; stores to localStorage | Yes (via `apiService`) | `getStations`, `getAccessPoints`, `getSites` |
| `supabaseClient.ts` | Exports a single configured `SupabaseClient` instance; also re-exports DB type interfaces | Yes (`supabase` SDK) | Supabase project (URL from env `VITE_SUPABASE_URL`) |
| `tablePreferences.ts` | Persists table column preferences in localStorage + Supabase for cross-device sync | Yes (`supabase`) | Supabase tables: `table_preferences`, `column_views` |
| `tenantService.ts` | Multi-tenant service — manages orgs, controllers, site groups, and user access via Supabase | Yes (`supabase`) | Supabase tables: `organizations`, `controllers`, `user_organizations`, `user_profiles` |
| `throughput.ts` | Stores and retrieves throughput snapshots via the local Express backend `/api/throughput` | Yes (`fetch`) | `POST/GET /api/throughput` (local Express server) |
| `traffic.ts` | Fetches per-station and batch traffic statistics (bytes, packets, RSSI) | Yes (via `apiService`) | `getStation`, `getStations` (field-projected) |
| `widgetService.ts` | Fetches Extreme Platform ONE report widget data (`/v1/report/sites`) | Yes (via `apiService.makeAuthenticatedRequest`) | `GET /v1/report/sites` |
| `wlanAssignment.ts` | Orchestrates WLAN creation, site assignment, profile attachment, and sync operations | Yes (via `apiService`) | `createService`, `assignServiceToProfile`, `syncProfile`, `getProfiles`, `getSites`, `getDeviceGroupsBySite` |
| `wlanDeploymentStatus.ts` | Derives WLAN deployment status (NOT_DEPLOYED / PARTIALLY_DEPLOYED / DEPLOYED) from localStorage assignment metadata | No | Reads `assignmentStorage` only |
| `wlanReconciliation.ts` | Compares expected WLAN profile assignments against live API state and generates remediation actions | Yes (via `apiService`) | `getProfileById`, `getProfilesByDeviceGroup` |
| `workspaceDataService.ts` | Routes workspace widget data requests to the appropriate `apiService` endpoints | Yes (via `apiService`) | APs, stations, services, sites, RF quality, analytics — 20+ endpoint refs |
| `workspacePersistence.ts` | Saves and restores user workspace widget references in localStorage | No | localStorage only |
| `xiqService.ts` | Authenticates to ExtremeCloud IQ (XIQ) and provides token management per site group | Yes (`fetch` via CORS proxy `/xiq/*`) | `POST /xiq/login`, `GET /xiq/devices`, `GET /xiq/locations` |

---

## Hooks (src/hooks/)

| File | Purpose | Calls Service? |
|------|---------|----------------|
| `useBackgroundSync.ts` | Detects online/offline status; queues failed requests and retries when back online | Yes — uses `offlineStorage` |
| `useColumnCustomization.ts` | Manages per-component column visibility preferences stored in localStorage | No |
| `useCompoundSearch.ts` | Tokenized AND search over configurable fields; persists query to sessionStorage | No |
| `useContextScope.ts` | Context-aware data scoping for insight components; enforces strict scope isolation | Yes — calls `apiService` (getAccessPoints, getStations, getServices) |
| `useDashboardLayout.ts` | Manages dashboard widget order/visibility with localStorage persistence | No |
| `useDeviceDetection.ts` | Detects device type, screen size, and touch capability for responsive optimization | No |
| `useGlobalFilters.ts` | Shared filter state (site, timeRange, environment) persisted to localStorage and synced across tabs | No |
| `useHaptic.ts` | Wrapper around `navigator.vibrate` for haptic feedback on mobile | No |
| `useKeyboardShortcuts.ts` | Registers and manages keyboard shortcut handlers | No |
| `useMetricsCollection.ts` | Periodically samples service metrics and saves snapshots via `metricsStorage` | Yes — calls `metricsStorage.saveServiceMetrics` |
| `useOfflineCache.ts` | Enhanced cache with IndexedDB backend, schema versioning, configurable TTLs, and stale indicators | Yes — uses `offlineStorage` |
| `useOperationalContext.ts` | Manages the active operational context (mode, site, AP, client, timeRange, environment profile) stored in sessionStorage | No |
| `usePWAInstall.ts` | Captures `beforeinstallprompt` event and manages PWA install prompt with dismissal tracking | No |
| `usePageLoading.ts` | Utility for managing loading/refreshing/error states for async data loads | No |
| `usePullToRefresh.ts` | iOS-style pull-to-refresh gesture detector with haptic feedback | No — uses `useHaptic` |
| `useRealtimePolling.ts` | Adaptive polling intervals with tab-visibility awareness and battery-conscious backoff | No |
| `useSiteContexts.ts` | CRUD for site context groups with localStorage persistence | No |
| `useSiteGroups.ts` | Loads site groups for the current session; re-loads on controller change | Yes — calls `tenantService.getSiteGroups` |
| `useTabVisibilityPolling.ts` | Pauses/resumes polling callbacks based on tab visibility | No |
| `useTableCustomization.ts` | Full table column visibility, ordering, resizing, pinning, and saved views with `tablePreferences` persistence | Yes — calls `TablePreferencesService` |
| `useTheme.ts` | Theme mode management (light/dark/synthwave/ep1) with localStorage persistence and DOM application | No |
| `useTimeRangeFilter.ts` | Time range preset management with sessionStorage persistence; provides `filterByTime` row filter | No |
| `useTimelineNavigation.ts` | Manages shared timeline cursor and time window state across insight scopes | No |
| `useWorkspace.ts` | Workspace widget catalog and per-user state management; integrates with `workspacePersistence` | Yes — calls `workspacePersistence` (getSavedWidgets, hydrateWidgetFromReference) |

---

## Shared UI Components (src/components/ui/)

| File | Purpose |
|------|---------|
| `ColumnCustomizationDialog.tsx` | Modal dialog for selecting and reordering table columns |
| `ColumnSelector.tsx` | Inline column visibility selector for tables |
| `ErrorBoundary.tsx` | React error boundary with fallback UI |
| `LoadingSpinner.tsx` | Animated loading spinner |
| `PageLoadingState.tsx` | Full-page loading overlay with spinner and message |
| `PageSkeleton.tsx` | Skeleton placeholder screens for lazy-loaded pages |
| `accordion.tsx` | Radix UI accordion (shadcn) |
| `alert-dialog.tsx` | Radix UI alert dialog (shadcn) |
| `alert.tsx` | Alert/banner component (shadcn) |
| `animated-value.tsx` | Animates numeric value transitions |
| `aspect-ratio.tsx` | Radix UI aspect ratio wrapper (shadcn) |
| `avatar.tsx` | User avatar (shadcn) |
| `badge.tsx` | Status badge pill (shadcn) |
| `breadcrumb.tsx` | Breadcrumb navigation (shadcn) |
| `button.tsx` | Button with variants (shadcn) |
| `calendar.tsx` | Date picker calendar (shadcn) |
| `card.tsx` | Content card container (shadcn) |
| `carousel.tsx` | Embla-powered image/content carousel (shadcn) |
| `chart.tsx` | Recharts-based chart wrapper with theme tokens (shadcn) |
| `checkbox.tsx` | Radix UI checkbox (shadcn) |
| `collapsible.tsx` | Radix UI collapsible panel (shadcn) |
| `command.tsx` | cmdk-powered command palette (shadcn) |
| `context-menu.tsx` | Right-click context menu (shadcn) |
| `dialog.tsx` | Modal dialog (shadcn) |
| `drawer.tsx` | Vaul drawer for mobile bottom sheets (shadcn) |
| `dropdown-menu.tsx` | Radix UI dropdown menu (shadcn) |
| `form.tsx` | React Hook Form wrapper with Zod validation (shadcn) |
| `hover-card.tsx` | Hover-activated floating card (shadcn) |
| `input-otp.tsx` | OTP input (shadcn) |
| `input.tsx` | Text input field (shadcn) |
| `label.tsx` | Form label (shadcn) |
| `menubar.tsx` | Horizontal menu bar (shadcn) |
| `navigation-menu.tsx` | Radix UI navigation menu (shadcn) |
| `pagination.tsx` | Page navigation controls (shadcn) |
| `popover.tsx` | Radix UI popover (shadcn) |
| `progress.tsx` | Progress bar (shadcn) |
| `radio-group.tsx` | Radix UI radio group (shadcn) |
| `resizable.tsx` | react-resizable-panels layout (shadcn) |
| `scroll-area.tsx` | Custom scrollbar area (shadcn) |
| `select.tsx` | Radix UI select dropdown (shadcn) |
| `separator.tsx` | Horizontal/vertical divider (shadcn) |
| `sheet.tsx` | Side drawer / slide-over panel (shadcn) |
| `sidebar.tsx` | App-level sidebar layout primitive (shadcn) |
| `skeleton.tsx` | Shimmer skeleton placeholder (shadcn) |
| `slider.tsx` | Range slider (shadcn) |
| `sonner.tsx` | Sonner toast notification container (shadcn) |
| `switch.tsx` | Toggle switch (shadcn) |
| `table.tsx` | HTML table primitives (shadcn) |
| `tabs.tsx` | Radix UI tabs (shadcn) |
| `textarea.tsx` | Multi-line text input (shadcn) |
| `toggle-group.tsx` | Radix UI toggle group (shadcn) |
| `toggle.tsx` | Radix UI toggle button (shadcn) |
| `tooltip.tsx` | Radix UI tooltip (shadcn) |
| `use-mobile.ts` | Hook that returns `true` when viewport width is below mobile breakpoint |
| `utils.ts` | `cn()` class merging utility (clsx + tailwind-merge) |

---

## Feature Components (src/components/)

Route-level components and significant sub-components that directly call `apiService`.

### Route-level Components (28 routes)

| File | Purpose | Route | Key API Methods |
|------|---------|-------|-----------------|
| `DashboardEnhanced.tsx` | Primary dashboard — RF quality, client stats, AP stats, top clients/APs, band distribution, alerts | `service-levels` | getAccessPointsBySite, getServicesBySite, getSiteById, fetchRFQualityData, makeAuthenticatedRequest (/v1/alerts, /v1/stations, /v1/services, /v3/sites/.../stations), getAPInterfaceStatsWithRF |
| `sle/SLEDashboard.tsx` | Service Level Experience dashboard — per-site SLE scores, timelines, client details | `sle-dashboard` | getAccessPoints, getAccessPointsBySite, getSiteById, getSites, getStations, makeAuthenticatedRequest (/v3/sites/.../stations) |
| `AppInsights.tsx` | Application analytics — top apps, categories, endpoint traffic trends | `app-insights` | (via `api` prop passed from App.tsx — calls makeAuthenticatedRequest for app analytics endpoints) |
| `TrafficStatsConnectedClients.tsx` | Connected clients table — traffic stats, site correlation, bulk disassociate | `connected-clients` | getStationsWithSiteCorrelation, bulkDeleteStations, isAuthenticated |
| `AccessPoints.tsx` | Access points table — list, detail, reboot, upgrade, delete, CSR generation, mesh roles | `access-points` | getAccessPoints, getAPQueryColumns, getAccessPointDetails, getAccessPointStations, getAllAPInterfaceStats, getAPStates, getMeshAPRoles, rebootAP, upgradeAPImage, deleteAP, generateCSR, releaseToCloud, resetAPToDefault |
| `Workspace.tsx` | User workspace with pinned/saved widgets from other dashboards | `workspace` | (via `api` prop — delegates to workspaceDataService) |
| `ReportWidgets.tsx` | Extreme Platform ONE widget reports — AP health, client counts, application usage | `report-widgets` | makeAuthenticatedRequest (/v1/alerts, /v1/aps, /v1/stations, widget-specific endpoints) |
| `PCIReport.tsx` | PCI DSS compliance report — encryption, auth, client security assessment | `pci-report` | getAccessPoints, getSites, makeAuthenticatedRequest (/v1/services) |
| `SystemBackupManager.tsx` | Configuration backup/restore — list, create, download, delete backups, flash usage | `system-backup` | getConfigurationBackups, createConfigurationBackup, downloadConfigurationBackup, deleteFlashFile, restoreConfiguration, getFlashFiles, getFlashUsage |
| `LicenseDashboard.tsx` | License management — usage, install new license keys | `license-dashboard` | getLicenseInfo, getLicenseUsage, installLicense |
| `APFirmwareManager.tsx` | Firmware upgrade manager — version listing, scheduling upgrades | `firmware-manager` | getAccessPoints, getAPSoftwareVersions, upgradeAPSoftware, createAPUpgradeSchedule |
| `NetworkDiagnostics.tsx` | Network diagnostics — ping, traceroute, DNS lookup via controller | `network-diagnostics` | networkPing, networkTraceroute, networkDnsLookup |
| `EventAlarmDashboard.tsx` | Events & alarms — list, acknowledge, clear active alarms | `event-alarm-dashboard` | getEvents, getAlarms, getActiveAlarms, acknowledgeAlarm, clearAlarm |
| `SecurityDashboard.tsx` | Security — rogue AP detection, threat classification | `security-dashboard` | detectRogueAPs, getRogueAPList, classifyRogueAP, getSecurityThreats |
| `GuestManagement.tsx` | Guest access management — CRUD guests, voucher generation | `guest-management` | getGuests, createGuest, deleteGuest, generateGuestVoucher |
| `ConfigureNetworks.tsx` | WLAN/service configuration — create, edit, delete WLANs; assign to profiles/sites | `configure-networks` | getServices, getSites, getDeviceGroupsBySite, getProfilesByDeviceGroup, assignServiceToProfile, updateService, deleteService, getServiceStations |
| `ConfigurePolicy.tsx` | Policy — roles, class of service, topologies | `configure-policy` | getRoles, createRole, updateRole, deleteRole, getClassOfService, getTopologies |
| `ConfigureAAAPolicies.tsx` | AAA policies — CRUD auth/accounting/auditing policies | `configure-aaa-policies` | getAaaPolicies, getAAAPolicies, createAAAPolicy, updateAAAPolicy, deleteAAAPolicy |
| `ConfigureAdoptionRules.tsx` | AP adoption rules configuration | `configure-adoption-rules` | (reads AP adoption rule endpoints) |
| `ConfigureGuest.tsx` | Guest portal and captive portal configuration | `configure-guest` | (reads/writes guest portal config endpoints) |
| `ConfigureAdvanced.tsx` | Advanced controller configuration settings | `configure-advanced` | (reads/writes advanced config endpoints) |
| `ConfigureSites.tsx` | Site management — create, edit, delete sites; station correlation | `configure-sites` | makeAuthenticatedRequest (/v3/sites), createSite, updateSite, deleteSite, getStationsWithSiteCorrelation, cancelAllRequests |
| `Tools.tsx` | Developer/admin tools aggregator | `tools` | getEvents |
| `Administration.tsx` | Administration hub — delegates to sub-panels for admin tasks | `administration` | (delegates to child components) |
| `ApiTestTool.tsx` | Interactive API request builder and response viewer | `api-test` | makeAuthenticatedRequest (any endpoint) |
| `ApiDocumentation.tsx` | In-app API documentation browser | `api-documentation` | (static + makeAuthenticatedRequest for live examples) |
| `HelpPage.tsx` | In-app help page | `help` | None |
| `PerformanceAnalytics.tsx` | Performance analytics — throughput trends, SLE, client metrics | `performance-analytics` (unlisted) | makeAuthenticatedRequest (analytics endpoints), getStations, getAccessPoints |

### Detail Panels (slide-out overlays, not standalone routes)

| File | Purpose | Trigger | Key API Methods |
|------|---------|---------|-----------------|
| `AccessPointDetail.tsx` | AP detail — overview, stations, events, insights, configure | Click AP in table | getAccessPointDetails, getAccessPointStations, getAccessPointEvents (flattened), rebootAP |
| `ClientDetail.tsx` | Client detail — connection info, events, roaming trail, reauthenticate, disassociate | Click client in table | getStation, fetchStationEventsWithCorrelation, disassociateStations, reauthenticateStation |
| `SiteDetail.tsx` | Site detail — AP list, client list, live site state | Click site in table | getAccessPointsBySite, getStations, makeAuthenticatedRequest (/v1/state/sites/…) |

### Significant Sub-components That Call apiService

| File | Purpose | Parent / Context | Key API Methods |
|------|---------|-----------------|-----------------|
| `ConnectedClients.tsx` | Earlier connected clients table (now superseded by TrafficStatsConnectedClients) | Imported by LoginForm, Settings | getStationsWithSiteCorrelation, makeAuthenticatedRequest (/v1/stations) |
| `NetworkChatbot.tsx` | NL chatbot assistant overlay | App.tsx (NetworkAssistant) | via chatbotService → apiService (stations, APs, sites, events) |
| `APInsights.tsx` | AP-level insights (RFQI, channel util, retries) | AccessPointDetail | getAccessPointInsights, makeAuthenticatedRequest (RF quality) |
| `ClientInsights.tsx` | Client-level insights (signal, roaming, experience) | ClientDetail | getClientInsights, getStation, fetchStationEvents |
| `Dashboard.tsx` | Original dashboard (legacy, superseded by DashboardEnhanced) | Imported by DashboardEnhanced | getAccessPoints, getStations, getSites, getServices, getAaaPolicies |
| `AlertsEventsEnhanced.tsx` | Enhanced alerts/events panel | DashboardEnhanced | getEvents, makeAuthenticatedRequest (/v1/alerts) |
| `AlertsEvents.tsx` | Legacy alerts/events panel | Superseded | getEvents |
| `NetworkInsights.tsx` | Network insights overview | Superseded by NetworkInsightsEnhanced | getAccessPoints, getStations, getSites |
| `ServiceLevels.tsx` | Legacy SLE overview | Superseded by ServiceLevelsEnhanced | getStations, getAccessPoints, getSites |
| `ServiceLevelsEnhanced.tsx` | Enhanced SLE overview panel | DashboardEnhanced, ServiceLevels | makeAuthenticatedRequest (SLE/RFQI endpoints) |

---

## Dead Code Candidates

Components and services with zero external imports (not imported by any other file in `src/`) or not referenced in App.tsx routing.

### Service Files — Zero Imports Outside Their Own File

| File | Evidence |
|------|----------|
| `src/services/serviceMapping.ts` | `serviceMappingService` is exported but never imported by any component or hook; `simpleServiceMapping.ts` is the active replacement |

### Components — Zero Import References

| File | Why It Is Dead Code |
|------|---------------------|
| `src/components/NetworkInsights.tsx` | 0 imports — replaced by `NetworkInsightsEnhanced.tsx` and `DashboardEnhanced.tsx` |
| `src/components/NetworkInsightsEnhanced.tsx` | 0 imports — replaced by `DashboardEnhanced.tsx` |
| `src/components/NetworkInsightsSimplified.tsx` | 0 imports — no known consumer |
| `src/components/LicenseDashboardEnhanced.tsx` | 0 imports — `LicenseDashboard.tsx` is the active route component |
| `src/components/ContextualInsightsDashboard.tsx` | 0 imports — no route or parent imports it |
| `src/components/HighAvailabilityWidget.tsx` | 0 imports — no route or parent imports it |
| `src/components/SwitchesWidget.tsx` | 0 imports — no route or parent imports it |
| `src/components/APsUpgradeReport.tsx` | 0 imports — no route or parent imports it |
| `src/components/BackupRestoreManager.tsx` | 0 imports — `SystemBackupManager.tsx` is the active route component |
| `src/components/ReportManagement.tsx` | 0 imports — no route or parent imports it |
| `src/components/SystemUtilities.tsx` | 0 imports — no route or parent imports it |

### Hooks — Zero External Imports

| File | Evidence |
|------|----------|
| `src/hooks/useTabVisibilityPolling.ts` | 0 imports outside the hook file itself — no component or service uses it |

### Notes on Partial Dead Code (Low Import Count)

| File | Import Count | Notes |
|------|-------------|-------|
| `src/components/ConnectedClients.tsx` | 3 | Imported by `LoginForm.tsx` and `Settings.tsx` but the active `connected-clients` route uses `TrafficStatsConnectedClients.tsx`; likely retained for settings panel only |
| `src/components/AlertsEvents.tsx` | 1 | Superseded by `AlertsEventsEnhanced.tsx`; single import may be legacy |
| `src/components/ServiceLevels.tsx` | 2 | Superseded by `ServiceLevelsEnhanced.tsx`; retained imports may be legacy |
| `src/services/widgetService.ts` | 1 | Single consumer is `ReportWidgets.tsx`; the `/v1/report/sites` endpoint is noted as problematic in `simplifiedWidgetService.ts` |
| `src/services/simpleServiceMapping.ts` | 1 | Single consumer — verify active usage |
