/**
 * Normalized XIQ dashboard-grid row models.
 *
 * The XIQ dashboard grids return loosely-typed JSON with many optional fields.
 * These interfaces capture the fields the SLE engine consumes, and
 * `normalizeXiq*Row` coerce raw rows into a consistent, typed shape (numbers
 * default to 0, booleans to false) so the engine never deals with `null`/`any`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface XiqClientHealthRow {
  clientMac: string;
  site: string | null;
  building: string | null;
  floor: string | null;
  rssi: number | null;
  snr: number | null;
  frequency: string | null;
  associationDuration: number;
  authResponseTime: number;
  dhcpAssignTime: number;
  hasAuthIssues: boolean;
  hasAssocIssues: boolean;
  hasIpIssues: boolean;
  hasRoamingIssues: boolean;
  roamingTime: number;
  txRetries: number;
  rxRetries: number;
  slowness: number;
  airtimeWarning: boolean;
  /** XIQ native assurance scores (0-100), merged from /clients/active?views=FULL. */
  radioHealth: number | null;
  clientHealth: number | null;
}

export interface XiqDeviceHealthRow {
  deviceId: string;
  hostname: string | null;
  site: string | null;
  building: string | null;
  floor: string | null;
  cpu: number;
  memory: number;
  reboots: number;
  channelChanges: number;
  hasHealthIssue: boolean;
  poeStrained: boolean;
}

export interface XiqCapacityRow {
  deviceId: string;
  hostname: string | null;
  site: string | null;
  building: string | null;
  floor: string | null;
  util24: number;
  util5: number;
  util6: number;
  interference: number;
  packetLoss: number;
  hasCapacityIssue: boolean;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/** Numeric field that should stay null when XIQ didn't report it (e.g. rssi). */
function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean {
  return v === true || String(v).toLowerCase() === 'true';
}

function str(v: unknown): string | null {
  return v == null || v === '' ? null : String(v);
}

export function normalizeXiqClientRow(r: Record<string, any>): XiqClientHealthRow {
  return {
    clientMac: String(r.client_mac ?? r.client_device_id ?? ''),
    site: str(r.site),
    building: str(r.building),
    floor: str(r.floor),
    rssi: numOrNull(r.rssi),
    snr: numOrNull(r.snr),
    frequency: str(r.frequency),
    associationDuration: num(r.association_duration),
    authResponseTime: num(r.authentication_response_time),
    dhcpAssignTime: num(r.dhcp_ip_assignation_time),
    hasAuthIssues: bool(r.has_authentication_issues),
    hasAssocIssues: bool(r.has_association_issues),
    hasIpIssues: bool(r.has_ip_address_issues),
    hasRoamingIssues: bool(r.has_roaming_issues),
    roamingTime: num(r.roaming_time),
    txRetries: num(r.tx_client_retries),
    rxRetries: num(r.rx_client_retries),
    slowness: num(r.slowness),
    airtimeWarning: bool(r.air_time_warning),
    radioHealth: numOrNull(r.radio_health),
    clientHealth: numOrNull(r.client_health),
  };
}

export function normalizeXiqDeviceRow(r: Record<string, any>): XiqDeviceHealthRow {
  return {
    deviceId: String(r.device_id ?? r.hostname ?? ''),
    hostname: str(r.hostname),
    site: str(r.site),
    building: str(r.building),
    floor: str(r.floor),
    cpu: num(r.cpu_usage_percentage),
    memory: num(r.memory_usage_percentage),
    reboots: num(r.wifi_reboots_count),
    channelChanges: num(r.channel_change_count),
    hasHealthIssue: bool(r.has_device_health_issue),
    poeStrained: bool(r.poe_usage_indicator),
  };
}

export function normalizeXiqCapacityRow(r: Record<string, any>): XiqCapacityRow {
  return {
    deviceId: String(r.device_id ?? r.mac_address ?? r.hostname ?? ''),
    hostname: str(r.hostname),
    site: str(r.site),
    building: str(r.building),
    floor: str(r.floor),
    util24: num(r.radio_2dot4g_utilization_score),
    util5: num(r.radio_5g_utilization_score),
    util6: num(r.radio_6g_utilization_score),
    interference: num(r.wifi0_interference_score),
    packetLoss: num(r.packet_loss),
    hasCapacityIssue: bool(r.has_usage_capacity_issue),
  };
}
