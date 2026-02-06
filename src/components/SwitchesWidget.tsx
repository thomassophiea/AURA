import { useState, useEffect, memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Network, AlertCircle, CheckCircle, Clock, MapPin } from 'lucide-react';
import { apiService } from '../services/api';
import { DetailSlideOut } from './DetailSlideOut';

interface Switch {
  serialNumber: string;
  displayName?: string;
  model?: string;
  hardwareType?: string;
  platformName?: string;
  status?: string;
  connectionState?: string;
  operationalState?: string;
  ipAddress?: string;
  macAddress?: string;
  siteId?: string;
  siteName?: string;
  uptime?: number;
  firmwareVersion?: string;
  lastSeen?: number;
  portCount?: number;
  ports?: any[];
}

interface SwitchesWidgetProps {
  siteId?: string;
}

/**
 * Switches Widget
 *
 * Displays network switches with:
 * - Total switch count
 * - Online/offline status
 * - Switch models distribution
 * - Detailed switch information in slide-out panel
 *
 * Uses Extreme Platform ONE API: GET /v1/switches
 */
export function SwitchesWidget({ siteId }: SwitchesWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switches, setSwitches] = useState<Switch[]>([]);
  const [selectedSwitch, setSelectedSwitch] = useState<Switch | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    loadSwitches();
  }, [siteId]);

  const loadSwitches = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('[SwitchesWidget] Loading switches' + (siteId ? ` for site: ${siteId}` : ''));
      let allSwitches = await apiService.getSwitches();

      // Filter by site if siteId is provided
      if (siteId && siteId !== 'all') {
        allSwitches = allSwitches.filter(sw => sw.siteId === siteId);
        console.log(`[SwitchesWidget] Filtered to ${allSwitches.length} switches for site ${siteId}`);
      }

      setSwitches(allSwitches);
      console.log(`[SwitchesWidget] Loaded ${allSwitches.length} switches`);
    } catch (err) {
      console.error('[SwitchesWidget] Error loading switches:', err);
      setError('Failed to load switches');
      setSwitches([]);
    } finally {
      setLoading(false);
    }
  };

  const getStats = () => {
    const stats = {
      total: switches.length,
      online: 0,
      offline: 0,
      models: {} as Record<string, number>
    };

    switches.forEach(sw => {
      // Check status/connectionState
      const isOnline = sw.status === 'online' ||
                      sw.connectionState === 'connected' ||
                      sw.operationalState === 'up';

      if (isOnline) {
        stats.online++;
      } else {
        stats.offline++;
      }

      // Track models
      const model = sw.hardwareType || sw.platformName || sw.model || 'Unknown Model';
      stats.models[model] = (stats.models[model] || 0) + 1;
    });

    return stats;
  };

  const handleSwitchClick = (sw: Switch) => {
    setSelectedSwitch(sw);
    setDetailsOpen(true);
  };

  const formatUptime = (seconds?: number): string => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const formatLastSeen = (timestamp?: number): string => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Network Switches
          </CardTitle>
          <CardDescription>Switch infrastructure and status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">Loading switches...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Network Switches
          </CardTitle>
          <CardDescription>Switch infrastructure and status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="text-destructive">{error}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const stats = getStats();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Network Switches
          </CardTitle>
          <CardDescription>
            {stats.total} switch{stats.total !== 1 ? 'es' : ''} • {stats.online} online • {stats.offline} offline
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <div className="text-sm font-medium">Online</div>
              </div>
              <div className="text-2xl font-bold">{stats.online}</div>
            </div>
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <div className="text-sm font-medium">Offline</div>
              </div>
              <div className="text-2xl font-bold">{stats.offline}</div>
            </div>
          </div>

          {/* Models Distribution */}
          {Object.keys(stats.models).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Switch Models</h4>
              <div className="space-y-1">
                {Object.entries(stats.models)
                  .sort((a, b) => b[1] - a[1])
                  .map(([model, count]) => (
                    <div key={model} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{model}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Switches List */}
          {switches.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Switches</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {switches.map(sw => {
                  const isOnline = sw.status === 'online' ||
                                  sw.connectionState === 'connected' ||
                                  sw.operationalState === 'up';
                  const model = sw.hardwareType || sw.platformName || sw.model || 'Unknown Model';

                  return (
                    <div
                      key={sw.serialNumber}
                      onClick={() => handleSwitchClick(sw)}
                      className="p-3 rounded-lg border bg-card hover:bg-accent cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {isOnline ? (
                              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                            )}
                            <span className="font-medium truncate">
                              {sw.displayName || sw.serialNumber}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            <div>Model: {model}</div>
                            {sw.ipAddress && <div>IP: {sw.ipAddress}</div>}
                            {sw.siteName && (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {sw.siteName}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {switches.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No switches found{siteId && siteId !== 'all' ? ' for this site' : ''}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Switch Details Slide-out */}
      <DetailSlideOut
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title={selectedSwitch?.displayName || selectedSwitch?.serialNumber || 'Switch Details'}
        description={`Serial: ${selectedSwitch?.serialNumber}`}
        width="xl"
      >
        {selectedSwitch && (
          <div className="space-y-6">
            {/* Status Badge */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Status</h3>
              <div className="flex items-center gap-2">
                {(selectedSwitch.status === 'online' ||
                  selectedSwitch.connectionState === 'connected' ||
                  selectedSwitch.operationalState === 'up') ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="font-medium text-green-500">Online</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    <span className="font-medium text-red-500">Offline</span>
                  </>
                )}
              </div>
            </div>

            {/* Basic Information */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Basic Information</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground">Display Name</div>
                  <div className="font-medium">{selectedSwitch.displayName || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Serial Number</div>
                  <div className="font-medium font-mono text-xs">{selectedSwitch.serialNumber}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Model</div>
                  <div className="font-medium">
                    {selectedSwitch.hardwareType || selectedSwitch.platformName || selectedSwitch.model || 'Unknown'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Firmware Version</div>
                  <div className="font-medium">{selectedSwitch.firmwareVersion || 'N/A'}</div>
                </div>
              </div>
            </div>

            {/* Network Information */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Network Information</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground">IP Address</div>
                  <div className="font-medium font-mono text-xs">{selectedSwitch.ipAddress || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">MAC Address</div>
                  <div className="font-medium font-mono text-xs">{selectedSwitch.macAddress || 'N/A'}</div>
                </div>
                {selectedSwitch.siteName && (
                  <div className="col-span-2">
                    <div className="text-muted-foreground">Site</div>
                    <div className="font-medium">{selectedSwitch.siteName}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Operational Information */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Operational Information</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Uptime
                  </div>
                  <div className="font-medium">{formatUptime(selectedSwitch.uptime)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Last Seen</div>
                  <div className="font-medium">{formatLastSeen(selectedSwitch.lastSeen)}</div>
                </div>
                {selectedSwitch.portCount !== undefined && (
                  <div>
                    <div className="text-muted-foreground">Port Count</div>
                    <div className="font-medium">{selectedSwitch.portCount}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Raw Data (for debugging) */}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Raw Switch Data (Debug)
              </summary>
              <pre className="mt-2 p-3 bg-muted rounded-lg overflow-auto max-h-96">
                {JSON.stringify(selectedSwitch, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </DetailSlideOut>
    </>
  );
}
