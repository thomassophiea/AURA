# Security Policy for AURA

**Last Updated:** 2026-03-31  
**Version:** 1.0

---

## Table of Contents

1. [Security Overview](#security-overview)
2. [Known Security Issues](#known-security-issues)
3. [Security Requirements](#security-requirements)
4. [Vulnerability Reporting](#vulnerability-reporting)
5. [Security Best Practices](#security-best-practices)
6. [Production Checklist](#production-checklist)

---

## Security Overview

AURA is a network monitoring platform designed to provide enterprise-grade visibility into wireless infrastructure. Before deploying to production, the security considerations outlined in this document **must** be implemented.

### Current Status

- **Production Ready:** ❌ No – critical security issues must be addressed
- **Development Ready:** ✅ Yes – with caveats (see [Known Issues](#known-security-issues))
- **Last Security Review:** 2026-02-20

---

## Known Security Issues

### CRITICAL PRIORITY

These issues **must** be resolved before any production deployment:

#### 1. CORS Configuration Too Permissive
**Severity:** CRITICAL  
**Status:** ⚠️ Unpatched  
**File:** `server.js:22-27`

**Issue:**
```js
app.use(cors({
  origin: true,  // Allows ALL origins
  credentials: true,
}));
```

Allows cross-origin requests from any website to make authenticated calls on behalf of users.

**Mitigation:**
```js
app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  credentials: true,
}));
```

**Action:** Set `CORS_ORIGINS` environment variable to specific domains only.

---

#### 2. Missing Security Headers
**Severity:** CRITICAL  
**Status:** ⚠️ Unpatched  
**File:** `server.js`

**Issue:** No helmet middleware; missing:
- Content-Security-Policy
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security

**Mitigation:**
```bash
npm install helmet
```

```js
import helmet from 'helmet';
app.use(helmet());
```

**Action:** Install and configure helmet middleware.

---

#### 3. No Rate Limiting
**Severity:** HIGH  
**Status:** ⚠️ Unpatched  
**File:** `server.js`

**Issue:** API endpoints (diagnostics, configuration) are callable without rate limits, enabling DoS attacks.

**Mitigation:**
```bash
npm install express-rate-limit
```

```js
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api/', limiter);
```

**Action:** Implement rate limiting on all API routes.

---

#### 4. Authentication Tokens in localStorage
**Severity:** HIGH  
**Status:** ⚠️ Unpatched  
**Files:** `src/services/api.ts`, `src/App.tsx`

**Issue:**
```js
localStorage.getItem('access_token')
localStorage.getItem('refresh_token')
```

localStorage is vulnerable to XSS attacks; any JavaScript can access tokens.

**Mitigation:**
Use `HttpOnly; Secure; SameSite=Strict` cookies managed server-side instead.

**Action:** Plan and implement cookie-based authentication strategy.

---

#### 5. Hardcoded Backend URL Fallback
**Severity:** MEDIUM  
**Status:** ⚠️ Unpatched  
**File:** `server.js:15`

**Issue:**
```js
const CAMPUS_CONTROLLER_URL = process.env.CAMPUS_CONTROLLER_URL || 'https://tsophiea.ddns.net';
```

Personal domain is hardcoded as fallback; code will fail to fail-fast in production.

**Mitigation:**
```js
const CAMPUS_CONTROLLER_URL = process.env.CAMPUS_CONTROLLER_URL;
if (!CAMPUS_CONTROLLER_URL) {
  throw new Error('CAMPUS_CONTROLLER_URL environment variable is required');
}
```

**Action:** Remove fallback; require environment variable.

---

#### 6. TLS Verification Disabled
**Severity:** MEDIUM  
**Status:** ⚠️ Unpatched  
**File:** `server.js:910`

**Issue:**
```js
secure: false,  // Disables certificate verification
```

Silently accepts self-signed certificates from backend; enables MITM attacks in production.

**Mitigation:**
```js
// For development with self-signed certs:
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// In production, use proper certificates
```

**Action:** Enable certificate verification in production; use proper CA certificates.

---

#### 7. Exposed Credentials in .env
**Severity:** HIGH  
**Status:** ⚠️ Unpatched  
**File:** `.env.example`

**Issue:**
```env
VITE_CAMPUS_CONTROLLER_USER=...
VITE_CAMPUS_CONTROLLER_PASSWORD=...
```

The `VITE_` prefix exposes values to the browser (bundled into client JS).

**Mitigation:**
Remove these variables. Never use `VITE_` for credentials.

**Action:** Delete from `.env.example`; implement server-side credential management.

---

#### 8. Verbose Error Responses
**Severity:** LOW  
**Status:** ⚠️ Unpatched  
**File:** `server.js:950-955`

**Issue:** Internal error messages and file paths leaked to clients.

**Mitigation:**
```js
catch (error) {
  console.error('Proxy error:', error);  // Log full details server-side
  res.status(500).json({ error: 'Internal server error' });  // Generic client message
}
```

**Action:** Sanitize error responses.

---

## Security Requirements

### Environment Setup

**Required Environment Variables:**

```bash
# Backend API endpoint (required – no fallback)
CAMPUS_CONTROLLER_URL=https://campus.example.com/api

# Allowed frontend origins (required – comma-separated)
CORS_ORIGINS=https://aura.example.com,https://aura-backup.example.com

# Optional but recommended for production
NODE_ENV=production
PORT=3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Optional Environment Variables (Development Only):**

```bash
# Disable TLS verification for self-signed certs (DEV ONLY)
NODE_TLS_REJECT_UNAUTHORIZED=0

# Custom CA certificate path (production)
TLS_CA_CERT=/etc/ssl/certs/ca.crt
```

---

### Network Security

**Firewall Rules:**

- Port 3000 (Node server): Restrict to known client IPs or VPN
- Port 3000 to backend: Authenticate with Campus Controller API key
- HTTPS only in production (HTTP redirects to HTTPS)

**Backend Integration:**

- Use HTTPS for all Campus Controller API calls
- Verify SSL/TLS certificates in production
- Implement mutual TLS (mTLS) if available
- Use API keys for service-to-service authentication

---

### Data Security

**In Transit:**
- All requests encrypted with TLS 1.2+
- HSTS header forces HTTPS for 1 year
- Perfect Forward Secrecy (PFS) enabled

**At Rest:**
- Sensitive configuration in environment variables (not code)
- No sensitive data in error messages or logs
- Tokens managed server-side, not client-side
- Audit logs retained for compliance

**Access Control:**
- Implement RBAC (Role-Based Access Control)
- Users can only access their assigned sites/site groups
- Admin functions require elevated privileges
- Session timeouts for idle users

---

## Vulnerability Reporting

If you discover a security vulnerability, please **do not** open a public GitHub issue.

### Report Privately

Email: [security-contact@extreme.com](mailto:security-contact@extreme.com)

**Include in your report:**
- Description of vulnerability
- Steps to reproduce
- Affected component/file
- Potential impact
- Suggested fix (if applicable)

### Security Response

- We acknowledge reports within 24 hours
- We will investigate and provide updates every 5 days
- We ask for 90 days before public disclosure
- We credit discoverers unless they request anonymity

---

## Security Best Practices

### For Developers

1. **Never commit secrets** – use `.env` files and `.gitignore`
2. **Validate all inputs** – sanitize user input server-side
3. **Escape outputs** – prevent XSS by encoding HTML entities
4. **Use HTTPS** – never transmit sensitive data over HTTP
5. **Keep dependencies updated** – run `npm audit` regularly
6. **Review error messages** – never leak internal details
7. **Log security events** – failed auth, permission denied, etc.
8. **Test with OWASP** – use security testing tools

### For Operations

1. **Use environment variables** – for all secrets and configuration
2. **Rotate credentials** – regularly change API keys and passwords
3. **Monitor access logs** – look for suspicious patterns
4. **Set up alerts** – for failed authentication, rate limit exceeded, etc.
5. **Backup data** – regular automated backups with encryption
6. **Keep systems updated** – OS, Node, dependencies
7. **Use strong passwords** – minimum 16 characters for all accounts
8. **Enable MFA** – for admin accounts

### For Infrastructure

1. **Network segmentation** – isolate AURA from public internet
2. **Firewall rules** – restrict inbound/outbound traffic
3. **VPN access** – require VPN for remote access
4. **Audit logs** – centralized logging for compliance
5. **Intrusion detection** – monitor for suspicious activity
6. **Disaster recovery** – plan for security incidents
7. **Compliance** – follow industry standards (HIPAA, SOC 2, etc.)

---

## Production Checklist

### Before Deployment

- [ ] CORS_ORIGINS set to specific production domains (no wildcards)
- [ ] helmet middleware installed and configured
- [ ] Rate limiting enabled on all API routes
- [ ] Authentication tokens use HttpOnly cookies or equivalent
- [ ] CAMPUS_CONTROLLER_URL is required (no fallback)
- [ ] TLS certificate verification enabled
- [ ] Error messages do not leak internal details
- [ ] Data persistence strategy implemented
- [ ] All environment variables documented in secure vault
- [ ] VITE_* credentials removed from .env.example
- [ ] Security headers verified in browser DevTools
- [ ] npm audit shows no critical vulnerabilities

### Ongoing

- [ ] Monitor error logs for security patterns
- [ ] Review access logs weekly
- [ ] Update dependencies monthly
- [ ] Run security audit quarterly
- [ ] Rotate API keys annually
- [ ] Test disaster recovery procedures
- [ ] Review access permissions for stale users

---

## Compliance

AURA aims to support the following standards and frameworks:

- **OWASP Top 10** – addresses common web vulnerabilities
- **NIST Cybersecurity Framework** – aligns with best practices
- **GDPR** – user data privacy and deletion
- **HIPAA** – encryption and audit logs (optional)
- **SOC 2** – security, availability, integrity

Please refer to your organization's compliance requirements before deploying.

---

## Questions?

For security-related questions:
1. Check [BEST_PRACTICES.md](./BEST_PRACTICES.md) for general guidance
2. Review [CONTRIBUTING.md](./CONTRIBUTING.md) for code standards
3. Email security contact for vulnerabilities
4. Open an issue for non-security questions

---

**Maintained By:** AURA Security Team  
**Last Updated:** 2026-03-31
