/**
 * Controller-exact enums for the Policy suite (Roles / VLANs / VLAN Groups /
 * CoS / Rate Limiters). Values are copied VERBATIM from the EPB-125 golden
 * reference (golden-eds-strict-ascend/config-en.jsx + config-infra-extras.js),
 * which in turn mirrors the XCC controller's RuleTypes/ExolEnums bundles and
 * the live records in api/roles.json / api/topologies.json / api/cos.json.
 * Do not "clean up" ids — the controller round-trips these strings.
 */
import type { RoleRuleGroupKey } from './localTypes';

export interface Opt {
  id: string;
  label: string;
}

export const ROLE_RULE_GROUPS: Array<[RoleRuleGroupKey, string]> = [
  ['l2Filters', 'L2 (Mac Address) Rules'],
  ['l3Filters', 'L3, L4 Rules (IP and Port)'],
  ['l3SrcDestFilters', 'L3, L4 Rules (IP and Port) with Source and Destination'],
  ['l7Filters', 'L7 (Application) Rules'],
];

/** Role default action (RuleTypes.defaultAccessControl filtered '!none'). */
export const ROLE_DEFAULT_ACTIONS: Opt[] = [
  { id: 'allow', label: 'Allow' },
  { id: 'deny', label: 'Deny' },
  { id: 'containToVlan', label: 'Contain to VLAN' },
];

/** Per-rule action list (RuleTypes.accessControl — includes a "none" value). */
export const RULE_ACTIONS: Opt[] = [
  { id: 'none', label: 'None' },
  { id: 'FILTERACTION_ALLOW', label: 'Allow' },
  { id: 'FILTERACTION_DENY', label: 'Deny' },
  { id: 'FILTERACTION_CONTAINTOVLAN', label: 'Contain to VLAN' },
  { id: 'FILTERACTION_REDIRECT', label: 'Redirect' },
];

/**
 * l3SrcDestFilters use RuleTypes.sourceAccessControl — UNPREFIXED values;
 * 'NA' renders as None (role_config.html:517–528).
 */
export const SRC_DEST_ACTIONS: Opt[] = [
  { id: 'NA', label: 'None' },
  { id: 'ALLOW', label: 'Allow' },
  { id: 'DENY', label: 'Deny' },
  { id: 'CONTAINTOVLAN', label: 'Contain to VLAN' },
];

export const RULE_PROTO: Opt[] = [
  { id: 'any', label: 'Any Protocol' },
  { id: 'userDefined', label: 'User Defined' },
  { id: 'icmp', label: 'ICMP' },
  { id: 'icmpv6', label: 'ICMPv6' },
  { id: 'tcp', label: 'TCP' },
  { id: 'udp', label: 'UDP' },
  { id: 'gre', label: 'GRE' },
  { id: 'ipsecEsp', label: 'IPsec-ESP' },
  { id: 'ipsecAh', label: 'IPsec-AH' },
];

export const RULE_SUBNET: Opt[] = [
  { id: 'userDefined', label: 'User Defined' },
  { id: 'anyIpAddress', label: 'Any IP Address' },
  { id: 'hostName', label: 'FQDN' },
  { id: 'spectralinkMcast', label: 'Spectralink Mcst' },
  { id: 'voceraMcast', label: 'Vocera Mcst' },
  { id: 'mDns', label: 'mDNS/Bonjour' },
];

export const RULE_MAC: Opt[] = [
  { id: 'any', label: 'Any MAC' },
  { id: 'user_defined', label: 'User Defined' },
];

