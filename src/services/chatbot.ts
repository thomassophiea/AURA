import { apiService } from './api';
import { trafficService } from './traffic';
import { siteMappingService } from './siteMapping';

export interface ChatMessage {
  id: string;
  type: 'user' | 'bot';
  content: string;
  timestamp: Date;
  data?: any; // Additional structured data for rich responses
}

export interface QueryContext {
  accessPoints?: any[];
  stations?: any[];
  sites?: any[];
  services?: any[];
  globalSettings?: any;
}

export class ChatbotService {
  private context: QueryContext = {};
  private isInitialized = false;

  // Helper method to gracefully get global settings
  private async getGlobalSettingsGracefully() {
    try {
      // Check if the method exists on the apiService
      if (typeof (apiService as any).getGlobalSettings === 'function') {
        return await (apiService as any).getGlobalSettings();
      }
      
      // Use the direct API call if getGlobalSettings method doesn't exist
      const response = await apiService.makeAuthenticatedRequest('/v1/globalsettings');
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      // Silently handle failures for global settings since it's not critical
      return null;
    }
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // Load basic context data
      await this.refreshContext();
      this.isInitialized = true;
      console.log('Chatbot service initialized with context');
    } catch (error) {
      console.warn('Failed to initialize chatbot context:', error);
    }
  }

  async refreshContext() {
    try {
      // Load key data in parallel
      const [accessPoints, stations, sites, globalSettings] = await Promise.allSettled([
        apiService.getAccessPoints().catch(() => []),
        apiService.getStationsWithSiteCorrelation().catch(() => []),
        apiService.getSites().catch(() => []),
        this.getGlobalSettingsGracefully().catch(() => null)
      ]);

      this.context = {
        accessPoints: accessPoints.status === 'fulfilled' ? accessPoints.value : [],
        stations: stations.status === 'fulfilled' ? stations.value : [],
        sites: sites.status === 'fulfilled' ? sites.value : [],
        globalSettings: globalSettings.status === 'fulfilled' ? globalSettings.value : null
      };
    } catch (error) {
      console.warn('Failed to refresh chatbot context:', error);
    }
  }

  async processQuery(query: string): Promise<ChatMessage> {
    await this.initialize();
    
    const normalizedQuery = query.toLowerCase().trim();
    const messageId = `bot-${Date.now()}`;

    try {
      // Intent detection based on keywords
      const intent = this.detectIntent(normalizedQuery);
      
      let response: string;
      let data: any = null;

      switch (intent.type) {
        case 'access_points_status':
          response = await this.handleAccessPointsQuery(normalizedQuery, intent);
          break;
        case 'connected_clients':
          response = await this.handleConnectedClientsQuery(normalizedQuery, intent);
          break;
        case 'network_settings':
          response = await this.handleNetworkSettingsQuery(normalizedQuery, intent);
          break;
        case 'site_info':
          response = await this.handleSiteInfoQuery(normalizedQuery, intent);
          break;
        case 'troubleshooting':
          response = await this.handleTroubleshootingQuery(normalizedQuery, intent);
          break;
        case 'stats_summary':
          response = await this.handleStatsQuery(normalizedQuery, intent);
          break;
        default:
          response = this.getHelpResponse();
      }

      return {
        id: messageId,
        type: 'bot',
        content: response,
        timestamp: new Date(),
        data
      };
    } catch (error) {
      console.error('Error processing chatbot query:', error);
      return {
        id: messageId,
        type: 'bot',
        content: "I encountered an error while processing your request. Please try again or contact support if the issue persists.",
        timestamp: new Date()
      };
    }
  }

  private detectIntent(query: string) {
    const patterns = {
      access_points_status: [
        /access\s*point|ap\s|aps\s/,
        /how\s+many\s+aps?/,
        /ap\s+status|access\s+point\s+status/,
        /offline\s+aps?|down\s+aps?/,
        /ap\s+health|access\s+point\s+health/
      ],
      connected_clients: [
        /client|station|device/,
        /how\s+many\s+clients?/,
        /connected\s+users?/,
        /client\s+count|device\s+count/,
        /wireless\s+clients?/
      ],
      network_settings: [
        /settings?|config|configuration/,
        /network\s+config|wifi\s+config/,
        /ssid|network\s+name/,
        /security|password|encryption/
      ],
      site_info: [
        /site|location|sites?/,
        /which\s+sites?|what\s+sites?/,
        /site\s+status|site\s+health/
      ],
      troubleshooting: [
        /problem|issue|error|trouble|help/,
        /not\s+working|broken|down/,
        /can't\s+connect|cannot\s+connect/,
        /slow|performance/
      ],
      stats_summary: [
        /overview|summary|stats|statistics/,
        /dashboard|report|status/,
        /network\s+health|system\s+health/
      ]
    };

    for (const [intentType, regexPatterns] of Object.entries(patterns)) {
      if (regexPatterns.some(pattern => pattern.test(query))) {
        return {
          type: intentType,
          confidence: 0.8,
          extractedEntities: this.extractEntities(query)
        };
      }
    }

    return { type: 'unknown', confidence: 0.0, extractedEntities: {} };
  }

  private extractEntities(query: string) {
    const entities: any = {};
    
    // Extract site names
    if (this.context.sites) {
      const siteNames = this.context.sites.map(site => site.name?.toLowerCase()).filter(Boolean);
      const mentionedSite = siteNames.find(name => query.includes(name));
      if (mentionedSite) {
        entities.site = mentionedSite;
      }
    }

    // Extract AP serial numbers or names
    const serialMatch = query.match(/([a-z0-9]{12,})/i);
    if (serialMatch) {
      entities.serialNumber = serialMatch[1];
    }

    // Extract MAC addresses
    const macMatch = query.match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i);
    if (macMatch) {
      entities.macAddress = macMatch[0];
    }

    return entities;
  }

  private async handleAccessPointsQuery(query: string, intent: any): Promise<string> {
    const aps = this.context.accessPoints || [];
    
    if (aps.length === 0) {
      return "I couldn't retrieve access point information at the moment. Please ensure you have the necessary permissions and try again.";
    }

    const onlineAPs = aps.filter(ap => ap.status?.toLowerCase() === 'online' || ap.operationalStatus?.toLowerCase() === 'up');
    const offlineAPs = aps.filter(ap => ap.status?.toLowerCase() === 'offline' || ap.operationalStatus?.toLowerCase() === 'down');
    
    if (query.includes('how many') || query.includes('count')) {
      return `You have **${aps.length} total access points**:
• **${onlineAPs.length} online** (${((onlineAPs.length / aps.length) * 100).toFixed(1)}%)
• **${offlineAPs.length} offline** (${((offlineAPs.length / aps.length) * 100).toFixed(1)}%)

${offlineAPs.length > 0 ? `⚠️ **Attention needed**: ${offlineAPs.length} access points are offline.` : '✅ All access points are online!'}`;
    }

    if (query.includes('offline') || query.includes('down') || query.includes('problem')) {
      if (offlineAPs.length === 0) {
        return "✅ Great news! All your access points are currently online and operational.";
      } else {
        const offlineDetails = offlineAPs.slice(0, 5).map(ap => 
          `• **${ap.apName || ap.displayName || ap.serialNumber}** (${ap.siteName || 'Unknown Site'})`
        ).join('\n');
        
        return `⚠️ **${offlineAPs.length} access points are offline:**

${offlineDetails}${offlineAPs.length > 5 ? `\n...and ${offlineAPs.length - 5} more` : ''}

**Recommendations:**
1. Check physical power connections
2. Verify network connectivity
3. Check for firmware issues
4. Contact support if problems persist`;
      }
    }

    // Default AP status overview
    const siteBreakdown = this.groupAPsBySite(aps);
    const siteInfo = Object.entries(siteBreakdown).slice(0, 3).map(([site, count]) => 
      `• **${site}**: ${count} APs`
    ).join('\n');

    return `📡 **Access Points Overview:**

**Total**: ${aps.length} access points
**Status**: ${onlineAPs.length} online, ${offlineAPs.length} offline

**Top Sites:**
${siteInfo}

**Health Score**: ${((onlineAPs.length / aps.length) * 100).toFixed(1)}%

Type "offline APs" to see details about any issues.`;
  }

  private async handleConnectedClientsQuery(query: string, intent: any): Promise<string> {
    const stations = this.context.stations || [];
    
    if (stations.length === 0) {
      return "I couldn't retrieve connected client information at the moment. Please check your permissions and try again.";
    }

    const activeClients = stations.filter(station => 
      station.status?.toLowerCase() === 'connected' || 
      station.status?.toLowerCase() === 'associated' ||
      station.status?.toLowerCase() === 'active'
    );

    if (query.includes('how many') || query.includes('count')) {
      const deviceTypes = this.groupClientsByType(activeClients);
      const typeBreakdown = Object.entries(deviceTypes).slice(0, 3).map(([type, count]) => 
        `• **${type}**: ${count} devices`
      ).join('\n');

      return `👥 **Connected Clients:**

**Total Active**: ${activeClients.length} clients
**Total Tracked**: ${stations.length} clients

**Device Breakdown:**
${typeBreakdown}

**Connection Quality:**
• **Excellent**: ${this.getClientsBySignalQuality(activeClients, 'excellent')} clients
• **Good**: ${this.getClientsBySignalQuality(activeClients, 'good')} clients  
• **Fair/Poor**: ${this.getClientsBySignalQuality(activeClients, 'poor')} clients`;
    }

    // Check for specific client MAC
    if (intent.extractedEntities.macAddress) {
      const client = stations.find(s => 
        s.macAddress?.toLowerCase() === intent.extractedEntities.macAddress.toLowerCase()
      );
      
      if (client) {
        return `📱 **Client Found**: ${client.hostName || client.macAddress}

**Status**: ${client.status || 'Unknown'}
**IP Address**: ${client.ipAddress || 'Not assigned'}
**Access Point**: ${client.apName || client.apSerial || 'Unknown'}
**Site**: ${client.siteName || 'Unknown'}
**Signal Strength**: ${client.rss || client.signalStrength || 'N/A'} dBm
**Connected Since**: ${client.firstSeen || 'Unknown'}`;
      } else {
        return `❌ **Client not found**: No active client with MAC address ${intent.extractedEntities.macAddress} was found.`;
      }
    }

    // Default clients overview
    const siteDistribution = this.groupClientsBySite(activeClients);
    const siteInfo = Object.entries(siteDistribution).slice(0, 3).map(([site, count]) => 
      `• **${site}**: ${count} clients`
    ).join('\n');

    return `👥 **Connected Clients Overview:**

**Active Connections**: ${activeClients.length}
**Total Devices Seen**: ${stations.length}

**Site Distribution:**
${siteInfo}

**Recent Activity**: ${this.getRecentActivitySummary(stations)}

Need details about a specific client? Provide the MAC address!`;
  }

  private async handleNetworkSettingsQuery(query: string, intent: any): Promise<string> {
    try {
      // Try to get services/network configurations
      const services = await apiService.getServices().catch(() => []);
      const globalSettings = this.context.globalSettings;

      if (services.length === 0 && !globalSettings) {
        return "I couldn't retrieve network configuration information. Please check your permissions.";
      }

      if (query.includes('ssid') || query.includes('network name')) {
        const ssids = services
          .filter(service => service.ssid)
          .map(service => `• **${service.ssid}** (${service.networkName || 'Default'})`)
          .slice(0, 10);

        return `📶 **Network SSIDs:**

${ssids.length > 0 ? ssids.join('\n') : 'No SSIDs configured or visible.'}

${ssids.length > 10 ? `\n...and ${services.length - 10} more networks` : ''}

Type "security settings" for encryption details.`;
      }

      if (query.includes('security') || query.includes('encryption')) {
        const securitySummary = services
          .filter(service => service.ssid)
          .map(service => `• **${service.ssid}**: ${service.securityMode || 'Unknown'} ${service.encryptionMethod || ''}`)
          .slice(0, 8);

        return `🔒 **Network Security:**

${securitySummary.length > 0 ? securitySummary.join('\n') : 'No security information available.'}

**Security Recommendations:**
✅ Use WPA3 when possible
✅ Enable strong passphrases  
✅ Regular security audits
✅ Guest network isolation`;
      }

      // General settings overview
      return `⚙️ **Network Configuration:**

**Total Networks**: ${services.length}
**Active SSIDs**: ${services.filter(s => s.ssid).length}

**Configuration Areas:**
• Wireless Networks & SSIDs
• Security & Encryption
• Access Control Policies
• Guest Access Settings
• Quality of Service (QoS)

Ask about specific settings like "SSIDs" or "security settings" for details.`;

    } catch (error) {
      return "I encountered an error retrieving network settings. Please try again.";
    }
  }

  private async handleSiteInfoQuery(query: string, intent: any): Promise<string> {
    const sites = this.context.sites || [];
    
    if (sites.length === 0) {
      return "I couldn't retrieve site information. Please check your permissions.";
    }

    if (intent.extractedEntities.site) {
      const site = sites.find(s => 
        s.name?.toLowerCase().includes(intent.extractedEntities.site)
      );
      
      if (site) {
        const siteAPs = this.context.accessPoints?.filter(ap => ap.siteId === site.id) || [];
        const siteClients = this.context.stations?.filter(station => station.siteId === site.id) || [];
        
        return `🏢 **Site: ${site.name}**

**Access Points**: ${siteAPs.length} (${siteAPs.filter(ap => ap.status?.toLowerCase() === 'online').length} online)
**Connected Clients**: ${siteClients.filter(c => c.status?.toLowerCase() === 'connected').length}
**Location**: ${site.address || site.location || 'Not specified'}
**Timezone**: ${site.timezone || 'Not specified'}

**Health Status**: ${this.calculateSiteHealth(siteAPs, siteClients)}`;
      }
    }

    // General sites overview
    const siteHealth = sites.map(site => {
      const siteAPs = this.context.accessPoints?.filter(ap => ap.siteId === site.id) || [];
      const onlineAPs = siteAPs.filter(ap => ap.status?.toLowerCase() === 'online');
      const healthScore = siteAPs.length > 0 ? (onlineAPs.length / siteAPs.length) * 100 : 0;
      
      return {
        name: site.name,
        health: healthScore,
        apCount: siteAPs.length
      };
    }).sort((a, b) => b.health - a.health);

    const healthySites = siteHealth.filter(s => s.health >= 90).length;
    const warningSites = siteHealth.filter(s => s.health >= 70 && s.health < 90).length;
    const criticalSites = siteHealth.filter(s => s.health < 70).length;

    const topSites = siteHealth.slice(0, 5).map(site => 
      `• **${site.name}**: ${site.health.toFixed(1)}% (${site.apCount} APs)`
    ).join('\n');

    return `🏢 **Sites Overview:**

**Total Sites**: ${sites.length}
**Health Distribution**:
• 🟢 **Healthy** (≥90%): ${healthySites} sites
• 🟡 **Warning** (70-89%): ${warningSites} sites  
• 🔴 **Critical** (<70%): ${criticalSites} sites

**Site Health Rankings:**
${topSites}

Ask about a specific site by name for detailed information.`;
  }

  private async handleTroubleshootingQuery(query: string, intent: any): Promise<string> {
    const aps = this.context.accessPoints || [];
    const stations = this.context.stations || [];
    
    if (query.includes("can't connect") || query.includes("cannot connect")) {
      return `🔧 **Connection Troubleshooting:**

**Quick Checks:**
1. **Verify SSID**: Ensure you're connecting to the correct network
2. **Check Password**: Confirm WiFi password is correct  
3. **Signal Strength**: Move closer to access point
4. **Device Limits**: Check if network has client limits

**Network Status:**
• Access Points Online: ${aps.filter(ap => ap.status?.toLowerCase() === 'online').length}/${aps.length}
• Active Clients: ${stations.filter(s => s.status?.toLowerCase() === 'connected').length}

**If problems persist:**
• Restart your device's WiFi
• Forget and reconnect to network
• Check for device-specific issues
• Contact IT support`;
    }

    if (query.includes('slow') || query.includes('performance')) {
      const poorSignalClients = stations.filter(station => {
        const rss = station.rss || station.signalStrength;
        return rss && parseInt(rss) < -70;
      }).length;

      return `🐌 **Performance Troubleshooting:**

**Current Network Load:**
• Connected Clients: ${stations.filter(s => s.status?.toLowerCase() === 'connected').length}
• Poor Signal Clients: ${poorSignalClients}

**Performance Optimization:**
1. **Signal Strength**: Move closer to access point
2. **Bandwidth**: Check for heavy usage applications
3. **Interference**: Avoid 2.4GHz congestion
4. **Access Point Load**: Balance across multiple APs

**Recommendations:**
• Use 5GHz when available
• Update device drivers
• Check background applications
• Consider mesh network expansion`;
    }

    // General troubleshooting
    const offlineAPs = aps.filter(ap => ap.status?.toLowerCase() === 'offline').length;
    const issues = [];
    
    if (offlineAPs > 0) issues.push(`${offlineAPs} access points offline`);
    if (poorSignalClients > 0) issues.push(`${poorSignalClients} clients with poor signal`);
    
    return `🛠️ **Network Health Check:**

${issues.length > 0 ? 
  `**Issues Detected:**\n${issues.map(issue => `⚠️ ${issue}`).join('\n')}` : 
  '✅ **No major issues detected**'
}

**Common Solutions:**
• **Connectivity**: Check "offline APs" for access point issues
• **Performance**: Ask about "slow performance" 
• **Client Issues**: Provide MAC address for specific client help
• **Network Settings**: Ask about "network configuration"

What specific issue can I help you troubleshoot?`;
  }

  private async handleStatsQuery(query: string, intent: any): Promise<string> {
    const aps = this.context.accessPoints || [];
    const stations = this.context.stations || [];
    const sites = this.context.sites || [];

    const onlineAPs = aps.filter(ap => ap.status?.toLowerCase() === 'online');
    const activeClients = stations.filter(station => 
      station.status?.toLowerCase() === 'connected' || 
      station.status?.toLowerCase() === 'associated'
    );

    const networkHealth = aps.length > 0 ? (onlineAPs.length / aps.length) * 100 : 0;
    
    // Calculate basic traffic stats if available
    let totalTraffic = 0;
    stations.forEach(station => {
      const rx = station.rxBytes || station.inBytes || 0;
      const tx = station.txBytes || station.outBytes || 0;
      totalTraffic += rx + tx;
    });

    return `📊 **Network Statistics Summary:**

**🏢 Infrastructure:**
• Sites: ${sites.length}
• Access Points: ${aps.length} (${onlineAPs.length} online)
• Network Health: ${networkHealth.toFixed(1)}%

**👥 Clients:**
• Active Connections: ${activeClients.length}
• Total Devices Tracked: ${stations.length}
• Device Types: ${this.getUniqueDeviceTypesCount()} different types

**📈 Performance:**
• Total Data Transfer: ${this.formatBytes(totalTraffic)}
• Average Clients per AP: ${aps.length > 0 ? (activeClients.length / aps.length).toFixed(1) : 0}
• Signal Quality: ${this.getSignalQualitySummary(activeClients)}

**⚡ Quick Actions:**
• Type "problems" for troubleshooting
• Type "offline APs" for device issues  
• Type "client count" for user details
• Type "sites" for location breakdown`;
  }

  private getHelpResponse(): string {
    return `🤖 **Network Assistant Help:**

I can help you with information about your AURA network:

**📡 Access Points:**
• "How many access points?" - Get AP count and status
• "Offline APs" - Check for device issues
• "AP health" - Overall access point status

**👥 Connected Clients:**
• "How many clients?" - Client count and breakdown
• "Client [MAC address]" - Specific client details
• "Device types" - Connected device categories

**⚙️ Network Settings:**  
• "SSIDs" or "Network names" - View wireless networks
• "Security settings" - Encryption and security info
• "Network configuration" - General settings overview

**🏢 Sites & Locations:**
• "Sites" - Site health and status
• "Site [name]" - Specific site details

**🛠️ Troubleshooting:**
• "Problems" or "Issues" - Network health check
• "Can't connect" - Connection troubleshooting
• "Slow performance" - Performance optimization

**📊 Statistics:**
• "Overview" or "Summary" - Network statistics
• "Network health" - Overall system status

Try asking something like "How many clients are connected?" or "Show me offline access points"`;
  }

  // Helper methods
  private groupAPsBySite(aps: any[]): Record<string, number> {
    return aps.reduce((acc, ap) => {
      const site = ap.siteName || 'Unknown Site';
      acc[site] = (acc[site] || 0) + 1;
      return acc;
    }, {});
  }

  private groupClientsByType(clients: any[]): Record<string, number> {
    return clients.reduce((acc, client) => {
      const type = client.deviceType || 'Unknown Device';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
  }

  private groupClientsBySite(clients: any[]): Record<string, number> {
    return clients.reduce((acc, client) => {
      const site = client.siteName || 'Unknown Site';
      acc[site] = (acc[site] || 0) + 1;
      return acc;
    }, {});
  }

  private getClientsBySignalQuality(clients: any[], quality: string): number {
    return clients.filter(client => {
      const rss = client.rss || client.signalStrength;
      if (!rss) return false;
      
      const signal = parseInt(rss);
      switch (quality) {
        case 'excellent': return signal >= -30;
        case 'good': return signal >= -60 && signal < -30;
        case 'poor': return signal < -60;
        default: return false;
      }
    }).length;
  }

  private calculateSiteHealth(aps: any[], clients: any[]): string {
    if (aps.length === 0) return 'No APs';
    
    const onlineAPs = aps.filter(ap => ap.status?.toLowerCase() === 'online').length;
    const healthScore = (onlineAPs / aps.length) * 100;
    
    if (healthScore >= 90) return '🟢 Excellent';
    if (healthScore >= 70) return '🟡 Good';
    return '🔴 Needs Attention';
  }

  private getRecentActivitySummary(stations: any[]): string {
    const recentClients = stations.filter(station => {
      if (!station.lastSeen) return false;
      const lastSeen = new Date(station.lastSeen);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return lastSeen > fiveMinutesAgo;
    }).length;
    
    return `${recentClients} clients active in last 5 minutes`;
  }

  private getUniqueDeviceTypesCount(): number {
    const types = new Set(this.context.stations?.map(s => s.deviceType).filter(Boolean));
    return types.size;
  }

  private getSignalQualitySummary(clients: any[]): string {
    const excellent = this.getClientsBySignalQuality(clients, 'excellent');
    const good = this.getClientsBySignalQuality(clients, 'good');
    const poor = this.getClientsBySignalQuality(clients, 'poor');
    
    const total = excellent + good + poor;
    if (total === 0) return 'No signal data';
    
    const excellentPct = ((excellent / total) * 100).toFixed(0);
    return `${excellentPct}% excellent signal`;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const chatbotService = new ChatbotService();