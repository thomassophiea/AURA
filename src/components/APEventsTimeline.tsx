/**
 * AP Events Timeline Component
 *
 * Full-screen timeline view of Access Point events
 * Similar to RoamingTrail but for AP-specific events
 */

import React, { useMemo, useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ScrollArea } from './ui/scroll-area';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Clock,
  Radio,
  Wifi,
  Power,
  Download,
  ChevronDown,
  ChevronRight,
  Filter,
  BarChart3,
  RefreshCw,
  Zap,
  Activity
} from 'lucide-react';
import { APAlarm, APAlarmCategory } from '../services/api';

interface APEventsTimelineProps {
  events: APAlarm[];
  categories: APAlarmCategory[];
  apName: string;
  serialNumber: string;
  onRefresh?: () => void;
  isLoading?: boolean;
}

// Format timestamp
function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

// Format relative time
function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return formatTimestamp(ts);
}

// Get icon for event category
function getEventIcon(category?: string, context?: string) {
  const cat = (category || '').toLowerCase();
  const ctx = (context || '').toLowerCase();

  if (cat.includes('channel') || ctx.includes('channel')) return Radio;
  if (cat.includes('discovery') || ctx.includes('connect')) return Wifi;
  if (cat.includes('reboot') || ctx.includes('power')) return Power;
  if (cat.includes('upgrade')) return Download;
  if (cat.includes('alarm')) return AlertTriangle;
  if (cat.includes('poll')) return Activity;
  return Info;
}

// Get color for severity level
function getSeverityColor(level?: string): string {
  const l = (level || '').toLowerCase();
  if (l === 'critical' || l === 'error') return 'text-red-500';
  if (l === 'major' || l === 'warning') return 'text-amber-500';
  if (l === 'minor') return 'text-blue-500';
  return 'text-muted-foreground';
}

function getSeverityBg(level?: string): string {
  const l = (level || '').toLowerCase();
  if (l === 'critical' || l === 'error') return 'bg-red-500/10 border-red-500/30';
  if (l === 'major' || l === 'warning') return 'bg-amber-500/10 border-amber-500/30';
  if (l === 'minor') return 'bg-blue-500/10 border-blue-500/30';
  return 'bg-muted/30 border-muted';
}

