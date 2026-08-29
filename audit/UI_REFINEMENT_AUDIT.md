# AURA Enterprise UI Refinement — Audit & Plan of Record

Date: 2026-08-29 · Scope: entire UI surface (Network Overview + all pages) · Verified against live Integration @ 0e200c0 (browser) and full source audit (6 parallel deep audits).

## Executive summary

The app today mixes **three competing visual languages** (EP1 enterprise cards, Material-dark dev styling, and an "Observatory" sci-fi instrument aesthetic with serif display type and mono letterspaced labels), **four chart palettes**, **five table families**, and **five status vocabularies**. The palette foundation (`src/config/colorPalette.ts`, EP1-captured, contrast-tested) is excellent but bypassed by 111 files carrying 961 raw Tailwind hue classes. The plan: unify tokens first (CSS/TS only), build a small set of shared primitives, then sweep pages — Network Overview deepest.

## Key findings (full details in agent reports)

### Color system
- **Token collision:** Tailwind `text-success` → `--success` (Material values, 10 definition sites) while 70 files use `var(--status-*)` (EP1 values via `applyTheme`). Same theme, two greens. 4 `!important` patch blocks in `globals.css` remap `-500` hue classes per theme — papering over the problem.
- 961 raw hue-class occurrences / 111 files; `emerald` hand-patched back into CSS as static `oklch()` (not theme-aware).
- 17 status→color functions, 9 status→Badge-variant functions, 4+ tone maps. No `offline`/`neutral` token exists.
- `--chart-1..5` = Material palette; EP1 categorical ramp (ΔE-verified) exists but only 7/18 chart files use the central palette. Band colors defined 4 incompatible ways.
- "online" renders **brand purple** via `variant="default"` Badge in 5 files.

### Tables
- 5 families: ResourceGridPage/AG (good), hand-wired AG, ui/table+customization, hand-rolled ui/table (30+ files), raw `<table>` (12 files), card-lists-pretending (EventAlarmDashboard, GuestManagement).
- `ui/table` lacks `table-fixed` → every `truncate` in cells is inert. AG headers don't match ui/table headers (no muted band, no zebra).
- **Zero copy-to-clipboard** on any MAC/IP/serial cell. 14+ timestamp formatters; the shared one has 0 consumers. Null shown as `-`/`—`/`N/A` (25/105/96 sites).
- ~500 lines of unreachable table fallback code behind `GridModeContext.agGridEnabled` hardcoded `true`.

### Cards & charts
- 8 card families; shared `InstrumentPanel` + entire `src/components/widgets/` dir (996 LOC + chart.js dependency) are dead code.
- **Fabricated telemetry on the landing page:** `InsightCardsGrid` hardcodes OS ONE Coverage "100%", CPU "5.5%", Memory "38%".
- Metric font sizes ×5, `font-bold`(125) vs `font-semibold`(21), 3 label casings, 4 icon placements.
- 11 duplicate `formatBytes` (1024 vs 1000 base conflict), 7 bps ladders, 139 bare `}%`.
- Charts silently render nothing when empty in 8+ places (layout collapse). Light theme loses chart axes (`rgba(255,255,255,…)` ticks).

### Network Overview specifically
- Observatory hero (Fraunces italic serif title, "LIVE TELEMETRY" eyebrow, mono SYNC) + CH-01..04 instrument tiles with "CLNT"/"EVT" abbreviations — off-brand for enterprise.
- Estate row leaks env var name: "Default controller (CAMPUS_CONTROLLER_URL)"; "1 controller(s)".
- Same 3 scalars (APs offline / critical / warning) rendered 4× (KPI tile, Active Issues, RecentEventsSummary, DetailPanel ~1200 lines). BestPractices/ClientProtocol/AuditLogs each render twice across branches.
- `avgChannelUtil` and `avgRfqi` initialized 0 and **never assigned** → two permanent NoData cells + zeroed radar axis.
- SNR estimated as `rssi+95` while real `station.snr` is fetched and discarded; band guessed from throughput while `station.band` is available.
- No health score, no sites-requiring-attention list; real alarms API (`/v1/alarms/active` + ack/clear) never called from overview.
- Rich unsurfaced data already fetched: AP cpu/memory/channelUtilization/sysUptime/firmware/power, station snr/rates/vlan/authMethod/roamCount/latency, Site activeAPs/adoptionPrimary(HA).

### Terminology & copy
- "Controller" in ~50 user-visible strings (Sidebar nav ×3, Site Groups page ×5, backup/restore copy, etc.) → "Gateway". Technical contexts (X-Controller-URL, login flow) stay.
- SSID/WLAN conflation: "SSID / Service Name" column, "Active guest SSIDs", QuickWLAN label/placeholder contradiction.
- Nav label ≠ page title on 9 pages ("App Analytics"/"App Insights", "Energy"/"Energy Optimization"…); two pages both titled "Guest Access".
- Raw API status rendered as badge text (`InService`, `-`); "Dl Lost Retries Packets" column header; "1 AP(s)"/"controller(s)"/"Networks(s)" pluralization; "Wi-Fi" vs "WiFi"; 4 dead "coming soon" toasts on AP actions; raw `Object.entries` JSON dump card ("Technical Details"); raw UUID on Energy report line.
- 5 status vocabularies (Online/Offline, Active/Inactive, Connected/Disconnected, In service, InService raw).

