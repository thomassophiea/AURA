# Campus Controller Configuration Endpoint Inventory

**Generated:** 2026-04-03  
**Source of truth:** `public/swagger.json` (OpenAPI 3.0.0, version 1.25.1)  
**API title:** Extreme Campus Controller REST API Gateway  
**Proxy prefix:** All Campus Controller calls route through `/api/management` via Express  
**Total swagger paths:** 243  
**Total schemas:** 390  

---

## Coverage Summary

| Domain | Swagger Paths | Implemented in api.ts | Gap |
|---|---|---|---|
| WLAN/Services (SSID) | 13 | 9 | 4 |
| Network/Topology (VLAN/DHCP) | 6 | 4 | 2 |
| Policy/Roles | 13 | 9 | 4 |
| AAA/RADIUS | 7 | 5 | 2 |
| AP/Profile configuration | 55 | 22 | 33 |
| RF Management | 7 | 6 | 1 |
| IoT | 7 | 6 | 1 |
| Air Defense (ADSP) | 14 | 8 | 6 |
| Analytics | 7 | 6 | 1 |
| Positioning | 7 | 6 | 1 |
| Meshpoints | 12 | 9 | 3 |
| XLocation | 7 | 6 | 1 |
| RTLS | 7 | 5 | 2 |
| CoS (QoS marking) | 7 | 5 | 2 |
| Rate Limiters | 7 | 5 | 2 |
| DPI Signatures | 3 | 2 | 1 |
| Guest Portal (EGuest) | 7 | 6 | 1 |
| Sites | 20 | 10 | 10 |
| Switches | 26 | 9 | 17 |
| Switch Port Profiles | 7 | 6 | 1 |
| System/Global | 14 | 11 | 3 |
| Access Control (MAC lists) | 4 | 4 | 0 |
| State/Monitoring | 8 | 6 | 2 |
| Reports | 20 | 12 | 8 |
| Stations/Clients | 11 | 8 | 3 |
| SNMP | 2 | 2 | 0 |

---

## 1. WLAN/Service Configuration (SSID, Captive Portal)

These endpoints configure wireless services (SSIDs). The `ServiceElement` schema is the main WLAN configuration object.

### ServiceElement Key Fields
- `ssid` — broadcast SSID name
- `captivePortalType` — captive portal mode (EXTERNAL, INTERNAL, NONE, etc.)
- `eGuestPortalId` — linked EGuest portal ID
- `privacy` — security settings (WPA2-PSK, WPA3, WPA-Enterprise, Open)
- `defaultTopology` — VLAN assignment (topology ID)
- `defaultCoS` — class of service policy ID
- `aaaPolicyId` — RADIUS/AAA policy to apply
- `authenticatedUserDefaultRoleID` / `unAuthenticatedUserDefaultRoleID` — role assignments
- `hotspot` / `hotspot20` — Passpoint/Hotspot 2.0 settings
- `roamingAssistPolicy` — 802.11k/r roaming settings
- `enabledSchedule` — time-based WLAN enable/disable
- `suppressSsid` — hidden SSID toggle

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v1/services` | List all WLAN services | Implemented |
| POST | `/v1/services` | Create a new WLAN service | Implemented |
| GET | `/v1/services/default` | Get service defaults | NOT implemented |
| GET | `/v1/services/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v1/services/{serviceId}` | Get service by ID | Implemented |
| PUT | `/v1/services/{serviceId}` | Update a service | Implemented |
| DELETE | `/v1/services/{serviceId}` | Delete a service | Implemented |
| GET | `/v1/services/{serviceId}/siteids` | Sites using this service | NOT implemented |
| GET | `/v1/services/{serviceId}/deviceids` | APs serving this SSID | NOT implemented |
| GET | `/v1/services/{serviceId}/stations` | Active clients on this SSID | NOT implemented |
| GET | `/v1/services/{serviceid}/bssid0` | Profiles/APs using as primary BSSID | NOT implemented |
| GET | `/v1/services/{serviceId}/report` | SSID analytics report | NOT implemented |
| GET | `/v1/report/services/{serviceId}` | Alternative report endpoint (v1 path) | Implemented |

**Note:** WLAN security (PSK, WPA Enterprise, SAE) is embedded inside the `privacy` object of `ServiceElement`. No separate `/wlan` or `/ssid` path exists — services are the WLAN objects.

---

## 2. Network Configuration (VLAN, DHCP, Subnet)

Topologies are the network segments. Each topology is a VLAN with optional DHCP server, gateway, and bridge settings.

### TopologyElement Key Fields
- `vlanid` — 802.1Q VLAN ID
- `tagged` — tagged or untagged VLAN
- `mode` — bridge mode (Bridged at AP, Bridged at Controller, etc.)
- `ipAddress` / `cidr` / `gateway` — L3 subnet when `l3Presence` is true
- `dhcpMode` — DHCP mode (LOCAL, RELAY, NONE)
- `dhcpStartIpRange` / `dhcpEndIpRange` — DHCP pool
- `dhcpDnsServers` / `dhcpDomain` / `dhcpDefaultLease` / `dhcpMaxLease`
- `dhcpExclusions` — excluded IP ranges
- `dhcpServers` — DHCP relay server address
- `multicastFilters` / `multicastBridging`
- `vni` / `remoteVtepIp` — VXLAN tunnel parameters
- `cert` / `certCa` — certificate IDs for secure tunneling
- `proxied` — SecureConnect/tunnel proxy settings
- `profiles` — AP profiles that include this topology

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v1/topologies` | List all topologies (v1) | Implemented |
| POST | `/v1/topologies` | Create a topology | Implemented |
| GET | `/v1/topologies/default` | Get topology defaults | NOT implemented |
| GET | `/v1/topologies/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v1/topologies/{topologyId}` | Get topology by ID | Implemented |
| PUT | `/v1/topologies/{topologyId}` | Update a topology | Implemented |
| DELETE | `/v1/topologies/{topologyId}` | Delete a topology | Implemented |
| GET | `/v3/topologies` | List all topologies (v3, supports `?modes=` filter) | Implemented |

