import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import {
  Activity,
  Search,
  Route,
  Globe,
  PlayCircle,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { TouchButton } from './TouchButton';
import { DesktopOnly } from './MobileOptimized';
import { apiService } from '../services/api';

interface PingResult {
  host: string;
  packets: {
    transmitted: number;
    received: number;
    loss: number;
  };
  rtt: {
    min: number;
    avg: number;
    max: number;
  };
  results: Array<{
    seq: number;
    time: number;
    ttl: number;
  }>;
  timestamp: string;
}

interface TracerouteResult {
  host: string;
  hops: Array<{
    hop: number;
    ip: string;
    hostname?: string;
    rtt: number[];
  }>;
  timestamp: string;
}

interface DnsResult {
  hostname: string;
  addresses: string[];
  timestamp: string;
}

export function NetworkDiagnostics() {
  const [activeTab, setActiveTab] = useState('ping');

  // Ping state
  const [pingHost, setPingHost] = useState('');
  const [pingCount, setPingCount] = useState('4');
  const [pingRunning, setPingRunning] = useState(false);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);

  // Traceroute state
  const [traceHost, setTraceHost] = useState('');
  const [traceRunning, setTraceRunning] = useState(false);
  const [traceResult, setTraceResult] = useState<TracerouteResult | null>(null);

  // DNS state
  const [dnsHostname, setDnsHostname] = useState('');
  const [dnsRunning, setDnsRunning] = useState(false);
  const [dnsResult, setDnsResult] = useState<DnsResult | null>(null);

  const validateHostOrIP = (value: string): boolean => {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const hostnameRegex = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*[a-zA-Z0-9]$/;
    return ipRegex.test(value) || hostnameRegex.test(value);
  };

  const handlePing = async () => {
    if (!pingHost.trim()) {
      toast.error('Please enter a hostname or IP address');
      return;
    }

    if (!validateHostOrIP(pingHost)) {
      toast.error('Please enter a valid hostname or IP address');
      return;
    }

    setPingRunning(true);
    setPingResult(null);
    try {
      const result = await apiService.networkPing(pingHost, parseInt(pingCount) || 4);
      setPingResult({
        ...result,
        timestamp: new Date().toLocaleString()
      });
      toast.success('Ping completed successfully');
    } catch (error) {
      console.error('Ping failed:', error);
      toast.error('Ping failed. Please check the hostname and try again.');
    } finally {
      setPingRunning(false);
    }
  };

  const handleTraceroute = async () => {
    if (!traceHost.trim()) {
      toast.error('Please enter a hostname or IP address');
      return;
    }

    if (!validateHostOrIP(traceHost)) {
      toast.error('Please enter a valid hostname or IP address');
      return;
    }

    setTraceRunning(true);
    setTraceResult(null);
    try {
      const result = await apiService.networkTraceroute(traceHost);
      setTraceResult({
        ...result,
        timestamp: new Date().toLocaleString()
      });
      toast.success('Traceroute completed successfully');
    } catch (error) {
      console.error('Traceroute failed:', error);
      toast.error('Traceroute failed. Please check the hostname and try again.');
    } finally {
      setTraceRunning(false);
    }
  };

  const handleDnsLookup = async () => {
    if (!dnsHostname.trim()) {
      toast.error('Please enter a hostname');
      return;
    }

    const hostnameRegex = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*[a-zA-Z0-9]$/;
    if (!hostnameRegex.test(dnsHostname)) {
      toast.error('Please enter a valid hostname');
      return;
    }

    setDnsRunning(true);
    setDnsResult(null);
    try {
      const result = await apiService.networkDnsLookup(dnsHostname);
      setDnsResult({
        ...result,
        timestamp: new Date().toLocaleString()
      });
      toast.success('DNS lookup completed successfully');
    } catch (error) {
      console.error('DNS lookup failed:', error);
      toast.error('DNS lookup failed. Please check the hostname and try again.');
    } finally {
      setDnsRunning(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6" />
          Network Diagnostics
        </h2>
        <p className="text-muted-foreground">
          Test network connectivity with ping, traceroute, and DNS lookup
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ping">
            <Activity className="h-4 w-4 mr-2" />
            Ping
          </TabsTrigger>
          <TabsTrigger value="traceroute">
            <Route className="h-4 w-4 mr-2" />
            Traceroute
          </TabsTrigger>
          <TabsTrigger value="dns">
            <Globe className="h-4 w-4 mr-2" />
            DNS Lookup
          </TabsTrigger>
        </TabsList>

        {/* Ping Tab */}
        <TabsContent value="ping" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ping Test</CardTitle>
              <CardDescription>
                Test network connectivity and measure round-trip time
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ping-host">Hostname or IP Address</Label>
                  <Input
                    id="ping-host"
                    value={pingHost}
                    onChange={(e) => setPingHost(e.target.value)}
                    placeholder="8.8.8.8 or google.com"
                    onKeyPress={(e) => e.key === 'Enter' && handlePing()}
                    aria-label="Enter hostname or IP address for ping test"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ping-count">Packet Count</Label>
                  <Input
                    id="ping-count"
                    type="number"
                    value={pingCount}
                    onChange={(e) => setPingCount(e.target.value)}
                    min="1"
                    max="100"
                    aria-label="Set number of ping packets"
                  />
                </div>
              </div>
              <Button onClick={handlePing} disabled={pingRunning} aria-label="Run ping test">
                {pingRunning ? (
                  <>
                    <Activity className="h-4 w-4 mr-2 animate-pulse" />
                    Running...
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Run Ping
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {pingResult && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Results</CardTitle>
                  <Badge variant="outline">{pingResult.timestamp}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <div className="text-2xl font-bold">{pingResult.packets.transmitted}</div>
                    <div className="text-sm text-muted-foreground">Transmitted</div>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {pingResult.packets.received}
                    </div>
                    <div className="text-sm text-muted-foreground">Received</div>
                  </div>
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      {pingResult.packets.loss}%
                    </div>
                    <div className="text-sm text-muted-foreground">Packet Loss</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">Round-Trip Time (RTT)</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Min:</span>{' '}
                      <span className="font-medium">{pingResult.rtt.min.toFixed(2)} ms</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Avg:</span>{' '}
                      <span className="font-medium">{pingResult.rtt.avg.toFixed(2)} ms</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Max:</span>{' '}
                      <span className="font-medium">{pingResult.rtt.max.toFixed(2)} ms</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">Individual Pings</h4>
                  <div className="space-y-1">
                    {pingResult.results.map((ping, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-muted/20 rounded"
                      >
                        <span className="text-sm">Sequence {ping.seq}</span>
                        <div className="flex items-center gap-4 text-sm">
                          <span>TTL: {ping.ttl}</span>
                          <span className="font-medium">{ping.time.toFixed(2)} ms</span>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Traceroute Tab */}
        <TabsContent value="traceroute" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Traceroute</CardTitle>
              <CardDescription>
                Trace the network path to a destination
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="trace-host">Hostname or IP Address</Label>
                <Input
                  id="trace-host"
                  value={traceHost}
                  onChange={(e) => setTraceHost(e.target.value)}
                  placeholder="8.8.8.8 or google.com"
                  onKeyPress={(e) => e.key === 'Enter' && handleTraceroute()}
                  aria-label="Enter hostname or IP address for traceroute"
                />
              </div>
              <Button onClick={handleTraceroute} disabled={traceRunning} aria-label="Run traceroute">
                {traceRunning ? (
                  <>
                    <Activity className="h-4 w-4 mr-2 animate-pulse" />
                    Running...
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Run Traceroute
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {traceResult && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Route to {traceResult.host}</CardTitle>
                  <Badge variant="outline">{traceResult.timestamp}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {traceResult.hops.map((hop, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-4 p-3 border rounded-lg"
                    >
                      <Badge variant="outline" className="w-12 justify-center">
                        {hop.hop}
                      </Badge>
                      <div className="flex-1">
                        <p className="font-medium">{hop.hostname || hop.ip}</p>
                        {hop.hostname && hop.ip && (
                          <p className="text-sm text-muted-foreground">{hop.ip}</p>
                        )}
                      </div>
                      <div className="text-right">
                        {hop.rtt.map((time, i) => (
                          <Badge key={i} variant="secondary" className="ml-1">
                            {time.toFixed(2)} ms
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* DNS Tab */}
        <TabsContent value="dns" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>DNS Lookup</CardTitle>
              <CardDescription>
                Resolve hostname to IP addresses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dns-hostname">Hostname</Label>
                <Input
                  id="dns-hostname"
                  value={dnsHostname}
                  onChange={(e) => setDnsHostname(e.target.value)}
                  placeholder="example.com"
                  onKeyPress={(e) => e.key === 'Enter' && handleDnsLookup()}
                  aria-label="Enter hostname for DNS lookup"
                />
              </div>
              <Button onClick={handleDnsLookup} disabled={dnsRunning} aria-label="Perform DNS lookup">
                {dnsRunning ? (
                  <>
                    <Activity className="h-4 w-4 mr-2 animate-pulse" />
                    Looking up...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Lookup DNS
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {dnsResult && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>DNS Records for {dnsResult.hostname}</CardTitle>
                  <Badge variant="outline">{dnsResult.timestamp}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {dnsResult.addresses.length === 0 ? (
                  <div className="flex items-center gap-2 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      No DNS records found for this hostname
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dnsResult.addresses.map((address, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Globe className="h-4 w-4 text-primary" />
                          <span className="font-mono">{address}</span>
                        </div>
                        <Badge variant="secondary">
                          {address.includes(':') ? 'IPv6' : 'IPv4'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
