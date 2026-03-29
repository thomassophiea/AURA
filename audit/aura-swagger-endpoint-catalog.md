# AURA Swagger Endpoint Catalog

Generated: 2026-03-28
Source: public/swagger.json (v1.25.1)
Total Paths: 243 | Total Methods: 328 | Tags: 37

---

## Tag Summary

| Tag | Endpoint Count | Methods |
|-----|---------------|--------|
| AAAPolicyManager | 7 | GET, POST, PUT, DELETE |
| AccessControlManager | 4 | GET, PUT, POST, DELETE |
| AccessPointManager | 51 | GET, PUT, POST, DELETE |
| AdministratorManager | 11 | GET, POST, PUT, DELETE |
| AdspManager | 14 | GET, POST, PUT, DELETE |
| AnalyticsProfileManager | 7 | GET, POST, PUT, DELETE |
| ApplicationKeysManager | 4 | GET, POST, DELETE |
| AuditlogManager | 1 | GET |
| BestPracticeManager | 2 | GET, PUT |
| CoSManager | 7 | GET, POST, PUT, DELETE |
| Device Manager | 2 | GET, PUT |
| DeviceImageManager | 1 | GET |
| DpiSignatureManager | 3 | GET, PUT |
| EGuestManager | 7 | GET, POST, PUT, DELETE |
| EntityStateManager | 8 | GET |
| IotProfileManager | 7 | GET, POST, PUT, DELETE |
| MSPManager | 1 | GET |
| MeshpointManager | 10 | GET, POST, PUT, DELETE |
| NSightManager | 2 | GET, PUT |
| NotificationManager | 2 | GET |
| PositioningManager | 7 | GET, POST, PUT, DELETE |
| ProfileManager | 8 | GET, POST, PUT, DELETE |
| RadioManager | 3 | GET |
| RateLimiterManager | 7 | GET, POST, PUT, DELETE |
| ReportTemplateManager | 19 | GET, POST, PUT, DELETE |
| ReportsManager | 16 | GET |
| RfMgmtPolicyManager | 7 | GET, POST, PUT, DELETE |
| RoleManager | 10 | GET, POST, PUT, DELETE |
| RtlsProfileManager | 7 | GET, POST, PUT, DELETE |
| ServiceManager | 12 | GET, POST, PUT, DELETE |
| SiteManager | 25 | GET, POST, PUT, DELETE |
| StatisticsManager | 8 | GET, POST |
| SwitchManager | 25 | GET, DELETE, PUT, POST |
| SwitchPortProfileManager | 7 | GET, POST, PUT, DELETE |
| TopologyManager | 8 | GET, POST, PUT, DELETE |
| WorkFlowManager | 1 | GET |
| XLocationManager | 7 | GET, POST, PUT, DELETE |

---

## Endpoints by Tag

### AAAPolicyManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v1/aaapolicy` | - | Create a new AAA policy. | [request body] | 201, default |
| PUT | `/v1/aaapolicy/{id}` | - | Update a AAA Policy instance | id (path, required) | 200, default |
| DELETE | `/v1/aaapolicy/{id}` | - | Delete a AAA Policy instance | id (path, required) | 200, default |
| GET | `/v1/aaapolicy` | - | Get all AAA Policies | - | 200, default |
| GET | `/v1/aaapolicy/{id}` | - | Get a AAA policy by ID | id (path, required) | 200, default |
| GET | `/v1/aaapolicy/default` | - | Get the default AAA Policy configuration | - | 200, default |
| GET | `/v1/aaapolicy/nametoidmap` | - | Get AAA Policy name to ID map | - | 200, default |

### AccessControlManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v1/accesscontrol` | - | Create access control list | [request body] | 201, default |
| PUT | `/v1/accesscontrol` | - | Update access control information | [request body] | 200, default |
| DELETE | `/v1/accesscontrol` | - | Remove access control list | [request body] | 200, default |
| GET | `/v1/accesscontrol` | - | Retrieve access control information  | - | 200, default |

### AccessPointManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v1/aps/cert/apply` | - | Apply certificate to APs. (Provide AP signed certificate tar). | [request body] | 200, default |
| POST | `/v1/aps/cert/signrequest` | - | Generate CSR | [request body] | 200, default |
| POST | `/v1/aps/clone` | - | Clone access point configuration | from (query, required), to (query, required) | 200 |
| POST | `/v1/aps/create` | - | Create new access point | apName (query), description (query), hardwaretype (query), serialNumber (query, required) | 200, default |
| PUT | `/v1/aps/{apSerialNumber}` | - | Update access point configuration | apSerialNumber (path, required) | 200, default |
| PUT | `/v1/aps/{apSerialNumber}/copytodefault` | - | Copy access point configuration to the default configuration | apSerialNumber (path, required) | 200, default |
| PUT | `/v1/aps/{apSerialNumber}/locate` | - | Locate access point by serial number | apSerialNumber (path, required) | 200, default |
| PUT | `/v1/aps/{apSerialNumber}/logs` | - | Enable access point logs download | apSerialNumber (path, required), deleteAction (query) | 200, default |
| PUT | `/v1/aps/{apSerialNumber}/realcapture` | - | Enable access point real time capture | apSerialNumber (path, required), timeout (query) | 200, default |
| PUT | `/v1/aps/{apSerialNumber}/reboot` | - | Reboot access point by serial number | apSerialNumber (path, required) | 200, default |
| PUT | `/v1/aps/{apSerialNumber}/reset` | - | Enable access point reset during next check-in | apSerialNumber (path, required) | 200, default |
| PUT | `/v1/aps/{apSerialNumber}/setRuState` | - | Update access point state by serial number | apSerialNumber (path, required), ruState (query) | 200, default |
| PUT | `/v1/aps/{apSerialNumber}/upgrade` | - | Upgrade access point software by AP image version | apSerialNumber (path, required), apImageName (query) | 200, default |
| PUT | `/v1/aps/adoptionrules` | - | Update access point adoption rules. XCA 4.56 uses the new resource path "/v1/devices/adoptionrules" path. (Will be deprecated in a future release.) | [request body] | 204, default |
| PUT | `/v1/aps/apbalance` | - | Update the access point balance mode | mode (query) | 200, default |
| PUT | `/v1/aps/assign` | - | Assign a list of access points to a site and device group | [request body] | 200, default |
| PUT | `/v1/aps/cert/reset` | - | Reset certificate to default (removal) | [request body] | 200, default |
| PUT | `/v1/aps/multiconfig` | - | Update configuration for a group of access points  | [request body] | 200, default |
| PUT | `/v1/aps/reboot` | - | Reboot a list of access points | [request body] | 200, default |
| PUT | `/v1/aps/registration` | - | Update global access point registration information | [request body] | 200, default |
| PUT | `/v1/aps/releasetocloud` | - | List of access points released to ExtremeCloud IQ | [request body] | 200, default |
| PUT | `/v1/aps/setRuState` | - | Update access point state | ruState (query) | 200, default |
| PUT | `/v1/aps/swupgrade` | - | Upgrade access point software version | swVersion (query), upgradeNoServiceInterruption (query) | 204, default |
| PUT | `/v1/aps/swversion` | - | Get list of software image versions  | [request body] | 200, default |
| PUT | `/v1/aps/upgrade` | - | Update access point software by specific image name | apImageName (query) | 200, default |
| PUT | `/v1/aps/upgradeschedule` | - | Schedule upgrade for a set of access points | [request body] | 200, default |
| DELETE | `/v1/aps/{apSerialNumber}` | - | Delete access point by serial number | apSerialNumber (path, required) | 200, default |
| DELETE | `/v1/aps/list` | - | Delete list of access points by their serial numbers | [request body] | 200, default |
| GET | `/v1/ap/environment/{apSerialNumber}` | - | Get access point supported environments | apSerialNumber (path, required) | 200, default |
| GET | `/v1/aps` | - | Get list of all access points | brief (query), inventory (query), country (query), serviceId (query) | 200, default |
| GET | `/v1/aps/{apserialnum}/lldp` | - | Get access point lldp info per port | apserialnum (path, required) | 200, default |
| GET | `/v1/aps/{apserialnum}/stations` | - | Get access point stations | apserialnum (path, required) | 200, default |
| GET | `/v1/aps/{apSerialNumber}` | - | Get access point by serial number | apSerialNumber (path, required) | 200, default |
| GET | `/v1/aps/{apSerialNumber}/bssid0` | - | Get service IDs, assigned to primary BSSID. Removing of these services may cause radio reset | apSerialNumber (path, required) | 200, default |
| GET | `/v1/aps/{apSerialNumber}/cert` | - | Get ap certificate information | apSerialNumber (path, required) | 200, default |
| GET | `/v1/aps/{apSerialNumber}/location` | - | Get a list of station locations for an AP by serial number | apSerialNumber (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/aps/{apSerialNumber}/report` | - | Get reports that are based on the widgetList for a given access point | apSerialNumber (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/aps/{apSerialNumber}/traceurls` | - | Get access point traces download URL | apSerialNumber (path, required) | 200, default |
| GET | `/v1/aps/adoptionrules` | - | Get access point adoption rules.  XCA 4.56 uses the new resource path "/v1/devices/adoptionrules" path. (Will be deprecated in a future release.) | - | 200, default |
| GET | `/v1/aps/antenna/{apSerialNumber}` | - | Get access point antenna information by serial number | apSerialNumber (path, required), environment (query) | 200, default |
| GET | `/v1/aps/apbalance` | - | Get access point balance mode | - | 200, default |
| GET | `/v1/aps/default` | - | Get access point with default values | hardwareType (query) | 200, default |
| GET | `/v1/aps/displaynames` | - | Get hardware type and display names | - | 200, default |
| GET | `/v1/aps/downloadtrace/{filename}` | - | Get trace file | filename (path, required) | 200, default |
| GET | `/v1/aps/hardwaretypes` | - | Get hardware type and model names | - | 200, default |
| GET | `/v1/aps/platforms` | - | Get access point platform names | - | 200, default |
| GET | `/v1/aps/query` | - | Get filtered list of all access points | query (query), requestedColumns (query) | 200, default |
| GET | `/v1/aps/query/columns` | - | Return the columns list for /v1/aps/query and /v1/aps/query/visualize | - | 200, default |
| GET | `/v1/aps/query/visualize` | - | Get filtered list of all access points | query (query), columnsVisualize (query) | 200, default |
| GET | `/v1/aps/registration` | - | Get global access point registration information | - | 200, default |
| GET | `/v1/aps/upgradeimagelist` | - | Get access point upgrade image files | - | 200, default |

### AdministratorManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v1/administrators` | - | Create an administrator for a customer | [request body] | 201, default |
| POST | `/v1/oauth2/introspecttoken` | - | Validates OAuth2 access token. Please refer to (https://tools.ietf.org/html/rfc7662) for more details. | [request body] | 200, default |
| POST | `/v1/oauth2/refreshToken` | - | Send a refresh token and obtain a new OAuth 2 access token | [request body] | 200, default |
| POST | `/v1/oauth2/token` | - | Obtain an access token using Oauth2 authorization grant type:password | [request body] | 200, default |
| PUT | `/v1/administrators/{userId}` | - | Update an administrator for a customer | userId (path, required) | 204, default |
| PUT | `/v1/administrators/adminpassword` | - | Change an administrator's password | [request body] | 204, default |
| PUT | `/v1/administratorsTimeout/{userId}` | - | Update an administrator by user ID | userId (path, required) | 204, default |
| DELETE | `/v1/administrators/{userId}` | - | Delete an administrator for a customer | userId (path, required) | 204, default |
| DELETE | `/v1/oauth2/token/{token}` | - | Delete an access token | token (path, required) | 204, default |
| GET | `/v1/administrators` | - | Get a list of administrators for a customer | - | 200, default |
| GET | `/v1/administrators/{userId}` | - | Get an administrator by user ID | userId (path, required) | 200, default |

### AdspManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v3/adsp` | - | Create a new Air Defense profile | [request body] | 201, default |
| POST | `/v4/adsp` | - | Create a new Air Defense profile | [request body] | 201, default |
| PUT | `/v3/adsp/{adspId}` | - | Update an Air Defense profile | adspId (path, required) | 200, default |
| PUT | `/v4/adsp/{adspId}` | - | Update an Air Defense profile | adspId (path, required) | 200, default |
| DELETE | `/v3/adsp/{adspId}` | - | Delete an Air Defense profile for a customer | adspId (path, required) | 200, default |
| DELETE | `/v4/adsp/{adspId}` | - | Delete an Air Defense profile | adspId (path, required) | 200, default |
| GET | `/v3/adsp` | - | Get list of all Air Defense profiles | - | 200, default |
| GET | `/v3/adsp/{adspId}` | - | Get an Air Defense Profile by ID | adspId (path, required) | 200, default |
| GET | `/v3/adsp/default` | - | Get an Air Defense profile with default values | - | 200, default |
| GET | `/v3/adsp/nametoidmap` | - | Get Air Defense profile name mapped to ID | - | 200, default |
| GET | `/v4/adsp` | - | Get list of all Air Defense profiles | - | 200, default |
| GET | `/v4/adsp/{adspId}` | - | Get an Air Defense Profile by ID | adspId (path, required) | 200, default |
| GET | `/v4/adsp/default` | - | Get an Air Defense profile with default values | - | 200, default |
| GET | `/v4/adsp/nametoidmap` | - | Get Air Defense profile name mapped to ID | - | 200, default |

### AnalyticsProfileManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v3/analytics` | - | Create a new Analytics Element | [request body] | 201, default |
| PUT | `/v3/analytics/{analyticsProfileId}` | - | Update an Analytics profile | analyticsProfileId (path, required) | 200, default |
| DELETE | `/v3/analytics/{analyticsProfileId}` | - | Delete an Analytics profile for a customer | analyticsProfileId (path, required) | 200, default |
| GET | `/v3/analytics` | - | Get list of all analytics profiles | - | 200, default |
| GET | `/v3/analytics/{analyticsProfileId}` | - | Get an Analytics profile by ID | analyticsProfileId (path, required) | 200, default |
| GET | `/v3/analytics/default` | - | Get an Analytics profile with default values | - | 200, default |
| GET | `/v3/analytics/nametoidmap` | - | Get an Analytics profile name to ID map | - | 200, default |

### ApplicationKeysManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v1/appkeys` | - | Create a new application key | [request body] | 201, default |
| DELETE | `/v1/appkeys/{appKey}` | - | Delete an application key | appKey (path, required) | 200, default |
| GET | `/v1/appkeys` | - | Get list of all application keys | user (query) | 200, default |
| GET | `/v1/appkeys/{appKey}` | - | Get an application key by appKey | appKey (path, required) | 200, default |

### AuditlogManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| GET | `/v1/auditlogs` | - | Get audit logs for a customer for a given time range | endTime (query), startTime (query) | 200, default |

### BestPracticeManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| PUT | `/v1/bestpractices/{id}/accept` | - | Accept evaluation for specifyed best practice condition and update evaluationResult as intentinal | id (path, required) | 200, default |
| GET | `/v1/bestpractices/evaluate` | - | Perform best practices evaluation. | - | 200, default |

### CoSManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v1/cos` | - | Create a new policy Class of Service | [request body] | 201, default |
| PUT | `/v1/cos/{cosId}` | - | Update a policy CoS | cosId (path, required) | 200, default |
| DELETE | `/v1/cos/{cosId}` | - | Delete a CoS for a customer | cosId (path, required) | 200, default |
| GET | `/v1/cos` | - | CoS Manager | - | 200, default |
| GET | `/v1/cos/{cosId}` | - | Get a policy CoS by ID | cosId (path, required) | 200, default |
| GET | `/v1/cos/default` | - | Get the default Class of Service configuration | - | 200, default |
| GET | `/v1/cos/nametoidmap` | - | Get CoS name to ID map | - | 200, default |

### Device Manager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| PUT | `/v1/devices/adoptionrules` | - | Update access point adoption rules | [request body] | 204, default |
| GET | `/v1/devices/adoptionrules` | - | Get access point adoption rules | - | 200, default |

### DeviceImageManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| GET | `/v1/deviceimages/{hwType}` | - | Get list of device images for a hardware type | hwType (path, required) | 200, default |

### DpiSignatureManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| PUT | `/v1/dpisignatures` | - | Save list of Dpi Application elements | [request body] | 200, default |
| GET | `/v1/dpisignatures` | - | Get list of all Dpi signature profiles | - | 200, default |
| GET | `/v1/dpisignatures/custom` | - | Get list of all custom Dpi signature profiles | - | 200, default |

### EGuestManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v1/eguest` | - | Create a new EGuest | [request body] | 201, default |
| PUT | `/v1/eguest/{eguestId}` | - | Update an EGuest | eguestId (path, required) | 200, default |
| DELETE | `/v1/eguest/{eguestId}` | - | Delete an EGuest | eguestId (path, required) | 200, default |
| GET | `/v1/eguest` | - | Get all EGuest Services | - | 200, default |
| GET | `/v1/eguest/{eguestId}` | - | Get an EGuest by ID | eguestId (path, required) | 200, default |
| GET | `/v1/eguest/default` | - | Get the default EGuest configuration | - | 200, default |
| GET | `/v1/eguest/nametoidmap` | - | Get EGuest name to ID map | - | 200, default |

### EntityStateManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| GET | `/v1/state/aps` | - | Get the state of all access points | - | 200, default |
| GET | `/v1/state/aps/{apSerialNumber}` | - | Get the state of an access point based on serial number | apSerialNumber (path, required) | 200, default |
| GET | `/v1/state/entityDistribution` | - | Get the state of all access points | - | 200, default |
| GET | `/v1/state/sites` | - | Get the state of all sites | - | 200, default |
| GET | `/v1/state/sites/{siteId}` | - | Get the state of a site based on ID | siteId (path, required) | 200, default |
| GET | `/v1/state/sites/{siteId}/aps` | - | Get the state of all access points for a site | siteId (path, required) | 200, default |
| GET | `/v1/state/switches` | - | Get the state of all switches | - | 200, default |
| GET | `/v1/state/switches/{switchSerialNumber}` | - | Get the state of a switch based on serial number | switchSerialNumber (path, required) | 200, default |

### IotProfileManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v3/iotprofile` | - | Create a new IoT profile to the customer | [request body] | 201, default |
| PUT | `/v3/iotprofile/{iotprofileId}` | - | Update an IoT profile based on ID | iotprofileId (path, required) | 200, default |
| DELETE | `/v3/iotprofile/{iotprofileId}` | - | Delete an IoT profile | iotprofileId (path, required) | 200, default |
| GET | `/v3/iotprofile` | - | Get list of all IoT profiles for a customer | - | 200, default |
| GET | `/v3/iotprofile/{iotprofileId}` | - | Get an IoT profile based on ID | iotprofileId (path, required) | 200, default |
| GET | `/v3/iotprofile/default` | - | Get an IoT profile with default values | - | 200, default |
| GET | `/v3/iotprofile/nametoidmap` | - | Get IoT profile name mapped to ID | - | 200, default |

### MSPManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| GET | `/v1/msp/briefsites/{tenantId}` | - | Get a list of all MSPBriefSites instances for a tenant. | tenantId (path, required) | 200 |

### MeshpointManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v3/meshpoints` | - | Create a new meshpoint | [request body] | 200, default |
| PUT | `/v3/meshpoints/{meshpointId}` | - | Update a meshpoint by its ID | meshpointId (path, required) | 200, default |
| DELETE | `/v3/meshpoints/{meshpointId}` | - | Delete a meshpoint by its ID | meshpointId (path, required) | 200, default |
| GET | `/v3/meshpoints` | - | Get list of all meshpoints for a customer | - | 200, default |
| GET | `/v3/meshpoints/{meshpointId}` | - | Get a meshpoint by its ID | meshpointId (path, required) | 200, default |
| GET | `/v3/meshpoints/{meshpointId}/bssid` | - | Get a meshpoint AP's information by its ID | meshpointId (path, required) | 200, default |
| GET | `/v3/meshpoints/default` | - | Get meshpoint with default values | - | 200, default |
| GET | `/v3/meshpoints/nametoidmap` | - | Get meshpoint names mapped to IDs | - | 200, default |
| GET | `/v3/meshpoints/profile/default` | - | Get profile meshpoint with default values | - | 200, default |
| GET | `/v3/meshpoints/tree/{meshpointId}` | - | Get a meshpoint tree by its ID | meshpointId (path, required) | 200, default |

### NSightManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| PUT | `/v1/nsightconfig` | - | Update configuration of NSight server | [request body] | 200, default |
| GET | `/v1/nsightconfig` | - | Get configuration of NSight server | - | 200, default |

### NotificationManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| GET | `/v1/notifications` | - | Get list of all notification | - | 200, default |
| GET | `/v1/notifications/regional` | - | Get list of notifications for a region | - | 200, default |

### PositioningManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v3/positioning` | - | Create a new positioning profile | [request body] | 201, default |
| PUT | `/v3/positioning/{positioningProfileId}` | - | Update a positioning profile | positioningProfileId (path, required) | 200, default |
| DELETE | `/v3/positioning/{positioningProfileId}` | - | Delete a positioning profile for a customer | positioningProfileId (path, required) | 200, default |
| GET | `/v3/positioning` | - | Get list of all positioning profiles | - | 200, default |
| GET | `/v3/positioning/{positioningProfileId}` | - | Get positioning profile by ID | positioningProfileId (path, required) | 200, default |
| GET | `/v3/positioning/default` | - | Get positioning profile with default values | - | 200, default |
| GET | `/v3/positioning/nametoidmap` | - | Get positioning profile name mapped to ID | - | 200, default |

### ProfileManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v3/profiles` | - | Create a new profile | [request body] | 200, default |
| PUT | `/v3/profiles/{profileId}` | - | Update a profile by its ID | profileId (path, required) | 200, default |
| DELETE | `/v3/profiles/{profileId}` | - | Delete a profile by its ID | profileId (path, required) | 200, default |
| GET | `/v3/profiles` | - | Get list of all profiles for a customer | - | 200, default |
| GET | `/v3/profiles/{profileId}` | - | Get a profile by its ID | profileId (path, required) | 200, default |
| GET | `/v3/profiles/{profileId}/bssid0` | - | Get service IDs, assigned to primary BSSID. Removing of these services may cause radio reset | profileId (path, required) | 200, default |
| GET | `/v3/profiles/{profileId}/channels` | - | Get list of channels supported by profile's radios | profileId (path, required), radioMode (query, required) | 200, default |
| GET | `/v3/profiles/nametoidmap` | - | Get profile names mapped to IDs | - | 200, default |

### RadioManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| GET | `/v1/radios/channels` | - | Get channels for a radio mode and channel width | channelWidth (query), country (query), radioMode (query), sn (query), txbf (query), radioIndex (query), ocs (query), sensor (query) | 200, default |
| GET | `/v1/radios/modes` | - | Get radio mode for a radio index | country (query), hwType (query), radioIndex (query), sn (query) | 200, default |
| GET | `/v3/radios/smartrfchannels` | - | Get smartrfchannels for the given radio band type | radioBand (query) | 200, default |

### RateLimiterManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v1/ratelimiters` | - | Create a new rate limiter for an access point | [request body] | 201, default |
| PUT | `/v1/ratelimiters/{rateLimiterId}` | - | Update a rate limiter by ID | rateLimiterId (path, required) | 200, default |
| DELETE | `/v1/ratelimiters/{rateLimiterId}` | - | Delete a rate limiter for a customer | rateLimiterId (path, required) | 200, default |
| GET | `/v1/ratelimiters` | - | Get list of rate limiters for a customer | - | 200, default |
| GET | `/v1/ratelimiters/{rateLimiterId}` | - | Get a rate limiter by ID | rateLimiterId (path, required) | 200, default |
| GET | `/v1/ratelimiters/default` | - | Get a rate limiter with default values | - | 200, default |
| GET | `/v1/ratelimiters/nametoidmap` | - | Get rate limiter names mapped to ID | - | 200, default |

### ReportTemplateManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v1/reports/scheduled` | - | Create scheduled report. | [request body] | 201, default |
| POST | `/v1/reports/templates` | - | Create a new report template. | [request body] | 201, default |
| PUT | `/v1/reports/generated/filelist` | - | Delete a list of generated report files | [request body] | 200, default |
| PUT | `/v1/reports/scheduled/{reportId}` | - | Update scheduled report setting. | reportId (path, required) | 200, default |
| PUT | `/v1/reports/templates/{templateId}` | - | Update a report template. | templateId (path, required) | 204, default |
| DELETE | `/v1/reports/generated/{filename}` | - | Delete a generated report. | filename (path, required) | 204, default |
| DELETE | `/v1/reports/scheduled/{reportId}` | - | Delete a scheduled report. | reportId (path, required) | 204, default |
| DELETE | `/v1/reports/templates/{templateId}` | - | Delete a template. | templateId (path, required) | 204, default |
| GET | `/v1/reports/generated` | - | Get a list of generated user reports. | - | 200, default |
| GET | `/v1/reports/generated/{filename}` | - | Get a scheduled user report by file name. | filename (path, required) | 200, default |
| GET | `/v1/reports/scheduled` | - | Get a list of scheduled reports. | - | 200, default |
| GET | `/v1/reports/scheduled/{reportId}` | - | Get scheduled report setting. | reportId (path, required) | 200, default |
| GET | `/v1/reports/scheduled/default` | - | Get report with default values | - | 200, default |
| GET | `/v1/reports/scheduled/nametoidmap` | - | Get report name mapped to ID | - | 200, default |
| GET | `/v1/reports/templates` | - | Get a list of report templates. | - | 200, default |
| GET | `/v1/reports/templates/{templateId}` | - | Get a report template by ID. | templateId (path, required) | 200, default |
| GET | `/v1/reports/templates/default` | - | Get template with default values | - | 200, default |
| GET | `/v1/reports/templates/nametoidmap` | - | Get template name mapped to ID | - | 200, default |
| GET | `/v1/reports/widgets` | - | Get a list of available widget definitions. | scope (query) | 200, default |

### ReportsManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| GET | `/v1/report/aps/{apSerialNumber}` | - | Get reports (base on widgetList) for a given access point. | apSerialNumber (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/report/aps/{apSerialNumber}/smartrf` | - | Get Smart RF reports for a given access point. | apSerialNumber (path, required), duration (query) | 200, default |
| GET | `/v1/report/flex/{duration}` | - | Get Site Flex report. | duration (path, required), query (query) | 200, default |
| GET | `/v1/report/location/aps/{apSerialNumber}` | - | Get a list of all station locations for an AP by serial number. | apSerialNumber (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/report/location/floor/{floorId}` | - | Get a list of all station locations on the given floor. | floorId (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/report/location/stations/{stationId}` | - | Get a Location report for a station. | stationId (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/report/ports/{portId}` | - | Get Port report by switch serial number. | portId (path, required), duration (query), switchserialno (query), widgetList (query) | 200, default |
| GET | `/v1/report/roles/{roleId}` | - | Get Role report by role ID. | roleId (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/report/services/{serviceId}` | - | Get Service report. | serviceId (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/report/sites` | - | Get Site report. | duration (query), widgetList (query) | 200, default |
| GET | `/v1/report/sites/{siteId}` | - | Get Site report by site ID. | siteId (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/report/sites/{siteId}/smartrf` | - | Get Site Smart RF report. | siteId (path, required), duration (query) | 200, default |
| GET | `/v1/report/stations/{stationId}` | - | Get station with station ID. | stationId (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/report/switches/{switchSerialNumber}` | - | Get Switch report by serial number. | switchSerialNumber (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v2/report/upgrade/devices` | - | Get Device upgrade report. | - | 200, default |
| GET | `/v3/roles/{roleId}/rulestats` | - | Get rule stats by role ID | roleId (path, required) | 200, default |

### RfMgmtPolicyManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v3/rfmgmt` | - | Create a new RF management policy | [request body] | 201, default |
| PUT | `/v3/rfmgmt/{rfmgmtId}` | - | Update RF management policy profile | rfmgmtId (path, required) | 200, default |
| DELETE | `/v3/rfmgmt/{rfmgmtId}` | - | Delete RF management policy profile for a customer | rfmgmtId (path, required) | 200, default |
| GET | `/v3/rfmgmt` | - | Get list of all RF management policy profiles | - | 200, default |
| GET | `/v3/rfmgmt/{rfmgmtId}` | - | Get RF management policy profile by ID | rfmgmtId (path, required) | 200, default |
| GET | `/v3/rfmgmt/default` | - | Get RF management policy profile with default values | - | 200, default |
| GET | `/v3/rfmgmt/nametoidmap` | - | Get RF management policy profile name mapped to ID | - | 200, default |

### RoleManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v3/roles` | - | Create a role | [request body] | 201, default |
| POST | `/v3/roles/{roleId}` | - | Create a role (given a service id for creation of a special role) | roleId (path, required) | 201, default |
| PUT | `/v3/roles/{roleId}` | - | Update a role | roleId (path, required) | 200, default |
| DELETE | `/v3/roles/{roleId}` | - | Delete role for a customer | roleId (path, required) | 200, default |
| GET | `/v1/roles/{roleId}/report` | - | Get Role report by role ID. | roleId (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/roles/{roleid}/stations` | - | Get current stations with role | roleid (path, required) | 200, default |
| GET | `/v3/roles` | - | Get list of all roles for a customer | - | 200, default |
| GET | `/v3/roles/{roleId}` | - | Get role by its ID | roleId (path, required) | 200, default |
| GET | `/v3/roles/default` | - | Get role with default values | - | 200, default |
| GET | `/v3/roles/nametoidmap` | - | Get roles names mapped to ID | - | 200, default |

### RtlsProfileManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v1/rtlsprofile` | - | Create a new RTLS profile | [request body] | 201, default |
| PUT | `/v1/rtlsprofile/{rtlsprofileId}` | - | Update RTLS profile by ID | rtlsprofileId (path, required) | 200, default |
| DELETE | `/v1/rtlsprofile/{rtlsprofileId}` | - | Delete RTLS profile by ID | rtlsprofileId (path, required) | 200, default |
| GET | `/v1/rtlsprofile` | - | Get list of all RTLS profiles for a customer. | - | 200, default |
| GET | `/v1/rtlsprofile/{rtlsprofileId}` | - | Get RTLS profile by its ID | rtlsprofileId (path, required) | 200, default |
| GET | `/v1/rtlsprofile/default` | - | Get RTLS profile with default values | - | 200, default |
| GET | `/v1/rtlsprofile/nametoidmap` | - | Get RTLS profile name mapped to ID | - | 200, default |

### ServiceManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v1/services` | - | Create a service | [request body] | 201, default |
| PUT | `/v1/services/{serviceId}` | - | Update a service | serviceId (path, required) | 200, default |
| DELETE | `/v1/services/{serviceId}` | - | Delete a service by its ID | serviceId (path, required) | 200, default |
| GET | `/v1/services` | - | Get list of all services. | - | 200, default |
| GET | `/v1/services/{serviceId}` | - | Get service by its ID | serviceId (path, required) | 200, default |
| GET | `/v1/services/{serviceid}/bssid0` | - | Get list of profiles and APs that use the specified service as the primary BSSID. Disabling or removing the service could cause a radio reset. | serviceid (path, required) | 200, default |
| GET | `/v1/services/{serviceId}/deviceids` | - | Get list access point serial numbers for a service | serviceId (path, required) | 200, default |
| GET | `/v1/services/{serviceId}/report` | - | Get Service report. | serviceId (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/services/{serviceId}/siteids` | - | Get list of site IDs at which the service is currently deployed | serviceId (path, required) | 200, default |
| GET | `/v1/services/{serviceId}/stations` | - | Get current stations of a service. | serviceId (path, required) | 200, default |
| GET | `/v1/services/default` | - | Get service with default values | - | 200, default |
| GET | `/v1/services/nametoidmap` | - | Get service name mapped to ID | - | 200, default |

### SiteManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v3/sites` | - | Create a new site for the selected access point | [request body] | 201, default |
| POST | `/v3/sites/clone/{siteId}` | - | Clone a site | siteId (path, required), newSiteName (query) | 200, default |
| PUT | `/v1/globalsettings` | - | Set global settings for all sites | [request body] | 200, default |
| PUT | `/v3/sites/{siteId}` | - | Update a site by ID | siteId (path, required) | 200, default |
| DELETE | `/v3/sites/{siteId}` | - | Delete a site for a customer | siteId (path, required) | 200, default |
| GET | `/v1/globalsettings` | - | Get the list of global settings for all sites | - | 200, default |
| GET | `/v1/sites/{siteId}/report` | - | Get Site report by site ID | siteId (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/snmp` | - | Get SNMP configurations defined across all sites | - | 200, default |
| GET | `/v1/snmp/default` | - | Get SNMP configuration with default values | - | 200, default |
| GET | `/v1/stations/query` | - | Get filtered list of all stations | query (query), requestedColumns (query), duration (query), showActive (query) | 200, default |
| GET | `/v1/stations/query/columns` | - | Return the columns list for /v1/stations/query and /v1/stations/query/visualize | duration (query), showActive (query) | 200, default |
| GET | `/v1/stations/query/visualize` | - | Get filtered list of all stations | query (query), columnsVisualize (query), duration (query), showActive (query) | 200, default |
| GET | `/v3/sites` | - | Get list of sites for a customer | - | 200, default |
| GET | `/v3/sites/{siteId}` | - | Get site by ID | siteId (path, required) | 200, default |
| GET | `/v3/sites/{siteId}/report/impact` | - | Get impact reports for site | siteId (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v3/sites/{siteId}/report/venue` | - | Get report for a Site by Site ID in the venue | siteId (path, required), duration (query), widgetList (query), userGroups (query) | 200, default |
| GET | `/v3/sites/{siteid}/stations` | - | Get current stations of a site | siteid (path, required) | 200, default |
| GET | `/v3/sites/countrylist` | - | Get list of supported countries | - | 200, default |
| GET | `/v3/sites/default` | - | Get site configuration with default values | - | 200, default |
| GET | `/v3/sites/nametoidmap` | - | Get site names mapped to IDs | - | 200, default |
| GET | `/v3/sites/report` | - | Get Site report | duration (query), widgetList (query) | 200, default |
| GET | `/v3/sites/report/flex` | - | Get historical data | duration (query, required), query (query) | 200, default |
| GET | `/v3/sites/report/impact` | - | Get Impact reports for a site | duration (query), widgetList (query) | 200, default |
| GET | `/v3/sites/report/location/floor/{floorId}` | - | Get a list of all station locations on the given floor | floorId (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v3/sites/report/venue` | - | Get report for all sites in the venue | duration (query), widgetList (query), userGroups (query) | 200, default |

### StatisticsManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v1/stations/disassociate` | - | Disassociate list of stations | deleteHistory (query) | 200, default |
| GET | `/v1/aps/ifstats` | - | Get access point wireless and wired statistics across all sites | rfStats (query) | 200, default |
| GET | `/v1/aps/ifstats/{apSerialNumber}` | - | Get acess point wireless and wired interface statistics | apSerialNumber (path, required), rfStats (query) | 200, default |
| GET | `/v1/stations` | - | Get current stations of a tenant across all sites | duration (query), showActive (query) | 200, default |
| GET | `/v1/stations/{macaddress}` | - | Get station by MAC address | macaddress (path, required) | 200, default |
| GET | `/v1/stations/{stationId}/location` | - | Get Location report for a station | stationId (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/stations/{stationId}/report` | - | Get station with station ID | stationId (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/stations/events/{macaddress}` | - | Get all station events | macaddress (path, required), endTime (query), startTime (query) | 200, default |

### SwitchManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v1/switches/clone` | - | Clone a switch configuration | from (query, required), to (query, required) | 201 |
| PUT | `/v1/switches/{serialNumber}` | - | Update switch configuration | serialNumber (path, required) | 200, default |
| PUT | `/v1/switches/{serialNumber}/cliconfigs/backup` | - | Initiate request to CliConfiguration Module to backup the script | serialNumber (path, required) | 200, default |
| PUT | `/v1/switches/{serialNumber}/cliconfigs/restore/{name}` | - | Initiate request to send the specified CLI script to the switch | serialNumber (path, required), name (path, required) | 200, default |
| PUT | `/v1/switches/{serialNumber}/configurationmode/{configurationMode}` | - | Initiate request to change the configuration mode | serialNumber (path, required), configurationMode (path, required) | 200, default |
| PUT | `/v1/switches/{serialNumber}/console/{consoleAction}` | - | Set the flag on the backend, indicating the opening of remote console.  Admin permission levels - Full Admin | serialNumber (path, required), consoleAction (path, required), timeout (query) | 200, default |
| PUT | `/v1/switches/{serialNumber}/login` | - | Initiate request to send the specified CLI script to the switch | serialNumber (path, required) | 204, default |
| PUT | `/v1/switches/{serialNumber}/logs` | - | Enable download of logs from switch | serialNumber (path, required), deleteAction (query) | 200, default |
| PUT | `/v1/switches/{serialNumber}/ports/{portNumber}` | - | Method to configure a switch port | portNumber (path, required), serialNumber (path, required) | 204, default |
| PUT | `/v1/switches/{serialNumber}/reboot` | - | Enable switch reboot during next check-in | serialNumber (path, required) | 200, default |
| PUT | `/v1/switches/{serialNumber}/reset` | - | Enable switch reset during next check-in | serialNumber (path, required) | 200, default |
| PUT | `/v1/switches/{serialNumber}/slots/{slotNumber}/ports/{portNumber}` | - | Update the port configuration on a specified switch port slot | portNumber (path, required), serialNumber (path, required), slotNumber (path, required) | 204 |
| PUT | `/v1/switches/{serialNumber}/upgrade` | - | Enable switch upgrade during next check-in | serialNumber (path, required) | 200, default |
| PUT | `/v1/switches/assign` | - | Assign switches to a site | [request body] | 200, default |
| PUT | `/v1/switches/reboot` | - | Provide list of switches to be rebooted during next check-in | [request body] | 200, default |
| DELETE | `/v1/switches/{serialNumber}` | - | Delete a switch for a customer | serialNumber (path, required) | 200, default |
| DELETE | `/v1/switches/list` | - | Delete switches for a customer | - | 204, default |
| GET | `/v1/switches` | - | Get list of switches for a customer | includeBpe (query) | 200, default |
| GET | `/v1/switches/{serialNumber}` | - | Get switch by ID | serialNumber (path, required) | 200, default |
| GET | `/v1/switches/{serialNumber}/clibackups` | - | Get a list of all CLI backups for the switch | serialNumber (path, required) | 200, default |
| GET | `/v1/switches/{serialNumber}/ports/{portId}/report` | - | Get Port report by switch serial number | serialNumber (path, required), portId (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/switches/{serialNumber}/report` | - | Get Switch report by serial number | serialNumber (path, required), duration (query), widgetList (query) | 200, default |
| GET | `/v1/switches/{serialNumber}/slots/{slotNumber}/ports/{portNumber}` | - | Get a specified switch port slot | portNumber (path, required), serialNumber (path, required), slotNumber (path, required) | 200 |
| GET | `/v1/switches/{serialNumber}/traceurls` | - | Get list of traces download URL for a switch | serialNumber (path, required) | 200, default |
| GET | `/v1/switches/displaynames` | - | Get switch display names | - | 200, default |

### SwitchPortProfileManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v3/switchportprofile` | - | Create a new port profile. | [request body] | 200, default |
| PUT | `/v3/switchportprofile/{profileId}` | - | Update a port profile. | profileId (path, required) | 200, default |
| DELETE | `/v3/switchportprofile/{profileId}` | - | Delete a profile by its uuid | profileId (path, required) | 200 |
| GET | `/v3/switchportprofile` | - | Get list of all port profiles. | - | 200, default |
| GET | `/v3/switchportprofile/{profileId}` | - | Get a profile by its uuid | profileId (path, required) | 200, default |
| GET | `/v3/switchportprofile/default` | - | Get a switch port profile with default values | - | 200, default |
| GET | `/v3/switchportprofile/nametoidmap` | - | Get switch port profile names mapped to IDs | - | 200, default |

### TopologyManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v1/topologies` | - | Create a new topology | [request body] | 201, default |
| PUT | `/v1/topologies/{topologyId}` | - | Method to update a Topology | topologyId (path, required) | 200, default |
| DELETE | `/v1/topologies/{topologyId}` | - | Delete topology for a customer | topologyId (path, required) | 200, default |
| GET | `/v1/topologies` | - | Get a list of all topologies | - | 200, default |
| GET | `/v1/topologies/{topologyId}` | - | Get Topology by ID | topologyId (path, required) | 200, default |
| GET | `/v1/topologies/default` | - | Get topology with default values | - | 200, default |
| GET | `/v1/topologies/nametoidmap` | - | Get Topology name to ID map | - | 200, default |
| GET | `/v3/topologies` | - | Get list of all topologies | modes (query) | 200, default |

### WorkFlowManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| GET | `/v1/workflow` | - | Get sites or profiles that are using a given device or profile | type (query, required), id (query, required) | 200, default |

### XLocationManager

| Method | Path | OperationId | Summary | Params | Responses |
|--------|------|-------------|---------|--------|-----------|
| POST | `/v3/xlocation` | - | Create a new XLocation element | [request body] | 201, default |
| PUT | `/v3/xlocation/{xlocationId}` | - | Update an XLocation Profile | xlocationId (path, required) | 200, default |
| DELETE | `/v3/xlocation/{xlocationId}` | - | Delete XLocation profile for a customer | xlocationId (path, required) | 200, default |
| GET | `/v3/xlocation` | - | Get list of all XLocation profiles | - | 200, default |
| GET | `/v3/xlocation/{xlocationId}` | - | Get XLocation profile by ID | xlocationId (path, required) | 200, default |
| GET | `/v3/xlocation/default` | - | Get XLocation profile with default values | - | 200, default |
| GET | `/v3/xlocation/nametoidmap` | - | Get XLocation profile nams mapped to ID | - | 200, default |

---

## All GET Endpoints (for unused endpoint detection)

| Path | OperationId | Tag | Summary |
|------|-------------|-----|---------|
| `/v1/aaapolicy` | - | AAAPolicyManager | Get all AAA Policies |
| `/v1/aaapolicy/{id}` | - | AAAPolicyManager | Get a AAA policy by ID |
| `/v1/aaapolicy/default` | - | AAAPolicyManager | Get the default AAA Policy configuration |
| `/v1/aaapolicy/nametoidmap` | - | AAAPolicyManager | Get AAA Policy name to ID map |
| `/v1/accesscontrol` | - | AccessControlManager | Retrieve access control information  |
| `/v1/administrators` | - | AdministratorManager | Get a list of administrators for a customer |
| `/v1/administrators/{userId}` | - | AdministratorManager | Get an administrator by user ID |
| `/v1/ap/environment/{apSerialNumber}` | - | AccessPointManager | Get access point supported environments |
| `/v1/appkeys` | - | ApplicationKeysManager | Get list of all application keys |
| `/v1/appkeys/{appKey}` | - | ApplicationKeysManager | Get an application key by appKey |
| `/v1/aps` | - | AccessPointManager | Get list of all access points |
| `/v1/aps/{apserialnum}/lldp` | - | AccessPointManager | Get access point lldp info per port |
| `/v1/aps/{apserialnum}/stations` | - | AccessPointManager | Get access point stations |
| `/v1/aps/{apSerialNumber}` | - | AccessPointManager | Get access point by serial number |
| `/v1/aps/{apSerialNumber}/bssid0` | - | AccessPointManager | Get service IDs, assigned to primary BSSID. Removing of these services may cause radio reset |
| `/v1/aps/{apSerialNumber}/cert` | - | AccessPointManager | Get ap certificate information |
| `/v1/aps/{apSerialNumber}/location` | - | AccessPointManager | Get a list of station locations for an AP by serial number |
| `/v1/aps/{apSerialNumber}/report` | - | AccessPointManager | Get reports that are based on the widgetList for a given access point |
| `/v1/aps/{apSerialNumber}/traceurls` | - | AccessPointManager | Get access point traces download URL |
| `/v1/aps/adoptionrules` | - | AccessPointManager | Get access point adoption rules.  XCA 4.56 uses the new resource path "/v1/devices/adoptionrules" path. (Will be deprecated in a future release.) |
| `/v1/aps/antenna/{apSerialNumber}` | - | AccessPointManager | Get access point antenna information by serial number |
| `/v1/aps/apbalance` | - | AccessPointManager | Get access point balance mode |
| `/v1/aps/default` | - | AccessPointManager | Get access point with default values |
| `/v1/aps/displaynames` | - | AccessPointManager | Get hardware type and display names |
| `/v1/aps/downloadtrace/{filename}` | - | AccessPointManager | Get trace file |
| `/v1/aps/hardwaretypes` | - | AccessPointManager | Get hardware type and model names |
| `/v1/aps/ifstats` | - | StatisticsManager | Get access point wireless and wired statistics across all sites |
| `/v1/aps/ifstats/{apSerialNumber}` | - | StatisticsManager | Get acess point wireless and wired interface statistics |
| `/v1/aps/platforms` | - | AccessPointManager | Get access point platform names |
| `/v1/aps/query` | - | AccessPointManager | Get filtered list of all access points |
| `/v1/aps/query/columns` | - | AccessPointManager | Return the columns list for /v1/aps/query and /v1/aps/query/visualize |
| `/v1/aps/query/visualize` | - | AccessPointManager | Get filtered list of all access points |
| `/v1/aps/registration` | - | AccessPointManager | Get global access point registration information |
| `/v1/aps/upgradeimagelist` | - | AccessPointManager | Get access point upgrade image files |
| `/v1/auditlogs` | - | AuditlogManager | Get audit logs for a customer for a given time range |
| `/v1/bestpractices/evaluate` | - | BestPracticeManager | Perform best practices evaluation. |
| `/v1/cos` | - | CoSManager | CoS Manager |
| `/v1/cos/{cosId}` | - | CoSManager | Get a policy CoS by ID |
| `/v1/cos/default` | - | CoSManager | Get the default Class of Service configuration |
| `/v1/cos/nametoidmap` | - | CoSManager | Get CoS name to ID map |
| `/v1/deviceimages/{hwType}` | - | DeviceImageManager | Get list of device images for a hardware type |
| `/v1/devices/adoptionrules` | - | Device Manager | Get access point adoption rules |
| `/v1/dpisignatures` | - | DpiSignatureManager | Get list of all Dpi signature profiles |
| `/v1/dpisignatures/custom` | - | DpiSignatureManager | Get list of all custom Dpi signature profiles |
| `/v1/eguest` | - | EGuestManager | Get all EGuest Services |
| `/v1/eguest/{eguestId}` | - | EGuestManager | Get an EGuest by ID |
| `/v1/eguest/default` | - | EGuestManager | Get the default EGuest configuration |
| `/v1/eguest/nametoidmap` | - | EGuestManager | Get EGuest name to ID map |
| `/v1/globalsettings` | - | SiteManager | Get the list of global settings for all sites |
| `/v1/msp/briefsites/{tenantId}` | - | MSPManager | Get a list of all MSPBriefSites instances for a tenant. |
| `/v1/notifications` | - | NotificationManager | Get list of all notification |
| `/v1/notifications/regional` | - | NotificationManager | Get list of notifications for a region |
| `/v1/nsightconfig` | - | NSightManager | Get configuration of NSight server |
| `/v1/radios/channels` | - | RadioManager | Get channels for a radio mode and channel width |
| `/v1/radios/modes` | - | RadioManager | Get radio mode for a radio index |
| `/v1/ratelimiters` | - | RateLimiterManager | Get list of rate limiters for a customer |
| `/v1/ratelimiters/{rateLimiterId}` | - | RateLimiterManager | Get a rate limiter by ID |
| `/v1/ratelimiters/default` | - | RateLimiterManager | Get a rate limiter with default values |
| `/v1/ratelimiters/nametoidmap` | - | RateLimiterManager | Get rate limiter names mapped to ID |
| `/v1/report/aps/{apSerialNumber}` | - | ReportsManager | Get reports (base on widgetList) for a given access point. |
| `/v1/report/aps/{apSerialNumber}/smartrf` | - | ReportsManager | Get Smart RF reports for a given access point. |
| `/v1/report/flex/{duration}` | - | ReportsManager | Get Site Flex report. |
| `/v1/report/location/aps/{apSerialNumber}` | - | ReportsManager | Get a list of all station locations for an AP by serial number. |
| `/v1/report/location/floor/{floorId}` | - | ReportsManager | Get a list of all station locations on the given floor. |
| `/v1/report/location/stations/{stationId}` | - | ReportsManager | Get a Location report for a station. |
| `/v1/report/ports/{portId}` | - | ReportsManager | Get Port report by switch serial number. |
| `/v1/report/roles/{roleId}` | - | ReportsManager | Get Role report by role ID. |
| `/v1/report/services/{serviceId}` | - | ReportsManager | Get Service report. |
| `/v1/report/sites` | - | ReportsManager | Get Site report. |
| `/v1/report/sites/{siteId}` | - | ReportsManager | Get Site report by site ID. |
| `/v1/report/sites/{siteId}/smartrf` | - | ReportsManager | Get Site Smart RF report. |
| `/v1/report/stations/{stationId}` | - | ReportsManager | Get station with station ID. |
| `/v1/report/switches/{switchSerialNumber}` | - | ReportsManager | Get Switch report by serial number. |
| `/v1/reports/generated` | - | ReportTemplateManager | Get a list of generated user reports. |
| `/v1/reports/generated/{filename}` | - | ReportTemplateManager | Get a scheduled user report by file name. |
| `/v1/reports/scheduled` | - | ReportTemplateManager | Get a list of scheduled reports. |
| `/v1/reports/scheduled/{reportId}` | - | ReportTemplateManager | Get scheduled report setting. |
| `/v1/reports/scheduled/default` | - | ReportTemplateManager | Get report with default values |
| `/v1/reports/scheduled/nametoidmap` | - | ReportTemplateManager | Get report name mapped to ID |
| `/v1/reports/templates` | - | ReportTemplateManager | Get a list of report templates. |
| `/v1/reports/templates/{templateId}` | - | ReportTemplateManager | Get a report template by ID. |
| `/v1/reports/templates/default` | - | ReportTemplateManager | Get template with default values |
| `/v1/reports/templates/nametoidmap` | - | ReportTemplateManager | Get template name mapped to ID |
| `/v1/reports/widgets` | - | ReportTemplateManager | Get a list of available widget definitions. |
| `/v1/roles/{roleId}/report` | - | RoleManager | Get Role report by role ID. |
| `/v1/roles/{roleid}/stations` | - | RoleManager | Get current stations with role |
| `/v1/rtlsprofile` | - | RtlsProfileManager | Get list of all RTLS profiles for a customer. |
| `/v1/rtlsprofile/{rtlsprofileId}` | - | RtlsProfileManager | Get RTLS profile by its ID |
| `/v1/rtlsprofile/default` | - | RtlsProfileManager | Get RTLS profile with default values |
| `/v1/rtlsprofile/nametoidmap` | - | RtlsProfileManager | Get RTLS profile name mapped to ID |
| `/v1/services` | - | ServiceManager | Get list of all services. |
| `/v1/services/{serviceId}` | - | ServiceManager | Get service by its ID |
| `/v1/services/{serviceid}/bssid0` | - | ServiceManager | Get list of profiles and APs that use the specified service as the primary BSSID. Disabling or removing the service could cause a radio reset. |
| `/v1/services/{serviceId}/deviceids` | - | ServiceManager | Get list access point serial numbers for a service |
| `/v1/services/{serviceId}/report` | - | ServiceManager | Get Service report. |
| `/v1/services/{serviceId}/siteids` | - | ServiceManager | Get list of site IDs at which the service is currently deployed |
| `/v1/services/{serviceId}/stations` | - | ServiceManager | Get current stations of a service. |
| `/v1/services/default` | - | ServiceManager | Get service with default values |
| `/v1/services/nametoidmap` | - | ServiceManager | Get service name mapped to ID |
| `/v1/sites/{siteId}/report` | - | SiteManager | Get Site report by site ID |
| `/v1/snmp` | - | SiteManager | Get SNMP configurations defined across all sites |
| `/v1/snmp/default` | - | SiteManager | Get SNMP configuration with default values |
| `/v1/state/aps` | - | EntityStateManager | Get the state of all access points |
| `/v1/state/aps/{apSerialNumber}` | - | EntityStateManager | Get the state of an access point based on serial number |
| `/v1/state/entityDistribution` | - | EntityStateManager | Get the state of all access points |
| `/v1/state/sites` | - | EntityStateManager | Get the state of all sites |
| `/v1/state/sites/{siteId}` | - | EntityStateManager | Get the state of a site based on ID |
| `/v1/state/sites/{siteId}/aps` | - | EntityStateManager | Get the state of all access points for a site |
| `/v1/state/switches` | - | EntityStateManager | Get the state of all switches |
| `/v1/state/switches/{switchSerialNumber}` | - | EntityStateManager | Get the state of a switch based on serial number |
| `/v1/stations` | - | StatisticsManager | Get current stations of a tenant across all sites |
| `/v1/stations/{macaddress}` | - | StatisticsManager | Get station by MAC address |
| `/v1/stations/{stationId}/location` | - | StatisticsManager | Get Location report for a station |
| `/v1/stations/{stationId}/report` | - | StatisticsManager | Get station with station ID |
| `/v1/stations/events/{macaddress}` | - | StatisticsManager | Get all station events |
| `/v1/stations/query` | - | SiteManager | Get filtered list of all stations |
| `/v1/stations/query/columns` | - | SiteManager | Return the columns list for /v1/stations/query and /v1/stations/query/visualize |
| `/v1/stations/query/visualize` | - | SiteManager | Get filtered list of all stations |
| `/v1/switches` | - | SwitchManager | Get list of switches for a customer |
| `/v1/switches/{serialNumber}` | - | SwitchManager | Get switch by ID |
| `/v1/switches/{serialNumber}/clibackups` | - | SwitchManager | Get a list of all CLI backups for the switch |
| `/v1/switches/{serialNumber}/ports/{portId}/report` | - | SwitchManager | Get Port report by switch serial number |
| `/v1/switches/{serialNumber}/report` | - | SwitchManager | Get Switch report by serial number |
| `/v1/switches/{serialNumber}/slots/{slotNumber}/ports/{portNumber}` | - | SwitchManager | Get a specified switch port slot |
| `/v1/switches/{serialNumber}/traceurls` | - | SwitchManager | Get list of traces download URL for a switch |
| `/v1/switches/displaynames` | - | SwitchManager | Get switch display names |
| `/v1/topologies` | - | TopologyManager | Get a list of all topologies |
| `/v1/topologies/{topologyId}` | - | TopologyManager | Get Topology by ID |
| `/v1/topologies/default` | - | TopologyManager | Get topology with default values |
| `/v1/topologies/nametoidmap` | - | TopologyManager | Get Topology name to ID map |
| `/v1/workflow` | - | WorkFlowManager | Get sites or profiles that are using a given device or profile |
| `/v2/report/upgrade/devices` | - | ReportsManager | Get Device upgrade report. |
| `/v3/adsp` | - | AdspManager | Get list of all Air Defense profiles |
| `/v3/adsp/{adspId}` | - | AdspManager | Get an Air Defense Profile by ID |
| `/v3/adsp/default` | - | AdspManager | Get an Air Defense profile with default values |
| `/v3/adsp/nametoidmap` | - | AdspManager | Get Air Defense profile name mapped to ID |
| `/v3/analytics` | - | AnalyticsProfileManager | Get list of all analytics profiles |
| `/v3/analytics/{analyticsProfileId}` | - | AnalyticsProfileManager | Get an Analytics profile by ID |
| `/v3/analytics/default` | - | AnalyticsProfileManager | Get an Analytics profile with default values |
| `/v3/analytics/nametoidmap` | - | AnalyticsProfileManager | Get an Analytics profile name to ID map |
| `/v3/iotprofile` | - | IotProfileManager | Get list of all IoT profiles for a customer |
| `/v3/iotprofile/{iotprofileId}` | - | IotProfileManager | Get an IoT profile based on ID |
| `/v3/iotprofile/default` | - | IotProfileManager | Get an IoT profile with default values |
| `/v3/iotprofile/nametoidmap` | - | IotProfileManager | Get IoT profile name mapped to ID |
| `/v3/meshpoints` | - | MeshpointManager | Get list of all meshpoints for a customer |
| `/v3/meshpoints/{meshpointId}` | - | MeshpointManager | Get a meshpoint by its ID |
| `/v3/meshpoints/{meshpointId}/bssid` | - | MeshpointManager | Get a meshpoint AP's information by its ID |
| `/v3/meshpoints/default` | - | MeshpointManager | Get meshpoint with default values |
| `/v3/meshpoints/nametoidmap` | - | MeshpointManager | Get meshpoint names mapped to IDs |
| `/v3/meshpoints/profile/default` | - | MeshpointManager | Get profile meshpoint with default values |
| `/v3/meshpoints/tree/{meshpointId}` | - | MeshpointManager | Get a meshpoint tree by its ID |
| `/v3/positioning` | - | PositioningManager | Get list of all positioning profiles |
| `/v3/positioning/{positioningProfileId}` | - | PositioningManager | Get positioning profile by ID |
| `/v3/positioning/default` | - | PositioningManager | Get positioning profile with default values |
| `/v3/positioning/nametoidmap` | - | PositioningManager | Get positioning profile name mapped to ID |
| `/v3/profiles` | - | ProfileManager | Get list of all profiles for a customer |
| `/v3/profiles/{profileId}` | - | ProfileManager | Get a profile by its ID |
| `/v3/profiles/{profileId}/bssid0` | - | ProfileManager | Get service IDs, assigned to primary BSSID. Removing of these services may cause radio reset |
| `/v3/profiles/{profileId}/channels` | - | ProfileManager | Get list of channels supported by profile's radios |
| `/v3/profiles/nametoidmap` | - | ProfileManager | Get profile names mapped to IDs |
| `/v3/radios/smartrfchannels` | - | RadioManager | Get smartrfchannels for the given radio band type |
| `/v3/rfmgmt` | - | RfMgmtPolicyManager | Get list of all RF management policy profiles |
| `/v3/rfmgmt/{rfmgmtId}` | - | RfMgmtPolicyManager | Get RF management policy profile by ID |
| `/v3/rfmgmt/default` | - | RfMgmtPolicyManager | Get RF management policy profile with default values |
| `/v3/rfmgmt/nametoidmap` | - | RfMgmtPolicyManager | Get RF management policy profile name mapped to ID |
| `/v3/roles` | - | RoleManager | Get list of all roles for a customer |
| `/v3/roles/{roleId}` | - | RoleManager | Get role by its ID |
| `/v3/roles/{roleId}/rulestats` | - | ReportsManager | Get rule stats by role ID |
| `/v3/roles/default` | - | RoleManager | Get role with default values |
| `/v3/roles/nametoidmap` | - | RoleManager | Get roles names mapped to ID |
| `/v3/sites` | - | SiteManager | Get list of sites for a customer |
| `/v3/sites/{siteId}` | - | SiteManager | Get site by ID |
| `/v3/sites/{siteId}/report/impact` | - | SiteManager | Get impact reports for site |
| `/v3/sites/{siteId}/report/venue` | - | SiteManager | Get report for a Site by Site ID in the venue |
| `/v3/sites/{siteid}/stations` | - | SiteManager | Get current stations of a site |
| `/v3/sites/countrylist` | - | SiteManager | Get list of supported countries |
| `/v3/sites/default` | - | SiteManager | Get site configuration with default values |
| `/v3/sites/nametoidmap` | - | SiteManager | Get site names mapped to IDs |
| `/v3/sites/report` | - | SiteManager | Get Site report |
| `/v3/sites/report/flex` | - | SiteManager | Get historical data |
| `/v3/sites/report/impact` | - | SiteManager | Get Impact reports for a site |
| `/v3/sites/report/location/floor/{floorId}` | - | SiteManager | Get a list of all station locations on the given floor |
| `/v3/sites/report/venue` | - | SiteManager | Get report for all sites in the venue |
| `/v3/switchportprofile` | - | SwitchPortProfileManager | Get list of all port profiles. |
| `/v3/switchportprofile/{profileId}` | - | SwitchPortProfileManager | Get a profile by its uuid |
| `/v3/switchportprofile/default` | - | SwitchPortProfileManager | Get a switch port profile with default values |
| `/v3/switchportprofile/nametoidmap` | - | SwitchPortProfileManager | Get switch port profile names mapped to IDs |
| `/v3/topologies` | - | TopologyManager | Get list of all topologies |
| `/v3/xlocation` | - | XLocationManager | Get list of all XLocation profiles |
| `/v3/xlocation/{xlocationId}` | - | XLocationManager | Get XLocation profile by ID |
| `/v3/xlocation/default` | - | XLocationManager | Get XLocation profile with default values |
| `/v3/xlocation/nametoidmap` | - | XLocationManager | Get XLocation profile nams mapped to ID |
| `/v4/adsp` | - | AdspManager | Get list of all Air Defense profiles |
| `/v4/adsp/{adspId}` | - | AdspManager | Get an Air Defense Profile by ID |
| `/v4/adsp/default` | - | AdspManager | Get an Air Defense profile with default values |
| `/v4/adsp/nametoidmap` | - | AdspManager | Get Air Defense profile name mapped to ID |
