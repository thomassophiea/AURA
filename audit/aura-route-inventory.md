# AURA Route Inventory

Generated: 2026-03-28
Source: App.tsx, Sidebar.tsx

---

## Routes

All routes are rendered by the `renderPage()` switch statement in `src/App.tsx`.
All route components are lazy-loaded via `React.lazy()` unless noted otherwise.

| Route ID | Component | File | Lazy? | Error Boundary? | Section |
|----------|-----------|------|-------|-----------------|---------|
| `workspace` | `Workspace` | `src/components/Workspace.tsx` | Yes | No | Navigation |
| `service-levels` | `DashboardEnhanced` | `src/components/DashboardEnhanced.tsx` | Yes | No | Navigation |
| `sle-dashboard` | `SLEDashboard` | `src/components/sle/SLEDashboard.tsx` | Yes | No | Navigation |
| `app-insights` | `AppInsights` | `src/components/AppInsights.tsx` | Yes | No | Navigation |
| `connected-clients` | `TrafficStatsConnectedClients` | `src/components/TrafficStatsConnectedClients.tsx` | Yes | No | Navigation |
| `access-points` | `AccessPoints` | `src/components/AccessPoints.tsx` | Yes | No | Navigation |
| `performance-analytics` | `PerformanceAnalytics` | `src/components/PerformanceAnalytics.tsx` | No (direct import) | No | Navigation (unlisted in sidebar) |
| `report-widgets` | `ReportWidgets` | `src/components/ReportWidgets.tsx` | Yes | No | Navigation |
| `pci-report` | `PCIReport` | `src/components/PCIReport.tsx` | Yes | No | System |
| `system-backup` | `SystemBackupManager` | `src/components/SystemBackupManager.tsx` | Yes | Yes (`fallbackTitle="System Backup Error"`) | System |
| `license-dashboard` | `LicenseDashboard` | `src/components/LicenseDashboard.tsx` | Yes | Yes (`fallbackTitle="License Dashboard Error"`) | System |
| `firmware-manager` | `APFirmwareManager` | `src/components/APFirmwareManager.tsx` | Yes | Yes (`fallbackTitle="Firmware Manager Error"`) | System |
| `network-diagnostics` | `NetworkDiagnostics` | `src/components/NetworkDiagnostics.tsx` | Yes | Yes (`fallbackTitle="Network Diagnostics Error"`) | System |
| `event-alarm-dashboard` | `EventAlarmDashboard` | `src/components/EventAlarmDashboard.tsx` | Yes | Yes (`fallbackTitle="Events & Alarms Error"`) | System |
| `security-dashboard` | `SecurityDashboard` | `src/components/SecurityDashboard.tsx` | Yes | Yes (`fallbackTitle="Security Dashboard Error"`) | System |
| `guest-management` | `GuestManagement` | `src/components/GuestManagement.tsx` | Yes | Yes (`fallbackTitle="Guest Management Error"`) | System |
| `configure-networks` | `ConfigureNetworks` | `src/components/ConfigureNetworks.tsx` | Yes | No | Configure |
| `configure-policy` | `ConfigurePolicy` | `src/components/ConfigurePolicy.tsx` | Yes | No | Configure |
| `configure-aaa-policies` | `ConfigureAAAPolicies` | `src/components/ConfigureAAAPolicies.tsx` | Yes | No | Configure |
| `configure-adoption-rules` | `ConfigureAdoptionRules` | `src/components/ConfigureAdoptionRules.tsx` | Yes | No | Configure (unlisted in sidebar) |
| `configure-guest` | `ConfigureGuest` | `src/components/ConfigureGuest.tsx` | Yes | No | Configure |
| `configure-advanced` | `ConfigureAdvanced` | `src/components/ConfigureAdvanced.tsx` | Yes | No | Configure |
| `configure-sites` | `ConfigureSites` | `src/components/ConfigureSites.tsx` | Yes | No | Configure |
| `tools` | `Tools` | `src/components/Tools.tsx` | Yes | No | Desktop-only |
| `administration` | `Administration` | `src/components/Administration.tsx` | Yes | No | Desktop-only |
| `api-test` | `ApiTestTool` | `src/components/ApiTestTool.tsx` | Yes | No | Desktop-only (dev mode) |
| `api-documentation` | `ApiDocumentation` | `src/components/ApiDocumentation.tsx` | Yes | No | Desktop-only (unlisted in sidebar) |
| `help` | `HelpPage` | `src/components/HelpPage.tsx` | Yes | No | Desktop-only |

**Total: 28 routes**

### Notes on `pageInfo` keys that are NOT in the switch (render as `PlaceholderPage`)

The following keys appear in the `pageInfo` object in App.tsx but have no explicit `case` in `renderPage()`. When navigated to, they fall through to the `default` branch and render a `PlaceholderPage`:

- `sites-overview`
- `configure-aaa` (superseded by `configure-aaa-policies`)
- `configure-devices`
- `network-visualization`

