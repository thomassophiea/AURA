# OS1 Site Hierarchy — Site Groups, Staging, XIQ Default Site

Implementation and validation record for the OS1 site model in AURA Integration.

## What the model is

```
Organization
└─ Site Group            ← the OS1 Gateway boundary: one Gateway, or a Gateway/HA pair
   └─ Site
      └─ Device
```

Alongside the operator's Sites, each management domain has one **system site** —
a location the system owns rather than the operator:

| Domain | System site | Source-system name | Position |
|---|---|---|---|
| OS1 | `Staging` | Gateway `Unassigned` (or an absent site field) | last, org-wide |
| IQ Engine / XIQ | `Default Site` | — | last, per XIQ-connected Site Group |

Neither is an error state and neither is styled as one: a neutral `System` tag,
no status hue.

## Where the rules live

`src/services/siteCatalog.ts` — pure functions, no React, no API.

| Function | Responsibility |
|---|---|
| `isGatewayUnassigned` | **The one** Gateway-`Unassigned` → OS1-`Staging` translation point |
| `getDeviceSiteValue` | Device site-field precedence (moved out of `AccessPoints`) |
| `resolveOs1DeviceSiteKey` | Device → catalog key, so a Staging filter is a plain key compare |
| `resolveOs1SiteLabel` | Device → display label; never blank, never `Unassigned` |
| `pinSystemSitesLast` | **The one** ordering primitive; wraps any comparator |
| `deriveGatewayMode` / `gatewayModeLabel` | Standalone vs Gateway Pair |
| `gatewayIdentity` | Locking ID → host name → Gateway URL host |
| `buildOs1Catalog` / `buildXiqCatalog` / `buildSiteCatalog` | Assemble both domains |
| `systemSiteLabel` | Label for a sentinel value, so pages never print the sentinel |

No component contains an `if (name === 'Staging')` special case.

### The ordering trap

`pinSystemSitesLast` must wrap the comparator a list **actually sorts with**,
after any direction flip. `SitesPage` negates its comparator for descending
order; wrapping the un-flipped one and negating afterwards would negate the
priority too and float `Staging` to the top. Covered by unit test *and* by a
live descending-sort assertion.

## Ownership of "Unassigned"

Nothing renames a Gateway object and no API changed. `CatalogSite.sourceValue`
carries the raw source value (`Unassigned`) so a filter or a future write still
speaks the API's vocabulary while the UI says `Staging`.

## Deliberate scoping decisions

1. **Staging is org-wide**, below all Site Groups. Unassigned devices still
   retain their owning `site_group_id`, so splitting Staging per Gateway later is
   a presentation change, not a model change.
2. **The Site Group row always renders**, including the single-Gateway case, so
   ownership of a Site is never implicit.
3. **Staging is not offered in the Direct Config target picker**
   (`SiteGroupSitePicker`, used by `ConfigureNetworks`). That picker chooses where
   a network is *written*; you do not push a WLAN to the unassigned pool. The
   ordering rule still applies there so a Site genuinely named `Staging` cannot
   land mid-list.
4. **Pages that fetch by site id show a notice instead of a request.** App
   Analytics, Audit Logs and Service Levels ask a source system for data *for a
   site id*; a sentinel returns either nothing or, worse, the whole estate
   presented as one site's numbers. Those pages skip the call and explain
   (`SystemSiteNotice`). Device lists (Access Points, Clients) filter client-side
   and honor Staging directly.
5. **XIQ `Default Site` reports empty rather than everything.**
   `isXiqDefaultSiteValue` guards the XIQ inventory loaders, because
   `__default__` is not a real XIQ location id and an unrecognised location
   filter returns the whole tenant. Verified live: All XIQ Sites = 23 devices,
   Default Site = 0.

## Files

**New:** `types/siteCatalog.ts`, `services/siteCatalog.ts`(+test),
`hooks/useSiteCatalog.ts`, `hooks/useStickySiteSelection.ts`(+test),
`components/SystemSiteNotice.tsx`, `components/SourceSiteSelector.test.tsx`.

