/**
 * Client Identity Resolution Utility
 *
 * Implements the ClientIdentityDisplayPolicy to ensure human-readable
 * client identity is always prioritized over MAC addresses.
 *
 * Core principle: "MAC address is a primary key, not a primary label"
 */

/**
 * Raw client data from API
 */
export interface RawClientData {
  macAddress: string;
  mac?: string;
  hostName?: string;
  hostname?: string;
  deviceName?: string;
  device_name?: string;
  userName?: string;
  user_name?: string;
  userRole?: string;
  user_role?: string;
  deviceType?: string;
  device_type?: string;
  deviceCategory?: string;
  device_category?: string;
  manufacturer?: string;
  model?: string;
  osType?: string;
  os_type?: string;
  osVersion?: string;
  os_version?: string;
  ipAddress?: string;
  ip_address?: string;
  vlan?: string | number;
  ssid?: string;
  apName?: string;
  ap_name?: string;
  siteName?: string;
  site_name?: string;
  rfqiScore?: number;
  rfqi_score?: number;
  experienceState?: string;
  experience_state?: string;
  [key: string]: any;
}

/**
 * Resolved client identity following the display hierarchy
 */
export interface ClientIdentity {
  // Primary display label (human-readable)
  displayName: string;

  // Identity components
  deviceName: string | null;
  hostname: string | null;
  userName: string | null;
  userRole: string | null;

  // Device classification
  deviceType: string | null;
  deviceCategory: string | null;
  manufacturer: string | null;
  model: string | null;
  osType: string | null;
  osVersion: string | null;

  // Network metadata (MAC is here, not primary)
  macAddress: string;
  ipAddress: string | null;
  vlan: string | null;
  ssid: string | null;
  apName: string | null;
  siteName: string | null;

  // Experience context
  rfqiScore: number | null;
  experienceState: string | null;

  // Resolution metadata
  identitySource: IdentitySource;
  isResolved: boolean;
}

/**
 * Source of identity resolution
 */
export type IdentitySource =
  | 'device_name'
  | 'hostname'
  | 'user_name'
  | 'user_role'
  | 'derived_label'
  | 'mac_fallback';

/**
 * OUI (Organizationally Unique Identifier) lookup for manufacturer
 * Common manufacturer prefixes - can be extended
 */