---

## Sidebar vs. App.tsx Route Discrepancies

| Sidebar ID | Sidebar Label | In App.tsx switch? | Notes |
|------------|---------------|--------------------|-------|
| `workspace` | Workspace | Yes | |
| `service-levels` | Contextual Insights | Yes | |
| `sle-dashboard` | Service Levels | Yes | |
| `app-insights` | App Insights | Yes | |
| `connected-clients` | Connected Clients | Yes | |
| `access-points` | Access Points | Yes | |
| `report-widgets` | Report Widgets | Yes | |
| `configure-sites` | Sites & Site Groups | Yes | |
| `configure-networks` | Networks | Yes | |
| `configure-policy` | Policy | Yes | |
| `configure-aaa-policies` | AAA Policies | Yes | |
| `configure-guest` | Guest | Yes | |
| `configure-advanced` | Advanced | Yes | |
| `system-backup` | Backup & Storage | Yes | |
| `license-dashboard` | License Management | Yes | |
| `firmware-manager` | Firmware Manager | Yes | |
| `network-diagnostics` | Network Diagnostics | Yes | |
| `event-alarm-dashboard` | Events & Alarms | Yes | |
| `security-dashboard` | Security | Yes | |
| `pci-report` | PCI DSS Report | Yes | |
| `guest-management` | Guest Access | Yes | |
| `tools` | Tools | Yes | Desktop-only sidebar item |
| `administration` | Administration | Yes | Desktop-only sidebar item |
| `help` | Help | Yes | Desktop-only sidebar item |
| — | — | `performance-analytics` | In switch, NOT in sidebar |
| — | — | `configure-adoption-rules` | In switch, NOT in sidebar |
| — | — | `api-test` | In switch, NOT in sidebar (dev mode button) |
| — | — | `api-documentation` | In switch, NOT in sidebar (navigated programmatically) |

---

## Detail Panels

Detail panels use the `DetailSlideOut` component (`src/components/DetailSlideOut.tsx`) which wraps a `<Sheet>`. They are rendered by `renderDetailPanel()` in App.tsx.

| Type | Component | File | Trigger | Width |
|------|-----------|------|---------|-------|
| `access-point` | `AccessPointDetail` | `src/components/AccessPointDetail.tsx` | Row click in `AccessPoints`; `onShowDetail` callback | `xl` |
| `client` | `ClientDetail` | `src/components/ClientDetail.tsx` | Row click in `TrafficStatsConnectedClients` or `SLEDashboard`; `onShowDetail` / `onClientClick` callback | `lg` |
| `site` | `SiteDetail` | `src/components/SiteDetail.tsx` | Row click in `ConfigureSites`; `onShowDetail` callback | `lg` |

**Total: 3 detail panel types**

---

## Modal/Dialog Workflows

Only page-level components are listed; primitive `ui/` components and infrastructure wrappers are excluded.

