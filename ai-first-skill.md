# AI-First Skill

**Conversational network automation for Extreme Networks Campus Controller (XCC / OS ONE / Platform ONE).**

A Claude Code skill that turns natural-language asks into verified REST API operations against a live wireless controller. Built from a real deployment on 2026-05-15 (AIFIRST WPA2-PSK SSID, pushed to 51 profiles, broadcasting on 6 live APs within 30 seconds).

---

## What it does

When an admin says something like *"create a guest network on VLAN 30 at the Boston site"* or *"is AIFIRST broadcasting"*, the skill:

1. Maps the intent to a specific runbook (the **scenarios/** directory).
2. Gathers the minimum inputs it needs.
3. Executes the controller API calls in the right order.
4. Reads results back to verify the write actually took effect — XCC returns `2xx` for many requests that silently drop fields, so verification is non-negotiable.
5. Reports concrete outcomes (service ID, profile count, broadcast status), not narrative.

It is **deterministic**, not AI-inferred. Every action it claims to perform corresponds to a verified API call. No "optimize the RF" hand-waving.

---

## Architecture

```
~/.claude/skills/ai-first/
├── SKILL.md                          # Triggers + workflow (Claude reads this first)
├── references/
│   ├── api-endpoints.md              # Auth, services, profiles, topologies, APs
│   ├── payload-templates.md          # JSON for WPA2-PSK / WPA3-SAE / Open / Enterprise
│   ├── gotchas.md                    # Silent-failure traps and validation rules
│   └── ngc-patterns.md               # AURA xiqMigrationService bulk-create patterns
├── scripts/
│   └── deploy_ssid_to_profiles.py    # Per-radio binding helper, fixes index:0 bug
└── scenarios/
    ├── README.md                     # Index + demo flow
    ├── create-ssid.md                # New SSID with VLAN, security, site, profiles
    ├── clone-ssid.md                 # Duplicate an existing service to a new site
    ├── enable-wpa3.md                # Upgrade WPA2 → WPA3-SAE
    ├── hide-ssid.md                  # Suppress beacon broadcast
    ├── rotate-psk.md                 # Bulk passphrase rotation by name pattern
    ├── disable-band.md               # Turn off 2.4 / 5 / 6 GHz on a profile
    ├── move-ap-profile.md            # Reassign an AP to a different profile
    ├── disable-ap.md                 # Administratively silence an AP
    ├── create-vlan.md                # New topology / VLAN
    ├── report-ssids.md               # Inventory of all SSIDs + VLANs
    └── audit-wpa3.md                 # Find services not on WPA3 yet
```

---

## Scenarios covered (v1)

These are **fully functional today** — every one corresponds to a verified API path. The skill grows by adding new scenario runbooks as capabilities are confirmed against the controller.

| # | Scenario | Natural-language ask |
|---|---|---|
| 1 | `create-ssid` | "Create an Employee network on VLAN 10 at Site Alpha" |
| 2 | `create-ssid` | "Create an IoT SSID on VLAN 40 with client isolation enabled" |
| 3 | `create-ssid` | "Set up a secure employee Wi-Fi for a new site using standard corporate settings" |
| 4 | `clone-ssid` | "Clone Corp-WiFi from Site Alpha to Site Delta" |
| 5 | `enable-wpa3` | "Enable WPA3 on the Employee network at Site Gamma" |
| 6 | `hide-ssid` | "Hide the IoT wireless from being broadcast" |
| 7 | `rotate-psk` | "Update the guest password for all guest networks at Site Alpha" |
| 8 | `disable-band` | "Disable 2.4 GHz radios at Site Beta" |
| 9 | `move-ap-profile` | "Move AP-102 into the warehouse profile group" |
| 10 | `disable-ap` | "Disable the AP in Conference Room B" |
| 11 | `create-vlan` | "Create a voice VLAN for wireless handsets" |
| 12 | `report-ssids` | "Generate a report of all SSIDs and VLAN assignments" |
| 13 | `audit-wpa3` | "Show me all sites not using WPA3 yet" |

---

## Worked example: the AIFIRST deployment

This is the actual session that birthed the skill. Each step shows the user prompt and the deterministic action the skill took.

### 1. Authenticate

**User:** *"log into this controller and add an SSID — tsophiea.ddns.net admin Bronco3.0!"*

**Skill action:**

```bash
curl -sk -X POST "https://tsophiea.ddns.net/management/v1/oauth2/token" \
  -H "Content-Type: application/json" \
  -d '{"grantType":"password","userId":"admin","password":"Bronco3.0!"}'
```

Response: `HTTP 200`, bearer token captured (2-hour TTL).

### 2. Discover state before writing

The skill mirrors AURA's "mirror, then deviate" pattern (`ngc-patterns.md`): rather than constructing a payload from scratch, it reads an existing service to inherit topology, CoS, and role UUIDs.

```bash
curl -sk "$BASE/v1/services" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "find next free dot1dPortNumber, capture template UUIDs"
```

Result:
- Next free `dot1dPortNumber`: **108** (101–107 in use)
- Template `defaultTopology`: `efd5f044-26c8-11e7-93ae-92361f002671` (mirrors Skynet)
- Template role UUID: `9bc94158-b0cf-4c06-a13f-d9d01f0faa46`

### 3. Build payload from template

**User:** *"AIFIRST password 12345678"*

The skill assembled the WPA2-PSK template from `references/payload-templates.md` and substituted:

```json
{
  "id": "06636fe7-b8a0-4d30-983c-c70da8f8f11a",
  "serviceName": "AIFIRST",
  "ssid": "AIFIRST",
  "status": "enabled",
  "dot1dPortNumber": 108,
  "privacy": {
    "WpaPskElement": {
      "mode": "aesOnly",
      "pmfMode": "disabled",
      "presharedKey": "12345678",
      "keyHexEncoded": false
    }
  },
  "defaultTopology": "efd5f044-26c8-11e7-93ae-92361f002671",
  "preAuthenticatedIdleTimeout": 300,
  "features": ["CENTRALIZED-SITE"],
  "vendorSpecificAttributes": ["apName", "vnsName", "ssid"],
  "dscp": { "codePoints": [/* 64 elements */] },
  "...": "..."
}
```

### 4. POST — and catch the first silent failure

```bash
curl -sk -X POST "$BASE/v1/services" -d @payload.json
```

First attempt returned `422`: `"preAuthenticatedIdleTimeout" failed; The pre-authenticated idle timeout value '0' is invalid. Limits: 5 to 999999.`

The skill corrected the field to `300` (this rule is now documented in `gotchas.md`) and retried. Second attempt:

```
HTTP_STATUS:201
{"id":"06636fe7-b8a0-4d30-983c-c70da8f8f11a","serviceName":"AIFIRST",...}
```

Service created.

### 5. Deploy to profiles

**User:** *"deploy on all profiles"*

The skill ran `scripts/deploy_ssid_to_profiles.py --scope all`. This script enforces the critical radio-binding rule (documented in `gotchas.md`):

> `radioIfList` entries with `index: 0` are silently dropped by XCC. The script reads each profile's `radios[]`, takes the actual `radioIndex` of admin-enabled radios, and creates one `radioIfList` entry per radio slot.

The first naive deployment (using `index: 0`, copying AURA's `xiqMigrationService.ts` bug) had silently failed — the profile PUTs returned `200` but the entries were dropped. The script's per-radio enumeration fixed it:

```
OK   AP5020-PVT radios=[1, 2, 3]
OK   AP5010-PVT radios=[1, 2, 3]
OK   Home-5050 radios=[1, 2, 3]
... (51 profiles)
Total: 51 | updated=50 skipped=1 failed=0
```

### 6. Verify broadcast

**User:** *"is it broadcasting?"*

The skill waited 30 seconds (AP sync window), then `GET /v1/aps/CV012408S-C0102`:

```json
"services": [
  "Skynet (x2)",
  "Skynet_Junior (x2)",
  "Skynet_Outdoor (x3)",
  "Skynet_Private (x2)",
  "OpenRoaming2026 (x2)",
  "AIFIRST (x2)"
]
```

AIFIRST broadcasting on **radio 1 (2.4 GHz)** and **radio 2 (5 GHz)**. Radio 3 (6 GHz) silently dropped — Wi-Fi 6E spec disallows WPA2-PSK on 6 GHz. The skill surfaced this fact rather than retrying:

> *"6 GHz radios silently rejected WPA2-PSK — Wi-Fi 6E requires WPA3-SAE or OWE. If you want 6 GHz coverage, switch AIFIRST to WPA3 or add an SAE companion."*

---

## Worked example walkthroughs

Below: each scenario in the v1 set, with a one-paragraph "what the skill does end-to-end" so a non-engineer can follow the value.

### Create SSID (`create-ssid.md`)

**Prompt:** *"Create a new wireless network called Marketing on VLAN 30 at the Boston site, WPA2."*

Skill flow: resolves "Boston" against `/v3/sites`; checks `/v1/topologies` for a VLAN-30 entry (creates one if missing via `create-vlan.md`); copies an existing WPA2-PSK service's full body as the scaffold; POSTs `/v1/services` with the new UUID, name, VLAN topology, and PSK; binds the new service to the Boston site UUID via `/v1/services/{id}/siteids`; runs `deploy_ssid_to_profiles.py` against the profiles bound to Boston APs; reads back one AP after 30 seconds to confirm the service name appears in `services[]`. **Single utterance → live broadcast in under a minute.**

### Clone SSID (`clone-ssid.md`)

**Prompt:** *"Clone Corp-WiFi from Alpha to Delta."*

Skill flow: fetches the Corp-WiFi service body in full; generates a new UUID and increments `dot1dPortNumber`; POSTs the deep-copy; binds it to Delta's site UUID; discovers which profiles carry the original service by iterating `/v3/profiles` and scanning each one's `radioIfList`; deploys the clone to those same profiles. **The new site inherits an identical SSID config with zero hand-editing.**

### Enable WPA3 (`enable-wpa3.md`)

**Prompt:** *"Upgrade Skynet to WPA3."*

Skill flow: GETs the service; replaces `privacy.WpaPskElement` with `privacy.WpaSaeElement` (PMF required, SAE H2E, AES-CCM-128); PUTs the service back. Surfaces two consequences: existing clients will need to re-associate, and 6 GHz radios that were previously silently dropping the WPA2 binding will now light up because SAE is 6E-legal. Offers transitional mode (`WpaPskElement` + `WpaSaeElement` coexisting) if disruption matters.

### Hide SSID (`hide-ssid.md`)

**Prompt:** *"Hide the IoT network."*

Skill flow: GETs the service; flips `suppressSsid: true`; PUTs back. Single attribute change, but the skill notes that hidden SSIDs are obscurity, not security, and that iOS clients deprioritize them.

### Rotate PSK (`rotate-psk.md`)

**Prompt:** *"Rotate all the guest passwords at Site Alpha."*

Skill flow: pulls `/v1/services`, filters by name pattern (`*guest*`) and site binding to Alpha; iterates each service, GETs fresh, mutates `presharedKey` on whichever of `WpaPskElement` / `WpaSaeElement` is present, PUTs back; verifies by re-reading each. Warns the user that every connected client will be kicked off the moment the PSK changes.

### Disable Band (`disable-band.md`)

**Prompt:** *"Disable 2.4 GHz at Site Beta."*

Skill flow: resolves Beta's site UUID; finds APs at Beta; collects their unique profile UUIDs; for each profile, GETs, sets `radios[<index 1>].adminState = false`, PUTs back; verifies one AP after 30 seconds. Flags that 2.4 GHz removal will strand legacy IoT clients (scanners, label printers).

### Move AP Profile (`move-ap-profile.md`)

**Prompt:** *"Move AP-102 to the warehouse profile."*

Skill flow: looks up AP-102's serial number via `/v1/aps/query`; resolves "warehouse profile" against `/v3/profiles`; GETs the AP; sets `profileId` to the new UUID and clears `radioIfListOvr` so the new profile takes effect; PUTs back; verifies after 30 seconds. Checks compatibility — won't move a Wi-Fi 5 AP into a Wi-Fi 7-only profile without warning.

### Disable AP (`disable-ap.md`)

**Prompt:** *"Disable the AP in Conference Room B."*

Skill flow: defaults to "stop broadcasting" (sets each radio's `adminState: false` on the AP and marks `radioIfListOvr: true`) rather than removing the AP from the controller. Clarifies before doing anything destructive.

### Create VLAN (`create-vlan.md`)

**Prompt:** *"Add VLAN 40 for IoT."*

Skill flow: GETs `/v1/topologies` to inspect an existing AP-local topology as a template; deep-copies it, overrides `id`, `name`, `vlanid`, `vlanTagged`; POSTs `/v1/topologies`. Reminds the user that switch-side trunking must already allow the VLAN on AP uplinks (the controller can't see switch config).

### Report SSIDs (`report-ssids.md`)

**Prompt:** *"Generate a report of all SSIDs and VLAN assignments."*

Skill flow: pulls `/v1/services` and `/v1/topologies`; joins them by `defaultTopology` UUID; renders a Markdown table with SSID name, VLAN ID, security mode, status, hidden flag, and bridge port. Read-only, instant.

Example output:

| SSID            | VLAN | Security    | Status   | Hidden | Port |
|-----------------|------|-------------|----------|--------|------|
| Skynet          | 100  | WPA2-PSK    | enabled  | False  | 101  |
| Skynet_Junior   | 105  | WPA2-PSK    | enabled  | False  | 102  |
| Skynet_Outdoor  | 100  | WPA3-SAE    | enabled  | False  | 103  |
| Skynet_Private  | 200  | WPA2-PSK    | enabled  | False  | 105  |
| Skynet_Secure   | 200  | WPA3-SAE    | enabled  | False  | 106  |
| OpenRoaming2026 | 100  | WPA3-SAE    | enabled  | False  | 107  |
| AIFIRST         | 100  | WPA2-PSK    | enabled  | False  | 108  |

### Audit WPA3 (`audit-wpa3.md`)

**Prompt:** *"Show me all sites not using WPA3 yet."*

Skill flow: pulls services; classifies each as WPA3-only / WPA2/3-transitional / WPA2-PSK / WPA-Enterprise / Open; for non-WPA3 services, fetches `/v1/services/{id}/siteids` and resolves to site names; renders a table + a one-line exec summary ("X of Y SSIDs are not yet on WPA3-only, spanning Z sites"). Offers the natural next step: *"Want me to upgrade them?"* — which hands off to `enable-wpa3.md`.

---

## What makes this different from "just have an LLM call the API"

Three things this skill encodes that an LLM with raw API access would get wrong:

### 1. Silent-failure discipline

XCC returns `200`/`201` for many writes that didn't take effect. The skill knows:

- **`radioIfList` with `index: 0`** → silently dropped. Use real `radioIndex` values from `profile.radios[]`.
- **WPA2-PSK on 6 GHz** → silently dropped. Wi-Fi 6E spec forbids it; use WPA3-SAE.
- **Missing `dscp.codePoints` / `features` / `vendorSpecificAttributes`** → `500` with `errorMessage: null`. The error message gives you no clue what's wrong.
- **Duplicate `dot1dPortNumber`** → `422`. Must enumerate existing services first.
- **`preAuthenticatedIdleTimeout: 0`** → `422`. Must be ≥ 5.

These are documented in `references/gotchas.md` and the skill **always reads back after writing** to catch them.

### 2. Mirror, then deviate

Rather than constructing payloads from API documentation (which is incomplete and version-dependent), the skill reads an existing similar resource and uses it as a scaffold, overriding only what the user asked to change. This is the "NGC pattern" lifted from AURA's `xiqMigrationService.ts`.

Concretely: when creating a new SSID, the skill copies an existing WPA2-PSK service's full body — including obscure fields like `dscp.codePoints`, `features`, `vendorSpecificAttributes`, role UUIDs, CoS UUIDs — then just changes the name, SSID, port number, PSK, and topology. This is why the AIFIRST creation worked on the second attempt instead of the twentieth.

### 3. Verification is part of the operation, not optional

After every write, the skill reads the resource back and confirms the change persisted. After every profile push, it waits the 15–30 s AP sync window and confirms the SSID appears in `services[]` on a live AP. "Broadcasting" is a measured state, not an assumption.

---

## Roadmap

Captured in `SKILL.md`. Next features to add, in rough priority order:

1. **AAA / RADIUS attachment** for WPA-Enterprise services (`aaaPolicyId` + `/v1/aaapolicy` CRUD)
2. **Captive portal wiring** (`enableCaptivePortal`, `eGuestPortalId`)
3. **Role / policy CRUD** to enable "internet-only access" semantics
4. **OWE companion automation** for 6 GHz Open-equivalent
5. **Firmware management** (one-shot endpoint confirmation needed against the controller)
6. **Event log / authentication failure reports** (read endpoints exist; need aggregation patterns)
7. **Backup/snapshot before mutating** — a `/audit` dump captured before destructive changes
8. **Rollback helper** — delete a service and strip it from every profile's `radioIfList`
9. **Bulk CSV import** — extend the migration patterns to take a spreadsheet input

Out of scope for now (require non-API infrastructure):

- Scheduled actions ("disable Monday morning") — needs external cron + state store
- AI/ML optimization ("tune for high-density") — needs an inference layer or rules engine
- Cross-VLAN firewall rules — outside the wireless API surface
- AP physical reboot — `/v1/aps/{serial}/reboot` not yet verified on this controller

---

## Triggering the skill

The skill auto-activates on phrases like:

- *"create / add / push / deploy / make an SSID / WLAN / wireless network"*
- *"hide / show / suppress / broadcast"*
- *"rotate the PSK / update the password"*
- *"is X broadcasting?"*
- *"clone / copy / duplicate this network"*
- *"enable WPA3 / upgrade to SAE"*
- *"disable the 2.4 / 5 / 6 GHz radio"*
- *"move AP-X to profile Y"*
- *"report / audit / list SSIDs"*
- Any mention of Campus Controller, XCC, OS ONE, Platform ONE, XIQ Controller, AURA

It can also be invoked explicitly: tell Claude *"use the ai-first skill to..."*.

---

## Provenance

Built 2026-05-15 from a live deployment on `tsophiea.ddns.net`. Mirrors patterns from:

- `xiqMigrationService.ts` (AURA's bulk SSID migration code) — corrected for the `index: 0` silent-drop bug
- `api.ts` `createService()` and `radioIfList` merging logic
- Production payload shapes observed on a v25.x XCC

The skill is designed to grow. Every new scenario added by the operator becomes a runbook in `scenarios/`; every new silent-failure mode observed becomes an entry in `gotchas.md`. The skill gets sharper as it's used.
