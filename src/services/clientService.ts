/**
 * Client Service - Wireless client management
 * Extracted from api.ts (10K+ LOC decomposition)
 */

export interface WirelessClient {
  macAddress: string;
  ipAddress: string;
  hostname: string;
  status: 'connected' | 'disconnected' | 'blocked';
  apSerialNumber?: string;
  signalStrength?: number;
  bandWidth?: string;
}

class ClientService {
  async getClients(siteId?: string, filters?: Record<string, any>): Promise<WirelessClient[]> {
    // Extract from api.ts: getClients, getConnectedClients
    return [];
  }

  async getClientById(macAddress: string): Promise<WirelessClient | null> {
    return null;
  }

  async blockClient(macAddress: string, reason?: string): Promise<void> {
    // Extract from api.ts: blockStation
  }

  async unblockClient(macAddress: string): Promise<void> {
    // Extract from api.ts: unblockStation
  }

  async disconnectClient(macAddress: string): Promise<void> {
    // Extract from api.ts: disassociateStation
  }

  async reauthenticateClient(macAddress: string): Promise<void> {
    // Extract from api.ts: reauthenticateStation
  }

  async bulkBlockClients(macAddresses: string[]): Promise<void> {
    // Extract from api.ts: bulkBlockStations
  }

  async addToAllowList(macAddress: string, siteId?: string): Promise<void> {
    // Extract from api.ts: addStationToAllowList
  }

  async addToDenyList(macAddress: string, siteId?: string): Promise<void> {
    // Extract from api.ts: addStationToDenyList
  }
}

export const clientService = new ClientService();
