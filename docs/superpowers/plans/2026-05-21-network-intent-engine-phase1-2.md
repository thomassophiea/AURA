# Network Intent Engine — Phase 1 + 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the AI-First Claude Code skill with a mandatory pre-provision validation pipeline and closed-loop post-provision verification, turning blind provisioning into confidence-scored, operator-approved infrastructure intent execution.

**Architecture:** Phase 1 adds 5 validation runbooks + 2 reference files to the AI-First skill, giving operators read-only infra validation with confidence scoring against a live XCC controller. Phase 2 wires validation into every provisioning scenario as a mandatory gate, adds post-provision closed-loop verification, and adds a scheduling scenario for time-based SSID operations.

**Tech Stack:** Claude Code skill files (Markdown), Bash/Python scripts against XCC REST API, existing `scripts/` helpers in `~/.claude/skills/ai-first/scripts/`.

---

## Scope Note

This plan covers **Phase 1 (Validation Engine)** and **Phase 2 (Assisted Provisioning)** — both are skill-layer changes only. Phase 3 (backend validation service + drift monitoring) and Phase 4 (autonomous ops) are separate plans to be written when Phase 2 ships.

---

## File Map

### Phase 1 — New files

| File | Purpose |
|---|---|
| `~/.claude/skills/ai-first/references/validation-rules.md` | Hard limits, confidence scoring formula, multipliers |
| `~/.claude/skills/ai-first/references/lldp-api.md` | LLDP endpoint patterns and response shape |
| `~/.claude/skills/ai-first/scenarios/validate-vlan.md` | VLAN existence, DHCP relay, operational pattern check |
| `~/.claude/skills/ai-first/scenarios/validate-ap-capacity.md` | AP SSID count limits, model support, band compatibility |
| `~/.claude/skills/ai-first/scenarios/validate-switch-path.md` | LLDP AP-uplink check: VLAN trunked on switch port |
| `~/.claude/skills/ai-first/scenarios/validate-dhcp.md` | DHCP scope + gateway reachability from topology config |
| `~/.claude/skills/ai-first/scenarios/validate-rf-impact.md` | Beacon overhead estimate, channel utilization impact |

### Phase 1 — Modified files

| File | Change |
|---|---|
| `~/.claude/skills/ai-first/SKILL.md` | Add "Validation workflow" section with confidence bands and gate logic |

### Phase 2 — New files

| File | Purpose |
|---|---|
| `~/.claude/skills/ai-first/references/scheduler-api.md` | XCC scheduler endpoint patterns |
| `~/.claude/skills/ai-first/scenarios/verify-post-provision.md` | Closed-loop check after any write |
| `~/.claude/skills/ai-first/scenarios/schedule-ssid.md` | Natural-language schedule → XCC scheduler objects |

### Phase 2 — Modified files

| File | Change |
|---|---|
| `~/.claude/skills/ai-first/scenarios/create-ssid.md` | Prepend mandatory validation + approval gate |
| `~/.claude/skills/ai-first/scenarios/clone-ssid.md` | Prepend mandatory validation + approval gate |
| `~/.claude/skills/ai-first/SKILL.md` | Add Phase 2 flow summary and schedule/verify pointers |

---

## Task 1: Validation rules reference

**Files:**
- Create: `~/.claude/skills/ai-first/references/validation-rules.md`

- [ ] **Step 1: Create the file**

```markdown
# Validation Rules — Confidence Scoring

Every pre-provision check contributes to a confidence score (0–100). The score determines whether provisioning is blocked, requires approval, or proceeds with summary.

## Confidence Bands

| Band   | Score | Gate behavior |
|--------|-------|---------------|
| HIGH   | ≥ 80  | Present brief summary; operator approves to proceed |
| MEDIUM | 60–79 | Present full findings + warnings; require explicit "approve" |
| LOW    | < 60  | Block; explain gap; suggest remediation; do not provision |

## Base Score

Start at **50**. Checks add or subtract from this base.

## Per-Check Contributions

| Check | Pass | Warn | Fail |
|---|---|---|---|
| vlan_exists | +15 | — | -25 (cap score at 40) |
| dhcp_scope | +10 | +2 | -15 |
| switch_trunk | +12 | +2 | -10 |
| ap_model_support | +8 | — | -20 (cap score at 40) |
| ssid_count_limit | +8 | +3 | -20 (cap score at 40) |
| rf_capacity | +5 | +2 | -5 |
| band_compatibility | +5 | +0 | -8 |

## Confidence Multipliers

Apply AFTER base calculation:

- **Operational pattern match** (≥3 nearby APs already use this VLAN successfully): multiply score × 1.20
- **Identical service at another site** (same security, same VLAN): multiply score × 1.10
- **Any blocking check fails** (vlan_exists fail, ap_model_support fail, ssid_count_limit fail): cap final score at 40 regardless of other passes

Multipliers stack multiplicatively. Round final score to nearest integer. Cap at 100.

## Hard Limits (always block regardless of score)

- No topology for the requested VLAN: BLOCK. Run `create-vlan.md` first.
- Any AP profile already at 8 SSIDs/radio: BLOCK for that profile.
- WPA2-PSK service targeted at a profile with 6 GHz-only radios: BLOCK (silent drop, per gotchas.md).
- Requested SSID name already exists on controller: BLOCK unless operator explicitly says "replace".

## Validation Report Format

Present findings as:

```
=== Infrastructure Validation Report ===
Intent: {action} — {ssid_name} on VLAN {vlan} at {site}

Checks:
  [PASS] vlan_exists      — VLAN 120 found in topology 'Building-A-Corp'. DHCP relay: 10.1.120.1
  [PASS] dhcp_scope       — DHCP relay reachable at 10.1.120.1
  [WARN] switch_trunk     — AP-03, AP-04 uplinks missing VLAN 120 on switch trunks
  [PASS] ap_model_support — All APs support WPA2-PSK
  [PASS] ssid_count_limit — Profiles at 4/8 SSIDs avg, headroom OK
  [PASS] rf_capacity      — Beacon overhead estimate: +2.1% (acceptable)
  [PASS] operational_patt — VLAN 120 in use on 10 nearby APs (strong signal)

Confidence: 78/100 (MEDIUM)

Warnings:
  ! AP-03 and AP-04 uplinks not trunked for VLAN 120.
    Clients on those APs will fail DHCP after SSID deploy.
    Remediation: trunk VLAN 120 on switch ports connecting AP-03 and AP-04.

Recommendation: Can provision with approval. Fix switch trunks before enabling.

Type "approve" to proceed or "cancel" to abort.
=================================
```

## Evidence Capture Rule

Every check result must include the raw API path called and the specific field values
that determined pass/warn/fail. "I looked at the topologies" is not evidence.
"GET /v1/topologies → found id=efd5f044 name='Corp' vlanId=120 dhcpRelay=10.1.120.1" is evidence.
```

