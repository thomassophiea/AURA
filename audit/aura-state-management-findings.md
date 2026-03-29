# AURA State Management Findings

Generated: 2026-03-28 | Plan 4 — Task 2

---

## Error Handling Patterns

Analysis of `src/services/api.ts` (6,500+ line service file):

| Pattern | Count | Assessment |
|---------|-------|------------|
| `catch` blocks total | 299 | Expected for a large service file |
| `return []` on error | 150 | Acceptable — silently degrades to empty list; components handle empty state |
| `return null` on error | 137 | Acceptable — callers check for null |
| Silent swallow (catch + empty block) | 2 | Lines 3583, 6488 — fallback paths inside nested try/catch; outer catch logs the primary error |
| `finally` blocks | 195 uses in components | Loading state is consistently reset |
| Error thrown to caller | Common pattern in core auth paths | Errors from login/token operations are thrown |

**Key observations:**
- `api.ts` uses a `logger` service (dev-only no-op in production) for most logging — this is good
- The `errorHandler.ts` service provides `withRetry`, `parseError`, `getUserFriendlyMessage` — comprehensive
- Most components use `finally { setLoading(false) }` — loading state rarely gets stuck
- No loading states were found stuck permanently on error in the reviewed components

---

## Race Conditions

### useEffect with Empty Deps (`[]`)

9 instances found in components, all in form sub-components of `ConfigureAdvanced.tsx` and `AppInsights.tsx`. These are intentional "mount once" patterns for fetching initial data — not stale closure bugs.

### Async useEffect Without AbortController

No components use `AbortController` in their `useEffect` cleanup. However:
- The `apiService.cancelAllRequests()` method is called on page navigation (App.tsx line 701) — provides coarse-grained cancellation
- Individual component unmount doesn't cancel in-flight requests from `apiService`
- This is a known pattern trade-off: the centralized `cancelAllRequests()` covers route transitions

**Risk level: LOW** — In practice, stale async updates to unmounted components are caught by React 18's strict mode, and the app uses `startTransition` for page navigation. No crashes observed from this pattern.

### Concurrent State Updates

`DashboardEnhanced.tsx` loads data in sequential `await` chains within a single async function — no parallel race conditions. `TrafficStatsConnectedClients.tsx` uses `Promise.allSettled` for concurrent fetches — correct pattern.

---

## Memory Leaks

### Intervals

| Component | Interval | Cleanup |
|-----------|----------|---------|
| `AccessPointDetail.tsx` | 2x `setInterval` (auto-refresh + 60s) | Both have `return () => clearInterval` |
| `AlertsEventsEnhanced.tsx` | `setInterval` polling | `return () => clearInterval` |
| `SLEDashboard.tsx` | 60s data refresh | `return () => clearInterval` |
| `NetworkInsightsEnhanced.tsx` | Auto-refresh + setTimeout | `clearInterval` present |
| `ServiceLevelsEnhanced.tsx` | 5-min refresh | `return () => clearInterval` |
| `VenueStatsWidget.tsx` | Polling | `return () => clearInterval` |
| `ApplicationAnalyticsEnhancedWidget.tsx` | Polling | `return () => clearInterval` |
| `PacketCapture.tsx` | Progress + polling | Clears in handlers + finally |

**All intervals are properly cleaned up.**

### Event Listeners

| Component | Listener | Cleanup |
|-----------|----------|---------|
| `AccessPointDetail.tsx` | `visibilitychange` | `return () => removeEventListener` |
| `NetworkChatbot.tsx` | `keydown`, `resize` | Both have `return () => removeEventListener` |
| `ui/dialog.tsx` | `mousemove`, `mouseup` | `return () => removeEventListener` |
| `ui/sidebar.tsx` | `keydown` | `return () => removeEventListener` |
| `RoleEditDialog.tsx` | `mousemove`, `mouseup` | `return () => removeEventListener` |

**All event listeners are properly cleaned up.**

### WebSocket / Long Connections

No WebSocket connections found in the codebase. Polling is used exclusively.

---

## Recommendations

| Priority | Item | Recommendation |
|----------|------|----------------|
| MEDIUM | Refresh token not used | Implement proactive token refresh before expiry — store token TTL, call refresh 5 min before expiry. Currently users experience silent logout mid-session. |
| LOW | No per-component AbortController | Consider adding AbortController to major data-fetching `useEffect` hooks (DashboardEnhanced, AccessPoints, SLEDashboard) for cleaner unmount behavior |
| LOW | `logger.ts` used in services, raw `console.log` in components | Components use raw `console.log` (378 instances in 53 files) — should route through `logger` for production suppression (see Task 3) |
| INFO | `finally` blocks are well-used | Loading states are consistently reset — no stuck spinners found |

---

## Fixes Applied

No critical fixes were required in Task 2. All memory leaks (intervals, event listeners) already have proper cleanup. Loading states are consistently reset via `finally` blocks. The recommendations above are medium/low priority enhancements for a future sprint.
