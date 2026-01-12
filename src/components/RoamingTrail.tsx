import React, { useMemo, useState } from 'react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import {
  MapPin,
  Radio,
  Clock,
  Wifi,
  Activity,
  Signal,
  X
} from 'lucide-react';
import { StationEvent } from '../services/api';

interface RoamingTrailProps {
  events: StationEvent[];
  macAddress: string;
  hostName?: string;
}

interface RoamingEvent {
  timestamp: number;
  eventType: string;
  apName: string;
  apSerial: string;
  ssid: string;
  details: string;
  cause?: string;
  reason?: string;
  signalStrength?: number;
  rssi?: number;
  status: 'good' | 'warning' | 'bad';
  code?: string;
  statusCode?: string;
  channel?: string;
  band?: string;
  radio?: string;
  frequency?: string; // 2.4GHz, 5GHz, or 6GHz
  ipAddress?: string;
  ipv6Address?: string;
  authMethod?: string;
  isBandSteering?: boolean; // True if roaming on same AP (different radio)
  bandSteeringFrom?: string; // Previous band for band steering
  bandSteeringTo?: string; // New band for band steering
}

type FilterType = 'time' | 'count';
type TimeFilter = '1h' | '24h' | '7d' | 'all';
type CountFilter = 10 | 20 | 50 | 100 | 'all';

