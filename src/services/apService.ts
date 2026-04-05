/**
 * Access Point Service - AP management and configuration
 * Extracted from api.ts
 */

export interface AccessPoint {
  serialNumber: string;
  name: string;
  status: 'online' | 'offline' | 'rogue';
  siteId?: string;
  firmwareVersion?: string;
}

class APService {
  async getAccessPoints(siteId?: string): Promise<AccessPoint[]> {
    // Placeholder - will extract from api.ts
    return [];
  }

  async getAPById(serialNumber: string): Promise<AccessPoint | null> {
    // Placeholder
    return null;
  }

  async assignAPToSite(serialNumber: string, siteId: string): Promise<void> {
    // Placeholder
  }

  async upgradeAPFirmware(serialNumbers: string[], version?: string): Promise<void> {
    // Placeholder
  }

  async rebootAP(serialNumbers: string[]): Promise<void> {
    // Placeholder
  }

  async getAPLogs(serialNumber: string): Promise<string> {
    // Placeholder
    return '';
  }
}

export const apService = new APService();
