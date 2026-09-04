/**
 * Configuration-domain catalog — the 30 non-WLAN scenarios from the Ascend IQC
 * Skills Catalog audit (Ascend_IQC_Skills_Catalog-Consolidated_configuration_skills_audit.md,
 * skills 5-26 and 30-37; the 7 WLAN/Service-domain skills — WLAN Configuration,
 * WLAN Group Assignment, WLAN Assignment & Profile Integration, Allow Removal when
 * Assigned WLAN/RF Profile, Hotspot Configuration, WLAN Auth types, and MAC-Based
 * Authentication — are handled directly by wirelessIntentParser's existing
 * create/update/delete/assign/schedule_wlan action union, not duplicated here).
 *
 * This is deliberately NOT a set of new typed intents or provisioning pipelines.
 * Building 30 full validate->provision->verify pipelines — several with mandatory,
 * safety-relevant business rules (Role's L2->L3/L4->L7->Default evaluation order,
 * RRM's "static values MUST NOT be overridden") — without per-domain scoping and
 * testing would be reckless. This module exists so a request AURA cannot yet
 * configure is answered honestly (recognized, not implemented, here is the real
 * API it would use) instead of silently mis-routed or ignored. See
 * docs/AURA_NETWORK_INTELLIGENCE_CONFIGURATION_ROADMAP.md for the full gap
 * analysis and build-out plan.
 *
 * Order matters: detectConfigurationDomain returns the first match, so a more
 * specific domain (e.g. vlan_group) must be listed before a more general one
 * whose pattern it would otherwise also satisfy (e.g. vlan).
 */