**Note:** There is no standalone VLAN or DHCP endpoint. VLAN and DHCP configuration is done through the topology object. The v3 endpoint adds a `modes` query parameter for filtering by topology type.

---

## 3. Policy Configuration (Roles, Rules, Firewall, ACLs)

### RoleElement Key Fields
- `l2Filters` — MAC address / Ethertype filters
- `l3Filters` — IP subnet / port / protocol rules (firewall ACLs)
- `l7Filters` — application-layer (DPI-based) filters
- `defaultAction` — PERMIT or DENY for unmatched traffic
- `topology` — VLAN/topology to assign authenticated clients
- `defaultCos` — CoS policy ID
- `cpRedirect` / `cpTopologyId` — captive portal redirect settings
- `cpOauthUseGoogle/Facebook/Microsoft` — social login toggles

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v3/roles` | List all roles | Implemented |
| POST | `/v3/roles` | Create a role | Implemented |
| GET | `/v3/roles/default` | Get role defaults | Implemented |
| GET | `/v3/roles/nametoidmap` | Get name-to-ID map | Implemented |
| GET | `/v3/roles/{roleId}` | Get role by ID | Implemented |
| PUT | `/v3/roles/{roleId}` | Update a role | Implemented |
| POST | `/v3/roles/{roleId}` | Create role from service ID | Implemented |
| DELETE | `/v3/roles/{roleId}` | Delete a role | Implemented |
| GET | `/v3/roles/{roleId}/rulestats` | Rule hit counts | NOT implemented |
| GET | `/v1/roles/{roleId}/report` | Role analytics report | NOT implemented |
| GET | `/v1/roles/{roleid}/stations` | Active clients with this role | NOT implemented |
| GET | `/v1/accesscontrol` | MAC allow/deny lists | Implemented |
| PUT | `/v1/accesscontrol` | Update MAC list | Implemented |
| POST | `/v1/accesscontrol` | Create MAC list | Implemented |
| DELETE | `/v1/accesscontrol` | Delete MAC list | Implemented |

**Note:** Layer 3 firewall rules (ACLs) are embedded inside `RoleElement.l3Filters`. The `PolicyRuleFiltersOn`, `PolicyRuleIpSubnetType`, `PolicyRuleProtocolType` enums define filter behavior. There is no separate `/firewall` endpoint.

---

## 4. AAA/RADIUS Configuration

### AAAPolicyElement Key Fields
- `authenticationRadiusServers` — array of `RadiusServerElement` (primary/backup auth servers)
- `accountingRadiusServers` — array of `RadiusServerElement` (RADIUS accounting)
- `radiusAccountingEnabled` — toggle accounting
- `accountingType` — START_STOP, STOP_ONLY, etc.
- `authenticationType` — PAP, CHAP, EAP, etc.
- `serverPoolingMode` — ROUNDROBIN, FAILOVER
- `healthCheck` — dead server detection interval
- `operatorName` — for Hotspot 2.0 / ANQP

### RadiusServerElement Key Fields
- `ipAddress` / `authPort` / `sharedSecret`
- `totalAuthRetries` / `authTimeout`
- `radiusAuthProtocol` — PAP, CHAP, MS-CHAP, EAP-TTLS, PEAP, etc.
- `mbaPassword` — MAC-based authentication password
- `preferredMacAddressFormat` — MAC format for MAB
- `pollInterval` — server health polling

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v1/aaapolicy` | List all AAA policies | Implemented |
| POST | `/v1/aaapolicy` | Create a new AAA policy | Implemented |
| GET | `/v1/aaapolicy/default` | Get AAA policy defaults | NOT implemented |
| GET | `/v1/aaapolicy/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v1/aaapolicy/{id}` | Get AAA policy by ID | Implemented |
| PUT | `/v1/aaapolicy/{id}` | Update an AAA policy | Implemented |
| DELETE | `/v1/aaapolicy/{id}` | Delete an AAA policy | Implemented |

**Note:** RADIUS servers are not managed independently through a separate endpoint — they are embedded inside the `AAAPolicyElement.authenticationRadiusServers` array. There is no `/v1/radius` path.

---

## 5. Device/AP Configuration

AP configuration is split across two objects: per-AP overrides (`AccessPointElement`) and reusable profiles (`ProfileElement`).

### ProfileElement Key Fields (AP Profile — device group template)
- `apPlatform` — target hardware type (e.g., AP305C, AP410C)
- `radioIfList` — radio configuration array (mode, channel, power, SmartRF)
- `wiredIfList` — wired port configuration
- `secureTunnelMode` — NONE, DTLS, IPSEC
- `airDefenseProfileId` / `xLocationProfileId` / `iotProfileId` / `rtlsProfileId`
- `analyticsProfileId` / `positioningProfileId`
- `mgmtVlanId` / `mgmtVlanTagged` — management VLAN
- `lag` — link aggregation enable
- `sshEnabled` / `apLogLevel`
- `referencedTopologyIDs` / `additionalTopologyIDs` — assigned VLANs
- `smartPoll` — SLE polling configuration

### Profile Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v3/profiles` | List all AP profiles | Implemented |
| POST | `/v3/profiles` | Create a new profile | Implemented |
| GET | `/v3/profiles/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v3/profiles/{profileId}` | Get profile by ID | Implemented |
| PUT | `/v3/profiles/{profileId}` | Update a profile | Implemented |
| DELETE | `/v3/profiles/{profileId}` | Delete a profile | Implemented |
| GET | `/v3/profiles/{profileId}/bssid0` | Primary BSSID services for profile | NOT implemented |
| GET | `/v3/profiles/{profileId}/channels` | Supported channels for profile hardware | NOT implemented |

