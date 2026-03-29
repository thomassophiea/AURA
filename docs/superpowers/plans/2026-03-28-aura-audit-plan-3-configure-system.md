# AURA Full Audit — Plan 3: API Audit — Configure & System Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For each Configure and System page, validate every API call against the Swagger spec, fix broken/mock endpoints, improve error handling, and document findings.

**Architecture:** Code changes + documentation. Produces fixes and test evidence in `/audit/`.

**Prerequisites:** Plan 1 artifacts + Plan 2 complete.

**Pages in scope (15 pages):**

Configure:
1. ConfigureSites
2. ConfigureNetworks
3. ConfigurePolicy
4. ConfigureAAAPolicies
5. ConfigureGuest
6. ConfigureAdvanced
7. ConfigureAdoptionRules

System:
8. SystemBackupManager
9. LicenseDashboard
10. APFirmwareManager
11. NetworkDiagnostics
12. EventAlarmDashboard
13. SecurityDashboard
14. PCIReport
15. GuestManagement

Tools & Admin:
16. Tools
17. Administration
18. ApiTestTool
19. ApiDocumentation
20. HelpPage

---

### Task 1: Audit Configure pages (Sites, Networks, Policy, AAA, Guest, Advanced, Adoption Rules)

**Files:**
- Read: `src/components/ConfigureSites.tsx`, `ConfigureNetworks.tsx`, `ConfigurePolicy.tsx`, `ConfigureAAAPolicies.tsx`, `ConfigureGuest.tsx`, `ConfigureAdvanced.tsx`, `ConfigureAdoptionRules.tsx`
- Modify: Components as needed for fixes
- Modify: `audit/aura-api-test-results.md`

- [ ] **Step 1: Trace all API calls in Configure pages**

For each of the 7 Configure pages, grep for `apiService\.` and `makeAuthenticatedRequest` calls. Document each endpoint found.

Per the feature matrix, most Configure pages use real Swagger endpoints. Known issues:
- **ConfigureGuest** — `/v1/guests` not in Swagger (analog: `/v1/eguest`)
- **ConfigureNetworks** — `getDeviceGroupsBySite()` no Swagger endpoint
- **ConfigurePolicy** — uses `/v3/cos` but Swagger has `/v1/cos`
- **ConfigureAdoptionRules** — calls `/v1/sites` instead of `/v3/sites`

- [ ] **Step 2: Fix ConfigureGuest guest endpoint**

The page calls `apiService.getGuests()` which hits `/v1/guests`. This is NOT in Swagger. The Swagger analog is `/v1/eguest`. However, guest accounts and eGuest profiles may be different resources.

Read both the current `getGuests()` implementation and the Swagger `/v1/eguest` spec. If they serve different purposes, document the gap. If they're the same resource, redirect to `/v1/eguest`.

- [ ] **Step 3: Fix ConfigureAdoptionRules site endpoint version**

Change `/v1/sites` to `/v3/sites` to match Swagger primary endpoint.

- [ ] **Step 4: Fix ConfigurePolicy CoS version**

Check if `/v3/cos` works or if `/v1/cos` (Swagger) is the correct version. Fix if needed.

- [ ] **Step 5: Review ConfigureAdvanced — validate all 11 endpoints**

ConfigureAdvanced calls 11 different API methods. Verify each:
- `getTopologies()` → `/v3/topologies` ✓
- `getCoSProfiles()` → `/v1/cos` ✓
- `getRateLimiters()` → `/v1/ratelimiters` ✓
- `getProfiles()` → `/v3/profiles` ✓
- `getIoTProfiles()` → `/v3/iotprofile` ✓
- `getMeshPoints()` → `/v3/meshpoints` ✓
- `getAccessControl()` → `/v1/accesscontrol` ✓
- `getXLocationProfiles()` → `/v3/xlocation` ✓
- `getRTLSProfiles()` → `/v1/rtlsprofile` ✓
- `getPositioningProfiles()` → `/v3/positioning` ✓
- `getAnalyticsProfiles()` → `/v3/analytics` ✓

Check error handling on each. Fix any silent catch blocks.

- [ ] **Step 6: Document findings and commit**

Add sections for all 7 Configure pages to `audit/aura-api-test-results.md`.

```bash
git add -A
git commit -m "audit(configure): validate all Configure page API calls, fix guest/adoption/cos endpoints"
```

---

### Task 2: Audit System pages with non-Swagger endpoints

**Files:**
- Read: `src/components/SystemBackupManager.tsx`, `LicenseDashboard.tsx`, `NetworkDiagnostics.tsx`, `EventAlarmDashboard.tsx`, `SecurityDashboard.tsx`
- Modify: Components as needed
- Modify: `audit/aura-api-test-results.md`

These 5 pages are the most problematic — all use non-Swagger endpoints.

- [ ] **Step 1: Audit SystemBackupManager**

All 3 endpoints are `/platformmanager/v1/*` (non-Swagger). These are controller-specific Platform Manager APIs.

DO NOT remove these endpoints — they may work on certain controllers. Instead:
- Add proper error states (not silent empty returns)
- Add a subtle info banner: "Backup features require Platform Manager API access"
- Document in findings

- [ ] **Step 2: Audit LicenseDashboard**

