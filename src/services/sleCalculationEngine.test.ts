import { describe, it, expect } from 'vitest';
import {
  computeCoverage,
  computeThroughput,
  computeAPHealth,
  computeCapacity,
  computeSuccessfulConnects,
  computeTimeToConnect,
  computeRoaming,
  computeAllWirelessSLEs,
} from './sleCalculationEngine';
import type { SLEDataPoint } from './sleDataCollection';

describe('sleCalculationEngine', () => {
  const emptyHistoricalData: SLEDataPoint[] = [];

  describe('computeCoverage', () => {
    it('should return 100% success rate for empty stations', () => {
      const result = computeCoverage([], emptyHistoricalData);
      expect(result.successRate).toBe(100);
      expect(result.status).toBe('good');
      expect(result.id).toBe('coverage');
    });

    it('should detect weak signal clients', () => {
      const stations = [
        { macAddress: 'aa:bb:cc:dd:ee:01', rssi: -80, isWired: false },
        { macAddress: 'aa:bb:cc:dd:ee:02', rssi: -60, isWired: false },
        { macAddress: 'aa:bb:cc:dd:ee:03', rssi: -75, isWired: false },
      ];

      const result = computeCoverage(stations, emptyHistoricalData);

      expect(result.successRate).toBeLessThan(100);
      const weakSignalClassifier = result.classifiers.find(c => c.id === 'weak_signal');
      expect(weakSignalClassifier).toBeDefined();
      expect(weakSignalClassifier!.affectedClients).toBeGreaterThan(0);
    });

    it('should detect asymmetry uplink issues', () => {
      const stations = [
        { macAddress: 'aa:bb:cc:dd:ee:01', txRate: 10, rxRate: 100, isWired: false },
      ];

      const result = computeCoverage(stations, emptyHistoricalData);
      const asymmetryUp = result.classifiers.find(c => c.id === 'asymmetry_uplink');
      expect(asymmetryUp!.affectedClients).toBe(1);
    });

    it('should detect asymmetry downlink issues', () => {
      const stations = [
        { macAddress: 'aa:bb:cc:dd:ee:01', txRate: 100, rxRate: 10, isWired: false },
      ];

      const result = computeCoverage(stations, emptyHistoricalData);
      const asymmetryDown = result.classifiers.find(c => c.id === 'asymmetry_downlink');
      expect(asymmetryDown!.affectedClients).toBe(1);
    });

    it('should exclude wired stations from calculation', () => {
      const stations = [
        { macAddress: 'aa:bb:cc:dd:ee:01', rssi: -80, isWired: true },
        { macAddress: 'aa:bb:cc:dd:ee:02', rssi: -60, isWired: false },
      ];

      const result = computeCoverage(stations, emptyHistoricalData);
      expect(result.totalUserMinutes).toBe(1);
    });

    it('should deduplicate affected clients across classifiers', () => {
      const stations = [
        { macAddress: 'aa:bb:cc:dd:ee:01', rssi: -80, txRate: 10, rxRate: 100, isWired: false },
      ];

      const result = computeCoverage(stations, emptyHistoricalData);
      expect(result.affectedUserMinutes).toBe(1);
    });
  });

  describe('computeThroughput', () => {
    it('should return 100% for empty stations', () => {
      const result = computeThroughput([], emptyHistoricalData);
      expect(result.successRate).toBe(100);
      expect(result.id).toBe('throughput');
    });

    it('should detect clients below throughput threshold', () => {
      const stations = [
        { macAddress: '01', transmittedRate: 500000, receivedRate: 400000, isWired: false },
        { macAddress: '02', transmittedRate: 5000000, receivedRate: 5000000, isWired: false },
      ];

      const result = computeThroughput(stations, emptyHistoricalData);
      expect(result.affectedUserMinutes).toBe(1);
    });

    it('should classify coverage-related throughput issues', () => {
      const stations = [
        { macAddress: '01', transmittedRate: 500000, receivedRate: 400000, rssi: -75, isWired: false },
      ];

      const result = computeThroughput(stations, emptyHistoricalData);
      const coverageClassifier = result.classifiers.find(c => c.id === 'coverage');
      expect(coverageClassifier!.affectedClients).toBe(1);
    });

    it('should classify device capability issues', () => {
      const stations = [
        { macAddress: '01', transmittedRate: 500000, receivedRate: 400000, protocol: '802.11b', isWired: false },
      ];

      const result = computeThroughput(stations, emptyHistoricalData);
      const deviceCapClassifier = result.classifiers.find(c => c.id === 'device_capability');
      expect(deviceCapClassifier!.affectedClients).toBe(1);
    });

    it('should classify capacity issues for overloaded APs', () => {
      const stations = Array.from({ length: 35 }, (_, i) => ({
        macAddress: `mac${i}`,
        transmittedRate: 500000,
        receivedRate: 400000,
        apSerialNumber: 'AP001',
        isWired: false,
      }));

      const result = computeThroughput(stations, emptyHistoricalData);
      const capacityClassifier = result.classifiers.find(c => c.id === 'capacity');
      expect(capacityClassifier!.affectedClients).toBeGreaterThan(0);
    });

    it('should exclude idle clients (0 throughput)', () => {
      const stations = [
        { macAddress: '01', transmittedRate: 0, receivedRate: 0, isWired: false },
      ];

      const result = computeThroughput(stations, emptyHistoricalData);
      expect(result.affectedUserMinutes).toBe(0);
    });
  });

  describe('computeAPHealth', () => {
    it('should return 100% for empty APs', () => {
      const result = computeAPHealth([], emptyHistoricalData);
      expect(result.successRate).toBe(100);
      expect(result.id).toBe('ap_health');
    });

    it('should detect disconnected APs', () => {
      const aps = [
        { serialNumber: 'AP001', status: 'disconnected' },
        { serialNumber: 'AP002', status: 'online' },
      ];

      const result = computeAPHealth(aps, emptyHistoricalData);
      expect(result.successRate).toBe(50);
      const disconnectedClassifier = result.classifiers.find(c => c.id === 'ap_disconnected');
      expect(disconnectedClassifier!.affectedClients).toBe(1);
    });

    it('should detect offline APs', () => {
      const aps = [
        { serialNumber: 'AP001', connectionState: 'offline' },
      ];

      const result = computeAPHealth(aps, emptyHistoricalData);
      expect(result.affectedUserMinutes).toBe(1);
    });

    it('should detect low power APs', () => {
      const aps = [
        { serialNumber: 'AP001', lowPower: true, status: 'online' },
      ];

      const result = computeAPHealth(aps, emptyHistoricalData);
      const lowPowerClassifier = result.classifiers.find(c => c.id === 'low_power');
      expect(lowPowerClassifier!.affectedClients).toBe(1);
    });

    it('should detect degraded network status', () => {
      const aps = [
        { serialNumber: 'AP001', status: 'degraded' },
      ];

      const result = computeAPHealth(aps, emptyHistoricalData);
      const networkClassifier = result.classifiers.find(c => c.id === 'network');
      expect(networkClassifier!.affectedClients).toBe(1);
    });
  });

  describe('computeCapacity', () => {
    it('should return 100% for empty data', () => {
      const result = computeCapacity([], [], emptyHistoricalData);
      expect(result.successRate).toBe(100);
      expect(result.id).toBe('capacity');
    });

    it('should detect overloaded APs (>25 clients)', () => {
      const stations = Array.from({ length: 30 }, (_, i) => ({
        macAddress: `mac${i}`,
        apSerialNumber: 'AP001',
        isWired: false,
      }));
      const aps = [{ serialNumber: 'AP001' }];

      const result = computeCapacity(stations, aps, emptyHistoricalData);
      expect(result.successRate).toBe(0);
    });

    it('should calculate client count classifier', () => {
      const stations = Array.from({ length: 30 }, (_, i) => ({
        macAddress: `mac${i}`,
        apSerialNumber: 'AP001',
        isWired: false,
      }));
      const aps = [{ serialNumber: 'AP001' }];

      const result = computeCapacity(stations, aps, emptyHistoricalData);
      const clientCountClassifier = result.classifiers.find(c => c.id === 'client_count');
      expect(clientCountClassifier!.affectedClients).toBe(30);
    });

    it('should detect high usage clients', () => {
      const stations = [
        { macAddress: '01', transmittedRate: 30_000_000, receivedRate: 25_000_000, apSerialNumber: 'AP001', isWired: false },
      ];
      const aps = [{ serialNumber: 'AP001' }];

      const result = computeCapacity(stations, aps, emptyHistoricalData);
      const clientUsageClassifier = result.classifiers.find(c => c.id === 'client_usage');
      expect(clientUsageClassifier!.affectedClients).toBe(1);
    });
  });

  describe('computeSuccessfulConnects', () => {
    it('should return 100% for empty stations', () => {
      const result = computeSuccessfulConnects([], emptyHistoricalData);
      expect(result.successRate).toBe(100);
      expect(result.id).toBe('successful_connects');
    });

    it('should detect authentication failures', () => {
      const stations = [
        { macAddress: '01', authenticated: false },
        { macAddress: '02', authenticated: true },
      ];

      const result = computeSuccessfulConnects(stations, emptyHistoricalData);
      expect(result.successRate).toBe(50);
      const authClassifier = result.classifiers.find(c => c.id === 'authorization');
      expect(authClassifier!.affectedClients).toBe(1);
    });

    it('should detect DHCP failures (no IP)', () => {
      const stations = [
        { macAddress: '01', authenticated: true, ipAddress: null },
        { macAddress: '02', authenticated: true, ipAddress: '192.168.1.10' },
      ];

      const result = computeSuccessfulConnects(stations, emptyHistoricalData);
      const dhcpClassifier = result.classifiers.find(c => c.id === 'dhcp');
      expect(dhcpClassifier!.affectedClients).toBe(1);
    });
  });

  describe('computeTimeToConnect', () => {
    it('should return 100% for empty stations', () => {
      const result = computeTimeToConnect([], emptyHistoricalData);
      expect(result.successRate).toBe(100);
      expect(result.id).toBe('time_to_connect');
    });

    it('should detect slow connects based on weak signal', () => {
      const stations = [
        { macAddress: '01', rssi: -80, isWired: false },
        { macAddress: '02', rssi: -50, isWired: false },
      ];

      const result = computeTimeToConnect(stations, emptyHistoricalData);
      expect(result.affectedUserMinutes).toBe(1);
    });

    it('should exclude wired clients', () => {
      const stations = [
        { macAddress: '01', rssi: -80, isWired: true },
      ];

      const result = computeTimeToConnect(stations, emptyHistoricalData);
      expect(result.totalUserMinutes).toBe(0);
    });
  });

  describe('computeRoaming', () => {
    it('should return 100% for empty stations', () => {
      const result = computeRoaming([], emptyHistoricalData);
      expect(result.successRate).toBe(100);
      expect(result.id).toBe('roaming');
    });

    it('should detect sticky clients', () => {
      const stations = [
        { macAddress: '01', rssi: -80, uptime: 600, isWired: false },
        { macAddress: '02', rssi: -50, uptime: 600, isWired: false },
      ];

      const result = computeRoaming(stations, emptyHistoricalData);
      expect(result.affectedUserMinutes).toBe(1);
      const signalQuality = result.classifiers.find(c => c.id === 'signal_quality');
      expect(signalQuality).toBeDefined();
    });

    it('should not flag clients with poor signal but short uptime', () => {
      const stations = [
        { macAddress: '01', rssi: -80, uptime: 60, isWired: false },
      ];

      const result = computeRoaming(stations, emptyHistoricalData);
      expect(result.affectedUserMinutes).toBe(0);
    });
  });

  describe('computeAllWirelessSLEs', () => {
    it('should return all 7 SLE metrics', () => {
      const result = computeAllWirelessSLEs([], [], emptyHistoricalData);
      expect(result).toHaveLength(7);
    });

    it('should include all expected SLE types', () => {
      const result = computeAllWirelessSLEs([], [], emptyHistoricalData);
      const ids = result.map(m => m.id);

      expect(ids).toContain('time_to_connect');
      expect(ids).toContain('successful_connects');
      expect(ids).toContain('coverage');
      expect(ids).toContain('roaming');
      expect(ids).toContain('throughput');
      expect(ids).toContain('capacity');
      expect(ids).toContain('ap_health');
    });

    it('should calculate metrics with sample data', () => {
      const stations = [
        { macAddress: '01', rssi: -65, isWired: false, authenticated: true },
        { macAddress: '02', rssi: -75, isWired: false, authenticated: true },
      ];
      const aps = [{ serialNumber: 'AP001', status: 'online' }];

      const result = computeAllWirelessSLEs(stations, aps, emptyHistoricalData);

      result.forEach(metric => {
        expect(metric.successRate).toBeGreaterThanOrEqual(0);
        expect(metric.successRate).toBeLessThanOrEqual(100);
        expect(['good', 'warn', 'poor']).toContain(metric.status);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle null/undefined rssi values', () => {
      const stations = [
        { macAddress: '01', rssi: null, isWired: false },
        { macAddress: '02', rss: undefined, isWired: false },
      ];

      const result = computeCoverage(stations, emptyHistoricalData);
      expect(result.successRate).toBe(100);
    });

    it('should handle mixed field names', () => {
      const stations = [
        { macAddress: '01', rss: -80, transmittedRate: 500000, isWired: false },
        { macAddress: '02', rssi: -80, txRate: 500000, isWired: false },
      ];

      const result = computeCoverage(stations, emptyHistoricalData);
      expect(result.affectedUserMinutes).toBe(2);
    });

    it('should handle stations with all wired clients', () => {
      const stations = [
        { macAddress: '01', rssi: -80, isWired: true },
        { macAddress: '02', rssi: -80, isWired: true },
      ];

      const result = computeCoverage(stations, emptyHistoricalData);
      expect(result.totalUserMinutes).toBe(0);
      expect(result.successRate).toBe(100);
    });
  });
});