### AP Instance Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v1/aps` | List all APs | Implemented (via /v1/aps/query) |
| POST | `/v1/aps/create` | Create/register a new AP | NOT implemented |
| DELETE | `/v1/aps/list` | Delete list of APs by serial | Implemented |
| GET | `/v1/aps/query` | Filtered AP list with status | Implemented |
| GET | `/v1/aps/query/columns` | Column definitions for query | Implemented |
| GET | `/v1/aps/query/visualize` | AP visualization data | Implemented |
| GET | `/v1/aps/default` | Get AP default config | Implemented |
| GET | `/v1/aps/hardwaretypes` | List hardware types | Implemented |
| GET | `/v1/aps/platforms` | List AP platform names | Implemented |
| GET | `/v1/aps/displaynames` | AP hardware display names | Implemented |
| GET | `/v1/aps/ifstats` | Interface stats for all APs | Implemented |
| GET | `/v1/aps/ifstats/{serial}` | Interface stats for one AP | Implemented |
| GET | `/v1/aps/upgradeimagelist` | Available firmware images | Implemented |
| PUT | `/v1/aps/upgradeschedule` | Schedule firmware upgrade | Implemented |
| PUT | `/v1/aps/swupgrade` | Upgrade AP software (bulk) | NOT implemented |
| PUT | `/v1/aps/upgrade` | Upgrade to specific image | Implemented |
| PUT | `/v1/aps/assign` | Assign APs to site/group | NOT implemented |
| PUT | `/v1/aps/reboot` | Reboot list of APs | NOT implemented |
| PUT | `/v1/aps/setRuState` | Set AP radio unit state | NOT implemented |
| PUT | `/v1/aps/releasetocloud` | Release APs to XIQ Cloud | NOT implemented |
| PUT | `/v1/aps/multiconfig` | Bulk config update | NOT implemented |
| PUT | `/v1/aps/apbalance` | Set AP load balancing mode | NOT implemented |
| GET | `/v1/aps/apbalance` | Get AP load balancing config | NOT implemented |
| GET | `/v1/aps/registration` | Global AP registration config | NOT implemented |
| PUT | `/v1/aps/registration` | Update global AP registration | NOT implemented |
| GET | `/v1/aps/adoptionrules` | Get AP adoption rules | Implemented |
| PUT | `/v1/aps/adoptionrules` | Update AP adoption rules | NOT implemented (use /v1/devices) |
| POST | `/v1/aps/clone` | Clone an AP configuration | NOT implemented |
| GET | `/v1/aps/{serial}` | Get AP by serial | Implemented |
| PUT | `/v1/aps/{serial}` | Update AP configuration | Implemented |
| DELETE | `/v1/aps/{serial}` | Delete an AP | Implemented |
| GET | `/v1/aps/{serial}/stations` | Clients on this AP | Implemented |
| GET | `/v1/aps/{serial}/lldp` | LLDP neighbor info | Implemented |
| GET | `/v1/aps/{serial}/location` | Station locations at this AP | NOT implemented |
| GET | `/v1/aps/{serial}/bssid0` | Primary BSSID service IDs | NOT implemented |
| GET | `/v1/aps/{serial}/cert` | AP certificate info | NOT implemented |
| PUT | `/v1/aps/{serial}/cert` | (implicit from cert operations) | Partial |
| PUT | `/v1/aps/{serial}/locate` | Locate AP via LED | NOT implemented |
| PUT | `/v1/aps/{serial}/logs` | Enable log download | NOT implemented |
| PUT | `/v1/aps/{serial}/realcapture` | Enable packet capture | NOT implemented |
| PUT | `/v1/aps/{serial}/reboot` | Reboot individual AP | Implemented |
| PUT | `/v1/aps/{serial}/reset` | Reset AP to defaults | Implemented |
| PUT | `/v1/aps/{serial}/setRuState` | Set RU state per AP | NOT implemented |
| PUT | `/v1/aps/{serial}/copytodefault` | Copy config to default profile | NOT implemented |
| PUT | `/v1/aps/{serial}/upgrade` | Upgrade AP image | Implemented |
| GET | `/v1/aps/{serial}/traceurls` | Get trace download URLs | NOT implemented |
| GET | `/v1/aps/antenna/{serial}` | Antenna info for AP | NOT implemented |
| POST | `/v1/aps/cert/apply` | Apply certificate to APs | NOT implemented |
| PUT | `/v1/aps/cert/reset` | Reset certificates | NOT implemented |
| POST | `/v1/aps/cert/signrequest` | Generate CSR | Implemented |
| GET | `/v1/ap/environment/{serial}` | AP environment/country info | Implemented |
| GET | `/v1/devices/adoptionrules` | Adoption rules (preferred path) | Implemented |
| PUT | `/v1/devices/adoptionrules` | Update adoption rules | Implemented |
| POST | `/v1/devices/adoption/force` | Force adopt a device | Implemented |
| DELETE | `/v1/devices/{serial}/unadopt` | Unadopt a device | Implemented |
| GET | `/v1/deviceimages/{hwType}` | Firmware images for hardware type | Implemented |

---

## 6. RF Management Configuration