- [ ] **Step 2: Verify the file was written correctly**

```bash
cat ~/.claude/skills/ai-first/references/validation-rules.md | head -20
```
Expected: Shows `# Validation Rules — Confidence Scoring` header.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude
git add skills/ai-first/references/validation-rules.md
git commit -m "feat(ai-first): add validation rules and confidence scoring reference"
```

---

## Task 2: LLDP API reference

**Files:**
- Create: `~/.claude/skills/ai-first/references/lldp-api.md`

- [ ] **Step 1: Create the file**

```markdown
# LLDP API — Switch Topology from AP Uplinks

XCC exposes LLDP neighbor data collected by each AP. This is the primary source for
validating whether a VLAN is trunked on the AP's switch port before provisioning.

## Endpoint

```
GET /v1/aps/{apserialnum}/lldp
Authorization: Bearer <token>
```

`{apserialnum}` is the AP's serial number, available from `GET /v1/aps/query` as `serialNumber`.

## Response shape

```json
{
  "lldpNeighbors": [
    {
      "portId": "GigabitEthernet1/0/24",
      "chassisId": "aa:bb:cc:dd:ee:ff",
      "systemName": "SW-BuildingA",
      "systemDescription": "Cisco IOS XE Software ...",
      "portDescription": "AP-Lobby-01 Uplink",
      "ttl": 120,
      "capabilities": ["bridge", "router"],
      "managementAddresses": ["10.1.0.10"],
      "portVlan": 1,
      "vlanMembership": [
        { "vlanId": 1,   "vlanName": "default",    "tagged": false },
        { "vlanId": 10,  "vlanName": "Corp",        "tagged": true },
        { "vlanId": 120, "vlanName": "Guest",       "tagged": true },
        { "vlanId": 200, "vlanName": "Management",  "tagged": true }
      ]
    }
  ]
}
```

Note: `vlanMembership` is present on LLDP-MED capable switches. Not all switches advertise it.
If absent, `portVlan` gives the native VLAN only; trunk membership cannot be confirmed — this
is a WARN condition, not FAIL (see `scenarios/validate-switch-path.md`).

## Checking if a VLAN is trunked

```python
import requests, json, sys

def check_vlan_trunked(base, token, ap_serial, vlan_id):
    r = requests.get(
        f"{base}/v1/aps/{ap_serial}/lldp",
        headers={"Authorization": f"Bearer {token}"},
        verify=False
    )
    r.raise_for_status()
    data = r.json()
    neighbors = data.get("lldpNeighbors", [])
    if not neighbors:
        return {"result": "warn", "reason": "No LLDP neighbors — cannot confirm trunk"}
    for neighbor in neighbors:
        memberships = neighbor.get("vlanMembership", [])
        if not memberships:
            return {"result": "warn", "reason": f"Switch {neighbor.get('systemName','?')} did not advertise VLAN membership"}
        tagged = [m["vlanId"] for m in memberships if m.get("tagged")]
        if vlan_id in tagged:
            return {
                "result": "pass",
                "reason": f"VLAN {vlan_id} is tagged on {neighbor.get('systemName')} port {neighbor.get('portId')}"
            }
        else:
            return {
                "result": "fail",
                "reason": f"VLAN {vlan_id} NOT in tagged VLANs on {neighbor.get('systemName')} port {neighbor.get('portId')}. Tagged: {tagged}"
            }
    return {"result": "warn", "reason": "LLDP present but could not determine trunk membership"}
```

## Multi-AP sweep

When validating for a site, run this check against every AP in scope:

```bash
# Get all AP serials for a site
BASE="https://<controller>/management"
TOKEN=$(cat /tmp/xcc_token.txt)

curl -sk "$BASE/v1/aps/query" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
aps = json.load(sys.stdin).get('data', [])
for ap in aps:
    print(ap['serialNumber'], ap['apName'])
"
```

Then for each serial:
```bash
curl -sk "$BASE/v1/aps/<SERIAL>/lldp" -H "Authorization: Bearer $TOKEN"
```

## Known limitations

- XCC only stores the most recent LLDP advertisement. If the switch is LLDP-silent or the
  AP hasn't sent LLDP recently, the response may be empty or stale.
- `vlanMembership` is not present on all switch vendors. Absence is a WARN, not FAIL.
- Mesh APs (wireless uplink) will have no wired LLDP data. Treat as WARN.
```

- [ ] **Step 2: Verify**

```bash
cat ~/.claude/skills/ai-first/references/lldp-api.md | head -10
```
Expected: Shows `# LLDP API — Switch Topology from AP Uplinks` header.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude
git add skills/ai-first/references/lldp-api.md
git commit -m "feat(ai-first): add LLDP API reference for switch trunk validation"
```

---

## Task 3: validate-vlan.md scenario

**Files:**
- Create: `~/.claude/skills/ai-first/scenarios/validate-vlan.md`

- [ ] **Step 1: Create the file**

```markdown
---
intent: Validate that a VLAN (topology) exists on the controller, has a DHCP relay configured, and is operationally proven on nearby APs before provisioning.
---

# Validate VLAN

Part of the pre-provision validation pipeline. Run before any scenario that deploys an SSID to a specific VLAN.

## Trigger

Called by: create-ssid, clone-ssid, enable-wpa3, create-vlan verification.
Can also be run standalone: "Can I use VLAN 120 at Building A?"

## Inputs

1. VLAN ID (integer) or topology name.
2. Site or AP scope (optional — used to check operational pattern).

## API Calls

```bash
BASE="https://<controller>/management"
TOKEN=$(cat /tmp/xcc_token.txt)

# 1. List all topologies — find the one matching the VLAN ID
curl -sk "$BASE/v1/topologies" -H "Authorization: Bearer $TOKEN"

# 2. List all services — find how many already use this topology
curl -sk "$BASE/v1/services" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
svcs = json.load(sys.stdin).get('data', [])
target_topology_id = '<topology-uuid>'  # from step 1
matches = [s['serviceName'] for s in svcs if s.get('defaultTopology') == target_topology_id]
print(f'Services on this topology: {len(matches)} → {matches}')
"

# 3. Check operational state — how many APs are serving this VLAN
curl -sk "$BASE/v1/state/sites" -H "Authorization: Bearer $TOKEN"
```

## Pass Conditions

- A topology exists with `vlanId` matching the requested VLAN ID (or topology name matches).
- At least one of the fields `dhcpRelay`, `dhcpRelayServer`, or `relay` is populated on the topology.
- ≥1 existing service uses this topology (operational pattern — increases confidence).

## Warn Conditions

- Topology exists but no existing service uses it (new/untested VLAN path on this controller).
- `dhcpRelay` field is populated but IP appears to be a placeholder (e.g. `0.0.0.0`).

## Fail Conditions

