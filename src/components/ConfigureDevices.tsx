import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Wifi, 
  Activity, 
  MapPin, 
  Settings, 
  RefreshCw, 
  Filter,
  Download,
  Upload,
  Power,
  AlertTriangle,
  CheckCircle,
  Clock,
  Server,
  Smartphone,
  Router,
  Monitor
} from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface Device {
  id?: string;
  serialNumber?: string;
  macAddress?: string;
  deviceName?: string;
  deviceType?: string;
  model?: string;
  firmwareVersion?: string;
  status?: string;
  operationalStatus?: string;
  adminStatus?: string;
  siteId?: string;
  siteName?: string;
  location?: string;
  ipAddress?: string;
  lastSeen?: string;
  uptime?: number;
  cpuUtilization?: number;
  memoryUtilization?: number;
  temperature?: number;
  powerStatus?: string;
  configurationStatus?: string;
  managementVlan?: number;
  description?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

interface Site {
  id: string;
  siteName: string;
  canDelete?: boolean;
  canEdit?: boolean;
  country?: string;
  distributed?: boolean;
  [key: string]: any;
}

interface DeviceFormData {
  deviceName: string;
  deviceType: string;
  siteId: string;
  location: string;
  description: string;
  managementVlan: string;
  adminStatus: string;
}

interface ConfigureDevicesProps {
  onShowDetail?: (deviceId: string, deviceName: string) => void;
}

export function ConfigureDevices({ onShowDetail }: ConfigureDevicesProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [availableDeviceTypes, setAvailableDeviceTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [siteFilter, setSiteFilter] = useState('all');
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null);
  const [formData, setFormData] = useState<DeviceFormData>({
    deviceName: '',
    deviceType: '',
    siteId: '',
    location: '',
    description: '',
    managementVlan: '',
    adminStatus: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch devices from API
  const fetchDevices = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const response = await apiService.makeAuthenticatedRequest('/v3/devices', {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch devices: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Ensure we have an array and handle various API response formats
      let deviceList: Device[] = [];
      if (Array.isArray(data)) {
        deviceList = data;
      } else if (data && Array.isArray(data.devices)) {
        deviceList = data.devices;
      } else if (data && Array.isArray(data.data)) {
        deviceList = data.data;
      } else if (data && typeof data === 'object') {
        // If it's a single device object, wrap it in an array
        deviceList = [data];
      }

      setDevices(deviceList);
      
      if (deviceList.length === 0) {
        toast.info('No devices found', {
          description: 'No devices are currently configured in the system.'
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(errorMessage);
      
      if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
        toast.error('Request timed out', {
          description: 'The Campus Controller is taking too long to respond. Please try again.',
          duration: 8000,
          action: {
            label: 'Retry',
            onClick: () => fetchDevices(showLoader)
          }
        });
      } else {
        toast.error('Failed to load devices', {
          description: errorMessage,
          duration: 5000,
          action: {
            label: 'Retry',
            onClick: () => fetchDevices(showLoader)
          }
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch sites for dropdown
  const fetchSites = useCallback(async () => {
    try {
      const response = await apiService.makeAuthenticatedRequest('/v3/sites', {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch sites: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Handle various API response formats
      let siteList: Site[] = [];
      if (Array.isArray(data)) {
        siteList = data;
      } else if (data && Array.isArray(data.sites)) {
        siteList = data.sites;
      } else if (data && Array.isArray(data.data)) {
        siteList = data.data;
      }

      setSites(siteList);
    } catch (error) {
      console.error('Failed to fetch sites:', error);
    }
  }, []);

  const fetchDeviceTypes = useCallback(async () => {
    try {
      const types = await apiService.getDeviceTypes();
      setAvailableDeviceTypes(types);
    } catch (error) {
      console.error('Failed to fetch device types:', error);
      // Set default types if API fails
      setAvailableDeviceTypes([
        'Access Point',
        'Switch',
        'Router',
        'Gateway',
        'Controller'
      ]);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    fetchSites();
    fetchDeviceTypes();
  }, [fetchDevices, fetchSites, fetchDeviceTypes]);

  // Get device status badge variant
  const getStatusBadgeVariant = (status?: string) => {
    if (!status) return 'secondary';
    
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus.includes('online') || normalizedStatus === 'up' || normalizedStatus === 'active') {
      return 'default';
    } else if (normalizedStatus.includes('offline') || normalizedStatus === 'down' || normalizedStatus === 'inactive') {
      return 'destructive';
    } else if (normalizedStatus.includes('warning') || normalizedStatus === 'degraded') {
      return 'outline';
    }
    return 'secondary';
  };

  // Get device type icon
  const getDeviceTypeIcon = (type?: string) => {
    if (!type) return <Server className="h-4 w-4" />;
    
    const normalizedType = type.toLowerCase();
    if (normalizedType.includes('access') || normalizedType.includes('ap')) {
      return <Wifi className="h-4 w-4" />;
    } else if (normalizedType.includes('switch')) {
      return <Router className="h-4 w-4" />;
    } else if (normalizedType.includes('controller')) {
      return <Monitor className="h-4 w-4" />;
    } else if (normalizedType.includes('mobile') || normalizedType.includes('phone')) {
      return <Smartphone className="h-4 w-4" />;
    }
    return <Server className="h-4 w-4" />;
  };

  // Filter devices based on search and filters
  const filteredDevices = devices.filter(device => {
    const matchesSearch = !searchQuery || 
      (device.deviceName && device.deviceName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (device.serialNumber && device.serialNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (device.macAddress && device.macAddress.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (device.ipAddress && device.ipAddress.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || 
      (device.status && device.status.toLowerCase() === statusFilter.toLowerCase()) ||
      (device.operationalStatus && device.operationalStatus.toLowerCase() === statusFilter.toLowerCase());
    
    const matchesType = typeFilter === 'all' || 
      (device.deviceType && device.deviceType.toLowerCase().includes(typeFilter.toLowerCase()));
    
    const matchesSite = siteFilter === 'all' || 
      (device.siteId && device.siteId === siteFilter) ||
      (device.siteName && device.siteName === siteFilter);
    
    return matchesSearch && matchesStatus && matchesType && matchesSite;
  });

  // Use available device types from API, plus any types from existing devices
  const deviceTypesFromDevices = Array.from(new Set(devices.map(device => device.deviceType).filter(Boolean)));
  const deviceTypes = availableDeviceTypes.length > 0
    ? Array.from(new Set([...availableDeviceTypes, ...deviceTypesFromDevices]))
    : deviceTypesFromDevices;
  
  // Get unique statuses for filter
  const deviceStatuses = Array.from(new Set(devices.map(device => device.status || device.operationalStatus).filter(Boolean)));

  // Handle form submission for create/edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setSubmitProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      const endpoint = editingDevice ? `/v3/devices/${editingDevice.id || editingDevice.serialNumber}` : '/v3/devices';
      const method = editingDevice ? 'PUT' : 'POST';

      const deviceData = {
        deviceName: formData.deviceName,
        deviceType: formData.deviceType,
        siteId: formData.siteId,
        location: formData.location,
        description: formData.description,
        managementVlan: formData.managementVlan ? parseInt(formData.managementVlan) : undefined,
        adminStatus: formData.adminStatus
      };

      const response = await apiService.makeAuthenticatedRequest(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(deviceData)
      });

      clearInterval(progressInterval);
      setSubmitProgress(100);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `${method === 'POST' ? 'Create' : 'Update'} failed: ${response.status} ${response.statusText}`);
      }

      toast.success(`Device ${editingDevice ? 'updated' : 'created'} successfully`, {
        description: `${formData.deviceName} has been ${editingDevice ? 'updated' : 'created'}.`
      });

      // Reset form and close dialog
      setFormData({
        deviceName: '',
        deviceType: '',
        siteId: '',
        location: '',
        description: '',
        managementVlan: '',
        adminStatus: ''
      });
      setIsCreateDialogOpen(false);
      setIsEditDialogOpen(false);
      setEditingDevice(null);

      // Refresh devices list
      fetchDevices(false);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to ${editingDevice ? 'update' : 'create'} device`, {
        description: errorMessage,
        duration: 5000
      });
    } finally {
      setIsSubmitting(false);
      setSubmitProgress(0);
    }
  };

  // Handle device deletion
  const handleDelete = async () => {
    if (!deviceToDelete) return;

    setIsSubmitting(true);

    try {
      const response = await apiService.makeAuthenticatedRequest(`/v3/devices/${deviceToDelete.id || deviceToDelete.serialNumber}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Delete failed: ${response.status} ${response.statusText}`);
      }

      toast.success('Device deleted successfully', {
        description: `${deviceToDelete.deviceName || deviceToDelete.serialNumber} has been deleted.`
      });

      setIsDeleteDialogOpen(false);
      setDeviceToDelete(null);
      fetchDevices(false);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error('Failed to delete device', {
        description: errorMessage,
        duration: 5000
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle edit device
  const handleEdit = (device: Device) => {
    setEditingDevice(device);
    setFormData({
      deviceName: device.deviceName || '',
      deviceType: device.deviceType || '',
      siteId: device.siteId || '',
      location: device.location || '',
      description: device.description || '',
      managementVlan: device.managementVlan?.toString() || '',
      adminStatus: device.adminStatus || ''
    });
    setIsEditDialogOpen(true);
  };

  // Handle device detail view
  const handleViewDetail = (device: Device) => {
    if (onShowDetail && (device.id || device.serialNumber) && device.deviceName) {
      onShowDetail(device.id || device.serialNumber || '', device.deviceName);
    }
  };

  // Handle bulk operations
  const handleBulkStatusChange = async (status: string) => {
    if (selectedDevices.size === 0) return;

    setIsSubmitting(true);

    try {
      const promises = Array.from(selectedDevices).map(deviceId => {
        const device = devices.find(d => (d.id || d.serialNumber) === deviceId);
        if (!device) return Promise.resolve();

        return apiService.makeAuthenticatedRequest(`/v3/devices/${deviceId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...device,
            adminStatus: status
          })
        });
      });

      await Promise.all(promises);

      toast.success('Bulk operation completed', {
        description: `${selectedDevices.size} devices updated successfully.`
      });

      setSelectedDevices(new Set());
      fetchDevices(false);

    } catch (error) {
      toast.error('Bulk operation failed', {
        description: 'Some devices may not have been updated.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format uptime
  const formatUptime = (uptime?: number) => {
    if (!uptime) return 'N/A';
    
    const days = Math.floor(uptime / (24 * 60 * 60));
    const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((uptime % (60 * 60)) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  // Format last seen
  const formatLastSeen = (lastSeen?: string) => {
    if (!lastSeen) return 'Never';
    
    try {
      const date = new Date(lastSeen);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
      return `${Math.floor(diffMins / 1440)}d ago`;
    } catch {
      return 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Server className="h-5 w-5" />
              <span>Configure Devices</span>
            </CardTitle>
            <CardDescription>
              Loading device configuration data...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center space-x-4">
                  <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span>Error Loading Devices</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error}
            </AlertDescription>
          </Alert>
          <Button 
            onClick={() => fetchDevices()} 
            className="mt-4"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <Server className="h-5 w-5" />
                <span>Configure Devices</span>
              </CardTitle>
              <CardDescription>
                Manage and configure network devices across your organization
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchDevices(false)}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Device
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add New Device</DialogTitle>
                    <DialogDescription>
                      Configure a new network device
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="deviceName">Device Name</Label>
                      <Input
                        id="deviceName"
                        value={formData.deviceName}
                        onChange={(e) => setFormData(prev => ({ ...prev, deviceName: e.target.value }))}
                        placeholder="Enter device name"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="deviceType">Device Type</Label>
                      <Select value={formData.deviceType} onValueChange={(value) => setFormData(prev => ({ ...prev, deviceType: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select device type" />
                        </SelectTrigger>
                        <SelectContent>
                          {deviceTypes.length > 0 ? (
                            deviceTypes.map(type => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="no-types" disabled>No device types available</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="siteId">Site</Label>
                      <Select value={formData.siteId} onValueChange={(value) => setFormData(prev => ({ ...prev, siteId: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a site" />
                        </SelectTrigger>
                        <SelectContent>
                          {sites.length > 0 ? (
                            sites.map((site) => (
                              <SelectItem key={site.id} value={site.id}>
                                {site.siteName}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="no-sites" disabled>No sites available</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        value={formData.location}
                        onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                        placeholder="Device location"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="managementVlan">Management VLAN</Label>
                      <Input
                        id="managementVlan"
                        type="number"
                        value={formData.managementVlan}
                        onChange={(e) => setFormData(prev => ({ ...prev, managementVlan: e.target.value }))}
                        placeholder="VLAN ID"
                        min="1"
                        max="4094"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="adminStatus">Admin Status</Label>
                      <Select value={formData.adminStatus} onValueChange={(value) => setFormData(prev => ({ ...prev, adminStatus: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {devices.length > 0 ? (
                            Array.from(new Set(devices.map(d => d.adminStatus).filter(Boolean))).map(status => (
                              <SelectItem key={status} value={status}>
                                {status}
                              </SelectItem>
                            ))
                          ) : (
                            <>
                              <SelectItem value="enabled">Enabled</SelectItem>
                              <SelectItem value="disabled">Disabled</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Input
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Device description (optional)"
                      />
                    </div>

                    {isSubmitting && (
                      <div className="space-y-2">
                        <Progress value={submitProgress} className="w-full" />
                        <p className="text-sm text-muted-foreground">Creating device...</p>
                      </div>
                    )}

                    <div className="flex justify-end space-x-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setIsCreateDialogOpen(false)}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Creating...' : 'Create Device'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search devices..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {deviceStatuses.map(status => (
                    <SelectItem key={status} value={status.toLowerCase()}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {deviceTypes.map(type => (
                    <SelectItem key={type} value={type.toLowerCase()}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Site" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites.map(site => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.siteName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedDevices.size > 0 && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {selectedDevices.size} device{selectedDevices.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkStatusChange('enabled')}
                    disabled={isSubmitting}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Enable
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkStatusChange('disabled')}
                    disabled={isSubmitting}
                  >
                    <Power className="h-4 w-4 mr-1" />
                    Disable
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedDevices(new Set())}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Devices Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Devices ({filteredDevices.length})</span>
            {filteredDevices.length > 0 && (
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Activity className="h-4 w-4" />
                <span>
                  {filteredDevices.filter(d => d.status?.toLowerCase().includes('online') || d.operationalStatus?.toLowerCase() === 'up').length} online
                </span>
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredDevices.length === 0 ? (
            <div className="text-center py-8">
              <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No devices found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || siteFilter !== 'all'
                  ? 'No devices match your current filters.'
                  : 'No devices have been configured yet.'}
              </p>
              {(!searchQuery && statusFilter === 'all' && typeFilter === 'all' && siteFilter === 'all') && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Device
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={selectedDevices.size === filteredDevices.length && filteredDevices.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDevices(new Set(filteredDevices.map(d => d.id || d.serialNumber || '')));
                          } else {
                            setSelectedDevices(new Set());
                          }
                        }}
                        className="rounded border-border"
                      />
                    </TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead>Uptime</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDevices.map((device) => {
                    const deviceId = device.id || device.serialNumber || '';
                    return (
                      <TableRow key={deviceId}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedDevices.has(deviceId)}
                            onChange={(e) => {
                              const newSelected = new Set(selectedDevices);
                              if (e.target.checked) {
                                newSelected.add(deviceId);
                              } else {
                                newSelected.delete(deviceId);
                              }
                              setSelectedDevices(newSelected);
                            }}
                            className="rounded border-border"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              {getDeviceTypeIcon(device.deviceType)}
                              <span className="font-medium">{device.deviceName || 'Unknown'}</span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {device.serialNumber && (
                                <div>S/N: {device.serialNumber}</div>
                              )}
                              {device.macAddress && (
                                <div>MAC: {device.macAddress}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {device.deviceType || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div>{device.siteName || 'Unknown Site'}</div>
                            {device.location && (
                              <div className="text-sm text-muted-foreground flex items-center">
                                <MapPin className="h-3 w-3 mr-1" />
                                {device.location}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(device.status || device.operationalStatus)}>
                            {device.status || device.operationalStatus || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell>{device.ipAddress || 'N/A'}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{formatLastSeen(device.lastSeen)}</span>
                          </div>
                        </TableCell>
                        <TableCell>{formatUptime(device.uptime)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetail(device)}
                              disabled={!onShowDetail}
                            >
                              <Activity className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(device)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDeviceToDelete(device);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Device Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Device</DialogTitle>
            <DialogDescription>
              Update device configuration
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-deviceName">Device Name</Label>
              <Input
                id="edit-deviceName"
                value={formData.deviceName}
                onChange={(e) => setFormData(prev => ({ ...prev, deviceName: e.target.value }))}
                placeholder="Enter device name"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-deviceType">Device Type</Label>
              <Select value={formData.deviceType} onValueChange={(value) => setFormData(prev => ({ ...prev, deviceType: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select device type" />
                </SelectTrigger>
                <SelectContent>
                  {deviceTypes.length > 0 ? (
                    deviceTypes.map(type => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-types" disabled>No device types available</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-siteId">Site</Label>
              <Select value={formData.siteId} onValueChange={(value) => setFormData(prev => ({ ...prev, siteId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.length > 0 ? (
                    sites.map((site) => (
                      <SelectItem key={site.id || site.siteId} value={site.id || site.siteId || 'unknown'}>
                        {site.siteName || site.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-sites" disabled>No sites available</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-location">Location</Label>
              <Input
                id="edit-location"
                value={formData.location}
                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                placeholder="Device location"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-managementVlan">Management VLAN</Label>
              <Input
                id="edit-managementVlan"
                type="number"
                value={formData.managementVlan}
                onChange={(e) => setFormData(prev => ({ ...prev, managementVlan: e.target.value }))}
                placeholder="VLAN ID"
                min="1"
                max="4094"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-adminStatus">Admin Status</Label>
              <Select value={formData.adminStatus} onValueChange={(value) => setFormData(prev => ({ ...prev, adminStatus: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {devices.length > 0 ? (
                    Array.from(new Set(devices.map(d => d.adminStatus).filter(Boolean))).map(status => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))
                  ) : (
                    <>
                      <SelectItem value="enabled">Enabled</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Device description (optional)"
              />
            </div>

            {isSubmitting && (
              <div className="space-y-2">
                <Progress value={submitProgress} className="w-full" />
                <p className="text-sm text-muted-foreground">Updating device...</p>
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsEditDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Updating...' : 'Update Device'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Device</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deviceToDelete?.deviceName || deviceToDelete?.serialNumber}"? 
              This action cannot be undone and will remove all device configuration and history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? 'Deleting...' : 'Delete Device'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}