### RfMgmtPolicyElement Key Fields
- `type` — SMARTRF or ACS (Automatic Channel Selection)
- `smartRf` — SmartRF policy (basic sensitivity, power/channel, scanning, neighbor recovery, coverage hole recovery, interference recovery)
- `acs` — ACS policy (basic settings, power/channel per band, neighbor recovery, interference recovery)
- `xaiRf` — XAI (AI-driven) RF policy name and type

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v3/rfmgmt` | List all RF management policies | Implemented |
| POST | `/v3/rfmgmt` | Create a new RF management policy | Implemented |
| GET | `/v3/rfmgmt/default` | Get RF policy defaults | NOT implemented |
| GET | `/v3/rfmgmt/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v3/rfmgmt/{id}` | Get RF policy by ID | Implemented |
| PUT | `/v3/rfmgmt/{id}` | Update an RF policy | Implemented |
| DELETE | `/v3/rfmgmt/{id}` | Delete an RF policy | Implemented |
| GET | `/v1/radios/channels` | Available channels for a radio mode | Implemented |
| GET | `/v1/radios/modes` | Radio mode definitions | Implemented |
| GET | `/v3/radios/smartrfchannels` | SmartRF allowed channels | Implemented |

---

## 7. System Configuration

### GlobalSettingsElement
- No property schema exposed in swagger (returns opaque object)
- Controls system-wide defaults: AP heartbeat, regulatory domain, etc.

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v1/globalsettings` | Get global settings | Implemented |
| PUT | `/v1/globalsettings` | Update global settings | Implemented |
| GET | `/v1/snmp` | Get SNMP configurations | Implemented |
| GET | `/v1/snmp/default` | Get SNMP defaults | NOT implemented |
| GET | `/v1/administrators` | List administrators | Implemented |
| POST | `/v1/administrators` | Create administrator | Implemented |
| GET | `/v1/administrators/{userId}` | Get administrator | Implemented |
| PUT | `/v1/administrators/{userId}` | Update administrator | Implemented |
| DELETE | `/v1/administrators/{userId}` | Delete administrator | Implemented |
| PUT | `/v1/administrators/adminpassword` | Change admin password | NOT implemented |
| PUT | `/v1/administratorsTimeout/{userId}` | Update session timeout | NOT implemented |
| GET | `/v1/appkeys` | List API application keys | Implemented |
| POST | `/v1/appkeys` | Create application key | Implemented |
| GET | `/v1/appkeys/{appKey}` | Get application key | Implemented |
| DELETE | `/v1/appkeys/{appKey}` | Delete application key | Implemented |
| GET | `/v1/nsightconfig` | Get NSight server config | Implemented |
| PUT | `/v1/nsightconfig` | Update NSight config | Implemented |
| GET | `/v1/bestpractices/evaluate` | Run best practices audit | Implemented |
| PUT | `/v1/bestpractices/{id}/accept` | Accept best practice recommendation | NOT implemented |
| GET | `/v1/workflow` | Check configuration dependencies | Implemented |
| GET | `/v1/auditlogs` | Get audit log entries | Implemented |
| GET | `/v1/notifications` | Get system notifications | NOT implemented |
| GET | `/v1/notifications/regional` | Regional notifications | NOT implemented |
| POST | `/v1/oauth2/token` | Login (get token) | Implemented |
| POST | `/v1/oauth2/refreshToken` | Refresh access token | Implemented |
| DELETE | `/v1/oauth2/token/{token}` | Logout (revoke token) | Implemented |
| POST | `/v1/oauth2/introspecttoken` | Validate access token | NOT implemented |

---

## 8. VPN/Tunneling Configuration

**No dedicated VPN endpoint exists in the swagger spec.** VPN/tunneling is configured through:

- `TopologyElement.mode` — set to Bridged-at-Controller or Layer2 Tunnel for tunnel mode
- `TopologyElement.vni` / `remoteVtepIp` — VXLAN tunnel endpoints
- `TopologyElement.cert` / `certCa` — certificate-based DTLS/IPsec tunnel authentication
- `ProfileElement.secureTunnelMode` — per-profile: NONE, DTLS, IPSEC
- `ProfileElement.secureTunnelLifetime` — tunnel key rotation
- `ProfileElement.secureTunnelAp` — enable AP-to-controller tunnel
- `ApControllerTunnelStatusElement` — runtime tunnel status (in AP state)
- `ApVlanStatusElement` — per-VLAN tunnel status

**Server.js stub endpoints** (NOT forwarded to controller, return mock data):
- `GET /api/management/v1/afc/plans` — AFC frequency plans (stub)
- `POST /api/management/v1/afc/plans` — Create AFC plan (stub)
- `POST /api/management/v1/afc/plans/:id/analyze` — Analyze AFC plan (stub)
- `DELETE /api/management/v1/afc/plans/:id` — Delete AFC plan (stub)
- `GET /api/management/v1/afc/radio-heights` — AFC radio heights (stub)
- `POST /api/management/v1/afc/radio-heights` — Set AFC radio heights (stub)

---

## 9. Guest/Captive Portal Configuration

### EGuestElement Key Fields
- `cpFqdn` — captive portal fully qualified domain name
- `authenticationRadiusServer` — `RadiusServerElement` for portal auth
- `accountingRadiusServer` — `RadiusServerElement` for accounting
- `userName` / `password` — portal admin credentials

Captive portal type is set on the service (`ServiceElement.captivePortalType`):
- EXTERNAL, INTERNAL, EGUEST, NONE, CLICK_THROUGH, SELF_REGISTRATION, SOCIAL_LOGIN