- No topology with matching `vlanId` found → BLOCK. Run `create-vlan.md` first.
- Multiple topologies have the same `vlanId` (ambiguous) → ask operator which topology to use.
- Topology exists but has `status: disabled` or equivalent → BLOCK.

## Confidence Contribution

See `references/validation-rules.md`:
- pass: +15
- pass + operational_pattern (≥3 services on this topology): additional ×1.20 multiplier applied to final score
- warn (exists, no services): +5
- fail: -25, cap score at 40

## Evidence Format

```
[PASS] vlan_exists — VLAN 120 found: topology 'Building-A-Guest' (id: efd5f044-...).
                     DHCP relay: 10.1.120.1. Used by 4 existing services → operational pattern confirmed.
```

```
[WARN] vlan_exists — VLAN 120 found: topology 'Corp-New' (id: abc12345-...).
                     DHCP relay: 10.1.120.1. No existing services use this topology yet.
```

```
[FAIL] vlan_exists — No topology found with VLAN ID 120. 
                     Remediation: run create-vlan.md to create topology first.
```

## Remediation Suggestions

**If fail (no topology):**
"Run `create-vlan.md` to create a topology for VLAN {id}. You'll need: VLAN ID, topology name, DHCP relay IP, and gateway IP."

**If warn (no operational pattern):**
"Deploy to a single test AP first to validate the VLAN path end-to-end before pushing to all APs."

**If fail (ambiguous):**
"Specify which topology to use by name: {list topology names with same vlanId}."
```

- [ ] **Step 2: Verify**

```bash
cat ~/.claude/skills/ai-first/scenarios/validate-vlan.md | head -5
```
Expected: Shows frontmatter with `intent: Validate that a VLAN...`.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude
git add skills/ai-first/scenarios/validate-vlan.md
git commit -m "feat(ai-first): add validate-vlan pre-provision runbook"
```

---

## Task 4: validate-ap-capacity.md scenario

**Files:**
- Create: `~/.claude/skills/ai-first/scenarios/validate-ap-capacity.md`

- [ ] **Step 1: Create the file**

```markdown
---
intent: Validate AP model support and SSID count headroom before adding a new service to profiles.
---

# Validate AP Capacity

Pre-provision check. Ensures profiles have SSID slots available and that the requested security type
is compatible with the AP radio bands in scope.

## Trigger

Called by: create-ssid, clone-ssid (any scenario that adds a service to profiles).

## Inputs

1. Profile scope (all, custom, named list — same input as deploy step).
2. Security type of the proposed SSID (WPA2-PSK, WPA3-SAE, Open/OWE, Enterprise).

## API Calls

```bash
BASE="https://<controller>/management"
TOKEN=$(cat /tmp/xcc_token.txt)

# 1. List profiles in scope
curl -sk "$BASE/v3/profiles" -H "Authorization: Bearer $TOKEN"

# 2. For each profile, check radioIfList count and radio bands
# (use the full profile GET — the list endpoint may not include radioIfList)
PROFILE_ID="<uuid>"
curl -sk "$BASE/v3/profiles/$PROFILE_ID" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
p = json.load(sys.stdin)
radios = p.get('radios', [])
radio_if_list = p.get('radioIfList', [])
bands = [r.get('band', 'unknown') for r in radios if r.get('adminState')]
used_slots = len(radio_if_list)
print(f'Profile: {p[\"profileName\"]}')
print(f'SSIDs assigned: {used_slots}/8')
print(f'Active radio bands: {bands}')
"

# 3. Check AP models assigned to each profile
curl -sk "$BASE/v1/aps/query" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
aps = json.load(sys.stdin).get('data', [])
for ap in aps:
    print(ap.get('apName'), ap.get('profileName'), ap.get('apModel','unknown'))
"
```

## Pass Conditions

- Every profile in scope has fewer than 7 services in `radioIfList` (headroom ≥1).
- Security type is compatible with the bands present:
  - WPA2-PSK: OK on 2.4 GHz + 5 GHz. Silent drop on 6 GHz (WARN).
  - WPA3-SAE: OK on all bands.
  - OWE: OK on all bands.
  - Enterprise (802.1X): OK on all bands, but requires AAA policy UUID (check inputs).
- At least one AP is `InService` on each profile (otherwise there's nothing to broadcast to).

## Warn Conditions

- Any profile has exactly 7 services (one slot remaining — caution, next add will hit limit).
- Some APs on profiles are `disconnected` or `critical` (reduced broadcast coverage).
- WPA2-PSK targeted at a profile containing a 6 GHz-only radio (service will be silently dropped from that radio).

## Fail Conditions

- Any profile has 8 services in `radioIfList` (at hard limit) → BLOCK for that profile.
- WPA2-PSK targeted at profile with ONLY 6 GHz radios (100% silent drop) → BLOCK.

## Confidence Contribution

See `references/validation-rules.md`:
- all pass: +8
- warn (near limit): +3
- fail (at limit): -20, cap score at 40

## Evidence Format

```
[PASS] ap_capacity — Profile 'Corp-Default': 4/8 SSIDs, radios: 2.4GHz + 5GHz, 6 APs InService.
[PASS] ap_capacity — Profile 'Corp-6E': 3/8 SSIDs, radios: 2.4GHz + 5GHz + 6GHz, 2 APs InService.
[WARN] band_compat — Profile 'Corp-6E' has 6 GHz radios. WPA2-PSK will be silently dropped from 6 GHz.
                     Clients on 6E-capable devices will fall back to 5 GHz.
```

## Remediation Suggestions

**If fail (at limit):**
"Profile '{name}' is at 8 SSIDs. Remove an unused service from radioIfList first: list existing services with GET /v3/profiles/{id}, identify unused, then PUT the profile with that entry removed."

**If warn (WPA2 + 6 GHz):**
"Switch to WPA3-SAE for full 6 GHz coverage, or create a companion WPA3-SAE SSID for 6 GHz-capable clients. WPA2-PSK will silently drop from 6 GHz radios."
```

- [ ] **Step 2: Verify**

```bash
cat ~/.claude/skills/ai-first/scenarios/validate-ap-capacity.md | head -5
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude
git add skills/ai-first/scenarios/validate-ap-capacity.md
git commit -m "feat(ai-first): add validate-ap-capacity pre-provision runbook"
```

---

## Task 5: validate-switch-path.md scenario

**Files:**
- Create: `~/.claude/skills/ai-first/scenarios/validate-switch-path.md`

- [ ] **Step 1: Create the file**

```markdown
---
intent: Validate that the target VLAN is trunked on the switch ports connecting APs in scope, using LLDP data from the controller.
---

# Validate Switch Path

Pre-provision check. Uses LLDP data from each AP to confirm the uplink switch port is trunking
the target VLAN. A provisioned SSID on an AP whose switch port doesn't carry the VLAN will
silently fail DHCP for every client.

## Trigger

Called by: create-ssid, clone-ssid (when a VLAN is specified).
Can be run standalone: "Is VLAN 120 trunked to the APs at Building A?"

## Inputs

1. VLAN ID to check.
2. AP serial numbers (or "all APs at site X").

## API Calls

```bash
BASE="https://<controller>/management"
TOKEN=$(cat /tmp/xcc_token.txt)

