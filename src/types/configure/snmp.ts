/**
 * SNMP settings (`/v1/snmp`, singleton) — derived from the live record
 * (api/snmp.json). Also embedded per-site as `snmpConfig`.
 */

/** v3 user / notification target shapes were not populated on the lab box. */
export interface SnmpV3User {
  name?: string;
  authProtocol?: string;
  privProtocol?: string;
  [key: string]: unknown;
}

export interface SnmpNotification {
  ipAddress?: string;
  port?: number;
  [key: string]: unknown;
}

export interface SnmpSettings {
  custId: string | null;
  id: string | null;
  canDelete: boolean | null;
  canEdit: boolean | null;
  snmpVersion: string | null; // 'DISABLED' | 'V2' | 'V3'
  engineId: string | null;
  context: string | null;
  trapSeverity: string; // 'Critical' | 'Major' | ...
  v2Communities: Record<string, string> | null;
  v3Users: SnmpV3User[];
  notifications: SnmpNotification[];
}