The `RoleElement` contains captive portal redirect settings:
- `cpRedirect` URL, `cpTopologyId`, OAuth provider toggles, URL query parameter injection

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v1/eguest` | List all EGuest portals | Implemented |
| POST | `/v1/eguest` | Create an EGuest portal | Implemented |
| GET | `/v1/eguest/default` | Get EGuest defaults | Implemented |
| GET | `/v1/eguest/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v1/eguest/{id}` | Get EGuest by ID | Implemented |
| PUT | `/v1/eguest/{id}` | Update an EGuest portal | Implemented |
| DELETE | `/v1/eguest/{id}` | Delete an EGuest portal | Implemented |

**Server.js stub endpoints** (mock data, not proxied to controller):
- `GET /api/management/v1/guests` — guest account list
- `POST /api/management/v1/guests/create` — create guest account
- `DELETE /api/management/v1/guests/:id` — delete guest account
- `POST /api/management/v1/guests/:id/voucher` — generate voucher
- `GET /api/management/v1/guests/portal/config` — portal config (stub)
- `POST /api/management/v1/guests/portal/customize` — portal customization (stub)

---

## 10. IoT Configuration

### IoTProfileElement Key Fields
- `appId` — IoT application type (IBEACON, EDDYSTONE, THREAD_GATEWAY, etc.)
- `iBeaconAdvertisement` — iBeacon broadcast settings (interval, UUID, major, minor)
- `iBeaconScan` — iBeacon scan settings (dest IP/port, RSSI threshold)
- `eddystoneAdvertisement` — Eddystone URL beacon settings
- `eddystoneScan` — Eddystone scan forwarding settings
- `threadGateway` — Thread IoT network settings (PAN ID, master key, channel)

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v3/iotprofile` | List all IoT profiles | Implemented |
| POST | `/v3/iotprofile` | Create an IoT profile | Implemented |
| GET | `/v3/iotprofile/default` | Get IoT profile defaults | NOT implemented |
| GET | `/v3/iotprofile/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v3/iotprofile/{id}` | Get IoT profile by ID | Implemented |
| PUT | `/v3/iotprofile/{id}` | Update an IoT profile | Implemented |
| DELETE | `/v3/iotprofile/{id}` | Delete an IoT profile | Implemented |

---

## 11. Location/Maps Configuration

Location covers four different profile types plus RTLS.

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v3/positioning` | List positioning profiles | Implemented |
| POST | `/v3/positioning` | Create positioning profile | Implemented |
| GET | `/v3/positioning/default` | Get defaults | NOT implemented |
| GET | `/v3/positioning/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v3/positioning/{id}` | Get profile by ID | Implemented |
| PUT | `/v3/positioning/{id}` | Update profile | Implemented |
| DELETE | `/v3/positioning/{id}` | Delete profile | Implemented |
| GET | `/v3/xlocation` | List XLocation profiles | Implemented |
| POST | `/v3/xlocation` | Create XLocation profile | Implemented |
| GET | `/v3/xlocation/default` | Get defaults | NOT implemented |
| GET | `/v3/xlocation/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v3/xlocation/{id}` | Get XLocation profile by ID | Implemented |
| PUT | `/v3/xlocation/{id}` | Update XLocation profile | Implemented |
| DELETE | `/v3/xlocation/{id}` | Delete XLocation profile | Implemented |
| GET | `/v1/rtlsprofile` | List RTLS profiles | Implemented |
| POST | `/v1/rtlsprofile` | Create RTLS profile | Implemented |
| GET | `/v1/rtlsprofile/default` | Get defaults | NOT implemented |
| GET | `/v1/rtlsprofile/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v1/rtlsprofile/{id}` | Get RTLS profile by ID | Implemented |
| PUT | `/v1/rtlsprofile/{id}` | Update RTLS profile | Implemented |
| DELETE | `/v1/rtlsprofile/{id}` | Delete RTLS profile | Implemented |
| GET | `/v1/report/location/aps/{serial}` | Station locations at AP | Implemented |
| GET | `/v1/report/location/floor/{floorId}` | Station locations on floor | Implemented |
| GET | `/v1/report/location/stations/{stationId}` | Location report for a station | Implemented |
| GET | `/v1/stations/{stationId}/location` | Station location | NOT implemented |
| GET | `/v1/aps/{serial}/location` | Location data at an AP | NOT implemented |
| GET | `/v3/sites/report/location/floor/{floorId}` | Floor location (v3) | NOT implemented |

**Server.js stub endpoints** (mock data):
- `POST /api/management/v1/location/zone/create` — location zone creation (stub)
- `GET /api/management/v1/location/zone/list` — list zones (stub)
- `POST /api/management/v1/location/presence/notify` — presence notification (stub)
- `GET /api/management/v1/location/analytics/dwell` — dwell analytics (stub)
- `GET /api/management/v1/location/analytics/traffic` — traffic analytics (stub)

---

## 12. Air Defense (WIDS/ADSP) Configuration

### AdspProfileElement Key Fields
- `svrAddr` — Air Defense server address array (v3 schema uses array, v4 has different structure)

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v4/adsp` | List all ADSP profiles (preferred) | Implemented |
| POST | `/v4/adsp` | Create an ADSP profile | Implemented |
| GET | `/v4/adsp/default` | Get defaults | NOT implemented |
| GET | `/v4/adsp/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v4/adsp/{id}` | Get ADSP profile by ID | Implemented |
| PUT | `/v4/adsp/{id}` | Update an ADSP profile | Implemented |
| DELETE | `/v4/adsp/{id}` | Delete an ADSP profile | Implemented |
| GET | `/v3/adsp` | List all ADSP profiles (v3) | NOT implemented |
| POST | `/v3/adsp` | Create ADSP profile (v3) | NOT implemented |
| GET | `/v3/adsp/default` | Get defaults (v3) | NOT implemented |
| GET | `/v3/adsp/nametoidmap` | Get name-to-ID map (v3) | NOT implemented |
| GET | `/v3/adsp/{id}` | Get ADSP by ID (v3) | NOT implemented |
| PUT | `/v3/adsp/{id}` | Update ADSP (v3) | NOT implemented |
| DELETE | `/v3/adsp/{id}` | Delete ADSP (v3) | NOT implemented |

**Server.js stub endpoints** (mock data):
- `POST /api/management/v1/security/rogue-ap/detect` — rogue AP detection (stub)
- `GET /api/management/v1/security/rogue-ap/list` — rogue AP list (stub)
- `POST /api/management/v1/security/rogue-ap/:mac/classify` — classify rogue AP (stub)
- `GET /api/management/v1/security/threats` — WIDS threats (stub)
- `POST /api/management/v1/security/wids/enable` — enable WIDS (stub)