| Dialog/Sheet Component | Triggered From | Purpose |
|------------------------|----------------|---------|
| `<Dialog>` (GDPR Delete) | `TrafficStatsConnectedClients` | Confirm GDPR/right-to-be-forgotten client data deletion |
| `<Dialog>` (GDPR Delete) | `ConnectedClients` (legacy, not active route) | Confirm GDPR client data deletion |
| `<Dialog>` (Threshold) | `SLEDashboard` | Set SLE threshold values |
| `<Dialog>` (SLE Root Cause) | `SLERootCausePanel` (inside `sle/`) | Show SLE root-cause drill-down details |
| `<Dialog>` (Create Guest) | `GuestManagement` | Create a new guest access account |
| `<Dialog>` (Create Backup) | `BackupRestoreManager` (inside `SystemBackupManager`) | Create a new configuration backup |
| `<Dialog>` (Restore Backup) | `BackupRestoreManager` | Confirm and execute configuration restore |
| `<Dialog>` (Create Backup) | `SystemBackupManager` | Create backup |
| `<Dialog>` (Restore Backup) | `SystemBackupManager` | Restore from backup |
| `<Dialog>` (Delete Backup) | `SystemBackupManager` | Confirm backup deletion |
| `<Dialog>` (Install License) | `LicenseDashboard` | Install / activate a new license key |
| `<Dialog>` (Activate License) | `LicenseDashboardEnhanced` | Activate license (enhanced sub-component) |
| `<Dialog>` (Confirm Firmware Upgrade) | `APFirmwareManager` | Confirm immediate firmware upgrade |
| `<Dialog>` (Schedule Upgrade) | `APFirmwareManager` | Schedule a future firmware upgrade |
| `<Dialog>` (Schedule Upgrade) | `FirmwareUpgradeManager` | Schedule firmware upgrade (sub-component) |
| `<Dialog>` (AAA Policy Create/Edit) | `ConfigureAAAPolicies` | Create or edit an AAA policy |
| `<Dialog>` (RADIUS Server Add/Edit) | `ConfigureAAAPolicies` | Add or edit a RADIUS server |
| `<Dialog>` (LDAP Config Add/Edit) | `ConfigureAAAPolicies` | Add or edit an LDAP configuration |
| `<Dialog>` (Local User Add/Edit) | `ConfigureAAAPolicies` | Add or edit a local user |
| `<Dialog>` (Policy Detail) | `ConfigurePolicy` | View/edit network policy details |
| `<Dialog>` (CoS Detail) | `ConfigurePolicy` | View CoS (Class of Service) details |
| `<Dialog>` (Topology Detail) | `ConfigurePolicy` | View topology details |
| `<Dialog>` (Topology Edit) | `ConfigurePolicy` | Edit topology |
| `<Dialog>` (Create WLAN) | `ConfigureNetworks` | Create a new WLAN |
| `<Dialog>` (Edit WLAN) | `ConfigureNetworks` | Edit an existing WLAN |
| `<Dialog>` (Bulk Action) | `ConfigureNetworks` | Perform bulk WLAN actions |
| `<Dialog>` (Assign Sites) | `ConfigureNetworks` | Assign WLAN to sites |
| `<Dialog>` (QR Code) | `ConfigureNetworks` | Show WLAN QR code |
| `<Dialog>` (Create WLAN — full wizard) | `CreateWLANDialog` | Multi-step WLAN creation wizard (used by ConfigureNetworks) |
| `<Dialog>` (Create Site) | `ConfigureSites` | Create a new site |
| `<Dialog>` (Edit Site) | `ConfigureSites` | Edit an existing site |
| `<Dialog>` (WLAN Assignment) | `ConfigureSites` / `SiteWLANAssignmentDialog` | Assign WLANs to a site |
| `<Dialog>` (Portal Profile) | `ConfigureGuest` | Create or edit a guest portal profile |
| `<Dialog>` (Guest Account) | `ConfigureGuest` | Create a guest account from configure page |
| `<Sheet>` (sub-sections) | `ConfigureAdvanced` | Slide-out panels for: Topology, CoS Profile, Rate Limiter, AP Profile, IoT Profile, Meshpoint, Location Services (7 Sheet panels) |
| `<Dialog>` (Create/Edit Adoption Rule) | `ConfigureAdoptionRules` | Create or edit an AP adoption rule |
| `<Dialog>` (Add Controller) | `ControllerSelector` | Add a new controller connection |
| `<Dialog>` (Edit Controller) | `ControllerSelector` | Edit an existing controller connection |
| `<Dialog>` (Admin Create/Edit) | `AdministratorsManagement` (inside Administration) | Create or edit an administrator |
| `<Dialog>` (Application Create/Edit) | `ApplicationsManagement` (inside Administration) | Create or edit an application |
| `<Dialog>` (Role Edit) | `RoleEditDialog` | Edit user role permissions |
| `<Dialog>` (Access Rule) | `AccessControlRules` | Create or edit an access control rule |
| `<Dialog>` (Access Group) | `AccessControlGroups` | Create or edit an access control group |
| `<Dialog>` (AAA Config) | `AccessControlAAA` | Configure AAA on access control |
| `<Dialog>` (Portal Config) | `AccessControlPortals` | Configure captive portal |
| `<Dialog>` (Captive Portal) | `CaptivePortalConfig` | Full captive portal configuration dialog |
| `<Dialog>` (Upload Certificate) | `CertificateManager` | Upload a certificate to trust store |
| `<Dialog>` (Certificate Detail) | `CertificateManager` | View certificate details |
| `<Dialog>` (Webhook Create/Edit) | `EventNotificationsConfig` | Create or edit event webhook |
| `<Dialog>` (Email Notification) | `EventNotificationsConfig` | Create or edit email notification |
| `<Sheet>` (RF Management) | `RFManagementTools` | RF management/configuration slide-out |
| `<Sheet>` (Notifications) | `NotificationsMenu` (header) | Notifications tray |
| `<Dialog>` (Dashboard Customize) | `DashboardCustomization` | Customize dashboard widgets |
| `<Dialog>` (Profile Picker) | `wlans/ProfilePickerDialog` | Pick security/network profile for WLAN |
| `<Dialog>` (Interface Assignment) | `wlans/ProfileInterfaceAssignmentDialog` | Assign WLAN to AP interface |
| `<AlertDialog>` (Delete Confirm) | `ContextConfigModal` | Confirm context/profile deletion |
| `<AlertDialog>` (Delete Device) | `ConfigureDevices` | Confirm device deletion |
| `<Dialog>` (Create Device) | `ConfigureDevices` | Create a new device configuration |
| `<Dialog>` (Edit Device) | `ConfigureDevices` | Edit an existing device configuration |
| `<Dialog>` (Shortcuts Help) | `ShortcutsHelpDialog` | Show keyboard shortcuts reference |

**Total: ~58 dialog/modal/sheet workflows across ~30 components**
