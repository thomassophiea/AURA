import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Radio, TestTube, Zap, Network, Download, FileText, RefreshCw, Stethoscope } from 'lucide-react';
import { AFCPlanningTool } from './AFCPlanningTool';
import { ApiTestTool } from './ApiTestTool';
import { RFManagementTools } from './RFManagementTools';
import { PacketCapture } from './PacketCapture';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import type { 
  PacketCaptureConfig, 
  TCPDumpConfig, 
  LogViewerConfig,
  DiagnosticResult 
} from '../types/tools';

export function Tools() {
  const [activeTab, setActiveTab] = useState('rf-management');

  const [packetCaptureRunning, setPacketCaptureRunning] = useState(false);
  const [packetCaptureConfig, setPacketCaptureConfig] = useState<Partial<PacketCaptureConfig>>({
    duration: 60,
    maxPackets: 1000,
    interface: 'all'
  });

  const [logLevel, setLogLevel] = useState<string>('info');
  const [logEntries, setLogEntries] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

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
                  <Download className="h-5 w-5" />
                  Packet Capture
                </CardTitle>
                <CardDescription>Capture network traffic for analysis</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Duration (seconds)</Label>
                    <Input 
                      type="number" 
                      value={packetCaptureConfig.duration} 
                      onChange={(e) => setPacketCaptureConfig(prev => ({...prev, duration: parseInt(e.target.value)}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Packets</Label>
                    <Input 
                      type="number" 
                      value={packetCaptureConfig.maxPackets}
                      onChange={(e) => setPacketCaptureConfig(prev => ({...prev, maxPackets: parseInt(e.target.value)}))}
                    />
                  </div>
                </div>
                <Button 
                  onClick={() => toast.info('Packet capture would start here')}
                  disabled={packetCaptureRunning}
                >
                  {packetCaptureRunning ? 'Capturing...' : 'Start Capture'}
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
                  <Button variant="outline" onClick={() => toast.info('Would fetch logs')}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Logs
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