**Note:** api.ts uses `/v4/adsp` (preferred, not `/v3/adsp`). The v3 paths are fully unimplemented.

---

## 13. Analytics Configuration

### AnalyticsProfileElement Key Fields
- `destAddr` — analytics server destination address
- `reportFreq` — reporting frequency in seconds

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v3/analytics` | List all analytics profiles | Implemented |
| POST | `/v3/analytics` | Create analytics profile | Implemented |
| GET | `/v3/analytics/default` | Get defaults | NOT implemented |
| GET | `/v3/analytics/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v3/analytics/{id}` | Get analytics profile by ID | Implemented |
| PUT | `/v3/analytics/{id}` | Update analytics profile | Implemented |
| DELETE | `/v3/analytics/{id}` | Delete analytics profile | Implemented |

---

## 14. Meshpoint Configuration

### MeshpointElement Key Fields
- `meshId` — mesh network identifier
- `root` — whether this is the root/base meshpoint
- `controlVlan` — control VLAN ID
- `neighborTimeout` — neighbor detection timeout
- `privacy` — mesh security settings (PSK or WPA enterprise)

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v3/meshpoints` | List all meshpoints | Implemented |
| POST | `/v3/meshpoints` | Create a meshpoint | Implemented |
| GET | `/v3/meshpoints/default` | Get defaults | NOT implemented |
| GET | `/v3/meshpoints/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v3/meshpoints/profile/default` | Get profile meshpoint defaults | NOT implemented |
| GET | `/v3/meshpoints/{id}` | Get meshpoint by ID | Implemented |
| PUT | `/v3/meshpoints/{id}` | Update a meshpoint | Implemented |
| DELETE | `/v3/meshpoints/{id}` | Delete a meshpoint | Implemented |
| GET | `/v3/meshpoints/tree/{id}` | Get meshpoint topology tree | Implemented |
| GET | `/v3/meshpoints/{id}/bssid` | Get meshpoint AP BSSID info | NOT implemented |

---

## 15. QoS Configuration (CoS and Rate Limiters)

### PolicyClassOfServiceElement Key Fields
- `cosQos` — QoS marking (802.1p priority, DSCP)
- `inboundRateLimiterId` / `outboundRateLimiterId` — rate limiter references
- `transmitQueue` — hardware transmit queue (0–7)
- `predefined` — system default, cannot be deleted

### PolicyRateLimiterElement Key Fields
- `cirKbps` — committed information rate in kbps

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v1/cos` | List all CoS policies | Implemented |
| POST | `/v1/cos` | Create a CoS policy | Implemented |
| GET | `/v1/cos/default` | Get CoS defaults | NOT implemented |
| GET | `/v1/cos/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v1/cos/{id}` | Get CoS by ID | Implemented |
| PUT | `/v1/cos/{id}` | Update a CoS policy | Implemented |
| DELETE | `/v1/cos/{id}` | Delete a CoS policy | Implemented |
| GET | `/v1/ratelimiters` | List all rate limiters | Implemented |
| POST | `/v1/ratelimiters` | Create a rate limiter | Implemented |
| GET | `/v1/ratelimiters/default` | Get rate limiter defaults | NOT implemented |
| GET | `/v1/ratelimiters/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v1/ratelimiters/{id}` | Get rate limiter by ID | Implemented |
| PUT | `/v1/ratelimiters/{id}` | Update a rate limiter | Implemented |
| DELETE | `/v1/ratelimiters/{id}` | Delete a rate limiter | Implemented |

**Server.js stub endpoints** (mock data):
- `POST /api/management/v1/qos/policy/create` — QoS policy creation (stub)
- `GET /api/management/v1/qos/statistics` — QoS statistics (stub)
- `POST /api/management/v1/qos/bandwidth/allocate` — bandwidth allocation (stub)
- `GET /api/management/v1/qos/dscp/mappings` — DSCP mappings (stub)

---

## 16. Switch Configuration

### SwitchElement Key Fields (not fully exposed in swagger schema)
- Model, platform, serial number, site assignment
- CLI configuration mode

### SwitchPortProfileElement Key Fields
- Extends `PortProfileBaseElement`:
  - `portSpeed`, `typeOfService`, `adminStatus`
  - `defaultPolicy` — CoS/role assignment
  - `poePortConfig` — PoE settings
  - `lagmembers` / `lagType` — LAG/bonding
  - `taggedTopologies` — trunk VLAN assignments

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v1/switches` | List all switches | Implemented |
| GET | `/v1/switches/displaynames` | Switch display names | Implemented |
| DELETE | `/v1/switches/list` | Delete list of switches | Implemented |
| PUT | `/v1/switches/assign` | Assign switches to site | NOT implemented |
| POST | `/v1/switches/clone` | Clone switch config | NOT implemented |
| PUT | `/v1/switches/reboot` | Reboot switches | NOT implemented |
| GET | `/v1/switches/{serial}` | Get switch by serial | Implemented |
| PUT | `/v1/switches/{serial}` | Update switch config | Implemented |
| DELETE | `/v1/switches/{serial}` | Delete a switch | Implemented |
| GET | `/v1/switches/{serial}/report` | Switch analytics report | NOT implemented |
| GET | `/v1/switches/{serial}/clibackups` | CLI backup list | NOT implemented |
| PUT | `/v1/switches/{serial}/cliconfigs/backup` | Create CLI backup | NOT implemented |
| PUT | `/v1/switches/{serial}/cliconfigs/restore/{name}` | Restore CLI backup | NOT implemented |
| PUT | `/v1/switches/{serial}/configurationmode/{mode}` | Change config mode | NOT implemented |
| PUT | `/v1/switches/{serial}/console/{action}` | Remote console action | NOT implemented |
| PUT | `/v1/switches/{serial}/login` | CLI login to switch | NOT implemented |
| PUT | `/v1/switches/{serial}/logs` | Enable log download | NOT implemented |
| PUT | `/v1/switches/{serial}/reboot` | Reboot individual switch | NOT implemented |
| PUT | `/v1/switches/{serial}/reset` | Reset switch | NOT implemented |
| PUT | `/v1/switches/{serial}/upgrade` | Upgrade switch firmware | NOT implemented |
| GET | `/v1/switches/{serial}/traceurls` | Trace download URLs | NOT implemented |
| PUT | `/v1/switches/{serial}/ports/{portNumber}` | Configure a switch port | NOT implemented |
| GET | `/v1/switches/{serial}/ports/{portId}/report` | Port analytics report | NOT implemented |
| GET | `/v1/switches/{serial}/slots/{slot}/ports/{port}` | Get port slot config | NOT implemented |
| PUT | `/v1/switches/{serial}/slots/{slot}/ports/{port}` | Update port slot config | NOT implemented |
| GET | `/v3/switchportprofile` | List switch port profiles | Implemented |
| POST | `/v3/switchportprofile` | Create port profile | Implemented |
| GET | `/v3/switchportprofile/default` | Get defaults | NOT implemented |
| GET | `/v3/switchportprofile/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v3/switchportprofile/{id}` | Get profile by ID | Implemented |
| PUT | `/v3/switchportprofile/{id}` | Update port profile | Implemented |
| DELETE | `/v3/switchportprofile/{id}` | Delete port profile | Implemented |

