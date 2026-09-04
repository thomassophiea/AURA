# AURA Network Intelligence — Configuration Scope Roadmap

Source: `Ascend_IQC_Skills_Catalog-Consolidated_configuration_skills_audit.md` (and
its workbook, `..._with_local_api.xlsx`) — 37 business-level configuration
scenarios for the Extreme Campus Controller, each mapped to real endpoints in
`swagger 2027.json` (API v1.25.1). This roadmap cross-references that catalog
against AURA's actual codebase — both the manual "Configure" UI
(`src/services/configure/*`) and the AI assistant built in this pass
(`server/cortex/wirelessIntentParser.js` → `wlanConfigValidator.js` →
`wlanProvisioningEngine.js`) — and lays out what a full build-out looks like.

**No new provisioning pipelines were built in this pass.** What shipped:
the intent parser now *recognizes* all 37 scenarios and answers honestly when
one isn't yet configurable through natural language, instead of silently
mis-routing it to generic chat or ignoring it. See
`server/cortex/configurationDomainCatalog.js`.

## 1. The 7 WLAN/Service-domain skills — already the assistant's home turf

These operate on the same object (`Service`) the assistant already creates,
validates, and provisions:

| Skill | Status |
|---|---|
| WLAN Configuration | **Built** — `create_wlan` is the full vertical slice (parse → validate → approve → provision → verify) |
| WLAN Group Assignment | Recognized (`update_wlan`/`assign_wlan` actions exist in the parser); no group-object provisioning logic yet — no dedicated API object exists either (audit: "Needs validation") |
| WLAN Assignment & Profile Integration | Partially built — `wlanProvisioningEngine.resolveTargetProfiles` + radio binding covers the core case; MLO, scheduling, and non-default Role/VLAN-per-profile overrides are not |
| Allow Removal when Assigned WLAN/RF Profile | Not built — no unassign path in `wlanProvisioningEngine` today |
| Hotspot Configuration | Not built — `hotspotType`/`hotspot` fields on the Service payload untouched by `buildServicePayload` |
| WLAN Auth types | Partially built — `wpa2_personal`/`wpa3_personal`/`open`/`owe`/`wpa2_enterprise`/`wpa3_enterprise` all exist in `SecurityMode`; WEP and OWE-companion linking do not |
| MAC-Based Authentication (MBA) | Not built — `mbaAuthorization` field untouched |

## 2. The 30 other domains — recognized, not implemented

