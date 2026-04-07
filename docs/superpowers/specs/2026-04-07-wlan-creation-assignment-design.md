# WLAN Creation — Scope & Assignment Design

**Date:** 2026-04-07
**Status:** Approved
**Scope:** WLAN creation flows, assignment section, Quick WLAN dialog, ConfigureNetworks banner

---

## Context

WLAN creation in AURA currently forces at least one site to be selected before a WLAN can be saved. This prevents staging WLANs globally for later deployment and makes the "unassigned" state unreachable. Additionally, there is no fast-path creation flow — the only option is the full `CreateWLANDialog` (1,831 lines) with its site-centric deployment configuration.

This design adds:
1. A **Quick WLAN** easy-button path (compact modal, simplified config, full assignment choice)
2. A shared **AssignmentSection** component used by both creation flows
3. A restructured **Create WLAN** dialog where deployment scope is a deliberate first step
4. A `WlanAssignmentMode` type and associated fields on the WLAN object

---

## Object Model

### New type — `src/types/network.ts`

```ts
type WlanAssignmentMode = 'unassigned' | 'all_sites' | 'selected_targets';
```

### Additions to `WLANFormData` — `src/types/network.ts`

```ts
assignmentMode: WlanAssignmentMode;
assignedSiteIds: string[];
assignedSiteGroupIds: string[];
templateId?: string;   // forward-compatible; null until template governance is designed
```

### Additions to `Service` interface — `src/types/api.ts`

```ts
assignmentMode?: WlanAssignmentMode;
assignedSiteIds?: string[];
assignedSiteGroupIds?: string[];
templateId?: string;
```

---

## Components

### 1. `AssignmentSection` — `src/components/AssignmentSection.tsx` (new)

Shared controlled component. Owns no fetch logic — parents supply data.

**Props:**
```ts
interface AssignmentSectionProps {
  value: WlanAssignmentMode;
  onChange: (mode: WlanAssignmentMode) => void;
  selectedSiteIds: string[];
  selectedSiteGroupIds: string[];
  onSitesChange: (ids: string[]) => void;
  onSiteGroupsChange: (ids: string[]) => void;
  sites: Site[];
  siteGroups: SiteGroup[];
}
```

**Behaviour:**
- Renders three radio options always: **Not assigned**, **All sites**, **Select sites / site groups**
- When `selected_targets` is active, a chip-based type-ahead expands below the radio group
- Type-ahead searches both `sites` and `siteGroups` in a single input; groups prefixed with folder icon
- Chips are removable; summary line shows "N sites, N groups selected"
- Switching away from `selected_targets` preserves chip state — switching back restores it
- Submit disabled with inline hint if `selected_targets` active but no chips selected

---

### 2. `QuickWLANDialog` — `src/components/QuickWLANDialog.tsx` (new)

Compact single-page modal. No steps, no tabs.

**Layout:**
```
SSID Name  |  VLAN
Authentication (WPA2-PSK / WPA3-Personal / WPA2-Enterprise / Open)
Passphrase  (hidden when Open or OWE selected)
── Deployment ──
<AssignmentSection />
[Cancel]  [Create WLAN →]
```

**Defaults:** `assignmentMode = 'all_sites'`, security = `wpa2-psk`, VLAN = `1`.

**On submit:**
- `unassigned` → `apiService.createService()` only (no profile assignment)
- `all_sites` → `WLANAssignmentService.createWLANWithAutoAssignment()`
- `selected_targets` → `WLANAssignmentService.createWLANWithSiteCentricDeployment()` with `ALL_PROFILES_AT_SITE` applied to each selected site/group

**On success:** closes dialog, calls `onSuccess()` to trigger network table reload.

**Error handling:** uses existing `errorHandler.ts` → toast pattern. Partial assignment failures surfaced via existing `AutoAssignmentResponse.errors[]` summary.

---

### 3. `CreateWLANDialog` — `src/components/CreateWLANDialog.tsx` (modified)

Restructured so deployment scope is a deliberate **first section** before network configuration fields.

