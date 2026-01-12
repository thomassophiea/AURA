import { useMemo } from 'react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import {
  MapPin,
  Radio,
  Clock,
  ArrowRight,
  Signal,
  Wifi,
  Activity
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
  signalStrength?: string;
  duration?: number; // Time spent at this AP in milliseconds
}

export function RoamingTrail({ events, macAddress }: RoamingTrailProps) {
  // Process and filter roaming events
  const roamingEvents = useMemo(() => {
    // Filter for roaming-related events
    const roamingTypes = ['Roam', 'Registration', 'De-registration', 'Associate', 'Disassociate', 'State Change'];
    const filtered = events
      .filter(event => roamingTypes.includes(event.eventType))
      .map(event => {
        // Parse details for additional info
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

        return {
          timestamp: parseInt(event.timestamp),
          eventType: event.eventType,
          apName: event.apName || 'Unknown AP',
          apSerial: event.apSerial || 'N/A',
          ssid: event.ssid || 'N/A',
          details: event.details || '',
          cause: parsedDetails.Cause,
          reason: parsedDetails.Reason,
          signalStrength: parsedDetails.Signal || parsedDetails.RSS,
          duration: 0
        } as RoamingEvent;
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    // Calculate duration at each AP
    for (let i = 0; i < filtered.length - 1; i++) {
      filtered[i].duration = filtered[i + 1].timestamp - filtered[i].timestamp;
    }

    return filtered;
  }, [events]);

  // Group consecutive events at the same AP
  const groupedEvents = useMemo(() => {
    const groups: Array<{
      apName: string;
      apSerial: string;
      ssid: string;
      events: RoamingEvent[];
      startTime: number;
      endTime: number;
      duration: number;
    }> = [];

    let currentGroup: RoamingEvent[] = [];
    let currentAP = '';

    roamingEvents.forEach((event, index) => {
      if (event.apName !== currentAP && currentGroup.length > 0) {
        // Save previous group
        const startTime = currentGroup[0].timestamp;
        const endTime = currentGroup[currentGroup.length - 1].timestamp;
        groups.push({
          apName: currentAP,
          apSerial: currentGroup[0].apSerial,
          ssid: currentGroup[0].ssid,
          events: currentGroup,
          startTime,
          endTime,
          duration: endTime - startTime
        });
        currentGroup = [];
      }

      currentAP = event.apName;
      currentGroup.push(event);

      // Push last group
      if (index === roamingEvents.length - 1 && currentGroup.length > 0) {
        const startTime = currentGroup[0].timestamp;
        const endTime = currentGroup[currentGroup.length - 1].timestamp;
        groups.push({
          apName: currentAP,
          apSerial: currentGroup[0].apSerial,
          ssid: currentGroup[0].ssid,
          events: currentGroup,
          startTime,
          endTime,
          duration: endTime - startTime
        });
      }
    });

    return groups;
  }, [roamingEvents]);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h ${Math.round((ms % 3600000) / 60000)}m`;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
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

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold">{groupedEvents.length}</div>
              <div className="text-sm text-muted-foreground">Access Points</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold">{roamingEvents.length}</div>
              <div className="text-sm text-muted-foreground">Total Events</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold">
                {roamingEvents.length > 1 ? roamingEvents.length - 1 : 0}
              </div>
              <div className="text-sm text-muted-foreground">Roams</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Roaming Timeline */}
      <ScrollArea className="h-[500px] pr-4">
        <div className="relative space-y-6">
          {/* Vertical timeline line */}
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-border" />

          {groupedEvents.map((group, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === groupedEvents.length - 1;
            const nextGroup = groupedEvents[idx + 1];

            return (
              <div key={idx} className="relative">
                {/* AP Node */}
                <div className="flex items-start gap-4">
                  {/* Timeline node */}
                  <div className="relative z-10 flex-shrink-0">
                    <div className={`
                      w-16 h-16 rounded-full border-4
                      ${isFirst ? 'bg-green-500 border-green-200' :
                        isLast ? 'bg-blue-500 border-blue-200' :
                        'bg-purple-500 border-purple-200'}
                      flex items-center justify-center shadow-lg
                    `}>
                      <Radio className="h-6 w-6 text-white" />
                    </div>
                    {isFirst && (
                      <Badge className="absolute -top-2 -right-2 bg-green-500" variant="default">
                        Start
                      </Badge>
                    )}
                    {isLast && (
                      <Badge className="absolute -bottom-2 -right-2 bg-blue-500" variant="default">
                        Current
                      </Badge>
                    )}
                  </div>

                  {/* AP Details Card */}
                  <Card className="flex-1">
                    <CardContent className="pt-4">
                      <div className="space-y-3">
                        {/* AP Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <MapPin className="h-4 w-4 text-primary" />
                              <h4 className="font-semibold text-lg">{group.apName}</h4>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Wifi className="h-3 w-3" />
                              <span>{group.ssid}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">
                              {formatDuration(group.duration)}
                            </div>
                            <div className="text-xs text-muted-foreground">Duration</div>
                          </div>
                        </div>

                        {/* Time Info */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">Arrived:</span>
                            <span className="font-medium">{formatTime(group.startTime)}</span>
                          </div>
                          {!isLast && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Left:</span>
                              <span className="font-medium">{formatTime(group.endTime)}</span>
                            </div>
                          )}
                        </div>

                        {/* Events at this AP */}
                        <div className="space-y-2 pt-2 border-t">
                          {group.events.map((event, eventIdx) => (
                            <div key={eventIdx} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={
                                    event.eventType === 'Registration' || event.eventType === 'Associate' ? 'default' :
                                    event.eventType === 'De-registration' || event.eventType === 'Disassociate' ? 'destructive' :
                                    'secondary'
                                  }
                                  className="text-xs"
                                >
                                  {event.eventType}
                                </Badge>
                                {event.cause && (
                                  <span className="text-muted-foreground">
                                    Cause: <span className="font-medium">{event.cause}</span>
                                  </span>
                                )}
                              </div>
                              <span className="text-muted-foreground">{formatTime(event.timestamp)}</span>
                            </div>
                          ))}
                        </div>

                        {/* AP Serial */}
                        <div className="text-xs text-muted-foreground pt-2 border-t">
                          Serial: <span className="font-mono">{group.apSerial}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Roaming Arrow to Next AP */}
                {!isLast && nextGroup && (
                  <div className="ml-8 my-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <ArrowRight className="h-4 w-4" />
                    <span className="font-medium">Roamed to {nextGroup.apName}</span>
                    <Activity className="h-3 w-3 ml-auto" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
