import React, { useState } from 'react';
import { RefreshCw, Trash2, GripVertical, Maximize2, Minimize2, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardAction } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from './ui/utils';
import type { WorkspaceWidget as WorkspaceWidgetType, WorkspaceTopic } from '@/hooks/useWorkspace';
import { TOPIC_COLORS } from '@/hooks/useWorkspace';

interface WorkspaceWidgetProps {
  widget: WorkspaceWidgetType;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onMove?: (id: string, position: { x: number; y: number }) => void;
  onResize?: (id: string, size: { width: number; height: number }) => void;
}

/**
 * Get icon for a topic
 */
function getTopicIcon(topic: WorkspaceTopic): React.ReactNode {
  const iconClass = 'w-3 h-3';
  switch (topic) {
    case 'Devices':
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      );
    case 'Clients':
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
      );
    case 'Licensing':
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      );
    case 'Alerts':
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      );
  }
}

export const WorkspaceWidget: React.FC<WorkspaceWidgetProps> = ({
  widget,
  onRefresh,
  onDelete,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const topicColor = TOPIC_COLORS[widget.topic];

  return (
    <Card
      className={cn(
        'relative transition-all duration-200',
        isExpanded ? 'col-span-2 row-span-2' : '',
        'hover:shadow-lg hover:shadow-black/5',
        'group'
      )}
    >
      {/* Drag Handle (for future drag-and-drop) */}
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
                topicColor.bg,
                topicColor.text,
                topicColor.border
              )}
            >
              {getTopicIcon(widget.topic)}
              <span className="ml-1">{widget.topic}</span>
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
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <span className="text-sm">Processing query...</span>
          </div>
        ) : widget.error ? (
          <div className="flex flex-col items-center justify-center py-8 text-destructive">
            <svg className="h-8 w-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm text-center">{widget.error}</span>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => onRefresh(widget.id)}
            >
              Try Again
            </Button>
          </div>
        ) : widget.data ? (
          <div className="space-y-3">
            {/* Render widget data based on type */}
            {renderWidgetContent(widget)}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <span className="text-sm">No data available</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Render widget content based on the data type
 */
function renderWidgetContent(widget: WorkspaceWidgetType): React.ReactNode {
  const { data } = widget;

  // If data is a simple count/number
  if (typeof data === 'number') {
    return (
      <div className="text-center py-4">
        <span className="text-4xl font-bold text-foreground">{data.toLocaleString()}</span>
      </div>
    );
  }

  // If data is an array (list of items)
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return (
        <div className="text-center py-4 text-muted-foreground">
          <span className="text-sm">No results found</span>
        </div>
      );
    }

    return (
      <div className="space-y-2 max-h-64 overflow-auto">
        {data.slice(0, 10).map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm"
          >
            <span className="truncate flex-1">
              {typeof item === 'object' ? (item.name || item.displayName || item.id || JSON.stringify(item)) : String(item)}
            </span>
            {typeof item === 'object' && item.value !== undefined && (
              <span className="text-muted-foreground ml-2">{item.value}</span>
            )}
          </div>
        ))}
        {data.length > 10 && (
          <div className="text-center text-xs text-muted-foreground py-2">
            +{data.length - 10} more items
          </div>
        )}
      </div>
    );
  }

  // If data is an object with specific structure
  if (typeof data === 'object' && data !== null) {
    // Check for summary/count type
    if ('total' in data || 'count' in data) {
      const value = data.total ?? data.count;
      return (
        <div className="text-center py-4">
          <span className="text-4xl font-bold text-foreground">{value.toLocaleString()}</span>
          {data.label && (
            <p className="text-sm text-muted-foreground mt-1">{data.label}</p>
          )}
        </div>
      );
    }

    // Check for comparison type (e.g., used vs available)
    if ('used' in data && 'available' in data) {
      const total = data.used + data.available;
      const percentage = total > 0 ? (data.used / total) * 100 : 0;
      return (
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Used</span>
            <span className="font-medium">{data.used.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Available</span>
            <span className="font-medium">{data.available.toLocaleString()}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className={cn(
                'h-2 rounded-full transition-all',
                percentage > 90 ? 'bg-red-500' : percentage > 70 ? 'bg-amber-500' : 'bg-green-500'
              )}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <div className="text-center text-xs text-muted-foreground">
            {percentage.toFixed(1)}% utilized
          </div>
        </div>
      );
    }

    // Generic object rendering
    return (
      <div className="space-y-2">
        {Object.entries(data).slice(0, 8).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
            <span className="font-medium truncate ml-2 max-w-[60%]">
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Default string rendering
  return (
    <div className="text-sm text-foreground whitespace-pre-wrap">
      {String(data)}
    </div>
  );
}

export default WorkspaceWidget;
