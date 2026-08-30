/* eslint-disable @typescript-eslint/no-explicit-any */
// Campus Controller API responses are untyped JSON; any is pervasive throughout this component

/**
 * AP Insights Component
 *
 * Displays performance metrics charts for an Access Point
 * Shows throughput, power consumption, client count, channel utilization, etc.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Maximize2,
  RefreshCw,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import {
  apiService,
  APDetails,
  APInsightsReport,
  APInsightsStatistic,
} from '../services/api';
import { controllerDurationFor } from '../lib/timeRange';
import { COMPACT_TOOLTIP_STYLE } from '../lib/chartStyle';
import { useTimelineNavigation } from '../hooks/useTimelineNavigation';
import { useSelectedTimeRange } from '../hooks/useSelectedTimeRange';
import { useApInsightsData } from '../hooks/useApInsightsData';
import { TimeRangeSelector } from './TimeRangeSelector';
import { SelectedRangeLabel } from './SelectedRangeLabel';
import { TimelineControls } from './timeline';
import { PowerChart } from './insights/PowerChart';
import { PowerContextCard } from './insights/PowerContextCard';
import { CorrelationStrip, type CorrelationStripItem } from './insights/CorrelationStrip';
import { buildPowerContext, derivePowerLevers } from '../services/powerAnalysis';

interface APInsightsProps {
  serialNumber: string;
  apName: string;
  onOpenFullScreen?: () => void;
}

/**
 * The per-panel duration dropdown that used to live here is gone.
 *
 * It kept its own `useState('3H')` with its own vocabulary (3H/24H/7D/30D), so
 * opening an AP while the dashboard was showing "Yesterday" silently dropped you
 * back to the last three hours. The window now comes from the shared selection
 * in `useGlobalFilters`, the same one the Insights and Operational Insights
 * pages use, and resolution comes from `range.bucketMinutes`.
 *
 * `30D` is not offered by the shared selector: only seven days are retained, and
 * on XCC 10.18.1.0-011R the AP report widgets return HTTP 500 for anything wider
 * than `3H` anyway.
 */


