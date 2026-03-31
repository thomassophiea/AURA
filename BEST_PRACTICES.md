# AURA – Best Practices & Guidelines

**Last Updated:** 2026-03-31  
**Version:** 1.0  
**Status:** Active

This document consolidates best practices, architectural decisions, and known issues for the AURA network monitoring platform. For security concerns, see [SECURITY.md](./SECURITY.md).

---

## Table of Contents

1. [Security](#security)
2. [Performance](#performance)
3. [Accessibility](#accessibility)
4. [SEO & HTML Meta](#seo--html-meta)
5. [Error Handling](#error-handling)
6. [Testing](#testing)
7. [Configuration & Environment](#configuration--environment)
8. [Code Quality](#code-quality)

---

## Security

### Current Status: ⚠️ Needs Work (CRITICAL PRIORITY)

Before any production deployment, the following critical issues must be addressed:

#### 1.1 CORS Configuration
**Status:** ⚠️ Permissive (CRITICAL)  
**File:** `server.js:22-27`

**Issue:** CORS is configured with `origin: true` + `credentials: true`, allowing all origins and enabling CSRF attacks.

**Fix (Implemented):**
```js
origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
credentials: true,
```

**Environment Variables:**
- `CORS_ORIGINS` – comma-separated list of allowed origins (required in production)
- Default: `http://localhost:3000` (development only)

**Production Example:**
```
CORS_ORIGINS=https://aura.example.com,https://dashboard.example.com
```

---

#### 1.2 Security Headers
**Status:** ⚠️ Missing (CRITICAL)  
**File:** `server.js` (no helmet middleware)

**Issue:** Missing Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, and HSTS headers.

**Fix (Implemented):**
```bash
npm install helmet
```

Middleware configuration in `server.js`:
```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
```

**Headers Applied:**
- `X-Content-Type-Options: nosniff` – prevent MIME sniffing
- `X-Frame-Options: DENY` – prevent clickjacking
- `Content-Security-Policy` – control resource loading
- `Strict-Transport-Security` – enforce HTTPS

---

#### 1.3 Rate Limiting
**Status:** ⚠️ Missing (HIGH)  
**File:** `server.js` (no rate limiting)

**Issue:** Diagnostic endpoints (ping, traceroute, DNS) are callable without limit, enabling DoS attacks.

**Fix (Implemented):**
```bash
npm install express-rate-limit
```

Configuration:
```js
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP',
});

app.use('/api/', apiLimiter);
```

**Environment Variables:**
- `RATE_LIMIT_WINDOW_MS` – time window in milliseconds (default: 900000)
- `RATE_LIMIT_MAX_REQUESTS` – max requests per window (default: 100)

---

#### 1.4 Authentication Tokens
**Status:** ⚠️ localStorage (HIGH RISK)  
**Files:** `src/services/api.ts`, `src/App.tsx:263`

**Issue:** Auth tokens stored in `localStorage` are vulnerable to XSS.

**Recommendation:**
Use `HttpOnly; Secure; SameSite=Strict` cookies managed server-side.

**Until Migration:**
- Ensure CSP headers prevent XSS injection
- Keep helmet middleware active
- Audit frontend for XSS vulnerabilities regularly

---

#### 1.5 Backend Controller URL
**Status:** ⚠️ Hardcoded Fallback (MEDIUM)  
**File:** `server.js:15`

**Fix (Required):**
```js
const CAMPUS_CONTROLLER_URL = process.env.CAMPUS_CONTROLLER_URL;
if (!CAMPUS_CONTROLLER_URL) {
  throw new Error('CAMPUS_CONTROLLER_URL environment variable is required');
}
```

**Environment Variable:**
- `CAMPUS_CONTROLLER_URL` – backend API endpoint (required, no fallback)

---

#### 1.6 TLS Certificate Verification
**Status:** ⚠️ Disabled (MEDIUM)  
**File:** `server.js:910`

**Recommendation:**
```js
// For internal/development only:
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// In production, use proper certificates or internal CA
const httpsAgent = new https.Agent({
  ca: process.env.TLS_CA_CERT,
  rejectUnauthorized: true,
});
```

---

#### 1.7 Error Response Disclosure
**Status:** ⚠️ Verbose (LOW)

**Fix:**
```js
catch (error) {
  console.error('Proxy error:', error); // Log full details server-side
  res.status(500).json({ error: 'Internal server error' }); // Generic message
}
```

---

#### 1.8 Data Persistence
**Status:** ⚠️ In-Memory Only (LOW)

**Recommendation:** Persist to Supabase or Campus Controller API

---

### Security Checklist (Pre-Production)

- [ ] CORS_ORIGINS environment variable is set correctly
- [ ] Helmet middleware is active with proper CSP
- [ ] Rate limiting is enabled on `/api/*` routes
- [ ] Auth tokens strategy is implemented
- [ ] CAMPUS_CONTROLLER_URL is required (no fallback)
- [ ] TLS verification is enabled or explicitly trusted
- [ ] Error responses do not leak sensitive data
- [ ] Data persistence is implemented
- [ ] All env vars are documented in `.env.example`
- [ ] Security headers verified in browser

---

## Performance

### Current Status: ✅ Good (No Changes Required)

#### Strengths

- Lazy loading & code splitting on all 40+ routes
- Vendor chunks isolated (React, Radix, Recharts, Supabase)
- Cache strategy implemented (immutable assets, no-store HTML)
- Memoization in heavy components

---

#### Improvements (Optional)

| Item | Priority | Impact |
|------|----------|--------|
| Chunk size warning limit (reduce to 500KB) | Low | Regression detection |
| Proxy log level (`'debug'` → `'warn'`) | Low | Reduce log noise |
| Image optimization | Medium | 10-20% smaller |
| React.memo for lists | Medium | Prevent re-renders |

---

## Accessibility

### Current Status: ⚠️ Partial (Medium Priority)

#### Improvements Needed

1. Add `role="navigation"` and `aria-label` to sidebar
2. Add `aria-live="polite"` to dynamic data regions
3. Add `aria-busy="true"` during loading
4. Verify focus management in modals
5. Test keyboard-only navigation

---

## SEO & HTML Meta

### Current Status: ❌ Needs Work (Medium Priority)

#### Required Fixes

**1. Page Title** (High Priority)
```html
<!-- Change from: <title>API</title> -->
<title>AURA – Network Monitoring Platform</title>
```

**2. Meta Description** (High Priority)
```html
<meta name="description" content="Enterprise network monitoring platform with real-time visibility into access points, clients, traffic, and configuration.">
```

**3. Open Graph Tags** (Medium)
```html
<meta property="og:title" content="AURA – Network Monitoring Platform">
<meta property="og:description" content="Enterprise network monitoring">
<meta property="og:type" content="website">
<meta property="og:image" content="https://aura.example.com/og-image.png">
```

**4. Favicon** (Low)
```html
<link rel="icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

**5. Canonical URL** (Medium)
```html
<link rel="canonical" href="https://aura.example.com">
```

---

## Error Handling

### Current Status: ✅ Good

#### Strengths

- Error boundary catches React errors
- Global error listener for non-critical errors
- API service distinguishes error types (401 vs 422)
- Proxy has structured error handling

---

## Testing

### Current Status: ❌ Critical Gap (High Priority)

**Coverage:** < 5% (only 1 test file exists)

### Testing Priority

1. **Auth flow** – login, token refresh, logout
2. **Critical components** – DashboardEnhanced, AccessPoints, ClientDetail
3. **Error boundary** – error catching and reset
4. **Server endpoints** – host validation, rate limiting
5. **E2E tests** – full user workflows

### Testing Setup

```bash
npm install --save-dev @testing-library/react @testing-library/user-event
npm run test
npm run test:coverage
```

### CI Integration

Add to `.github/workflows/` to run tests on PRs:
```yaml
- name: Run Tests
  run: npm run test:ci
```

---

## Configuration & Environment

### Current Status: ⚠️ Needs Work (High Priority)

---

### Environment Variables

#### Critical (Required)

| Variable | Purpose | Example |
|----------|---------|---------|
| `CAMPUS_CONTROLLER_URL` | Backend API endpoint | `https://campus.example.com/api` |
| `CORS_ORIGINS` | Allowed frontend origins | `https://aura.example.com` |
| `NODE_ENV` | Runtime environment | `production` |

#### Important (Production)

| Variable | Purpose | Default |
|----------|---------|---------|
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | 900000 (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 |
| `PORT` | Server port | 3000 |

---

### Deprecated / Unsafe Variables

❌ **NEVER use these:**

- `VITE_CAMPUS_CONTROLLER_USER` – Exposed in browser
- `VITE_CAMPUS_CONTROLLER_PASSWORD` – Exposed in browser

**Why:** The `VITE_` prefix bundles values into client JavaScript.

---

### .env.example Template

```env
# ===== REQUIRED =====
CAMPUS_CONTROLLER_URL=https://campus.example.com/api
CORS_ORIGINS=http://localhost:3000,https://aura.example.com

# ===== OPTIONAL (PRODUCTION) =====
PORT=3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
NODE_ENV=production

# ===== OPTIONAL (DEVELOPMENT ONLY) =====
# NODE_TLS_REJECT_UNAUTHORIZED=0
# TLS_CA_CERT=/etc/ssl/certs/ca.crt
# LOG_LEVEL=debug
```

---

### Configuration Validation

Add to `server.js` startup:

```js
function validateConfig() {
  const required = ['CAMPUS_CONTROLLER_URL', 'CORS_ORIGINS'];
  const missing = required.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  
  if (process.env.NODE_ENV === 'production') {
    if (process.env.CORS_ORIGINS.includes('*')) {
      console.warn('⚠️ CORS_ORIGINS contains wildcard in production');
    }
  }
}

validateConfig();
```

---

## Code Quality

### Standards

- **Language:** TypeScript (strict mode)
- **Framework:** React 18+ with Hooks
- **Styling:** Tailwind CSS
- **Linting:** ESLint with `jsx-a11y`
- **Formatting:** Prettier (2-space indentation)

---

### Code Review Checklist

- [ ] No `console.log` statements
- [ ] No exposed credentials
- [ ] No `any` types without justification
- [ ] Proper ARIA labels and semantic HTML
- [ ] Performance: memoization where needed
- [ ] Security: input validation & sanitization
- [ ] Tests for new features
- [ ] Documentation for complex logic

---

### Common Mistakes

❌ **Don't:**
- Use `localStorage` for sensitive data
- Hardcode environment variables
- Disable TypeScript strict mode
- Skip error handling
- Write components > 300 lines

✅ **Do:**
- Use environment variables for configuration
- Validate all user input
- Handle errors gracefully
- Keep components focused
- Enable TypeScript strict mode

---

## Related Documents

- [SECURITY.md](./SECURITY.md) – Security procedures
- [CONTRIBUTING.md](./CONTRIBUTING.md) – Contribution guidelines
- [README.md](./README.md) – Project overview

---

**Maintained By:** AURA Team  
**Last Updated:** 2026-03-31