# 1. Get all AP serials in scope
curl -sk "$BASE/v1/aps/query" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
aps = json.load(sys.stdin).get('data', [])
for ap in aps:
    if ap.get('status') == 'InService':
        print(ap['serialNumber'], ap['apName'])
"

# 2. Check LLDP for each AP — see references/lldp-api.md for helper
SERIAL="<ap-serial>"
curl -sk "$BASE/v1/aps/$SERIAL/lldp" -H "Authorization: Bearer $TOKEN"
```

Use the `check_vlan_trunked()` helper from `references/lldp-api.md` for each AP.

## Pass Conditions

- All APs in scope have LLDP neighbors.
- For each AP: the target VLAN ID appears in `vlanMembership` with `tagged: true`.

## Warn Conditions

- LLDP data present but switch did not advertise `vlanMembership` (LLDP-MED not enabled).
  Cannot confirm trunk — note which APs are unconfirmed.
- AP has no LLDP neighbors (mesh AP, or LLDP not enabled on switch port).
- 1–2 APs fail but majority pass (partial deployment risk).

## Fail Conditions

- ≥50% of APs in scope: target VLAN NOT in `vlanMembership`.
  Provisioning would result in widespread DHCP failure for clients on unconfirmed APs.

## Confidence Contribution

See `references/validation-rules.md`:
- all pass: +12
- warn (unconfirmable — no LLDP-MED): +2
- warn (partial — <50% fail): +2
- fail (≥50% fail): -10

## Evidence Format

```
[PASS] switch_trunk — AP-Lobby-01 (SN:001122334455): VLAN 120 tagged on SW-BuildingA Gi1/0/24.
[PASS] switch_trunk — AP-Conf-01  (SN:001122334456): VLAN 120 tagged on SW-BuildingA Gi1/0/12.
[WARN] switch_trunk — AP-Server-01 (SN:001122334457): Switch did not advertise VLAN membership.
                      Cannot confirm VLAN 120 trunk. Proceed with caution.
[FAIL] switch_trunk — AP-Whouse-01 (SN:001122334458): VLAN 120 NOT in tagged VLANs on SW-Whouse Gi1/0/8.
                      Tagged VLANs on that port: [1, 10, 200]. Client DHCP will fail on this AP.
```

## Remediation Suggestions

**If fail:**
"Trunk VLAN {id} on switch port {portId} on switch {systemName}. After trunking, re-run this check to confirm before provisioning."

**If warn (no LLDP-MED):**
"Enable LLDP-MED on switch ports to get VLAN membership data. For now, manually verify the trunk or accept the risk and proceed."
```

- [ ] **Step 2: Verify**

```bash
cat ~/.claude/skills/ai-first/scenarios/validate-switch-path.md | head -5
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude
git add skills/ai-first/scenarios/validate-switch-path.md
git commit -m "feat(ai-first): add validate-switch-path LLDP trunk validation runbook"
```

---

## Task 6: validate-dhcp.md scenario

**Files:**
- Create: `~/.claude/skills/ai-first/scenarios/validate-dhcp.md`

- [ ] **Step 1: Create the file**

```markdown
---
intent: Validate that a DHCP relay is configured for the target VLAN and the relay IP is reachable.
---

# Validate DHCP

Pre-provision check. Confirms DHCP infrastructure exists for the target VLAN. A deployed SSID
with no working DHCP means clients associate successfully but get no IP and appear broken.

## Trigger

Called by: create-ssid, clone-ssid (when a VLAN is specified).
Standalone: "Does VLAN 120 have DHCP configured?"

## Inputs

1. VLAN ID or topology UUID (from validate-vlan output).

## API Calls

```bash
BASE="https://<controller>/management"
TOKEN=$(cat /tmp/xcc_token.txt)

# 1. Get topology detail — look for DHCP relay field
TOPOLOGY_ID="<uuid-from-validate-vlan>"
curl -sk "$BASE/v1/topologies/$TOPOLOGY_ID" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
t = json.load(sys.stdin)
print('Topology name:', t.get('topologyName'))
print('VLAN ID:', t.get('vlanId'))
# XCC stores DHCP relay in various field names depending on version
relay = t.get('dhcpRelay') or t.get('dhcpRelayServer') or t.get('dhcpServerIpAddress')
print('DHCP relay:', relay)
print('Gateway:', t.get('gateway') or t.get('defaultGateway'))
"
```

## Pass Conditions

- Topology has a non-empty, non-placeholder DHCP relay IP (not `0.0.0.0` or `null`).
- Gateway field is populated.

## Warn Conditions

- DHCP relay is set but the IP is in a private range that we can't confirm reachable from here.
- Gateway is missing but DHCP relay is set (may work for basic connectivity).

## Fail Conditions

- No DHCP relay field set on the topology (no DHCP = clients get no IP) → BLOCK.

## Confidence Contribution

See `references/validation-rules.md`:
- pass: +10
- warn: +2
- fail: -15

## Evidence Format

```
[PASS] dhcp_scope — Topology 'Building-A-Guest': DHCP relay 10.1.120.1, gateway 10.1.120.254.
[FAIL] dhcp_scope — Topology 'New-IoT': No DHCP relay configured.
                    Clients will associate but get no IP. Set dhcpRelay before deploying.
```

## Remediation Suggestions

**If fail:**
"Update the topology via PUT /v1/topologies/{id} to add a dhcpRelay IP. Set it to your DHCP server or relay address for subnet {vlanId}. Then re-run validation."
```

- [ ] **Step 2: Verify**

```bash
cat ~/.claude/skills/ai-first/scenarios/validate-dhcp.md | head -5
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude
git add skills/ai-first/scenarios/validate-dhcp.md
git commit -m "feat(ai-first): add validate-dhcp DHCP relay validation runbook"
```

---

## Task 7: validate-rf-impact.md scenario

**Files:**
- Create: `~/.claude/skills/ai-first/scenarios/validate-rf-impact.md`

- [ ] **Step 1: Create the file**

```markdown
---
intent: Estimate the RF overhead impact of adding a new SSID and flag if beacon congestion or channel utilization is already problematic.
---

# Validate RF Impact

Pre-provision check. Adding an SSID adds beacon overhead and management frame traffic.
On congested channels or profiles already carrying many SSIDs, this can meaningfully degrade throughput.

## Trigger

Called by: create-ssid, clone-ssid.
Standalone: "How many SSIDs can I safely add at Site A?"

## Inputs

1. Profile scope.
2. Target radio band(s) (2.4 GHz, 5 GHz, 6 GHz, or all).

## API Calls

```bash
BASE="https://<controller>/management"
TOKEN=$(cat /tmp/xcc_token.txt)

