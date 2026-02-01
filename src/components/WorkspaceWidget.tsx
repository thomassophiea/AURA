import React, { useState, useMemo } from 'react';
import {
  RefreshCw,
  Trash2,
  GripVertical,
  Maximize2,
  Minimize2,
  Loader2,
  Copy,
  Link2,
  Unlink2,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardAction } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { cn } from './ui/utils';
import type { WorkspaceWidget as WorkspaceWidgetType } from '@/hooks/useWorkspace';
import { TOPIC_METADATA, WIDGET_CATALOG } from '@/hooks/useWorkspace';

interface WorkspaceWidgetProps {
  widget: WorkspaceWidgetType;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleLinking: (id: string) => void;
  onTimeBrush?: (timeWindow: { start: number; end: number }) => void;
}

export const WorkspaceWidget: React.FC<WorkspaceWidgetProps> = ({
  widget,
  onRefresh,
  onDelete,
  onDuplicate,
  onToggleLinking,
  onTimeBrush,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const topicMeta = TOPIC_METADATA[widget.topic];
  const catalogItem = useMemo(
    () => WIDGET_CATALOG.find(item => item.id === widget.catalogId),
    [widget.catalogId]
  );

  return (
    <Card
      className={cn(
        'relative transition-all duration-200',
        isExpanded ? 'col-span-2 row-span-2' : '',
        'hover:shadow-lg hover:shadow-black/5',
        'group'
      )}
    >
      {/* Drag Handle */}
      <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 pl-4">
            <Badge
              variant="outline"
              className={cn(
                'mb-2 text-xs',
                topicMeta.color.bg,
                topicMeta.color.text,
                topicMeta.color.border
              )}
            >
              {topicMeta.label}
            </Badge>
            <CardTitle className="text-sm font-medium line-clamp-2">
              {widget.title}
            </CardTitle>
          </div>
          <CardAction>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onToggleLinking(widget.id)}
                title={widget.linkingEnabled ? 'Disable linking' : 'Enable linking'}
              >
                {widget.linkingEnabled ? (
                  <Link2 className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Unlink2 className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onRefresh(widget.id)}
                disabled={widget.isLoading}
                title="Refresh"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', widget.isLoading && 'animate-spin')} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onDuplicate(widget.id)}
                title="Duplicate"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Minimize' : 'Maximize'}
              >
                {isExpanded ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                onClick={() => onDelete(widget.id)}
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardAction>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        {widget.isLoading ? (
          <LoadingState />
        ) : widget.error ? (
          <ErrorState error={widget.error} onRetry={() => onRefresh(widget.id)} />
        ) : widget.data ? (
          <WidgetContent widget={widget} catalogItem={catalogItem} isExpanded={isExpanded} />
        ) : (
          <EmptyState />
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Loading state component
 */
const LoadingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
    <Loader2 className="h-8 w-8 animate-spin mb-2" />
    <span className="text-sm">Loading data...</span>
  </div>
);

/**
 * Error state component
 */
const ErrorState: React.FC<{ error: string; onRetry: () => void }> = ({ error, onRetry }) => (
  <div className="flex flex-col items-center justify-center py-8 text-destructive">
    <AlertCircle className="h-8 w-8 mb-2" />
    <span className="text-sm text-center mb-3">{error}</span>
    <Button variant="outline" size="sm" onClick={onRetry}>
      Try Again
    </Button>
  </div>
);

/**
 * Empty state component
 */
const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
    <span className="text-sm">No data available</span>
  </div>
);

/**
 * Widget content based on type
 */
const WidgetContent: React.FC<{
  widget: WorkspaceWidgetType;
  catalogItem: any;
  isExpanded: boolean;
}> = ({ widget, catalogItem, isExpanded }) => {
  const { type, data } = widget;

  switch (type) {
    case 'kpi_tile_group':
      return <KPITileContent data={data} />;

    case 'topn_table':
      return <TableContent data={data} columns={catalogItem?.columns} isExpanded={isExpanded} />;

    case 'timeseries_with_brush':
    case 'timeseries_multi_metric':
      return <TimeseriesContent data={data} />;

    case 'timeline_feed':
      return <TimelineFeedContent data={data} isExpanded={isExpanded} />;

    default:
      return <GenericContent data={data} />;
  }
};

/**
 * KPI Tile content for client experience overview
 */
const KPITileContent: React.FC<{ data: any }> = ({ data }) => {
  const score = data?.score ?? 0;
  const components = data?.score_components || {};

  const getScoreColor = (value: number) => {
    if (value >= 90) return 'text-green-500';
    if (value >= 75) return 'text-blue-500';
    if (value >= 60) return 'text-amber-500';
    return 'text-red-500';
  };

  const getScoreBg = (value: number) => {
    if (value >= 90) return 'bg-green-500/10';
    if (value >= 75) return 'bg-blue-500/10';
    if (value >= 60) return 'bg-amber-500/10';
    return 'bg-red-500/10';
  };

  return (
    <div className="space-y-4">
      {/* Main Score */}
      <div className={cn('text-center py-4 rounded-lg', getScoreBg(score))}>
        <span className={cn('text-4xl font-bold', getScoreColor(score))}>{score}</span>
        <p className="text-sm text-muted-foreground mt-1">RFQI Score</p>
      </div>

      {/* Component Breakdown */}
      {Object.keys(components).length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(components).slice(0, 6).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between p-2 bg-muted/50 rounded text-xs">
              <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
              <span className="font-medium">{typeof value === 'number' ? value.toFixed(1) : String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Get experience state styling
 */
const getExperienceStyle = (state: string): string => {
  switch (state?.toLowerCase()) {
    case 'excellent':
      return 'text-green-500';
    case 'good':
      return 'text-blue-500';
    case 'fair':
      return 'text-amber-500';
    case 'poor':
      return 'text-red-500';
    default:
      return 'text-muted-foreground';
  }
};

/**
 * Table content for TopN widgets
 * Implements ClientIdentityDisplayPolicy for human-readable display
 */
const TableContent: React.FC<{ data: any[]; columns?: string[]; isExpanded: boolean }> = ({
  data,
  columns,
  isExpanded,
}) => {
  if (!Array.isArray(data) || data.length === 0) {
    return <EmptyState />;
  }

  // Determine columns to display
  const displayColumns = columns || Object.keys(data[0]).slice(0, 6);
  const visibleColumns = isExpanded ? displayColumns : displayColumns.slice(0, 4);
  const displayData = isExpanded ? data.slice(0, 20) : data.slice(0, 5);

  const formatValue = (value: any, column: string): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') {
      if (column.includes('percent') || column.includes('_percent')) {
        return `${value.toFixed(1)}%`;
      }
      if (column.includes('bps') || column.includes('throughput')) {
        if (value >= 1e9) return `${(value / 1e9).toFixed(1)} Gbps`;
        if (value >= 1e6) return `${(value / 1e6).toFixed(1)} Mbps`;
        if (value >= 1e3) return `${(value / 1e3).toFixed(1)} Kbps`;
        return `${value} bps`;
      }
      if (column.includes('dbm') || column.includes('rssi') || column.includes('noise')) {
        return `${value} dBm`;
      }
      if (column.includes('db') || column.includes('snr')) {
        return `${value} dB`;
      }
      if (column.includes('score')) {
        return value.toFixed(0);
      }
      return value.toLocaleString();
    }
    return String(value);
  };

  const formatHeader = (column: string): string => {
    // ClientIdentityDisplayPolicy: Friendly column names
    const headerMappings: Record<string, string> = {
      'display_name': 'Client',
      'experience_state': 'Experience',
      'device_type': 'Device',
      'device_category': 'Category',
      'ap_name': 'Access Point',
      'site_name': 'Site',
      'mac_address': 'MAC',
      'ip_address': 'IP',
      'rfqi_score': 'RFQI',
    };

    if (headerMappings[column]) {
      return headerMappings[column];
    }

    return column
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace(/Dbm/g, 'dBm')
      .replace(/Db/g, 'dB')
      .replace(/Bps/g, 'bps')
      .replace(/Rfqi/g, 'RFQI');
  };

  // Render cell with special handling for identity and experience columns
  const renderCell = (value: any, column: string, row: any): React.ReactNode => {
    // ClientIdentityDisplayPolicy: display_name is primary, styled prominently
    if (column === 'display_name') {
      return (
        <span className="font-medium" title={row.mac_address || row.client_id}>
          {value || 'Unknown Device'}
        </span>
      );
    }

    // Experience state gets color coding
    if (column === 'experience_state') {
      return (
        <span className={cn('font-medium', getExperienceStyle(value))}>
          {value || '-'}
        </span>
      );
    }

    // RFQI score gets color based on value
    if (column === 'rfqi_score' && typeof value === 'number') {
      const color = value >= 90 ? 'text-green-500' :
                   value >= 75 ? 'text-blue-500' :
                   value >= 60 ? 'text-amber-500' : 'text-red-500';
      return <span className={cn('font-medium', color)}>{value.toFixed(0)}</span>;
    }

    return formatValue(value, column);
  };

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {visibleColumns.map((col) => (
              <TableHead key={col} className="text-xs whitespace-nowrap">
                {formatHeader(col)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayData.map((row, index) => (
            <TableRow key={row.client_id || row.mac_address || index}>
              {visibleColumns.map((col) => (
                <TableCell key={col} className="text-xs py-2">
                  {renderCell(row[col], col, row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data.length > displayData.length && (
        <p className="text-xs text-center text-muted-foreground mt-2">
          +{data.length - displayData.length} more rows
        </p>
      )}
    </div>
  );
};

/**
 * Timeseries content (simplified - would use Recharts in full implementation)
 */
const TimeseriesContent: React.FC<{ data: any }> = ({ data }) => {
  if (!data || typeof data !== 'object') {
    return <EmptyState />;
  }

  // Extract metrics from the data object
  const metrics = Object.entries(data).filter(([_, value]) => {
    return Array.isArray(value) && value.length > 0;
  });

  if (metrics.length === 0) {
    // Check if it's a single metric array
    if (Array.isArray(data) && data.length > 0) {
      return (
        <div className="space-y-2">
          <div className="h-32 bg-muted/30 rounded flex items-center justify-center">
            <span className="text-xs text-muted-foreground">
              {data.length} data points
            </span>
          </div>
        </div>
      );
    }
    return <EmptyState />;
  }

  return (
    <div className="space-y-3">
      {metrics.slice(0, 4).map(([metric, values]: [string, any]) => {
        const numericValues = values
          .map((v: any) => v.value ?? v)
          .filter((v: any) => typeof v === 'number');
        const latest = numericValues[numericValues.length - 1] || 0;
        const first = numericValues[0] || 0;
        const trend = latest - first;
        const trendPercent = first !== 0 ? ((trend / first) * 100).toFixed(1) : '0';

        return (
          <div key={metric} className="flex items-center justify-between p-2 bg-muted/30 rounded">
            <span className="text-xs text-muted-foreground capitalize">
              {metric.replace(/_/g, ' ')}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {typeof latest === 'number' ? latest.toFixed(1) : latest}
              </span>
              {trend !== 0 && (
                <span className={cn('flex items-center text-xs', trend > 0 ? 'text-green-500' : 'text-red-500')}>
                  {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {trendPercent}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Timeline feed content for contextual insights
 */
const TimelineFeedContent: React.FC<{ data: any[]; isExpanded: boolean }> = ({ data, isExpanded }) => {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <span className="text-sm">No insights available</span>
      </div>
    );
  }

  const displayData = isExpanded ? data.slice(0, 10) : data.slice(0, 3);

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return 'bg-red-500/10 border-red-500/20 text-red-400';
      case 'warning':
        return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
      case 'info':
        return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
      default:
        return 'bg-muted border-border text-muted-foreground';
    }
  };

  return (
    <div className="space-y-2">
      {displayData.map((insight, index) => (
        <div
          key={insight.insight_id || index}
          className={cn('p-3 rounded-lg border', getSeverityColor(insight.severity))}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium line-clamp-1">{insight.title}</p>
              {insight.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {insight.description}
                </p>
              )}
            </div>
            <Badge variant="outline" className="text-xs shrink-0">
              {insight.severity || 'info'}
            </Badge>
          </div>
        </div>
      ))}
      {data.length > displayData.length && (
        <p className="text-xs text-center text-muted-foreground">
          +{data.length - displayData.length} more insights
        </p>
      )}
    </div>
  );
};

/**
 * Generic content for unhandled widget types
 */
const GenericContent: React.FC<{ data: any }> = ({ data }) => {
  if (typeof data === 'number') {
    return (
      <div className="text-center py-4">
        <span className="text-4xl font-bold text-foreground">{data.toLocaleString()}</span>
      </div>
    );
  }

  if (Array.isArray(data)) {
    return (
      <div className="space-y-2 max-h-64 overflow-auto">
        {data.slice(0, 10).map((item, index) => (
          <div key={index} className="p-2 rounded bg-muted/50 text-sm">
            {typeof item === 'object' ? JSON.stringify(item) : String(item)}
          </div>
        ))}
      </div>
    );
  }

  if (typeof data === 'object' && data !== null) {
    return (
      <div className="space-y-2">
        {Object.entries(data).slice(0, 8).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
            <span className="font-medium truncate ml-2">
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="text-sm text-foreground whitespace-pre-wrap">
      {String(data)}
    </div>
  );
};

export default WorkspaceWidget;
