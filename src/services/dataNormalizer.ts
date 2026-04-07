/**
 * Data Normalization Layer
 *
 * Standardizes field names across different API responses to canonical names.
 * This eliminates the need for multiple fallback chains and ensures consistency.
 *
 * Problem: APIs return 4-6 variations for same field (e.g., apName, apDisplayName, apHostname)
 * Solution: Single normalization point that maps all variations to canonical names
 */

import { Station, AccessPoint, Service, Site } from './api';

// Cache for ID-to-name lookups to prevent N+1 queries
const resolutionCache = new Map<string, string>();

/**
 * Normalize station/client data to canonical field names
 */
export function normalizeStation(raw: any): Station {
  return {
    // Primary key
    macAddress: raw.macAddress,

    // IP addresses
    ipAddress: raw.ipAddress || raw.ip || raw.ipv4Address,
    ipv6Address: raw.ipv6Address || raw.ipv6,

    // Device identification
    hostName: raw.hostName || raw.hostname || raw.deviceName,
    deviceType: raw.deviceType || raw.type || raw.device_type,
    manufacturer: raw.manufacturer || raw.vendor || raw.oui,
    username: raw.username || raw.user || raw.userName,

    // AP information - consolidate 4+ variations
    apName: raw.apName || raw.apDisplayName || raw.apHostname || raw.accessPointName || raw.ap_name,
    apSerial: raw.apSerial || raw.apSerialNumber || raw.apSn || raw.accessPointSerial || raw.ap_serial,
    apDisplayName: raw.apDisplayName || raw.apName || raw.apHostname,
    apHostname: raw.apHostname || raw.apName,

    // Site information
    siteId: raw.siteId || raw.site_id,
    siteName: raw.siteName || raw.site || raw.location || raw.site_name,

    // Service/Network information
    serviceId: raw.serviceId || raw.service_id || raw.networkId,
    serviceName: raw.serviceName || raw.service || raw.networkName,
    network: raw.network || raw.networkName || raw.ssid || raw.serviceName,
    ssid: raw.ssid || raw.essid || raw.network || raw.networkName,

    // Role information
    roleId: raw.roleId || raw.role_id,
    role: raw.role || raw.roleName || raw.userRole,

    // VLAN - consolidate 4 variations
    vlan: raw.vlan ?? raw.vlanId ?? raw.vlanTag ?? raw.dot1dPortNumber,

    // Channel information
    channel: raw.channel ?? raw.radioChannel ?? raw.channelNumber,
    radioId: raw.radioId || raw.radio || raw.radio_id,

    // Signal strength - 2 variations
    rss: raw.rss ?? raw.signalStrength,
    signalStrength: raw.signalStrength ?? raw.rss,

    // Traffic statistics - multiple variations
    inBytes: raw.inBytes ?? raw.rxBytes ?? raw.clientBandwidthBytes ?? 0,
    outBytes: raw.outBytes ?? raw.txBytes ?? 0,
    rxBytes: raw.rxBytes ?? raw.inBytes ?? 0,
    txBytes: raw.txBytes ?? raw.outBytes ?? 0,
    packets: raw.packets ?? 0,
    outPackets: raw.outPackets ?? 0,

    // Connection status
    status: raw.status || raw.connectionStatus || raw.state,
    associationTime: raw.associationTime || raw.connectedTime || raw.connected_at,
    lastSeen: raw.lastSeen || raw.last_seen || raw.lastActivity,
    sessionDuration: raw.sessionDuration || raw.uptime || raw.connection_duration,

    // Additional fields
    protocol: raw.protocol,
    capabilities: raw.capabilities,
    authMethod: raw.authMethod || raw.authentication,
    encryption: raw.encryption,
    radioType: raw.radioType || raw.radio_type,
    txPower: raw.txPower || raw.tx_power,
    siteRating: raw.siteRating || raw.site_rating,

    // Preserve all original fields for debugging
    ...raw
  };
}

/**
 * Normalize access point data to canonical field names
 */