const OUI_PREFIXES: Record<string, string> = {
  '00:00:0C': 'Cisco',
  '00:1A:2B': 'Cisco',
  '00:50:56': 'VMware',
  '00:0C:29': 'VMware',
  '00:15:5D': 'Microsoft',
  '00:03:FF': 'Microsoft',
  'AC:DE:48': 'Apple',
  '00:1C:B3': 'Apple',
  '00:17:F2': 'Apple',
  '00:1E:C2': 'Apple',
  '00:21:E9': 'Apple',
  '00:22:41': 'Apple',
  '00:23:12': 'Apple',
  '00:23:32': 'Apple',
  '00:23:6C': 'Apple',
  '00:23:DF': 'Apple',
  '00:24:36': 'Apple',
  '00:25:00': 'Apple',
  '00:25:4B': 'Apple',
  '00:25:BC': 'Apple',
  '00:26:08': 'Apple',
  '00:26:B0': 'Apple',
  '00:26:BB': 'Apple',
  '00:50:E4': 'Apple',
  '18:AF:8F': 'Apple',
  '28:CF:E9': 'Apple',
  '34:15:9E': 'Apple',
  '70:CD:60': 'Apple',
  '7C:D1:C3': 'Apple',
  'A4:B1:97': 'Apple',
  'D4:9A:20': 'Apple',
  'F0:CB:A1': 'Apple',
  '00:1A:11': 'Google',
  '3C:5A:B4': 'Google',
  '94:EB:2C': 'Google',
  'F4:F5:D8': 'Google',
  '00:1E:65': 'Intel',
  '00:1F:3B': 'Intel',
  '00:1F:3C': 'Intel',
  '00:21:5C': 'Intel',
  '00:21:5D': 'Intel',
  '00:22:FA': 'Intel',
  '00:24:D6': 'Intel',
  '00:24:D7': 'Intel',
  '00:26:C6': 'Intel',
  '00:26:C7': 'Intel',
  '00:1A:73': 'Aruba',
  '00:0B:86': 'Aruba',
  '18:64:72': 'Aruba',
  '24:DE:C6': 'Aruba',
  '6C:F3:7F': 'Aruba',
  '9C:1C:12': 'Aruba',
  'AC:A3:1E': 'Aruba',
  'D8:C7:C8': 'Aruba',
  '00:17:0F': 'Extreme',
  '00:04:96': 'Extreme',
  'B4:C7:99': 'Extreme',
  '74:67:F7': 'Extreme',
  '00:1B:1B': 'Extreme',
  '00:E0:2B': 'Extreme',
  'B8:27:EB': 'Raspberry Pi',
  'DC:A6:32': 'Raspberry Pi',
  'E4:5F:01': 'Raspberry Pi',
  '00:04:4B': 'Nvidia',
  '48:B0:2D': 'Nvidia',
  '00:09:2D': 'HTC',
  '00:23:76': 'HTC',
  '38:E7:D8': 'HTC',
  '00:21:19': 'Samsung',
  '00:24:54': 'Samsung',
  '00:26:37': 'Samsung',
  '5C:0A:5B': 'Samsung',
  '8C:71:F8': 'Samsung',
  'AC:5F:3E': 'Samsung',
  'CC:07:AB': 'Samsung',
  'F4:42:8F': 'Samsung',
  '00:19:C5': 'Sony',
  '00:1A:80': 'Sony',
  '00:1D:BA': 'Sony',
  '00:24:BE': 'Sony',
  'FC:0F:E6': 'Sony',
  '00:1C:26': 'Dell',
  '00:21:9B': 'Dell',
  '00:22:19': 'Dell',
  '00:24:E8': 'Dell',
  '00:25:64': 'Dell',
  '14:FE:B5': 'Dell',
  '18:A9:9B': 'Dell',
  '24:B6:FD': 'Dell',
  '34:17:EB': 'Dell',
  '00:17:A4': 'HP',
  '00:1A:4B': 'HP',
  '00:1C:C4': 'HP',
  '00:21:5A': 'HP',
  '00:22:64': 'HP',
  '00:23:7D': 'HP',
  '00:24:81': 'HP',
  '00:25:B3': 'HP',
  '00:26:55': 'HP',
  '00:1E:68': 'Lenovo',
  '00:21:86': 'Lenovo',
  '00:22:68': 'Lenovo',
  '00:26:6C': 'Lenovo',
  '60:D9:C7': 'Lenovo',
  '70:72:0D': 'Lenovo',
};

/**
 * Device type inference based on hostname patterns
 */
const DEVICE_TYPE_PATTERNS: Array<{ pattern: RegExp; type: string; category: string }> = [
  { pattern: /iphone/i, type: 'iPhone', category: 'Mobile Phone' },
  { pattern: /ipad/i, type: 'iPad', category: 'Tablet' },
  { pattern: /macbook/i, type: 'MacBook', category: 'Laptop' },
  { pattern: /imac/i, type: 'iMac', category: 'Desktop' },
  { pattern: /android/i, type: 'Android Device', category: 'Mobile' },
  { pattern: /galaxy/i, type: 'Samsung Galaxy', category: 'Mobile Phone' },
  { pattern: /pixel/i, type: 'Google Pixel', category: 'Mobile Phone' },
  { pattern: /windows/i, type: 'Windows PC', category: 'Computer' },
  { pattern: /laptop/i, type: 'Laptop', category: 'Laptop' },
  { pattern: /desktop/i, type: 'Desktop', category: 'Desktop' },
  { pattern: /printer/i, type: 'Printer', category: 'Printer' },
  { pattern: /camera/i, type: 'Camera', category: 'IoT' },
  { pattern: /tv|television/i, type: 'Smart TV', category: 'Entertainment' },
  { pattern: /roku|firestick|chromecast|appletv/i, type: 'Streaming Device', category: 'Entertainment' },
  { pattern: /echo|alexa|homepod|google-home/i, type: 'Smart Speaker', category: 'IoT' },
  { pattern: /nest|ring|thermostat/i, type: 'Smart Home Device', category: 'IoT' },
  { pattern: /xbox|playstation|nintendo/i, type: 'Gaming Console', category: 'Entertainment' },
  { pattern: /ap-|access.?point/i, type: 'Access Point', category: 'Network' },
  { pattern: /switch|sw-/i, type: 'Switch', category: 'Network' },
  { pattern: /server|srv-/i, type: 'Server', category: 'Server' },
];

