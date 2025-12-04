# WLAN Configuration Feature Comparison

## Campus Controller vs Edge-Services App

### ✅ Currently Supported in Edge-Services App

| Feature | Campus Controller Field | Edge-Services App Field | Status |
|---------|------------------------|------------------------|--------|
| Service Name | `serviceName` | `name` | ✅ Supported |
| SSID | `ssid` | `ssid` | ✅ Supported |
| Hide SSID | `suppressSsid` | `hidden` / `broadcastSSID` | ✅ Supported |
| Enable/Disable | `status` / `enabled` | `enabled` | ✅ Supported |
| VLAN | `dot1dPortNumber` | `vlan` | ✅ Supported |
| Frequency Band | (implicit) | `band` | ✅ Supported |
| Captive Portal | `enableCaptivePortal` | `captivePortal` | ✅ Supported |
| Guest Access | (role-based) | `guestAccess` | ✅ Supported |
| MAC Auth | (via AAA) | `macBasedAuth` | ✅ Supported |
| Max Clients | (not in API) | `maxClients` | ✅ Supported |
| Session Timeout | `sessionTimeout` | `sessionTimeout` | ✅ Supported |
| Idle Timeout | `preAuthenticatedIdleTimeout`, `postAuthenticatedIdleTimeout` | `idleTimeout` | ✅ Supported |

### ❌ Missing from Edge-Services App (Available in Campus Controller)

| Feature Category | Campus Controller Fields | Priority | Notes |
|-----------------|------------------------|----------|-------|
| **Security - WPA3** | | | |
| WPA3-Personal (SAE) | `privacy.WpaSaeElement.pmfMode`, `saeMethod`, `presharedKey` | 🔴 HIGH | Modern WPA3 security |
| SAE Method | `privacy.WpaSaeElement.saeMethod` (SaeH2e, SaeLoop) | 🔴 HIGH | H2E (Hash-to-Element) support |
| PMF Mode | `privacy.WpaSaeElement.pmfMode` (required/capable/disabled) | 🔴 HIGH | Protected Management Frames |
| Beacon Protection | `beaconProtection` | 🟡 MEDIUM | Enhanced WPA3 security |
| OWE (Enhanced Open) | `oweAutogen`, `oweCompanion` | 🟡 MEDIUM | Opportunistic Wireless Encryption |
| | | | |
| **Security - Enterprise** | | | |
| AAA Policy | `aaaPolicyId` | 🔴 HIGH | RADIUS server configuration |
| RADIUS Accounting | `accountingEnabled` | 🟡 MEDIUM | Usage tracking |
| Fast Transition (802.11r) | `privacy.WpaEnterpriseElement.fastTransitionEnabled`, `fastTransitionMdId` | 🟡 MEDIUM | Fast roaming for enterprise |
| MBA Authorization | `mbaAuthorization` | 🟢 LOW | MAC-based authorization |
| | | | |
| **802.11 Standards** | | | |
| 802.11k (RRM) | `enabled11kSupport`, `rm11kBeaconReport`, `rm11kQuietIe` | 🟡 MEDIUM | Radio Resource Management |
| 802.11v (BSS Transition) | `enable11mcSupport` | 🟡 MEDIUM | Better roaming decisions |
| Band Steering | `bandSteering` | 🟡 MEDIUM | Steer 5GHz-capable clients |
| MBO | `mbo` (Multi-Band Operation) | 🟢 LOW | Advanced band steering |
| | | | |
| **Quality of Service** | | | |
| Default CoS | `defaultCoS` (topology/role ID) | 🔴 HIGH | Quality of Service class |
| DSCP Marking | `dscp.codePoints` (array of 64 values) | 🟡 MEDIUM | Packet prioritization |
| Admission Control - Video | `admissionControlVideo` | 🟡 MEDIUM | QoS for video traffic |
| Admission Control - Voice | `admissionControlVoice` | 🟡 MEDIUM | QoS for voice traffic |
| Admission Control - Best Effort | `admissionControlBestEffort` | 🟢 LOW | QoS for best-effort traffic |
| Admission Control - Background | `admissionControlBackgroundTraffic` | 🟢 LOW | QoS for background traffic |
| U-APSD | `uapsdEnabled` | 🟢 LOW | WMM Power Save |
| | | | |
| **Access Control & Roles** | | | |
| Authenticated User Role | `authenticatedUserDefaultRoleID` | 🔴 HIGH | Default role after authentication |
| Unauthenticated User Role | `unAuthenticatedUserDefaultRoleID` | 🔴 HIGH | Default role before authentication |
| MBA Timeout Role | `mbatimeoutRoleId` | 🟢 LOW | Role after MBA timeout |
| | | | |
| **Client Management** | | | |
| Client-to-Client Communication | `clientToClientCommunication` | 🟡 MEDIUM | Wireless client isolation |
| Flexible Client Access | `flexibleClientAccess` | 🟢 LOW | Dynamic client access |
| Purge on Disconnect | `purgeOnDisconnect` | 🟢 LOW | Clear client data on disconnect |
| Include Hostname | `includeHostname` | 🟢 LOW | Send hostname to RADIUS |
| | | | |
| **Captive Portal & Hotspot** | | | |
| Captive Portal Type | `captivePortalType` | 🟡 MEDIUM | Internal/External/Custom |
| eGuest Portal ID | `eGuestPortalId` | 🟡 MEDIUM | Guest portal configuration |
| eGuest Settings | `eGuestSettings` | 🟡 MEDIUM | Guest portal parameters |
| Hotspot Type | `hotspotType` (Passpoint/Hotspot 2.0) | 🟡 MEDIUM | Hotspot 2.0 / Passpoint |
| Hotspot Config | `hotspot` | 🟡 MEDIUM | Hotspot 2.0 settings |
| CP Non-Auth Policy | `cpNonAuthenticatedPolicyName` | 🟢 LOW | Captive portal policy |
| | | | |
| **Network Configuration** | | | |
| Roaming Assist Policy | `roamingAssistPolicy` | 🟡 MEDIUM | Optimize roaming |
| Vendor Specific Attributes | `vendorSpecificAttributes` (array) | 🟢 LOW | Custom RADIUS attributes |
| Proxied Mode | `proxied` (Local/Centralized) | 🟡 MEDIUM | Traffic forwarding mode |
| Shutdown on Meshpoint Loss | `shutdownOnMeshpointLoss` | 🟢 LOW | Mesh network behavior |
| Features | `features` (array) | 🟢 LOW | Feature flags |

