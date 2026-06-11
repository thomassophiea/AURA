import { describe, it, expect } from 'vitest';
import {
  adaptXiqClientToStation,
  adaptXiqDeviceToAp,
  isXiqAccessPoint,
  adaptXiqData,
  clientHasRateData,
} from './xiqSleAdapter';
import { computeAllWirelessSLEs } from '../sleCalculationEngine';

describe('adaptXiqClientToStation', () => {
  it('maps XIQ client fields into the controller station shape', () => {
    const station = adaptXiqClientToStation({
      mac_address: 'AA:BB:CC:DD:EE:FF',
      rssi: -65,
      snr: 30,
      tx_phy_rate: 144, // Mbps
      rx_phy_rate: 200, // Mbps
      ap_mac_address: '11:22:33:44:55:66',
      ssid: 'Corp',
      ip_address: '10.0.0.5',
      radio: '5GHz',
    });
    expect(station.macAddress).toBe('AA:BB:CC:DD:EE:FF');
    expect(station.isWired).toBe(false);
    expect(station.rssi).toBe(-65);
    // phy rate (Mbps) is converted to bps for the engine's throughput math
    expect(station.txRate).toBe(144_000_000);
    expect(station.rxRate).toBe(200_000_000);
    expect(station.apSerialNumber).toBe('11:22:33:44:55:66');
    expect(station.authenticated).toBe(true);
  });

  it('coerces missing numerics to 0 without throwing', () => {
    const station = adaptXiqClientToStation({ mac_address: 'x' });
    expect(station.rssi).toBe(0);
    expect(station.txRate).toBe(0);
  });
});

describe('isXiqAccessPoint / adaptXiqDeviceToAp', () => {
  it('identifies APs by device_function or product_type', () => {
    expect(isXiqAccessPoint({ device_function: 'AP' })).toBe(true);
    expect(isXiqAccessPoint({ product_type: 'AP4000' })).toBe(true);
    expect(isXiqAccessPoint({ device_function: 'SWITCH' })).toBe(false);
  });

  it('maps connected=false to a disconnected status the engine understands', () => {
    const ap = adaptXiqDeviceToAp({
      serial_number: 'SN123',
      hostname: 'AP-Lobby',
      connected: false,
      cpu_utilization: 12,
      memory_utilization: 40,
      system_up_time: 8888,
      active_clients: 9,
      product_type: 'AP4000',
    });
    expect(ap.serialNumber).toBe('SN123');
    expect(ap.name).toBe('AP-Lobby');
    expect(ap.status).toBe('disconnected');
    expect(ap.activeClients).toBe(9);
  });

  it('maps connected=true to connected status', () => {
    const ap = adaptXiqDeviceToAp({ serial_number: 'SN9', connected: true });
    expect(ap.status).toBe('connected');
  });
});

describe('real XIQ FULL-view client shape (verified against live tenant)', () => {
  // Field set captured live from XIQ Global /clients/active?views=FULL.
  const realClient = {
    mac_address: 'D03F27DA2AD1',
    hostname: 'HLCAM4-D03F27DA2AD1',
    rssi: -68,
    snr: 37,
    channel: 6,
    device_mac_address: '7C95B169A280',
    device_name: 'SCRUFF-5010-03',
    connected_to: 'SCRUFF-5010-03',
    connection_duration: 139428124, // ms
    ssid: 'BlackSheepTxRx',
    ip_address: '10.0.2.41',
    vlan: 102,
    client_health: 80,
    radio_health: 80,
    network_health: 100,
    locations: [
      { id: 1, name: 'Scruffy Farms' },
      { id: 2, name: 'Basement' },
    ],
  };

  it('maps the AP from device_mac_address and uptime from connection_duration (ms)', () => {
    const s = adaptXiqClientToStation(realClient);
    expect(s.rssi).toBe(-68);
    expect(s.snr).toBe(37);
    expect(s.apSerialNumber).toBe('7C95B169A280');
    expect(s.apName).toBe('SCRUFF-5010-03');
    expect(s.uptime).toBeCloseTo(139428.124, 1); // ms -> s
    expect(s.vlan).toBe(102);
    expect(s.clientHealth).toBe(80);
    // most-specific location (last in the XIQ hierarchy array)
    expect(s.siteName).toBe('Basement');
  });

  it('reports no rate data for a FULL-view client without PHY-rate fields', () => {
    expect(clientHasRateData(realClient)).toBe(false);
  });
});

describe('adaptXiqData feeds the existing SLE engine', () => {
  it('produces the canonical 7 wireless SLEs from adapted XIQ data', () => {
    const clients = [
      { mac_address: 'c1', rssi: -55, tx_phy_rate: 200, rx_phy_rate: 200, ap_mac_address: 'ap1' },
      { mac_address: 'c2', rssi: -82, tx_phy_rate: 1, rx_phy_rate: 1, ap_mac_address: 'ap1' }, // weak + low throughput
    ];
    const devices = [
      { serial_number: 'ap1', device_function: 'AP', connected: true },
      { serial_number: 'ap2', device_function: 'AP', connected: false }, // unhealthy
      { serial_number: 'sw1', device_function: 'SWITCH', connected: true }, // filtered out
    ];

    const { stations, aps } = adaptXiqData(clients, devices);
    expect(stations).toHaveLength(2);
    expect(aps).toHaveLength(2); // switch excluded

    const sles = computeAllWirelessSLEs(stations, aps, []);
    const ids = sles.map((s) => s.id);
    expect(ids).toEqual([
      'time_to_connect',
      'successful_connects',
      'coverage',
      'roaming',
      'throughput',
      'capacity',
      'ap_health',
    ]);

    // The disconnected AP should drag AP Health below 100%.
    const apHealth = sles.find((s) => s.id === 'ap_health')!;
    expect(apHealth.successRate).toBeLessThan(100);

    // The weak-signal client should register on coverage.
    const coverage = sles.find((s) => s.id === 'coverage')!;
    expect(coverage.affectedUserMinutes).toBeGreaterThan(0);
  });
});