/**
 * Normalize MAC address format
 */
export function normalizeMac(mac: string | undefined | null): string {
  if (!mac) return '';
  return mac.toUpperCase().replace(/[^A-F0-9]/g, '').replace(/(.{2})/g, '$1:').slice(0, -1);
}

/**
 * Get manufacturer from MAC address using OUI lookup
 */
export function getManufacturerFromMac(mac: string): string | null {
  const normalizedMac = normalizeMac(mac);
  const prefix = normalizedMac.substring(0, 8);

  return OUI_PREFIXES[prefix] || null;
}

/**
 * Infer device type from hostname or other identifiers
 */
export function inferDeviceType(data: RawClientData): { type: string | null; category: string | null } {
  const searchText = [
    data.hostName,
    data.hostname,
    data.deviceName,
    data.device_name,
    data.deviceType,
    data.device_type,
    data.osType,
    data.os_type,
  ]
    .filter(Boolean)
    .join(' ');

  for (const { pattern, type, category } of DEVICE_TYPE_PATTERNS) {
    if (pattern.test(searchText)) {
      return { type, category };
    }
  }

  return { type: null, category: null };
}

/**
 * Create a derived device label when no explicit identity exists
 */
export function createDerivedLabel(manufacturer: string | null, category: string | null): string {
  if (manufacturer && category) {
    return `${manufacturer} ${category}`;
  }
  if (manufacturer) {
    return `${manufacturer} Device`;
  }
  if (category) {
    return category;
  }
  return 'Unknown Device';
}

/**
 * Resolve client identity following the display hierarchy:
 * 1. Explicit device name
 * 2. Hostname
 * 3. Authenticated user name
 * 4. Role-based label
 * 5. Derived device label (manufacturer + category)
 * 6. MAC address (fallback only)
 */
export function resolveClientIdentity(data: RawClientData): ClientIdentity {
  const mac = data.macAddress || data.mac || '';
  const normalizedMac = normalizeMac(mac);

  // Extract all available identity fields
  const deviceName = data.deviceName || data.device_name || null;
  const hostname = data.hostName || data.hostname || null;
  const userName = data.userName || data.user_name || null;
  const userRole = data.userRole || data.user_role || null;
  const deviceType = data.deviceType || data.device_type || null;
  const deviceCategory = data.deviceCategory || data.device_category || null;
  const manufacturer = data.manufacturer || getManufacturerFromMac(mac);
  const model = data.model || null;
  const osType = data.osType || data.os_type || null;
  const osVersion = data.osVersion || data.os_version || null;

  // Infer device type if not provided
  const inferred = inferDeviceType(data);
  const finalDeviceType = deviceType || inferred.type;
  const finalCategory = deviceCategory || inferred.category;

  // Network metadata
  const ipAddress = data.ipAddress || data.ip_address || null;
  const vlan = data.vlan ? String(data.vlan) : null;
  const ssid = data.ssid || null;
  const apName = data.apName || data.ap_name || null;
  const siteName = data.siteName || data.site_name || null;

  // Experience context
  const rfqiScore = data.rfqiScore ?? data.rfqi_score ?? null;
  const experienceState = data.experienceState || data.experience_state || null;

  // Resolve display name following priority order
  let displayName: string;
  let identitySource: IdentitySource;

  if (deviceName && deviceName.trim() && !isMacLike(deviceName)) {
    displayName = deviceName.trim();
    identitySource = 'device_name';
  } else if (hostname && hostname.trim() && !isMacLike(hostname)) {
    displayName = hostname.trim();
    identitySource = 'hostname';
  } else if (userName && userName.trim()) {
    displayName = userName.trim();
    identitySource = 'user_name';
  } else if (userRole && userRole.trim()) {
    displayName = userRole.trim();
    identitySource = 'user_role';
  } else {
    // Create derived label from manufacturer and category
    displayName = createDerivedLabel(manufacturer, finalCategory);
    identitySource = displayName !== 'Unknown Device' ? 'derived_label' : 'mac_fallback';

    // Only use MAC as absolute last resort
    if (identitySource === 'mac_fallback' && normalizedMac) {
      displayName = formatMacForDisplay(normalizedMac);
    }
  }

  return {
    displayName,
    deviceName,
    hostname,
    userName,
    userRole,
    deviceType: finalDeviceType,
    deviceCategory: finalCategory,
    manufacturer,
    model,
    osType,
    osVersion,
    macAddress: normalizedMac,
    ipAddress,
    vlan,
    ssid,
    apName,
    siteName,
    rfqiScore,
    experienceState,
    identitySource,
    isResolved: identitySource !== 'mac_fallback',
  };
}

