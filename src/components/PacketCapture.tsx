import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ScrollArea } from './ui/scroll-area';
import {
  Network,
  Play,
  Square,
  RefreshCw,
  AlertCircle,
  Download,
  Trash2,
  Plus,
  X,
  FileText,
  Wifi,
  Monitor,
  Router
} from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';
import {
  validateMacAddress,
  validateIPAddress,
  validateCaptureConfig,
  formatMacAddress,
  estimateCaptureFileSize
} from '../lib/packetCaptureValidation';

interface CaptureFile {
  id: string;
  filename: string;
  size: number;
  date: string;
  timestamp: number;
  status?: string;
}

interface ActiveCapture {
  id: string;
  location: string;
  direction: string;
  duration: number;
  startTime: number;
  filters?: string[];
  status: 'running' | 'stopping' | 'completed';
}

interface CaptureFilter {
  id: string;
  type: 'mac' | 'ip' | 'protocol';
  value: string;
}

interface AccessPoint {
  serialNumber: string;
  displayName?: string;
  name?: string;
  status?: string;
}

export function PacketCapture() {
  // Capture location settings
  const [captureLocation, setCaptureLocation] = useState<'appliance' | 'wired' | 'wireless'>('wireless');
  const [includeWiredClients, setIncludeWiredClients] = useState(false);
  const [selectedRadio, setSelectedRadio] = useState<string>('all');
  const [selectedAP, setSelectedAP] = useState<string>('all');

  // Direction settings
  const [direction, setDirection] = useState<'both' | 'ingress' | 'egress'>('both');

  // Capture settings
  const [duration, setDuration] = useState<number>(1);
  const [truncatePackets, setTruncatePackets] = useState<number>(0);

  // Filters
  const [filters, setFilters] = useState<CaptureFilter[]>([]);
  const [newFilterType, setNewFilterType] = useState<'mac' | 'ip'>('mac');
  const [newFilterValue, setNewFilterValue] = useState('');
  const [selectedProtocol, setSelectedProtocol] = useState<string>('all');

  // Packet Destination
  const [packetDestination, setPacketDestination] = useState<'file' | 'scp'>('file');
  const [scpIpAddress, setScpIpAddress] = useState('');
  const [scpUsername, setScpUsername] = useState('');
  const [scpPassword, setScpPassword] = useState('');
  const [scpDestinationPath, setScpDestinationPath] = useState('');

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [captureFiles, setCaptureFiles] = useState<CaptureFile[]>([]);
  const [activeCaptures, setActiveCaptures] = useState<ActiveCapture[]>([]);
  const [accessPoints, setAccessPoints] = useState<AccessPoint[]>([]);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [progressTick, setProgressTick] = useState(0); // Force re-render for progress bars

  // Protocol options
  const protocols = [
    { value: 'all', label: 'All' },
    { value: 'tcp', label: 'TCP' },
    { value: 'udp', label: 'UDP' },
    { value: 'icmp', label: 'ICMP' },
  ];

  // Radio options for wireless capture
  const radioOptions = [
    { value: 'all', label: 'All Radios' },
    { value: 'radio0', label: 'Radio 0 (2.4 GHz)' },
    { value: 'radio1', label: 'Radio 1 (5 GHz)' },
    { value: 'radio2', label: 'Radio 2 (6 GHz)' },
  ];

  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);

      try {
        // Load access points for wireless capture using the correct endpoint
        try {
          const apResponse = await apiService.makeAuthenticatedRequest('/v1/aps/query', {
            method: 'POST',
            body: JSON.stringify({})
          }, 10000);
          if (!cancelled && apResponse.ok) {
            const data = await apResponse.json();
            const apList = Array.isArray(data) ? data : (data.accessPoints || data.aps || []);
            console.log('[PacketCapture] Loaded APs:', apList.length);
            setAccessPoints(apList.map((ap: any) => ({
              serialNumber: ap.serialNumber || ap.serial || ap.id,
              displayName: ap.displayName || ap.name || ap.hostname,
              name: ap.name || ap.hostname,
              status: ap.status
            })));
          }
        } catch (apErr) {
          console.warn('[PacketCapture] Failed to load APs:', apErr);
        }

        if (cancelled) return;

        // Load capture files using new API method
        await loadCaptureFiles();

        if (cancelled) return;

        // Load active captures using new API method
        await loadActiveCaptures();

        // Start polling if there are active captures
        if (!cancelled) {
          const activeCount = await apiService.getActivePacketCaptures();
          if (activeCount.length > 0) {
            startStatusPolling();
          }
        }
      } catch (err) {
        console.error('[PacketCapture] Error loading data:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load packet capture data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Update progress bars every second for active captures
  useEffect(() => {
    if (activeCaptures.length > 0) {
      const progressInterval = setInterval(() => {
        setProgressTick(tick => tick + 1);
      }, 1000);

      return () => clearInterval(progressInterval);
    }
  }, [activeCaptures.length]);

  // Start polling for capture status updates
  const startStatusPolling = () => {
    // Clear any existing interval
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    // Poll every 3 seconds
    const interval = setInterval(async () => {
      await loadActiveCaptures();
      await loadCaptureFiles();
    }, 3000);

    setPollingInterval(interval);
  };

  // Stop polling
  const stopStatusPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  };

  // Load capture files using new API method
  const loadCaptureFiles = async () => {
    try {
      const files = await apiService.getPacketCaptureFiles();
      setCaptureFiles(files.map((f: any, idx: number) => ({
        id: f.id || `file-${idx}`,
        filename: f.filename || f.name || `capture-${idx}.pcap`,
        size: f.size || 0,
        date: f.date || f.created || new Date(f.timestamp || Date.now()).toISOString(),
        timestamp: f.timestamp || Date.now(),
        status: f.status
      })));
    } catch (err) {
      console.warn('[PacketCapture] Failed to load capture files:', err);
    }
  };

  // Load active captures using new API method
  const loadActiveCaptures = async () => {
    try {
      const captures = await apiService.getActivePacketCaptures();
      const mappedCaptures = captures.map((c: any, idx: number) => ({
        id: c.id || c.captureId || c.sessionId || `capture-${idx}`,
        location: c.location || c.captureType || c.interface || 'unknown',
        direction: c.direction || 'both',
        duration: c.duration || 0,
        startTime: c.startTime || c.start || Date.now(),
        filters: c.filters || [],
        status: (c.status || 'running') as ActiveCapture['status']
      }));

      setActiveCaptures(mappedCaptures);

      // Stop polling if no active captures
      if (mappedCaptures.length === 0 && pollingInterval) {
        stopStatusPolling();
      }
    } catch (err) {
      console.warn('[PacketCapture] Failed to load active captures:', err);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadCaptureFiles(), loadActiveCaptures()]);
      toast.success('Packet capture data refreshed');
    } catch (err) {
      toast.error('Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  const addFilter = () => {
    if (!newFilterValue.trim()) {
      toast.error('Please enter a filter value');
      return;
    }

    const trimmedValue = newFilterValue.trim();

    // Validate the filter value
    if (newFilterType === 'mac') {
      const validation = validateMacAddress(trimmedValue);
      if (!validation.valid) {
        toast.error(`Invalid MAC address: ${validation.error}`);
        return;
      }
    } else if (newFilterType === 'ip') {
      const validation = validateIPAddress(trimmedValue);
      if (!validation.valid) {
        toast.error(`Invalid IP address: ${validation.error}`);
        return;
      }
    }

    const newFilter: CaptureFilter = {
      id: `filter-${Date.now()}`,
      type: newFilterType,
      value: newFilterType === 'mac' ? formatMacAddress(trimmedValue) : trimmedValue
    };

    setFilters([...filters, newFilter]);
    setNewFilterValue('');
    toast.success('Filter added');
  };

  const removeFilter = (filterId: string) => {
    setFilters(filters.filter(f => f.id !== filterId));
  };

  const startCapture = async () => {
    // Comprehensive validation using validation utilities
    const configValidation = validateCaptureConfig({
      captureLocation,
      selectedAP,
      accessPointsAvailable: accessPoints.length,
      duration,
      truncatePackets,
      packetDestination,
      scpConfig: packetDestination === 'scp' ? {
        serverIp: scpIpAddress,
        username: scpUsername,
        password: scpPassword,
        path: scpDestinationPath
      } : undefined,
      filters
    });

    if (!configValidation.valid) {
      toast.error(configValidation.error || 'Invalid configuration');
      return;
    }

    // Show file size estimate
    const sizeEstimate = estimateCaptureFileSize({
      duration,
      truncatePackets
    });

    if (sizeEstimate.warning) {
      toast.warning(sizeEstimate.warning);
    } else if (sizeEstimate.estimatedSizeMB > 50) {
      toast.info(`Estimated file size: ~${sizeEstimate.estimatedSizeMB}MB`);
    }

    setStarting(true);

    try {
      // Build capture config using new API method types
      const captureType: 'DATA_PORT' | 'WIRED' | 'WIRELESS' =
        captureLocation === 'appliance' ? 'DATA_PORT' :
        captureLocation === 'wired' ? 'WIRED' : 'WIRELESS';

      const captureConfig: Parameters<typeof apiService.startPacketCapture>[0] = {
        captureType,
        duration,
        truncation: truncatePackets > 0 ? truncatePackets : undefined,
        destination: packetDestination.toUpperCase() as 'FILE' | 'SCP'
      };

      // Wireless-specific configuration
      if (captureLocation === 'wireless') {
        if (selectedAP !== 'all') {
          captureConfig.apSerialNumber = selectedAP;
        } else if (accessPoints.length > 0) {
          captureConfig.apSerialNumber = accessPoints[0].serialNumber;
          toast.info(`Using AP: ${accessPoints[0].displayName || accessPoints[0].serialNumber}`);
        }
        if (selectedRadio !== 'all') {
          captureConfig.radio = selectedRadio;
        }
      }

      // Wired-specific configuration
      if (captureLocation === 'wired') {
        captureConfig.includeWiredClients = includeWiredClients;
      }

      // Direction filter
      if (direction !== 'both') {
        captureConfig.direction = direction.toUpperCase() as 'INGRESS' | 'EGRESS';
      }

      // Protocol filter
      if (selectedProtocol !== 'all') {
        captureConfig.protocol = selectedProtocol.toUpperCase() as 'TCP' | 'UDP' | 'ICMP';
      }

      // Address filters
      const macFilters = filters.filter(f => f.type === 'mac');
      const ipFilters = filters.filter(f => f.type === 'ip');

      if (macFilters.length > 0) {
        captureConfig.macAddress = macFilters[0].value;
        if (macFilters.length > 1) {
          toast.info('Only first MAC filter will be applied');
        }
      }
      if (ipFilters.length > 0) {
        captureConfig.ipAddress = ipFilters[0].value;
        if (ipFilters.length > 1) {
          toast.info('Only first IP filter will be applied');
        }
      }

      // SCP configuration
      if (packetDestination === 'scp') {
        captureConfig.scpConfig = {
          serverIp: scpIpAddress,
          username: scpUsername,
          password: scpPassword,
          path: scpDestinationPath
        };
      }

      console.log('[PacketCapture] Starting capture with config:', captureConfig);

      // Use new API service method
      const result = await apiService.startPacketCapture(captureConfig);

      toast.success('Packet capture started successfully');

      // Add to active captures
      const newCapture: ActiveCapture = {
        id: result.id || `capture-${Date.now()}`,
        location: captureLocation,
        direction,
        duration: duration * 60,
        startTime: Date.now(),
        filters: filters.map(f => `${f.type}:${f.value}`),
        status: 'running'
      };
      setActiveCaptures([...activeCaptures, newCapture]);

      // Refresh capture list
      await loadActiveCaptures();

      // Start polling for status updates
      startStatusPolling();
    } catch (err) {
      console.error('[PacketCapture] Error starting capture:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to start capture';
      toast.error(errorMsg);
    } finally {
      setStarting(false);
    }
  };

  const stopCapture = async (captureId: string) => {
    try {
      // Update local state immediately
      setActiveCaptures(captures =>
        captures.map(c => c.id === captureId ? { ...c, status: 'stopping' as const } : c)
      );

      // Use new API service method
      await apiService.stopPacketCapture(captureId);

      toast.success('Capture stopped successfully');

      // Remove from active and refresh files
      setActiveCaptures(captures => captures.filter(c => c.id !== captureId));
      await loadCaptureFiles();

      // Stop polling if no more active captures
      if (activeCaptures.length <= 1) {
        stopStatusPolling();
      }
    } catch (err) {
      console.error('[PacketCapture] Error stopping capture:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to stop capture';
      toast.error(errorMsg);
      // Reset status on error
      setActiveCaptures(captures =>
        captures.map(c => c.id === captureId ? { ...c, status: 'running' as const } : c)
      );
    }
  };

  const stopAllCaptures = async () => {
    try {
      // Use new API service method with stopAll flag
      await apiService.stopPacketCapture(undefined, true);

      toast.success('All captures stopped successfully');
      setActiveCaptures([]);
      stopStatusPolling();
      await loadCaptureFiles();
    } catch (err) {
      console.error('[PacketCapture] Error stopping all captures:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to stop all captures';
      toast.error(errorMsg);
    }
  };

  const downloadFile = async (file: CaptureFile) => {
    try {
      toast.info('Preparing download...');

      // Use new API service method
      const blob = await apiService.downloadPacketCaptureFile(file.id, file.filename);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Download started');
    } catch (err) {
      console.error('[PacketCapture] Error downloading file:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to download file';
      toast.error(errorMsg);
    }
  };

  const deleteFile = async (file: CaptureFile) => {
    try {
      // Use new API service method
      await apiService.deletePacketCaptureFile(file.id, file.filename);

      setCaptureFiles(files => files.filter(f => f.id !== file.id));
      toast.success('File deleted successfully');
    } catch (err) {
      console.error('[PacketCapture] Error deleting file:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete file';
      toast.error(errorMsg);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string): string => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const getElapsedTime = (startTime: number): string => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="h-full min-h-0 overflow-y-auto">
        <div className="container mx-auto p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Network className="h-8 w-8" />
              Packet Capture
            </h1>
            <p className="text-muted-foreground mt-2">
              Capture and analyze network traffic for troubleshooting
            </p>
          </div>
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <Alert className="border-yellow-500">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Capture Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Capture Settings</CardTitle>
              <CardDescription>
                Configure packet capture location, direction, and duration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Capture Location */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">Capture Location</Label>

                <div className="space-y-3">
                  {/* Edge Service Data Ports */}
                  <div
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      captureLocation === 'appliance' ? 'border-primary bg-primary/5' : 'hover:bg-accent'
                    }`}
                    onClick={() => setCaptureLocation('appliance')}
                  >
                    <Router className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="font-medium">Edge Service Data Ports</div>
                      <div className="text-xs text-muted-foreground">Capture traffic on controller data ports</div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 ${
                      captureLocation === 'appliance' ? 'border-primary bg-primary' : 'border-muted-foreground'
                    }`} />
                  </div>

                  {/* Wired */}
                  <div
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      captureLocation === 'wired' ? 'border-primary bg-primary/5' : 'hover:bg-accent'
                    }`}
                    onClick={() => setCaptureLocation('wired')}
                  >
                    <div className="flex items-center gap-3">
                      <Monitor className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="font-medium">Wired</div>
                        <div className="text-xs text-muted-foreground">Capture wired network traffic</div>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        captureLocation === 'wired' ? 'border-primary bg-primary' : 'border-muted-foreground'
                      }`} />
                    </div>
                    {captureLocation === 'wired' && (
                      <div className="mt-3 ml-8 flex items-center gap-2">
                        <Checkbox
                          id="includeWiredClients"
                          checked={includeWiredClients}
                          onCheckedChange={(checked) => setIncludeWiredClients(checked === true)}
                        />
                        <Label htmlFor="includeWiredClients" className="text-sm cursor-pointer">
                          Include Wired Clients
                        </Label>
                      </div>
                    )}
                  </div>

                  {/* Wireless */}
                  <div
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      captureLocation === 'wireless' ? 'border-primary bg-primary/5' : 'hover:bg-accent'
                    }`}
                    onClick={() => setCaptureLocation('wireless')}
                  >
                    <div className="flex items-center gap-3">
                      <Wifi className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="font-medium">Wireless</div>
                        <div className="text-xs text-muted-foreground">Capture wireless traffic from access points</div>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        captureLocation === 'wireless' ? 'border-primary bg-primary' : 'border-muted-foreground'
                      }`} />
                    </div>
                    {captureLocation === 'wireless' && (
                      <div className="mt-3 ml-8 space-y-3">
                        <div className="flex items-center gap-3">
                          <Label className="text-sm w-24">Access Point</Label>
                          <Select value={selectedAP} onValueChange={setSelectedAP}>
                            <SelectTrigger className="flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Access Points</SelectItem>
                              {accessPoints.map((ap) => (
                                <SelectItem key={ap.serialNumber} value={ap.serialNumber}>
                                  {ap.displayName || ap.name || ap.serialNumber}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-3">
                          <Label className="text-sm w-24">Radio</Label>
                          <Select value={selectedRadio} onValueChange={setSelectedRadio}>
                            <SelectTrigger className="flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {radioOptions.map((radio) => (
                                <SelectItem key={radio.value} value={radio.value}>
                                  {radio.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Direction */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Direction</Label>
                <Select value={direction} onValueChange={(v) => setDirection(v as typeof direction)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Both (Ingress & Egress)</SelectItem>
                    <SelectItem value="ingress">Ingress Only</SelectItem>
                    <SelectItem value="egress">Egress Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Duration & Truncate */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Duration (minutes)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Truncate Packets (bytes)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={65535}
                    value={truncatePackets}
                    onChange={(e) => setTruncatePackets(parseInt(e.target.value) || 0)}
                    placeholder="0 = Full packet"
                  />
                </div>
              </div>

              {/* Start Button */}
              <Button
                onClick={startCapture}
                disabled={starting || activeCaptures.some(c => c.status === 'running')}
                className="w-full"
                size="lg"
              >
                <Play className="h-4 w-4 mr-2" />
                {starting ? 'Starting...' : 'Start Capture'}
              </Button>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Capture Filters</CardTitle>
              <CardDescription>
                Filter captured traffic by protocol, destination, or address
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Protocol Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Protocol</Label>
                <Select value={selectedProtocol} onValueChange={setSelectedProtocol}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any protocol" />
                  </SelectTrigger>
                  <SelectContent>
                    {protocols.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Packet Destination */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Packet Destination</Label>
                <Select value={packetDestination} onValueChange={(v) => setPacketDestination(v as 'file' | 'scp')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="file">File</SelectItem>
                    <SelectItem value="scp">SCP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* SCP Server Credentials */}
              {packetDestination === 'scp' && (
                <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                  <Label className="text-sm font-medium">SCP Server Credentials</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">IP Address</Label>
                      <Input
                        placeholder="192.168.1.100"
                        value={scpIpAddress}
                        onChange={(e) => setScpIpAddress(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Username</Label>
                      <Input
                        placeholder="admin"
                        value={scpUsername}
                        onChange={(e) => setScpUsername(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Password</Label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={scpPassword}
                        onChange={(e) => setScpPassword(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Destination Path</Label>
                      <Input
                        placeholder="/home/user/captures"
                        value={scpDestinationPath}
                        onChange={(e) => setScpDestinationPath(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* MAC/IP Filters */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Address Filters</Label>
                <div className="flex gap-2">
                  <Select value={newFilterType} onValueChange={(v) => setNewFilterType(v as typeof newFilterType)}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mac">MAC</SelectItem>
                      <SelectItem value="ip">IP</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder={newFilterType === 'mac' ? 'AA:BB:CC:DD:EE:FF' : '192.168.1.100'}
                    value={newFilterValue}
                    onChange={(e) => setNewFilterValue(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && addFilter()}
                  />
                  <Button onClick={addFilter} size="icon" variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Active Filters */}
              {filters.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Active Filters</Label>
                  <div className="flex flex-wrap gap-2">
                    {filters.map((filter) => (
                      <Badge key={filter.id} variant="secondary" className="flex items-center gap-1">
                        <span className="text-xs font-medium uppercase">{filter.type}:</span>
                        <span>{filter.value}</span>
                        <X
                          className="h-3 w-3 ml-1 cursor-pointer hover:text-destructive"
                          onClick={() => removeFilter(filter.id)}
                        />
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Filter Help */}
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Filters help narrow down captured traffic. Leave fields empty to capture all traffic matching the location and direction settings.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>

        {/* Packet Capture Instances */}
        {activeCaptures.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Packet Capture Instances
                  </CardTitle>
                  <CardDescription>
                    Currently running packet captures
                  </CardDescription>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={stopAllCaptures}
                  className="bg-primary"
                >
                  Stop All Captures
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>ID / Location</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Filters</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeCaptures.map((capture) => {
                    const elapsed = Math.floor((Date.now() - capture.startTime) / 1000);
                    const remaining = Math.max(0, capture.duration - elapsed);
                    const progress = Math.min(100, (elapsed / capture.duration) * 100);
                    const elapsedMin = Math.floor(elapsed / 60);
                    const elapsedSec = elapsed % 60;
                    const remainingMin = Math.floor(remaining / 60);
                    const remainingSec = remaining % 60;

                    return (
                      <TableRow key={capture.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full animate-pulse ${
                              capture.status === 'running' ? 'bg-green-500' :
                              capture.status === 'stopping' ? 'bg-yellow-500' :
                              'bg-gray-400'
                            }`} />
                            <Badge variant={
                              capture.status === 'running' ? 'default' :
                              capture.status === 'stopping' ? 'secondary' :
                              'outline'
                            } className="text-xs">
                              {capture.status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium text-sm">{capture.id}</div>
                            <div className="text-xs text-muted-foreground capitalize">
                              {capture.location} • {capture.direction}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1.5 min-w-[140px]">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                {elapsedMin}:{elapsedSec.toString().padStart(2, '0')} elapsed
                              </span>
                              <span className="text-muted-foreground">
                                {remainingMin}:{remainingSec.toString().padStart(2, '0')} left
                              </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-primary h-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {capture.filters && capture.filters.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {capture.filters.map((filter, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs font-mono">
                                  {filter}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No filters</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {capture.status === 'running' ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => stopCapture(capture.id)}
                              disabled={capture.status === 'stopping'}
                            >
                              <Square className="h-3 w-3 mr-1.5" />
                              Stop
                            </Button>
                          ) : capture.status === 'stopping' ? (
                            <Badge variant="secondary" className="text-xs">Stopping...</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Completed</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Capture Files */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Download Capture
            </CardTitle>
          </CardHeader>
          <CardContent>
            {captureFiles.length > 0 ? (
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Actions</TableHead>
                      <TableHead>Filename</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {captureFiles.map((file) => (
                      <TableRow key={file.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                              onClick={() => downloadFile(file)}
                              title="Download PCAP file"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => deleteFile(file)}
                              title="Delete capture file"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium font-mono text-sm">{file.filename}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {formatFileSize(file.size)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{formatDate(file.date)}</div>
                        </TableCell>
                        <TableCell>
                          {file.status ? (
                            <Badge variant="secondary" className="text-xs">
                              {file.status}
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-xs bg-green-500">
                              Ready
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No capture files available</p>
                <p className="text-sm mt-1">Start a packet capture to generate files</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
