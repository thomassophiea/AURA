/**
 * Site Context Types
 *
 * Defines context-based configurations for different types of sites/venues.
 * Each context has baseline metrics that define what "healthy" means for that environment.
 */

export interface ContextMetric {
  name: string;
  label: string;
  description: string;
  min: number;
  max: number;
  defaultValue: number;
  unit: string;
  category: 'performance' | 'reliability' | 'quality';
}

export interface SiteContext {
  id: string;
  name: string;
  description: string;
  color: string;
  metrics: {
    apUptimeThreshold: number;        // % - Minimum acceptable AP uptime
    throughputThreshold: number;       // Mbps - Minimum acceptable throughput
    signalQualityThreshold: number;    // dBm - Minimum acceptable RSSI
    clientDensity: number;             // clients per AP - Expected client density
    latencyThreshold: number;          // ms - Maximum acceptable latency
    packetLossThreshold: number;       // % - Maximum acceptable packet loss
    coverageThreshold: number;         // % - Minimum coverage requirement
    interferenceThreshold: number;     // % - Maximum acceptable interference
  };
  isCustom: boolean;
  createdAt: string;
  updatedAt: string;
}

export const AVAILABLE_METRICS: ContextMetric[] = [
  {
    name: 'apUptimeThreshold',
    label: 'AP Uptime',
    description: 'Minimum acceptable access point uptime percentage',
    min: 50,
    max: 100,
    defaultValue: 95,
    unit: '%',
    category: 'reliability'
  },
  {
    name: 'throughputThreshold',
    label: 'Throughput',
    description: 'Minimum acceptable network throughput',
    min: 1,
    max: 1000,
    defaultValue: 50,
    unit: 'Mbps',
    category: 'performance'
  },
  {
    name: 'signalQualityThreshold',
    label: 'Signal Quality (RSSI)',
    description: 'Minimum acceptable signal strength',
    min: -90,
    max: -30,
    defaultValue: -70,
    unit: 'dBm',
    category: 'quality'
  },
  {
    name: 'clientDensity',
    label: 'Client Density',
    description: 'Expected number of clients per access point',
    min: 1,
    max: 100,
    defaultValue: 25,
    unit: 'clients/AP',
    category: 'performance'
  },
  {
    name: 'latencyThreshold',
    label: 'Latency',
    description: 'Maximum acceptable network latency',
    min: 1,
    max: 500,
    defaultValue: 50,
    unit: 'ms',
    category: 'performance'
  },
  {
    name: 'packetLossThreshold',
    label: 'Packet Loss',
    description: 'Maximum acceptable packet loss percentage',
    min: 0,
    max: 10,
    defaultValue: 1,
    unit: '%',
    category: 'quality'
  },
  {
    name: 'coverageThreshold',
    label: 'Coverage',
    description: 'Minimum required coverage percentage',
    min: 50,
    max: 100,
    defaultValue: 90,
    unit: '%',
    category: 'reliability'
  },
  {
    name: 'interferenceThreshold',
    label: 'Interference',
    description: 'Maximum acceptable interference level',
    min: 0,
    max: 50,
    defaultValue: 15,
    unit: '%',
    category: 'quality'
  }
];

export const DEFAULT_CONTEXTS: SiteContext[] = [
  {
    id: 'retail-store',
    name: 'Retail Store',
    description: 'High-density customer environment with moderate throughput needs',
    color: '#3b82f6',
    metrics: {
      apUptimeThreshold: 99,
      throughputThreshold: 30,
      signalQualityThreshold: -65,
      clientDensity: 40,
      latencyThreshold: 30,
      packetLossThreshold: 0.5,
      coverageThreshold: 95,
      interferenceThreshold: 10
    },
    isCustom: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    description: 'Large coverage area with mobile devices and scanners',
    color: '#f59e0b',
    metrics: {
      apUptimeThreshold: 98,
      throughputThreshold: 20,
      signalQualityThreshold: -75,
      clientDensity: 15,
      latencyThreshold: 50,
      packetLossThreshold: 1,
      coverageThreshold: 98,
      interferenceThreshold: 20
    },
    isCustom: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'distribution-center',
    name: 'Distribution Center',
    description: 'Critical operations requiring high reliability and coverage',
    color: '#8b5cf6',
    metrics: {
      apUptimeThreshold: 99.5,
      throughputThreshold: 50,
      signalQualityThreshold: -70,
      clientDensity: 20,
      latencyThreshold: 40,
      packetLossThreshold: 0.5,
      coverageThreshold: 99,
      interferenceThreshold: 10
    },
    isCustom: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'headquarters',
    name: 'Headquarters',
    description: 'Office environment with high throughput and quality requirements',
    color: '#10b981',
    metrics: {
      apUptimeThreshold: 99.9,
      throughputThreshold: 100,
      signalQualityThreshold: -60,
      clientDensity: 30,
      latencyThreshold: 20,
      packetLossThreshold: 0.3,
      coverageThreshold: 95,
      interferenceThreshold: 15
    },
    isCustom: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];
