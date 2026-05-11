/**
 * ClientDetailDialog — slide-out detail panel for a connected client.
 *
 * Two tabs:
 *  - Details: identity, connection, signal, throughput, session, radio,
 *    device info
 *  - Station Events: event timeline with type filter, fetched from
 *    apiService.fetchStationEvents
 */

import { memo, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Clock,
  Download,
  Network,
  RefreshCw,
  Router,
  Signal,
  Timer,
  Upload,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { DetailSlideOut } from '../DetailSlideOut';
import { formatBitsPerSecond, formatBytes as formatBytesUnit } from '../../lib/units';
import { apiService, type StationEvent } from '../../services/api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Station = any;

interface ClientDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedClient: Station | null;
}

const formatBytes = formatBytesUnit;
const formatBps = formatBitsPerSecond;

function formatTxRxRate(rate: number | undefined): string {
  if (rate === undefined || rate === null || rate === 0) return 'N/A';
  const bps = rate > 1000 ? rate : rate * 1000000;
  return formatBps(bps);
}

function ClientDetailDialogComponent({ isOpen, onClose, selectedClient }: ClientDetailDialogProps) {
  const [stationEvents, setStationEvents] = useState<StationEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');

  useEffect(() => {
    if (!isOpen || !selectedClient?.macAddress) return;
    setIsLoadingEvents(true);
    apiService
      .fetchStationEvents(selectedClient.macAddress)
      .then((events) => setStationEvents(events))
      .catch((err) => {
        console.error('[ClientDetailDialog] Failed to fetch station events:', err);
        setStationEvents([]);
      })
      .finally(() => setIsLoadingEvents(false));
  }, [isOpen, selectedClient?.macAddress]);

  const filteredEvents = useMemo(() => {
    if (eventTypeFilter === 'all') return stationEvents;
    return stationEvents.filter((e) => e.eventType === eventTypeFilter);
  }, [stationEvents, eventTypeFilter]);

  const eventTypes = useMemo(
    () => Array.from(new Set(stationEvents.map((e) => e.eventType).filter(Boolean))),
    [stationEvents]
  );

  return (
    <DetailSlideOut
      isOpen={isOpen}
      onClose={onClose}
      title="Client Details"
      description={`Detailed information for ${selectedClient?.hostName || selectedClient?.macAddress}`}
      width="xl"
    >
      {selectedClient && (
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="events">Station Events</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            {/* Basic Information */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">MAC Address</p>
                <p className="font-mono text-sm">{selectedClient.macAddress}</p>
              </div>
              {selectedClient.hostName && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Hostname</p>
                  <p className="text-sm">{selectedClient.hostName}</p>
                </div>
              )}
              {selectedClient.ipAddress && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">IP Address</p>
                  <p className="font-mono text-sm">{selectedClient.ipAddress}</p>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Authentication</p>
                <Badge variant={selectedClient.authenticated !== false ? 'default' : 'secondary'}>
                  {selectedClient.authenticated !== false ? 'Authenticated' : 'Not Authenticated'}
                </Badge>
              </div>
            </div>

            {/* Connection Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Connection Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  {(selectedClient.ssid || selectedClient.serviceName) && (
                    <div className="flex items-center gap-2">
                      <Network className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">SSID/Service</p>
                        <p className="text-sm">
                          {selectedClient.ssid || selectedClient.serviceName}
                        </p>
                      </div>
                    </div>
                  )}
                  {(selectedClient.apName || selectedClient.apSerialNumber) && (
                    <div className="flex items-center gap-2">
                      <Router className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Access Point</p>
                        <p className="text-sm">
                          {selectedClient.apName || selectedClient.apSerialNumber}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Signal Quality */}
            {(selectedClient.rssi !== undefined || selectedClient.snr !== undefined) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Signal Quality</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {selectedClient.rssi !== undefined && (
                      <div className="flex items-center gap-2">
                        <Signal
                          className={`h-4 w-4 ${
                            selectedClient.rssi >= -50
                              ? 'text-[color:var(--status-success)]'
                              : selectedClient.rssi >= -60
                                ? 'text-[color:var(--status-info)]'
                                : selectedClient.rssi >= -70
                                  ? 'text-[color:var(--status-warning)]'
                                  : 'text-[color:var(--status-error)]'
                          }`}
                        />
                        <div>
                          <p className="text-xs text-muted-foreground">RSSI</p>
                          <p className="text-sm font-medium">{selectedClient.rssi} dBm</p>
                        </div>
                      </div>
                    )}
                    {selectedClient.snr !== undefined && (
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">SNR</p>
                          <p className="text-sm font-medium">{selectedClient.snr} dB</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Throughput */}
            {(selectedClient.txRate !== undefined ||
              selectedClient.rxRate !== undefined ||
              selectedClient.txBytes !== undefined ||
              selectedClient.rxBytes !== undefined ||
              selectedClient.outBytes !== undefined ||
              selectedClient.inBytes !== undefined) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Throughput</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {(selectedClient.txRate !== undefined ||
                      selectedClient.txBytes !== undefined ||
                      selectedClient.outBytes !== undefined) && (
                      <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4 text-[color:var(--status-info)]" />
                        <div>
                          <p className="text-xs text-muted-foreground">Upload</p>
                          <p className="text-sm font-medium">
                            {selectedClient.txRate !== undefined
                              ? formatBps(selectedClient.txRate * 1000000)
                              : formatBytes(selectedClient.outBytes || selectedClient.txBytes || 0)}
                          </p>
                        </div>
                      </div>
                    )}
                    {(selectedClient.rxRate !== undefined ||
                      selectedClient.rxBytes !== undefined ||
                      selectedClient.inBytes !== undefined) && (
                      <div className="flex items-center gap-2">
                        <Download className="h-4 w-4 text-[color:var(--status-success)]" />
                        <div>
                          <p className="text-xs text-muted-foreground">Download</p>
                          <p className="text-sm font-medium">
                            {selectedClient.rxRate !== undefined
                              ? formatBps(selectedClient.rxRate * 1000000)
                              : formatBytes(selectedClient.inBytes || selectedClient.rxBytes || 0)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Session Info */}
            {(selectedClient.uptime !== undefined ||
              selectedClient.connectionTime !== undefined) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Session Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {selectedClient.uptime !== undefined && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Uptime</p>
                          <p className="text-sm font-medium">
                            {Math.floor(selectedClient.uptime / 3600)}h{' '}
                            {Math.floor((selectedClient.uptime % 3600) / 60)}m
                          </p>
                        </div>
                      </div>
                    )}
                    {selectedClient.connectionTime !== undefined && (
                      <div className="flex items-center gap-2">
                        <Timer className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Connected At</p>
                          <p className="text-sm font-medium">
                            {new Date(selectedClient.connectionTime).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Radio & Protocol Information */}
            {(selectedClient.protocol || selectedClient.channel || selectedClient.radioId) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Radio & Protocol</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {selectedClient.protocol && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Protocol</p>
                        <Badge variant="outline">{selectedClient.protocol}</Badge>
                      </div>
                    )}
                    {selectedClient.channel !== undefined && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Channel</p>
                        <p className="text-sm font-medium">Channel {selectedClient.channel}</p>
                      </div>
                    )}
                    {selectedClient.radioId !== undefined && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Radio Band</p>
                        <p className="text-sm font-medium">
                          {selectedClient.radioId === 1
                            ? '2.4 GHz'
                            : selectedClient.radioId === 2
                              ? '5 GHz'
                              : `Radio ${selectedClient.radioId}`}
                        </p>
                      </div>
                    )}
                    {selectedClient.transmittedRate !== undefined && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Tx Rate</p>
                        <p className="text-sm font-medium">
                          {formatTxRxRate(selectedClient.transmittedRate)}
                        </p>
                      </div>
                    )}
                    {selectedClient.receivedRate !== undefined && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Rx Rate</p>
                        <p className="text-sm font-medium">
                          {formatTxRxRate(selectedClient.receivedRate)}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Role & Device Information */}
            {(selectedClient.role || selectedClient.manufacturer || selectedClient.lastSeen) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Device Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {selectedClient.role && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Role</p>
                        <Badge variant="secondary">{selectedClient.role}</Badge>
                      </div>
                    )}
                    {selectedClient.manufacturer && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Manufacturer</p>
                        <p className="text-sm font-medium">{selectedClient.manufacturer}</p>
                      </div>
                    )}
                    {selectedClient.lastSeen !== undefined && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Last Seen</p>
                        <p className="text-sm font-medium">
                          {new Date(selectedClient.lastSeen).toLocaleString()}
                        </p>
                      </div>
                    )}
                    {selectedClient.accessPointName && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Access Point</p>
                        <p className="text-sm font-medium">{selectedClient.accessPointName}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="events" className="space-y-4">
            {isLoadingEvents ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground font-medium mb-2">
                  No station events available
                </p>
                <p className="text-sm text-muted-foreground mb-2">
                  Station {selectedClient?.macAddress}
                </p>
                <div className="text-xs text-muted-foreground max-w-md mx-auto space-y-1 mt-4">
                  <p>Station events may be unavailable if:</p>
                  <p>• Your controller doesn't support the station events API</p>
                  <p>• No events have been logged for this station in the last 30 days</p>
                  <p>• Audit logging is not enabled on your controller</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    if (selectedClient) {
                      setIsLoadingEvents(true);
                      apiService
                        .fetchStationEvents(selectedClient.macAddress)
                        .then((events) => setStationEvents(events))
                        .finally(() => setIsLoadingEvents(false));
                    }
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            ) : (
              <>
                {/* Event Type Filter */}
                <div className="flex items-center gap-2">
                  <Button
                    variant={eventTypeFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEventTypeFilter('all')}
                  >
                    All Events ({stationEvents.length})
                  </Button>
                  {eventTypes.map((type) => (
                    <Button
                      key={type}
                      variant={eventTypeFilter === type ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setEventTypeFilter(type)}
                    >
                      {type} ({stationEvents.filter((e) => e.eventType === type).length})
                    </Button>
                  ))}
                </div>

                {/* Event Timeline */}
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {filteredEvents.map((event, idx) => {
                      const eventDate = new Date(parseInt(event.timestamp));
                      const eventColor =
                        event.eventType === 'Roam'
                          ? 'blue'
                          : event.eventType === 'Associate'
                            ? 'green'
                            : event.eventType === 'Disassociate'
                              ? 'red'
                              : event.eventType === 'Authenticate'
                                ? 'purple'
                                : 'gray';

                      return (
                        <Card key={event.id || idx} className="relative pl-8">
                          <div
                            className={`absolute left-3 top-6 w-2 h-2 rounded-full bg-${eventColor}-500`}
                          />
                          {idx !== filteredEvents.length - 1 && (
                            <div className="absolute left-3.5 top-8 w-0.5 h-full bg-border" />
                          )}

                          <CardContent className="pt-4 pb-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge
                                    variant={
                                      event.eventType === 'Associate' ||
                                      event.eventType === 'Authenticate'
                                        ? 'default'
                                        : event.eventType === 'Disassociate'
                                          ? 'destructive'
                                          : 'secondary'
                                    }
                                  >
                                    {event.eventType}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {eventDate.toLocaleString()}
                                  </span>
                                </div>

                                {event.details && (
                                  <p className="text-sm text-foreground mb-2">{event.details}</p>
                                )}

                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                  {event.apName && (
                                    <div>
                                      <span className="text-muted-foreground">AP: </span>
                                      <span className="font-medium">{event.apName}</span>
                                    </div>
                                  )}
                                  {event.ssid && (
                                    <div>
                                      <span className="text-muted-foreground">SSID: </span>
                                      <span className="font-medium">{event.ssid}</span>
                                    </div>
                                  )}
                                  {event.ipAddress && (
                                    <div>
                                      <span className="text-muted-foreground">IP: </span>
                                      <span className="font-mono font-medium">
                                        {event.ipAddress}
                                      </span>
                                    </div>
                                  )}
                                  {event.level && (
                                    <div>
                                      <span className="text-muted-foreground">Level: </span>
                                      <span className="font-medium">{event.level}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </DetailSlideOut>
  );
}

export const ClientDetailDialog = memo(ClientDetailDialogComponent);