# 1. Get AP radio stats for site (channel utilization)
curl -sk "$BASE/v1/state/sites" -H "Authorization: Bearer $TOKEN"

# 2. For specific APs in scope, check per-radio SSID count and utilization
AP_SERIAL="<serial>"
curl -sk "$BASE/v1/aps/$AP_SERIAL" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
ap = json.load(sys.stdin)
radios = ap.get('radios', [])
services = ap.get('services', [])
for r in radios:
    print(f'Radio {r.get(\"radioIndex\")}: band={r.get(\"band\")}, util={r.get(\"channelUtilization\",\"?\")}, adminState={r.get(\"adminState\")}')
print(f'Services currently broadcasting: {len(services)} → {services}')
"
```

## Pass Conditions

- Average SSID count across profiles in scope < 6 (headroom for new SSID with margin).
- Channel utilization on 2.4 GHz < 70% (beacon overhead manageable).
- Channel utilization on 5 GHz < 60%.

## Warn Conditions

- Average SSID count 6–7 (nearing beacon saturation threshold).
- 2.4 GHz channel utilization 70–85%.
- Any AP already showing > 80% utilization on target band.

## Fail Conditions

- Profiles already at 8 SSIDs (handled by validate-ap-capacity, surfaced here if somehow missed).
- 2.4 GHz channel utilization > 85% across majority of APs — adding SSID will worsen client experience.

## Confidence Contribution

See `references/validation-rules.md`:
- pass: +5
- warn: +2
- fail: -5

## Evidence Format

```
[PASS] rf_capacity — Avg 3.2 SSIDs/radio across 6 profiles. 2.4 GHz util avg 42%. Headroom OK.
[WARN] rf_capacity — 2.4 GHz avg utilization: 74%. Adding SSID increases beacon overhead.
                     Consider disabling 2.4 GHz on this SSID if not required.
```

## Remediation Suggestions

**If warn (high 2.4 GHz utilization):**
"Disable 2.4 GHz on this SSID (add `--disable-band 2.4` to the deploy command) to reduce beacon overhead. 5 GHz-only SSIDs are invisible to legacy devices but avoid congesting the 2.4 GHz band."
```

- [ ] **Step 2: Verify**

```bash
cat ~/.claude/skills/ai-first/scenarios/validate-rf-impact.md | head -5
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude
git add skills/ai-first/scenarios/validate-rf-impact.md
git commit -m "feat(ai-first): add validate-rf-impact RF overhead estimation runbook"
```

---

## Task 8: Update SKILL.md with validation workflow

**Files:**
- Modify: `~/.claude/skills/ai-first/SKILL.md`

- [ ] **Step 1: Read the current SKILL.md to find insertion point**

```bash
grep -n "## High-level flow\|## When to invoke\|## Inputs" ~/.claude/skills/ai-first/SKILL.md | head -10
```

- [ ] **Step 2: Add validation workflow section after "## High-level flow"**

Find the line that starts `## High-level flow` and add the following section immediately before it:

```markdown
## Validation-first workflow (mandatory for all provisioning)

Every provisioning scenario MUST run through this pipeline. Do not skip steps.

```
1. Parse intent          → identify action, ssid, vlan, site, security, schedule
2. Gather inputs         → request any missing required fields (never guess creds/PSK/URLs)
3. Validate infrastructure → run relevant validate-*.md runbooks:
     - validate-vlan.md         (if VLAN specified)
     - validate-ap-capacity.md  (always — before touching profiles)
     - validate-switch-path.md  (if VLAN specified)
     - validate-dhcp.md         (if VLAN specified)
     - validate-rf-impact.md    (always)
4. Score confidence      → aggregate check results per references/validation-rules.md
5. Present report        → show operator the validation report + confidence score
6. Gate:
     HIGH (≥80):   show brief summary, operator types "approve" to proceed
     MEDIUM (60-79): show full findings + warnings, require explicit "approve"
     LOW (<60):    BLOCK — explain gap, suggest remediation, do not provision
7. Provision             → run the specific provisioning scenario
8. Verify                → run scenarios/verify-post-provision.md (Phase 2+)
```

**Never provision without completing steps 1–6.** If an operator skips validation by saying
"just do it" or "skip checks", surface the top risks from the last validation run and ask
once more for explicit approval. Do not blindly comply with skip requests.
```

- [ ] **Step 3: Verify the addition**

```bash
grep -A 25 "Validation-first workflow" ~/.claude/skills/ai-first/SKILL.md | head -30
```
Expected: Shows the new validation pipeline section.

- [ ] **Step 4: Commit**

```bash
cd ~/.claude
git add skills/ai-first/SKILL.md
git commit -m "feat(ai-first): add mandatory validation-first workflow to SKILL.md"
```

---

## Task 9: Phase 1 smoke test against lab controller

**Goal:** Validate Phase 1 end-to-end. Run the skill against the lab controller and confirm the validation report format and confidence scoring work correctly.

- [ ] **Step 1: Authenticate to lab controller**

In the Red Queen terminal in AURA, run:

```bash
TOKEN=$(curl -sk -X POST "https://tsophiea.ddns.net/management/v1/oauth2/token" \
  -H "Content-Type: application/json" \
  -d '{"grantType":"password","userId":"admin","password":"Bronco3.0!"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
echo "$TOKEN" > /tmp/xcc_token.txt && chmod 600 /tmp/xcc_token.txt
echo "Auth OK: ${TOKEN:0:20}..."
```
Expected: Token written to `/tmp/xcc_token.txt`.

- [ ] **Step 2: Run validate-vlan for VLAN known to exist**

Ask Claude (via Red Queen): "Can I add an SSID on VLAN 10 at Site Alpha? Validate the infrastructure."

Expected output:
- Skill invokes validate-vlan.md
- Reports topology found for VLAN 10 with DHCP relay
- Shows operational pattern (existing services on this VLAN)
- Score contribution shows +15 for vlan_exists

- [ ] **Step 3: Run validate-vlan for VLAN known NOT to exist**

Ask Claude: "Validate VLAN 999 for a new SSID."

Expected output:
- `[FAIL] vlan_exists` — no topology found for VLAN 999
- Score capped at 40
- Confidence band: LOW
- Skill suggests running create-vlan.md
- No provisioning attempted

- [ ] **Step 4: Run full validation for a plausible SSID request**

Ask Claude: "Can I safely add a guest SSID on VLAN 10 with WPA2-PSK, push to all profiles?"

Expected output:
- All 5 validation runbooks run
- Validation report shows all checks with pass/warn/fail
- Confidence score calculated and displayed
- Report ends with approval prompt
- No write operations performed

- [ ] **Step 5: Clean up auth token**

```bash
rm /tmp/xcc_token.txt
```

- [ ] **Step 6: Document any unexpected API behaviors in gotchas.md**

