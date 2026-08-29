/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { AGGridWrapper } from './ui/AGGridWrapper';
import { MetricCard } from './ui/MetricCard';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Bell,
  CheckCircle,
  Info,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';
import { buildAlarmColumns, buildEventColumns } from '../config/eventAlarmColumns';

export function EventAlarmDashboard() {
  const [events, setEvents] = useState<any[]>([]);
  const [alarms, setAlarms] = useState<any[]>([]);
  const [activeAlarms, setActiveAlarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('alarms');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Use /v1/auditlogs (Swagger-documented) instead of /v1/events (non-Swagger)
      // Map auditlog fields to the event shape used in the Events tab
      const endTime = Date.now();
      const startTime = endTime - 7 * 24 * 60 * 60 * 1000; // last 7 days
      const [auditLogs, alarmsData, activeAlarmsData] = await Promise.allSettled([
        apiService.getAuditLogs(startTime, endTime),
        apiService.getAlarms(),
        apiService.getActiveAlarms(),
      ]);

      if (auditLogs.status === 'fulfilled') {
        const mapped = auditLogs.value.map((log: any) => ({
          type:
            log.action ||
            log.actionType ||
            log.category ||
            log.origin ||
            log.resourceType ||
            'Audit',
          severity:
            log.severity || (log.status?.toLowerCase().includes('error') ? 'critical' : undefined),
          message:
            log.description || log.message || `${log.action || ''} ${log.resource || ''}`.trim(),
          timestamp: log.timestamp || log.time,
          user: log.user || log.username || log.userId,
        }));
        setEvents(mapped);
      } else {
        console.warn('Failed to load audit logs:', auditLogs.reason);
        setEvents([]);
      }

      setAlarms(alarmsData.status === 'fulfilled' ? alarmsData.value : []);
      setActiveAlarms(activeAlarmsData.status === 'fulfilled' ? activeAlarmsData.value : []);

      if (alarmsData.status === 'rejected') {
        console.warn('Alarms API unavailable (non-Swagger endpoint):', alarmsData.reason);
      }
      if (activeAlarmsData.status === 'rejected') {
        console.warn(
          'Active alarms API unavailable (non-Swagger endpoint):',
          activeAlarmsData.reason
        );
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load events and alarms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAcknowledgeAlarm = useCallback(
    async (alarmId: string) => {
      try {
        await apiService.acknowledgeAlarm(alarmId);
        toast.success('Alarm acknowledged');
        await loadData();
      } catch (error) {
        console.error('Failed to acknowledge alarm:', error);
        toast.error('Failed to acknowledge alarm');
      }
    },
    [loadData]
  );

  const handleClearAlarm = useCallback(
    async (alarmId: string) => {
      try {
        await apiService.clearAlarm(alarmId);
        toast.success('Alarm cleared');
        await loadData();
      } catch (error) {
        console.error('Failed to clear alarm:', error);
        toast.error('Failed to clear alarm');
      }
    },
    [loadData]
  );

  const eventColumns = useMemo(() => buildEventColumns(), []);
  const alarmColumns = useMemo(() => buildAlarmColumns(), []);
  const activeAlarmColumns = useMemo(
    () =>
      buildAlarmColumns({
        onAcknowledge: (id) => void handleAcknowledgeAlarm(id),
        onClear: (id) => void handleClearAlarm(id),
      }),
    [handleAcknowledgeAlarm, handleClearAlarm]
  );

  const criticalCount = alarms.filter((a) => a.severity?.toLowerCase() === 'critical').length;

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Events & Alarms
          </h2>
          <p className="text-muted-foreground">Monitor system events and manage alarms</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadData}
          aria-label="Refresh events and alarms"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Active Alarms"
          value={activeAlarms.length}
          icon={Bell}
          tone={activeAlarms.length > 0 ? 'critical' : 'default'}
          toneValue={activeAlarms.length > 0}
        />
        <MetricCard title="Total Alarms" value={alarms.length} icon={Archive} />
        <MetricCard title="Recent Events" value={events.length} icon={Info} />
        <MetricCard
          title="Critical Issues"
          value={criticalCount}
          icon={AlertCircle}
          tone={criticalCount > 0 ? 'critical' : 'default'}
          toneValue={criticalCount > 0}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="alarms">
            <Bell className="h-4 w-4 mr-2" />
            Active Alarms ({activeAlarms.length})
          </TabsTrigger>
          <TabsTrigger value="all-alarms">
            <AlertTriangle className="h-4 w-4 mr-2" />
            All Alarms ({alarms.length})
          </TabsTrigger>
          <TabsTrigger value="events">
            <Info className="h-4 w-4 mr-2" />
            Events ({events.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="alarms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Alarms</CardTitle>
              <CardDescription>Alarms requiring attention</CardDescription>
            </CardHeader>
            <CardContent>
              {activeAlarms.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50 text-[color:var(--status-success)]" />
                  <p>No active alarms</p>
                  <p className="text-sm mt-2">All systems operating normally</p>
                </div>
              ) : (
                <AGGridWrapper
                  rowData={activeAlarms}
                  columnDefs={activeAlarmColumns}
                  storageKey="active-alarms"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all-alarms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Alarms</CardTitle>
              <CardDescription>Complete alarm history</CardDescription>
            </CardHeader>
            <CardContent>
              {alarms.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <AlertTriangle className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No alarms recorded</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Alarm history will appear here when the controller reports events.
                  </p>
                </div>
              ) : (
                <AGGridWrapper
                  rowData={alarms}
                  columnDefs={alarmColumns}
                  storageKey="all-alarms"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Events</CardTitle>
              <CardDescription>Recent system activity</CardDescription>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Info className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No recent events</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    System events will appear here as controller activity is logged.
                  </p>
                </div>
              ) : (
                <AGGridWrapper rowData={events} columnDefs={eventColumns} storageKey="events" />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
