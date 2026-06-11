/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * XIQ -> SLE Adapter
 *
 * Pure mapping functions that translate ExtremeCloud IQ device/client records
 * into the controller "station" / "access point" shapes that
 * `sleCalculationEngine` already understands. By adapting at the data layer we
 * reuse the entire existing SLE compute + honeycomb + classifier + root-cause
 * pipeline, so XIQ-backed SLEs render through the exact same UI.
 *
 * XIQ field names (verified live against XIQ Global v25.x, ?views=FULL):
 *   /clients/active?views=FULL : mac_address, rssi, snr, channel,
 *                     device_mac_address + device_name (the serving AP),
 *                     connection_duration (ms), ssid, vlan, ip_address,
 *                     client_health / radio_health / network_health (0-100),
 *                     connected, locations[]. NOTE: this tenant exposes no
 *                     PHY-rate fields, so throughput is reported as unavailable.
 *   /devices        : serial_number, hostname, device_function, product_type,
 *                     connected, system_up_time. (cpu/memory/active_clients may
 *                     be null depending on tenant/license.)
 */

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/** Resolve client uptime (seconds) from XIQ duration/timestamp fields. */
function clientUptimeSeconds(client: Record<string, any>): number {
  // Preferred: connection_duration is an elapsed time in ms.
  if (client.connection_duration != null && client.connection_duration !== '') {
    const secs = num(client.connection_duration) / 1000;
    return secs > 0 && Number.isFinite(secs) ? secs : 0;
  }
  // Fallback: derive from a connect/online timestamp.
  const ts = client.connect_time ?? client.online_time ?? client.create_time;
  if (ts == null || ts === '') return 0;
  let ms: number;
  if (typeof ts === 'number') {
    ms = ts < 1e12 ? ts * 1000 : ts;
  } else {
    const parsed = Date.parse(String(ts));
    if (Number.isNaN(parsed)) return 0;
    ms = parsed;
  }
  const secs = (Date.now() - ms) / 1000;
  return secs > 0 && Number.isFinite(secs) ? secs : 0;
}

/** True when a client record carries any PHY-rate data (for throughput SLE). */
export function clientHasRateData(client: Record<string, any>): boolean {
  return (
    client.tx_phy_rate != null ||
    client.rx_phy_rate != null ||
    client.tx_rate != null ||
    client.rx_rate != null
  );
}

/** Map one XIQ active client into the controller station shape. */
export function adaptXiqClientToStation(client: Record<string, any>): any {
  // PHY rate (Mbps) -> bps for the engine; absent on some tenants (left 0).
  const txMbps = num(client.tx_phy_rate ?? client.tx_rate);
  const rxMbps = num(client.rx_phy_rate ?? client.rx_rate);
  return {
    macAddress: String(client.mac_address ?? client.macAddress ?? ''),
    hostName: client.hostname ?? client.host_name ?? undefined,
    isWired: false,
    // Engine reads rssi/rss in dBm
    rssi: num(client.rssi),
    snr: num(client.snr),
    txRate: txMbps * 1_000_000,
    rxRate: rxMbps * 1_000_000,
    // Serving AP — XIQ FULL view uses device_mac_address / device_name.
    apSerialNumber: String(
      client.device_mac_address ?? client.ap_mac_address ?? client.connected_to ?? ''
    ),
    apName: client.device_name ?? client.connected_to ?? client.ap_hostname ?? undefined,
    ssid: client.ssid ?? undefined,
    ipAddress: client.ip_address ?? undefined,
    vlan: client.vlan ?? undefined,
    // Active clients are associated + authenticated by definition
    authenticated: true,
    uptime: clientUptimeSeconds(client),
    protocol: String(client.radio ?? client.radio_type ?? ''),
    channel: num(client.channel) || undefined,
    // XIQ-native health scores (0-100) carried for future direct-mapping use.
    clientHealth: client.client_health ?? undefined,
    radioHealth: client.radio_health ?? undefined,
    networkHealth: client.network_health ?? undefined,
    siteName: Array.isArray(client.locations)
      ? client.locations[client.locations.length - 1]?.name
      : (client.location ?? undefined),
    // carry the raw record for any future drill-down needs
    _xiq: client,
  };
}

/** True when an XIQ device record is a wireless AP. */
export function isXiqAccessPoint(device: Record<string, any>): boolean {
  const fn = String(device.device_function ?? '').toUpperCase();
  if (fn === 'AP') return true;
  return String(device.product_type ?? '').toUpperCase().startsWith('AP');
}

/** Map one XIQ device into the controller AP shape. */
export function adaptXiqDeviceToAp(device: Record<string, any>): any {
  const connected = device.connected === true || String(device.connected).toLowerCase() === 'true';
  return {
    serialNumber: String(device.serial_number ?? device.mac_address ?? ''),
    name: String(device.hostname ?? device.device_name ?? device.serial_number ?? ''),
    // Engine inspects status/connectionState for 'disconnect'/'offline'/'degraded'
    status: connected ? 'connected' : 'disconnected',
    connectionState: connected ? 'connected' : 'disconnected',
    activeClients: num(device.active_clients),
    cpuUtilization: num(device.cpu_utilization),
    memoryUtilization: num(device.memory_utilization),
    uptime: num(device.system_up_time),
    model: String(device.product_type ?? device.model ?? ''),
    siteName: Array.isArray(device.locations)
      ? device.locations[0]?.name
      : (device.location ?? undefined),
    _xiq: device,
  };
}

export interface AdaptedXiqData {
  stations: any[];
  aps: any[];
}

/** Adapt full XIQ client + device collections into engine-ready inputs. */
export function adaptXiqData(
  clients: Record<string, any>[],
  devices: Record<string, any>[]
): AdaptedXiqData {
  return {
    stations: clients.map(adaptXiqClientToStation),
    aps: devices.filter(isXiqAccessPoint).map(adaptXiqDeviceToAp),
  };
}