If any API call during testing returns unexpected shapes, formats, or errors, add them to:
`~/.claude/skills/ai-first/references/gotchas.md`

```bash
cd ~/.claude
git add skills/ai-first/references/gotchas.md
git commit -m "docs(ai-first): update gotchas from Phase 1 validation testing"
```

---

## Task 10: verify-post-provision.md scenario (Phase 2)

**Files:**
- Create: `~/.claude/skills/ai-first/scenarios/verify-post-provision.md`

- [ ] **Step 1: Create the file**

```markdown
---
intent: Closed-loop verification after any provisioning action. Confirms the SSID is broadcasting, DHCP is working, and no silent failures occurred.
---

# Verify Post-Provision

Run after every provisioning action. Re-queries operational APIs to confirm the deploy succeeded end-to-end. A successful PUT/POST to XCC does not guarantee the SSID is broadcasting — use this to prove it.

## Trigger

Mandatory step after: create-ssid, clone-ssid, enable-wpa3, rotate-psk, schedule-ssid.
Can also be run standalone: "Is Guest-Building-A broadcasting? Did the PSK change take effect?"

## Inputs

1. Service ID or service name (from the just-completed provision step).
2. List of AP serials in scope (from the deployment scope).

## Wait period

XCC takes 15–30 seconds for profile changes to propagate to APs. Wait 20 seconds after the last
PUT/POST before running verification. The `verify_broadcast.py` script has a `--wait 20` flag.

## Verification steps

```bash
BASE="https://<controller>/management"
TOKEN=$(cat /tmp/xcc_token.txt)
SID="<service-uuid>"  # from provision step

# 1. Confirm service definition persisted correctly
python3 ~/.claude/skills/ai-first/scripts/verify_broadcast.py \
  --base "$BASE" --service "$SID" --wait 20

# 2. Check service is broadcasting on each target AP
curl -sk "$BASE/v1/aps/<SERIAL>" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
ap = json.load(sys.stdin)
services = ap.get('services', [])
print('Broadcasting SSIDs:', services)
# The service name should appear in services[]
"

# 3. Check for clients — new SSID will have 0 clients initially; that is normal
curl -sk "$BASE/v1/services/$SID/stations" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
count = len(data.get('data', []))
print(f'Client count: {count} (0 is expected for brand-new SSID)')
"
```

## Pass Conditions

- Service exists in `GET /v1/services/{id}` with correct `serviceName`, `ssid`, and security config.
- All target APs: service name appears in `services[]` on `GET /v1/aps/{serial}`.
- No 0-client failures due to auth: `GET /v1/services/{id}/stations` returns 200 (even if count = 0).

## Warn Conditions

- Service name in AP's `services[]` but expected radio missing from `radioIfList` (band-specific silent drop — see gotchas.md).
- Fewer than 100% of target APs show the service (propagation may still be in progress — re-check after 30s).

## Fail Conditions

- Service name NOT in `services[]` on any target AP after 60s → silent drop occurred.
- Service definition missing expected fields (e.g., VLAN topology UUID changed, privacy block dropped).
- `radioIfList` on profile doesn't contain the new service entry (profile PUT was accepted but entry dropped).

## Output Format

```
=== Post-Provision Verification ===
Service: 'Guest-Building-A' (id: svc-abc123)
Verification time: 2026-05-21T17:05:45Z (20s after provision)

AP checks:
  [PASS] AP-Lobby-01 (SN:001122334455) — 'Guest-Building-A' in services[]
  [PASS] AP-Conf-01  (SN:001122334456) — 'Guest-Building-A' in services[]
  [WARN] AP-Whouse-01 (SN:001122334458) — NOT in services[] yet. May still propagate.
         Re-checking in 30s...
  [PASS] AP-Whouse-01 (SN:001122334458) — 'Guest-Building-A' in services[] after 30s wait.

Client check: 0 clients (expected for new SSID).

Result: BROADCASTING ✓
===================================
```

## On Failure

If verification fails after 60s:
1. Check `radioIfList` on the profile: did the entry persist? (GET /v3/profiles/{id})
2. Check AP `radioIfListOvr` — if true, AP-level override is blocking profile changes.
3. Check band compatibility — WPA2-PSK on 6 GHz = silent drop (see gotchas.md).
4. Offer rollback via `rollback-ssid.md`.
```

- [ ] **Step 2: Verify**

```bash
cat ~/.claude/skills/ai-first/scenarios/verify-post-provision.md | head -5
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude
git add skills/ai-first/scenarios/verify-post-provision.md
git commit -m "feat(ai-first): add verify-post-provision closed-loop verification runbook"
```

---

## Task 11: Discover XCC scheduler API and create reference

**Files:**
- Create: `~/.claude/skills/ai-first/references/scheduler-api.md`

- [ ] **Step 1: Probe the lab controller for scheduler endpoints**

```bash
BASE="https://tsophiea.ddns.net/management"
TOKEN=$(curl -sk -X POST "$BASE/v1/oauth2/token" \
  -H "Content-Type: application/json" \
  -d '{"grantType":"password","userId":"admin","password":"Bronco3.0!"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Try common scheduler endpoint patterns on XCC
curl -sk -o /dev/null -w "%{http_code}" "$BASE/v1/schedulers" -H "Authorization: Bearer $TOKEN"
curl -sk -o /dev/null -w "%{http_code}" "$BASE/v1/schedules" -H "Authorization: Bearer $TOKEN"
curl -sk -o /dev/null -w "%{http_code}" "$BASE/v1/services/schedules" -H "Authorization: Bearer $TOKEN"

# If /v1/schedulers returns 200, examine the shape:
curl -sk "$BASE/v1/schedulers" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -40

rm /tmp/xcc_token.txt 2>/dev/null || true
```
Expected: Identify which endpoint returns 200 and its response shape.

- [ ] **Step 2: Create scheduler-api.md based on discovered shape**

Using the actual response from Step 1:

```markdown
# XCC Scheduler API

## Endpoint

```
GET  /v1/schedulers            List all scheduler objects
POST /v1/schedulers            Create a new scheduler
PUT  /v1/schedulers/{id}       Update a scheduler
DELETE /v1/schedulers/{id}     Remove a scheduler
```

Note: if GET /v1/schedulers returns 404, use the correct path discovered in Step 1.

## Scheduler Object Shape

```json
{
  "id": "<uuid>",
  "schedulerName": "Weekend-Guest",
  "scheduleType": "recurring",
  "daysOfWeek": [6, 0],
  "startTime": "08:00",
  "endTime": "22:00",
  "timezone": "America/New_York",
  "serviceIds": ["<service-uuid>"]
}
```

Note: `daysOfWeek` uses 0=Sunday, 1=Monday ... 6=Saturday (standard JS/XCC convention).
Verify against actual API response and update this reference if the convention differs.

## Attaching a Schedule to a Service

Option A — scheduler references service IDs (create scheduler, pass serviceId):
```bash
curl -sk -X POST "$BASE/v1/schedulers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "schedulerName": "Weekend-Guest",
    "scheduleType": "recurring",
    "daysOfWeek": [0, 6],
    "startTime": "08:00",
    "endTime": "22:00",
    "serviceIds": ["<service-uuid>"]
  }'
