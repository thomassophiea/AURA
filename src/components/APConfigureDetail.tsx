import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { AlertCircle, Save, RefreshCw, Wifi, Radio, Settings, MapPin, Zap } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { apiService, AccessPoint, APDetails, APRadio, Site } from '../services/api';
import { toast } from 'sonner';

interface APConfigureDetailProps {
  serialNumber: string;
  onSave?: () => void;
  isInline?: boolean;
}

interface RadioFormData {
  radioName: string;
  radioIndex: number;
  adminState: boolean;
  mode: string;
  channelWidth: string;
  useSmartRf: boolean;
  reqChannel: string;
  txMaxPower: number;
}

interface APFormData {
  // Basic Settings
  serialNumber: string;
  displayName: string;
  description: string;
  location: string;
  hostSite: string;

  // Radio Configuration (will be populated from AP radios)
  radios: RadioFormData[];

  // Advanced Settings
  ledEnabled: boolean;
  powerMode: string;
  eventLevel: string;

  // Site Assignment
  siteId: string;
}

export function APConfigureDetail({ serialNumber, onSave, isInline = false }: APConfigureDetailProps) {
  const [apDetails, setApDetails] = useState<APDetails | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('basic');
  const [formData, setFormData] = useState<APFormData>({
    // Basic Settings
    serialNumber: serialNumber,
    displayName: '',
    description: '',
    location: '',
    hostSite: '',

    // Radio Configuration
    radios: [],

    // Advanced Settings
    ledEnabled: true,
    powerMode: 'auto',
    eventLevel: 'info',

    // Site Assignment
    siteId: ''
  });

  useEffect(() => {
    loadAPData();
  }, [serialNumber]);

  const loadAPData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load AP details and sites in parallel
      const [apData, sitesResponse] = await Promise.allSettled([
        apiService.getAccessPointDetails(serialNumber),
        apiService.getSites()
      ]);

      if (apData.status === 'fulfilled') {
        const ap = apData.value;
        setApDetails(ap);

        // Map AP data to form
        const mappedFormData: APFormData = {
          serialNumber: ap.serialNumber,
          displayName: ap.displayName || ap.serialNumber,
          description: ap.description || '',
          location: ap.location || ap.hostSite || '',
          hostSite: ap.hostSite || ap.site || '',

          // Map radios
          radios: ap.radios?.map(radio => ({
            radioName: radio.radioName,
            radioIndex: radio.radioIndex,
            adminState: radio.adminState !== false,
            mode: radio.mode || '802.11ax',
            channelWidth: radio.channelwidth || 'Ch1Width_20MHz',
            useSmartRf: radio.useSmartRf !== false,
            reqChannel: radio.reqChannel || 'auto',
            txMaxPower: radio.txMaxPower || 20
          })) || [],

          // Advanced settings (these would come from AP if available)
          ledEnabled: ap.ledEnabled !== false,
          powerMode: ap.powerMode || 'auto',
          eventLevel: ap.eventLevel || 'info',

          // Site assignment
          siteId: ap.siteId || ''
        };

        console.log('Mapped AP form data:', mappedFormData);
        setFormData(mappedFormData);
      } else {
        throw new Error('Failed to load AP details');
      }

      // Set sites
      if (sitesResponse.status === 'fulfilled') {
        setSites(sitesResponse.value);
      } else {
        setSites([]);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load AP data';
      setError(errorMessage);
      toast.error('Failed to load AP configuration', {
        description: errorMessage
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      if (!apDetails) {
        throw new Error('AP data not loaded');
      }

      // Validate required fields
      if (!formData.displayName || !formData.displayName.trim()) {
        throw new Error('Display name is required');
      }

      console.log('=== AP UPDATE DEBUG INFO ===');
      console.log('Serial Number:', serialNumber);
      console.log('Form data to save:', formData);

      // Build complete AP configuration payload
      const updatePayload: Partial<APDetails> = {
        serialNumber: serialNumber,
        displayName: formData.displayName.trim(),
        description: formData.description?.trim() || '',
        location: formData.location || formData.hostSite,
        hostSite: formData.hostSite,
        site: formData.siteId || formData.hostSite,
        siteId: formData.siteId,

        // Radio configuration
        radios: formData.radios.map(radio => ({
          radioName: radio.radioName,
          radioIndex: radio.radioIndex,
          adminState: radio.adminState,
          mode: radio.mode,
          channelwidth: radio.channelWidth,
          useSmartRf: radio.useSmartRf,
          reqChannel: radio.useSmartRf ? 'auto' : radio.reqChannel,
          txMaxPower: radio.txMaxPower
        })),

        // Advanced settings
        ledEnabled: formData.ledEnabled,
        powerMode: formData.powerMode,
        eventLevel: formData.eventLevel
      };

      // Remove undefined values
      Object.keys(updatePayload).forEach(key => {
        if (updatePayload[key as keyof APDetails] === undefined) {
          delete updatePayload[key as keyof APDetails];
        }
      });

      console.log('=== COMPLETE AP PAYLOAD ===');
      console.log(JSON.stringify(updatePayload, null, 2));

      // Update AP configuration
      const updatedAP = await apiService.updateAccessPoint(serialNumber, updatePayload);
      console.log('AP update successful!');

      setApDetails(updatedAP);

      toast.success('AP configuration saved successfully', {
        description: `Settings for ${formData.displayName} have been updated.`
      });

      if (onSave) {
        onSave();
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save AP configuration';
      setError(errorMessage);

      console.error('=== AP UPDATE ERROR ===');
      console.error('Error:', errorMessage);
      console.error('Form data:', formData);

      let userFriendlyError = errorMessage;
      if (errorMessage.includes('422')) {
        userFriendlyError = 'Validation failed. Check that all field values are valid.';
      } else if (errorMessage.includes('404')) {
        userFriendlyError = 'Access Point not found.';
      } else if (errorMessage.includes('403')) {
        userFriendlyError = 'Access denied. You may not have permission to modify this AP.';
      }

      toast.error('Failed to save AP configuration', {
        description: userFriendlyError,
        duration: 10000
      });
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof APFormData, value: string | boolean | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleRadioChange = (radioIndex: number, field: keyof RadioFormData, value: string | boolean | number) => {
    setFormData(prev => ({
      ...prev,
      radios: prev.radios.map((radio, idx) =>
        idx === radioIndex ? { ...radio, [field]: value } : radio
      )
    }));
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={isInline ? "space-y-6 p-6" : "space-y-6 p-6"}>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="radios">Radios</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        {/* Basic Settings Tab */}
        <TabsContent value="basic" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Wifi className="h-5 w-5" />
                <span>Basic Configuration</span>
              </CardTitle>
              <CardDescription>
                Fundamental access point settings and identification
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="serial-number">Serial Number</Label>
                  <Input
                    id="serial-number"
                    value={formData.serialNumber}
                    disabled
                  />
                  <p className="text-xs text-muted-foreground">Cannot be changed</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display-name">Display Name</Label>
                  <Input
                    id="display-name"
                    value={formData.displayName}
                    onChange={(e) => handleInputChange('displayName', e.target.value)}
                    placeholder="Enter display name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Optional AP description"
                  rows={3}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="text-sm font-medium">AP Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Model</p>
                    <p className="font-medium">{apDetails?.model || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Hardware Type</p>
                    <p className="font-medium">{apDetails?.hardwareType || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">IP Address</p>
                    <p className="font-medium">{apDetails?.ipAddress || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">MAC Address</p>
                    <p className="font-medium">{apDetails?.macAddress || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Software Version</p>
                    <p className="font-medium">{apDetails?.softwareVersion || apDetails?.firmware || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <Badge variant={apDetails?.status === 'connected' ? 'default' : 'destructive'}>
                      {apDetails?.status || 'Unknown'}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Radios Configuration Tab */}
        <TabsContent value="radios" className="space-y-6">
          {formData.radios.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No radios configured on this AP</p>
              </CardContent>
            </Card>
          ) : (
            formData.radios.map((radio, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Radio className="h-5 w-5" />
                    <span>{radio.radioName}</span>
                  </CardTitle>
                  <CardDescription>
                    Radio {radio.radioIndex} configuration and settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Radio State</Label>
                      <p className="text-sm text-muted-foreground">Enable or disable this radio</p>
                    </div>
                    <Switch
                      checked={radio.adminState}
                      onCheckedChange={(checked) => handleRadioChange(index, 'adminState', checked)}
                    />
                  </div>

                  {radio.adminState && (
                    <>
                      <Separator />

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Operating Mode</Label>
                          <Select
                            value={radio.mode}
                            onValueChange={(value) => handleRadioChange(index, 'mode', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="802.11ax">802.11ax (Wi-Fi 6)</SelectItem>
                              <SelectItem value="802.11ac">802.11ac (Wi-Fi 5)</SelectItem>
                              <SelectItem value="802.11n">802.11n (Wi-Fi 4)</SelectItem>
                              <SelectItem value="802.11a">802.11a</SelectItem>
                              <SelectItem value="802.11g">802.11g</SelectItem>
                              <SelectItem value="802.11b">802.11b</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Channel Width</Label>
                          <Select
                            value={radio.channelWidth}
                            onValueChange={(value) => handleRadioChange(index, 'channelWidth', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Ch1Width_20MHz">20 MHz</SelectItem>
                              <SelectItem value="Ch1Width_40MHz">40 MHz</SelectItem>
                              <SelectItem value="Ch1Width_80MHz">80 MHz</SelectItem>
                              <SelectItem value="Ch1Width_160MHz">160 MHz</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <Separator />

                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <Label>Smart RF (Auto Channel/Power)</Label>
                          <p className="text-sm text-muted-foreground">
                            Automatically optimize channel and power settings
                          </p>
                        </div>
                        <Switch
                          checked={radio.useSmartRf}
                          onCheckedChange={(checked) => handleRadioChange(index, 'useSmartRf', checked)}
                        />
                      </div>

                      {!radio.useSmartRf && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Channel</Label>
                            <Input
                              type="number"
                              value={radio.reqChannel}
                              onChange={(e) => handleRadioChange(index, 'reqChannel', e.target.value)}
                              placeholder="Channel number"
                              min="1"
                              max="165"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Max TX Power (dBm)</Label>
                            <Input
                              type="number"
                              value={radio.txMaxPower}
                              onChange={(e) => handleRadioChange(index, 'txMaxPower', parseInt(e.target.value) || 0)}
                              placeholder="Power in dBm"
                              min="0"
                              max="30"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Location Tab */}
        <TabsContent value="location" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MapPin className="h-5 w-5" />
                <span>Location & Site Assignment</span>
              </CardTitle>
              <CardDescription>
                Configure AP physical location and site membership
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="site">Site Assignment</Label>
                <Select
                  value={formData.siteId || formData.hostSite}
                  onValueChange={(value) => {
                    handleInputChange('siteId', value);
                    handleInputChange('hostSite', value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No Site</SelectItem>
                    {sites.map(site => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sites.length === 0 && (
                  <p className="text-xs text-muted-foreground">No sites configured</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location Description</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  placeholder="e.g., Building A, 2nd Floor, Room 201"
                />
                <p className="text-xs text-muted-foreground">
                  Physical location or descriptive placement of the AP
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Settings Tab */}
        <TabsContent value="advanced" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="h-5 w-5" />
                <span>Advanced Settings</span>
              </CardTitle>
              <CardDescription>
                LED, power, and event configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>LED Indicator</Label>
                  <p className="text-sm text-muted-foreground">Enable or disable LED lights</p>
                </div>
                <Switch
                  checked={formData.ledEnabled}
                  onCheckedChange={(checked) => handleInputChange('ledEnabled', checked)}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Power Mode</Label>
                <Select
                  value={formData.powerMode}
                  onValueChange={(value) => handleInputChange('powerMode', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="full">Full Power</SelectItem>
                    <SelectItem value="low">Low Power</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Control power consumption and PoE requirements
                </p>
              </div>

              <div className="space-y-2">
                <Label>Event Level</Label>
                <Select
                  value={formData.eventLevel}
                  onValueChange={(value) => handleInputChange('eventLevel', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debug">Debug (All Events)</SelectItem>
                    <SelectItem value="info">Info (Normal Events)</SelectItem>
                    <SelectItem value="warning">Warning (Important Events)</SelectItem>
                    <SelectItem value="error">Error (Critical Events Only)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Logging and event notification level
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end space-x-2 pt-4 border-t">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-2"
        >
          <Save className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
          <span>{saving ? 'Saving...' : 'Save Changes'}</span>
        </Button>
      </div>
    </div>
  );
}