// Format timestamp for chart
function formatTime(timestamp: number, duration: string): string {
  const date = new Date(timestamp);
  if (duration === '3H' || duration === '24H') {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Format value with unit
function formatValue(value: number, unit: string): string {
  if (unit === 'bps') {
    if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)} Gbps`;
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)} Mbps`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)} Kbps`;
    return `${value.toFixed(0)} bps`;
  }
  if (unit === 'dBm') return `${value.toFixed(0)} dBm`;
  if (unit === '%') return `${value.toFixed(0)}%`;
  // The controller reports AP power in mW. Treating it as W overstates draw by
  // 1000x — an AP5020 pulling 18.67 W rendered as "18670 W".
  if (unit === 'mW') return `${(value / 1000).toFixed(2)} W`;
  if (unit === 'W') return `${value.toFixed(2)} W`;
  return value.toFixed(1);
}

/**
 * Scale a raw statistic value to watts using the unit the controller declared.
 * Unknown units pass through rather than being guessed at.
 */
function scaleToWatts(value: number, unit: string | undefined): number {
  const normalized = (unit ?? '').trim().toLowerCase();
  if (normalized === 'mw') return value / 1000;
  if (normalized === 'kw') return value * 1000;
  return value;
}

// Find value at a specific timestamp (for locked display)
function getValueAtTimestamp(
  data: any[],
  timestamp: number,
  fields: string[]
): Record<string, number | null> {
  if (!data || data.length === 0 || timestamp === null) {
    return fields.reduce((acc, field) => ({ ...acc, [field]: null }), {});
  }

  // Find the data point closest to the timestamp
  let closest = data[0];
  let minDiff = Math.abs(data[0].timestamp - timestamp);

  for (const point of data) {
    const diff = Math.abs(point.timestamp - timestamp);
    if (diff < minDiff) {
      minDiff = diff;
      closest = point;
    }
  }

  // Return values for all requested fields
  return fields.reduce(
    (acc, field) => ({
      ...acc,
      [field]: closest[field] !== undefined ? closest[field] : null,
    }),
    {}
  );
}

// Transform report data for charts
function transformReportData(report: APInsightsReport | undefined, duration: string): any[] {
  if (!report || !report.statistics || report.statistics.length === 0) return [];

  const dataMap = new Map<number, any>();

  report.statistics.forEach((stat: APInsightsStatistic) => {
    if (!stat.values) return;
    stat.values.forEach((point) => {
      const ts = point.timestamp;
      if (!dataMap.has(ts)) {
        dataMap.set(ts, { timestamp: ts, time: formatTime(ts, duration) });
      }
      const entry = dataMap.get(ts);
      entry[stat.statName] = parseFloat(point.value) || 0;
    });
  });

  return Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// Check if chart data has actual values beyond just timestamp/time
function hasActualChartData(data: any[]): boolean {
  if (!data || data.length === 0) return false;

  // Check if any entry has non-null values beyond just timestamp/time
  // Note: 0 is a valid value (e.g. idle AP, zero clients) — only exclude null/undefined/NaN
  return data.some((entry) => {
    const keys = Object.keys(entry).filter((k) => k !== 'timestamp' && k !== 'time');
    return keys.some((k) => {
      const value = entry[k];
      return value !== null && value !== undefined && !isNaN(Number(value));
    });
  });
}

// Chart colors - standardized from centralized palette
import { CHART_COLORS as PALETTE_COLORS, TIMELINE_COLORS } from '../config/colorPalette';

const CHART_COLORS = {
  primary: 'var(--primary)',
  secondary: 'var(--muted-foreground)',
  ...PALETTE_COLORS.series,
  success: PALETTE_COLORS.success,
  warning: PALETTE_COLORS.warning,
  error: PALETTE_COLORS.error,
  // Local chart-slot names; values come from the EP1 ramp (slate is its blue, teal its cyan).
  blue: PALETTE_COLORS.slate,
  purple: PALETTE_COLORS.purple,
  cyan: PALETTE_COLORS.teal,
  orange: PALETTE_COLORS.series.available,
  pink: PALETTE_COLORS.pink,
};

export function APInsights({ serialNumber, apName: _apName, onOpenFullScreen }: APInsightsProps) {
  const [expanded, setExpanded] = useState(false);

  const {
    token: timeRangeToken,
    setToken: setTimeRangeToken,
    range,
    optionGroups,
    dayStatuses,
    retentionDays,
    neverCollected,
  } = useSelectedTimeRange();

  // Live windows come from the controller; a finished day comes from stored
  // ap_report history. Same response shape either way.
  // The compact card shows summary tiles only — no charts, so no formatter
  // granularity to derive here.
  const { insights, isLoading, unavailableReason } = useApInsightsData(serialNumber, range);

  // Calculate summary stats - only return valid data
  const stats = useMemo(() => {
    if (!insights) return null;

    const throughput = insights.throughputReport?.[0];
    const power = insights.apPowerConsumptionTimeseries?.[0];
    const clients = insights.countOfUniqueUsersReport?.[0];

    const avgThroughputValues = throughput?.statistics?.find((s) => s.statName === 'Total')?.values;
    const avgPowerValues = power?.statistics?.find(
      (s) => s.statName === 'Power Consumption'
    )?.values;
    const avgClientsValues = clients?.statistics?.find(
      (s) => s.statName === 'tntUniqueUsers'
    )?.values;

    const avgThroughput =
      avgThroughputValues && avgThroughputValues.length > 0
        ? avgThroughputValues.reduce((sum, v) => sum + (parseFloat(v.value) || 0), 0) /
          avgThroughputValues.length
        : null;

    const powerUnit = power?.statistics?.find((s) => s.statName === 'Power Consumption')?.unit;

    // Converted to watts here so the tile below never renders raw milliwatts.
    const avgPower =
      avgPowerValues && avgPowerValues.length > 0
        ? scaleToWatts(
            avgPowerValues.reduce((sum, v) => sum + (parseFloat(v.value) || 0), 0) /
              avgPowerValues.length,
            powerUnit
          )
        : null;

    const peakClients =
      avgClientsValues && avgClientsValues.length > 0
        ? Math.max(...avgClientsValues.map((v) => parseFloat(v.value) || 0))
        : null;

    // Check if we have any valid data (0 is a valid reading for idle APs)
    const hasValidData =
      (avgThroughput !== null && !isNaN(avgThroughput)) ||
      (avgPower !== null && !isNaN(avgPower)) ||
      (peakClients !== null && !isNaN(peakClients));

    if (!hasValidData) return null;

    return {
      avgThroughput,
      avgPower,
      peakClients,
    };
  }, [insights]);

  return (
    <Card
      className={
        onOpenFullScreen
          ? 'cursor-pointer border-primary/30 hover:border-primary hover:bg-accent/50 hover:shadow-md transition-all'
          : ''
      }
      onClick={onOpenFullScreen}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">AP Insights</span>
          </div>
          <div
            className="flex items-center gap-1.5 ml-auto mr-1"
            // The card is clickable to open full screen; the selector inside it
            // is not a way to trigger that.
            onClick={(e) => e.stopPropagation()}
          >
            <TimeRangeSelector
              value={timeRangeToken}
              onChange={setTimeRangeToken}
              optionGroups={optionGroups}
              dayStatuses={dayStatuses}
              retentionDays={retentionDays}
              neverCollected={neverCollected}
              triggerClassName="w-[150px] h-7 text-xs"
            />
            {onOpenFullScreen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFullScreen();
                }}
                className="h-7 w-7 p-0"
                title="Expand Full Screen"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="h-7 w-7 p-0"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-14">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading stats...</span>
              </div>
            </div>
          ) : stats ? (
            <div className="grid grid-cols-3 gap-3">
              {stats.avgThroughput !== null &&
                !isNaN(stats.avgThroughput) &&
                stats.avgThroughput > 0 && (
                  <div className="text-center">
                    <p className="text-xl font-semibold">
                      {formatValue(stats.avgThroughput, 'bps')}
                    </p>
                    <p className="text-xs text-muted-foreground">Avg Throughput</p>
                  </div>
                )}
              {stats.peakClients !== null && !isNaN(stats.peakClients) && stats.peakClients > 0 && (
                <div className="text-center">
                  <p className="text-xl font-semibold">{stats.peakClients}</p>
                  <p className="text-xs text-muted-foreground">Peak Clients</p>
                </div>
              )}
              {stats.avgPower !== null && !isNaN(stats.avgPower) && stats.avgPower > 0 && (
                <div className="text-center">
                  <p className="text-xl font-semibold">{stats.avgPower.toFixed(2)} W</p>
                  <p className="text-xs text-muted-foreground">Avg Power</p>
                </div>
              )}
            </div>
          ) : unavailableReason === 'no_stored_history' ? (
            // Distinguished from "click to view": there is nothing to open.
            <div className="py-3 text-center">
              <p className="text-xs text-muted-foreground">
                No stored access point history for {range.label.toLowerCase()}.
              </p>
            </div>
          ) : (
            <div className="text-center py-3">
              <p className="text-sm text-muted-foreground">Click to view detailed insights</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// Full-screen AP Insights component
interface APInsightsFullScreenProps {
  serialNumber: string;
  apName: string;
  onClose: () => void;
}

export function APInsightsFullScreen({ serialNumber, apName, onClose }: APInsightsFullScreenProps) {
  const [apDetails, setApDetails] = useState<APDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);

  const {
    token: timeRangeToken,
    setToken: setTimeRangeToken,
    range,
    optionGroups,
    dayStatuses,
    retentionDays,
    neverCollected,
    selectedCoverage,
  } = useSelectedTimeRange();

  const {
    insights,
    isLoading,
    servedFromHistory,
    unavailableReason,
    errorMessage,
    reload: handleRefresh,
  } = useApInsightsData(serialNumber, range);

  // The real failure text, not a generic one — it is what tells an operator
  // whether the controller 502'd or the token expired.
  const error = unavailableReason === 'error' ? errorMessage : null;
  // Chart formatters below switch label granularity on this.
  const duration = servedFromHistory ? '24H' : controllerDurationFor(range) ?? '24H';

  // Timeline navigation hook
  const timeline = useTimelineNavigation('ap-insights');

  // Helper function to format X-axis ticks
  const formatXAxisTick = (timestamp: number, duration: string): string => {
    const date = new Date(timestamp);
    if (duration === '3H' || duration === '24H') {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // AP configuration backs the power levers. Independent of the insights fetch:
  // a failure here degrades the levers column, it does not break the charts.
  useEffect(() => {
    let cancelled = false;

    const fetchDetails = async () => {
      try {
        setIsLoadingDetails(true);
        const details = await apiService.getAccessPointDetails(serialNumber);
        if (!cancelled) setApDetails(details);
      } catch (err) {
        console.error('Failed to load AP details for power levers:', err);
        if (!cancelled) setApDetails(null);
      } finally {
        if (!cancelled) setIsLoadingDetails(false);
      }
    };

    fetchDetails();

    return () => {
      cancelled = true;
    };
  }, [serialNumber]);

  // Soft reset timeline when duration changes (preserve lock state and current time)
  useEffect(() => {
    timeline.softReset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, timeline.softReset]);

  // Power context is computed from the raw response, not the transformed chart
  // rows, so null readings stay distinguishable from real zeroes.
  const powerContext = useMemo(
    () =>
      timeline.isLocked ? buildPowerContext(insights, timeline.currentTime) : null,
    [insights, timeline.isLocked, timeline.currentTime]
  );

  const powerLevers = useMemo(() => derivePowerLevers(apDetails), [apDetails]);

  // Transform data for each chart
  const throughputData = useMemo(() => {
    const report = insights?.throughputReport?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  // Power arrives in mW; the chart and every readout downstream work in watts.
  const powerData = useMemo(() => {
    const report = insights?.apPowerConsumptionTimeseries?.[0];
    const unit = report?.statistics?.find((s) => s.statName === 'Power Consumption')?.unit;
    return transformReportData(report, duration).map((row) =>
      typeof row['Power Consumption'] === 'number'
        ? { ...row, 'Power Consumption': scaleToWatts(row['Power Consumption'], unit) }
        : row
    );
  }, [insights, duration]);

  const clientData = useMemo(() => {
    const report = insights?.countOfUniqueUsersReport?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const rssData = useMemo(() => {
    const report = insights?.baseliningAPRss?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const channelUtil5Data = useMemo(() => {
    const report = insights?.channelUtilization5?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const channelUtil24Data = useMemo(() => {
    const report = insights?.channelUtilization2_4?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const noiseData = useMemo(() => {
    const report = insights?.noisePerRadio?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  // The strip readouts at the cursor time — one value per chart, so a spike on
  // any chart can be read against every other series without scrolling. Tracks
  // the hover cursor live; freezes when the timeline is locked.
  const correlationItems = useMemo((): CorrelationStripItem[] => {
    const t = timeline.currentTime;
    if (t === null) return [];

    const items: CorrelationStripItem[] = [];

    const throughput = getValueAtTimestamp(throughputData, t, ['Total']).Total;
    if (throughput !== null) {
      items.push({
        key: 'throughput',
        label: 'Throughput',
        value: formatValue(throughput, 'bps'),
        color: CHART_COLORS.blue,
      });
    }

    const powerW = getValueAtTimestamp(powerData, t, ['Power Consumption'])['Power Consumption'];
    if (powerW !== null) {
      items.push({
        key: 'power',
        label: 'Power',
        value: `${powerW.toFixed(2)} W`,
        color: CHART_COLORS.orange,
      });
    }

    const clients = getValueAtTimestamp(clientData, t, ['tntUniqueUsers']).tntUniqueUsers;
    if (clients !== null) {
      items.push({
        key: 'clients',
        label: 'Clients',
        value: clients.toFixed(0),
        color: CHART_COLORS.purple,
      });
    }

    const rss = getValueAtTimestamp(rssData, t, ['Rss']).Rss;
    if (rss !== null) {
      items.push({ key: 'rss', label: 'RSS', value: `${rss.toFixed(0)} dBm`, color: CHART_COLORS.cyan });
    }

    // Busy airtime = everything that is not "Available". Falls back to
    // 100 − Available when the report omits the busy components.
    const busyPercent = (row: Record<string, number | null>): number | null => {
      const parts = [row.ClientData, row.CoChannel, row.Interference].filter(
        (v): v is number => typeof v === 'number' && !Number.isNaN(v)
      );
      if (parts.length > 0) return parts.reduce((sum, v) => sum + v, 0);
      return typeof row.Available === 'number' ? Math.max(0, 100 - row.Available) : null;
    };
    const utilFields = ['Available', 'ClientData', 'CoChannel', 'Interference'];
    const busy5 = busyPercent(getValueAtTimestamp(channelUtil5Data, t, utilFields));
    if (busy5 !== null) {
      items.push({ key: 'util5', label: '5 GHz busy', value: `${busy5.toFixed(0)}%`, color: CHART_COLORS.warning });
    }
    const busy24 = busyPercent(getValueAtTimestamp(channelUtil24Data, t, utilFields));
    if (busy24 !== null) {
      items.push({ key: 'util24', label: '2.4 GHz busy', value: `${busy24.toFixed(0)}%`, color: CHART_COLORS.warning });
    }

    // Noise is negative dBm; the highest (least negative) radio is the worst.
    const noiseRow = getValueAtTimestamp(noiseData, t, ['R1', 'R2', 'R3']);
    const noiseValues = [noiseRow.R1, noiseRow.R2, noiseRow.R3].filter(
      (v): v is number => typeof v === 'number' && !Number.isNaN(v)
    );
    if (noiseValues.length > 0) {
      items.push({
        key: 'noise',
        label: 'Noise (worst)',
        value: `${Math.max(...noiseValues).toFixed(0)} dBm`,
        color: CHART_COLORS.pink,
      });
    }

    return items;
  }, [
    timeline.currentTime,
    throughputData,
    powerData,
    clientData,
    rssData,
    channelUtil5Data,
    channelUtil24Data,
    noiseData,
  ]);

  // Define all charts with their data - charts with data appear first, empty charts are hidden
  const chartConfigs = useMemo(() => {
    const configs = [
      {
        id: 'throughput',
        title: 'Throughput',
        data: throughputData,
        hasData: hasActualChartData(throughputData),
      },
      {
        id: 'power',
        title: 'Power Consumption',
        data: powerData,
        hasData: hasActualChartData(powerData),
      },
      {
        id: 'clients',
        title: 'Unique Client Count',
        data: clientData,
        hasData: hasActualChartData(clientData),
      },
      {
        id: 'rss',
        title: 'RSS (Signal Strength)',
        data: rssData,
        hasData: hasActualChartData(rssData),
      },
      {
        id: 'channelUtil5',
        title: 'Channel Utilization 5GHz',
        data: channelUtil5Data,
        hasData: hasActualChartData(channelUtil5Data),
      },
      {
        id: 'channelUtil24',
        title: 'Channel Utilization 2.4GHz',
        data: channelUtil24Data,
        hasData: hasActualChartData(channelUtil24Data),
      },
      {
        id: 'noise',
        title: 'Noise Per Channel',
        data: noiseData,
        hasData: hasActualChartData(noiseData),
      },
    ];

    // Sort: charts with data first, empty charts last (and will be hidden by renderChart)
    return configs.sort((a, b) => {
      if (a.hasData && !b.hasData) return -1;
      if (!a.hasData && b.hasData) return 1;
      return 0;
    });
  }, [
    throughputData,
    powerData,
    clientData,
    rssData,
    channelUtil5Data,
    channelUtil24Data,
    noiseData,
  ]);

  // Render individual chart based on id
  const renderChart = (config: { id: string; title: string; data: any[]; hasData: boolean }) => {
    // Don't render charts without data
    if (!config.hasData) {
      return null;
    }

    switch (config.id) {
      case 'throughput': {
        // Chart rows are keyed by the controller's statName casing.
        const lockedThroughputValues =
          timeline.isLocked && timeline.currentTime !== null
            ? getValueAtTimestamp(throughputData, timeline.currentTime, [
                'Total',
                'Upload',
                'Download',
              ])
            : null;
        return (
          <Card key={config.id} className="col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedThroughputValues && (
                  <div className="flex gap-3 text-xs">
                    {lockedThroughputValues.Total !== null && (
                      <Badge variant="secondary" className="font-mono">
                        <span className="text-blue-500 font-semibold mr-1">Total:</span>{' '}
                        {formatValue(lockedThroughputValues.Total, 'bps')}
                      </Badge>
                    )}
                    {lockedThroughputValues.Upload !== null && (
                      <Badge variant="secondary" className="font-mono">
                        <span className="text-cyan-500 font-semibold mr-1">Up:</span>{' '}
                        {formatValue(lockedThroughputValues.Upload, 'bps')}
                      </Badge>
                    )}
                    {lockedThroughputValues.Download !== null && (
                      <Badge variant="secondary" className="font-mono">
                        <span className="text-pink-500 font-semibold mr-1">Down:</span>{' '}
                        {formatValue(lockedThroughputValues.Download, 'bps')}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={throughputData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="ap-insights-charts"
                    onClick={(e: any) => {
                      // Click to toggle lock at current position
                      if (e && e.activePayload && e.activePayload[0]) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.toggleLock();
                      }
                    }}
                    onMouseDown={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && e.shiftKey) {
                        timeline.startTimeWindow(e.activePayload[0].payload.timestamp);
                      }
                    }}
                    onMouseMove={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && !timeline.isLocked) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.updateTimeWindow(timestamp);
                      }
                    }}
                    onMouseUp={() => timeline.endTimeWindow()}
                  >
                    <defs>
                      <linearGradient id="colorTotalFull" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(ts) => formatXAxisTick(ts, duration)}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatValue(v, 'bps')}
                      width={70}
                    />
                    <Tooltip
                      formatter={(value: any) => [formatValue(value, 'bps'), '']}
                      labelFormatter={() => ''}
                      contentStyle={COMPACT_TOOLTIP_STYLE}
                    />
                    <Legend />
                    {timeline.currentTime !== null && (
                      <ReferenceLine
                        x={timeline.currentTime}
                        stroke={timeline.isLocked ? TIMELINE_COLORS.cursorLocked : TIMELINE_COLORS.cursorUnlocked}
                        strokeWidth={timeline.isLocked ? 2 : 1.5}
                        strokeDasharray={timeline.isLocked ? TIMELINE_COLORS.cursorLockedDasharray : TIMELINE_COLORS.cursorUnlockedDasharray}
                      />
                    )}
                    {timeline.timeWindow.start !== null && timeline.timeWindow.end !== null && (
                      <ReferenceArea
                        x1={Math.min(timeline.timeWindow.start, timeline.timeWindow.end)}
                        x2={Math.max(timeline.timeWindow.start, timeline.timeWindow.end)}
                        fill="var(--primary)"
                        fillOpacity={0.15}
                        stroke="var(--primary)"
                        strokeOpacity={0.3}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="Total"
                      stroke={CHART_COLORS.blue}
                      fill="url(#colorTotalFull)"
                      name="Total"
                    />
                    <Area
                      type="monotone"
                      dataKey="Upload"
                      stroke={CHART_COLORS.cyan}
                      fill="transparent"
                      name="Upload"
                    />
                    <Area
                      type="monotone"
                      dataKey="Download"
                      stroke={CHART_COLORS.pink}
                      fill="transparent"
                      name="Download"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );
      }

      case 'power':
        return (
          <PowerChart
            key={config.id}
            title={config.title}
            data={powerData}
            timeline={timeline}
            formatXAxisTick={(ts) => formatXAxisTick(ts, duration)}
            lockedPowerW={powerContext?.powerW ?? null}
            tooltipStyle={COMPACT_TOOLTIP_STYLE}
          />
        );

      case 'clients': {
        const lockedClientsValues =
          timeline.isLocked && timeline.currentTime !== null
            ? getValueAtTimestamp(clientData, timeline.currentTime, ['tntUniqueUsers'])
            : null;
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedClientsValues && lockedClientsValues.tntUniqueUsers !== null && (
                  <Badge variant="secondary" className="font-mono">
                    <span className="text-violet-500 font-semibold mr-1">Clients:</span>{' '}
                    {lockedClientsValues.tntUniqueUsers.toFixed(0)}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={clientData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="ap-insights-charts"
                    onClick={(e: any) => {
                      // Click to toggle lock at current position
                      if (e && e.activePayload && e.activePayload[0]) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.toggleLock();
                      }
                    }}
                    onMouseDown={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && e.shiftKey) {
                        timeline.startTimeWindow(e.activePayload[0].payload.timestamp);
                      }
                    }}
                    onMouseMove={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && !timeline.isLocked) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.updateTimeWindow(timestamp);
                      }
                    }}
                    onMouseUp={() => timeline.endTimeWindow()}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(ts) => formatXAxisTick(ts, duration)}
                    />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip labelFormatter={() => ''} contentStyle={COMPACT_TOOLTIP_STYLE} />
                    <Legend />
                    {timeline.currentTime !== null && (
                      <ReferenceLine
                        x={timeline.currentTime}
                        stroke={timeline.isLocked ? TIMELINE_COLORS.cursorLocked : TIMELINE_COLORS.cursorUnlocked}
                        strokeWidth={timeline.isLocked ? 2 : 1.5}
                        strokeDasharray={timeline.isLocked ? TIMELINE_COLORS.cursorLockedDasharray : TIMELINE_COLORS.cursorUnlockedDasharray}
                      />
                    )}
                    {timeline.timeWindow.start !== null && timeline.timeWindow.end !== null && (
                      <ReferenceArea
                        x1={Math.min(timeline.timeWindow.start, timeline.timeWindow.end)}
                        x2={Math.max(timeline.timeWindow.start, timeline.timeWindow.end)}
                        fill="var(--primary)"
                        fillOpacity={0.15}
                        stroke="var(--primary)"
                        strokeOpacity={0.3}
                      />
                    )}
                    <Line
                      type="stepAfter"
                      dataKey="tntUniqueUsers"
                      stroke={CHART_COLORS.blue}
                      dot={false}
                      name="Unique Users"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );
      }

      case 'rss': {
        const lockedRssValues =
          timeline.isLocked && timeline.currentTime !== null
            ? getValueAtTimestamp(rssData, timeline.currentTime, ['Rss', 'Rss Upper', 'Rss Lower'])
            : null;
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedRssValues && (
                  <div className="flex gap-2 text-xs">
                    {lockedRssValues['Rss Upper'] !== null &&
                      lockedRssValues['Rss Upper'] !== undefined && (
                        <Badge variant="secondary" className="font-mono">
                          <span className="text-muted-foreground font-semibold mr-1">Upper:</span>{' '}
                          {lockedRssValues['Rss Upper'].toFixed(0)} dBm
                        </Badge>
                      )}
                    {lockedRssValues.Rss !== null && lockedRssValues.Rss !== undefined && (
                      <Badge variant="secondary" className="font-mono">
                        <span className="text-blue-500 font-semibold mr-1">RSS:</span>{' '}
                        {lockedRssValues.Rss.toFixed(0)} dBm
                      </Badge>
                    )}
                    {lockedRssValues['Rss Lower'] !== null &&
                      lockedRssValues['Rss Lower'] !== undefined && (
                        <Badge variant="secondary" className="font-mono">
                          <span className="text-muted-foreground font-semibold mr-1">Lower:</span>{' '}
                          {lockedRssValues['Rss Lower'].toFixed(0)} dBm
                        </Badge>
                      )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={rssData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="ap-insights-charts"
                    onClick={(e: any) => {
                      // Click to toggle lock at current position
                      if (e && e.activePayload && e.activePayload[0]) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.toggleLock();
                      }
                    }}
                    onMouseDown={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && e.shiftKey) {
                        timeline.startTimeWindow(e.activePayload[0].payload.timestamp);
                      }
                    }}
                    onMouseMove={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && !timeline.isLocked) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.updateTimeWindow(timestamp);
                      }
                    }}
                    onMouseUp={() => timeline.endTimeWindow()}
                  >
                    <defs>
                      <linearGradient id="colorRss" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.cyan} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={CHART_COLORS.cyan} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(ts) => formatXAxisTick(ts, duration)}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${v} dBm`}
                      width={60}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      formatter={(v: any) => [`${v.toFixed(0)} dBm`, '']}
                      labelFormatter={() => ''}
                      contentStyle={COMPACT_TOOLTIP_STYLE}
                    />
                    <Legend />
                    {timeline.currentTime !== null && (
                      <ReferenceLine
                        x={timeline.currentTime}
                        stroke={timeline.isLocked ? TIMELINE_COLORS.cursorLocked : TIMELINE_COLORS.cursorUnlocked}
                        strokeWidth={timeline.isLocked ? 2 : 1.5}
                        strokeDasharray={timeline.isLocked ? TIMELINE_COLORS.cursorLockedDasharray : TIMELINE_COLORS.cursorUnlockedDasharray}
                      />
                    )}
                    {timeline.timeWindow.start !== null && timeline.timeWindow.end !== null && (
                      <ReferenceArea
                        x1={Math.min(timeline.timeWindow.start, timeline.timeWindow.end)}
                        x2={Math.max(timeline.timeWindow.start, timeline.timeWindow.end)}
                        fill="var(--primary)"
                        fillOpacity={0.15}
                        stroke="var(--primary)"
                        strokeOpacity={0.3}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="Rss Upper"
                      stroke={CHART_COLORS.secondary}
                      fill="transparent"
                      strokeDasharray="3 3"
                      name="Upper"
                    />
                    <Area
                      type="monotone"
                      dataKey="Rss"
                      stroke={CHART_COLORS.blue}
                      fill="url(#colorRss)"
                      name="RSS"
                    />
                    <Area
                      type="monotone"
                      dataKey="Rss Lower"
                      stroke={CHART_COLORS.secondary}
                      fill="transparent"
                      strokeDasharray="3 3"
                      name="Lower"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );
      }

      case 'channelUtil5': {
        const lockedChannelUtil5Values =
          timeline.isLocked && timeline.currentTime !== null
            ? getValueAtTimestamp(channelUtil5Data, timeline.currentTime, [
                'Available',
                'ClientData',
                'CoChannel',
                'Interference',
              ])
            : null;
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedChannelUtil5Values && (
                  <div className="flex gap-2 text-xs flex-wrap">
                    {lockedChannelUtil5Values.Available !== null &&
                      lockedChannelUtil5Values.Available !== undefined && (
                        <Badge variant="secondary" className="font-mono">
                          <span className="text-amber-500 font-semibold mr-1">Avail:</span>{' '}
                          {lockedChannelUtil5Values.Available.toFixed(1)}%
                        </Badge>
                      )}
                    {lockedChannelUtil5Values.ClientData !== null &&
                      lockedChannelUtil5Values.ClientData !== undefined && (
                        <Badge variant="secondary" className="font-mono">
                          <span className="text-purple-500 font-semibold mr-1">Client:</span>{' '}
                          {lockedChannelUtil5Values.ClientData.toFixed(1)}%
                        </Badge>
                      )}
                    {lockedChannelUtil5Values.CoChannel !== null &&
                      lockedChannelUtil5Values.CoChannel !== undefined && (
                        <Badge variant="secondary" className="font-mono">
                          <span className="text-cyan-500 font-semibold mr-1">Co-Ch:</span>{' '}
                          {lockedChannelUtil5Values.CoChannel.toFixed(1)}%
                        </Badge>
                      )}
                    {lockedChannelUtil5Values.Interference !== null &&
                      lockedChannelUtil5Values.Interference !== undefined && (
                        <Badge variant="secondary" className="font-mono">
                          <span className="text-blue-500 font-semibold mr-1">Intrf:</span>{' '}
                          {lockedChannelUtil5Values.Interference.toFixed(1)}%
                        </Badge>
                      )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={channelUtil5Data}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="ap-insights-charts"
                    onClick={(e: any) => {
                      // Click to toggle lock at current position
                      if (e && e.activePayload && e.activePayload[0]) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.toggleLock();
                      }
                    }}
                    onMouseDown={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && e.shiftKey) {
                        timeline.startTimeWindow(e.activePayload[0].payload.timestamp);
                      }
                    }}
                    onMouseMove={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && !timeline.isLocked) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.updateTimeWindow(timestamp);
                      }
                    }}
                    onMouseUp={() => timeline.endTimeWindow()}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(ts) => formatXAxisTick(ts, duration)}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`}
                      width={40}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      formatter={(v: any) => [`${v.toFixed(1)}%`, '']}
                      labelFormatter={() => ''}
                      contentStyle={COMPACT_TOOLTIP_STYLE}
                    />
                    <Legend />
                    {timeline.currentTime !== null && (
                      <ReferenceLine
                        x={timeline.currentTime}
                        stroke={timeline.isLocked ? TIMELINE_COLORS.cursorLocked : TIMELINE_COLORS.cursorUnlocked}
                        strokeWidth={timeline.isLocked ? 2 : 1.5}
                        strokeDasharray={timeline.isLocked ? TIMELINE_COLORS.cursorLockedDasharray : TIMELINE_COLORS.cursorUnlockedDasharray}
                      />
                    )}
                    {timeline.timeWindow.start !== null && timeline.timeWindow.end !== null && (
                      <ReferenceArea
                        x1={Math.min(timeline.timeWindow.start, timeline.timeWindow.end)}
                        x2={Math.max(timeline.timeWindow.start, timeline.timeWindow.end)}
                        fill="var(--primary)"
                        fillOpacity={0.15}
                        stroke="var(--primary)"
                        strokeOpacity={0.3}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="Available"
                      stackId="1"
                      stroke={CHART_COLORS.warning}
                      fill={CHART_COLORS.warning}
                      fillOpacity={0.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="ClientData"
                      stackId="1"
                      stroke={CHART_COLORS.purple}
                      fill={CHART_COLORS.purple}
                      fillOpacity={0.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="CoChannel"
                      stackId="1"
                      stroke={CHART_COLORS.cyan}
                      fill={CHART_COLORS.cyan}
                      fillOpacity={0.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="Interference"
                      stackId="1"
                      stroke={CHART_COLORS.blue}
                      fill={CHART_COLORS.blue}
                      fillOpacity={0.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );
      }

      case 'channelUtil24': {
        const lockedChannelUtil24Values =
          timeline.isLocked && timeline.currentTime !== null
            ? getValueAtTimestamp(channelUtil24Data, timeline.currentTime, [
                'Available',
                'ClientData',
                'CoChannel',
                'Interference',
              ])
            : null;
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedChannelUtil24Values && (
                  <div className="flex gap-2 text-xs flex-wrap">
                    {lockedChannelUtil24Values.Available !== null &&
                      lockedChannelUtil24Values.Available !== undefined && (
                        <Badge variant="secondary" className="font-mono">
                          <span className="text-amber-500 font-semibold mr-1">Avail:</span>{' '}
                          {lockedChannelUtil24Values.Available.toFixed(1)}%
                        </Badge>
                      )}
                    {lockedChannelUtil24Values.ClientData !== null &&
                      lockedChannelUtil24Values.ClientData !== undefined && (
                        <Badge variant="secondary" className="font-mono">
                          <span className="text-purple-500 font-semibold mr-1">Client:</span>{' '}
                          {lockedChannelUtil24Values.ClientData.toFixed(1)}%
                        </Badge>
                      )}
                    {lockedChannelUtil24Values.CoChannel !== null &&
                      lockedChannelUtil24Values.CoChannel !== undefined && (
                        <Badge variant="secondary" className="font-mono">
                          <span className="text-cyan-500 font-semibold mr-1">Co-Ch:</span>{' '}
                          {lockedChannelUtil24Values.CoChannel.toFixed(1)}%
                        </Badge>
                      )}
                    {lockedChannelUtil24Values.Interference !== null &&
                      lockedChannelUtil24Values.Interference !== undefined && (
                        <Badge variant="secondary" className="font-mono">
                          <span className="text-blue-500 font-semibold mr-1">Intrf:</span>{' '}
                          {lockedChannelUtil24Values.Interference.toFixed(1)}%
                        </Badge>
                      )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={channelUtil24Data}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="ap-insights-charts"
                    onClick={(e: any) => {
                      // Click to toggle lock at current position
                      if (e && e.activePayload && e.activePayload[0]) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.toggleLock();
                      }
                    }}
                    onMouseDown={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && e.shiftKey) {
                        timeline.startTimeWindow(e.activePayload[0].payload.timestamp);
                      }
                    }}
                    onMouseMove={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && !timeline.isLocked) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.updateTimeWindow(timestamp);
                      }
                    }}
                    onMouseUp={() => timeline.endTimeWindow()}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(ts) => formatXAxisTick(ts, duration)}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`}
                      width={40}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      formatter={(v: any) => [`${v.toFixed(1)}%`, '']}
                      labelFormatter={() => ''}
                      contentStyle={COMPACT_TOOLTIP_STYLE}
                    />
                    <Legend />
                    {timeline.currentTime !== null && (
                      <ReferenceLine
                        x={timeline.currentTime}
                        stroke={timeline.isLocked ? TIMELINE_COLORS.cursorLocked : TIMELINE_COLORS.cursorUnlocked}
                        strokeWidth={timeline.isLocked ? 2 : 1.5}
                        strokeDasharray={timeline.isLocked ? TIMELINE_COLORS.cursorLockedDasharray : TIMELINE_COLORS.cursorUnlockedDasharray}
                      />
                    )}
                    {timeline.timeWindow.start !== null && timeline.timeWindow.end !== null && (
                      <ReferenceArea
                        x1={Math.min(timeline.timeWindow.start, timeline.timeWindow.end)}
                        x2={Math.max(timeline.timeWindow.start, timeline.timeWindow.end)}
                        fill="var(--primary)"
                        fillOpacity={0.15}
                        stroke="var(--primary)"
                        strokeOpacity={0.3}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="Available"
                      stackId="1"
                      stroke={CHART_COLORS.warning}
                      fill={CHART_COLORS.warning}
                      fillOpacity={0.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="ClientData"
                      stackId="1"
                      stroke={CHART_COLORS.purple}
                      fill={CHART_COLORS.purple}
                      fillOpacity={0.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="CoChannel"
                      stackId="1"
                      stroke={CHART_COLORS.cyan}
                      fill={CHART_COLORS.cyan}
                      fillOpacity={0.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="Interference"
                      stackId="1"
                      stroke={CHART_COLORS.blue}
                      fill={CHART_COLORS.blue}
                      fillOpacity={0.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );
      }

      case 'noise': {
        const lockedNoiseValues =
          timeline.isLocked && timeline.currentTime !== null
            ? getValueAtTimestamp(noiseData, timeline.currentTime, ['R1', 'R2', 'R3'])
            : null;
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedNoiseValues && (
                  <div className="flex gap-2 text-xs">
                    {lockedNoiseValues.R1 !== null && lockedNoiseValues.R1 !== undefined && (
                      <Badge variant="secondary" className="font-mono">
                        <span className="text-blue-500 font-semibold mr-1">R1:</span>{' '}
                        {lockedNoiseValues.R1.toFixed(0)} dBm
                      </Badge>
                    )}
                    {lockedNoiseValues.R2 !== null && lockedNoiseValues.R2 !== undefined && (
                      <Badge variant="secondary" className="font-mono">
                        <span className="text-cyan-500 font-semibold mr-1">R2:</span>{' '}
                        {lockedNoiseValues.R2.toFixed(0)} dBm
                      </Badge>
                    )}
                    {lockedNoiseValues.R3 !== null && lockedNoiseValues.R3 !== undefined && (
                      <Badge variant="secondary" className="font-mono">
                        <span className="text-pink-500 font-semibold mr-1">R3:</span>{' '}
                        {lockedNoiseValues.R3.toFixed(0)} dBm
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={noiseData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="ap-insights-charts"
                    onClick={(e: any) => {
                      // Click to toggle lock at current position
                      if (e && e.activePayload && e.activePayload[0]) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.toggleLock();
                      }
                    }}
                    onMouseDown={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && e.shiftKey) {
                        timeline.startTimeWindow(e.activePayload[0].payload.timestamp);
                      }
                    }}
                    onMouseMove={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && !timeline.isLocked) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.updateTimeWindow(timestamp);
                      }
                    }}
                    onMouseUp={() => timeline.endTimeWindow()}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(ts) => formatXAxisTick(ts, duration)}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} dBm`} width={60} />
                    <Tooltip
                      formatter={(v: any) => [`${v.toFixed(0)} dBm`, '']}
                      labelFormatter={() => ''}
                      contentStyle={COMPACT_TOOLTIP_STYLE}
                    />
                    <Legend />
                    {timeline.currentTime !== null && (
                      <ReferenceLine
                        x={timeline.currentTime}
                        stroke={timeline.isLocked ? TIMELINE_COLORS.cursorLocked : TIMELINE_COLORS.cursorUnlocked}
                        strokeWidth={timeline.isLocked ? 2 : 1.5}
                        strokeDasharray={timeline.isLocked ? TIMELINE_COLORS.cursorLockedDasharray : TIMELINE_COLORS.cursorUnlockedDasharray}
                      />
                    )}
                    {timeline.timeWindow.start !== null && timeline.timeWindow.end !== null && (
                      <ReferenceArea
                        x1={Math.min(timeline.timeWindow.start, timeline.timeWindow.end)}
                        x2={Math.max(timeline.timeWindow.start, timeline.timeWindow.end)}
                        fill="var(--primary)"
                        fillOpacity={0.15}
                        stroke="var(--primary)"
                        strokeOpacity={0.3}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="R1"
                      stroke={CHART_COLORS.blue}
                      dot={false}
                      name="R1"
                    />
                    <Line
                      type="monotone"
                      dataKey="R2"
                      stroke={CHART_COLORS.cyan}
                      dot={false}
                      name="R2"
                    />
                    <Line
                      type="monotone"
                      dataKey="R3"
                      stroke={CHART_COLORS.pink}
                      dot={false}
                      name="R3"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="border-b bg-background px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={onClose}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h2 className="text-lg font-semibold">AP Insights</h2>
              <p className="text-sm text-muted-foreground">
                {apName} ({serialNumber})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TimeRangeSelector
              value={timeRangeToken}
              onChange={setTimeRangeToken}
              optionGroups={optionGroups}
              dayStatuses={dayStatuses}
              retentionDays={retentionDays}
              neverCollected={neverCollected}
              triggerClassName="w-[180px] h-8 text-xs"
            />
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* The resolved dates, and where the figures came from. */}
        <div className="px-4 pb-2">
          <SelectedRangeLabel range={range} coverage={selectedCoverage} />
        </div>

        {/* Timeline Controls */}
        <TimelineControls
          currentTime={timeline.currentTime}
          isLocked={timeline.isLocked}
          hasTimeWindow={timeline.timeWindow.start !== null && timeline.timeWindow.end !== null}
          onToggleLock={timeline.toggleLock}
          onClearTimeWindow={timeline.clearTimeWindow}
          onCopyTimeline={() => {
            // Copy timeline FROM client-insights TO ap-insights
            timeline.syncFromScope('client-insights');
          }}
          sourceLabel="Client Insights"
        />

        {/* Cross-chart readout at the cursor time — pinned above the scroll
            area so a locked power spike can be read against clients,
            throughput, RSS, utilization and noise without scrolling. */}
        <CorrelationStrip
          timestamp={timeline.currentTime}
          isLocked={timeline.isLocked}
          items={correlationItems}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-6 space-y-6 pb-12">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading AP insights...</span>
                </div>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <AlertTriangle className="h-16 w-16 text-destructive/30 mb-4" />
                <h3 className="text-lg font-medium mb-2">Error Loading Insights</h3>
                <p className="text-sm text-muted-foreground max-w-md mb-4">
                  {error}
                </p>
                <Button onClick={handleRefresh} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </div>
            ) : chartConfigs.some((c) => c.hasData) ? (
              <>
                <PowerContextCard
                  context={powerContext}
                  levers={powerLevers}
                  isLoadingLevers={isLoadingDetails}
                />
                <div className="grid grid-cols-2 gap-6">
                  {chartConfigs.map((config) => renderChart(config))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <BarChart3 className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium mb-2">No Insights Data Available</h3>
                <p className="text-sm text-muted-foreground max-w-md mb-4">
                  {/* A past day and a live window fail for different reasons, and
                      "try a different duration" is useless advice for the first. */}
                  {servedFromHistory
                    ? `AURA stored no access point history for ${range.label.toLowerCase()} (${range.rangeLabel}). Collection may not have been running, or this AP may not have been reporting.`
                    : 'No performance data is available for this access point in the selected time period. Try a different range or check back later.'}
                </p>
                <Button onClick={handleRefresh} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