Every request matching one of these is answered honestly (domain name + real
Local Controller API + AURA's existing support status) instead of being
silently misread as a WLAN request or handed to generic chat. See
`detectConfigurationDomain()` in `server/cortex/configurationDomainCatalog.js`
and the `classification: 'unimplemented'` path in `wirelessIntentParser.js`.

| # | Domain | Local Controller API | AURA support today |
|---|---|---|---|
| 5 | AAA Policy Configuration & Assignment | `POST /v1/aaapolicy; PUT /v1/aaapolicy/{id}; DELETE /v1/aaapolicy/{id}` | src/services/configure/aaaPolicyService.ts — manual CRUD exists |
| 6 | Role Configuration | `POST /v3/roles; PUT /v3/roles/{roleId}; DELETE /v3/roles/{roleId}` | src/services/configure/rolesService.ts — manual CRUD exists |
| 7 | PPSK (Private Pre-Shared Key) | `PUT /v1/services/{serviceId} (privacy.PskElement/WpaPskElement passphrase assignment) -- Needs validation: per-user Extreme-PPSK key lifecycle (create/import/export/pause/resume, CSV import, email/QR notification) has no dedicated endpoint in this API version` | AURA has a dedicated PPSK subsystem (server/ppsk/, src/services/ppskService.ts) — richer than the audited API alone; CSV import/pause/resume/email-QR already implemented server-side |
| 8 | Captive Web Portal Configuration & Assignment | `POST /v1/eguest; PUT /v1/eguest/{eguestId}; DELETE /v1/eguest/{eguestId}; PUT /v1/services/{serviceId} (enableCaptivePortal, captivePortalType, cpNonAuthenticatedPolicyName); PUT /v3/roles/{roleId} (cpRedirect*, cpOauthUseGoogle/Facebook/Microsoft external CWP fields)` | src/services/configure/eguestService.ts + server/portal/, server/guests/ — substantial existing guest-access subsystem |
| 9 | VLAN Configuration & Assignment | `POST /v1/topologies; PUT /v1/topologies/{topologyId}; DELETE /v1/topologies/{topologyId}` | src/services/configure/topologiesService.ts — manual CRUD exists |
| 10 | VLAN Group Configuration & Assignment | `POST /v1/topologies; PUT /v1/topologies/{topologyId}; DELETE /v1/topologies/{topologyId} (group/members fields on TopologyElement) -- Needs validation: VLAN Group is represented as attributes on the Topology object itself; no separate VLAN-Group endpoint exists` | src/services/configure/vlanGroupsService.ts — manual CRUD exists |
| 11 | Class of Service (CoS) Configuration & Assignment | `POST /v1/cos; PUT /v1/cos/{cosId}; DELETE /v1/cos/{cosId}` | src/services/configure/cosService.ts — manual CRUD exists |
| 12 | Rates Configuration & Assignment | `POST /v1/ratelimiters; PUT /v1/ratelimiters/{rateLimiterId}; DELETE /v1/ratelimiters/{rateLimiterId}` | src/services/configure/rateLimitersService.ts — manual CRUD exists |
| 13 | Wireless Profile Configuration & Assignment | `POST /v3/profiles; PUT /v3/profiles/{profileId}; DELETE /v3/profiles/{profileId}` | src/services/configure/profilesService.ts — manual CRUD exists |
| 14 | Radio Configuration & Assignment within Profiles | `PUT /v3/profiles/{profileId} (radios[] / radioIfList nested fields) -- configured as part of the Profile object; no standalone radio-object endpoint` | Nested field on Profile object (radios[]/radioIfList) — no standalone AURA CRUD, edited within profilesService |
| 15 | RRM Configuration & Assignment | `POST /v3/rfmgmt; PUT /v3/rfmgmt/{rfmgmtId}; DELETE /v3/rfmgmt/{rfmgmtId}` | src/services/configure/rfmgmtService.ts — manual CRUD exists |
| 16 | AP Wired Port Configuration within Profiles | `PUT /v3/profiles/{profileId} (wiredPorts[] nested fields)` | Nested field on Profile object (wiredPorts[]) — no standalone AURA CRUD |
| 17 | Air Defense Profile Configuration & Assignment | `POST /v3/adsp; PUT /v3/adsp/{adspId}; DELETE /v3/adsp/{adspId} (also available as /v4/adsp; /v4/adsp/{adspId})` | src/services/configure/adspService.ts — manual CRUD exists |
| 18 | Positioning Profile Configuration & Assignment | `POST /v3/positioning; PUT /v3/positioning/{positioningProfileId}; DELETE /v3/positioning/{positioningProfileId}` | src/services/configure/positioningService.ts — manual CRUD exists |
| 19 | Analytics Profile Configuration & Assignment | `POST /v3/analytics; PUT /v3/analytics/{analyticsProfileId}; DELETE /v3/analytics/{analyticsProfileId}` | src/services/configure/analyticsService.ts — manual CRUD exists |
| 20 | RTLS Profile Configuration & Assignment | `POST /v1/rtlsprofile; PUT /v1/rtlsprofile/{rtlsprofileId}; DELETE /v1/rtlsprofile/{rtlsprofileId}` | src/services/configure/rtlsProfileService.ts — manual CRUD exists |
| 21 | IoT Profile Configuration & Assignment | `POST /v3/iotprofile; PUT /v3/iotprofile/{iotprofileId}; DELETE /v3/iotprofile/{iotprofileId}` | src/services/configure/iotProfileService.ts — manual CRUD exists |
| 22 | ESL & IoT (Electronic Shelf Label) Configuration | `No local API identified -- no ESL/electronic-shelf-label or VusionGroup fields found on IoTProfileElement or elsewhere in this API version` | src/services/configure/eslProfileService.ts exists, but the audited API (swagger 2027.json) has NO ESL/VusionGroup fields anywhere — flag for verification before trusting this service |
| 23 | Meshpoint Configuration | `POST /v3/meshpoints; PUT /v3/meshpoints/{meshpointId}; DELETE /v3/meshpoints/{meshpointId}` | src/services/configure/meshpointsService.ts — manual CRUD exists |
| 24 | AP Device List & Actions | `PUT /v1/aps/assign; PUT /v1/aps/reboot; PUT /v1/aps/upgrade; PUT /v1/aps/upgradeschedule; DELETE /v1/aps/list; PUT /v1/aps/multiconfig` | Covered via src/services/api.ts AP methods + AccessPoints.tsx page — extensive existing feature |
| 25 | AP Adoption Rules Configuration | `PUT /v1/devices/adoptionrules (current path); PUT /v1/aps/adoptionrules (deprecated legacy path)` | src/services/configure/adoptionService.ts targets /v1/aps/registration (adoption/registration settings), NOT /v1/devices/adoptionrules — own code comment flags this as a known gap pending ConfigureAdoptionRules.tsx rewiring |
| 26 | Controller System Configuration & Operations | `No local API identified -- dedicated Interfaces / Network-Time(NTP) / PKI-Trustpoint / SNMP-server / Syslog / HA endpoints for controller/Gateway system settings were not found in this API version. SwitchManager endpoints technically exist in the spec but are deprecated and are not used to manage the controller/Gateway appliance in current deployments (per business confirmation), so they were excluded from this mapping.` | Partial: src/services/configure/snmpService.ts (SNMP) + trustPointsService.ts (PKI) + availabilityService.ts (HA) exist; NTP/interfaces/syslog have no local API at all (confirmed absent from swagger 2027.json) |
| 30 | MAC Access Control List (ACL) Configuration | `POST /v1/accesscontrol; PUT /v1/accesscontrol; DELETE /v1/accesscontrol` | src/services/configure/accessControlService.ts — manual CRUD exists (/v1/accesscontrol) |
| 31 | Administrator Account Management | `POST /v1/administrators; PUT /v1/administrators/{userId}; DELETE /v1/administrators/{userId}; PUT /v1/administrators/adminpassword; PUT /v1/administratorsTimeout/{userId}` | src/services/configure/administratorsService.ts — manual CRUD exists |
| 32 | REST API Application Key Management | `POST /v1/appkeys; DELETE /v1/appkeys/{appKey}` | No AURA service found for /v1/appkeys — genuine gap at both the manual-UI and AI layers |
| 33 | DPI Application Signature Management | `PUT /v1/dpisignatures` | No AURA service found for /v1/dpisignatures — genuine gap at both the manual-UI and AI layers |
| 34 | ExtremeLocation (XLocation) Profile Configuration & Assignment | `POST /v3/xlocation; PUT /v3/xlocation/{xlocationId}; DELETE /v3/xlocation/{xlocationId}` | src/services/configure/xlocationService.ts — manual CRUD exists |
| 35 | NSight Server Integration Configuration | `PUT /v1/nsightconfig` | No AURA service found for /v1/nsightconfig — genuine gap at both the manual-UI and AI layers |
| 36 | Global Site Defaults Configuration | `PUT /v1/globalsettings` | src/services/configure/globalSettingsService.ts — manual CRUD exists (/v1/globalsettings) |
| 37 | Report Template & Scheduled Report Configuration | `POST /v1/reports/templates; PUT /v1/reports/templates/{templateId}; DELETE /v1/reports/templates/{templateId}; POST /v1/reports/scheduled; PUT /v1/reports/scheduled/{reportId}; DELETE /v1/reports/scheduled/{reportId}` | No AURA service found for /v1/reports/templates or /v1/reports/scheduled — genuine gap; matches prior finding that this controller returns [] for /v1/reports/* |

**Read this table as two different gaps, not one:**

- **AI-only gap** (23 of 30 rows): a real manual CRUD service already exists
  in `src/services/configure/` (or a dedicated subsystem, for PPSK and CWP).
  Extending the assistant to these is "wire natural language to an endpoint
  AURA already knows how to call safely" — lower risk, faster to build.
- **Genuine platform gap** (4 rows: App Keys, DPI Signatures, NSight, Report
  Templates): no AURA code touches these endpoints at all today, manual UI or
  AI. These need a new `configure/` service before an AI pipeline makes sense.
- **Nested-object gap** (2 rows: Radio, Wired Port): these aren't separate
  API resources — they're array fields inside `Profile`. An assistant path for
  these means extending a *profile* pipeline, not a standalone one.
- **Flagged discrepancies worth resolving before building on them:**
  - **ESL** (row 22): `eslProfileService.ts` exists in AURA, but the audit
    found *no* ESL/VusionGroup fields anywhere in `swagger 2027.json`. Either
    the service targets a different/newer controller API surface than the
    one audited, or it's speculative/dead code. Verify against a live
    controller before using it as a template for anything.
  - **AP Adoption Rules** (row 25): `adoptionService.ts`'s own code comment
    already flags that it targets `/v1/aps/registration` (adoption/
    registration *settings*), not the real `/v1/devices/adoptionrules`
    endpoint the audit identifies. `ConfigureAdoptionRules.tsx` is noted as
    pending a rewiring to the real endpoint — do that before adding an AI
    path for this domain, or the assistant would validate against the wrong
    object.

## 3. What it would take to build one of these for real

The existing pipeline is a template, not a WLAN-only artifact. Porting it to
a new domain means the same five pieces `create_wlan` has:

1. **Typed intent** — a domain-specific shape (siblings of
   `WirelessConfigurationIntent` in `src/types/wirelessAssistant.ts`), not a
   generic bag of fields. Role's ordered L2→L3/L4→L3/L4-SD→L7→Default rule
   list and RRM's channel-plan-per-band are structurally nothing like a WLAN's
   `security`/`vlanId` — don't force-fit them into one union.
2. **Deterministic parser extension** — extract the domain's required fields
   from text with the same "ask, never guess" discipline as
   `wirelessIntentParser.js` (no LLM free-text parsing of a Role's rule list).
3. **Validator** — the domain's own pre-provision checks (existence,
   conflicts, capacity), producing the same plan-hash + signed-token pattern
   as `wlanConfigValidator.js`, reusing `server/cortex/validationToken.js`
   as-is.
4. **Provisioning engine** — mirror-then-deviate against the domain's own
   "gotchas" (every domain in this catalog almost certainly has its own
   silent-failure modes, the way WLAN has `radioIfList index:0` and
   WPA2-on-6GHz — these are not yet documented for the other 30 domains and
   must be discovered before writing to them, the same way `ai-first`'s
   `gotchas.md` was built from a real deployment, not guessed).
5. **Honest verification** — read back the write; for domains without an
   obvious live-state signal (unlike WLAN's AP `services[]` broadcast check),
   decide what "verified" even means before claiming it.

**Business rules that must be encoded, not dropped, if these get built:**
- Role: L2 → L3/L4 → L3/L4 Source/Dest → L7 → Default evaluation order is
  described as MANDATORY in the catalog — a validator that reorders or
  flattens these silently would misconfigure enforcement.
- RRM: "static values MUST NOT be overridden" — Local RRM is the default,
  AI-RRM is optional; a provisioning engine must never blanket-apply AI-RRM
  behavior over an operator's explicit static channel/power plan.
- CoS / Rates: inbound/outbound enforcement direction must be preserved
  exactly — these bind into Roles and WLANs and are easy to invert silently.
- Meshpoint / Radio / Wired Port: platform-aware — capabilities differ by AP
  model; a generic payload will not work across the fleet.

## 4. Suggested build order

Not a commitment — a starting point based on: existing AURA support (lower
lift), direct WLAN adjacency (reuses `wlanConfigValidator`'s site/AP-scope
checks), and how often these come up in the prepared scenarios already in the
product spec.

1. **VLAN / Topology** (row 9) — `create_wlan` already *reads* topologies for
   VLAN validation; creating one is the most natural next domain and directly
   unblocks "create a VLAN for this WLAN" instead of requiring the VLAN to
   pre-exist.
2. **AAA Policy** (row 5) and **Role** (row 6) — both are named
   prerequisites of WLAN Configuration in the catalog itself; WLAN-Enterprise
   security modes are half-finished without them.
3. **Captive Web Portal** (row 8) — AURA already has the richest existing
   subsystem here (`server/portal/`, `server/guests/`); likely the shortest
   path to a working pipeline of the remaining 30.
4. Profile-adjacent domains (RRM, CoS, Rate Limiter) — each has an existing
   `configure/` service and a bounded field set.
5. Everything else, prioritized by actual customer request — there is no
   evidence in this pass that, say, XLocation or NSight integration is more
   urgent than another.
6. The 4 genuine platform gaps (App Keys, DPI Signatures, NSight, Report
   Templates) need a `configure/` service built *first*, independent of any
   AI work — they have no manual path today either.

## 5. Verification

`server/cortex/configurationDomainCatalog.js` — 30 domains, one regex-based
trigger per domain, cross-checked against 34 representative phrases (30
positive domain matches + 4 negative controls confirming real WLAN requests
and plain questions are never misclassified). `wirelessIntentParser.js`
consults this catalog only when a request is neither a recognized WLAN action
nor phrased as a question — so it can never intercept a real WLAN creation or
a genuine read-only investigation. 38 + 5 new/updated tests, full suite green.
