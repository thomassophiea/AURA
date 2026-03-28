# AURA Full Application Audit — Summary

**Date:** 2026-03-28
**Swagger Version:** Extreme Campus Controller REST API Gateway v1.25.1
**Total Swagger Paths:** 243
**Total App Endpoints Used:** ~69
**Swagger Coverage:** ~28% of available endpoints utilized

---

## Executive Summary

The AURA application is a well-structured React dashboard for Extreme Networks Campus Controller management. The core API integration is sound — authentication, AP management, station queries, and site management all use correct Swagger-documented endpoints. The primary issues found fall into three categories: (1) debug artifacts left in production code, (2) hardcoded/mock data masquerading as real metrics, and (3) some endpoints not in the public Swagger that may or may not exist on actual hardware.

---

## Pages and Status

| Page | Endpoint Coverage | Data Quality | Issues Found | Status |
|------|-------------------|--------------|--------------|--------|
| Dashboard (DashboardEnhanced) | High | Good | Rate unit ambiguity, service limit 10 | Functional |
| Access Points | High | Good | Debug logging removed | Fixed |
| Connected Clients | Medium | Good | None critical | Functional |
| Sites Overview | Medium | Was broken | Health/status/clients were fake | Fixed |
| Service Levels Enhanced | Medium | Was broken | Math.random() metrics | Fixed |
| SLE Dashboard | High | Good | Uses sleCalculationEngine correctly | Functional |
| App Insights | High | Good | No issues found | Functional |
| Performance Analytics | Medium | Was broken | Hardcoded health=85, uptime=95 | Fixed |
| AP Firmware Manager | Medium | Unknown | Needs review | Pending |
| Network Diagnostics | Low | Unknown | Uses /platformmanager/ paths | Pending |
| Security Dashboard | Low | Was broken | /v1/security/* not in Swagger | Flagged |
| License Dashboard | Low | Unknown | Uses /platformmanager/ paths | Pending |
| Guest Management | Unknown | Unknown | Needs review | Pending |
| Administration | Unknown | Unknown | Needs review | Pending |
| Event/Alarm Dashboard | Medium | Good | Minor error handling gaps | Functional |
| Client Detail | Medium | Good | Debug UUID removed | Fixed |
| AP Detail | High | Good | Zero-uptime display fixed | Fixed |
| AP Insights | High | Good | Zero-value filtering fixed | Fixed |

---

## Fake/Mock Data Found and Removed

1. **sleDataCollection.ts** — `Math.random()` for successful_connects (wireless+wired), ap_health, switch_health → Replaced with real RSSI-based calculations or omitted
2. **ServiceLevelsEnhanced.tsx** — `Math.random()` for reliability, uptime, successRate, errorRate, time-series variation → Removed
3. **PerformanceAnalytics.tsx** — Hardcoded `health = 85`, `uptime = 95` fallbacks → Changed to null
4. **SitesOverview.tsx** — `healthPercentage: 100`, `status: 'online'`, `clients: 0` hardcoded → Now uses real API data
5. **AccessPoints.tsx** — Debug logging block targeting specific serial number → Removed
6. **ClientDetail.tsx** — Diagnostic call for hardcoded site UUID → Removed

---

## Enhancement Opportunities (Swagger Endpoints Not Used)

1. **GET /v1/state/aps** — Would give real operational status per AP (currently AccessPoints shows only `status` field from query endpoint). Could power accurate AP health badges.
2. **GET /v1/state/entityDistribution** — Aggregate distribution of entity states. Could power dashboard health summary cards.
3. **GET /v1/aps/{serial}/lldp** — LLDP neighbor info per port. Could show switch connectivity in AP detail view.
4. **GET /v1/aps/{serial}/location** — Station location data for floor maps.
5. **GET /v2/report/upgrade/devices** — Device upgrade report for firmware manager.
6. **GET /v3/roles/{id}/rulestats** — Rule hit statistics per role. Could enhance policy analytics.
7. **GET /v1/notifications/regional** — Regional notifications (only global used today).
8. **GET /v4/adsp** — App uses deprecated /v3/adsp for Air Defense profiles.
9. **GET /v3/meshpoints** — Mesh topology not visualized despite being available.

---

## Accuracy Issues Remaining (Not Yet Fixed)

- **SecurityDashboard**: `/v1/security/*` endpoints not in Swagger — dashboard may always show empty on some controller versions
- **Capacity metric**: Uses SNR-based proxy (`avgSnr / 40 * 100`) — real channel utilization from `/v1/aps/ifstats` would be more accurate but requires a separate polling loop
- **Time-to-connect**: RSSI-based heuristic estimate only — real connect-event data would require event log polling

## Accuracy Issues Fixed in This Audit

- **Coverage metric**: Fixed from `% poor signal` (inverted) to `% good coverage` (100 - poorSignalCount/total * 100)
- **Throughput in sleDataCollection**: Fixed from average `(avgTxRate + avgRxRate) / 2` to sum `avgTxRate + avgRxRate`
- **Capacity metric**: Replaced `100 - (wirelessClients * 2)` hardcoded formula with SNR-based calculation
- **ADSP endpoints**: Upgraded from deprecated `/v3/adsp` to `/v4/adsp` across api.ts
