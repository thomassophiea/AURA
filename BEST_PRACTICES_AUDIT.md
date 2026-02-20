# AURA – Best Practices Audit Report

**Date:** 2026-02-20
**Branch:** `claude/review-site-best-practices-QBhpJ`
**Scope:** Security, Performance, Accessibility, SEO, Error Handling, Testing, Configuration

---

## Executive Summary

AURA demonstrates solid frontend engineering — excellent code splitting, modern React patterns, and clean component architecture. However, **security is the primary concern** before any production deployment, and **test coverage is critically low**.

| Category | Status | Priority |
|----------|--------|----------|
| Security | ⚠️ Needs Work | CRITICAL |
| Performance | ✅ Good | Low |
| Accessibility | ⚠️ Partial | Medium |
| SEO / HTML Meta | ❌ Needs Work | Medium |
| Error Handling | ✅ Good | Low |
| Testing | ❌ Critical Gap | High |
| Configuration | ⚠️ Needs Work | High |

---

## 1. Security

### 1.1 CORS – Permissive (CRITICAL)
**File:** `server.js:22-27`

```js
app.use(cors({
  origin: true, // comment says "restrict in production" but never does
  credentials: true,
```

`origin: true` allows **all origins**. Combining this with `credentials: true` enables CSRF attacks.
**Fix:** Restrict to an explicit allowlist via environment variable.

```js
origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
```

### 1.2 Missing Security Headers (CRITICAL)
**File:** `server.js` — no `helmet` import anywhere.

Missing headers:
- `Content-Security-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security`

**Fix:** `npm install helmet` then `app.use(helmet())` early in the middleware chain.

### 1.3 No Rate Limiting (HIGH)
Network diagnostic endpoints (`/api/.../ping`, `/traceroute`, `/dns`) are callable without limit.
**Fix:** `npm install express-rate-limit` and apply to all `/api/*` routes.

### 1.4 Auth Tokens in localStorage (HIGH)
**Files:** `src/services/api.ts`, `src/App.tsx:263`

```js
localStorage.getItem('access_token')
localStorage.getItem('refresh_token')
```

localStorage is accessible to any JS on the page and is vulnerable to XSS.
**Fix:** Use `HttpOnly; Secure; SameSite=Strict` cookies managed server-side.

### 1.5 Hardcoded Default Controller URL (MEDIUM)
**File:** `server.js:15`

```js
const CAMPUS_CONTROLLER_URL = process.env.CAMPUS_CONTROLLER_URL || 'https://tsophiea.ddns.net';
```

A personal domain is hardcoded as a fallback.
**Fix:** Remove the fallback; fail on startup if the env var is missing.

### 1.6 TLS Verification Disabled (MEDIUM)
**File:** `server.js:910`

```js
secure: false, // Accept self-signed certificates
```

Disables certificate verification against the backend controller.
**Fix:** Only disable for explicitly trusted internal hosts; never silently in production.

### 1.7 Verbose Error Responses (LOW)
**File:** `server.js:950-955`

Internal error messages and paths are returned to clients in 500 responses.
**Fix:** Log full details server-side; return a generic message to the client.

### 1.8 In-Memory Stores (LOW)
**File:** `server.js:74-78`

```js
const backupStore = [];
const guestStore  = [];
const alarmStore  = [];
const eventStore  = [];
```

All data is lost on restart. Not appropriate for production.
**Fix:** Persist to the Supabase database or the Campus Controller API.

---

## 2. Performance

### ✅ Strengths

- **Lazy loading / code splitting:** All 40+ routes use `React.lazy()` + `Suspense` (`App.tsx:12-54`).
- **Prefetch strategy:** Critical components pre-imported 2 s after initial load (`App.tsx:17-23`).
- **Vendor chunks:** React, Radix UI, Recharts, Supabase, and Lucide isolated (`vite.config.ts:92-108`).
- **Cache headers:** `immutable` for hashed assets, `no-store` for HTML (`server.js:974-987`).
- **Memoization:** `useMemo`/`useCallback` used in DashboardEnhanced, AppInsights, ConfigureDevices.

### ⚠️ Improvements

- **Chunk size warning suppressed** (`vite.config.ts:112`): Limit raised to 1000 KB, hiding bundle regressions. Reduce to 500 KB.
- **`logLevel: 'debug'`** on proxy (`server.js:912`): Generates excessive noise in production. Use `'warn'` or `'error'`.
- **No image optimization:** Figma-sourced PNGs are bundled without compression or next-gen format conversion.
- **`React.memo` underused:** Only found in `DashboardEnhanced`. Heavy list components (AP rows, client rows) would benefit.

