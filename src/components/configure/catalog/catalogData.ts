/**
 * Configure Feature Catalog — static structure (groups, labels, icons,
 * descriptions) reauthored in AURA's idiom from the EPB-125 reference
 * (config-app.js CATALOG_GROUPS). Navigation targets use the App view keys;
 * `countKey` names the list-capable service that backs a live record count.
 */
import {
  Activity,
  BarChart3,
  Boxes,
  Cable,
  Combine,
  Cpu,
  Crosshair,
  Gauge,
  Globe,
  KeyRound,
  Layers,
  ListChecks,
  LocateFixed,
  MapPin,
  Network,
  RadioTower,
  Router,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Timer,
  UserCheck,
  Users,
  Waypoints,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

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
  | 'eguest'
  | 'adsp'
  | 'iot'
  | 'rtls'
  | 'esl'
  | 'positioning'
  | 'analytics'
  | 'administrators';

export type AccentKey = 'wireless' | 'infra' | 'services' | 'system';

export interface FeatureCardData {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** App view key to navigate to; null when AURA has no destination (e.g. PPSK). */
  viewId: string | null;
  /** Service-backed count key; omitted when no list-capable service exists. */
  countKey?: CountKey;
  badge?: string;
  flag?: string;
}

export interface CatalogGroup {
  key: AccentKey;
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
    key: 'wireless',
    label: 'Wireless Configuration',
    description: 'Core profiles, policies, and segmentation applied to wireless clients',
    accent: 'wireless',
    items: [
      { id: 'profiles', label: 'Profiles', description: 'Device configuration templates', icon: Layers, viewId: 'configure-profiles', countKey: 'profiles' },
      { id: 'networks', label: 'Networks', description: 'SSIDs and WLAN definitions', icon: Wifi, viewId: 'configure-networks', countKey: 'services' },
      { id: 'roles', label: 'Roles', description: 'Client access roles & firewall rules', icon: ShieldCheck, viewId: 'configure-policy', countKey: 'roles' },
      { id: 'vlan', label: 'VLAN', description: 'L2 topologies and VLAN IDs', icon: Network, viewId: 'configure-policy', countKey: 'topologies' },
      { id: 'vlangroups', label: 'VLAN Groups', description: 'Named VLAN pools for client load-grouping', icon: Combine, viewId: 'configure-policy', countKey: 'vlangroups' },
      { id: 'cos', label: 'CoS / Class of Service', description: 'Traffic prioritization policies', icon: Gauge, viewId: 'configure-policy', countKey: 'cos' },
      { id: 'aaa', label: 'AAA', description: 'Authentication, authorization & accounting', icon: KeyRound, viewId: 'configure-aaa-policies', countKey: 'aaapolicy' },
      { id: 'ppsk', label: 'Private Pre-Shared Key', description: 'Global cloud keys for WPA2-Private PSK (organization-wide)', icon: Globe, viewId: null, badge: 'Global' },
      { id: 'ratelimiters', label: 'Rate Limiters', description: 'Per-client bandwidth caps', icon: Timer, viewId: 'configure-policy', countKey: 'ratelimiters' },
    ],
  },
  {
    key: 'infra',
    label: 'Infrastructure',
    description: 'Physical and logical device configuration across your sites',
    accent: 'infra',
    items: [
      { id: 'aps', label: 'Access Points', description: 'Managed AP inventory', icon: Router, viewId: 'configure-access-points' },
      { id: 'devicegroups', label: 'Device Groups', description: 'AP membership groups within a site', icon: Boxes, viewId: 'configure-sites-groups', flag: 'Further Discussion Needed' },
      { id: 'adoption', label: 'AP Adoption', description: 'Adoption rules and controller assignment', icon: Cable, viewId: 'configure-adoption-rules' },
      { id: 'rfmgmt', label: 'RF Management', description: 'Channel, power and radio policies', icon: RadioTower, viewId: 'configure-rrm', countKey: 'rfmgmt' },
      { id: 'meshpoints', label: 'Meshpoints', description: 'Wireless backhaul mesh configuration', icon: Waypoints, viewId: 'configure-meshpoints', countKey: 'meshpoints' },
      { id: 'sites', label: 'Sites', description: 'Physical site definitions', icon: MapPin, viewId: 'configure-sites-groups', countKey: 'sites' },
    ],
  },
  {
    key: 'services',
    label: 'Services',
    description: 'Specialized service profiles for advanced use cases',
    accent: 'services',
    items: [
      { id: 'eguest', label: 'ExtremeGuest', description: 'Guest portal and captive access', icon: UserCheck, viewId: 'configure-guest', countKey: 'eguest' },
      { id: 'airdefense', label: 'Air Defense Profiles', description: 'WIPS / rogue detection policies', icon: ShieldAlert, viewId: 'configure-service-profiles', countKey: 'adsp' },
      { id: 'iot', label: 'IoT Profiles', description: 'BLE, Zigbee & sensor data config', icon: Cpu, viewId: 'configure-service-profiles', countKey: 'iot' },
      { id: 'rtls', label: 'RTLS Profiles', description: 'Real-time location system', icon: LocateFixed, viewId: 'configure-service-profiles', countKey: 'rtls' },
      { id: 'esl', label: 'ESL Profiles', description: 'Electronic shelf label integration', icon: Tag, viewId: 'configure-service-profiles', countKey: 'esl' },
      { id: 'positioning', label: 'Positioning Profiles', description: 'Fine-grained location services', icon: Crosshair, viewId: 'configure-service-profiles', countKey: 'positioning' },
      { id: 'analytics', label: 'Analytics Profiles', description: 'Client presence & dwell analytics', icon: BarChart3, viewId: 'configure-service-profiles', countKey: 'analytics' },
    ],
  },
  {
    key: 'system',
    label: 'System & Security',
    description: 'Appliance-level settings, access control and SNMP',
    accent: 'system',
    items: [
      { id: 'accesscontrol', label: 'Access Control', description: 'Client MAC allow / deny list', icon: ListChecks, viewId: 'configure-system' },
      { id: 'snmp', label: 'SNMP', description: 'SNMP agent, communities & traps', icon: Activity, viewId: 'configure-system' },
      { id: 'globalsettings', label: 'Global Settings', description: 'Appliance-wide configuration', icon: Settings, viewId: 'configure-system' },
      { id: 'administrators', label: 'Administrators', description: 'Local & RADIUS admin accounts', icon: Users, viewId: 'configure-system', countKey: 'administrators' },
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
    relation: 'Sites and controllers anchor every AP and policy',
    nodes: [
      { id: 'sites', label: 'Sites', icon: MapPin, viewId: 'configure-sites-groups', countKey: 'sites', accent: 'infra' },
      { id: 'aps', label: 'Access Points', icon: Router, viewId: 'configure-access-points', accent: 'infra' },
      { id: 'aaa', label: 'AAA', icon: KeyRound, viewId: 'configure-aaa-policies', countKey: 'aaapolicy', accent: 'wireless' },
    ],
  },
  {
    key: 'device',
    title: 'AP Configuration',
    relation: 'Profiles + RF policies are assigned to access points',
    nodes: [
      { id: 'profiles', label: 'Profiles', icon: Layers, viewId: 'configure-profiles', countKey: 'profiles', accent: 'wireless' },
      { id: 'rfmgmt', label: 'RF Management', icon: RadioTower, viewId: 'configure-rrm', countKey: 'rfmgmt', accent: 'infra' },
      { id: 'meshpoints', label: 'Meshpoints', icon: Waypoints, viewId: 'configure-meshpoints', countKey: 'meshpoints', accent: 'infra' },
    ],
  },
  {
    key: 'network',
    title: 'Network Services',
    relation: 'Networks bind to profiles and expose guest + service profiles',
    nodes: [
      { id: 'services', label: 'Networks', icon: Wifi, viewId: 'configure-networks', countKey: 'services', accent: 'wireless' },
      { id: 'eguest', label: 'ExtremeGuest', icon: UserCheck, viewId: 'configure-guest', countKey: 'eguest', accent: 'services' },
      { id: 'serviceprofiles', label: 'Service Profiles', icon: Cpu, viewId: 'configure-service-profiles', countKey: 'iot', accent: 'services' },
    ],
  },
  {
    key: 'policy',
    title: 'Access Policy',
    relation: 'Roles, VLANs, and CoS shape per-client access on each network',
    nodes: [
      { id: 'roles', label: 'Roles', icon: ShieldCheck, viewId: 'configure-policy', countKey: 'roles', accent: 'wireless' },
      { id: 'topologies', label: 'VLANs', icon: Network, viewId: 'configure-policy', countKey: 'topologies', accent: 'wireless' },
      { id: 'cos', label: 'Class of Service', icon: Gauge, viewId: 'configure-policy', countKey: 'cos', accent: 'wireless' },
      { id: 'ratelimiters', label: 'Rate Limiters', icon: Timer, viewId: 'configure-policy', countKey: 'ratelimiters', accent: 'wireless' },
    ],
  },
];
