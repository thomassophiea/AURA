# AURA Full Audit — Plan 4: Cross-Cutting Quality

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit and fix cross-cutting concerns: security, state management, error handling patterns, console hygiene, dead code removal, theme consistency, and bundle performance.

**Architecture:** Code changes across the entire codebase. Focus on systemic patterns, not page-specific issues (those were handled in Plans 2-3).

**Prerequisites:** Plans 1-3 complete.

---

### Task 1: Security Audit

**Files:**
- Read: `src/services/api.ts`, `src/services/tenantService.ts`, `src/services/xiqService.ts`
- Read: `src/components/App.tsx`, `src/components/LoginForm.tsx`
- Modify: Files as needed
- Create: `audit/aura-security-findings.md`

- [ ] **Step 1: Audit credential storage**

Search the entire codebase for:
```
localStorage.setItem.*password
localStorage.setItem.*token
localStorage.setItem.*secret
localStorage.setItem.*key
sessionStorage.setItem.*password
```

Check what's stored in localStorage/sessionStorage. Credentials should NOT be in localStorage (XSS risk). Tokens in sessionStorage are acceptable.

Document all findings.

- [ ] **Step 2: Audit CORS proxy configuration**

Read the proxy setup (likely in `vite.config.ts` or `server.js`/`server.cjs`). Check:
- Is the proxy open to any origin?
- Does it forward auth headers properly?
- Could it be used as an open relay?

- [ ] **Step 3: Audit authentication flow**

Trace the full auth flow:
1. XIQ/ExtremeCloud login
2. Controller selection
3. Controller credential entry

Check:
- Are credentials transmitted securely?
- Are tokens refreshed before expiry?
- Is session timeout handled?
- What happens when auth fails mid-session?

- [ ] **Step 4: Check for hardcoded secrets**

```
grep -rn "password.*=.*['\"]" src/ --include="*.ts" --include="*.tsx" | grep -v "type\|interface\|placeholder\|label"
grep -rn "apiKey\|api_key\|secret" src/ --include="*.ts" --include="*.tsx" | grep -v "type\|interface"
```

- [ ] **Step 5: Audit service worker**

Read the service worker file. Check:
- Does it cache auth tokens?
- Does it cache API responses with sensitive data?
- Is there a proper cache invalidation strategy?

- [ ] **Step 6: Write security findings**

Create `audit/aura-security-findings.md`:
```markdown
# AURA Security Findings

## Credential Storage
| Item | Storage | Risk | Recommendation |
|------|---------|------|----------------|

## CORS Proxy
...

## Authentication Flow
...

## Hardcoded Secrets
...

## Service Worker
...
```

- [ ] **Step 7: Apply critical fixes**

Fix any HIGH severity issues found:
- Remove plaintext passwords from localStorage
- Fix open proxy configurations
- Remove hardcoded credentials

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "audit(security): security findings and critical fixes"
```

---

### Task 2: State Management & Error Handling Audit

**Files:**
- Read: `src/services/api.ts` (error handling patterns)
- Read: Multiple components
- Create: `audit/aura-state-management-findings.md`

- [ ] **Step 1: Audit error handling patterns in api.ts**

Read `src/services/api.ts` and search for:
- `catch` blocks that swallow errors silently
- `catch` blocks that return empty arrays/null without user notification
- Missing `finally` blocks (loading state not reset on error)
- Inconsistent error handling (some methods throw, some return null)

Count and categorize:
```
grep -c "catch.*{" src/services/api.ts
grep -c "return \[\]" src/services/api.ts
grep -c "return null" src/services/api.ts
```

- [ ] **Step 2: Audit race conditions**

Search for common race condition patterns:
- Multiple concurrent `setState` calls in async functions
- Missing abort controllers for cancelled requests
- Stale closures in useEffect (missing deps)

```
grep -rn "useEffect.*\[\]" src/components/ --include="*.tsx" | head -30
```

Check if any useEffect with async calls properly handles component unmount.

- [ ] **Step 3: Audit memory leaks**

Search for:
- Event listeners not cleaned up in useEffect
- Intervals/timeouts not cleared
- WebSocket connections not closed

```
grep -rn "addEventListener\|setInterval\|setTimeout" src/components/ --include="*.tsx" | grep -v "// "
```

Check that each has a corresponding cleanup in the useEffect return function.

- [ ] **Step 4: Write state management findings**

Create `audit/aura-state-management-findings.md`:
```markdown
# AURA State Management Findings

## Error Handling Patterns
| Pattern | Count | Example | Severity |
|---------|-------|---------|----------|

## Race Conditions
...

## Memory Leaks
...

## Recommendations
...
```

- [ ] **Step 5: Apply fixes for critical state issues**

Fix any:
- Missing abort controllers on major data fetches
- Missing useEffect cleanup for intervals/listeners
- Loading states not reset on error

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "audit(state): state management findings and fixes"
```

---

### Task 3: Console Hygiene & Dead Code Removal

**Files:**
- Multiple components
- Create: `audit/aura-removal-recommendations.md`

- [ ] **Step 1: Count console.log statements**

```
grep -rn "console\.\(log\|warn\|error\|debug\|info\)" src/ --include="*.ts" --include="*.tsx" | wc -l
```

