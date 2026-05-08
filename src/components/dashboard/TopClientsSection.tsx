import { memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Router,
  Signal,
  Upload,
  Wifi,
} from 'lucide-react';
import { formatBitsPerSecond } from '../../lib/units';
import { getShortVendor } from '../../services/oui-lookup';

export interface TopClient {
  name: string;
  mac: string;
  throughput: number;
  upload: number;
  download: number;
  network: string;
  ap: string;
  rssi: number;
  band: string;
  ipAddress: string;
  vendor?: string;
  vendorIcon?: string;
}

interface TopClientsSectionProps {
  topClients: TopClient[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  vendorLookupsInProgress: boolean;
  onClientClick: (client: TopClient) => void;
}

/**
 * TopClientsSection — bandwidth leaderboard with per-client breakdown
 * (vendor, RSSI, IP, AP, network, band, up/down split, traffic
 * distribution bar). Click on a client opens the parent's detail dialog.
 */
function TopClientsSectionImpl({
  topClients,
  collapsed,
  onToggleCollapse,
  vendorLookupsInProgress,
  onClientClick,
}: TopClientsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Top Clients by Throughput</CardTitle>
            <CardDescription>
              Real-time bandwidth usage and connection details
              {vendorLookupsInProgress && (
                <span className="ml-2 text-xs italic">• Loading device info...</span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {vendorLookupsInProgress && (
              <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
            )}
            <Button variant="ghost" size="sm" onClick={onToggleCollapse}>
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent>
          <div className="space-y-3">
            {topClients.map((client, idx) => {
              const downloadPct =
                client.throughput > 0 ? (client.download / client.throughput) * 100 : 0;
              const uploadPct =
                client.throughput > 0 ? (client.upload / client.throughput) * 100 : 0;
              return (
                <div
                  key={client.mac}
                  onClick={() => onClientClick(client)}
                  className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex-shrink-0">
                        #{idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{client.name}</span>
                          {client.vendor && (
                            <Badge variant="secondary" className="text-xs">
                              {getShortVendor(client.vendor)}
                            </Badge>
                          )}
                          {client.rssi && (
                            <Badge
                              variant={
                                client.rssi > -60
                                  ? 'default'
                                  : client.rssi > -70
                                    ? 'secondary'
                                    : 'outline'
                              }
                              className="text-xs"
                            >
                              <Signal className="h-3 w-3 mr-1" />
                              {client.rssi} dBm
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                          <span>{client.mac}</span>
                          {client.ipAddress !== 'N/A' && (
                            <>
                              <span>•</span>
                              <span>{client.ipAddress}</span>
                            </>
                          )}
                          {client.vendor && client.vendor !== 'Unknown Vendor' && (
                            <>
                              <span>•</span>
                              <span className="text-xs italic">{client.vendor}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-primary">
                        {formatBitsPerSecond(client.throughput)}
                      </div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                      <Upload className="h-4 w-4 text-[color:var(--status-info)]" />
                      <div>
                        <div className="text-xs text-muted-foreground">Upload</div>
                        <div className="text-sm font-medium">
                          {formatBitsPerSecond(client.upload)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                      <Download className="h-4 w-4 text-[color:var(--status-success)]" />
                      <div>
                        <div className="text-xs text-muted-foreground">Download</div>
                        <div className="text-sm font-medium">
                          {formatBitsPerSecond(client.download)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Wifi className="h-3.5 w-3.5" />
                      <span className="truncate">{client.network}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Router className="h-3.5 w-3.5" />
                      <span className="truncate">{client.ap}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Activity className="h-3.5 w-3.5" />
                      <span>{client.band}</span>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Traffic Distribution</span>
                      <span>
                        {Math.round(downloadPct)}% DL / {Math.round(uploadPct)}% UL
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                      <div
                        className="bg-green-500 transition-all"
                        style={{ width: `${downloadPct}%` }}
                      />
                      <div
                        className="bg-blue-500 transition-all"
                        style={{ width: `${uploadPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export const TopClientsSection = memo(TopClientsSectionImpl);