**New layout order:**
1. **Deployment scope** — `<AssignmentSection />` (new, prominent)
2. **Network configuration** — existing SSID / security / band / advanced fields (unchanged)
3. **Per-site deployment mode** — existing `DeploymentModeSelector` / `ProfilePickerDialog` / `EffectiveSetPreview` — **conditional: only rendered when `selected_targets` is chosen**

**Changes to validation:**
- Remove forced `≥1 site selected` validation
- `unassigned` bypasses all profile-discovery and site-config logic
- `all_sites` calls `WLANAssignmentService.createWLANWithAutoAssignment()` — auto-applies `ALL_PROFILES_AT_SITE` to every site, no per-site config needed

**Sites/groups data:** already loaded in the existing `useEffect` on dialog open — passed straight through to `AssignmentSection`.

---

## ConfigureNetworks — `src/components/ConfigureNetworks.tsx` (modified)

### Banner strip

Inserted between the page header and the search/filter bar:

```
⚡ Quick WLAN   Get a network live in seconds — name, auth, VLAN, deploy.  [Get Started →]
```

- Triggers `QuickWLANDialog`
- Dismissible per-session via `sessionStorage` flag `quick_wlan_banner_dismissed`
- Reappears when the browser tab is closed and reopened (true session-scope, not permanent)

### Header button row

Unchanged: **Refresh** · **Create WLAN** · **Create Template**
Quick WLAN is accessed via the banner only — no additional header button.

### New state

```ts
const [showQuickWLANDialog, setShowQuickWLANDialog] = useState(false);
```

---

## Service Layer — `src/services/wlanAssignment.ts` (modified)

### Unassigned mode early-return

```ts
if (assignmentMode === 'unassigned') {
  const service = await apiService.createService(wlanConfig);
  return {
    serviceId: service.id,
    sitesProcessed: 0,
    deviceGroupsFound: 0,
    profilesAssigned: 0,
    assignments: [],
    success: true,
  };
}
```

No profile discovery, no sync triggered — returns immediately after global service creation.

---

## Files Changed

| File | Change |
|---|---|
| `src/components/AssignmentSection.tsx` | **New** — shared assignment radio + chip picker |
| `src/components/QuickWLANDialog.tsx` | **New** — compact single-page WLAN creation modal |
| `src/components/ConfigureNetworks.tsx` | Add banner strip, `showQuickWLANDialog` state, mount `QuickWLANDialog` |
| `src/components/CreateWLANDialog.tsx` | Add `AssignmentSection` as first section; conditionalize per-site config; remove forced-site validation |
| `src/types/network.ts` | Add `WlanAssignmentMode`, extend `WLANFormData` |
| `src/types/api.ts` | Extend `Service` with assignment fields + `templateId?` |
| `src/services/wlanAssignment.ts` | Handle `unassigned` early-return path |

---

## Not In Scope

- **Template governance** — templates carrying `assignmentScope`, WLAN→template lineage, enterprise deployment via template push. Deferred to a separate design spec. The `templateId?: string` field added here is the only forward-compatible hook.
- **Editing assignment after creation** — the existing `NetworkEditDetail` inline editor is not changed in this work.
- **Reconciliation changes** — `wlanReconciliationService` is not modified; `unassigned` WLANs simply have no profile assignments to reconcile.

---

## Verification

1. **Quick WLAN — unassigned:** Open Quick WLAN, fill SSID/auth/VLAN, select "Not assigned", submit. Verify WLAN appears in table with no site assignment. Verify no profile assignment API calls made.
2. **Quick WLAN — all sites:** Select "All sites", submit. Verify WLAN deployed to all site profiles. Verify `AutoAssignmentResponse.profilesAssigned > 0`.
3. **Quick WLAN — selected targets:** Select "Select sites / site groups", add chips, submit. Verify only selected targets receive assignment.
4. **Create WLAN — unassigned:** Open full dialog, leave "Not assigned" selected, complete config, submit. Verify global service created, no site deployment.
5. **Create WLAN — selected targets + per-site mode:** Select targets, verify per-site deployment section appears. Change to "All sites", verify per-site section hides.
6. **Banner dismiss:** Click ✕ on banner, reload page. Verify banner does not reappear in same session. Open new tab — verify banner reappears.
7. **AssignmentSection chip state:** Select targets, add chips, switch to "All sites", switch back to "Select targets" — verify chips are preserved.
