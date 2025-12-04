import { useState, useEffect, useRef } from 'react';
import { Resizable } from 're-resizable';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { 
  X, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Copy,
  Download,
  GripHorizontal
} from 'lucide-react';
import { cn } from './ui/utils';

export interface ApiCallLog {
  id: number;
  timestamp: Date;
  method: string;
  endpoint: string;
  status?: number;
  duration?: number;
  requestBody?: any;
  responseBody?: any;
  error?: string;
  isPending: boolean;
}

interface DevModePanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiLogs: ApiCallLog[];
  onClearLogs: () => void;
  onHeightChange?: (height: number) => void;
}

export function DevModePanel({ isOpen, onClose, apiLogs, onClearLogs, onHeightChange }: DevModePanelProps) {
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [panelHeight, setPanelHeight] = useState(400);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [apiLogs, autoScroll]);

  useEffect(() => {
    // Notify parent of height changes
    if (onHeightChange) {
      onHeightChange(isOpen ? panelHeight : 0);
    }
  }, [panelHeight, isOpen, onHeightChange]);

  if (!isOpen) return null;

  const getStatusColor = (status?: number) => {
    if (!status) return 'text-muted-foreground';
    if (status >= 200 && status < 300) return 'text-green-500';
    if (status >= 400 && status < 500) return 'text-yellow-500';
    if (status >= 500) return 'text-red-500';
    return 'text-muted-foreground';
  };

  const getStatusIcon = (log: ApiCallLog) => {
    if (log.isPending) return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    if (log.error) return <XCircle className="h-4 w-4 text-red-500" />;
    if (log.status && log.status >= 200 && log.status < 300) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (log.status && log.status >= 400) return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    return <Activity className="h-4 w-4 text-muted-foreground" />;
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'POST': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'PUT': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'PATCH': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'DELETE': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30';
    }
  };

  const formatTimestamp = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Simple visual feedback - could add a toast if needed
    });
  };

  const exportLogs = () => {
    const logsJson = JSON.stringify(apiLogs, null, 2);
    const blob = new Blob([logsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-logs-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleExpanded = (id: number) => {
    setExpandedLog(expandedLog === id ? null : id);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background shadow-2xl">
      <Resizable
        size={{ width: '100%', height: panelHeight }}
        minHeight={150}
        maxHeight={window.innerHeight - 100}
        enable={{ 
          top: true, 
          right: false, 
          bottom: false, 
          left: false, 
          topRight: false, 
          bottomRight: false, 
          bottomLeft: false, 
          topLeft: false 
        }}
        onResizeStop={(e, direction, ref, d) => {
          setPanelHeight(panelHeight + d.height);
        }}
        handleStyles={{
          top: {
            height: '8px',
            top: '-4px',
            cursor: 'ns-resize',
            zIndex: 10,
          }
        }}
        handleComponent={{
          top: (
            <div className="absolute top-0 left-0 right-0 h-2 flex items-center justify-center group hover:bg-primary/10 transition-colors cursor-ns-resize">
              <div className="bg-border group-hover:bg-primary/50 rounded-full h-1 w-16 transition-colors" />
            </div>
          )
        }}
      >
        <Card className="rounded-none border-0 border-t border-border h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-3">
            <GripHorizontal className="h-4 w-4 text-muted-foreground" />
            <Activity className="h-5 w-5 text-primary" />
            <h3 className="text-sm text-card-foreground">
              Developer Mode - API Monitor
            </h3>
            <Badge variant="secondary" className="text-xs">
              {apiLogs.length} {apiLogs.length === 1 ? 'call' : 'calls'}
            </Badge>
            {apiLogs.some(log => log.isPending) && (
              <Badge variant="outline" className="text-xs">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                {apiLogs.filter(log => log.isPending).length} pending
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
              className="text-xs"
              title={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
            >
              {autoScroll ? 'Auto-scroll: ON' : 'Auto-scroll: OFF'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={exportLogs}
              disabled={apiLogs.length === 0}
              title="Export logs as JSON"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearLogs}
              disabled={apiLogs.length === 0}
              title="Clear all logs"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              title="Close developer mode"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Logs */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto bg-card/50 font-mono text-xs"
        >
          {apiLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No API calls yet</p>
                <p className="text-xs mt-1">Use the UI to see API requests appear here</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {apiLogs.map((log) => (
                <div key={log.id} className="hover:bg-accent/50 transition-colors">
                  {/* Log Entry */}
                  <div 
                    className="flex items-start gap-3 px-4 py-2 cursor-pointer"
                    onClick={() => toggleExpanded(log.id)}
                  >
                    {/* Status Icon */}
                    <div className="mt-1 flex-shrink-0">
                      {getStatusIcon(log)}
                    </div>

                    {/* Timestamp */}
                    <div className="flex-shrink-0 text-muted-foreground w-24">
                      {formatTimestamp(log.timestamp)}
                    </div>

                    {/* Method */}
                    <Badge 
                      variant="outline" 
                      className={cn("flex-shrink-0 w-16 justify-center border", getMethodColor(log.method))}
                    >
                      {log.method}
                    </Badge>

                    {/* Endpoint */}
                    <div className="flex-1 text-card-foreground truncate">
                      {log.endpoint}
                    </div>

                    {/* Status */}
                    {log.status && (
                      <div className={cn("flex-shrink-0 w-12 text-right", getStatusColor(log.status))}>
                        {log.status}
                      </div>
                    )}

                    {/* Duration */}
                    {log.duration !== undefined && (
                      <div className="flex-shrink-0 flex items-center gap-1 text-muted-foreground w-20 text-right">
                        <Clock className="h-3 w-3" />
                        {log.duration}ms
                      </div>
                    )}

                    {/* Expand Icon */}
                    <div className="flex-shrink-0">
                      {expandedLog === log.id ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedLog === log.id && (
                    <div className="px-4 pb-3 space-y-3 bg-background/50">
                      {/* Request Details */}
                      {log.requestBody && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-muted-foreground text-xs uppercase tracking-wide">Request Body</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(JSON.stringify(log.requestBody, null, 2));
                              }}
                              className="h-6 px-2"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <pre className="bg-background border border-border rounded p-2 overflow-x-auto text-xs">
                            {JSON.stringify(log.requestBody, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* Response Details */}
                      {log.responseBody && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-muted-foreground text-xs uppercase tracking-wide">Response Body</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(JSON.stringify(log.responseBody, null, 2));
                              }}
                              className="h-6 px-2"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <pre className="bg-background border border-border rounded p-2 overflow-x-auto text-xs max-h-64">
                            {JSON.stringify(log.responseBody, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* Error Details */}
                      {log.error && (
                        <div>
                          <span className="text-red-500 text-xs uppercase tracking-wide">Error</span>
                          <pre className="bg-red-950/20 border border-red-500/30 rounded p-2 overflow-x-auto text-xs text-red-400 mt-1">
                            {log.error}
                          </pre>
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t border-border/50">
                        <span>ID: {log.id}</span>
                        <span>Full Timestamp: {log.timestamp.toISOString()}</span>
                        {log.duration !== undefined && <span>Duration: {log.duration}ms</span>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
      </Resizable>
    </div>
  );
}
