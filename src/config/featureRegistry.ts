/**
 * Configure feature registry — the single source of truth for the Configure
 * surface's taxonomy. The left navigation (Sidebar), the command palette, the
 * navigation-scope sets and the Feature Catalog all derive from (or are
 * validated against) this file, so a feature added here shows up everywhere
 * and cannot drift between surfaces.
 *
 * Taxonomy (two levels, Configure → category → feature):
 *   Feature Catalog / Sites & Groups     root entries (discovery + scope)
 *   Wireless                             the radio estate and what it broadcasts
 *   Access & Authentication              who gets on, and as what
 *   Network Services                     what the network delivers beyond Wi-Fi
 *   System & Security                    the appliance itself (root entry)
 *
 * `scope` names where a feature's writes land:
 *   gateway       the Site Group's Gateway (one standalone appliance or an HA
 *                 pair sharing config) — the default for controller objects
 *   organization  AURA-owned, spans every Site Group (e.g. Private Credentials)
 *   site          a single Site within the Gateway
 *   appliance     one physical appliance of the Gateway (System & Security)
 */
import {
  Boxes,
  Building2,
  Cpu,
  Globe,
  KeySquare,
  KeyRound,
  LayoutGrid,
  Network,
  Radar,
  Radio,
  SatelliteDish,
  Settings,
  Share2,
  Shield,
  UserCheck,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export type FeatureScope = 'gateway' | 'organization' | 'site' | 'appliance';

export const FEATURE_SCOPE_LABELS: Record<FeatureScope, string> = {
  gateway: 'Gateway',
  organization: 'Organization',
  site: 'Site',
  appliance: 'Appliance',
};

export interface ConfigureFeature {
  /** App view key (`currentPage`) — must have a case in App.tsx renderPage(). */
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  scope: FeatureScope;
  /** Search aliases (legacy + protocol terms). Never displayed as labels. */
  aliases: string[];
}

export interface ConfigureNavGroup {
  key: 'wireless' | 'access' | 'services';
  label: string;
  items: ConfigureFeature[];
}

/** Root-level Configure entries rendered above the category groups. */
export const CONFIGURE_ROOT_ITEMS: ConfigureFeature[] = [
  {
    id: 'configure-catalog',
    label: 'Feature Catalog',
    description: 'Everything configurable, with live counts and architecture view',
    icon: LayoutGrid,
    scope: 'gateway',
    aliases: ['catalog', 'features', 'configuration', 'architecture'],
  },
  {
    id: 'configure-sites-groups',
    label: 'Sites & Groups',
    description: 'Site groups (Gateway boundaries) and the sites within them',
    icon: Building2,
    scope: 'gateway',
    aliases: ['site group', 'gateway', 'controller', 'locations', 'venues'],
  },
];

export const CONFIGURE_NAV_GROUPS: ConfigureNavGroup[] = [
  {
    key: 'wireless',
    label: 'Wireless',
    items: [
      {
        id: 'configure-networks',
        label: 'Networks',
        description: 'WLAN services and the SSIDs they broadcast',
        icon: Network,
        scope: 'gateway',
        aliases: ['wlan', 'ssid', 'wireless network', 'service'],
      },
      {
        id: 'configure-profiles',
        label: 'Device Profiles',
        description: 'AP platform templates: radios, networks, ports',
        icon: Cpu,
        scope: 'gateway',
        aliases: ['ap profile', 'template'],
      },
      {
        id: 'configure-access-points',
        label: 'Access Points',
        description: 'Per-AP configuration and profile overrides',
        icon: Wifi,
        scope: 'gateway',
        aliases: ['ap', 'aps', 'radio', 'override'],
      },
      {
        id: 'configure-device-groups',
        label: 'Device Groups',
        description: 'One AP platform, one profile, one RF policy — across sites',
        icon: Boxes,
        scope: 'gateway',
        aliases: ['ap group'],
      },
      {
        id: 'configure-rrm',
        label: 'RF Management',
        description: 'SmartRF / ACS channel and power policies',
        icon: Radio,
        scope: 'gateway',
        aliases: ['rrm', 'smartrf', 'acs', 'channel', 'power'],
      },
      {
        id: 'configure-meshpoints',
        label: 'Meshpoints',
        description: 'Wireless backhaul mesh policies',
        icon: Share2,
        scope: 'gateway',
        aliases: ['mesh', 'backhaul'],
      },
      {
        id: 'configure-site-afc-geo',
        label: 'Site AFC & Geo',
        description: 'AFC eligibility and geolocation per site',
        icon: SatelliteDish,
        scope: 'site',
        aliases: ['afc', '6 ghz', 'geolocation', 'standard power'],
      },
      {
        id: 'configure-adoption-rules',
        label: 'Adoption',
        description: 'AP registration and gateway assignment',
        icon: Zap,
        scope: 'gateway',
        aliases: ['adoption rules', 'registration', 'onboarding aps'],
      },
    ],
  },
  {
    key: 'access',
    label: 'Access & Authentication',
    items: [
      {
        id: 'configure-policy',
        label: 'Roles & Policy',
        description: 'Client roles, VLANs, CoS and rate limiters',
        icon: Shield,
        scope: 'gateway',
        aliases: ['role', 'user profile', 'firewall', 'vlan', 'topology', 'cos', 'qos', 'rate limit'],
      },
      {
        id: 'configure-aaa-policies',
        label: 'AAA Policies',
        description: 'RADIUS authentication and accounting server sets',
        icon: UserCheck,
        scope: 'gateway',
        aliases: ['radius', 'authentication', 'accounting', 'nai'],
      },
      {
        id: 'configure-access-control',
        label: 'Access Control',
        description: 'RADIUS, LDAP, local credentials, groups, rules, certificates',
        icon: KeySquare,
        scope: 'gateway',
        aliases: ['ldap', 'nac', 'certificates', 'password repository'],
      },
      {
        id: 'configure-private-credentials',
        label: 'Private Credentials',
        description: 'Per-user Wi-Fi credentials without 802.1X — PPSK and Private SAE',
        icon: KeyRound,
        scope: 'organization',
        aliases: ['ppsk', 'psk', 'pre-shared key', 'mpsk', 'sae', 'wpa3', 'wpa2', 'private sae', 'personal'],
      },
      {
        id: 'configure-cloud-portal',
        label: 'Cloud Captive Portal',
        description: 'Guest portal identity, consent, sponsorship and languages',
        icon: Globe,
        scope: 'organization',
        aliases: ['captive portal', 'guest portal', 'cwp', 'splash page', 'sponsorship'],
      },
    ],
  },
  {
    key: 'services',
    label: 'Network Services',
    items: [
      {
        id: 'configure-service-profiles',
        label: 'Service Profiles',
        description: 'IoT, RTLS, ESL, positioning, analytics and Air Defense',
        icon: Radar,
        scope: 'gateway',
        aliases: ['iot', 'rtls', 'esl', 'positioning', 'analytics', 'air defense', 'extremelocation'],
      },
    ],
  },
];

/** Root-level Configure entries rendered below the category groups. */
export const CONFIGURE_TAIL_ITEMS: ConfigureFeature[] = [
  {
    id: 'configure-system',
    label: 'System & Security',
    description: 'Availability, allow/deny lists, SNMP, settings, service accounts',
    icon: Settings,
    scope: 'appliance',
    aliases: ['availability', 'ha', 'snmp', 'gateway settings', 'service accounts', 'allow list', 'deny list'],
  },
];

/**
 * Retired view ids kept routable for deep links and muscle memory. Each
 * renders the destination feature (App.tsx maps them onto the same component),
 * but they no longer appear in any navigation surface.
 */
export const LEGACY_CONFIGURE_ALIASES: Record<string, string> = {
  'configure-ppsk': 'configure-private-credentials',
  'configure-private-sae': 'configure-private-credentials',
};

export const ALL_CONFIGURE_FEATURES: ConfigureFeature[] = [
  ...CONFIGURE_ROOT_ITEMS,
  ...CONFIGURE_NAV_GROUPS.flatMap((g) => g.items),
  ...CONFIGURE_TAIL_ITEMS,
];

/** Every routable Configure view id: canonical features plus legacy aliases. */
export const CONFIGURE_PAGE_IDS: string[] = [
  ...ALL_CONFIGURE_FEATURES.map((f) => f.id),
  ...Object.keys(LEGACY_CONFIGURE_ALIASES),
];
