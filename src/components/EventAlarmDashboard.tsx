import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Bell,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { TouchButton } from './TouchButton';
import { DesktopOnly } from './MobileOptimized';
import { apiService } from '../services/api';

export function EventAlarmDashboard() {
  const [events, setEvents] = useState<any[]>([]);
  const [alarms, setAlarms] = useState<any[]>([]);
  const [activeAlarms, setActiveAlarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('alarms');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [eventsData, alarmsData, activeAlarmsData] = await Promise.all([
        apiService.getEvents(),
        apiService.getAlarms(),
        apiService.getActiveAlarms()
      ]);
      setEvents(eventsData);
      setAlarms(alarmsData);
      setActiveAlarms(activeAlarmsData);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load events and alarms');
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledgeAlarm = async (alarmId: string) => {
    try {
      await apiService.acknowledgeAlarm(alarmId);
      toast.success('Alarm acknowledged');
      await loadData();
    } catch (error) {
      console.error('Failed to acknowledge alarm:', error);
      toast.error('Failed to acknowledge alarm');
    }
  };

  const handleClearAlarm = async (alarmId: string) => {
    try {
      await apiService.clearAlarm(alarmId);
      toast.success('Alarm cleared');
      await loadData();
    } catch (error) {
      console.error('Failed to clear alarm:', error);
      toast.error('Failed to clear alarm');
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'info':
        return <Info className="h-5 w-5 text-blue-500" />;
      default:
        return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500">Warning</Badge>;
      case 'info':
        return <Badge variant="secondary">Info</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

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
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Events & Alarms
          </h2>
          <p className="text-muted-foreground">
            Monitor system events and manage alarms
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} aria-label="Refresh events and alarms">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Alarms
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{activeAlarms.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Alarms
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <span className="text-2xl font-bold">{alarms.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recent Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{events.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Critical Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <span className="text-2xl font-bold">
                {alarms.filter(a => a.severity?.toLowerCase() === 'critical').length}
              </span>
            </div>
          </CardContent>
        </Card>
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
              <CardDescription>
                Alarms requiring attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeAlarms.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50 text-green-500" />
                  <p>No active alarms</p>
                  <p className="text-sm mt-2">All systems operating normally</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeAlarms.map((alarm) => (
                    <div
                      key={alarm.id}
                      className="flex items-start justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-start gap-3">
                        {getSeverityIcon(alarm.severity)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{alarm.title || alarm.type}</h3>
                            {getSeverityBadge(alarm.severity)}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {alarm.message || alarm.description}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{new Date(alarm.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAcknowledgeAlarm(alarm.id)}
                          aria-label={`Acknowledge alarm: ${alarm.title || alarm.type}`}
                        >
                          Acknowledge
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleClearAlarm(alarm.id)}
                          aria-label={`Clear alarm: ${alarm.title || alarm.type}`}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all-alarms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Alarms</CardTitle>
              <CardDescription>
                Complete alarm history
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {alarms.map((alarm) => (
                  <div
                    key={alarm.id}
                    className="flex items-start gap-3 p-3 border rounded-lg"
                  >
                    {getSeverityIcon(alarm.severity)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{alarm.title || alarm.type}</span>
                        {getSeverityBadge(alarm.severity)}
                        {alarm.status && (
                          <Badge variant="outline" className="text-xs">
                            {alarm.status}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {alarm.message || alarm.description}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(alarm.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Events</CardTitle>
              <CardDescription>
                Recent system activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {events.map((event, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{event.type || 'Event'}</span>
                        {event.severity && getSeverityBadge(event.severity)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {event.message || event.description}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(event.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
