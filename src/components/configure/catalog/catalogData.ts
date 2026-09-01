/**
 * Configure Feature Catalog — static structure (groups, labels, icons,
 * descriptions). The category taxonomy mirrors the Configure left navigation
 * (src/config/featureRegistry.ts — validated against it by featureRegistry
 * tests); cards are finer-grained than nav items where one page hosts several
 * objects behind tabs (`tabHint`). Navigation targets use the App view keys;
 * `countKey` names the list-capable service that backs a live record count.
 *
 * Count rule: a card carries a count only when it fronts a collection. Editor
 * and settings surfaces (Adoption, Availability, SNMP, Cloud Captive Portal…)
 * carry none. Scope chips render only for non-Gateway scopes — the page header
 * already names the Gateway the catalog writes to.
 */
import {
  Activity,
  BarChart3,
  Boxes,
  Cable,
  Combine,
  Cpu,
  Crosshair,
  FileKey2,
  FolderSearch,
  Gauge,
  GitCompareArrows,
  Globe,
  KeyRound,
  Layers,
  ListChecks,
  ListOrdered,
  LocateFixed,
  Lock,
  MapPin,
  MapPinned,
  Network,
  RadioTower,
  Router,
  SatelliteDish,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Timer,
  Users,
  Waypoints,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureScope } from '../../../config/featureRegistry';

/** Keys of features backed by a list-capable service (drive live counts). */
export type CountKey =
  | 'profiles'
  | 'services'
  | 'roles'
  | 'topologies'
  | 'vlangroups'
  | 'cos'
  | 'aaapolicy'
  | 'ratelimiters'
  | 'rfmgmt'
  | 'meshpoints'
  | 'sites'
  | 'adsp'
  | 'iot'
  | 'rtls'
  | 'esl'
  | 'positioning'
  | 'analytics'
  | 'xlocation'
  | 'acradius'
  | 'acldap'
  | 'acrepos'
  | 'acgroups'
  | 'acrules'
  | 'accerts'
  | 'administrators'
  | 'privateCredentials';

export type AccentKey = 'wireless' | 'infra' | 'services' | 'access' | 'system';

export interface FeatureCardData {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** App view key to navigate to; null when AURA has no destination yet. */
  viewId: string | null;
  /** Service-backed count key; omitted when no list-capable service exists. */
  countKey?: CountKey;
  /** Where this configuration lands; chips render for non-gateway scopes. */
  scope?: FeatureScope;
  badge?: string;
  flag?: string;
  /** Tab to open on the destination page (consumed via configureNav.ts). */
  tabHint?: string;
  /** Extra search terms (legacy + protocol names). Never displayed. */
  aliases?: string[];
}

export interface CatalogGroup {
  key: string;
  label: string;
  description: string;
  accent: AccentKey;
  items: FeatureCardData[];
}

/** Literal Tailwind class strings per accent (kept literal for JIT scanning). */
export const ACCENTS: Record<
  AccentKey,
  { bar: string; iconActive: string; hoverBorder: string; badge: string; nodeRing: string }
> = {
  wireless: {
    bar: 'bg-primary',
    iconActive: 'group-hover:text-primary',
    hoverBorder: 'hover:border-primary/60',
    badge: 'border-primary/30 bg-primary/10 text-primary',
    nodeRing: 'hover:border-primary/60 hover:bg-primary/5',
  },
  infra: {
    bar: 'bg-sky-500',
    iconActive: 'group-hover:text-sky-500',
    hoverBorder: 'hover:border-sky-500/60',
    badge: 'border-sky-500/30 bg-sky-500/10 text-sky-500',
    nodeRing: 'hover:border-sky-500/60 hover:bg-sky-500/5',
  },
  services: {
    bar: 'bg-emerald-500',
    iconActive: 'group-hover:text-emerald-500',
    hoverBorder: 'hover:border-emerald-500/60',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
    nodeRing: 'hover:border-emerald-500/60 hover:bg-emerald-500/5',
  },
  access: {
    bar: 'bg-purple-500',
    iconActive: 'group-hover:text-purple-500',
    hoverBorder: 'hover:border-purple-500/60',
    badge: 'border-purple-500/30 bg-purple-500/10 text-purple-500',
    nodeRing: 'hover:border-purple-500/60 hover:bg-purple-500/5',
  },
  system: {
    bar: 'bg-amber-500',
    iconActive: 'group-hover:text-amber-500',
    hoverBorder: 'hover:border-amber-500/60',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
    nodeRing: 'hover:border-amber-500/60 hover:bg-amber-500/5',
  },
};

