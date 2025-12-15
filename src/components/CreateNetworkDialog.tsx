import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import { AlertCircle, Plus, Wifi, Shield, Network, Eye, EyeOff, Unlock, RefreshCw, GripVertical } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { apiService, Service, Role } from '../services/api';
import { generateDefaultService, generatePrivacyConfig, validateServiceData } from '../utils/serviceDefaults';
import { toast } from 'sonner';

interface CreateNetworkDialogProps {
  onNetworkCreated?: () => void;
}

export function CreateNetworkDialog({ onNetworkCreated }: CreateNetworkDialogProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('basic');
  
  // Form state
  const [formData, setFormData] = useState({
    serviceName: '',
    ssid: '',
    description: '',
    enabled: true,
    suppressSsid: false,
    securityType: 'open' as string,
    passphrase: '',
    topology: 'none' as string,
    defaultRole: 'none' as string,
    enableCaptivePortal: false,
    enable11kSupport: false,
    enable11mcSupport: false,
    clientToClientCommunication: true,
    sessionTimeout: 0,
    preAuthTimeout: 300,
    postAuthTimeout: 1800
  });
  
  // Available options
  const [topologies, setTopologies] = useState<any[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Draggable state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const dialogRef = useRef<HTMLDivElement>(null);

  // Load available options when dialog opens
  useEffect(() => {
    if (open) {
      loadOptions();
      setPosition({ x: 0, y: 0 }); // Reset position when opening
    }
  }, [open]);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-drag-handle]')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  const loadOptions = async () => {
    setLoadingOptions(true);
    try {
      // Load topologies and roles in parallel
      const [topoResponse, rolesData] = await Promise.all([
        apiService.makeAuthenticatedRequest('/v1/topologies', { method: 'GET' }, 10000),
        apiService.getRoles()
      ]);
      
      // Handle topologies
      if (topoResponse.ok) {
        const topoData = await topoResponse.json();
        setTopologies(Array.isArray(topoData) ? topoData : []);
        console.log('Loaded topologies for network creation:', topoData.length);
      } else {
        console.warn('Failed to load topologies:', topoResponse.status);
      }
      
      // Handle roles
      const rolesArray = Array.isArray(rolesData) ? rolesData : [];
      setRoles(rolesArray);
      
      if (rolesArray.length > 0) {
        console.log(`✓ Loaded ${rolesArray.length} roles for network creation:`, rolesArray.map(r => r.name).join(', '));
      } else {
        console.log('⚠ No roles available for network creation - users may need to create roles first');
      }
    } catch (err) {
      console.error('Failed to load options for network creation:', err);
      toast.error('Failed to load configuration options', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setLoadingOptions(false);
    }
  };
  
  const resetForm = () => {
    setFormData({
      serviceName: '',
      ssid: '',
      description: '',
      enabled: true,
      suppressSsid: false,
      securityType: 'open',
      passphrase: '',
      topology: 'none',
      defaultRole: 'none',
      enableCaptivePortal: false,
      enable11kSupport: false,
      enable11mcSupport: false,
      clientToClientCommunication: true,
      sessionTimeout: 0,
      preAuthTimeout: 300,
      postAuthTimeout: 1800
    });
    setError(null);
    setActiveTab('basic');
  };
  
  const handleCreate = async () => {
    setError(null);
    setCreating(true);
    
    try {
      console.log('Creating network with form data:', formData);
      
      // Validate that if captive portal is disabled, a default role must be selected
      if (!formData.enableCaptivePortal && (!formData.defaultRole || formData.defaultRole === 'none')) {
        throw new Error('A default user role is required when captive portal is disabled. Please select a role in the Security tab.');
      }
      
      // Generate privacy configuration
      const privacy = generatePrivacyConfig(formData.securityType, formData.passphrase);
      
      // Generate complete service object with all required fields
      const serviceData: Partial<Service> = generateDefaultService({
        serviceName: formData.serviceName.trim(),
        ssid: formData.ssid.trim(),
        status: formData.enabled ? 'enabled' : 'disabled',
        suppressSsid: formData.suppressSsid,
        privacy,
        
        // Optional configurations
        defaultTopology: (formData.topology && formData.topology !== 'none') ? formData.topology : null,
        authenticatedUserDefaultRoleID: (formData.defaultRole && formData.defaultRole !== 'none') ? formData.defaultRole : null,
        unAuthenticatedUserDefaultRoleID: (formData.defaultRole && formData.defaultRole !== 'none') ? formData.defaultRole : null,
        
        // Advanced settings
        enableCaptivePortal: formData.enableCaptivePortal,
        enabled11kSupport: formData.enable11kSupport,
        enable11mcSupport: formData.enable11mcSupport,
        clientToClientCommunication: formData.clientToClientCommunication,
        
        // Timeouts
        sessionTimeout: formData.sessionTimeout,
        preAuthenticatedIdleTimeout: formData.preAuthTimeout,
        postAuthenticatedIdleTimeout: formData.postAuthTimeout,
        
        // Vendor specific attributes based on features
        vendorSpecificAttributes: ['apName', 'vnsName', 'ssid']
      });
      
      console.log('Complete service payload:', JSON.stringify(serviceData, null, 2));
      
      // Validate the service data
      const validation = validateServiceData(serviceData);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Create the service via API
      const createdService = await apiService.createService(serviceData);
      
      console.log('Service created successfully:', createdService);
      
      toast.success('Network created successfully', {
        description: `${formData.serviceName} (${formData.ssid}) has been created.`
      });
      
      // Close dialog and reset
      setOpen(false);
      resetForm();
      
      // Notify parent
      if (onNetworkCreated) {
        onNetworkCreated();
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create network';
      setError(errorMessage);
      console.error('Network creation error:', err);
      
      toast.error('Failed to create network', {
        description: errorMessage
      });
    } finally {
      setCreating(false);
    }
  };
  
  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      const newData = {
        ...prev,
        [field]: value
      };
      
      // Auto-sync SSID with service name if they're the same
      if (field === 'serviceName' && prev.ssid === prev.serviceName) {
        newData.ssid = value;
      }
      
      return newData;
    });
  };
  
  const securityRequiresPassphrase = ['wpa2-personal', 'wpa-personal', 'wpa3-personal', 'wpa3-sae'].includes(formData.securityType);
  
  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) {
        resetForm();
      }
    }}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          Create Network
        </Button>
      </DialogTrigger>
      <DialogContent
        ref={dialogRef}
        className="max-w-2xl w-[90vw] h-[90vh] p-0 flex flex-col overflow-hidden pointer-events-auto resize"
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
          cursor: isDragging ? 'grabbing' : 'auto',
          minWidth: '600px',
          minHeight: '500px',
          maxHeight: '90vh'
        }}
        onMouseDown={handleMouseDown}
      >
        <DialogHeader className="px-6 py-4 border-b" data-drag-handle style={{ cursor: 'grab' }}>
          <DialogTitle className="flex items-center gap-2">
            <GripVertical className="h-5 w-5 text-muted-foreground" />
            <Wifi className="h-5 w-5" />
            <span>Create New Network</span>
          </DialogTitle>
          <DialogDescription>
            Configure a new wireless network (SSID) with security and access settings (drag to move)
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto hide-scrollbar px-6 py-6">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
          
          {/* Basic Settings Tab */}
          <TabsContent value="basic" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="serviceName">
                Network Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="serviceName"
                placeholder="e.g., Corporate WiFi"
                value={formData.serviceName}
                onChange={(e) => handleInputChange('serviceName', e.target.value)}
                maxLength={64}
              />
              <p className="text-xs text-muted-foreground">
                Internal name for the network configuration
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="ssid">
                SSID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ssid"
                placeholder="e.g., CorpWiFi"
                value={formData.ssid}
                onChange={(e) => handleInputChange('ssid', e.target.value)}
                maxLength={32}
              />
              <p className="text-xs text-muted-foreground">
                Network name visible to clients (max 32 characters)
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={2}
              />
            </div>
            
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="enabled">Network Enabled</Label>
                <p className="text-xs text-muted-foreground">
                  Start broadcasting this network immediately
                </p>
              </div>
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => handleInputChange('enabled', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-0.5 flex items-center space-x-2">
                <EyeOff className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="suppressSsid">Hide SSID</Label>
                  <p className="text-xs text-muted-foreground">
                    Don't broadcast network name in beacons
                  </p>
                </div>
              </div>
              <Switch
                id="suppressSsid"
                checked={formData.suppressSsid}
                onCheckedChange={(checked) => handleInputChange('suppressSsid', checked)}
              />
            </div>
          </TabsContent>
          
          {/* Security Settings Tab */}
          <TabsContent value="security" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="securityType">Security Type</Label>
              <Select
                value={formData.securityType}
                onValueChange={(value) => handleInputChange('securityType', value)}
              >
                <SelectTrigger id="securityType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">
                    <div className="flex items-center space-x-2">
                      <Unlock className="h-4 w-4" />
                      <span>Open (No Security)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="wpa2-personal">
                    <div className="flex items-center space-x-2">
                      <Shield className="h-4 w-4" />
                      <span>WPA2-Personal (AES)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="wpa3-personal">
                    <div className="flex items-center space-x-2">
                      <Shield className="h-4 w-4 text-green-500" />
                      <span>WPA3-Personal (SAE)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="wpa2-enterprise">WPA2-Enterprise</SelectItem>
                  <SelectItem value="wpa3-enterprise">WPA3-Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {securityRequiresPassphrase && (
              <div className="space-y-2">
                <Label htmlFor="passphrase">
                  Passphrase <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="passphrase"
                  type="password"
                  placeholder="Enter passphrase (8-63 characters)"
                  value={formData.passphrase}
                  onChange={(e) => handleInputChange('passphrase', e.target.value)}
                  minLength={8}
                  maxLength={63}
                />
                <p className="text-xs text-muted-foreground">
                  Must be between 8 and 63 characters
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="topology">Network Topology (VLAN)</Label>
              <Select
                value={formData.topology}
                onValueChange={(value) => handleInputChange('topology', value)}
                disabled={loadingOptions}
              >
                <SelectTrigger id="topology">
                  <SelectValue placeholder="Select topology (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Default)</SelectItem>
                  {topologies.map((topo) => (
                    <SelectItem key={topo.id} value={topo.id}>
                      {topo.name} {topo.vlanid ? `(VLAN ${topo.vlanid})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="defaultRole">
                  Default User Role
                  {!formData.enableCaptivePortal && (
                    <span className="text-destructive ml-1">*</span>
                  )}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={loadOptions}
                  disabled={loadingOptions}
                  className="h-6 px-2"
                >
                  <RefreshCw className={`h-3 w-3 ${loadingOptions ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <Select
                value={formData.defaultRole}
                onValueChange={(value) => handleInputChange('defaultRole', value)}
                disabled={loadingOptions || roles.length === 0}
              >
                <SelectTrigger id="defaultRole">
                  <SelectValue placeholder={
                    loadingOptions 
                      ? "Loading roles..." 
                      : roles.length === 0 
                        ? "No roles available" 
                        : !formData.enableCaptivePortal 
                          ? "Select role (required)" 
                          : "Select role (optional)"
                  } />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!formData.enableCaptivePortal && (
                <p className="text-xs text-destructive">
                  A default role is required when captive portal is disabled
                </p>
              )}
              {formData.enableCaptivePortal && (
                <p className="text-xs text-muted-foreground">
                  Optional when using captive portal authentication
                </p>
              )}
              {roles.length === 0 && !loadingOptions && (
                <p className="text-xs text-warning">
                  No roles available. Create a role in Configure → Policy first.
                </p>
              )}
            </div>
          </TabsContent>
          
          {/* Advanced Settings Tab */}
          <TabsContent value="advanced" className="space-y-4 mt-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-0.5">
                <Label>Client-to-Client Communication</Label>
                <p className="text-xs text-muted-foreground">
                  Allow clients on this network to communicate directly
                </p>
              </div>
              <Switch
                checked={formData.clientToClientCommunication}
                onCheckedChange={(checked) => handleInputChange('clientToClientCommunication', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-0.5">
                <Label>Enable Captive Portal</Label>
                <p className="text-xs text-muted-foreground">
                  Require web portal authentication
                </p>
              </div>
              <Switch
                checked={formData.enableCaptivePortal}
                onCheckedChange={(checked) => handleInputChange('enableCaptivePortal', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-0.5">
                <Label>802.11k Support</Label>
                <p className="text-xs text-muted-foreground">
                  Enable fast roaming assistance
                </p>
              </div>
              <Switch
                checked={formData.enable11kSupport}
                onCheckedChange={(checked) => handleInputChange('enable11kSupport', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-0.5">
                <Label>802.11mc Support</Label>
                <p className="text-xs text-muted-foreground">
                  Enable fine timing measurement for location
                </p>
              </div>
              <Switch
                checked={formData.enable11mcSupport}
                onCheckedChange={(checked) => handleInputChange('enable11mcSupport', checked)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="sessionTimeout">Session Timeout (seconds)</Label>
              <Input
                id="sessionTimeout"
                type="number"
                min="0"
                value={formData.sessionTimeout}
                onChange={(e) => handleInputChange('sessionTimeout', parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                0 = no timeout (session never expires)
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="preAuthTimeout">Pre-Auth Idle Timeout (seconds)</Label>
              <Input
                id="preAuthTimeout"
                type="number"
                min="0"
                value={formData.preAuthTimeout}
                onChange={(e) => handleInputChange('preAuthTimeout', parseInt(e.target.value) || 300)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="postAuthTimeout">Post-Auth Idle Timeout (seconds)</Label>
              <Input
                id="postAuthTimeout"
                type="number"
                min="0"
                value={formData.postAuthTimeout}
                onChange={(e) => handleInputChange('postAuthTimeout', parseInt(e.target.value) || 1800)}
              />
            </div>
          </TabsContent>
        </Tabs>
        </div>

        <DialogFooter className="px-6 py-4 border-t mt-auto">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !formData.serviceName || !formData.ssid || (securityRequiresPassphrase && !formData.passphrase)}
          >
            {creating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Network
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
