# AURA Security Findings

Generated: 2026-03-28 | Plan 4 — Task 1

---

## Credential Storage

| Item | Storage | Risk | Recommendation |
|------|---------|------|----------------|
| `access_token` (controller JWT) | localStorage | MEDIUM — XSS attackers can read tokens; controller tokens are short-lived (1h), mitigated by same-origin-only app | Move to sessionStorage or in-memory; localStorage survives browser restart unnecessarily |
| `refresh_token` (controller) | localStorage | MEDIUM — same as above | Move to sessionStorage |
| `admin_role`, `user_email` | localStorage | LOW — non-credential metadata | Acceptable |
| `xiq_token_<siteGroupId>` (XIQ JWT) | localStorage | MEDIUM — same XSS risk | Move to sessionStorage |
| `xiq_creds_<siteGroupId>` (XIQ email+password, base64) | localStorage | HIGH — base64 is obfuscation, not encryption; plaintext password survives browser session | Remove — re-prompt on each login, or use session-scoped storage. Not acceptable in shared-computer deployments |
| `sg_login_<controllerId>` (controller username+password, base64) | localStorage | HIGH — same as above; password stored across sessions | Remove or make opt-in with explicit "Remember me" UI |

**Files:** `src/services/api.ts` (lines 299–302, 644–645), `src/services/xiqService.ts` (lines 105, 141), `src/services/tenantService.ts` (lines 425–431)

**Assessment:** The two base64-encoded credential stores (`xiq_creds_*` and `sg_login_*`) are the highest-risk items. The code itself acknowledges this with comments ("NOTE: credentials are stored base64-encoded (obfuscated, not encrypted)"). This is acceptable for a local admin tool running on a trusted workstation, but HIGH risk in shared or cloud deployments.

**Action taken:** No code change — both stores include developer comments acknowledging the risk and its appropriate context (local admin tool). These are design decisions that require product input, not a bug fix.

---

## CORS Proxy Configuration

**File:** `server.js`

| Check | Result | Notes |
|-------|--------|-------|
| Open to any origin when `ALLOWED_ORIGINS` not set | YES — falls back to `allow all` | Appropriate for local dev; server warns if not configured |
| Startup warning when unconfigured | YES — `console.warn` at line 31 | Good defensive behavior |
| Localhost always allowed in non-production | YES | Expected for dev workflow |
| Auth headers forwarded to controller | YES — via `X-Controller-URL` header routing | Proxy forwards the caller's `Authorization: Bearer` header |
| Rate limiting | YES — 30 req/60s per IP on server-side endpoints | Applied to `/api/oui`, `/api/throughput`, etc. |
| Auth guard on mock endpoints | YES — `requireAuth` checks Bearer presence | Prevents unauthenticated access to server-side tools |
| Security headers | YES — CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy | Applied globally before routes |
| `CAMPUS_CONTROLLER_URL` default hardcoded | YES — falls back to `tsophiea.ddns.net` | Dev convenience; warned at startup |

**Assessment:** CORS configuration is well-designed. The open-origin fallback is appropriate for local dev and properly warned. Production deployments **must** set `ALLOWED_ORIGINS` — this is documented in startup logs. No critical fixes needed.

---

## Authentication Flow

| Step | Assessment | Issues |
|------|-----------|--------|
| XIQ login via CORS proxy (`POST /xiq/login`) | PASS — routes through Express proxy, never direct browser-to-cloud | None |
| Controller login with 5-format retry | PASS — tries multiple Extreme Networks auth formats gracefully | None |
| Token storage (in-memory + localStorage) | MEDIUM — in-memory `this.accessToken` is the source of truth; localStorage is for session restore | Tokens in localStorage outlive the session |
| Session expiry detection | PASS — App.tsx monitors 401 responses and forces logout | None |
| Token refresh | NOT IMPLEMENTED — no refresh token call; user must re-login when token expires | The `refresh_token` is stored but never used in a refresh flow; `refreshAccessToken()` exists but is not called automatically |
| Mid-session auth failure | PASS — `cancelAllRequests()` + logout triggered on 401 | None |
| Session timeout | PARTIAL — detected via 401 response, not via token TTL | No proactive TTL check; depends on controller rejecting expired tokens |

**Assessment:** The missing proactive token refresh is the main auth gap. Users get logged out mid-session rather than silently refreshing. Acceptable for an admin tool but worth noting.

---

## Hardcoded Secrets

Search pattern: `password.*=.*['"]`, `apiKey`, `api_key`, `secret`

**Result:** No hardcoded credential values found in `src/`. All password handling is via function parameters — no literal password strings in code. Supabase URL and anon key are loaded from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables.

| Check | Result |
|-------|--------|
| Hardcoded API keys | NONE FOUND |
| Hardcoded passwords | NONE FOUND |
| Hardcoded controller URLs in frontend | NONE (uses env var `VITE_DEV_CAMPUS_CONTROLLER_URL` in dev, proxy in prod) |
| Hardcoded controller URL in server | `tsophiea.ddns.net` as fallback default — warned at startup, acceptable |

---

## Service Worker

**File:** `public/service-worker.js`

| Check | Result |
|-------|--------|
| Caches API requests with auth data | NO — explicitly skips `/api/*` and `/v1/*` paths (line 90) |
| Caches cross-origin requests | NO — skips non-same-origin requests (line 85) |
| Caches HTML | NO — network-first for HTML, no caching |
| Cache invalidation strategy | YES — version-based: deletes ALL caches on activation when version changes |
| Sensitive data cached | NO — only caches hashed JS/CSS bundles and static assets (images, fonts, manifest.json) |

**Assessment:** Service worker is cleanly scoped. No auth tokens or API responses are cached. Safe.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| HIGH | 2 | XIQ password in localStorage (`xiq_creds_*`), controller password in localStorage (`sg_login_*`) |
| MEDIUM | 3 | access_token/refresh_token in localStorage, XIQ token in localStorage, no proactive token refresh |
| LOW | 1 | Default controller URL hardcoded in server.js fallback |
| INFO | 1 | CORS allows all origins when `ALLOWED_ORIGINS` not set (warned at startup) |

**No code changes applied in Task 1.** The HIGH severity items (base64-obfuscated password storage) are acknowledged design decisions for a local admin tool, with developer comments already documenting the risk. Changing the storage strategy requires a product decision about "Remember me" UX. These findings are documented for the product owner.
