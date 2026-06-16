# AURA Audit Logs — Metrics, Defaults & APIs

> Source of truth: `src/components/AuditLogsWidget.tsx`, `src/components/EventAlarmDashboard.tsx`, `src/services/api.ts`
> Generated: 2026-05-28

The Audit Logs feature surfaces user actions and system events from the Extreme Campus Controller. It is the **Swagger-documented** path AURA uses everywhere a "recent activity" list is needed (the older `/v1/events` endpoint is intentionally avoided — see code note in `EventAlarmDashboard.tsx:26`).

---

## 1. Fields Displayed

Each audit log row is a tolerant superset — the backend returns one canonical field name, AURA falls back across known synonyms:

| Display Field | Source Fields (in order) |
|---|---|
| Timestamp     | `timestamp` → `time` |
| User          | `user` → `userId` → `username` |
| Action        | `action` → `actionType` |
| Resource      | `resource` → `resourceType` |
| Description   | `description` → `message` |
| Status        | `status` |
| Severity      | `severity` |
| IP address    | `ipAddress` |
| ID            | `id` |

## 2. Action Categorization

The widget infers a badge from the `action`/`status` strings:

| Badge | Trigger (substring, case-insensitive) | Visual |
|---|---|---|
| Error      | `status` contains `error` or `fail` | Red destructive badge + AlertCircle icon |
| Create     | `action` contains `create` or `add` | Green outline + CheckCircle |
| Update     | `action` contains `update` or `modify` | Blue outline |
| Delete     | `action` contains `delete` or `remove` | Red outline + AlertCircle (warning color) |
| (raw)      | any other action | Secondary badge with the action verb |
| (none)     | no action present | Info icon, no badge |

## 3. Filter Controls

| Filter | Effect |
|---|---|
| **All** (default after load) | Show every entry |
| **User** | Entry must have a user (`user`/`userId`/`username`) AND an action |
| **System** | Entry has no user, OR action contains `system` |

## 4. Defaults

| Setting | Default | Notes |
|---|---|---|
| Time window | **Last 7 days** | `endTime = Date.now()`, `startTime = endTime − 7 × 24 × 3600 × 1000` |
| Initial filter | `all` | User can toggle to User / System via badge clicks |
| API timeout | 15,000 ms | Hard-coded in `getAuditLogs()` (api.ts:4050) |
| Refresh cadence | On mount only | No polling; manual reload page or re-mount |
| Result on error | `[]` (empty) | Failures are swallowed and logged to console |

Timestamp formatting: `Month Day, HH:MM:SS` in the user's locale (`toLocaleString('en-US', …)`).

---

## 5. APIs Used

### Primary endpoint

| Endpoint | Method | Purpose | Caller |
|---|---|---|---|
| `/v1/auditlogs?startTime=<ms>&endTime=<ms>` | GET | All audit-log entries in the requested window | `apiService.getAuditLogs(startTime, endTime)` (api.ts:4041) |

- Query params are optional — both are integers in **epoch milliseconds**.
- Authenticated via the standard `Authorization: Bearer <token>` header (token from `localStorage`, auto-refreshed on 401 by `makeAuthenticatedRequest`).
- Multi-controller deployments: proxied through `/api/management/v1/auditlogs`, with `X-Controller-URL` header for routing.

### Related endpoints (Events / Alarms screen)

When the user views the full **Event & Alarm Dashboard** (`EventAlarmDashboard.tsx`), auditlogs are joined with alarm data:

| Endpoint | Method | Purpose | Notes |
|---|---|---|---|
| `/v1/auditlogs` | GET | Backs the "Events" tab (audit log fields mapped to event shape) | Same call as the widget |
| `/v1/alarms` | GET | All alarms | Non-Swagger; tolerated to fail (warning only) |
| `/v1/alarms/active` | GET | Currently active alarms | Non-Swagger; tolerated to fail |
| `/v1/alarms/{id}/acknowledge` | POST | Acknowledge alarm | Triggers full reload on success |
| `/v1/alarms/{id}/clear` | POST | Clear alarm | Triggers full reload on success |

The non-Swagger `/v1/alarms*` endpoints are wrapped in `Promise.allSettled` so the page degrades cleanly when a controller doesn't expose them.

### Field-to-event mapping (Events tab)

```text
log.action || log.actionType || log.resourceType   → event.type
log.severity || (log.status ~ /error/ ? 'critical') → event.severity
log.description || log.message || `${action} ${resource}` → event.message
log.timestamp || log.time                          → event.timestamp
log.user || log.username || log.userId             → event.user
```

---

## 6. File Reference

| Path | Purpose |
|---|---|
| `src/components/AuditLogsWidget.tsx` | Standalone widget (7-day window, filter chips, ScrollArea list) |
| `src/components/EventAlarmDashboard.tsx` | Full screen combining audit logs + alarms + active alarms |
| `src/services/api.ts:4041` | `getAuditLogs()` implementation |
| `src/services/api.ts:6432` | `getAlarms()` |
| `src/services/api.ts:6458` | `getActiveAlarms()` |
| `src/services/api.ts:6482` | `acknowledgeAlarm()` |
| `src/services/api.ts:6509` | `clearAlarm()` |