### 📋 Summary Statistics

- **Total Campus Controller Fields**: ~50 configuration options
- **Currently Supported**: 12 options (~24%)
- **Missing - HIGH Priority**: 6 options
- **Missing - MEDIUM Priority**: 18 options
- **Missing - LOW Priority**: 14 options

### 🎯 Recommended Implementation Priority

#### Phase 1 - Critical Security & Roles (HIGH Priority)
1. **WPA3-Personal (SAE)** - Modern security standard
2. **PMF (Protected Management Frames)** - Required for WPA3
3. **AAA Policy Selection** - Enterprise authentication
4. **User Roles** - Authenticated/Unauthenticated default roles
5. **Default CoS** - Quality of Service assignment
6. **SAE Method** - Hash-to-Element vs Loop

#### Phase 2 - Client Experience (MEDIUM Priority)
1. **802.11k/v Support** - Better roaming
2. **Band Steering** - Optimize client connections
3. **Client-to-Client Communication** - Wireless isolation
4. **Admission Control (Video/Voice)** - QoS for real-time traffic
5. **DSCP Marking** - Advanced QoS
6. **Roaming Assist Policy** - Roaming optimization
7. **Captive Portal Type** - Portal configuration options
8. **Hotspot 2.0 / Passpoint** - Standards-based guest access
9. **Proxied Mode** - Local vs Centralized forwarding

#### Phase 3 - Advanced Features (LOW Priority)
1. **U-APSD** - Power save
2. **MBO** - Multi-band operation
3. **Vendor Specific Attributes** - RADIUS customization
4. **Additional admission control options**
5. **Mesh-specific settings**
6. **Feature flags**

### 🔍 Field Mapping Notes

**Topology/VLAN Assignment:**
- Campus Controller uses `defaultTopology` (UUID) which maps to a topology object
- Topology objects contain VLAN ID in `vlanid` field
- Edge-Services app should:
  1. Fetch topologies list
  2. Allow selection of topology by name
  3. Map to topology ID for API calls

**Security Configuration:**
- Campus Controller uses nested `privacy` object with type-specific elements
- Current app has simplified security dropdown
- Need to map UI selections to proper privacy object structure

**Role Assignment:**
- Campus Controller references roles by UUID
- Need role picker UI component
- Must fetch available roles and display by name

**CoS (Class of Service):**
- References topology/role by UUID
- Needs dropdown of available CoS options

**DSCP Code Points:**
- Array of 64 integer values (0-7)
- Represents DSCP to UP (User Priority) mapping
- Advanced QoS feature requiring specialized UI