export function RoamingTrail({ events, macAddress }: RoamingTrailProps) {
  const [selectedEvent, setSelectedEvent] = useState<RoamingEvent | null>(null);
  const [filterType, setFilterType] = useState<FilterType>('time');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('24h');
  const [countFilter, setCountFilter] = useState<CountFilter>(50);

  // Process and filter roaming events
  const roamingEvents = useMemo(() => {
    const roamingTypes = ['Roam', 'Registration', 'De-registration', 'Associate', 'Disassociate', 'State Change'];

    // Apply time or count filtering first
    let filteredByScope = events.filter(event => roamingTypes.includes(event.eventType));

    if (filterType === 'time' && timeFilter !== 'all') {
      const now = Date.now();
      const timeLimit =
        timeFilter === '1h' ? now - 3600000 :
        timeFilter === '24h' ? now - 86400000 :
        timeFilter === '7d' ? now - 604800000 :
        0;

      filteredByScope = filteredByScope.filter(event => parseInt(event.timestamp) >= timeLimit);
    } else if (filterType === 'count' && countFilter !== 'all') {
      // Sort by timestamp descending and take the most recent N events
      filteredByScope = filteredByScope
        .sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp))
        .slice(0, countFilter);
    }

    const filtered = filteredByScope
      .map(event => {
        const parseDetails = (details: string) => {
          const parsed: Record<string, string> = {};
          const regex = /(\w+)\[([^\]]+)\]/g;
          let match;
          while ((match = regex.exec(details)) !== null) {
            parsed[match[1]] = match[2];
          }
          return parsed;
        };

        const parsedDetails = event.details ? parseDetails(event.details) : {};

        // Parse RSSI/signal strength
        const rssiStr = parsedDetails.Signal || parsedDetails.RSS || parsedDetails.RSSI;
        const rssi = rssiStr ? parseInt(rssiStr) : undefined;

        // Parse channel and determine frequency
        const channel = parsedDetails.Channel;
        const radio = parsedDetails.Radio;
        let frequency = parsedDetails.Band;

        // Determine frequency from channel if not explicitly provided
        if (channel && !frequency) {
          const channelNum = parseInt(channel);
          if (channelNum >= 1 && channelNum <= 14) {
            frequency = '2.4GHz';
          } else if (channelNum >= 36 && channelNum <= 165) {
            frequency = '5GHz';
          } else if (channelNum >= 1 && channelNum <= 233) {
            // 6GHz uses UNII-5 through UNII-8 bands
            frequency = '6GHz';
          }
        }

        // Determine status based on RSSI and event type
        let status: 'good' | 'warning' | 'bad' = 'good';
        if (event.eventType === 'De-registration' || event.eventType === 'Disassociate') {
          status = 'bad';
        } else if (rssi) {
          if (rssi >= -60) status = 'good';
          else if (rssi >= -70) status = 'warning';
          else status = 'bad';
        }

        // Get SSID from event or parsed details
        const ssid = event.ssid || parsedDetails.SSID || parsedDetails.Ssid || 'N/A';

        return {
          timestamp: parseInt(event.timestamp),
          eventType: event.eventType,
          apName: event.apName || 'Unknown AP',
          apSerial: event.apSerial || 'N/A',
          ssid,
          details: event.details || '',
          cause: parsedDetails.Cause,
          reason: parsedDetails.Reason,
          code: parsedDetails.Code,
          statusCode: parsedDetails.Status,
          channel,
          band: parsedDetails.Band,
          radio,
          frequency,
          authMethod: parsedDetails.Auth || parsedDetails.AuthMethod,
          ipAddress: event.ipAddress,
          ipv6Address: event.ipv6Address,
          rssi,
          status
        } as RoamingEvent;
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    // Detect band steering (roaming on same AP but different radio/band)
    for (let i = 1; i < filtered.length; i++) {
      const prev = filtered[i - 1];
      const curr = filtered[i];

      // Check if same AP (by name or serial) but different frequency/radio
      const sameAP = (prev.apName === curr.apName || prev.apSerial === curr.apSerial);
      const differentFrequency = prev.frequency !== curr.frequency && prev.frequency && curr.frequency;
      const differentRadio = prev.radio !== curr.radio && prev.radio && curr.radio;
      const differentBand = prev.band !== curr.band && prev.band && curr.band;

      if (sameAP && (differentFrequency || differentRadio || differentBand)) {
        curr.isBandSteering = true;
        // Store from/to information for display - use frequency only
        curr.bandSteeringFrom = prev.frequency || prev.band || '';
        curr.bandSteeringTo = curr.frequency || curr.band || '';
      }
    }

    return filtered;
  }, [events, filterType, timeFilter, countFilter]);

  // Get unique APs and time range
  const { uniqueAPs, timeRange } = useMemo(() => {
    const apSet = new Set<string>();
    let minTime = Infinity;
    let maxTime = -Infinity;

    roamingEvents.forEach(event => {
      apSet.add(event.apName);
      minTime = Math.min(minTime, event.timestamp);
      maxTime = Math.max(maxTime, event.timestamp);
    });

    return {
      uniqueAPs: Array.from(apSet),
      timeRange: { min: minTime, max: maxTime }
    };
  }, [roamingEvents]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatTimeShort = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calculate position on timeline (0-100%)
  const getTimelinePosition = (timestamp: number) => {
    if (timeRange.max === timeRange.min) return 50;
    return ((timestamp - timeRange.min) / (timeRange.max - timeRange.min)) * 100;
  };

  // Get AP row index
  const getAPRow = (apName: string) => {
    return uniqueAPs.indexOf(apName);
  };

  if (roamingEvents.length === 0) {
    return (
      <div className="text-center py-12">
        <Radio className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground font-medium mb-2">No roaming events found</p>
        <p className="text-sm text-muted-foreground">
          This client hasn't roamed between access points yet
        </p>
      </div>
    );
  }

  const TIMELINE_HEIGHT = 120; // Height per AP row
  const CHART_HEIGHT = uniqueAPs.length * TIMELINE_HEIGHT + 120;

  return (
    <div className="flex flex-col h-full">
      {/* Header with legend */}
      <div className="p-6 border-b space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-semibold">Roaming Trail</h3>
            <p className="text-base text-muted-foreground mt-1">
              {formatTimeShort(timeRange.min)} - {formatTimeShort(timeRange.max)}
            </p>
          </div>

          {/* Filter Controls */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Filter by:</span>
              <div className="flex gap-1 bg-muted rounded-lg p-1">
                <button
                  onClick={() => setFilterType('time')}
                  className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                    filterType === 'time'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Time
                </button>
                <button
                  onClick={() => setFilterType('count')}
                  className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                    filterType === 'count'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Count
                </button>
              </div>
            </div>

            {/* Time Filter Options */}
            {filterType === 'time' && (
              <div className="flex gap-1 bg-muted rounded-lg p-1">
                {(['1h', '24h', '7d', 'all'] as TimeFilter[]).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setTimeFilter(filter)}
                    className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                      timeFilter === filter
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {filter === '1h' ? 'Last Hour' :
                     filter === '24h' ? 'Last 24h' :
                     filter === '7d' ? 'Last 7 Days' :
                     'All Time'}
                  </button>
                ))}
              </div>
            )}

            {/* Count Filter Options */}
            {filterType === 'count' && (
              <div className="flex gap-1 bg-muted rounded-lg p-1">
                {([10, 20, 50, 100, 'all'] as CountFilter[]).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setCountFilter(filter)}
                    className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                      countFilter === filter
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {filter === 'all' ? 'All' : `Last ${filter}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Signal Quality:</span>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm font-medium">Good</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="text-sm font-medium">Warning</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-sm font-medium">Bad</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Connection:</span>
            <div className="flex items-center gap-2">
              <svg width="24" height="3" viewBox="0 0 24 3">
                <line x1="0" y1="1.5" x2="24" y2="1.5" stroke="currentColor" strokeWidth="3" className="text-primary/40" />
              </svg>
              <span className="text-sm font-medium">AP Roam</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="24" height="3" viewBox="0 0 24 3">
                <line x1="0" y1="1.5" x2="24" y2="1.5" stroke="#3b82f6" strokeWidth="3" strokeDasharray="4,2" />
              </svg>
              <span className="text-sm font-medium">Band Steering</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Indicator:</span>
            <div className="flex items-center gap-2">
              <svg width="12" height="10" viewBox="0 0 12 10">
                <path d="M 1.5 0 L 10.5 0 L 6 8 Z" fill="#3b82f6" stroke="#ffffff" strokeWidth="1" />
              </svg>
              <span className="text-sm font-medium">Band Steering Event</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main timeline view */}
      <div className="flex-1 flex overflow-hidden">
        {/* AP Names sidebar */}
        <div className="w-80 border-r bg-muted/20 overflow-y-auto">
          <div className="sticky top-0 bg-muted/40 border-b p-4 font-semibold text-base">
            Associated APs
          </div>
          {uniqueAPs.map((ap, idx) => (
            <div
              key={ap}
              className="p-4 border-b flex items-center gap-3 hover:bg-accent/50 transition-colors"
              style={{ height: `${TIMELINE_HEIGHT}px` }}
            >
              <Radio className="h-6 w-6 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-base truncate">{ap}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {roamingEvents.filter(e => e.apName === ap).length} events
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Timeline chart */}
        <div
          className="flex-1 overflow-auto relative"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="relative min-w-full"
            style={{ height: `${CHART_HEIGHT}px`, minWidth: '1200px' }}
          >
            {/* Vertical time grid lines */}
            {[0, 25, 50, 75, 100].map(percent => (
              <div
                key={percent}
                className="absolute top-0 bottom-0 border-l-2 border-border/40"
                style={{ left: `${percent}%` }}
              >
                <div className="sticky top-0 text-sm font-medium text-muted-foreground p-2 bg-background/90">
                  {formatTimeShort(timeRange.min + (timeRange.max - timeRange.min) * (percent / 100))}
                </div>
              </div>
            ))}

            {/* Horizontal AP row lines */}
            {uniqueAPs.map((ap, idx) => (
              <div
                key={ap}
                className="absolute left-0 right-0 border-b border-border/30"
                style={{
                  top: `${idx * TIMELINE_HEIGHT + 60}px`,
                  height: `${TIMELINE_HEIGHT}px`
                }}
              />
            ))}

            {/* Connection lines between events */}
            {roamingEvents.map((event, idx) => {
              if (idx === roamingEvents.length - 1) return null;
              const nextEvent = roamingEvents[idx + 1];

              const x1 = getTimelinePosition(event.timestamp);
              const y1 = getAPRow(event.apName) * TIMELINE_HEIGHT + 90;
              const x2 = getTimelinePosition(nextEvent.timestamp);
              const y2 = getAPRow(nextEvent.apName) * TIMELINE_HEIGHT + 90;

              // Check if next event is band steering
              const isBandSteering = nextEvent.isBandSteering;

              return (
                <svg
                  key={`line-${idx}`}
                  className="absolute cursor-pointer z-5"
                  style={{
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEvent(nextEvent);
                  }}
                >
                  <line
                    x1={`${x1}%`}
                    y1={y1}
                    x2={`${x2}%`}
                    y2={y2}
                    stroke={isBandSteering ? '#3b82f6' : 'currentColor'}
                    strokeWidth="6"
                    strokeDasharray={isBandSteering ? '8,4' : 'none'}
                    className={isBandSteering ? '' : 'text-primary/40'}
                    style={{ cursor: 'pointer' }}
                  />
                </svg>
              );
            })}

            {/* Event dots */}
            {roamingEvents.map((event, idx) => {
              const x = getTimelinePosition(event.timestamp);
              const y = getAPRow(event.apName) * TIMELINE_HEIGHT + 90;

              const dotColor =
                event.status === 'good' ? 'bg-green-500' :
                event.status === 'warning' ? 'bg-orange-500' :
                'bg-red-500';

              return (
                <React.Fragment key={idx}>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEvent(event);
                    }}
                    className={`
                      absolute w-4 h-4 rounded-full border-2 border-background
                      hover:scale-125 transition-transform cursor-pointer z-10
                      overflow-hidden
                      ${dotColor}
                      ${selectedEvent === event ? 'ring-2 ring-primary ring-offset-1 scale-125' : ''}
                    `}
                    style={{
                      left: `${x}%`,
                      top: `${y}px`,
                      transform: 'translate(-50%, -50%)'
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        setSelectedEvent(event);
                      }
                    }}
                  />
                  {/* Band steering indicator */}
                  {event.isBandSteering && (
                    <div
                      className="absolute z-20 cursor-pointer"
                      style={{
                        left: `${x}%`,
                        top: `${y + 14}px`,
                        transform: 'translate(-50%, 0)'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEvent(event);
                      }}
                    >
                      <svg width="14" height="10" viewBox="0 0 14 10">
                        <path
                          d="M 7 0 L 13 9 L 1 9 Z"
                          fill="#3b82f6"
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                      </svg>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Event details sidebar */}
        {selectedEvent && (
          <div
            className="w-96 border-l bg-muted/20 p-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">Event Details</h4>
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Close event details"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{formatTime(selectedEvent.timestamp)}</p>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <Badge
                  variant={
                    selectedEvent.eventType === 'Registration' || selectedEvent.eventType === 'Associate' ? 'default' :
                    selectedEvent.eventType === 'De-registration' || selectedEvent.eventType === 'Disassociate' ? 'destructive' :
                    'secondary'
                  }
                >
                  {selectedEvent.eventType}
                </Badge>
                {selectedEvent.isBandSteering && (
                  <Badge className="bg-blue-500 text-white">
                    Band Steering
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="font-medium">Access Point</span>
                </div>
                <div className="ml-6 text-muted-foreground">{selectedEvent.apName}</div>
                <div className="ml-6 text-xs text-muted-foreground font-mono">{selectedEvent.apSerial}</div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Wifi className="h-4 w-4 text-primary" />
                  <span className="font-medium">SSID</span>
                </div>
                <div className="ml-6 text-muted-foreground">{selectedEvent.ssid}</div>
              </div>

              {/* Band Steering Information */}
              {selectedEvent.isBandSteering && (selectedEvent.bandSteeringFrom || selectedEvent.bandSteeringTo) && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-500 rounded">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-blue-500" />
                    <span className="font-semibold text-blue-700 dark:text-blue-300">Band Steering</span>
                  </div>
                  <div className="ml-6 space-y-1 text-sm">
                    {selectedEvent.bandSteeringFrom && (
                      <div>
                        <span className="text-muted-foreground">From: </span>
                        <span className="font-medium">{selectedEvent.bandSteeringFrom}</span>
                      </div>
                    )}
                    {selectedEvent.bandSteeringTo && (
                      <div>
                        <span className="text-muted-foreground">To: </span>
                        <span className="font-medium">{selectedEvent.bandSteeringTo}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedEvent.frequency && !selectedEvent.isBandSteering && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="h-4 w-4 text-primary" />
                    <span className="font-medium">Frequency</span>
                  </div>
                  <div className="ml-6 text-muted-foreground">
                    {selectedEvent.frequency}
                  </div>
                </div>
              )}

              {selectedEvent.rssi && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Signal className="h-4 w-4 text-primary" />
                    <span className="font-medium">Signal Strength</span>
                  </div>
                  <div className="ml-6 flex items-center gap-2">
                    <span className="text-muted-foreground">{selectedEvent.rssi} dBm</span>
                    <Badge variant={
                      selectedEvent.status === 'good' ? 'default' :
                      selectedEvent.status === 'warning' ? 'secondary' :
                      'destructive'
                    } className="text-xs">
                      {selectedEvent.status}
                    </Badge>
                  </div>
                </div>
              )}

              {(selectedEvent.channel || selectedEvent.band) && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="h-4 w-4 text-primary" />
                    <span className="font-medium">Channel/Band</span>
                  </div>
                  <div className="ml-6 text-muted-foreground">
                    {selectedEvent.channel && `Channel ${selectedEvent.channel}`}
                    {selectedEvent.channel && selectedEvent.band && ' - '}
                    {selectedEvent.band && `${selectedEvent.band}`}
                  </div>
                </div>
              )}

              {(selectedEvent.ipAddress || selectedEvent.ipv6Address) && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="font-medium">IP Address</span>
                  </div>
                  {selectedEvent.ipAddress && (
                    <div className="ml-6 text-muted-foreground font-mono text-xs">{selectedEvent.ipAddress}</div>
                  )}
                  {selectedEvent.ipv6Address && (
                    <div className="ml-6 text-muted-foreground font-mono text-xs">{selectedEvent.ipv6Address}</div>
                  )}
                </div>
              )}

              {selectedEvent.authMethod && (
                <div>
                  <span className="font-medium">Auth Method: </span>
                  <span className="text-muted-foreground">{selectedEvent.authMethod}</span>
                </div>
              )}

              {selectedEvent.cause && (
                <div>
                  <span className="font-medium">Cause: </span>
                  <span className="text-muted-foreground">{selectedEvent.cause}</span>
                </div>
              )}

              {selectedEvent.reason && (
                <div>
                  <span className="font-medium">Reason: </span>
                  <span className="text-muted-foreground">{selectedEvent.reason}</span>
                </div>
              )}

              {(selectedEvent.code || selectedEvent.statusCode) && (
                <div>
                  <span className="font-medium">
                    {selectedEvent.code ? 'Code: ' : 'Status Code: '}
                  </span>
                  <span className="text-muted-foreground font-mono">
                    {selectedEvent.code || selectedEvent.statusCode}
                  </span>
                </div>
              )}

              {selectedEvent.details && (
                <div>
                  <div className="font-medium mb-1">Raw Details</div>
                  <div className="ml-0 text-xs text-muted-foreground font-mono bg-background/50 p-2 rounded break-words">
                    {selectedEvent.details}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
