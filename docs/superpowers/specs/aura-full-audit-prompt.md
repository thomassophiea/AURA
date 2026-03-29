# AURA Full Application Audit Prompt

Primary objective:
Perform a full application sweep across every page, widget, screen, workflow, and API-backed feature in the AURA app. Use the Swagger/OpenAPI file in the Aura directory as the source of truth for endpoint discovery, request structure, response structure, and field validation.

Swagger file location:
/Users/m4pro/Library/CloudStorage/OneDrive-ExtremeNetworks\,Inc/Visual\ Studio/AURA/swagger\ Extreme\ Campus\ Controller\ REST\ API\ Gateway\ \(1.25.1\).json

Core instructions:
1. Inspect the entire application codebase.
2. Enumerate all routes, pages, views, widgets, cards, tables, charts, filters, selectors, drawers, modals, and detail panels.
3. Identify every API call currently used by the app.
4. Cross-check every API call against the Swagger file.
5. Test every endpoint referenced by the app.
6. Identify endpoints that are broken, missing, mis-mapped, stale, or only partially implemented.
7. Fix endpoint usage where needed.
8. Do not implement or test configuration save flows. Ignore save logic entirely. Remove any testing or audit scope related to saving configuration so the audit only focuses on read, fetch, display, correlation, filtering, actions, and functional behavior.
9. Validate feature behavior, not just whether an endpoint returns 200.
10. Where the UI is weak because a single endpoint is insufficient, check Swagger for related endpoints that can be combined to improve the widget, workflow, or insight.
11. Improve feature completeness where multiple API calls can be correlated for better accuracy, context, or richer UX.
12. Prefer real API data only. Flag mock data, placeholder data, hardcoded data, or dead widgets.
13. For every API-backed feature, verify that the data shown in the UI accurately reflects the API response and intended meaning.
14. Produce a running task list and execute it systematically.

Strict scope boundaries:
- Do not work on save or write-back configuration workflows.
- Do not leave TODO comments without trying to solve the issue.
- Do not assume a response is correct just because data renders.
- Do not preserve weak widget logic if Swagger supports a better implementation.
- Do not use mock or fake data unless explicitly unavoidable, and if unavoidable, clearly flag it.

Execution plan:

Phase 1: Discover and map the app
- Identify the app structure.
- Build an inventory of:
  - pages
  - subpages
  - tabs
  - widgets
  - charts
  - tables
  - detail panes
  - filters
  - workflows
  - API utility files
  - service layers
  - hooks/composables
  - data transformation layers
- Create a feature-to-endpoint matrix:
  Feature / Screen -> Current API calls -> Swagger operationId/path -> Data fields used -> UI dependency

Phase 2: Parse Swagger and build endpoint catalog
- Parse the Swagger JSON.
- Build an endpoint catalog with:
  - path
  - method
  - tags
  - summary
  - operationId
  - parameters
  - request body schema
  - response schema
  - auth requirements if present
- Group related endpoints by functional area such as:
  - clients
  - APs
  - devices
  - sites
  - WLANs
  - networks
  - alarms/events
  - health/insights
  - traffic/bandwidth
  - RF/radio
  - policy/security
  - inventory/topology
- Look for endpoints not currently used by the application but which could improve current widgets or workflows.

Phase 3: Cross-check implementation
For each screen and feature:
- Identify the current API call(s).
- Verify request path, method, params, query params, headers, auth, pagination, and response handling.
- Check for:
  - wrong endpoint selection
  - wrong query params
  - wrong field mapping
  - stale endpoint versions
  - incomplete data extraction
  - missing error handling
  - incorrect assumptions about nullability
  - incorrect date/time parsing
  - incorrect units or labels
  - broken loading states
  - silent failures
  - unused response data that could improve the UI
- Fix all endpoint mapping issues found.

Phase 4: Endpoint testing
Test all endpoints used in the app, plus any Swagger endpoints relevant to incomplete features.

For each tested endpoint:
- verify connectivity
- verify auth behavior
- verify required params
- verify expected response schema
- verify empty-state behavior
- verify partial/missing-field behavior
- verify pagination/sorting/filtering behavior if supported
- verify real-world usefulness for the widget or feature

Capture:
- endpoint path/method
- where used in UI
- test result
- schema match or mismatch
- data quality observations
- recommended fix
- implemented fix if completed

Phase 5: Feature enhancement via endpoint composition
Where a widget or screen is underpowered, inspect Swagger for related endpoints and improve the experience by correlating multiple reads.

