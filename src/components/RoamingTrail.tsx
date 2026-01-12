import { useMemo, useState } from 'react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import {
  MapPin,
  Radio,
  Clock,
  Wifi,
  Activity,
  Signal
} from 'lucide-react';
import { StationEvent } from '../services/api';

interface RoamingTrailProps {
  events: StationEvent[];
  macAddress: string;
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
}

export function RoamingTrail({ events, macAddress }: RoamingTrailProps) {
  const [selectedEvent, setSelectedEvent] = useState<RoamingEvent | null>(null);

  // Process and filter roaming events
  const roamingEvents = useMemo(() => {
    const roamingTypes = ['Roam', 'Registration', 'De-registration', 'Associate', 'Disassociate', 'State Change'];
    const filtered = events
      .filter(event => roamingTypes.includes(event.eventType))
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

        // Determine status based on RSSI and event type
        let status: 'good' | 'warning' | 'bad' = 'good';
        if (event.eventType === 'De-registration' || event.eventType === 'Disassociate') {
          status = 'bad';
        } else if (rssi) {
          if (rssi >= -60) status = 'good';
          else if (rssi >= -70) status = 'warning';
          else status = 'bad';
        }

        return {
          timestamp: parseInt(event.timestamp),
          eventType: event.eventType,
          apName: event.apName || 'Unknown AP',
          apSerial: event.apSerial || 'N/A',
          ssid: event.ssid || 'N/A',
          details: event.details || '',
          cause: parsedDetails.Cause,
          reason: parsedDetails.Reason,
          rssi,
          status
        } as RoamingEvent;
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    return filtered;
  }, [events]);

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

  const TIMELINE_HEIGHT = 60; // Height per AP row
  const CHART_HEIGHT = uniqueAPs.length * TIMELINE_HEIGHT + 100;

  return (
    <div className="flex flex-col h-full">
      {/* Header with legend */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h3 className="text-lg font-semibold">Roaming Trail</h3>
          <p className="text-sm text-muted-foreground">
            {formatTimeShort(timeRange.min)} - {formatTimeShort(timeRange.max)}
          </p>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Good</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
            <span>Warning</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Bad</span>
          </div>
        </div>
      </div>

      {/* Main timeline view */}
      <div className="flex-1 flex overflow-hidden">
        {/* AP Names sidebar */}
        <div className="w-64 border-r bg-muted/20 overflow-y-auto">
          <div className="sticky top-0 bg-muted/40 border-b p-3 font-semibold text-sm">
            Associated APs
          </div>
          {uniqueAPs.map((ap, idx) => (
            <div
              key={ap}
              className="p-3 border-b flex items-center gap-2 hover:bg-accent/50 transition-colors"
              style={{ height: `${TIMELINE_HEIGHT}px` }}
            >
              <Radio className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{ap}</div>
                <div className="text-xs text-muted-foreground">
                  {roamingEvents.filter(e => e.apName === ap).length} events
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Timeline chart */}
        <div className="flex-1 overflow-auto relative">
          <div
            className="relative min-w-full"
            style={{ height: `${CHART_HEIGHT}px`, minWidth: '1200px' }}
          >
            {/* Vertical time grid lines */}
            {[0, 25, 50, 75, 100].map(percent => (
              <div
                key={percent}
                className="absolute top-0 bottom-0 border-l border-border/30"
                style={{ left: `${percent}%` }}
              >
                <div className="sticky top-0 text-xs text-muted-foreground p-1 bg-background/80">
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

              return (
                <svg
                  key={`line-${idx}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%'
                  }}
                >
                  <line
                    x1={`${x1}%`}
                    y1={y1}
                    x2={`${x2}%`}
                    y2={y2}
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-primary/40"
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
                <button
                  key={idx}
                  onClick={() => setSelectedEvent(event)}
                  className={`
                    absolute w-3 h-3 rounded-full border-2 border-background
                    hover:scale-150 transition-transform cursor-pointer z-10
                    ${dotColor}
                    ${selectedEvent === event ? 'ring-2 ring-primary ring-offset-2 scale-150' : ''}
                  `}
                  style={{
                    left: `${x}%`,
                    top: `${y}px`,
                    transform: 'translate(-50%, -50%)'
                  }}
                  title={`${event.eventType} - ${formatTime(event.timestamp)}`}
                />
              );
            })}
          </div>
        </div>

        {/* Event details sidebar */}
        {selectedEvent && (
          <div className="w-96 border-l bg-muted/20 p-4 overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h4 className="font-semibold">Event Details</h4>
                <p className="text-xs text-muted-foreground">{formatTime(selectedEvent.timestamp)}</p>
              </div>
              <Badge
                variant={
                  selectedEvent.eventType === 'Registration' || selectedEvent.eventType === 'Associate' ? 'default' :
                  selectedEvent.eventType === 'De-registration' || selectedEvent.eventType === 'Disassociate' ? 'destructive' :
                  'secondary'
                }
              >
                {selectedEvent.eventType}
              </Badge>
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

              {selectedEvent.rssi && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Signal className="h-4 w-4 text-primary" />
                    <span className="font-medium">Signal Strength</span>
                  </div>
                  <div className="ml-6 text-muted-foreground">{selectedEvent.rssi} dBm</div>
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

              {selectedEvent.details && (
                <div>
                  <div className="font-medium mb-1">Details</div>
                  <div className="ml-0 text-xs text-muted-foreground font-mono bg-background/50 p-2 rounded">
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