---

## 17. Site Configuration

### SiteElement Key Fields
- `siteName` / `country` / `timezone` / `postalCode`
- `aaaPolicyId` — default AAA policy for the site
- `snmpConfig` — embedded SNMP configuration
- `deviceGroups` — AP device groups (with topology and RF policy assignments)
- `switchDeviceGroups` — switch device groups
- `stpEnabled` — spanning tree protocol
- `enforceVersion` — firmware version enforcement
- `preferredAffinity` — controller affinity for multi-controller

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v3/sites` | List all sites | Implemented |
| POST | `/v3/sites` | Create a site | Implemented |
| GET | `/v3/sites/default` | Get site defaults | NOT implemented |
| GET | `/v3/sites/nametoidmap` | Get name-to-ID map | NOT implemented |
| GET | `/v3/sites/countrylist` | Supported countries | Implemented |
| POST | `/v3/sites/clone/{siteId}` | Clone a site | NOT implemented |
| GET | `/v3/sites/{siteId}` | Get site by ID | Implemented |
| PUT | `/v3/sites/{siteId}` | Update a site | Implemented |
| DELETE | `/v3/sites/{siteId}` | Delete a site | Implemented |
| GET | `/v3/sites/{siteId}/report/impact` | SLE impact report for site | Implemented |
| GET | `/v3/sites/{siteId}/report/venue` | Venue report for site | Implemented |
| GET | `/v3/sites/{siteid}/stations` | Active clients at site | NOT implemented |
| GET | `/v3/sites/report` | All-site report | Implemented |
| GET | `/v3/sites/report/flex` | Historical flex report | Implemented |
| GET | `/v3/sites/report/impact` | All-site impact report | Implemented |
| GET | `/v3/sites/report/venue` | All-site venue report | Implemented |
| GET | `/v3/sites/report/location/floor/{floorId}` | Floor location report | NOT implemented |
| GET | `/v1/state/sites` | Site operational state | Implemented |
| GET | `/v1/state/sites/{siteId}` | Individual site state | Implemented |
| GET | `/v1/state/sites/{siteId}/aps` | AP state at a site | NOT implemented |
| GET | `/v1/report/sites` | Site analytics report (v1) | Implemented |
| GET | `/v1/report/sites/{siteId}` | Site report by ID (v1) | Implemented |
| GET | `/v1/msp/briefsites/{tenantId}` | MSP brief site list | Implemented |

---

## 18. DPI Signatures Configuration

### Endpoints

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/v1/dpisignatures` | List all DPI signature profiles | Implemented |
| PUT | `/v1/dpisignatures` | Save DPI application list | Implemented |
| GET | `/v1/dpisignatures/custom` | List custom signatures | NOT implemented |

---

## 19. Platform Manager Endpoints (Controller Infrastructure)

These endpoints are served directly by Express server.js, implementing local logic rather than proxying to the controller. They manage controller-level infrastructure.

| Method | Path | Description | Notes |
|---|---|---|---|
| GET | `/platformmanager/v1/configuration/backups` | List config backups | Local stub |
| POST | `/platformmanager/v1/configuration/backup` | Create backup | Local stub |
| POST | `/platformmanager/v1/configuration/restore` | Restore from backup | Local stub |
| GET | `/platformmanager/v1/configuration/download/:filename` | Download backup file | Local stub |
| GET | `/platformmanager/v1/license/info` | License information | Local stub |
| GET | `/platformmanager/v1/license/usage` | License utilization | Local stub |
| POST | `/platformmanager/v1/license/install` | Install license key | Local stub |
| GET | `/platformmanager/v1/flash/files` | Flash storage file list | Local stub |
| GET | `/platformmanager/v1/flash/usage` | Flash storage usage | Local stub |
| DELETE | `/platformmanager/v1/flash/files/:filename` | Delete flash file | Local stub |
| GET | `/platformmanager/v1/reports/systeminformation` | System info report | Local stub |
| GET | `/platformmanager/v1/reports/manufacturinginformation` | Manufacturing info | Local stub |
| POST | `/platformmanager/v1/network/ping` | Network ping diagnostic | Express-native |
| POST | `/platformmanager/v1/network/traceroute` | Network traceroute | Express-native |
| POST | `/platformmanager/v1/network/dns` | DNS lookup diagnostic | Express-native |
| POST | `/platformmanager/v1/startappacketcapture` | Start packet capture | Local stub |
| PUT | `/platformmanager/v1/stopappacketcapture` | Stop packet capture | Local stub |
| GET | `/platformmanager/v1/packetcapture/active` | Active captures | Local stub |
| GET | `/platformmanager/v1/packetcapture/files` | Capture file list | Local stub |
| GET | `/platformmanager/v1/packetcapture/download/:id` | Download capture file | Local stub |

