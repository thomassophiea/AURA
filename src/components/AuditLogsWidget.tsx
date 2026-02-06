import { useState, useEffect ,  memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { FileText, User, Clock, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { apiService } from '../services/api';

interface AuditLog {
  id?: string;
  timestamp?: number;
  time?: number;
  user?: string;
  userId?: string;
  username?: string;
  action?: string;
  actionType?: string;
  resource?: string;
  resourceType?: string;
  description?: string;
  message?: string;
  status?: string;
  severity?: string;
  ipAddress?: string;
}

/**
 * Audit Logs Widget
 *
 * Displays system audit logs showing user actions and system events
 * Uses Extreme Platform ONE API: GET /v1/auditlogs
 */
export function AuditLogsWidget() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filter, setFilter] = useState<'all' | 'user' | 'system'>('all');

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const loadAuditLogs = async () => {
    setLoading(true);

    try {
      console.log('[AuditLogs] Loading audit logs...');

      // Get logs from the last 7 days
      const endTime = Date.now();
      const startTime = endTime - (7 * 24 * 60 * 60 * 1000);

      const auditLogs = await apiService.getAuditLogs(startTime, endTime);

      setLogs(auditLogs);
      console.log(`[AuditLogs] Loaded ${auditLogs.length} audit logs`);
    } catch (error) {
      console.error('[AuditLogs] Error loading audit logs:', error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredLogs = () => {
    if (filter === 'all') return logs;
    if (filter === 'user') {
      return logs.filter(log =>
        (log.user || log.userId || log.username) &&
        (log.action || log.actionType)
      );
    }
    if (filter === 'system') {
      return logs.filter(log =>
        !(log.user || log.userId || log.username) ||
        (log.action || log.actionType || '').toLowerCase().includes('system')
      );
    }
    return logs;
  };

  const formatTimestamp = (timestamp?: number): string => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getActionIcon = (log: AuditLog) => {
    const action = (log.action || log.actionType || '').toLowerCase();
    const status = (log.status || '').toLowerCase();

    if (status.includes('error') || status.includes('fail')) {
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
    if (status.includes('success') || action.includes('create') || action.includes('add')) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (action.includes('delete') || action.includes('remove')) {
      return <AlertCircle className="h-4 w-4 text-orange-500" />;
    }
    return <Info className="h-4 w-4 text-blue-500" />;
  };

  const getActionBadge = (log: AuditLog) => {
    const action = log.action || log.actionType;
    const status = log.status || '';

    if (status.toLowerCase().includes('error') || status.toLowerCase().includes('fail')) {
      return <Badge variant="destructive" className="text-xs">Error</Badge>;
    }

    if (!action) {
      return null; // Don't show badge if action is unknown
    }

    if (action.toLowerCase().includes('create') || action.toLowerCase().includes('add')) {
      return <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Create</Badge>;
    }
    if (action.toLowerCase().includes('update') || action.toLowerCase().includes('modify')) {
      return <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">Update</Badge>;
    }
    if (action.toLowerCase().includes('delete') || action.toLowerCase().includes('remove')) {
      return <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">Delete</Badge>;
    }
    return <Badge variant="secondary" className="text-xs">{action}</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Audit Logs
          </CardTitle>
          <CardDescription>System and user activity logs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">Loading audit logs...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const filteredLogs = getFilteredLogs();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Audit Logs
            </CardTitle>
            <CardDescription>
              {logs.length} log{logs.length !== 1 ? 's' : ''} from the last 7 days
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge
              variant={filter === 'all' ? 'default' : 'outline'}
              className="cursor-pointer text-xs"
              onClick={() => setFilter('all')}
            >
              All ({logs.length})
            </Badge>
            <Badge
              variant={filter === 'user' ? 'default' : 'outline'}
              className="cursor-pointer text-xs"
              onClick={() => setFilter('user')}
            >
              User
            </Badge>
            <Badge
              variant={filter === 'system' ? 'default' : 'outline'}
              className="cursor-pointer text-xs"
              onClick={() => setFilter('system')}
            >
              System
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredLogs.length > 0 ? (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2 pb-16">
              {filteredLogs.map((log, idx) => {
                const timestamp = log.timestamp || log.time;
                const user = log.user || log.userId || log.username;
                const action = log.action || log.actionType;
                const resource = log.resource || log.resourceType;
                const description = log.description || log.message;

                return (
                  <div
                    key={log.id || idx}
                    className="p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {getActionIcon(log)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getActionBadge(log)}
                          {user && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              <span>{user}</span>
                            </div>
                          )}
                        </div>
                        {action && (
                          <div className="text-sm font-medium mb-1">
                            {action}
                            {resource && <span className="text-muted-foreground"> on {resource}</span>}
                          </div>
                        )}
                        {description && (
                          <div className="text-xs text-muted-foreground mb-2">
                            {description}
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{formatTimestamp(timestamp)}</span>
                          {log.ipAddress && (
                            <>
                              <span className="mx-1">•</span>
                              <span>IP: {log.ipAddress}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No {filter !== 'all' ? filter + ' ' : ''}audit logs found
          </div>
        )}
      </CardContent>
    </Card>
  );
}