export function APEventsTimeline({
  events,
  categories,
  apName,
  serialNumber,
  onRefresh,
  isLoading
}: APEventsTimelineProps) {
  const [selectedEvent, setSelectedEvent] = useState<APAlarm | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [showStats, setShowStats] = useState(false);

  // Get unique categories and severity levels
  const uniqueCategories = useMemo(() => {
    const cats = new Set(events.map(e => e.Category));
    return ['all', ...Array.from(cats)];
  }, [events]);

  const uniqueSeverities = useMemo(() => {
    const sevs = new Set(events.map(e => e.Level).filter(Boolean));
    return ['all', ...Array.from(sevs)];
  }, [events]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      if (categoryFilter !== 'all' && event.Category !== categoryFilter) return false;
      if (severityFilter !== 'all' && event.Level !== severityFilter) return false;
      return true;
    });
  }, [events, categoryFilter, severityFilter]);

  // Calculate stats
  const stats = useMemo(() => {
    const bySeverity: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byContext: Record<string, number> = {};

    events.forEach(event => {
      const sev = event.Level || 'Unknown';
      const cat = event.Category || 'Unknown';
      const ctx = event.Context || 'Unknown';

      bySeverity[sev] = (bySeverity[sev] || 0) + 1;
      byCategory[cat] = (byCategory[cat] || 0) + 1;
      byContext[ctx] = (byContext[ctx] || 0) + 1;
    });

    return {
      total: events.length,
      bySeverity,
      byCategory,
      byContext,
      timeRange: events.length > 0 ? {
        oldest: Math.min(...events.map(e => e.ts)),
        newest: Math.max(...events.map(e => e.ts))
      } : null
    };
  }, [events]);

  return (
    <div className="h-full flex">
      {/* Main Timeline */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Filters Bar */}
        <div className="border-b bg-muted/30 px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px] h-8">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {uniqueCategories.map(cat => (
                  <SelectItem key={cat} value={cat}>
                    {cat === 'all' ? 'All Categories' : cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                {uniqueSeverities.map(sev => (
                  <SelectItem key={sev} value={sev}>
                    {sev === 'all' ? 'All Severities' : sev}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-xs">
              {filteredEvents.length} of {events.length} events
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowStats(!showStats)}
              className="h-8"
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              Stats
            </Button>
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading}
                className="h-8"
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            )}
          </div>
        </div>

        {/* Stats Panel */}
        {showStats && (
          <div className="border-b bg-muted/10 px-6 py-4">
            <div className="grid grid-cols-4 gap-4">
              {/* Total Events */}
              <Card className="border-0 shadow-none bg-transparent">
                <CardContent className="p-0">
                  <div className="text-3xl font-bold">{stats.total}</div>
                  <div className="text-xs text-muted-foreground">Total Events</div>
                </CardContent>
              </Card>

              {/* By Severity */}
              <Card className="border-0 shadow-none bg-transparent">
                <CardContent className="p-0">
                  <div className="flex items-center gap-3">
                    {Object.entries(stats.bySeverity).slice(0, 3).map(([sev, count]) => (
                      <div key={sev} className="text-center">
                        <div className={`text-xl font-bold ${getSeverityColor(sev)}`}>{count}</div>
                        <div className="text-[10px] text-muted-foreground">{sev}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">By Severity</div>
                </CardContent>
              </Card>

              {/* Top Categories */}
              <Card className="border-0 shadow-none bg-transparent">
                <CardContent className="p-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {Object.entries(stats.byCategory).slice(0, 3).map(([cat, count]) => (
                      <Badge key={cat} variant="secondary" className="text-xs">
                        {cat}: {count}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Top Categories</div>
                </CardContent>
              </Card>

              {/* Time Range */}
              <Card className="border-0 shadow-none bg-transparent">
                <CardContent className="p-0">
                  {stats.timeRange ? (
                    <>
                      <div className="text-sm font-medium">
                        {formatRelativeTime(stats.timeRange.newest)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        to {formatRelativeTime(stats.timeRange.oldest)}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">No events</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">Time Range</div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Timeline */}
        <ScrollArea className="flex-1">
          <div className="p-6">
            {filteredEvents.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium mb-2">No Events Found</h3>
                <p className="text-sm text-muted-foreground">
                  {events.length === 0
                    ? 'No events recorded for this access point'
                    : 'Try adjusting your filters'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredEvents.map((event, index) => {
                  const isSelected = selectedEvent?.ts === event.ts && selectedEvent?.Id === event.Id;

                  return (
                    <div
                      key={`${event.ts}-${event.Id}-${index}`}
                      className={`cursor-pointer transition-all ${
                        isSelected ? 'scale-[1.01]' : 'hover:translate-x-1'
                      }`}
                      onClick={() => setSelectedEvent(isSelected ? null : event)}
                    >
                      {/* Event card */}
                        <Card className={`transition-all ${isSelected ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={event.Level?.toLowerCase() === 'critical' ? 'destructive' : event.Level?.toLowerCase() === 'major' ? 'default' : 'secondary'}>
                                  {event.Level || 'Info'}
                                </Badge>
                                <Badge variant="outline">{event.Category}</Badge>
                                {event.Context && event.Context !== event.Category && (
                                  <Badge variant="outline" className="text-xs">{event.Context}</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {formatTimestamp(event.ts)}
                              </div>
                            </div>

                            <p className="text-sm">{event.log}</p>

                            {/* Expanded details */}
                            {isSelected && (
                              <div className="mt-4 pt-4 border-t space-y-2">
                                <div className="grid grid-cols-2 gap-4 text-xs">
                                  <div>
                                    <span className="text-muted-foreground">Event ID:</span>
                                    <span className="ml-2 font-mono">{event.Id}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">AP Serial:</span>
                                    <span className="ml-2 font-mono">{event.ApSerial}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">AP Name:</span>
                                    <span className="ml-2">{event.ApName}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Position:</span>
                                    <span className="ml-2">{event.pos}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Details Sidebar - shown when event is selected */}
      {selectedEvent && (
        <div className="w-80 border-l bg-muted/10 flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Event Details</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(null)} aria-label="Close event details">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Badge variant={selectedEvent.Level?.toLowerCase() === 'critical' ? 'destructive' : 'secondary'} className="text-xs">
              {selectedEvent.Level}
            </Badge>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">Time</h4>
                <p className="text-sm">{formatTimestamp(selectedEvent.ts)}</p>
                <p className="text-xs text-muted-foreground">{formatRelativeTime(selectedEvent.ts)}</p>
              </div>

              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">Category</h4>
                <p className="text-sm">{selectedEvent.Category}</p>
              </div>

              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">Context</h4>
                <p className="text-sm">{selectedEvent.Context}</p>
              </div>

              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">Access Point</h4>
                <p className="text-sm">{selectedEvent.ApName}</p>
                <p className="text-xs font-mono text-muted-foreground">{selectedEvent.ApSerial}</p>
              </div>

              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">Event ID</h4>
                <p className="text-sm font-mono">{selectedEvent.Id}</p>
              </div>

              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">Message</h4>
                <p className="text-sm bg-muted/50 p-3 rounded-lg">{selectedEvent.log}</p>
              </div>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