/** Well-known port select — every key observed in live api/roles.json rules. */
export const RULE_PORT: Opt[] = [
  { id: 'userDefined', label: 'User Defined' },
  { id: 'any', label: 'Any Port' },
  { id: 'citrixIca', label: 'CITRIX ICA' },
  { id: 'dhcpClient', label: 'DHCP Client' },
  { id: 'dhcpServer', label: 'DHCP Server' },
  { id: 'dns', label: 'DNS' },
  { id: 'ftp', label: 'FTP' },
  { id: 'finger', label: 'Finger' },
  { id: 'http8080', label: 'HTTP 8080' },
  { id: 'http', label: 'HTTP' },
  { id: 'https', label: 'HTTPS' },
  { id: 'imap', label: 'IMAP' },
  { id: 'imap3', label: 'IMAP3' },
  { id: 'ldap', label: 'LDAP' },
  { id: 'lpr', label: 'LPR' },
  { id: 'nfs', label: 'NFS' },
  { id: 'nntp', label: 'NNTP' },
  { id: 'ntp', label: 'NTP' },
  { id: 'netbiosDatagramService', label: 'Netbios Datagram Service' },
  { id: 'netbiosNameService', label: 'Netbios Name Service' },
  { id: 'netbiosSessionService', label: 'Netbios Session Service' },
  { id: 'pop', label: 'POP' },
  { id: 'portMapper', label: 'Portmapper' },
  { id: 'rExec', label: 'R-Exec' },
  { id: 'rLogin', label: 'R-Login' },
  { id: 'rShell', label: 'R-Shell' },
  { id: 'radius', label: 'RADIUS' },
  { id: 'radiusAccounting', label: 'RADIUS Accounting' },
  { id: 'rip', label: 'RIP' },
  { id: 'sip', label: 'SIP' },
  { id: 'smtp', label: 'SMTP' },
  { id: 'snmp', label: 'SNMP' },
  { id: 'socks', label: 'SOCKS' },
  { id: 'ssh', label: 'SSH' },
  { id: 'tacacs', label: 'TACACS' },
  { id: 'telnet', label: 'TELNET' },
  { id: 'tftp', label: 'TFTP' },
  { id: 'x11', label: 'X11' },
];

/**
 * From User / To User selects (RuleTypes.filters) — every live rule carries
 * intoNetwork:'destAddr', outFromNetwork:'sourceAddr' (api/roles.json).
 */
export const RULE_FILTER_DIRS: Opt[] = [
  { id: 'none', label: 'None' },
  { id: 'destAddr', label: 'Destination (dest) address' },
  { id: 'sourceAddr', label: 'Source (src) address' },
];

/**
 * l3SrcDest single Direction select — controller-exact (RuleTypes.directions
 * from the shipping JS bundle): OUTBOUND "From User" / INBOUND "To User".
 */
export const SRC_DEST_DIRECTIONS: Opt[] = [
  { id: 'OUTBOUND', label: 'From User' },
  { id: 'INBOUND', label: 'To User' },
];

/** Well-known port → [portLow, portHigh] (values observed in live rules). */
export const PORT_RANGE: Record<string, [number, number]> = {
  dns: [53, 53],
  dhcpServer: [67, 67],
  dhcpClient: [68, 68],
  http: [80, 80],
  http8080: [8080, 8080],
  https: [443, 443],
  pop: [109, 110],
  smtp: [25, 25],
  imap: [143, 143],
  imap3: [220, 220],
  ftp: [20, 21],
  ssh: [22, 22],
  telnet: [23, 23],
  ntp: [123, 123],
  snmp: [161, 162],
  radius: [1812, 1812],
  radiusAccounting: [1813, 1813],
  sip: [5060, 5061],
  ldap: [389, 389],
  tftp: [69, 69],
};

/** L2 Ethertype select (RuleTypes.ethertypes); userDefined → hex input. */
export const RULE_ETHERTYPES: Opt[] = [
  { id: 'ipv4', label: 'IPv4 (0x0800)' },
  { id: 'arp', label: 'ARP (0x0806)' },
  { id: 'ipv6', label: 'IPv6 (0x86DD)' },
  { id: 'userDefined', label: 'User Defined' },
];

/**
 * The "No CoS" record id (api/cos.json) — every live role's defaultCos.
 * Other controllers may use a different id; treat null the same way.
 */
export const NO_COS_ID = '1eea4d66-2607-11e7-93ae-92361f002671';

/** ECP Advanced — 7 URL-item checkboxes (keys proven in api/roles.json). */
export const ECP_ITEMS: Array<[string, string]> = [
  ['cpAddApNameAndSerial', 'AP Name & Serial Number'],
  ['cpAddBssid', 'BSSID'],
  ['cpAddMac', 'Station MAC Address'],
  ['cpAddSsid', 'SSID'],
  ['cpAddVnsName', 'Network Name'],
  ['cpAddRole', 'Role Name'],
  ['cpAddVlan', 'VLAN ID'],
];