---

## 3. Accessibility

### ✅ Strengths

- `eslint-plugin-jsx-a11y` enforced at recommended level (`.eslintrc.json:12`).
- Radix UI primitives provide accessible dialog, select, tabs, etc. out of the box.
- `#boot-surface` has `aria-hidden="true"` (`index.html:152`).
- Error boundary renders semantic markup with actionable buttons.

### ⚠️ Improvements

- No `role="navigation"` or `aria-label` on the sidebar.
- No `aria-live="polite"` on dynamically updated data regions (AP counts, client lists).
- No `aria-busy="true"` during loading states.
- Keyboard focus management not verified for modals and detail slide-outs.

---

## 4. SEO / HTML Meta

### ❌ Issues

| Issue | Location | Fix |
|-------|----------|-----|
| `<title>API</title>` — wrong product name | `index.html:9` | Change to `AURA – Network Monitoring Platform` |
| No `<meta name="description">` | `index.html` | Add a 155-character description |
| No Open Graph tags | `index.html` | Add `og:title`, `og:description`, `og:image` |
| No `<link rel="icon">` | `index.html` | Add favicon reference |
| No canonical URL | `index.html` | Add `<link rel="canonical">` |

### ✅ Good

- `lang="en"` on `<html>` tag.
- Proper viewport meta with `viewport-fit=cover`.
- `apple-mobile-web-app-capable` and `mobile-web-app-capable` for PWA behavior.
- Inline FOUC-prevention script for theme application before first paint.

---

## 5. Error Handling

### ✅ Strengths

- `ErrorBoundary` component wraps the application; shows dev-only stack traces (`ErrorBoundary.tsx:84`).
- Global `window.addEventListener('error', ...)` in `App.tsx:308` suppresses noisy non-critical errors.
- API service distinguishes `401` (bad credentials) vs `422` (format error).
- Proxy has `onError` handler returning structured JSON.

### ⚠️ Improvements

- No structured logging system (Sentry, Datadog, etc.) — only `console.error`.
- No correlation IDs for tracing a client error back to a server log entry.
- No retry logic for transient network failures.

---

## 6. Testing

### Current State

Only **1 test file** exists in the entire codebase:

```
src/services/logger.test.ts
```

Estimated coverage: **< 5%** across 124 components and 31 services.

### Recommended Priority Order

1. **Auth flow** – `src/services/api.ts` login, token refresh, logout
2. **Critical components** – `DashboardEnhanced`, `AccessPoints`, `ClientDetail`
3. **Error boundary** – verify it catches and resets correctly
4. **Server endpoints** – unit tests for `isValidHost`, backup store, proxy error handler
5. **E2E** – login → dashboard → AP detail using Playwright or Cypress

### CI Gap

The two GitHub workflow files (`metrics-collection.yml`, `railway-deploy.yml`) do not run `npm test` on pull requests. Tests should gate merges.

---

## 7. Configuration

### ⚠️ Issues

| Variable | Issue |
|----------|-------|
| `VITE_CAMPUS_CONTROLLER_USER` | `VITE_` prefix bundles value into client JS — never use for real credentials |
| `VITE_CAMPUS_CONTROLLER_PASSWORD` | Same issue — exposed in browser |
| `CAMPUS_CONTROLLER_URL` | Has a personal-domain fallback that should be removed |
| Missing `CORS_ORIGINS` | No env var for allowlist |
| Missing `RATE_LIMIT_*` | No rate-limit configuration |

---

## 8. Prioritized Action Plan

### CRITICAL – Do First
1. Restrict CORS to explicit origin allowlist (`server.js:23`)
2. Add `helmet()` for security headers
3. Add `express-rate-limit` on all `/api/*` routes
4. Migrate auth tokens from `localStorage` to `HttpOnly` cookies
5. Remove hardcoded `tsophiea.ddns.net` default URL

### HIGH – Do Soon
6. Expand test coverage to ≥ 50% on critical paths; add CI test step
7. Fix `<title>API</title>` → correct product name (`index.html:9`)
8. Add meta description and Open Graph tags
9. Add structured error logging (Sentry or equivalent)
10. Remove `VITE_CAMPUS_CONTROLLER_USER/PASSWORD` from `.env.example`

### MEDIUM – Nice to Have
11. Add `aria-live`, `aria-busy`, `role="navigation"` where missing
12. Compress and optimize bundled images
13. Implement `React.memo` on heavy list-item components
14. Lower `chunkSizeWarningLimit` back to 500 KB
15. Change proxy `logLevel` from `'debug'` to `'warn'` in production