Both endpoints are `/platformmanager/v1/license/*` (non-Swagger). Same approach:
- Add proper error states
- Add info banner about Platform Manager dependency
- Document

- [ ] **Step 3: Audit NetworkDiagnostics**

All 3 tools POST to `/platformmanager/v1/network/*`. Same approach:
- Improve error handling (show meaningful error when Platform Manager unavailable)
- Document

- [ ] **Step 4: Fix EventAlarmDashboard**

All 3 endpoints are non-Swagger:
- `/v1/events` → Replace with `/v1/auditlogs` (Swagger analog)
- `/v1/alarms` → No direct Swagger analog, keep but improve error handling
- `/v1/alarms/active` → No direct Swagger analog, keep but improve error handling

For `/v1/events` → `/v1/auditlogs`:
1. Read the Swagger spec for `/v1/auditlogs` to understand response shape
2. Map auditlog fields to what the Events table expects
3. Update the API call
4. Ensure the UI still renders correctly

- [ ] **Step 5: Fix SecurityDashboard**

Two non-Swagger endpoints:
- `/v1/security/rogue-ap/list` → Replace with `/v3/adsp` (Air Defense)
- `/v1/security/threats` → No Swagger analog, keep with improved error handling

For `/v1/security/rogue-ap/list` → `/v3/adsp`:
1. Read Swagger spec for `/v3/adsp` GET
2. Map Air Defense profile fields to what the Rogue AP table expects
3. Update the API call
4. If `/v3/adsp` returns profile configs rather than detected rogue APs, document this as a fundamental mismatch and keep the current endpoint with better error handling

- [ ] **Step 6: Document all findings and commit**

```bash
git add -A
git commit -m "audit(system): fix Events→auditlogs, improve error handling on Platform Manager pages"
```

---

### Task 3: Audit remaining System pages (Firmware, PCI, Guest Management)

**Files:**
- Read: `src/components/APFirmwareManager.tsx`, `PCIReport.tsx`, `GuestManagement.tsx`
- Modify: Components as needed
- Modify: `audit/aura-api-test-results.md`

- [ ] **Step 1: Validate APFirmwareManager**

Both endpoints are Real Swagger:
- `getAccessPoints()` → `/v1/aps/query` ✓
- `getAPSoftwareVersions()` → `/v1/aps/upgradeimagelist` ✓

Check error handling and loading states.

Enhancement opportunity: `/v2/report/upgrade/devices` for firmware upgrade history.

- [ ] **Step 2: Validate PCIReport**

All 3 endpoints are Real Swagger:
- `getSites()` → `/v3/sites` ✓
- `/v1/services` ✓
- `getAccessPoints()` → `/v1/aps/query` ✓

Check compliance check logic is sound.

- [ ] **Step 3: Fix GuestManagement**

Uses `/v1/guests` (non-Swagger). Same issue as ConfigureGuest.
- If guest accounts are a separate resource from eGuest profiles, document the gap
- If same resource, redirect to `/v1/eguest`
- Add proper error state for when endpoint is unavailable

- [ ] **Step 4: Document and commit**

```bash
git add -A
git commit -m "audit(system-2): validate firmware/PCI, fix guest management endpoint"
```

---

### Task 4: Audit Tools & Admin pages

**Files:**
- Read: `src/components/Tools.tsx`, `Administration.tsx`, `ApiTestTool.tsx`, `ApiDocumentation.tsx`, `HelpPage.tsx`
- Modify: Components as needed
- Modify: `audit/aura-api-test-results.md`

- [ ] **Step 1: Fix Tools event log viewer**

Tools page uses `/v1/events` (non-Swagger). Same fix as EventAlarmDashboard:
- Replace with `/v1/auditlogs`
- Map fields appropriately

- [ ] **Step 2: Fix Administration applications list**

Uses `/platformmanager/v1/apps` (non-Swagger). Swagger analog: `/v1/appkeys`.
- Read Swagger spec for `/v1/appkeys` GET
- Compare response shape
- If compatible, redirect to `/v1/appkeys`
- If not, keep with improved error handling

- [ ] **Step 3: Validate ApiTestTool**

This is a developer tool that makes arbitrary API calls. Validate:
- Request builder works
- Response display is correct
- Auth headers are properly attached
- URL construction is correct

No endpoint fixes needed (it's user-defined).

- [ ] **Step 4: Note static pages**

ApiDocumentation and HelpPage are ❌ None (static content). No audit needed. Just confirm they render without errors.

- [ ] **Step 5: Document and commit**

```bash
git add -A
git commit -m "audit(tools-admin): fix event log and app keys endpoints, validate remaining"
```

---

### Task 5: Compile Plan 3 findings and update README

**Files:**
- Modify: `audit/aura-api-test-results.md`
- Modify: `audit/README.md`

- [ ] **Step 1: Ensure all 20 pages have entries in audit results**

Check that `audit/aura-api-test-results.md` has findings for every page audited in Plan 3.

- [ ] **Step 2: Update README**

Update `audit/README.md`:
- Mark Plan 3 as ✅ COMPLETE
- Add Plan 3 key findings summary

- [ ] **Step 3: Commit and push**

```bash
git add -A
git commit -m "audit(plan-3): compile Configure & System page findings, update README"
git push
```