---

## 20. Endpoints in api.ts NOT in Swagger (Non-Documented Extensions)

These are called by api.ts but not present in `public/swagger.json`. They are either undocumented controller features, extended APIs, or fully stubbed in server.js.

| Path | Category | Notes |
|---|---|---|
| `/v1/aps/{serial}/alarms` | AP Alarms | Not in swagger; swagger recommends `/v1/aps/{serial}/report` |
| `/v1/stations/{mac}/reauthenticate` | Station Actions | Not in swagger |
| `/v1/stations/{mac}/deauth` | Station Actions | Not in swagger |
| `/v1/stations/{mac}/block` | Station Actions | Not in swagger |
| `/v1/stations/{mac}/history` | Station History | Not in swagger |
| `/v1/stations/{mac}/bandwidth/limit` | Station QoS | Not in swagger |
| `/v1/stations/blocked` | Blocked Clients | Not in swagger |
| `/v1/sites/stats` | Site Stats | Not in swagger |
| `/v1/events` | Event Log | Not in swagger (stubbed in server.js) |
| `/v1/alarms` | Alarms | Not in swagger (stubbed in server.js) |
| `/v1/alarms/active` | Active Alarms | Not in swagger (stubbed in server.js) |
| `/v1/alarms/{id}/acknowledge` | Alarm Ack | Not in swagger (stubbed in server.js) |
| `/v1/alarms/{id}/clear` | Alarm Clear | Not in swagger (stubbed in server.js) |
| `/v1/analytics/wireless/interference` | Analytics | Not in swagger (stubbed) |
| `/v1/analytics/wireless/coverage` | Analytics | Not in swagger (stubbed) |
| `/v1/analytics/clients/roaming` | Analytics | Not in swagger (stubbed) |
| `/v1/security/rogue-ap/*` | Security | Not in swagger (stubbed in server.js) |
| `/v1/security/threats` | Security | Not in swagger (stubbed in server.js) |
| `/v1/security/wids/enable` | WIDS | Not in swagger (stubbed in server.js) |
| `/v1/guests/*` | Guest Accounts | Not in swagger (stubbed in server.js) |
| `/v1/qos/*` | QoS | Not in swagger (stubbed in server.js) |
| `/v1/location/*` | Location Zones | Not in swagger (stubbed in server.js) |
| `/v1/afc/*` | AFC Frequency | Not in swagger (stubbed in server.js) |
| `/v1/devices/adoption/force` | Device Adoption | Not in swagger |
| `/v1/devices/{serial}/unadopt` | Device Adoption | Not in swagger |
| `/appsmanager/v1/*` | App Manager | Not in swagger (stubbed) |
| `/deployments` | Deployments | Internal AURA deployment tracking |

---

## Critical Findings

### Finding 1 — HIGH: 110+ swagger endpoints not implemented in api.ts
The most impactful gap is in switch management (17 unimplemented paths), AP bulk operations (10+ paths), and site utilities (clone, nametoidmap). These gaps block replication of the controller's configuration UI menus.

### Finding 2 — HIGH: Server.js stubs returning mock data for 25+ paths
Endpoints under `/v1/events`, `/v1/alarms`, `/v1/security/*`, `/v1/guests/*`, `/v1/qos/*`, `/v1/location/*`, and `/v1/afc/*` are all intercepted by Express and return hardcoded mock JSON. They never reach the controller. Any UI built on these will display fabricated data.

### Finding 3 — MEDIUM: v3/adsp completely unimplemented, v4/adsp used instead
api.ts correctly uses `/v4/adsp` (the preferred version). However, the v3 ADSP paths remain registered in swagger and could create confusion during version migrations.

### Finding 4 — MEDIUM: /v1/topologies used for create/update, /v3/topologies used for listing
The code mixes v1 and v3 topology endpoints. `createTopology` and `updateTopology` use `/v1/topologies`, while `getTopologies` uses `/v3/topologies`. The v3 list endpoint adds a `?modes=` filter parameter not available in v1.

### Finding 5 — LOW: No nametoidmap methods implemented for most resource types
None of the `/nametoidmap` convenience endpoints are called by the frontend. These are useful for building dropdowns (e.g., select AAA policy by name) without fetching full object lists.

### Finding 6 — LOW: /v1/aaapolicy/default and /v3/roles/default not called during creation flows
When creating new AAA policies or roles, the UI should pre-populate defaults by calling these endpoints. Currently the forms use hardcoded defaults instead.

---

## Recommendations for Controller Config UI Replication

To replicate all wireless configuration menus from the controller UI into AURA, implement these endpoints in priority order:

1. **Switch port configuration** — `PUT /v1/switches/{serial}/ports/{portNumber}`, `GET/PUT /v1/switches/{serial}/slots/{slot}/ports/{port}` — needed for the Ports tab
2. **Switch operations** — assign, clone, reboot, CLI backup/restore, configurationmode
3. **AP bulk operations** — `/v1/aps/multiconfig`, `/v1/aps/assign`, `/v1/aps/apbalance`
4. **AP registration and global settings** — `/v1/aps/registration`, `/v1/globalsettings`
5. **Site utilities** — `POST /v3/sites/clone/{siteId}`, `GET /v3/sites/{siteid}/stations`
6. **Replace stubs** — `/v1/alarms`, `/v1/events`, and `/v1/security/*` need real controller forwarding, not mock data
7. **nametoidmap endpoints** — implement for role, topology, service, AAA policy, CoS, rate limiter selectors in form dropdowns
