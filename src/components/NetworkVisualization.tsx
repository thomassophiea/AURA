import { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/api';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Loader2, Wifi, Users, MapPin, ZoomIn, ZoomOut, Maximize2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface NetworkNode {
  id: string;
  type: 'site' | 'ap' | 'client';
  label: string;
  x: number;
  y: number;
  parent?: string;
  data?: any;
  rx?: number; // Receive rate
  tx?: number; // Transmit rate
}

interface NetworkLink {
  source: string;
  target: string;
  rx: number; // Download speed
  tx: number; // Upload speed
}

export function NetworkVisualization() {
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [links, setLinks] = useState<NetworkLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSites, setLoadingSites] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagnosticResults, setDiagnosticResults] = useState<any>(null);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    fetchSites();
  }, []);

  useEffect(() => {
    if (selectedSiteId) {
      fetchNetworkTopology(selectedSiteId);
    }
  }, [selectedSiteId]);

  const runDiagnostics = async () => {
    setRunningDiagnostics(true);
    const results: any = {
      timestamp: new Date().toISOString(),
      tests: []
    };

    // Test 1: Check if we have auth token
    results.tests.push({
      name: 'Authentication Token',
      status: apiService.isAuthenticated() ? 'pass' : 'fail',
      message: apiService.isAuthenticated() ? 'Valid token found' : 'No authentication token'
    });

    // Test 2: Try /v1/globalsettings (usually works if API is reachable)
    try {
      const globalResponse = await apiService.makeAuthenticatedRequest('/v1/globalsettings', {
        method: 'GET'
      }, 5000);
      
      results.tests.push({
        name: 'Global Settings Endpoint',
        status: globalResponse.ok ? 'pass' : 'fail',
        message: globalResponse.ok ? `Success (${globalResponse.status})` : `Failed (${globalResponse.status})`
      });
    } catch (error) {
      results.tests.push({
        name: 'Global Settings Endpoint',
        status: 'fail',
        message: error instanceof Error ? error.message : 'Network error'
      });
    }

    // Test 3: Try /v3/sites endpoint (the correct one)
    try {
      const sitesResponse = await apiService.makeAuthenticatedRequest('/v3/sites', {
        method: 'GET'
      }, 5000);
      
      if (sitesResponse.ok) {
        const data = await sitesResponse.json();
        // Handle various response formats
        let sitesData: any[] = [];
        if (Array.isArray(data)) {
          sitesData = data;
        } else if (data && Array.isArray(data.sites)) {
          sitesData = data.sites;
        } else if (data && Array.isArray(data.data)) {
          sitesData = data.data;
        }
        
        results.tests.push({
          name: 'Sites Endpoint (/v3/sites)',
          status: 'pass',
          message: `Success - Found ${sitesData.length} site(s)`,
          data: sitesData
        });
      } else {
        results.tests.push({
          name: 'Sites Endpoint (/v3/sites)',
          status: 'fail',
          message: `HTTP ${sitesResponse.status}: ${sitesResponse.statusText}`
        });
      }
    } catch (error) {
      results.tests.push({
        name: 'Sites Endpoint (/v3/sites)',
        status: 'fail',
        message: error instanceof Error ? error.message : 'Network error'
      });
    }

    // Test 4: Try /v1/aps endpoint
    try {
      const apsResponse = await apiService.makeAuthenticatedRequest('/v1/aps', {
        method: 'GET'
      }, 5000);
      
      results.tests.push({
        name: 'Access Points Endpoint',
        status: apsResponse.ok ? 'pass' : 'fail',
        message: apsResponse.ok ? `Success (${apsResponse.status})` : `Failed (${apsResponse.status})`
      });
    } catch (error) {
      results.tests.push({
        name: 'Access Points Endpoint',
        status: 'fail',
        message: error instanceof Error ? error.message : 'Network error'
      });
    }

    setDiagnosticResults(results);
    setRunningDiagnostics(false);
    
    console.log('[NetworkVisualization] Diagnostic results:', results);
  };

  const fetchSites = async () => {
    setLoadingSites(true);
    setError(null);
    
    try {
      console.log('[NetworkVisualization] Fetching sites from /v3/sites');
      
      const response = await apiService.makeAuthenticatedRequest('/v3/sites', {
        method: 'GET'
      }, 10000); // 10 second timeout

      console.log('[NetworkVisualization] Sites API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('[NetworkVisualization] Sites API response data:', data);
        
        // Handle various API response formats (same as ConfigureSites)
        let sitesData: any[] = [];
        if (Array.isArray(data)) {
          sitesData = data;
        } else if (data && Array.isArray(data.sites)) {
          sitesData = data.sites;
        } else if (data && Array.isArray(data.data)) {
          sitesData = data.data;
        } else {
          console.warn('[NetworkVisualization] Unexpected sites data format:', data);
          sitesData = [];
        }
        
        console.log('[NetworkVisualization] Parsed sites data:', sitesData);
        
        setSites(sitesData);
        
        // Auto-select first site
        if (sitesData.length > 0 && !selectedSiteId) {
          console.log('[NetworkVisualization] Auto-selecting first site:', sitesData[0].id, sitesData[0].name);
          setSelectedSiteId(sitesData[0].id);
        } else if (sitesData.length === 0) {
          console.log('[NetworkVisualization] No sites found in response');
        }
      } else {
        const errorText = await response.text();
        console.error('[NetworkVisualization] Sites API error:', response.status, errorText);
        setError(`Failed to load sites: ${response.status} ${response.statusText}`);
        toast.error('Failed to load sites', {
          description: `API returned ${response.status}: ${response.statusText}`
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[NetworkVisualization] Exception while fetching sites:', errorMessage, error);
      
      setError(errorMessage);
      
      // Only show toast if it's not a timeout (those are already handled globally)
      if (!errorMessage.includes('timed out') && !errorMessage.includes('SUPPRESSED')) {
        toast.error('Failed to load sites', {
          description: errorMessage
        });
      }
    } finally {
      setLoadingSites(false);
    }
  };

  const fetchNetworkTopology = async (siteId: string) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('[NetworkVisualization] Fetching topology for site:', siteId);
      
      // Fetch APs for the site
      const apsResponse = await apiService.makeAuthenticatedRequest(
        `/v1/aps?siteId=${siteId}`,
        { method: 'GET' },
        10000 // 10 second timeout
      );

      let apsData: any[] = [];
      if (apsResponse.ok) {
        const data = await apsResponse.json();
        apsData = data.data || data || [];
        console.log('[NetworkVisualization] Found', apsData.length, 'access points');
      } else {
        console.warn('[NetworkVisualization] Failed to fetch APs:', apsResponse.status);
      }

      // Fetch clients for the site
      const clientsResponse = await apiService.makeAuthenticatedRequest(
        `/v1/stations?siteId=${siteId}`,
        { method: 'GET' },
        10000 // 10 second timeout
      );

      let clientsData: any[] = [];
      if (clientsResponse.ok) {
        const data = await clientsResponse.json();
        clientsData = Array.isArray(data) ? data : (data.stations || data.clients || data.data || []);
        console.log('[NetworkVisualization] Found', clientsData.length, 'clients');
      } else {
        console.warn('[NetworkVisualization] Failed to fetch clients:', clientsResponse.status);
      }

      // Build network topology
      buildTopology(siteId, apsData, clientsData);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[NetworkVisualization] Exception while fetching topology:', errorMessage);
      
      // Don't show errors for timeouts or suppressed errors
      if (!errorMessage.includes('timed out') && !errorMessage.includes('SUPPRESSED')) {
        setError(`Failed to load network topology: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const buildTopology = (siteId: string, aps: any[], clients: any[]) => {
    const newNodes: NetworkNode[] = [];
    const newLinks: NetworkLink[] = [];

    // Find site name - handle both v1 and v3 API formats
    const site = sites.find(s => s.id === siteId);
    const siteName = site?.name || site?.siteName || 'Site';

    // Add site node at the center
    const centerX = 500;
    const centerY = 300;
    
    newNodes.push({
      id: `site-${siteId}`,
      type: 'site',
      label: siteName,
      x: centerX,
      y: centerY,
      data: site
    });

    // Position APs in a circle around the site
    const apRadius = 250;
    const apCount = aps.length || 1;
    
    aps.forEach((ap, index) => {
      const angle = (2 * Math.PI * index) / apCount;
      const apX = centerX + apRadius * Math.cos(angle);
      const apY = centerY + apRadius * Math.sin(angle);
      
      const apId = `ap-${ap.serialNumber || ap.id}`;
      
      newNodes.push({
        id: apId,
        type: 'ap',
        label: ap.displayName || ap.name || ap.serialNumber || 'Unknown AP',
        x: apX,
        y: apY,
        parent: `site-${siteId}`,
        data: ap
      });

      // Add link from site to AP
      newLinks.push({
        source: `site-${siteId}`,
        target: apId,
        rx: ap.rxBytes || 0,
        tx: ap.txBytes || 0
      });

      // Find clients connected to this AP
      const apClients = clients.filter(
        c => c.apMac === ap.macAddress || c.apSerialNumber === ap.serialNumber
      );

      // Position clients around each AP
      const clientRadius = 120;
      const clientCount = apClients.length;
      
      apClients.forEach((client, clientIndex) => {
        const clientAngle = (2 * Math.PI * clientIndex) / (clientCount || 1);
        const clientX = apX + clientRadius * Math.cos(clientAngle);
        const clientY = apY + clientRadius * Math.sin(clientAngle);
        
        const clientId = `client-${client.macAddress || client.id}`;
        
        newNodes.push({
          id: clientId,
          type: 'client',
          label: client.hostName || client.userName || client.macAddress || 'Unknown Client',
          x: clientX,
          y: clientY,
          parent: apId,
          data: client,
          rx: client.rxBytes || 0,
          tx: client.txBytes || 0
        });

        // Add link from AP to client
        newLinks.push({
          source: apId,
          target: clientId,
          rx: client.rxBytes || 0,
          tx: client.txBytes || 0
        });
      });
    });

    setNodes(newNodes);
    setLinks(newLinks);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 bps';
    const k = 1024;
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.1, Math.min(3, prev * delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // Left click only
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const getNodeColor = (type: string): string => {
    switch (type) {
      case 'site':
        return '#03DAC5'; // Secondary teal
      case 'ap':
        return '#BB86FC'; // Primary violet
      case 'client':
        return '#81C784'; // Success green
      default:
        return '#666';
    }
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'site':
        return <MapPin className="h-6 w-6" />;
      case 'ap':
        return <Wifi className="h-5 w-5" />;
      case 'client':
        return <Users className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getNodeSize = (type: string): number => {
    switch (type) {
      case 'site':
        return 24;
      case 'ap':
        return 18;
      case 'client':
        return 14;
      default:
        return 12;
    }
  };

  return (
    <div className="space-y-4">
      {/* Connection Error Banner */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-destructive mb-1">Network Connection Failed</p>
              <p className="text-xs text-muted-foreground mb-3">
                Unable to reach the controller API. This page requires connectivity to display network topology.
              </p>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={runDiagnostics}
                  disabled={runningDiagnostics}
                  className="h-7 text-xs"
                >
                  {runningDiagnostics ? 'Testing...' : 'Run Diagnostics'}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={fetchSites}
                  className="h-7 text-xs"
                >
                  Retry
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Header */}
      <Card className="surface-2dp p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-foreground mb-1">Network Topology Visualization</h3>
            <p className="text-muted-foreground text-sm">
              Visual representation of Sites, Access Points, and Connected Clients
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {error && (
              <div className="flex items-center gap-2 px-3 py-1 bg-destructive/10 border border-destructive/20 rounded-md">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="text-xs text-destructive">Connection Error</span>
              </div>
            )}
            {!error && sites.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Site:</label>
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select a site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name || site.siteName || site.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Topology Canvas */}
      <Card className="surface-2dp p-4">
        {loadingSites ? (
          <div className="flex flex-col items-center justify-center h-[600px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">Loading sites...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-[600px] text-muted-foreground max-w-3xl mx-auto px-4">
            <MapPin className="h-12 w-12 mb-4 opacity-50 text-destructive" />
            <p className="text-lg mb-2 text-destructive">Cannot Connect to the Controller</p>
            <p className="text-sm mb-4 text-center">{error}</p>
            
            {/* Diagnostic Results */}
            {diagnosticResults && (
              <div className="bg-background/50 border border-border rounded-lg p-4 mb-4 w-full">
                <p className="text-sm mb-3 text-foreground flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Diagnostic Results
                </p>
                <div className="space-y-2">
                  {diagnosticResults.tests.map((test: any, index: number) => (
                    <div key={index} className="flex items-start gap-2 text-xs">
                      <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                        test.status === 'pass' ? 'bg-success' : 'bg-destructive'
                      }`} />
                      <div className="flex-1">
                        <p className="text-foreground">{test.name}</p>
                        <p className="text-muted-foreground">{test.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Tested at: {new Date(diagnosticResults.timestamp).toLocaleTimeString()}
                </p>
              </div>
            )}
            
            {/* Connection details */}
            <div className="bg-background/50 border border-border rounded-lg p-4 mb-4 w-full">
              <p className="text-sm mb-2 text-foreground">Connection details:</p>
              <div className="text-xs space-y-1 text-muted-foreground mb-3">
                <p><span className="text-foreground">URL:</span> <span className="font-mono text-primary">https://tsophiea.ddns.net:443/management/v3/sites</span></p>
                <p><span className="text-foreground">Method:</span> GET</p>
                <p><span className="text-foreground">Timeout:</span> 10 seconds</p>
              </div>
              
              <p className="text-sm mb-2 text-foreground">Common causes:</p>
              <ul className="text-xs space-y-1 list-disc list-inside text-muted-foreground">
                <li>The controller service is not running or crashed</li>
                <li>NGINX proxy is misconfigured or not forwarding <span className="font-mono text-primary">/management</span> requests</li>
                <li>Firewall blocking port 443 or the /management path</li>
                <li>Network connectivity issue between your browser and tsophiea.ddns.net</li>
                <li>SSL certificate issues (check browser console for certificate errors)</li>
                <li>The /v1/sites API endpoint doesn't exist in your controller version</li>
              </ul>
            </div>
            
            <div className="flex flex-wrap gap-2 justify-center">
              <Button 
                variant="default" 
                onClick={runDiagnostics}
                disabled={runningDiagnostics}
              >
                {runningDiagnostics ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Running Diagnostics...
                  </>
                ) : (
                  'Run Connection Diagnostics'
                )}
              </Button>
              <Button variant="outline" onClick={fetchSites}>
                Retry Sites
              </Button>
              <Button variant="secondary" onClick={() => window.location.href = '/#/access-points'}>
                Try Access Points Page
              </Button>
            </div>
          </div>
        ) : sites.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[600px] text-muted-foreground">
            <MapPin className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg mb-2">No Sites Available</p>
            <p className="text-sm mb-4">Configure sites in the Configure → Sites menu to view network topology</p>
            <Button variant="outline" onClick={fetchSites}>
              Refresh
            </Button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center h-[600px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">Loading network topology...</p>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[600px] text-muted-foreground">
            <Wifi className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg mb-2">No Network Devices Found</p>
            <p className="text-sm">Add access points to this site to view network topology</p>
          </div>
        ) : (
          <div className="relative">
            {/* Controls */}
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setZoom(prev => Math.min(3, prev * 1.2))}
                title="Zoom In"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setZoom(prev => Math.max(0.1, prev * 0.8))}
                title="Zoom Out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={resetView}
                title="Reset View"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Legend */}
            <div className="absolute top-4 left-4 z-10 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#03DAC5' }} />
                <span className="text-xs text-foreground">Site</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#BB86FC' }} />
                <span className="text-xs text-foreground">Access Point</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#81C784' }} />
                <span className="text-xs text-foreground">Client</span>
              </div>
            </div>

            {/* SVG Canvas */}
            <svg
              ref={svgRef}
              className="w-full h-[600px] bg-background/50 border border-border rounded cursor-move"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* Links */}
                {links.map((link, index) => {
                  const sourceNode = nodes.find(n => n.id === link.source);
                  const targetNode = nodes.find(n => n.id === link.target);
                  
                  if (!sourceNode || !targetNode) return null;

                  // Calculate midpoint for label
                  const midX = (sourceNode.x + targetNode.x) / 2;
                  const midY = (sourceNode.y + targetNode.y) / 2;

                  return (
                    <g key={`link-${index}`}>
                      {/* Connection line with gradient */}
                      <line
                        x1={sourceNode.x}
                        y1={sourceNode.y}
                        x2={targetNode.x}
                        y2={targetNode.y}
                        stroke="rgba(187, 134, 252, 0.3)"
                        strokeWidth="2"
                        strokeDasharray="5,5"
                      />
                      
                      {/* Traffic stats label */}
                      {(link.rx > 0 || link.tx > 0) && (
                        <g>
                          <rect
                            x={midX - 45}
                            y={midY - 18}
                            width="90"
                            height="36"
                            fill="rgba(18, 18, 18, 0.9)"
                            stroke="rgba(187, 134, 252, 0.5)"
                            strokeWidth="1"
                            rx="4"
                          />
                          <text
                            x={midX}
                            y={midY - 4}
                            textAnchor="middle"
                            fill="#03DAC5"
                            fontSize="10"
                            fontFamily="Roboto Mono, monospace"
                          >
                            ↓ {formatBytes(link.rx)}
                          </text>
                          <text
                            x={midX}
                            y={midY + 10}
                            textAnchor="middle"
                            fill="#BB86FC"
                            fontSize="10"
                            fontFamily="Roboto Mono, monospace"
                          >
                            ↑ {formatBytes(link.tx)}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Nodes */}
                {nodes.map((node) => {
                  const size = getNodeSize(node.type);
                  const color = getNodeColor(node.type);

                  return (
                    <g key={node.id}>
                      {/* Node circle with glow effect */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={size + 4}
                        fill={`${color}20`}
                        stroke="none"
                      />
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={size}
                        fill={color}
                        stroke={node.type === 'site' ? '#fff' : color}
                        strokeWidth={node.type === 'site' ? '3' : '2'}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                      />
                      
                      {/* Node label */}
                      <text
                        x={node.x}
                        y={node.y + size + 18}
                        textAnchor="middle"
                        fill="rgba(255, 255, 255, 0.87)"
                        fontSize={node.type === 'site' ? '14' : node.type === 'ap' ? '12' : '10'}
                        fontFamily="Roboto, sans-serif"
                        fontWeight={node.type === 'site' ? '500' : '400'}
                      >
                        {node.label.length > 20 
                          ? `${node.label.substring(0, 17)}...` 
                          : node.label}
                      </text>

                      {/* Show traffic stats for clients */}
                      {node.type === 'client' && (node.rx || node.tx) && (
                        <text
                          x={node.x}
                          y={node.y + size + 30}
                          textAnchor="middle"
                          fill="rgba(255, 255, 255, 0.6)"
                          fontSize="9"
                          fontFamily="Roboto Mono, monospace"
                        >
                          ↓{formatBytes(node.rx || 0)} ↑{formatBytes(node.tx || 0)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Stats */}
            <div className="mt-4 flex items-center justify-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>1 Site</span>
              </div>
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4" />
                <span>{nodes.filter(n => n.type === 'ap').length} Access Points</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>{nodes.filter(n => n.type === 'client').length} Connected Clients</span>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}