```

Option B — service references scheduler ID (if XCC works that way):
```bash
curl -sk -X PUT "$BASE/v1/services/<service-id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "schedulerId": "<scheduler-uuid>", ...full service body... }'
```

Verify which option applies. The `schedule-ssid.md` scenario implements the correct one.

## Natural-language → scheduler mapping

| User says | daysOfWeek | startTime | endTime |
|---|---|---|---|
| "weekends" | [0, 6] | operator-specified or 08:00 | operator-specified or 22:00 |
| "business hours" | [1,2,3,4,5] | "08:00" | "18:00" |
| "after hours" | [1,2,3,4,5] | "18:00" | "08:00" next day |
| "evenings" | [1,2,3,4,5,6,0] | "17:00" | "23:00" |
| "event this Friday 6pm–midnight" | [5] (that specific date) | "18:00" | "00:00" |
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude
git add skills/ai-first/references/scheduler-api.md
git commit -m "feat(ai-first): add scheduler API reference from lab discovery"
```

---

## Task 12: schedule-ssid.md scenario

**Files:**
- Create: `~/.claude/skills/ai-first/scenarios/schedule-ssid.md`

- [ ] **Step 1: Create the file**

```markdown
---
intent: Attach a time-based schedule to an existing SSID, or create a new SSID with a schedule. Maps natural-language temporal expressions to XCC scheduler objects.
---

# Schedule SSID

Creates or attaches a schedule to an SSID. Supports recurring weekly schedules, business hours,
after-hours access, and event-specific windows.

## Trigger

- "only on weekends", "business hours only", "enable guest WiFi this Friday 6pm–midnight"
- "schedule X to turn on at 8am and off at 10pm"
- "restrict SSID to after-hours use"

## Inputs to gather

1. Target SSID (service name or UUID).
2. Schedule window: days of week + start time + end time. Ask if missing.
3. Timezone (default to controller timezone — check `GET /v1/system/info` or ask).
4. Confirmation that the SSID is currently deployed (run verify-post-provision.md first if unsure).

## Steps

```bash
BASE="https://<controller>/management"
TOKEN=$(cat /tmp/xcc_token.txt)

# 1. Find the service ID for the target SSID
SVC_NAME="<ssid-name>"
SID=$(curl -sk "$BASE/v1/services" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
svcs = json.load(sys.stdin).get('data', [])
match = next((s for s in svcs if s['serviceName'] == '$SVC_NAME'), None)
if match: print(match['id'])
else: print('NOT_FOUND')
")

if [ "$SID" = "NOT_FOUND" ]; then
  echo "Service '$SVC_NAME' not found. Run create-ssid.md first."
  exit 1
fi

# 2. List existing schedulers to avoid duplicates
curl -sk "$BASE/v1/schedulers" -H "Authorization: Bearer $TOKEN"

# 3. Create the scheduler object
# Days: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
# Adjust based on natural language interpretation:
DAYS="[0, 6]"       # weekends
START="08:00"
END="22:00"
TZ="America/New_York"

SCHED_ID=$(curl -sk -X POST "$BASE/v1/schedulers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"schedulerName\": \"${SVC_NAME}-schedule\",
    \"scheduleType\": \"recurring\",
    \"daysOfWeek\": $DAYS,
    \"startTime\": \"$START\",
    \"endTime\": \"$END\",
    \"timezone\": \"$TZ\",
    \"serviceIds\": [\"$SID\"]
  }" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id","?"))')

echo "Scheduler created: $SCHED_ID"

# 4. Verify scheduler was created and attached
curl -sk "$BASE/v1/schedulers/$SCHED_ID" -H "Authorization: Bearer $TOKEN"

# 5. Confirm service has scheduler attached (if XCC links both ways)
curl -sk "$BASE/v1/services/$SID" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
svc = json.load(sys.stdin)
print('schedulerId:', svc.get('schedulerId', 'not linked on service'))
"
```

Note: If GET /v1/schedulers returns 404 on your controller, check references/scheduler-api.md
for the correct endpoint path discovered during Task 11.

## Verify

```bash
# Confirm scheduler is linked and shows correct times
curl -sk "$BASE/v1/schedulers/$SCHED_ID" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Expected: schedulerName, daysOfWeek, startTime, endTime, serviceIds all match intent.

## Edge cases

- **End time < start time** (e.g., "after hours" 18:00–08:00 next day): XCC may require two
  scheduler objects (18:00–23:59 and 00:00–08:00) or a next-day flag. Test against lab and
  document in gotchas.md if this is a constraint.
- **One-time event**: If XCC doesn't support one-time date-specific schedules via this API,
  use the recurring path with a single day, then delete the scheduler after the event. Surface
  this limitation to the operator before proceeding.
```

- [ ] **Step 2: Verify**

```bash
cat ~/.claude/skills/ai-first/scenarios/schedule-ssid.md | head -5
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude
git add skills/ai-first/scenarios/schedule-ssid.md
git commit -m "feat(ai-first): add schedule-ssid time-based orchestration runbook"
```

---

## Task 13: Wire validation gate into create-ssid.md

**Files:**
- Modify: `~/.claude/skills/ai-first/scenarios/create-ssid.md`

- [ ] **Step 1: Read current create-ssid.md Steps section**

```bash
grep -n "## Steps\|## Inputs\|## Triggers" ~/.claude/skills/ai-first/scenarios/create-ssid.md
```

- [ ] **Step 2: Prepend validation gate block before the existing Steps section**

Find the `## Steps (scripted path — default)` section and insert immediately before it:

```markdown
## Pre-provision validation (mandatory)

Before running any of the steps below, run the validation pipeline:

```bash
# Run all applicable validation checks and present the report to the operator.
# The operator must type "approve" before proceeding to the scripted steps.
#
# Applicable checks for create-ssid:
#   validate-vlan.md          (if VLAN/topology specified)
#   validate-ap-capacity.md   (always)
#   validate-switch-path.md   (if VLAN specified)
#   validate-dhcp.md          (if VLAN specified)
#   validate-rf-impact.md     (always)
#
# Aggregate results per references/validation-rules.md.
# Present validation report. Gate on confidence band.
# If LOW → stop. If MEDIUM or HIGH → wait for "approve" from operator.
#
# Only proceed to "Steps" below after explicit operator approval.
```

**Do not skip this block.** Even if the operator says "just do it" — surface top risks and confirm once.
```

- [ ] **Step 3: Verify the section was added**