**Changed:** `SourceSiteSelector` (hierarchy), `sle/SLEDashboard` (dropped its
hand-copied duplicate of the picker), `SiteGroupSitePicker`, `UnifiedFilterBar`,
`AccessPoints`, `SitesPage`, `config/sitesTableColumns`, `AppInsights`,
`AuditLogs`, `TrafficStatsConnectedClients`, `hooks/useSourceSites`
(tags sites with their owning Site Group), `types/domain` (optional
`systemKind` / `sortPriority` on `Site`).

## Validation

Gates: `type-check` clean · `eslint` 0 errors · **3295 unit tests pass, 0 fail**
(baseline 3246 + 49 new) · production `vite build` clean.

Live browser run against deployed Integration (Playwright, real login):

| Check | Result |
|---|---|
| Site Group row with Gateway name + identity + mode | PASS |
| `PrimarySite` / `AFC LAB` / `CLONE` under the Site Group | PASS |
| Staging last in the OS1 list | PASS |
| Staging shown with zero devices | PASS |
| Staging filters to unassigned devices only (0 today) | PASS |
| `Unassigned` never shown to an OS1 user | PASS |
| Default Site last in the XIQ list | PASS |
| Default Site renders empty, not the whole tenant | PASS (0 vs 23) |
| XIQ sites still load devices | PASS (23 rows, live 200s) |
| Normal site still filters the grid | PASS (PrimarySite = 4) |
| Sites table: Staging last, ascending | PASS |
| Sites table: Staging last, **descending** | PASS |
| Selected site persists across navigation | PASS |
| Service Levels still renders real SLE data | PASS |
| No horizontal overflow at 390px | PASS |
| No new console errors | PASS |

Live picker as rendered:

```
● OS-ONE
    All OS-ONE Sites                          ✓
  ● SITE GROUP  SouthEast  [STANDALONE]
      AFC LAB
      CLONE
      PrimarySite
  ────────────────────────────────────
    Staging  [SYSTEM]
● XIQ
    All XIQ Sites
    Audio Alterations … The BatCave      (9 sites)
    Default Site  [SYSTEM]
  ☁ Reconnect XIQ…
```

## Pre-existing issues found, not caused here

Each reproduces identically on Production Demo (which does not contain this
change) and appears zero times in the diff:

| Endpoint | Status | Surface |
|---|---|---|
| `/api/management/v1/aps/ifstats` | 500 | Access Points |
| `/api/management/v3/topologies` | 404 | Site Groups tab |
| `/api/management/v1/vlangroups` | 404 | Site Groups tab |
| `/api/management/v3/vlangroups` | 404 | Site Groups tab |

Also repaired in passing: the Audit Logs refresh button was
`setSelectedSite(s => s)`, which React bails out of when the value is unchanged,
so it never re-fetched.

## Limitations

- **Staging's device count is org-wide.** Under a Site-Group filter on the Sites
  page, Staging remains visible (an unassigned pool should not vanish) but its
  count spans all Gateways. Identical today — Integration has one Site Group.
- **`Gateway Pair` is derived from `secondary_controller`**, which
  `tenantService` does not yet populate, so every Site Group currently reads
  `Standalone`. Correct for this lab; a real pair needs that field fed.
- **A remembered site that is later deleted** leaves the picker on its
  placeholder until the user re-picks. No crash, no phantom filter.
- **Adoption rules are not implemented** — only the model that will support
  them. `Staging` devices retain their owning Gateway, so a rule engine can move
  a device Staging → Site without reworking the site model.

## Terminology conflict to resolve with PLM

The golden design (`~/Documents/ascend-brownfield-master-golden/CLAUDE.md` §6)
already defines **Staging** as a *configuration lifecycle state* — "Site
Group-local configuration not yet promoted to a Global Profile." This change
introduces **Staging** as a *site*. Both now exist with the same word meaning two
different things. Built as specified. Fortunately both are neutral, non-error
lifecycle states, so the styling rule ("no semantic status hue") is identical and
nothing visual conflicts.