export const CATALOG_GROUPS: CatalogGroup[] = [
  {
    key: 'foundation',
    label: 'Foundation & Scope',
    description: 'Site groups (Gateway boundaries) and the sites configuration applies to',
    accent: 'infra',
    items: [
      {
        id: 'sites',
        label: 'Sites & Groups',
        description: 'Site groups, gateway pairs, and site definitions',
        icon: MapPin,
        viewId: 'configure-sites-groups',
        countKey: 'sites',
        tabHint: 'site-config',
        aliases: ['site group', 'gateway', 'controller', 'location', 'venue'],
      },
    ],
  },
  {
    key: 'wireless',
    label: 'Wireless',
    description: 'The radio estate and what it broadcasts',
    accent: 'wireless',
    items: [
      {
        id: 'networks',
        label: 'Networks',
        description: 'WLAN services and the SSIDs they broadcast',
        icon: Wifi,
        viewId: 'configure-networks',
        countKey: 'services',
        aliases: ['wlan', 'ssid', 'wireless network', 'service'],
      },
      {
        id: 'profiles',
        label: 'Device Profiles',
        description: 'AP platform templates: radios, networks, ports',
        icon: Layers,
        viewId: 'configure-profiles',
        countKey: 'profiles',
        aliases: ['ap profile', 'template'],
      },
      {
        id: 'aps',
        label: 'Access Points',
        description: 'Per-AP configuration and profile overrides',
        icon: Router,
        viewId: 'configure-access-points',
        aliases: ['ap', 'radio', 'override'],
      },
      {
        id: 'devicegroups',
        label: 'Device Groups',
        description: 'One AP platform + profile + RF policy, applied across sites',
        icon: Boxes,
        viewId: 'configure-device-groups',
        aliases: ['ap group'],
      },
      {
        id: 'rfmgmt',
        label: 'RF Management',
        description: 'SmartRF / ACS channel, power and radio policies',
        icon: RadioTower,
        viewId: 'configure-rrm',
        countKey: 'rfmgmt',
        aliases: ['rrm', 'smartrf', 'acs', 'channel', 'power'],
      },
      {
        id: 'meshpoints',
        label: 'Meshpoints',
        description: 'Wireless backhaul mesh configuration',
        icon: Waypoints,
        viewId: 'configure-meshpoints',
        aliases: ['mesh', 'backhaul'],
        countKey: 'meshpoints',
      },
      {
        id: 'siteafc',
        label: 'Site AFC & Geo',
        description: 'AFC eligibility and geolocation diagnostics per site',
        icon: SatelliteDish,
        viewId: 'configure-site-afc-geo',
        scope: 'site',
        aliases: ['afc', '6 ghz', 'standard power', 'geolocation'],
      },
      {
        id: 'adoption',
        label: 'AP Adoption',
        description: 'AP registration and gateway assignment',
        icon: Cable,
        viewId: 'configure-adoption-rules',
        aliases: ['registration', 'onboarding'],
      },
    ],
  },
  {
    key: 'access',
    label: 'Access & Authentication',
    description: 'Who gets on the network, and as what — roles, AAA, credentials, portals',
    accent: 'access',
    items: [
      {
        id: 'roles',
        label: 'Roles',
        description: 'Client access roles & firewall rules',
        icon: ShieldCheck,
        viewId: 'configure-policy',
        countKey: 'roles',
        tabHint: 'roles',
        aliases: ['policy', 'user profile', 'firewall'],
      },
      {
        id: 'aaa',
        label: 'AAA Policies',
        description: 'Authentication, authorization & accounting server sets',
        icon: KeyRound,
        viewId: 'configure-aaa-policies',
        countKey: 'aaapolicy',
        aliases: ['radius', 'authentication', 'accounting', 'nai'],
      },
      {
        id: 'privatecredentials',
        label: 'Private Credentials',
        description: 'Per-user Wi-Fi credentials without 802.1X — PPSK (WPA2) & Private SAE (WPA3)',
        icon: KeyRound,
        viewId: 'configure-private-credentials',
        countKey: 'privateCredentials',
        scope: 'organization',
        aliases: ['ppsk', 'psk', 'pre-shared key', 'mpsk', 'sae', 'wpa3', 'wpa2', 'private sae', 'personal'],
      },
      {
        id: 'cloudportal',
        label: 'Cloud Captive Portal',
        description: 'Guest portal identity, consent, sponsorship and languages',
        icon: Globe,
        viewId: 'configure-cloud-portal',
        scope: 'organization',
        aliases: ['captive portal', 'guest portal', 'cwp', 'splash page', 'sponsorship'],
      },
      {
        id: 'acradius',
        label: 'RADIUS Servers',
        description: 'Authentication & accounting servers with health checks',
        icon: Server,
        viewId: 'configure-access-control',
        countKey: 'acradius',
        tabHint: 'radius',
        aliases: ['radius'],
      },
      {
        id: 'acldap',
        label: 'LDAP Configurations',
        description: 'Directory connections and schema definitions',
        icon: FolderSearch,
        viewId: 'configure-access-control',
        countKey: 'acldap',
        tabHint: 'ldap',
        aliases: ['directory', 'active directory'],
      },
      {
        id: 'acrepos',
        label: 'Local Password Repository',
        description: 'Locally stored user credentials',
        icon: Lock,
        viewId: 'configure-access-control',
        countKey: 'acrepos',
        tabHint: 'repository',
      },
      {
        id: 'acgroups',
        label: 'Groups',
        description: 'User, end-system, device-type, location & time groups',
        icon: Users,
        viewId: 'configure-access-control',
        countKey: 'acgroups',
        tabHint: 'groups',
      },
      {
        id: 'acrules',
        label: 'Rules',
        description: 'Ordered access rules mapping groups to roles & portals',
        icon: ListOrdered,
        viewId: 'configure-access-control',
        countKey: 'acrules',
        tabHint: 'rules',
      },
      {
        id: 'accerts',
        label: 'Certificates',
        description: 'AAA certificates and CRL distribution points',
        icon: FileKey2,
        viewId: 'configure-access-control',
        countKey: 'accerts',
        tabHint: 'certificates',
        badge: 'EP1 · Earmarked',
      },
    ],
  },
  {
    key: 'services',
    label: 'Network Services',
    description: 'Segmentation, quality of service, and the services the network delivers',
    accent: 'services',
    items: [
      {
        id: 'vlan',
        label: 'VLAN',
        description: 'L2 topologies and VLAN IDs',
        icon: Network,
        viewId: 'configure-policy',
        countKey: 'topologies',
        tabHint: 'vlans',
        aliases: ['topology', 'l2', 'segmentation'],
      },
      {
        id: 'vlangroups',
        label: 'VLAN Groups',
        description: 'Named VLAN pools for client load-grouping',
        icon: Combine,
        viewId: 'configure-policy',
        countKey: 'vlangroups',
        tabHint: 'vlangroups',
      },
      {
        id: 'cos',
        label: 'CoS / Class of Service',
        description: 'Traffic prioritization policies',
        icon: Gauge,
        viewId: 'configure-policy',
        countKey: 'cos',
        tabHint: 'cos',
        aliases: ['qos', 'priority'],
      },
      {
        id: 'ratelimiters',
        label: 'Rate Limiters',
        description: 'Per-client bandwidth caps',
        icon: Timer,
        viewId: 'configure-policy',
        countKey: 'ratelimiters',
        tabHint: 'ratelimiters',
        aliases: ['bandwidth', 'throttle'],
      },
      {
        id: 'airdefense',
        label: 'Air Defense Profiles',
        description: 'WIPS / rogue detection policies',
        icon: ShieldAlert,
        viewId: 'configure-service-profiles',
        countKey: 'adsp',
        tabHint: 'airdefense',
        aliases: ['wips', 'rogue'],
      },
      {
        id: 'iot',
        label: 'IoT Profiles',
        description: 'BLE, Zigbee & sensor data config',
        icon: Cpu,
        viewId: 'configure-service-profiles',
        countKey: 'iot',
        tabHint: 'iot',
        aliases: ['ble', 'zigbee', 'sensor'],
      },
      {
        id: 'rtls',
        label: 'RTLS Profiles',
        description: 'Real-time location system',
        icon: LocateFixed,
        viewId: 'configure-service-profiles',
        countKey: 'rtls',
        tabHint: 'rtls',
      },
      {
        id: 'esl',
        label: 'ESL Profiles',
        description: 'Electronic shelf label integration',
        icon: Tag,
        viewId: 'configure-service-profiles',
        countKey: 'esl',
        tabHint: 'esl',
      },
      {
        id: 'positioning',
        label: 'Positioning Profiles',
        description: 'Fine-grained location services',
        icon: Crosshair,
        viewId: 'configure-service-profiles',
        countKey: 'positioning',
        tabHint: 'positioning',
      },
      {
        id: 'analytics',
        label: 'Analytics Profiles',
        description: 'Client presence & dwell analytics',
        icon: BarChart3,
        viewId: 'configure-service-profiles',
        countKey: 'analytics',
        tabHint: 'analytics',
      },
      {
        id: 'xlocation',
        label: 'ExtremeLocation Profiles',
        description: 'ExtremeLocation cloud reporting (server, tenant, RSS)',
        icon: MapPinned,
        viewId: 'configure-service-profiles',
        countKey: 'xlocation',
        tabHint: 'xlocation',
      },
    ],
  },
  {
    key: 'system',
    label: 'System & Security',
    description: 'Appliance-level settings: availability, ACLs, SNMP and service accounts',
    accent: 'system',
    items: [
      {
        id: 'availability',
        label: 'Availability',
        description: 'HA pairing, AP balancing and mobility',
        icon: GitCompareArrows,
        viewId: 'configure-system',
        scope: 'appliance',
        tabHint: 'availability',
        aliases: ['ha', 'high availability', 'pair', 'mobility'],
      },
      {
        id: 'accesscontrol',
        label: 'Allow List/Deny List',
        description: 'Client MAC allow / deny list',
        icon: ListChecks,
        viewId: 'configure-system',
        scope: 'appliance',
        tabHint: 'access',
        aliases: ['mac acl', 'blocklist', 'whitelist', 'blacklist'],
      },
      {
        id: 'snmp',
        label: 'SNMP',
        description: 'SNMP agent, communities & traps',
        icon: Activity,
        viewId: 'configure-system',
        scope: 'appliance',
        tabHint: 'snmp',
        badge: 'EP1 · Earmarked',
      },
      {
        id: 'globalsettings',
        label: 'Gateway Settings',
        description: 'Gateway-wide configuration',
        icon: Settings,
        viewId: 'configure-system',
        scope: 'appliance',
        tabHint: 'global',
      },
      {
        id: 'administrators',
        label: 'Local Service Accounts',
        description: 'Gateway-local service accounts (cloud IAM is EP1)',
        icon: Users,
        viewId: 'configure-system',
        countKey: 'administrators',
        scope: 'appliance',
        tabHint: 'admins',
        aliases: ['administrators', 'admins'],
      },
    ],
  },
];