Categorize:
- `console.error` in catch blocks → KEEP (legitimate error logging)
- `console.log` for debugging → REMOVE
- `console.warn` for deprecations → KEEP

Remove all debug `console.log` statements from production code. Keep error logging.

- [ ] **Step 2: Remove dead code candidates**

From the component inventory (Plan 1), 13 dead code candidates were identified. Verify each is truly unused and remove:

Check each by searching for imports:
```
grep -rn "import.*NetworkInsights" src/
grep -rn "import.*NetworkInsightsEnhanced" src/
grep -rn "import.*LicenseDashboardEnhanced" src/
```

For each truly unused file:
- Verify it's not imported anywhere
- Verify it's not referenced in App.tsx routing
- Delete it

- [ ] **Step 3: Remove commented-out code**

Search for large blocks of commented code:
```
grep -rn "// .*TODO\|// .*FIXME\|// .*HACK\|// .*XXX" src/ --include="*.tsx" --include="*.ts"
```

Clean up TODO/FIXME comments that are no longer relevant.

- [ ] **Step 4: Write removal recommendations**

Create `audit/aura-removal-recommendations.md`:
```markdown
# AURA Removal Recommendations

## Dead Code Removed
| File | Reason | Verified Unused |
|------|--------|-----------------|

## Console Statements
- Removed: X debug logs
- Kept: Y error logs

## Commented Code Cleaned
...
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(cleanup): remove dead code, debug console.logs, and commented code"
```

---

### Task 4: Theme Consistency Audit

**Files:**
- Read: `src/index.css`, `tailwind.config.*`
- Read: Multiple components
- Create: `audit/aura-theme-audit.md`

- [ ] **Step 1: Check for hardcoded colors**

Search for hardcoded hex colors and RGB values that should use theme tokens:
```
grep -rn "bg-\[#\|text-\[#\|border-\[#\|#[0-9a-fA-F]\{3,6\}" src/components/ --include="*.tsx" | head -50
```

Each should use Tailwind theme tokens (e.g., `bg-primary`, `text-muted-foreground`, `border-border`).

- [ ] **Step 2: Check dark mode support**

Search for components that don't use dark mode variants:
```
grep -rn "bg-white\b" src/components/ --include="*.tsx" | head -20
grep -rn "text-black\b" src/components/ --include="*.tsx" | head -20
```

These should be `bg-background` and `text-foreground` for dark mode support.

- [ ] **Step 3: Check gradient card consistency**

All pages with metric cards should use the same gradient pattern. Compare the gradient classes used across pages:
```
grep -rn "gradient\|from-\|to-\|via-" src/components/ --include="*.tsx" | head -30
```

- [ ] **Step 4: Write theme audit findings**

Create `audit/aura-theme-audit.md`:
```markdown
# AURA Theme Audit

## Hardcoded Colors
| File | Line | Current | Should Be |
|------|------|---------|-----------|

## Dark Mode Gaps
...

## Gradient Consistency
...
```

- [ ] **Step 5: Fix critical theme issues**

Fix any:
- Hardcoded white/black that breaks dark mode
- Inconsistent gradient patterns across metric cards

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "audit(theme): theme consistency findings and fixes"
```

---

### Task 5: Bundle Performance Review

**Files:**
- Read: `vite.config.ts`, `package.json`, `tsconfig.json`
- Read: `src/App.tsx` (lazy loading)
- Create: Brief notes in audit findings

- [ ] **Step 1: Check lazy loading coverage**

From the route inventory, verify all non-critical routes are lazy-loaded:
```
grep -rn "lazy(" src/components/App.tsx
```

Routes that should be lazy but aren't:
- Per the route inventory: Workspace, DashboardEnhanced, and several System pages are NOT lazy

- [ ] **Step 2: Check for heavy imports in the main bundle**

Look for large library imports that could be code-split:
```
grep -rn "import.*from.*recharts\|import.*from.*@radix\|import.*from.*date-fns" src/components/App.tsx
```

These should only load with the pages that use them (via lazy loading).

- [ ] **Step 3: Check image optimization**

```
ls -la public/branding/ public/*.png public/*.jpg public/*.svg 2>/dev/null
```

Large images should be optimized or lazy-loaded.

- [ ] **Step 4: Add lazy loading for non-lazy routes**

Wrap any non-lazy route components with `React.lazy()` and `Suspense`:

```typescript
const SystemBackupManager = lazy(() => import('./SystemBackupManager'));
const LicenseDashboard = lazy(() => import('./LicenseDashboard'));
// etc.
```

- [ ] **Step 5: Document findings and commit**

```bash
git add -A
git commit -m "perf(bundle): add lazy loading for remaining routes, document bundle findings"
```

---

### Task 6: Compile Plan 4 findings and update README

**Files:**
- Modify: `audit/README.md`

- [ ] **Step 1: Update README**

Update `audit/README.md`:
- Mark Plan 4 as ✅ COMPLETE
- Add Plan 4 key findings summary

- [ ] **Step 2: Commit and push**

```bash
git add -A
git commit -m "audit(plan-4): compile cross-cutting quality findings, update README"
git push
```