Examples of acceptable enhancement patterns:
- combine summary endpoint + detail endpoint
- combine device info + site context + health metrics
- combine AP/client stats + time-series data
- combine events/alarms + affected entity details
- combine topology/inventory + performance state
- enrich table rows with related metadata from secondary lookups
- fill gaps in cards/charts using supplementary GET endpoints

For each enhancement:
- explain why the current implementation is weak
- identify the additional endpoint(s)
- implement the combined data flow
- ensure the resulting widget is clearer and more accurate

Phase 6: Accuracy validation
For every API-backed feature, verify:
- displayed labels match actual API meaning
- counts match underlying records
- percentages are calculated correctly
- bandwidth/throughput units are correct and consistent (Mbps vs Kbps, MB vs GB)
- client/device/site rollups are mathematically sound
- time windows are accurate
- status/severity mappings are correct
- charts are not misleading due to partial data
- empty states and unavailable data states are handled honestly
- timezone handling is consistent: are timestamps displayed in local time, UTC, or controller time? Flag inconsistencies across pages
- number formatting uses thousands separators and appropriate decimal places
- duration formatting is human-readable (e.g., "3d 4h" not raw seconds)
- "last seen" / "last connected" timestamps use relative time consistently (e.g., "5 minutes ago" not raw ISO strings)

Flag any widget that looks functional but is semantically misleading.

Phase 7: Security and data hygiene
- Audit localStorage and sessionStorage for sensitive data (tokens, credentials, controller URLs stored in the clear)
- Verify auth tokens are not logged to console or included in error reports
- Check for hardcoded controller URLs, API keys, or credentials in source code
- Audit CORS proxy configuration for overly permissive origins
- Verify API tokens are refreshed or rotated appropriately
- Check that the service worker cache does not persist sensitive API responses beyond session lifetime
- Audit all fetch/XHR calls for proper Authorization header handling
- Flag any endpoint called over HTTP instead of HTTPS
- Audit all catch blocks: flag any that silently swallow errors without user-visible feedback
- Check that error boundaries exist and provide meaningful recovery UI

Phase 8: Service worker and caching
- Verify cache version matches deployment version
- Audit which routes and assets are cached vs network-first
- Check that API responses are not stale-cached when they should be fresh
- Verify cache invalidation on login/logout
- Test behavior when service worker has stale cache and API schema has changed
- Audit precache manifest for oversized or unnecessary entries

Phase 9: Theme consistency
- Verify every page renders correctly in all theme variants (light, ep1/dark, dev)
- Check for hardcoded colors that do not use CSS variables or theme tokens
- Verify gradient metric cards are legible in all themes
- Check status indicators (green/red/amber dots) have sufficient contrast in both light and dark modes
- Flag any component using raw Tailwind colors instead of semantic theme tokens (e.g., hardcoded `text-gray-500` instead of `text-muted-foreground`)

Phase 10: Accessibility
- Keyboard navigation for all tables: row selection, sorting, pagination, column customization
- Focus management in slide-out panels: trap focus when open, return focus to trigger element on close
- Screen reader labels on icon-only buttons (Refresh, Export, Customize Columns)
- Color contrast validation on status indicators against dark and light backgrounds
- ARIA roles on metric cards, interactive tables, and selection controls
- Skip-to-content link for sidebar navigation
- Ensure all form inputs have associated labels
- Verify that interactive elements have visible focus indicators

Phase 11: Bundle and load performance
- Audit lazy-loaded routes: are all heavy pages actually code-split?
- Check manualChunks config for vendor splitting effectiveness
- Identify components that import heavy libraries but are rarely used
- Flag any page that imports the full icon set instead of individual icons
- Measure initial bundle size and identify top contributors
- Check for duplicate dependencies in the dependency tree
- Identify duplicate fetches, waterfall requests, unnecessary re-renders, and opportunities for request deduplication or deferred loading
- Validate page behavior under slow responses, empty arrays, null fields, partial objects, and partial endpoint failure
- Ensure one failed request does not incorrectly break or misrepresent the full page

Phase 12: Deep link and URL state
- Can a user bookmark and return to a specific page with filters applied?
- When sharing a URL, does the recipient see the same view?
- Are search queries, sort state, and active filters reflected in the URL or at minimum in sessionStorage?
- Does browser back/forward work predictably with page navigation?

Phase 13: Console hygiene
- The build strips console.* in production, but audit for:
  - console.error calls that swallow real errors without user-facing feedback
  - console.warn/log that mask important diagnostic info in dev mode
  - Error boundaries that silently catch without user-visible feedback