### Overflow & responsive
- No shared truncate primitive; 29 files truncate with no tooltip/title; 163 `flex-1` without `min-w-0`.
- `InfoRow` label/value shape repeated 125× with no hardening (detail pages).
- Top bar org badge `flexShrink:0` no truncate; AP name cell hard-clips w/o ellipsis; EstateOverview truncate is a CSS no-op (inline span in block parent).
- 213 fixed `grid-cols-*` vs 99 responsive; desktop shell runs from 768px with 256px sidebar → 768–1280 band under-tested.
- 14 raw tables in SentinelInfraTab without overflow wrappers.

## Plan of record (execution order)

**Phase 1 — Token foundation (CSS/TS only)**
1. `index.css @theme`: point `--color-success/warning/info/destructive` at `--status-*`; add `--color-status-*` passthroughs.
2. `themes.ts`: add `statusOffline`/`statusNeutral` + `chart1..10` (EP1 categorical) to every theme; fix `theme-dev` class removal bug.
3. `colorPalette.ts`: add offline/neutral (derived, contrast-checked, tested).
4. New `src/lib/statusColors.ts`: `normalizeStatus()` + `statusToneClasses()`; AGGridWrapper imports the tone map instead of owning it.
5. `badge.tsx`: success/warning/info fixed fallbacks + `critical/offline/neutral`; shared `StatusBadge`/`StatusDot`.

**Phase 2 — Shared primitives**
6. `ui/cells.tsx`: StatusCell, MonoCell (copy-on-hover), TimestampCell (RelativeTime-based), TruncatedCell, EmptyCell, NumericCell.
7. `ui/DetailRow.tsx` (hardened InfoRow) + `ui/TruncatedText`.
8. `ui/table.tsx` `fixed` prop; AGGridWrapper header/zebra/empty-state parity.
9. `ui/MetricCard.tsx` — single KPI card family (Energy-page style, semantic icon tones); `ChartFrame` + shared tooltip/axis constants.
10. `lib/units.ts`: `formatPercent`, `formatCount`, unified `formatBytes`, `formatDuration`.

**Phase 3 — Network Overview restructure**
11. Enterprise header (kill Fraunces/eyebrow), estate row copy fix, KPI row on MetricCard, collapse duplicate widgets, single Attention panel, real data for CPU/Memory/coverage, compute avgChannelUtil/avgRfqi, real snr/band, Sites-requiring-attention widget (existing `getSites` fields), real alarms feed.

**Phase 4 — Page sweeps**
12. Clients (icon tones, GDPR row, mono/copy/timestamps, username/role truncate), Access Points (title, raw status fix, dead menu items, Technical Details, LED column), Events & Alarms (real table), terminology sweep (Gateway, SSID/WLAN, casing, pluralization, nav↔title), overflow top-20, chart palette unification.

**Phase 5 — QC**
13. Tests + type-check + build + lint; browser pass dark+light at 1440/1100; repeat.

## Verification bar
- All ~3.6k unit tests green; tsc clean; production build clean.
- Live browser verification on Integration after deploy: dark + light, wide + narrow, every touched page.

## Status — 2026-08-29

**Shipped in b399323 + 9ab83f2** (net −1,272 lines): Phases 1–4 as planned above, all
verified by 3,594 green tests, clean tsc, clean production build. Highlights beyond the plan:
Events & Alarms rebuilt on AG grids with new column configs + 20 new tests; dead code removed
(`src/components/widgets/` + chart.js + react-chartjs-2 + InstrumentPanel + RecentEventsSummary
+ ~unreachable markup); `offline`/`neutral` added as first-class semantic states.

**Deliberately deferred** (low demo value ÷ cost, revisit after this lands):
- SentinelInfraTab: 14 raw `<table>`s without overflow wrappers (dense internal SLE surface).
- ConfigureAdvanced.tsx: 10 hand-rolled tables + 32 fixed grids (low-traffic config page).
- Unreachable `ui/table` fallback branches behind `GridModeContext.agGridEnabled === true`
  (~500 lines in AccessPoints/ConfigureNetworks/ConfigurePolicy/ConfigureGuest/
  ConfigureProfiles/AdministratorsManagement) — pure deletion, needs its own careful pass.
- formatBytes base-1024 vs base-1000 unification (11 local copies; changing output alters
  displayed numbers, needs a product decision on which base is contractual).
- GuestManagement page vs clients/GuestUsers duplication — candidate for deletion.
- SLE hexagon fills on Operational Insights (olive/military greens) — distinctive branding,
  left as-is pending a product call.
