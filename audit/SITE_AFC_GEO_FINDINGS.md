# Site Configuration + AFC + Geo-Diagnostics — Controller Schema Audit

**Controller:** `https://192.168.100.12:5825/management` · OS ONE 10.18.02 · probed 2026-07-28
Source of truth for the Site editor (all tabs), the AFC view, and Geo Diagnostics
in **both** AURA and the claude.ai/design (Extreme EDS) project.

## Sites — `GET /v3/sites` (NOTE: v3, not v1; `/v1/sites` 404s)

3 real sites: `PrimarySite`, `AFC LAB`, `CLONE`. One record = one site editor. Keys → tabs:

| Controller tab | Site record field(s) |
|---|---|
| Header (Name/Country/Timezone) | `siteName`, `country`, `timezone` |
| Device Groups | `deviceGroups[]` (`groupName`, `apSerialNumbers`, `profileId`, `roleIDs`, `serviceIDs`, `topologyIDs`, `radioAssignment`, `rfMgmtPolicyId`, `wiredInterfaceAssignment`, `enableDpi`, `loadBalanceBandPreferenceEnabled`, `minimumBaseRate2_4/5`, `aggregateMpdu2_4/5`, `stbcEnabled2_4/5`, `txbfEnabled2_4/5`) |
| Floor Plans / Location | `treeNode` (`country`, `region`, `campus`, `city`, `typeOfPlace`, `mapCoordinates` = "lat,lon") |
| Access Points → **AFC** | site `afcUpdate` {hour,minute} (AFC update schedule) + `apRanging` (bool, FTM ranging) + per-AP fields below |
| Access Points → **Geo Diagnostics** | per-floor FTM ranging rollup (runtime — see caveat) |
| Switches | `switchSerialNumbers[]` |
| Allow List / Deny List | `macAcl`, `protectedAcl` |
| Advanced | `snmpConfig`, `stpEnabled`, `distributed`, `preferredAffinity`, `aaaPolicyId`, `contact`, `siteManagerName`, `siteManagerEmail`, `postalCode` |

## AFC per-AP config — `GET /v1/aps/{serial}`

Maps to the AFC grid columns in the controller UI (Image 3):

| AFC grid column | Config field | Notes |
|---|---|---|
| Name / Model | `apName` / `hardwareType` | |
| Radio Index | `radios[].radioIndex` (6 GHz = 3) | |
| Anchor Type | `gpsAnchor` (bool) → "GPS" | + `gpsAntennaDistance` |
| Geo Location | `ftm.wgs84` {lat,lon,alt}, `ftm.zSubelement.floorNumber` | |
| Power Mode | `radios[].pwrMode6` (LPI / SP_WITH_LPI_FALLBACK) | "SP" = standard power |
| Channel | `radios[].opChannel` (e.g. `49e`) | |
| Fallback Channel | `radios[].fallbackChannels` | |
| Power / Req Power | `radios[].txPower` / `txMaxPower` (e.g. 9 / 17) | gap = AFC cap |
| Floor Name | `ftm.zSubelement.floorNumber` → floor label | |
| AFC (enabled) | `radios[].afc` (bool) | |

## ⚠️ Runtime AFC/Geo status is NOT in the config REST API

The controller UI's AFC donuts (GEO LOCATION / AFC STATUS / SP RADIO OPERATIONAL
STATUS) and grid columns **AFC Status** ("AFC Available"), **Expire** ("Jul 29"),
**Subgraph**, **FTM Ranging** counts, and Geo-Diagnostics rows (Last Location Update,
Anchor APs, FTM Ranging APs, Subgraph Complete/Incomplete) are **live telemetry**.
Every candidate endpoint (`/v1/afc*`, `/v3/sites/{id}/afc`, `/geodiagnostics`,
`/ftm`, `/floors`) returns **404**. There is no config-API source for them.

**Build rule:** render the full AFC/Geo **config** truthfully; derive an AFC
*eligibility* signal from config (`afc==true && gpsAnchor && pwrMode6` is SP → SP-eligible),
and label live status/expiry/subgraph as "runtime — not exposed by controller config API"
instead of inventing values.
