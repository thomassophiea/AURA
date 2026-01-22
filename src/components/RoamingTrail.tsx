import React, { useMemo, useState } from 'react';
import { Badge } from './ui/badge';
import {
  MapPin,
  Radio,
  Clock,
  Wifi,
  Activity,
  Signal,
  X,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Timer,
  ArrowLeftRight,
  Info,
  ChevronDown,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen
} from 'lucide-react';
import { StationEvent } from '../services/api';
import { getReasonCodeInfo, isFailureReasonCode, ROAMING_ISSUES, ISSUE_DESCRIPTIONS, type RoamingIssue } from '../lib/wifi-codes';
import { formatCompactNumber } from '../lib/units';

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
  reasonCode?: number;
  channel?: string;
  band?: string;
  radio?: string;
  frequency?: string;
  ipAddress?: string;
  ipv6Address?: string;
  authMethod?: string;
  isBandSteering?: boolean;
  bandSteeringFrom?: string;
  bandSteeringTo?: string;
  previousApName?: string;
  previousFrequency?: string;
  previousRssi?: number;
  dwell?: number; // Time spent at previous AP in ms
  isFailedRoam?: boolean;
  isLateRoam?: boolean; // Roamed at very weak signal
}

interface RoamingStats {
  totalEvents: number;
  totalRoams: number;
  failedRoams: number;
  bandSteers: number;
  interbandRoams: number; // Same-AP band changes (especially bad)
  avgDwellTime: number;
  minDwellTime: number;
  maxDwellTime: number;
  roamsPerHour: number;
  signalQuality: { good: number; warning: number; bad: number };
  pingPongPairs: Array<{ ap1: string; ap2: string; count: number }>;
  issues: RoamingIssue[];
}

type FilterType = 'time' | 'count';
type TimeFilter = '1h' | '24h' | '7d' | 'all';
type CountFilter = 10 | 20 | 50 | 100 | 'all';

// Format duration in human readable format
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

// Derive band name from radio identifier
function getBandFromRadio(radio: string | undefined): string {
  if (!radio) return '';
  const radioLower = radio.toLowerCase();
  if (radioLower.includes('2g') || radioLower.includes('2.4') || radioLower === 'wifi0' || radioLower === 'radio0') {
    return '2.4GHz';
  } else if (radioLower.includes('5g') || radioLower.includes('5.') || radioLower === 'wifi1' || radioLower === 'radio1') {
    return '5GHz';
  } else if (radioLower.includes('6g') || radioLower.includes('6.') || radioLower === 'wifi2' || radioLower === 'radio2') {
    return '6GHz';
  }
  return radio; // Return original if can't determine
}

type AlertFilter = {
  type: 'issue' | 'pingpong' | 'none';
  issue?: RoamingIssue;
  apPair?: { ap1: string; ap2: string };
};