export const CONFIGURATION_DOMAINS = [
  {
    id: 'aaa_policy',
    skillNumber: 5,
    name: 'AAA Policy Configuration & Assignment',
    pattern: /\b(aaa polic(y|ies)|radius (server|polic(y|ies))|authentication server|ldap server)\b/i,
    localApi: 'POST /v1/aaapolicy; PUT /v1/aaapolicy/{id}; DELETE /v1/aaapolicy/{id}',
    auraSupport: 'src/services/configure/aaaPolicyService.ts — manual CRUD exists',
  },
  {
    id: 'role',
    skillNumber: 6,
    name: 'Role Configuration',
    pattern: /(?=.*\brole\b)(?=.*\b(rules?|filters?|traffic|bandwidth|vlan assignment|l2|l3|l4|l7)\b)|configure.*\broles?\b/i,
    localApi: 'POST /v3/roles; PUT /v3/roles/{roleId}; DELETE /v3/roles/{roleId}',
    auraSupport: 'src/services/configure/rolesService.ts — manual CRUD exists',
  },
  {
    id: 'ppsk',
    skillNumber: 7,
    name: 'PPSK (Private Pre-Shared Key)',
    pattern: /\bppsk\b|private pre-?shared keys?|per-user (keys?|passphrases?)/i,
    localApi: 'PUT /v1/services/{serviceId} (privacy.PskElement/WpaPskElement passphrase assignment) -- Needs validation: per-user Extreme-PPSK key lifecycle (create/import/export/pause/resume, CSV import, email/QR notification) has no dedicated endpoint in this API version',
    auraSupport: 'AURA has a dedicated PPSK subsystem (server/ppsk/, src/services/ppskService.ts) — richer than the audited API alone; CSV import/pause/resume/email-QR already implemented server-side',
  },
  {
    id: 'captive_portal',
    skillNumber: 8,
    name: 'Captive Web Portal Configuration & Assignment',
    pattern: /\b(captive (web )?portal|guest portal|splash page|cwp)s?\b/i,
    localApi: 'POST /v1/eguest; PUT /v1/eguest/{eguestId}; DELETE /v1/eguest/{eguestId}; PUT /v1/services/{serviceId} (enableCaptivePortal, captivePortalType, cpNonAuthenticatedPolicyName); PUT /v3/roles/{roleId} (cpRedirect*, cpOauthUseGoogle/Facebook/Microsoft external CWP fields)',
    auraSupport: 'src/services/configure/eguestService.ts + server/portal/, server/guests/ — substantial existing guest-access subsystem',
  },
  {
    id: 'vlan_group',
    skillNumber: 10,
    name: 'VLAN Group Configuration & Assignment',
    pattern: /\bvlan groups?\b/i,
    localApi: 'POST /v1/topologies; PUT /v1/topologies/{topologyId}; DELETE /v1/topologies/{topologyId} (group/members fields on TopologyElement) -- Needs validation: VLAN Group is represented as attributes on the Topology object itself; no separate VLAN-Group endpoint exists',
    auraSupport: 'src/services/configure/vlanGroupsService.ts — manual CRUD exists',
  },
  {
    id: 'vlan',
    skillNumber: 9,
    name: 'VLAN Configuration & Assignment',
    pattern: /\b(create|add|new|define|configure)\b(?![^.]*\b(wlan|ssid|wifi|wi-fi|wireless network|guest network)\b)[^.]*\bvlan\b/i,
    localApi: 'POST /v1/topologies; PUT /v1/topologies/{topologyId}; DELETE /v1/topologies/{topologyId}',
    auraSupport: 'src/services/configure/topologiesService.ts — manual CRUD exists',
  },
  {
    id: 'cos',
    skillNumber: 11,
    name: 'Class of Service (CoS) Configuration & Assignment',
    pattern: /\b(class of service|\bcos\b).*\b(profiles?|polic(y|ies)|dscp|802\.1p|bandwidth)\b|configure.*\bcos\b/i,
    localApi: 'POST /v1/cos; PUT /v1/cos/{cosId}; DELETE /v1/cos/{cosId}',
    auraSupport: 'src/services/configure/cosService.ts — manual CRUD exists',
  },
  {
    id: 'rate_limiter',
    skillNumber: 12,
    name: 'Rates Configuration & Assignment',
    pattern: /\brate limiters?\b|\brate profiles?\b|bandwidth rate polic/i,
    localApi: 'POST /v1/ratelimiters; PUT /v1/ratelimiters/{rateLimiterId}; DELETE /v1/ratelimiters/{rateLimiterId}',
    auraSupport: 'src/services/configure/rateLimitersService.ts — manual CRUD exists',
  },
  {
    id: 'profile',
    skillNumber: 13,
    name: 'Wireless Profile Configuration & Assignment',
    pattern: /\b(wireless|device) profiles?\b(?!.*\b(radio|wired port)\b)/i,
    localApi: 'POST /v3/profiles; PUT /v3/profiles/{profileId}; DELETE /v3/profiles/{profileId}',
    auraSupport: 'src/services/configure/profilesService.ts — manual CRUD exists',
  },
  {
    id: 'radio',
    skillNumber: 14,
    name: 'Radio Configuration & Assignment within Profiles',
    pattern: /\bradios?\b.*\b(operational mode|admin state|2\.4|5 ?ghz|6 ?ghz)\b.*\bprofiles?\b|\bprofiles?\b.*\bradios?\b.*\b(mode|band)\b/i,
    localApi: 'PUT /v3/profiles/{profileId} (radios[] / radioIfList nested fields) -- configured as part of the Profile object; no standalone radio-object endpoint',
    auraSupport: 'Nested field on Profile object (radios[]/radioIfList) — no standalone AURA CRUD, edited within profilesService',
  },
  {
    id: 'rrm',
    skillNumber: 15,
    name: 'RRM Configuration & Assignment',
    pattern: /\brrm\b|smart rf|radio resource management/i,
    localApi: 'POST /v3/rfmgmt; PUT /v3/rfmgmt/{rfmgmtId}; DELETE /v3/rfmgmt/{rfmgmtId}',
    auraSupport: 'src/services/configure/rfmgmtService.ts — manual CRUD exists',
  },
  {
    id: 'wired_port',
    skillNumber: 16,
    name: 'AP Wired Port Configuration within Profiles',
    pattern: /\bwired ports?\b|\beth[01]\b.*\b(speed|duplex)\b|802\.3az/i,
    localApi: 'PUT /v3/profiles/{profileId} (wiredPorts[] nested fields)',
    auraSupport: 'Nested field on Profile object (wiredPorts[]) — no standalone AURA CRUD',
  },
  {
    id: 'air_defense',
    skillNumber: 17,
    name: 'Air Defense Profile Configuration & Assignment',
    pattern: /\bair ?defense\b|\bwids\b|wireless intrusion prevention/i,
    localApi: 'POST /v3/adsp; PUT /v3/adsp/{adspId}; DELETE /v3/adsp/{adspId} (also available as /v4/adsp; /v4/adsp/{adspId})',
    auraSupport: 'src/services/configure/adspService.ts — manual CRUD exists',
  },
  {
    id: 'positioning',
    skillNumber: 18,
    name: 'Positioning Profile Configuration & Assignment',
    pattern: /\bpositioning profiles?\b|positioning service/i,
    localApi: 'POST /v3/positioning; PUT /v3/positioning/{positioningProfileId}; DELETE /v3/positioning/{positioningProfileId}',
    auraSupport: 'src/services/configure/positioningService.ts — manual CRUD exists',
  },
  {
    id: 'analytics',
    skillNumber: 19,
    name: 'Analytics Profile Configuration & Assignment',
    pattern: /\banalytics profiles?\b|netflow/i,
    localApi: 'POST /v3/analytics; PUT /v3/analytics/{analyticsProfileId}; DELETE /v3/analytics/{analyticsProfileId}',
    auraSupport: 'src/services/configure/analyticsService.ts — manual CRUD exists',
  },
  {
    id: 'rtls',
    skillNumber: 20,
    name: 'RTLS Profile Configuration & Assignment',
    pattern: /\brtls\b|real-time location|aeroscout/i,
    localApi: 'POST /v1/rtlsprofile; PUT /v1/rtlsprofile/{rtlsprofileId}; DELETE /v1/rtlsprofile/{rtlsprofileId}',
    auraSupport: 'src/services/configure/rtlsProfileService.ts — manual CRUD exists',
  },
  {
    id: 'iot_profile',
    skillNumber: 21,
    name: 'IoT Profile Configuration & Assignment',
    pattern: /\biot profiles?\b|ble (beacons?|scans?)|ibeacon|eddystone/i,
    localApi: 'POST /v3/iotprofile; PUT /v3/iotprofile/{iotprofileId}; DELETE /v3/iotprofile/{iotprofileId}',
    auraSupport: 'src/services/configure/iotProfileService.ts — manual CRUD exists',
  },
  {
    id: 'esl',
    skillNumber: 22,
    name: 'ESL & IoT (Electronic Shelf Label) Configuration',
    pattern: /\besl\b|electronic shelf labels?|vusiongroup/i,
    localApi: 'No local API identified -- no ESL/electronic-shelf-label or VusionGroup fields found on IoTProfileElement or elsewhere in this API version',
    auraSupport: 'src/services/configure/eslProfileService.ts exists, but the audited API (swagger 2027.json) has NO ESL/VusionGroup fields anywhere — flag for verification before trusting this service',
  },
  {
    id: 'meshpoint',
    skillNumber: 23,
    name: 'Meshpoint Configuration',
    pattern: /\bmeshpoints?\b|mesh backhaul|wireless mesh/i,
    localApi: 'POST /v3/meshpoints; PUT /v3/meshpoints/{meshpointId}; DELETE /v3/meshpoints/{meshpointId}',
    auraSupport: 'src/services/configure/meshpointsService.ts — manual CRUD exists',
  },
  {
    id: 'ap_device',
    skillNumber: 24,
    name: 'AP Device List & Actions',
    pattern: /\bap (device )?(list|inventory)\b|bulk.*\baps?\b.*\b(actions?|reboot|upgrade)\b/i,
    localApi: 'PUT /v1/aps/assign; PUT /v1/aps/reboot; PUT /v1/aps/upgrade; PUT /v1/aps/upgradeschedule; DELETE /v1/aps/list; PUT /v1/aps/multiconfig',
    auraSupport: 'Covered via src/services/api.ts AP methods + AccessPoints.tsx page — extensive existing feature',
  },
  {
    id: 'ap_adoption_rules',
    skillNumber: 25,
    name: 'AP Adoption Rules Configuration',
    pattern: /\badoption rules?\b|\bauto-?adopt\b.*\baps?\b/i,
    localApi: 'PUT /v1/devices/adoptionrules (current path); PUT /v1/aps/adoptionrules (deprecated legacy path)',
    auraSupport: 'src/services/configure/adoptionService.ts targets /v1/aps/registration (adoption/registration settings), NOT /v1/devices/adoptionrules — own code comment flags this as a known gap pending ConfigureAdoptionRules.tsx rewiring',
  },
  {
    id: 'controller_system',
    skillNumber: 26,
    name: 'Controller System Configuration & Operations',
    pattern: /\b(controller|gateway) system\b|\bntp\b|network time protocol|\bsyslog servers?\b|\bpki trustpoints?\b|high availability.*\b(controller|gateway)\b/i,
    localApi: 'No local API identified -- dedicated Interfaces / Network-Time(NTP) / PKI-Trustpoint / SNMP-server / Syslog / HA endpoints for controller/Gateway system settings were not found in this API version. SwitchManager endpoints technically exist in the spec but are deprecated and are not used to manage the controller/Gateway appliance in current deployments (per business confirmation), so they were excluded from this mapping.',
    auraSupport: 'Partial: src/services/configure/snmpService.ts (SNMP) + trustPointsService.ts (PKI) + availabilityService.ts (HA) exist; NTP/interfaces/syslog have no local API at all (confirmed absent from swagger 2027.json)',
  },
  {
    id: 'mac_acl',
    skillNumber: 30,
    name: 'MAC Access Control List (ACL) Configuration',
    pattern: /\bmac (access control|acl)\b|mac address (allow|deny) lists?\b/i,
    localApi: 'POST /v1/accesscontrol; PUT /v1/accesscontrol; DELETE /v1/accesscontrol',
    auraSupport: 'src/services/configure/accessControlService.ts — manual CRUD exists (/v1/accesscontrol)',
  },
  {
    id: 'administrator',
    skillNumber: 31,
    name: 'Administrator Account Management',
    pattern: /\badministrator accounts?\b|\badmin (users?|accounts?)\b.*\b(create|password|timeout)\b/i,
    localApi: 'POST /v1/administrators; PUT /v1/administrators/{userId}; DELETE /v1/administrators/{userId}; PUT /v1/administrators/adminpassword; PUT /v1/administratorsTimeout/{userId}',
    auraSupport: 'src/services/configure/administratorsService.ts — manual CRUD exists',
  },
  {
    id: 'app_key',
    skillNumber: 32,
    name: 'REST API Application Key Management',
    pattern: /\b(application key|api key|appkey)s?\b/i,
    localApi: 'POST /v1/appkeys; DELETE /v1/appkeys/{appKey}',
    auraSupport: 'No AURA service found for /v1/appkeys — genuine gap at both the manual-UI and AI layers',
  },
  {
    id: 'dpi_signatures',
    skillNumber: 33,
    name: 'DPI Application Signature Management',
    pattern: /\bdpi\b|deep packet inspection|application signatures?\b/i,
    localApi: 'PUT /v1/dpisignatures',
    auraSupport: 'No AURA service found for /v1/dpisignatures — genuine gap at both the manual-UI and AI layers',
  },
  {
    id: 'xlocation',
    skillNumber: 34,
    name: 'ExtremeLocation (XLocation) Profile Configuration & Assignment',
    pattern: /\bxlocation\b|extremelocation/i,
    localApi: 'POST /v3/xlocation; PUT /v3/xlocation/{xlocationId}; DELETE /v3/xlocation/{xlocationId}',
    auraSupport: 'src/services/configure/xlocationService.ts — manual CRUD exists',
  },
  {
    id: 'nsight',
    skillNumber: 35,
    name: 'NSight Server Integration Configuration',
    pattern: /\bnsight\b/i,
    localApi: 'PUT /v1/nsightconfig',
    auraSupport: 'No AURA service found for /v1/nsightconfig — genuine gap at both the manual-UI and AI layers',
  },
  {
    id: 'global_site_defaults',
    skillNumber: 36,
    name: 'Global Site Defaults Configuration',
    pattern: /\bglobal (site )?defaults?\b|\bglobal settings\b/i,
    localApi: 'PUT /v1/globalsettings',
    auraSupport: 'src/services/configure/globalSettingsService.ts — manual CRUD exists (/v1/globalsettings)',
  },
  {
    id: 'report_template',
    skillNumber: 37,
    name: 'Report Template & Scheduled Report Configuration',
    pattern: /\breport templates?\b|scheduled reports?\b/i,
    localApi: 'POST /v1/reports/templates; PUT /v1/reports/templates/{templateId}; DELETE /v1/reports/templates/{templateId}; POST /v1/reports/scheduled; PUT /v1/reports/scheduled/{reportId}; DELETE /v1/reports/scheduled/{reportId}',
    auraSupport: 'No AURA service found for /v1/reports/templates or /v1/reports/scheduled — genuine gap; matches prior finding that this controller returns [] for /v1/reports/*',
  },
];

/**
 * @param {string} input
 * @returns {{ id: string, name: string, localApi: string, auraSupport: string } | null}
 */
export function detectConfigurationDomain(input) {
  for (const domain of CONFIGURATION_DOMAINS) {
    if (domain.pattern.test(input)) return domain;
  }
  return null;
}