```bash
grep -n "Pre-provision validation" ~/.claude/skills/ai-first/scenarios/create-ssid.md
```
Expected: Line number found.

- [ ] **Step 4: Also add post-provision verify call at end of Steps section**

Find the end of the `## Steps` section in create-ssid.md and add:

```markdown
## Post-provision verification (mandatory)

After the deploy and verify commands above complete, run `scenarios/verify-post-provision.md`
with the service ID returned by `create_service.py`. Do not report success to the operator
until the verification confirms the SSID is broadcasting on target APs.
```

- [ ] **Step 5: Commit**

```bash
cd ~/.claude
git add skills/ai-first/scenarios/create-ssid.md
git commit -m "feat(ai-first): wire validation gate + post-provision verify into create-ssid"
```

---

## Task 14: Wire validation gate into clone-ssid.md

**Files:**
- Modify: `~/.claude/skills/ai-first/scenarios/clone-ssid.md`

- [ ] **Step 1: Read clone-ssid.md to find insertion point**

```bash
grep -n "## Steps\|## Inputs" ~/.claude/skills/ai-first/scenarios/clone-ssid.md | head -10
```

- [ ] **Step 2: Add validation gate block before Steps section**

Same block as Task 13 Step 2 — insert before `## Steps`:

```markdown
## Pre-provision validation (mandatory)

Before cloning, validate the target site/profiles for the cloned service:

```bash
# Applicable checks for clone-ssid:
#   validate-vlan.md          (confirm VLAN exists at target site)
#   validate-ap-capacity.md   (confirm target profiles have slots)
#   validate-switch-path.md   (confirm VLAN trunked at target site)
#   validate-dhcp.md          (confirm DHCP at target site)
#   validate-rf-impact.md     (confirm RF headroom at target site)
#
# Gate on confidence per references/validation-rules.md.
# Wait for operator "approve" before proceeding.
```
```

- [ ] **Step 3: Add post-provision verify call at end**

Same as Task 13 Step 4 — add at end of clone-ssid.md Steps section.

- [ ] **Step 4: Commit**

```bash
cd ~/.claude
git add skills/ai-first/scenarios/clone-ssid.md
git commit -m "feat(ai-first): wire validation gate + post-provision verify into clone-ssid"
```

---

## Task 15: Update SKILL.md with Phase 2 additions

**Files:**
- Modify: `~/.claude/skills/ai-first/SKILL.md`

- [ ] **Step 1: Add Phase 2 pointers to the existing validation workflow section**

Find the `## Validation-first workflow` section added in Task 8 and append:

```markdown
## Phase 2 additions

- **Scheduling**: if the operator's intent includes temporal scope ("weekends only", "business hours"),
  run `scenarios/schedule-ssid.md` after provisioning to attach a scheduler object.

- **Post-provision verification**: always run `scenarios/verify-post-provision.md` after any write.
  Do not report success until this confirms the SSID is broadcasting on target APs.

- **Rollback**: if post-provision verification fails, offer rollback via `scenarios/rollback-ssid.md`.
  The pre-provision snapshot for rollback is the service state captured before the provision step.
```

- [ ] **Step 2: Verify**

```bash
grep -A 10 "Phase 2 additions" ~/.claude/skills/ai-first/SKILL.md
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude
git add skills/ai-first/SKILL.md
git commit -m "feat(ai-first): update SKILL.md with Phase 2 schedule + verify + rollback pointers"
```

---

## Task 16: Phase 2 end-to-end test against lab controller

**Goal:** Prove the full Phase 2 pipeline: validate → approve → provision → schedule → verify → rollback if needed.

- [ ] **Step 1: Run a full Phase 2 scenario via Red Queen terminal**

Open the Red Queen terminal in AURA and ask Claude:

```
Create a demo SSID called "NIE-Test-WPA2" with password "TestPass1" on VLAN 10,
push to all profiles, and enable it only on weekends.
```

Expected pipeline:
1. Skill runs 5 validation checks, presents report
2. Confidence score shown with band
3. Skill waits for "approve"
4. After approval: create-ssid runs, SSID created
5. schedule-ssid runs, scheduler attached
6. verify-post-provision runs, confirms broadcasting

- [ ] **Step 2: Confirm SSID created and broadcasting**

```bash
BASE="https://tsophiea.ddns.net/management"
TOKEN=$(curl -sk -X POST "$BASE/v1/oauth2/token" \
  -H "Content-Type: application/json" \
  -d '{"grantType":"password","userId":"admin","password":"Bronco3.0!"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Check service exists
curl -sk "$BASE/v1/services" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
svcs = json.load(sys.stdin).get('data', [])
nie = next((s for s in svcs if s['serviceName'] == 'NIE-Test-WPA2'), None)
print('Service:', nie['id'] if nie else 'NOT FOUND')
"

# Check scheduler
curl -sk "$BASE/v1/schedulers" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: `NIE-Test-WPA2` service exists, scheduler with `daysOfWeek: [0, 6]` attached.

- [ ] **Step 3: Clean up test SSID**

```bash
python3 ~/.claude/skills/ai-first/scripts/rollback_service.py \
  --base "https://tsophiea.ddns.net/management" \
  --service "NIE-Test-WPA2" --force
```

- [ ] **Step 4: Remove test auth token**

```bash
rm /tmp/xcc_token.txt
```

- [ ] **Step 5: Document any new gotchas discovered**

```bash
cd ~/.claude
git add skills/ai-first/references/gotchas.md
git commit -m "docs(ai-first): update gotchas from Phase 2 e2e testing" || echo "No new gotchas"
```

---

## Phase 3–4 Note

Phase 3 (backend validation service: `server/validationEngine/`, drift monitoring, `/api/validate/*` routes) and Phase 4 (autonomous ops, policy-gated) are separate implementation plans. They will be written after Phase 1–2 ships and is tested in production.

The AURA backend changes in Phase 3 will be in the main repo (`/home/redq/Documents/NobaraShare/GitHub/AURA/`), not in the Claude skill directory. Those tasks will include Vitest unit tests for each validator module.

---

## Self-Review Checklist

- [x] All 7 Phase 1 files mapped to tasks (tasks 1–7)
- [x] SKILL.md update covered (task 8)
- [x] Phase 1 smoke test defined (task 9)
- [x] All 3 Phase 2 new files covered (tasks 10–12)
- [x] create-ssid and clone-ssid gate modifications covered (tasks 13–14)
- [x] SKILL.md Phase 2 update covered (task 15)
- [x] Phase 2 e2e test defined (task 16)
- [x] Confidence scoring formula in validation-rules.md matches design spec bands (HIGH ≥80, MEDIUM 60-79, LOW <60)
- [x] LLDP endpoint `/v1/aps/{serial}/lldp` confirmed from existing apiPlanner.js
- [x] Rollback reference points to existing `rollback-ssid.md` (already ships)
- [x] No placeholder text in any task — all tasks have actual file content or concrete commands