export function RoamingTrail({ events, macAddress }: RoamingTrailProps) {
  const [selectedEvent, setSelectedEvent] = useState<RoamingEvent | null>(null);
  const [filterType, setFilterType] = useState<FilterType>('time');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('24h');
  const [countFilter, setCountFilter] = useState<CountFilter>(50);
  const [showStats, setShowStats] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [alertFilter, setAlertFilter] = useState<AlertFilter>({ type: 'none' });

  // Process and filter roaming events
  const roamingEvents = useMemo(() => {
    const isRoamingEvent = (eventType: string) => {
      const type = (eventType || '').toLowerCase();
      return (
        type.includes('roam') ||
        type.includes('register') ||
        type.includes('associate') ||
        type.includes('state') ||
        type.includes('connect') ||
        type.includes('join') ||
        type.includes('leave') ||
        type.includes('handoff') ||
        type.includes('auth') ||
        type === 'roam' ||
        type === 'registration' ||
        type === 'de-registration' ||
        type === 'associate' ||
        type === 'disassociate' ||
        type === 'state change'
      );
    };

    let filteredByScope = events.filter(event => isRoamingEvent(event.eventType));

    if (filterType === 'time' && timeFilter !== 'all') {
      const now = Date.now();
      const timeLimit =
        timeFilter === '1h' ? now - 3600000 :
        timeFilter === '24h' ? now - 86400000 :
        timeFilter === '7d' ? now - 604800000 :
        0;
      filteredByScope = filteredByScope.filter(event => parseInt(event.timestamp) >= timeLimit);
    } else if (filterType === 'count' && countFilter !== 'all') {
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
        const rssi = rssiStr ? parseInt(rssiStr) : (event.rssi || undefined);

        // Parse reason code
        const reasonCodeStr = parsedDetails.Reason || parsedDetails.ReasonCode || parsedDetails.Code;
        const reasonCode = reasonCodeStr ? parseInt(reasonCodeStr) : (event.reasonCode || undefined);

        // Parse channel and determine frequency
        const channel = parsedDetails.Channel || (event.channel ? String(event.channel) : undefined);
        const radio = parsedDetails.Radio;
        let frequency = parsedDetails.Band || event.band;

        // Derive frequency from channel if not already set
        if (channel && !frequency) {
          const channelNum = parseInt(channel);
          if (channelNum >= 1 && channelNum <= 14) {
            frequency = '2.4GHz';
          } else if (channelNum >= 36 && channelNum <= 165) {
            frequency = '5GHz';
          } else if (channelNum >= 1 && channelNum <= 233) {
            frequency = '6GHz';
          }
        }

        // Derive frequency from radio field if still not set
        if (!frequency && radio) {
          const radioLower = radio.toLowerCase();
          if (radioLower.includes('2g') || radioLower.includes('2.4') || radioLower === 'wifi0' || radioLower === 'radio0') {
            frequency = '2.4GHz';
          } else if (radioLower.includes('5g') || radioLower.includes('5.') || radioLower === 'wifi1' || radioLower === 'radio1') {
            frequency = '5GHz';
          } else if (radioLower.includes('6g') || radioLower.includes('6.') || radioLower === 'wifi2' || radioLower === 'radio2') {
            frequency = '6GHz';
          }
        }

        // Determine if this is a failed roam based on event type and reason code
        const eventTypeLower = (event.eventType || '').toLowerCase();
        const isDisconnect = eventTypeLower.includes('disassoc') ||
                            eventTypeLower.includes('deauth') ||
                            eventTypeLower.includes('de-reg');
        const isFailedRoam = isDisconnect && isFailureReasonCode(reasonCode);

        // Determine status based on RSSI, event type, and failure
        let status: 'good' | 'warning' | 'bad' = 'good';
        if (isFailedRoam || event.eventType === 'De-registration' || event.eventType === 'Disassociate') {
          status = 'bad';
        } else if (rssi) {
          if (rssi >= -60) status = 'good';
          else if (rssi >= -70) status = 'warning';
          else status = 'bad';
        }

        // Late roam detection (roaming at very weak signal)
        const isLateRoam = rssi !== undefined && rssi < -75 && eventTypeLower.includes('roam');

        const ssid = event.ssid || parsedDetails.SSID || parsedDetails.Ssid || parsedDetails.Network || 'N/A';

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
          reasonCode,
          channel,
          band: parsedDetails.Band,
          radio,
          frequency,
          authMethod: parsedDetails.Auth || parsedDetails.AuthMethod || event.authMethod,
          ipAddress: event.ipAddress,
          ipv6Address: event.ipv6Address,
          rssi,
          status,
          isFailedRoam,
          isLateRoam
        } as RoamingEvent;
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    // Calculate dwell times, detect band steering, and capture previous context
    for (let i = 1; i < filtered.length; i++) {
      const prev = filtered[i - 1];
      const curr = filtered[i];

      // Calculate dwell time at previous AP
      curr.dwell = curr.timestamp - prev.timestamp;
      curr.previousApName = prev.apName;
      curr.previousFrequency = prev.frequency || prev.band || '';
      curr.previousRssi = prev.rssi;

      // Detect band steering (same AP, different frequency)
      const sameAP = (prev.apName === curr.apName || prev.apSerial === curr.apSerial);
      const differentFrequency = prev.frequency !== curr.frequency && prev.frequency && curr.frequency;
      const differentRadio = prev.radio !== curr.radio && prev.radio && curr.radio;
      const differentBand = prev.band !== curr.band && prev.band && curr.band;

      if (sameAP && (differentFrequency || differentRadio || differentBand)) {
        curr.isBandSteering = true;
        // Use frequency, band, or derive from radio - ensure we have readable band names
        curr.bandSteeringFrom = prev.frequency || prev.band || getBandFromRadio(prev.radio) || '2.4GHz';
        curr.bandSteeringTo = curr.frequency || curr.band || getBandFromRadio(curr.radio) || '5GHz';
      }
    }

    return filtered;
  }, [events, filterType, timeFilter, countFilter]);

  // Calculate roaming statistics
  const stats = useMemo((): RoamingStats => {
    const roamEvents = roamingEvents.filter(e =>
      e.eventType.toLowerCase().includes('roam') ||
      (e.previousApName && e.previousApName !== e.apName)
    );

    const failedRoams = roamingEvents.filter(e => e.isFailedRoam).length;
    const bandSteers = roamingEvents.filter(e => e.isBandSteering).length;
    const interbandRoams = bandSteers; // Same-AP band changes are interband roams

    // Calculate dwell times (exclude first event which has no dwell)
    const dwellTimes = roamingEvents.slice(1).map(e => e.dwell || 0).filter(d => d > 0);
    const avgDwellTime = dwellTimes.length > 0 ? dwellTimes.reduce((a, b) => a + b, 0) / dwellTimes.length : 0;
    const minDwellTime = dwellTimes.length > 0 ? Math.min(...dwellTimes) : 0;
    const maxDwellTime = dwellTimes.length > 0 ? Math.max(...dwellTimes) : 0;

    // Calculate roams per hour
    const timeSpan = roamingEvents.length > 1
      ? roamingEvents[roamingEvents.length - 1].timestamp - roamingEvents[0].timestamp
      : 0;
    const hoursSpan = timeSpan / 3600000;
    const roamsPerHour = hoursSpan > 0 ? roamEvents.length / hoursSpan : 0;

    // Signal quality distribution
    const signalQuality = {
      good: roamingEvents.filter(e => e.status === 'good').length,
      warning: roamingEvents.filter(e => e.status === 'warning').length,
      bad: roamingEvents.filter(e => e.status === 'bad').length
    };

    // Detect ping-pong patterns (roaming back and forth between same APs)
    const apPairs: Record<string, number> = {};
    for (let i = 1; i < roamingEvents.length; i++) {
      const prev = roamingEvents[i - 1];
      const curr = roamingEvents[i];
      if (prev.apName !== curr.apName) {
        const pairKey = [prev.apName, curr.apName].sort().join('|');
        apPairs[pairKey] = (apPairs[pairKey] || 0) + 1;
      }
    }

    const pingPongPairs = Object.entries(apPairs)
      .filter(([_, count]) => count >= 3) // At least 3 transitions between same pair
      .map(([pair, count]) => {
        const [ap1, ap2] = pair.split('|');
        return { ap1, ap2, count };
      })
      .sort((a, b) => b.count - a.count);

    // Detect issues
    const issues: RoamingIssue[] = [];

    // Ping-pong detection
    if (pingPongPairs.length > 0) {
      issues.push(ROAMING_ISSUES.PING_PONG);
    }

    // Late roam detection
    if (roamingEvents.some(e => e.isLateRoam)) {
      issues.push(ROAMING_ISSUES.LATE_ROAM);
    }

    // Auth failure detection
    if (failedRoams > 0) {
      issues.push(ROAMING_ISSUES.AUTH_FAILURE);
    }

    // Interband roaming detection (same-AP band changes - especially bad)
    if (interbandRoams > 0) {
      issues.push(ROAMING_ISSUES.INTERBAND_ROAM);
    }

    // Band bounce detection (frequent band changes)
    if (bandSteers >= 3) {
      issues.push(ROAMING_ISSUES.BAND_BOUNCE);
    }

    // Sticky client detection (very long dwell with poor signal)
    const stickyEvents = roamingEvents.filter(e =>
      e.dwell && e.dwell > 600000 && // More than 10 minutes
      e.previousRssi && e.previousRssi < -75 // Poor signal
    );
    if (stickyEvents.length > 0) {
      issues.push(ROAMING_ISSUES.STICKY_CLIENT);
    }

    return {
      totalEvents: roamingEvents.length,
      totalRoams: roamEvents.length,
      failedRoams,
      bandSteers,
      interbandRoams,
      avgDwellTime,
      minDwellTime,
      maxDwellTime,
      roamsPerHour,
      signalQuality,
      pingPongPairs,
      issues
    };
  }, [roamingEvents]);

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

  const getTimelinePosition = (timestamp: number) => {
    if (timeRange.max === timeRange.min) return 50;
    return ((timestamp - timeRange.min) / (timeRange.max - timeRange.min)) * 100;
  };

  const getAPRow = (apName: string) => {
    return uniqueAPs.indexOf(apName);
  };

  // Check if an event matches the current alert filter
  const isEventHighlighted = (event: RoamingEvent, idx: number): boolean => {
    if (alertFilter.type === 'none') return false;

    if (alertFilter.type === 'issue' && alertFilter.issue) {
      switch (alertFilter.issue) {
        case ROAMING_ISSUES.PING_PONG:
          // Highlight events involved in ping-pong (handled by apPair filter)
          return false;
        case ROAMING_ISSUES.LATE_ROAM:
          return event.isLateRoam === true;
        case ROAMING_ISSUES.AUTH_FAILURE:
          return event.isFailedRoam === true;
        case ROAMING_ISSUES.BAND_BOUNCE:
          return event.isBandSteering === true;
        case ROAMING_ISSUES.INTERBAND_ROAM:
          return event.isBandSteering === true;
        case ROAMING_ISSUES.STICKY_CLIENT:
          return (event.dwell && event.dwell > 600000 && event.previousRssi && event.previousRssi < -75) === true;
        default:
          return false;
      }
    }

    if (alertFilter.type === 'pingpong' && alertFilter.apPair) {
      const { ap1, ap2 } = alertFilter.apPair;
      // Highlight events that are part of the ping-pong pattern
      if (idx > 0) {
        const prevEvent = roamingEvents[idx - 1];
        const isPingPongTransition =
          (prevEvent.apName === ap1 && event.apName === ap2) ||
          (prevEvent.apName === ap2 && event.apName === ap1);
        if (isPingPongTransition) return true;
      }
      if (idx < roamingEvents.length - 1) {
        const nextEvent = roamingEvents[idx + 1];
        const isPingPongTransition =
          (event.apName === ap1 && nextEvent.apName === ap2) ||
          (event.apName === ap2 && nextEvent.apName === ap1);
        if (isPingPongTransition) return true;
      }
    }

    return false;
  };

  // Get highlighted events for the details panel
  const highlightedEvents = useMemo(() => {
    if (alertFilter.type === 'none') return [];
    return roamingEvents.filter((event, idx) => isEventHighlighted(event, idx));
  }, [alertFilter, roamingEvents]);

  // Toggle alert filter
  const toggleAlertFilter = (issue: RoamingIssue) => {
    if (alertFilter.type === 'issue' && alertFilter.issue === issue) {
      setAlertFilter({ type: 'none' });
    } else {
      setAlertFilter({ type: 'issue', issue });
      setSelectedEvent(null);
    }
  };

  const togglePingPongFilter = (ap1: string, ap2: string) => {
    if (alertFilter.type === 'pingpong' && alertFilter.apPair?.ap1 === ap1 && alertFilter.apPair?.ap2 === ap2) {
      setAlertFilter({ type: 'none' });
    } else {
      setAlertFilter({ type: 'pingpong', apPair: { ap1, ap2 } });
      setSelectedEvent(null);
    }
  };

  if (roamingEvents.length === 0) {
    return (
      <div className="text-center py-12">
        <Radio className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground font-medium mb-2">No roaming events found</p>
        <p className="text-sm text-muted-foreground mb-4">
          {events.length === 0
            ? 'No station events available for this client'
            : `Found ${events.length} total events, but none match roaming filters`}
        </p>
        {events.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <p className="mb-2">Event types found: {[...new Set(events.map(e => e.eventType))].join(', ') || 'None'}</p>
            <p>Try selecting "All Time" filter or check the browser console for details</p>
          </div>
        )}
      </div>
    );
  }

  // Calculate row height based on number of APs (will be applied via CSS)
  const AP_ROW_HEIGHT = Math.max(80, Math.min(120, 400 / uniqueAPs.length));

  return (
    <div className="flex flex-col h-full">
      {/* Compact Header */}
      <div className="px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Title and time range */}
          <div className="flex items-center gap-4 min-w-0">
            <h3 className="text-lg font-semibold whitespace-nowrap">Roaming Trail</h3>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatTimeShort(timeRange.min)} - {formatTimeShort(timeRange.max)}
            </span>
          </div>

          {/* Center: Quick stats (always visible) */}
          <div className="flex items-center gap-4 text-xs">
            <span><strong>{stats.totalEvents}</strong> events</span>
            <span><strong>{stats.totalRoams}</strong> roams</span>
            <span><strong>{stats.roamsPerHour.toFixed(1)}</strong>/hr</span>
            {stats.failedRoams > 0 && (
              <span className="text-red-500"><strong>{stats.failedRoams}</strong> failed</span>
            )}
            {stats.interbandRoams > 0 && (
              <span className="text-red-500"><strong>{stats.interbandRoams}</strong> interband</span>
            )}
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2">
            {/* Section toggles */}
            <div className="flex gap-1 bg-muted rounded p-0.5">
              <button
                onClick={() => setShowStats(!showStats)}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  showStats ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Toggle stats panel"
              >
                Stats
              </button>
              <button
                onClick={() => setShowAlerts(!showAlerts)}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  showAlerts ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Toggle alerts"
              >
                Alerts
              </button>
              <button
                onClick={() => setShowLegend(!showLegend)}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  showLegend ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Toggle legend"
              >
                Legend
              </button>
            </div>

            {/* Filter controls */}
            <div className="flex gap-1 bg-muted rounded p-0.5">
              {filterType === 'time' ? (
                <>
                  {(['1h', '24h', '7d', 'all'] as TimeFilter[]).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTimeFilter(filter)}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                        timeFilter === filter
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {filter === '1h' ? '1H' : filter === '24h' ? '24H' : filter === '7d' ? '7D' : 'All'}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  {([10, 50, 100, 'all'] as CountFilter[]).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setCountFilter(filter)}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                        countFilter === filter
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {filter === 'all' ? 'All' : filter}
                    </button>
                  ))}
                </>
              )}
              <button
                onClick={() => setFilterType(filterType === 'time' ? 'count' : 'time')}
                className="px-2 py-1 text-xs font-medium rounded text-muted-foreground hover:text-foreground transition-colors border-l border-border ml-1"
                title={`Switch to ${filterType === 'time' ? 'count' : 'time'} filter`}
              >
                {filterType === 'time' ? '#' : 'T'}
              </button>
            </div>

            {/* Details panel toggle */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className={`p-1.5 rounded transition-colors ${
                showDetails ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
              title={showDetails ? 'Hide details panel' : 'Show details panel'}
            >
              {showDetails ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Alerts Section */}
      {showAlerts && (stats.issues.length > 0 || stats.pingPongPairs.length > 0) && (
        <div className="px-4 py-2 border-b bg-muted/20 flex flex-wrap items-center gap-2">
          {alertFilter.type !== 'none' && (
            <button
              onClick={() => setAlertFilter({ type: 'none' })}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-muted hover:bg-muted/80 text-muted-foreground"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
          {stats.issues.map((issue) => {
            const info = ISSUE_DESCRIPTIONS[issue];
            const isSelected = alertFilter.type === 'issue' && alertFilter.issue === issue;
            const matchCount = roamingEvents.filter((e, i) => {
              if (issue === ROAMING_ISSUES.LATE_ROAM) return e.isLateRoam;
              if (issue === ROAMING_ISSUES.AUTH_FAILURE) return e.isFailedRoam;
              if (issue === ROAMING_ISSUES.BAND_BOUNCE) return e.isBandSteering;
              if (issue === ROAMING_ISSUES.INTERBAND_ROAM) return e.isBandSteering;
              if (issue === ROAMING_ISSUES.STICKY_CLIENT) return e.dwell && e.dwell > 600000 && e.previousRssi && e.previousRssi < -75;
              return false;
            }).length;
            return (
              <button
                key={issue}
                onClick={() => toggleAlertFilter(issue)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs border cursor-pointer transition-all ${
                  isSelected ? 'ring-2 ring-offset-1 ring-primary scale-105' : 'hover:scale-105'
                } ${
                  info.severity === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400' :
                  info.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400' :
                  'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400'
                }`}
              >
                {info.severity === 'error' ? <XCircle className="h-3 w-3" /> :
                 info.severity === 'warning' ? <AlertTriangle className="h-3 w-3" /> :
                 <Info className="h-3 w-3" />}
                <span className="font-medium">{info.title}</span>
                {matchCount > 0 && <span className="opacity-70">({matchCount})</span>}
              </button>
            );
          })}
          {stats.pingPongPairs.slice(0, 3).map((pair, idx) => {
            const isSelected = alertFilter.type === 'pingpong' &&
              alertFilter.apPair?.ap1 === pair.ap1 && alertFilter.apPair?.ap2 === pair.ap2;
            return (
              <button
                key={idx}
                onClick={() => togglePingPongFilter(pair.ap1, pair.ap2)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 cursor-pointer transition-all ${
                  isSelected ? 'ring-2 ring-offset-1 ring-primary scale-105' : 'hover:scale-105'
                }`}
              >
                <ArrowLeftRight className="h-3 w-3" />
                <span>{pair.ap1.split('-').pop()} ↔ {pair.ap2.split('-').pop()}: {pair.count}x</span>
              </button>
            );
          })}
          {alertFilter.type !== 'none' && highlightedEvents.length > 0 && (
            <span className="text-xs text-muted-foreground ml-2">
              {highlightedEvents.length} event{highlightedEvents.length !== 1 ? 's' : ''} highlighted
            </span>
          )}
        </div>
      )}

      {/* Collapsible Stats Panel */}
      {showStats && (
        <div className="px-4 py-2 border-b bg-muted/10">
          <div className="flex items-center gap-6">
            {/* Stats row */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <Timer className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Avg Dwell:</span>
                <span className="font-semibold">{formatDuration(stats.avgDwellTime)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Min:</span>
                <span className="font-medium">{formatDuration(stats.minDwellTime)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Max:</span>
                <span className="font-medium">{formatDuration(stats.maxDwellTime)}</span>
              </div>
            </div>

            {/* Signal Quality Bar */}
            <div className="flex-1 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Signal:</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden flex max-w-xs">
                {stats.signalQuality.good > 0 && (
                  <div className="h-full bg-green-500" style={{ width: `${(stats.signalQuality.good / stats.totalEvents) * 100}%` }} />
                )}
                {stats.signalQuality.warning > 0 && (
                  <div className="h-full bg-orange-500" style={{ width: `${(stats.signalQuality.warning / stats.totalEvents) * 100}%` }} />
                )}
                {stats.signalQuality.bad > 0 && (
                  <div className="h-full bg-red-500" style={{ width: `${(stats.signalQuality.bad / stats.totalEvents) * 100}%` }} />
                )}
              </div>
              <div className="flex gap-2 text-[10px]">
                <span className="flex items-center gap-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  {Math.round((stats.signalQuality.good / stats.totalEvents) * 100)}%
                </span>
                <span className="flex items-center gap-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                  {Math.round((stats.signalQuality.warning / stats.totalEvents) * 100)}%
                </span>
                <span className="flex items-center gap-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  {Math.round((stats.signalQuality.bad / stats.totalEvents) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Legend */}
      {showLegend && (
        <div className="px-4 py-1.5 border-b bg-muted/5 flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Signal:</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" />Good</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500" />Warning</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" />Bad</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Lines:</span>
            <span className="flex items-center gap-1">
              <svg width="16" height="2" viewBox="0 0 16 2"><line x1="0" y1="1" x2="16" y2="1" stroke="currentColor" strokeWidth="2" className="text-primary/40" /></svg>
              Roam
            </span>
            <span className="flex items-center gap-1">
              <svg width="16" height="2" viewBox="0 0 16 2"><line x1="0" y1="1" x2="16" y2="1" stroke="#ef4444" strokeWidth="2" strokeDasharray="3,2" /></svg>
              Interband
            </span>
          </div>
        </div>
      )}

      {/* Main timeline view */}
      <div className="flex-1 flex min-h-0">
        {/* AP Names sidebar */}
        <div className="w-60 border-r bg-muted/20 flex-shrink-0">
          <div className="bg-muted/40 border-b px-3 py-2 font-semibold text-xs" style={{ height: '40px', display: 'flex', alignItems: 'center' }}>
            Access Points ({uniqueAPs.length})
          </div>
          {uniqueAPs.map((ap) => {
            const apEvents = roamingEvents.filter(e => e.apName === ap);
            const apDwellTimes = apEvents.filter(e => e.dwell).map(e => e.dwell || 0);
            const totalDwell = apDwellTimes.reduce((a, b) => a + b, 0);

            return (
              <div
                key={ap}
                className="px-3 py-2 border-b flex items-center gap-2 hover:bg-accent/50 transition-colors"
                style={{ height: `${AP_ROW_HEIGHT}px` }}
              >
                <Radio className="h-4 w-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-xs truncate">{ap}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {apEvents.length} events
                  </div>
                  {totalDwell > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      Dwell: {formatDuration(totalDwell)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Timeline chart */}
        <div
          className="flex-1 relative"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="relative w-full h-full"
          >
            {/* Time grid lines */}
            {[0, 25, 50, 75].map(percent => (
              <div
                key={percent}
                className="absolute top-0 bottom-0 border-l border-border/40"
                style={{ left: `${percent}%` }}
              >
                <div className="text-[10px] text-muted-foreground px-1 py-2 whitespace-nowrap" style={{ height: '40px', display: 'flex', alignItems: 'center' }}>
                  {formatTimeShort(timeRange.min + (timeRange.max - timeRange.min) * (percent / 100))}
                </div>
              </div>
            ))}

            {/* AP row lines */}
            {uniqueAPs.map((ap, idx) => (
              <div
                key={ap}
                className="absolute left-0 right-0 border-b border-border/30"
                style={{
                  top: `${idx * AP_ROW_HEIGHT + 40}px`,
                  height: `${AP_ROW_HEIGHT}px`
                }}
              />
            ))}

            {/* Connection lines */}
            {roamingEvents.map((event, idx) => {
              if (idx === roamingEvents.length - 1) return null;
              const nextEvent = roamingEvents[idx + 1];

              const x1 = getTimelinePosition(event.timestamp);
              const y1 = getAPRow(event.apName) * AP_ROW_HEIGHT + 40 + AP_ROW_HEIGHT / 2;
              const x2 = getTimelinePosition(nextEvent.timestamp);
              const y2 = getAPRow(nextEvent.apName) * AP_ROW_HEIGHT + 40 + AP_ROW_HEIGHT / 2;

              const isBandSteering = nextEvent.isBandSteering;
              const isFailedConnection = nextEvent.isFailedRoam;

              return (
                <svg
                  key={`line-${idx}`}
                  className="absolute cursor-pointer"
                  style={{ left: 0, top: 0, width: '100%', height: '100%', zIndex: 5 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEvent(nextEvent);
                    setShowDetails(true);
                  }}
                >
                  <line
                    x1={`${x1}%`}
                    y1={y1}
                    x2={`${x2}%`}
                    y2={y2}
                    stroke={isFailedConnection ? '#ef4444' : isBandSteering ? '#ef4444' : 'currentColor'}
                    strokeWidth="2"
                    strokeDasharray={isBandSteering ? '6,3' : isFailedConnection ? '3,3' : 'none'}
                    className={!isBandSteering && !isFailedConnection ? 'text-primary/40' : ''}
                  />
                </svg>
              );
            })}

            {/* Event dots */}
            {roamingEvents.map((event, idx) => {
              const x = getTimelinePosition(event.timestamp);
              const y = getAPRow(event.apName) * AP_ROW_HEIGHT + 40 + AP_ROW_HEIGHT / 2;
              const isHighlighted = isEventHighlighted(event, idx);

              const dotColor = event.isFailedRoam ? 'bg-red-500 ring-2 ring-red-300' :
                event.isLateRoam ? 'bg-orange-500 ring-2 ring-orange-300' :
                event.status === 'good' ? 'bg-green-500' :
                event.status === 'warning' ? 'bg-orange-500' :
                'bg-red-500';

              // Dim non-highlighted events when a filter is active
              const dimmed = alertFilter.type !== 'none' && !isHighlighted;

              return (
                <React.Fragment key={idx}>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEvent(event);
                      setShowDetails(true);
                      setAlertFilter({ type: 'none' });
                    }}
                    className={`
                      absolute rounded-full border-2 border-background
                      hover:scale-125 transition-all cursor-pointer z-10
                      ${dotColor}
                      ${selectedEvent === event ? 'ring-2 ring-primary ring-offset-1 scale-125' : ''}
                      ${isHighlighted ? 'w-5 h-5 ring-2 ring-yellow-400 ring-offset-1 scale-110 z-20' : 'w-4 h-4'}
                      ${dimmed ? 'opacity-30' : ''}
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
                        setShowDetails(true);
                      }
                    }}
                  />
                  {/* Failed roam X marker */}
                  {event.isFailedRoam && (
                    <div
                      className="absolute z-20 pointer-events-none"
                      style={{
                        left: `${x}%`,
                        top: `${y}px`,
                        transform: 'translate(-50%, -50%)'
                      }}
                    >
                      <X className="h-3 w-3 text-white" />
                    </div>
                  )}
                  {/* Interband roaming indicator */}
                  {event.isBandSteering && (
                    <div
                      className="absolute z-20 cursor-pointer"
                      style={{
                        left: `${x}%`,
                        top: `${y + 10}px`,
                        transform: 'translate(-50%, 0)'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEvent(event);
                        setShowDetails(true);
                      }}
                    >
                      <svg width="12" height="8" viewBox="0 0 12 8">
                        <path d="M 6 0 L 11 7 L 1 7 Z" fill="#ef4444" stroke="#fff" strokeWidth="1" />
                      </svg>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Event details sidebar */}
        {showDetails && selectedEvent && (
          <div
            className="w-72 border-l bg-background p-3 flex-shrink-0 z-20 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-sm">Event Details</h4>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1 items-end justify-end">
                <Badge
                  variant={
                    selectedEvent.isFailedRoam ? 'destructive' :
                    selectedEvent.eventType === 'Registration' || selectedEvent.eventType === 'Associate' ? 'default' :
                    selectedEvent.eventType === 'De-registration' || selectedEvent.eventType === 'Disassociate' ? 'destructive' :
                    'secondary'
                  }
                >
                  {selectedEvent.eventType}
                </Badge>
                {selectedEvent.isFailedRoam && (
                  <Badge variant="destructive" className="text-xs">Failed</Badge>
                )}
                {selectedEvent.isLateRoam && (
                  <Badge variant="secondary" className="text-xs bg-orange-500/20 text-orange-700">Late Roam</Badge>
                )}
                {selectedEvent.isBandSteering && (
                  <Badge className="bg-red-500 text-white text-xs">Interband</Badge>
                )}
              </div>
            </div>

            <div className="space-y-3 text-sm">
              {/* Dwell time */}
              {selectedEvent.dwell && (
                <div className="p-2 bg-muted/50 rounded flex items-center gap-2">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Dwell at previous AP:</span>
                  <span className="font-medium">{formatDuration(selectedEvent.dwell)}</span>
                </div>
              )}

              {/* Reason code interpretation */}
              {selectedEvent.reasonCode && (() => {
                const info = getReasonCodeInfo(selectedEvent.reasonCode);
                if (!info) return null;
                return (
                  <div className={`p-3 rounded border-l-4 ${
                    info.severity === 'error' ? 'bg-red-500/10 border-red-500' :
                    info.severity === 'warning' ? 'bg-amber-500/10 border-amber-500' :
                    'bg-blue-500/10 border-blue-500'
                  }`}>
                    <div className="font-medium text-sm">Reason Code {selectedEvent.reasonCode}: {info.short}</div>
                    <div className="text-xs text-muted-foreground mt-1">{info.description}</div>
                  </div>
                );
              })()}

              {/* AP Info */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="font-medium">Access Point</span>
                </div>
                <div className="ml-6 text-muted-foreground">{selectedEvent.apName}</div>
                <div className="ml-6 text-xs text-muted-foreground font-mono">{selectedEvent.apSerial}</div>
                {selectedEvent.previousApName && selectedEvent.previousApName !== selectedEvent.apName && (
                  <div className="ml-6 text-xs text-muted-foreground mt-1">
                    From: {selectedEvent.previousApName}
                  </div>
                )}
              </div>

              {/* SSID */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Wifi className="h-4 w-4 text-primary" />
                  <span className="font-medium">SSID</span>
                </div>
                <div className="ml-6 text-muted-foreground">{selectedEvent.ssid}</div>
              </div>

              {/* Interband Roaming Info */}
              {selectedEvent.isBandSteering && (
                <div className="p-3 bg-red-50 dark:bg-red-950 border-l-4 border-red-500 rounded">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="font-semibold text-red-700 dark:text-red-300">Interband Roaming (Same AP)</span>
                  </div>
                  <div className="text-sm">
                    {selectedEvent.bandSteeringFrom} → {selectedEvent.bandSteeringTo}
                  </div>
                  <div className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                    Band change on the same AP indicates poor band steering configuration or interference issues.
                  </div>
                </div>
              )}

              {/* Signal */}
              {selectedEvent.rssi && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Signal className="h-4 w-4 text-primary" />
                    <span className="font-medium">Signal Strength</span>
                  </div>
                  <div className="ml-6 flex items-center gap-2">
                    <span className={`font-mono ${
                      selectedEvent.rssi >= -60 ? 'text-green-600' :
                      selectedEvent.rssi >= -70 ? 'text-orange-500' :
                      'text-red-500'
                    }`}>{selectedEvent.rssi} dBm</span>
                    {selectedEvent.previousRssi && (
                      <span className="text-xs text-muted-foreground">
                        (was {selectedEvent.previousRssi} dBm)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Channel/Band */}
              {(selectedEvent.channel || selectedEvent.frequency) && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="h-4 w-4 text-primary" />
                    <span className="font-medium">Channel/Band</span>
                  </div>
                  <div className="ml-6 text-muted-foreground">
                    {selectedEvent.channel && `Ch ${selectedEvent.channel}`}
                    {selectedEvent.channel && selectedEvent.frequency && ' • '}
                    {selectedEvent.frequency}
                  </div>
                </div>
              )}

              {/* Auth method */}
              {selectedEvent.authMethod && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Auth:</span>
                  <span className="font-medium">{selectedEvent.authMethod}</span>
                </div>
              )}

              {/* IP Address */}
              {(selectedEvent.ipAddress || selectedEvent.ipv6Address) && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="font-medium">IP Address</span>
                  </div>
                  {selectedEvent.ipAddress && (
                    <div className="ml-6 flex items-center gap-2">
                      <span className={`font-mono text-xs ${selectedEvent.ipAddress.startsWith('169.') ? 'text-amber-500' : 'text-muted-foreground'}`}>
                        {selectedEvent.ipAddress}
                      </span>
                      {selectedEvent.ipAddress.startsWith('169.') && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded font-medium">
                          Self-Assigned (DHCP Issue)
                        </span>
                      )}
                    </div>
                  )}
                  {selectedEvent.ipv6Address && (
                    <div className="ml-6 text-muted-foreground font-mono text-xs truncate">{selectedEvent.ipv6Address}</div>
                  )}
                </div>
              )}

              {/* Raw details */}
              {selectedEvent.details && (
                <div>
                  <div className="font-medium mb-1 text-xs text-muted-foreground">Raw Details</div>
                  <div className="text-xs text-muted-foreground font-mono bg-background/50 p-2 rounded break-words">
                    {selectedEvent.details}
                  </div>
                </div>
              )}

              {/* Alert Analysis */}
              {(selectedEvent.isFailedRoam || selectedEvent.isLateRoam || selectedEvent.isBandSteering ||
                (selectedEvent.dwell && selectedEvent.dwell > 600000 && selectedEvent.previousRssi && selectedEvent.previousRssi < -75)) && (
                <div className="border-t pt-3 mt-3">
                  <div className="font-medium mb-2 text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Alert Analysis
                  </div>
                  <div className="space-y-2">
                    {selectedEvent.isFailedRoam && (
                      <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs">
                        <div className="font-medium text-red-700 dark:text-red-400">Authentication Failure</div>
                        <div className="text-red-600/80 dark:text-red-400/80 mt-1">
                          Client failed to authenticate. Check RADIUS logs, verify credentials, and ensure PMK caching is working properly.
                        </div>
                      </div>
                    )}
                    {selectedEvent.isLateRoam && (
                      <div className="p-2 bg-orange-500/10 border border-orange-500/30 rounded text-xs">
                        <div className="font-medium text-orange-700 dark:text-orange-400">Late Roaming</div>
                        <div className="text-orange-600/80 dark:text-orange-400/80 mt-1">
                          Client roamed at {selectedEvent.rssi} dBm (below -75 dBm threshold). Consider adjusting client roaming aggressiveness or AP coverage overlap.
                        </div>
                      </div>
                    )}
                    {selectedEvent.isBandSteering && (
                      <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs">
                        <div className="font-medium text-red-700 dark:text-red-400">Interband Roaming (Same AP)</div>
                        <div className="text-red-600/80 dark:text-red-400/80 mt-1">
                          Client changed bands from {selectedEvent.bandSteeringFrom || selectedEvent.previousFrequency || 'unknown band'} to {selectedEvent.bandSteeringTo || selectedEvent.frequency || 'unknown band'} on <strong>{selectedEvent.apName}</strong>.
                        </div>
                        <div className="text-red-600/80 dark:text-red-400/80 mt-2 font-medium">
                          This is especially problematic because:
                        </div>
                        <ul className="text-red-600/80 dark:text-red-400/80 mt-1 ml-3 list-disc space-y-0.5">
                          <li>The client couldn't maintain connection on the preferred band</li>
                          <li>May indicate interference, poor signal, or band steering misconfiguration</li>
                          <li>If falling to 2.4GHz: likely 5GHz coverage/interference issues</li>
                          <li>Consider adjusting band steering thresholds or AP radio power</li>
                        </ul>
                      </div>
                    )}
                    {selectedEvent.dwell && selectedEvent.dwell > 600000 && selectedEvent.previousRssi && selectedEvent.previousRssi < -75 && (
                      <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs">
                        <div className="font-medium text-amber-700 dark:text-amber-400">Sticky Client Behavior</div>
                        <div className="text-amber-600/80 dark:text-amber-400/80 mt-1">
                          Client stayed at {selectedEvent.previousApName} for {formatDuration(selectedEvent.dwell)} with poor signal ({selectedEvent.previousRssi} dBm). Consider enabling 802.11v BSS Transition Management or adjusting minimum RSSI thresholds.
                        </div>
                      </div>
                    )}
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