/**
 * Check if a string looks like a MAC address
 */
function isMacLike(value: string): boolean {
  // Check for MAC-like patterns
  const macPatterns = [
    /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/,
    /^([0-9A-Fa-f]{4}\.){2}([0-9A-Fa-f]{4})$/,
    /^[0-9A-Fa-f]{12}$/,
  ];

  return macPatterns.some(pattern => pattern.test(value.trim()));
}

/**
 * Format MAC address for display (when used as fallback)
 */
function formatMacForDisplay(mac: string): string {
  // Return abbreviated format for cleaner display
  const parts = mac.split(':');
  if (parts.length === 6) {
    return `Device ${parts[3]}${parts[4]}${parts[5]}`;
  }
  return mac;
}

/**
 * Get experience state label
 */
export function getExperienceStateLabel(score: number | null): string {
  if (score === null || score === undefined) return 'Unknown';
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  return 'Poor';
}

/**
 * Get experience state color
 */
export function getExperienceStateColor(score: number | null): {
  bg: string;
  text: string;
  border: string;
} {
  if (score === null || score === undefined) {
    return { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-muted' };
  }
  if (score >= 90) {
    return { bg: 'bg-green-500/10', text: 'text-green-500', border: 'border-green-500/20' };
  }
  if (score >= 75) {
    return { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/20' };
  }
  if (score >= 60) {
    return { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/20' };
  }
  return { bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/20' };
}

/**
 * Batch resolve identities for a list of clients
 */
export function resolveClientIdentities(clients: RawClientData[]): ClientIdentity[] {
  return clients.map(resolveClientIdentity);
}

/**
 * Create a display string for client with context
 */
export function formatClientDisplay(identity: ClientIdentity, options?: {
  includeDevice?: boolean;
  includeLocation?: boolean;
}): string {
  const parts = [identity.displayName];

  if (options?.includeDevice && identity.deviceType) {
    parts.push(`(${identity.deviceType})`);
  }

  if (options?.includeLocation && identity.apName) {
    parts.push(`on ${identity.apName}`);
  }

  return parts.join(' ');
}

/**
 * Search clients by various identity fields
 */
export function searchClients(
  clients: ClientIdentity[],
  query: string
): ClientIdentity[] {
  const lowerQuery = query.toLowerCase();

  return clients.filter(client => {
    return (
      client.displayName.toLowerCase().includes(lowerQuery) ||
      client.hostname?.toLowerCase().includes(lowerQuery) ||
      client.deviceName?.toLowerCase().includes(lowerQuery) ||
      client.userName?.toLowerCase().includes(lowerQuery) ||
      client.macAddress.toLowerCase().includes(lowerQuery) ||
      client.ipAddress?.toLowerCase().includes(lowerQuery) ||
      client.deviceType?.toLowerCase().includes(lowerQuery)
    );
  });
}
