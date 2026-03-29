import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Radio, TestTube, Zap, Network, FileText, RefreshCw, Stethoscope, Building2 } from 'lucide-react';
import { AFCPlanningTool } from './AFCPlanningTool';
import { AFCRadioHeightCalculator } from './AFCRadioHeightCalculator';
import { ApiTestTool } from './ApiTestTool';
import { RFManagementTools } from './RFManagementTools';
import { PacketCapture } from './PacketCapture';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { apiService } from '../services/api';

export function Tools() {
  const [activeTab, setActiveTab] = useState('rf-management');

  const [logLevel, setLogLevel] = useState<string>('info');
  const [logEntries, setLogEntries] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const handleRefreshLogs = async () => {
    setLoadingLogs(true);
    try {
      // Use /v1/auditlogs (Swagger-documented) instead of /v1/events (non-Swagger)
      const endTime = Date.now();
      const startTime = endTime - 24 * 60 * 60 * 1000; // last 24 hours
      const logs = await apiService.getAuditLogs(startTime, endTime);
      const mapped = logs
        .map((log: any) => ({
          timestamp: log.timestamp || log.time || new Date().toISOString(),
          level: log.severity || (log.status?.toLowerCase().includes('error') ? 'error' : 'info'),
          message: log.description || log.message || `${log.action || ''} ${log.resource || ''}`.trim() || JSON.stringify(log),
        }))
        .filter((entry: { level: string }) => {
          if (logLevel === 'info') return true;
          return entry.level?.toLowerCase() === logLevel;
        });
      setLogEntries(mapped);
      if (mapped.length === 0) toast.info('No log entries found');
    } catch {
      toast.error('Failed to fetch audit logs');
    } finally {
      setLoadingLogs(false);
    }
  };

  return (
    <div className="h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
        <div className="border-b">
          <TabsList className="h-12 px-6">
            <TabsTrigger value="rf-management" className="flex items-center gap-2">
              <Radio className="h-4 w-4" />
              RF Management
            </TabsTrigger>
            <TabsTrigger value="afc-planning" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              AFC Planning
            </TabsTrigger>
            <TabsTrigger value="afc-heights" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Radio Height Calc
            </TabsTrigger>
            <TabsTrigger value="api-test" className="flex items-center gap-2">
              <TestTube className="h-4 w-4" />
              API Test
            </TabsTrigger>
            <TabsTrigger value="packet-capture" className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              Packet Capture
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4" />
              Diagnostics
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="rf-management" className="m-0 h-[calc(100%-3rem)]">
          <RFManagementTools />
        </TabsContent>

        <TabsContent value="afc-planning" className="m-0 h-[calc(100%-3rem)]">
          <AFCPlanningTool />
        </TabsContent>

        <TabsContent value="afc-heights" className="m-0 h-[calc(100%-3rem)] overflow-auto">
          <AFCRadioHeightCalculator />
        </TabsContent>

        <TabsContent value="api-test" className="m-0 h-[calc(100%-3rem)]">
          <ApiTestTool />
        </TabsContent>

        <TabsContent value="packet-capture" className="m-0 h-[calc(100%-3rem)]">
          <PacketCapture />
        </TabsContent>

        <TabsContent value="diagnostics" className="m-0 h-[calc(100%-3rem)] overflow-auto p-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5" />
                  Packet Capture
                </CardTitle>
                <CardDescription>Capture network traffic for analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure interface, filters, duration, and download captures from the dedicated Packet Capture tab.
                </p>
                <Button onClick={() => setActiveTab('packet-capture')}>
                  Open Packet Capture
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  System Logs
                </CardTitle>
                <CardDescription>View and filter system logs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <Select value={logLevel} onValueChange={setLogLevel}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="debug">Debug</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={handleRefreshLogs} disabled={loadingLogs}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loadingLogs ? 'animate-spin' : ''}`} />
                    {loadingLogs ? 'Loading...' : 'Refresh Logs'}
                  </Button>
                </div>
                <div className="h-64 overflow-y-auto bg-muted rounded-lg p-4 font-mono text-xs">
                  {logEntries.length === 0 ? (
                    <p className="text-muted-foreground">No log entries. Click Refresh to load.</p>
                  ) : (
                    logEntries.map((entry, i) => (
                      <div key={i} className="py-1">
                        <span className="text-muted-foreground">{entry.timestamp}</span>
                        <span className={`ml-2 ${entry.level === 'error' ? 'text-red-500' : ''}`}>
                          [{entry.level}]
                        </span>
                        <span className="ml-2">{entry.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