export interface ArchNode {
  id: string;
  label: string;
  icon: LucideIcon;
  viewId: string;
  countKey?: CountKey;
  accent: AccentKey;
}

export interface ArchLayer {
  key: string;
  title: string;
  /** Relationship caption describing how this layer feeds the one below. */
  relation: string;
  nodes: ArchNode[];
}

/**
 * Architecture (Feature Navigator) — the config entities arranged by dependency
 * layer, mirroring the reference FN graph (config-en.jsx FN_NODES/FN_EDGES).
 */
export const ARCH_LAYERS: ArchLayer[] = [
  {
    key: 'foundation',
    title: 'Site Foundation',
    relation: 'Sites and gateways anchor every AP and policy',
    nodes: [
      {
        id: 'sites',
        label: 'Sites',
        icon: MapPin,
        viewId: 'configure-sites-groups',
        countKey: 'sites',
        accent: 'infra',
      },
      {
        id: 'aps',
        label: 'Access Points',
        icon: Router,
        viewId: 'configure-access-points',
        accent: 'infra',
      },
      {
        id: 'aaa',
        label: 'AAA',
        icon: KeyRound,
        viewId: 'configure-aaa-policies',
        countKey: 'aaapolicy',
        accent: 'access',
      },
    ],
  },
  {
    key: 'device',
    title: 'AP Configuration',
    relation: 'Profiles + RF policies are assigned to access points',
    nodes: [
      {
        id: 'profiles',
        label: 'Profiles',
        icon: Layers,
        viewId: 'configure-profiles',
        countKey: 'profiles',
        accent: 'wireless',
      },
      {
        id: 'rfmgmt',
        label: 'RF Management',
        icon: RadioTower,
        viewId: 'configure-rrm',
        countKey: 'rfmgmt',
        accent: 'wireless',
      },
      {
        id: 'meshpoints',
        label: 'Meshpoints',
        icon: Waypoints,
        viewId: 'configure-meshpoints',
        countKey: 'meshpoints',
        accent: 'wireless',
      },
    ],
  },
  {
    key: 'network',
    title: 'Network Services',
    relation: 'Networks bind to profiles and expose guest + service profiles',
    nodes: [
      {
        id: 'services',
        label: 'Networks',
        icon: Wifi,
        viewId: 'configure-networks',
        countKey: 'services',
        accent: 'wireless',
      },
      {
        id: 'serviceprofiles',
        label: 'Service Profiles',
        icon: Cpu,
        viewId: 'configure-service-profiles',
        accent: 'services',
      },
    ],
  },
  {
    key: 'policy',
    title: 'Access Policy',
    relation: 'Roles, VLANs, CoS and credentials shape per-client access on each network',
    nodes: [
      {
        id: 'roles',
        label: 'Roles',
        icon: ShieldCheck,
        viewId: 'configure-policy',
        countKey: 'roles',
        accent: 'access',
      },
      {
        id: 'topologies',
        label: 'VLANs',
        icon: Network,
        viewId: 'configure-policy',
        countKey: 'topologies',
        accent: 'services',
      },
      {
        id: 'cos',
        label: 'Class of Service',
        icon: Gauge,
        viewId: 'configure-policy',
        countKey: 'cos',
        accent: 'services',
      },
      {
        id: 'ratelimiters',
        label: 'Rate Limiters',
        icon: Timer,
        viewId: 'configure-policy',
        countKey: 'ratelimiters',
        accent: 'services',
      },
      {
        id: 'privatecredentials',
        label: 'Private Credentials',
        icon: KeyRound,
        viewId: 'configure-private-credentials',
        countKey: 'privateCredentials',
        accent: 'access',
      },
    ],
  },
];