/** ecpTypes — URLTARGET proven live; URLCUSTOMIZED reveals custom-URL input. */
export const ECP_URL_TYPES: Opt[] = [
  { id: 'URLTARGET', label: 'Their original destination' },
  { id: 'URLCUSTOMIZED', label: 'Custom URL' },
];

/** The 5 user-selectable topology modes; Routed/Physical/Management are internal. */
export const TOPOLOGY_MODES: Opt[] = [
  { id: 'BridgedAtAp', label: 'Bridged@AP' },
  { id: 'BridgedAtAc', label: 'Bridged@AC' },
  { id: 'FabricAttach', label: 'Fabric Attach' },
  { id: 'Vxlan', label: 'VXLan' },
  { id: 'Gre', label: 'GRE' },
];

export const DHCP_MODES: Opt[] = [
  { id: 'DHCPNone', label: 'None' },
  { id: 'DHCPRelay', label: 'Relay' },
  { id: 'DHCPLocal', label: 'Local Server' },
];

/** Physical interfaces for the Bridged@AC Port select (vlanMapToEsa). */
export const PHYS_IFACES: Opt[] = [
  { id: '0', label: 'esa0' },
  { id: '1', label: 'esa1' },
];

/** Controller-exact PredefinedMulticastFilters (enums bundle). */
export const PREDEF_MCAST: Array<{ text: string; ip: string; ipCidr: number }> = [
  { text: 'All V4 Multicast (0.0.0.0/0)', ip: '0.0.0.0', ipCidr: 0 },
  { text: 'All V6 Multicast (FF00::/8)', ip: 'FF00::', ipCidr: 8 },
  { text: 'Spectralink Mcst (224.0.1.116)', ip: '224.0.1.116', ipCidr: 32 },
  { text: 'Vocera Mcst (230.230.0.0/20)', ip: '230.230.0.0', ipCidr: 20 },
  { text: 'mDNS/Bonjour (224.0.0.251)', ip: '224.0.0.251', ipCidr: 32 },
  { text: 'mDNSv6/Bonjour (FF02::FB)', ip: 'ff02:0:0:0:0:0:0:fb', ipCidr: 128 },
  { text: 'SSDP (Dial, uPnP)', ip: '239.255.255.250', ipCidr: 32 },
  { text: 'SSDP (IPv6)', ip: 'FF02::C', ipCidr: 128 },
  { text: 'WS-Discovery (239.255.255.250)', ip: '239.255.255.250', ipCidr: 32 },
];

/**
 * enums.priorities — REAL values notApplicable / priority0..7. The controller's
 * own predefined CoS naming maps 0=Scavenger … 7=High Priority; on-screen
 * labels kept numeric (parity audit unresolved #3).
 */
export const COS_PRIORITIES: Opt[] = [
  { id: 'notApplicable', label: 'Any Priority' },
  { id: 'priority0', label: '0' },
  { id: 'priority1', label: '1' },
  { id: 'priority2', label: '2' },
  { id: 'priority3', label: '3' },
  { id: 'priority4', label: '4' },
  { id: 'priority5', label: '5' },
  { id: 'priority6', label: '6' },
  { id: 'priority7', label: '7' },
];

/** RuleTypes.mask — numeric storage proven by live record mask:255. */
export const COS_MASKS: Opt[] = [
  { id: '', label: 'None' },
  { id: '255', label: '0xFF' },
  { id: '252', label: '0xFC' },
  { id: '248', label: '0xF8' },
];

/** Per-rule ToS mask options (role rule popovers; 0 = None). */
export const RULE_MASKS: Opt[] = [
  { id: '0', label: 'None' },
  { id: '255', label: '0xFF' },
  { id: '252', label: '0xFC' },
  { id: '248', label: '0xF8' },
];

/** Well-known DSCP codepoints offered by the ToS/DSCP editor. */
export const DSCP_KNOWN = [0, 8, 10, 16, 18, 24, 26, 32, 34, 40, 46, 48, 56];

/** CIR bounds shared by rate limiters and the role bandwidth-limit mode. */
export const CIR_MIN = 128;
export const CIR_MAX = 500000;