export function normalizeAccessPoint(raw: any): AccessPoint {
  return {
    // Primary key
    serialNumber: raw.serialNumber || raw.serial || raw.sn,

    // Name variations
    displayName: raw.displayName || raw.apName || raw.name || raw.hostname,

    // Model/Hardware
    model: raw.model || raw.hardwareType || raw.hw_model,
    hardwareType: raw.hardwareType || raw.model || raw.hardware_type,
    platformName: raw.platformName || raw.platform || raw.platform_name,

    // Site - actual field is hostSite
    site: raw.hostSite || raw.site || raw.location || raw.siteName,
    hostSite: raw.hostSite || raw.site || raw.location,

    // Firmware - actual field is softwareVersion
    firmware: raw.softwareVersion || raw.firmware || raw.sw_version,
    softwareVersion: raw.softwareVersion || raw.firmware || raw.version,

    // Network information
    ipAddress: raw.ipAddress || raw.ip || raw.ip_address,
    macAddress: raw.macAddress || raw.mac || raw.mac_address,

    // Status
    status: raw.status || raw.connectionState || raw.state,
    connectionState: raw.connectionState || raw.status,

    // Location
    location: raw.location || raw.site || raw.hostSite,

    // Client count
    clientCount: raw.clientCount ?? raw.clients ?? raw.associated_clients ?? 0,

    // Preserve all original fields
    ...raw
  };
}

/**
 * Normalize service/WLAN data to canonical field names
 */
export function normalizeService(raw: any): Service {
  return {
    // Primary key
    id: raw.id || raw.serviceId || raw.service_id,

    // Name variations
    name: raw.name || raw.serviceName || raw.ssid,
    serviceName: raw.serviceName || raw.name || raw.service_name,
    ssid: raw.ssid || raw.name || raw.serviceName,

    // Status variations
    enabled: raw.enabled ?? (raw.status?.toLowerCase() === 'enabled') ?? true,
    status: raw.status || (raw.enabled ? 'enabled' : 'disabled'),

    // VLAN
    vlan: raw.vlan ?? raw.dot1dPortNumber,
    dot1dPortNumber: raw.dot1dPortNumber ?? raw.vlan,

    // Hidden SSID
    hidden: raw.hidden ?? raw.suppressSsid ?? false,
    suppressSsid: raw.suppressSsid ?? raw.hidden ?? false,

    // Captive portal
    captivePortal: raw.captivePortal ?? raw.enableCaptivePortal ?? false,
    enableCaptivePortal: raw.enableCaptivePortal ?? raw.captivePortal ?? false,

    // Description
    description: raw.description || raw.desc,

    // Security configuration - handle both top-level and nested
    WpaPskElement: raw.WpaPskElement || raw.privacy?.WpaPskElement,
    WpaEnterpriseElement: raw.WpaEnterpriseElement || raw.privacy?.WpaEnterpriseElement,
    WpaSaeElement: raw.WpaSaeElement || raw.privacy?.WpaSaeElement,

    // Other common fields
    band: raw.band,
    maxClients: raw.maxClients || raw.max_clients,
    guestAccess: raw.guestAccess || raw.guest_access,
    defaultTopology: raw.defaultTopology || raw.topology_id,
    proxied: raw.proxied,
    aaaPolicyId: raw.aaaPolicyId || raw.aaa_policy_id,

    // Preserve all original fields
    ...raw
  };
}

/**
 * Normalize site data to canonical field names
 */
export function normalizeSite(raw: any): Site {
  return {
    // Primary key
    id: raw.id || raw.siteId || raw.site_id,

    // Name
    name: raw.name || raw.siteName || raw.site_name,
    siteName: raw.siteName || raw.name,

    // Location
    location: raw.location || raw.address,
    country: raw.country || raw.countryCode,

    // Description
    description: raw.description || raw.desc,

    // Preserve all original fields
    ...raw
  };
}

/**
 * Normalize an array of stations
 */
export function normalizeStations(rawStations: any[]): Station[] {
  if (!Array.isArray(rawStations)) return [];
  return rawStations.map(normalizeStation);
}

/**
 * Normalize an array of access points
 */
export function normalizeAccessPoints(rawAPs: any[]): AccessPoint[] {
  if (!Array.isArray(rawAPs)) return [];
  return rawAPs.map(normalizeAccessPoint);
}

/**
 * Normalize an array of services
 */
export function normalizeServices(rawServices: any[]): Service[] {
  if (!Array.isArray(rawServices)) return [];
  return rawServices.map(normalizeService);
}

/**
 * Normalize an array of sites
 */
export function normalizeSites(rawSites: any[]): Site[] {
  if (!Array.isArray(rawSites)) return [];
  return rawSites.map(normalizeSite);
}

/**
 * Clear the resolution cache
 */
export function clearNormalizationCache() {
  resolutionCache.clear();
}

/**
 * Get cache statistics
 */
export function getNormalizationCacheStats() {
  return {
    size: resolutionCache.size,
    keys: Array.from(resolutionCache.keys())
  };
}