- Flag any catch block that does nothing (empty catch, console-only catch with no UI indication)

Phase 14: Clean-up and final output
Deliver:
1. A completed task list of fixes made
2. A list of broken endpoints or mismatches found
3. A list of UI features validated successfully
4. A list of widgets/features improved by combining multiple endpoints
5. A list of widgets that should be removed if they cannot be backed by real data
6. A final feature coverage report:
   - page
   - feature
   - endpoint(s)
   - tested
   - fixed
   - enhanced
   - status

Required working style:
- Work page by page.
- Work feature by feature.
- Be exhaustive.
- Prefer direct fixes over commentary.
- Update the code where necessary.
- Keep a visible markdown checklist in the workspace as you progress.
- Mark each page and widget as:
  - discovered
  - mapped
  - tested
  - fixed
  - enhanced
  - verified

Coverage and discovery:
- Build a full route inventory from the router, including hidden routes, lazy-loaded routes, modal workflows, feature-flagged views, and drill-down-only screens.
- Build a component inventory for all shared widgets, tables, charts, cards, filters, drawers, modals, and detail panels.
- Identify dead code, orphaned components, stale service files, unused hooks, and unused API utilities.

Validation rigor:
- Do not treat a feature as valid just because it renders.
- A feature is only validated if the displayed data, calculations, labels, units, drill-down behavior, and empty/error states all accurately reflect the API meaning.
- Mark any semantically misleading widget as failed, even if it appears functional.

Runtime/API contract verification:
- Compare live endpoint behavior against Swagger response schema.
- Flag schema drift, missing documented fields, undocumented relied-upon fields, enum drift, type mismatches, nullability mismatches, and pagination mismatches.
- Audit all response transformation layers, adapters, formatters, and selectors for semantic correctness.

State and workflow audit:
- Audit state management for stale context, race conditions, duplicate requests, cache invalidation issues, filter leakage, and incorrect context carryover between pages.
- Validate cross-page continuity for selected site, client, AP, time range, drill-down context, and row selection state.
- Ensure summary-to-detail flows remain numerically and semantically consistent.

Decision framework:
For every widget or feature, choose one final disposition:
- validated
- fixed
- enhanced
- simplified
- remove

Priority scoring:
Classify findings as:
- P0 critical data correctness
- P0.5 security vulnerability (exposed credentials, auth bypass, sensitive data in client storage)
- P1 broken workflow / major mismatch
- P2 enhancement opportunity
- P3 cleanup / technical debt

Output artifacts to produce:
- /audit/aura-feature-endpoint-matrix.md
- /audit/aura-swagger-endpoint-catalog.md
- /audit/aura-api-test-results.md
- /audit/aura-widget-enhancement-opportunities.md
- /audit/aura-route-inventory.md
- /audit/aura-component-inventory.md
- /audit/aura-runtime-request-trace.md
- /audit/aura-schema-drift-report.md
- /audit/aura-state-management-findings.md
- /audit/aura-removal-recommendations.md
- /audit/aura-security-findings.md
- /audit/aura-accessibility-findings.md
- /audit/aura-theme-audit.md
- /audit/aura-final-audit-summary.md

Testing expectations:
- Use real application flows where possible.
- Exercise filters, sort, search, pagination, row expansion, chart range selectors, context changes, and drill-down behavior.
- Validate that a widget still works when API returns empty arrays, partial objects, null fields, or delayed responses.
- Ensure each feature degrades gracefully.

Per-feature documentation format:
For every page, widget, workflow, and reusable component, document:
- feature name
- route/location
- component(s)
- current endpoint(s)
- Swagger endpoint(s)
- request params
- response fields used
- transformations applied
- test scenarios executed
- issues found
- fix implemented
- enhancement implemented
- final status
- confidence level

Definition of done:
A page is not complete until all reachable features are mapped, all runtime requests are cross-checked to Swagger, major user flows are tested with real data, semantic correctness is verified, broken mappings are fixed, weak implementations are improved where justified, and the result is documented in the audit artifacts.

Special focus:
- Find areas where the app currently uses only one endpoint but the Swagger supports richer context through multiple related GET calls.
- Prioritize real data integrity over superficial rendering.
- Remove any scope related to saving configuration from the audit and test plan.
- The goal is feature correctness, endpoint correctness, and better API-backed functionality across the entire application.

Start now by:
1. Parsing the Swagger file
2. Mapping the full app structure
3. Building the feature-to-endpoint matrix
4. Running the audit page by page
5. Fixing issues as they are found
6. Producing the markdown audit artifacts as you go
