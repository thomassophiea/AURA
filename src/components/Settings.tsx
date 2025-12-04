import { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { 
  Save, 
  Settings as SettingsIcon, 
  Bell, 
  Palette, 
  Server,
  Shield,
  FileText,
  Wifi,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Clock,
  Info,
  Upload,
  Wrench,
  Activity,
  Network,
  Database,
  Key,
  CheckCircle2,
  XCircle,
  Eye
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { apiService } from '../services/api';

interface GlobalSettings {
  [key: string]: any;
}

interface SnmpSettings {
  enabled: boolean;
  community?: string;
  location?: string;
  contact?: string;
  [key: string]: any;
}

interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  status: 'success' | 'failure';
  details?: string;
}

interface Notification {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface AdoptionRule {
  id: string;
  name: string;
  siteId?: string;
  modelMatch?: string;
  serialMatch?: string;
  enabled: boolean;
}

interface NetworkTimeSettings {
  systemTime?: string;
  timezone?: string;
  ntpEnabled?: boolean;
  ntpReachable?: boolean;
  ntpServer1?: string;
  ntpServer2?: string;
  [key: string]: any;
}

interface SystemInfo {
  hostname?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  uptime?: string;
  cpuUsage?: number;
  memoryUsage?: number;
  [key: string]: any;
}

interface LoggingSettings {
  enabled?: boolean;
  level?: string;
  remoteServer?: string;
  remotePort?: number;
  [key: string]: any;
}

interface MaintenanceSettings {
  backupEnabled?: boolean;
  lastBackup?: string;
  autoRebootEnabled?: boolean;
  scheduledRebootTime?: string;
  [key: string]: any;
}

export function Settings() {
  const [localPrefs, setLocalPrefs] = useState({
    theme: 'dark' as 'light' | 'dark',
    sidebarCollapsed: false,
    notificationsEnabled: true,
    notificationsSound: false,
    notificationsDesktop: false,
  });

  const [saving, setSaving] = useState(false);
  
  // System Configuration State
  const [isLoadingSystem, setIsLoadingSystem] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({});
  const [snmpSettings, setSnmpSettings] = useState<SnmpSettings>({ enabled: false });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [regionalNotifications, setRegionalNotifications] = useState<Notification[]>([]);
  const [workflow, setWorkflow] = useState<any>({});
  const [adoptionRules, setAdoptionRules] = useState<AdoptionRule[]>([]);
  
  // New System Settings State
  const [networkTime, setNetworkTime] = useState<NetworkTimeSettings>({});
  const [systemInfo, setSystemInfo] = useState<SystemInfo>({});
  const [loggingSettings, setLoggingSettings] = useState<LoggingSettings>({});
  const [maintenanceSettings, setMaintenanceSettings] = useState<MaintenanceSettings>({});
  const [timezoneSearch, setTimezoneSearch] = useState('');

  // Load preferences from localStorage on mount
  useEffect(() => {
    const savedPrefs = localStorage.getItem('user_preferences');
    if (savedPrefs) {
      try {
        const parsed = JSON.parse(savedPrefs);
        setLocalPrefs(parsed);
      } catch (error) {
        console.error('Failed to parse saved preferences:', error);
      }
    }
  }, []);

  // Load system configuration data
  const loadSystemConfiguration = async () => {
    setIsLoadingSystem(true);
    try {
      // Load Global Settings
      try {
        const globalRes = await apiService.makeAuthenticatedRequest('/v1/globalsettings');
        if (globalRes.ok) {
          const data = await globalRes.json();
          setGlobalSettings(data);
        }
      } catch (error) {
        console.warn('Failed to load global settings:', error);
      }

      // Load SNMP Settings
      try {
        const snmpRes = await apiService.makeAuthenticatedRequest('/v1/snmp');
        if (snmpRes.ok) {
          const data = await snmpRes.json();
          setSnmpSettings(data);
        }
      } catch (error) {
        console.warn('Failed to load SNMP settings:', error);
      }

      // Load Audit Logs
      try {
        const auditRes = await apiService.makeAuthenticatedRequest('/v1/auditlogs');
        if (auditRes.ok) {
          const data = await auditRes.json();
          setAuditLogs(Array.isArray(data) ? data : data.items || []);
        }
      } catch (error) {
        console.warn('Failed to load audit logs:', error);
      }

      // Load Notifications
      try {
        const notifRes = await apiService.makeAuthenticatedRequest('/v1/notifications');
        if (notifRes.ok) {
          const data = await notifRes.json();
          setNotifications(Array.isArray(data) ? data : data.items || []);
        }
      } catch (error) {
        console.warn('Failed to load notifications:', error);
      }

      // Load Regional Notifications
      try {
        const regionalRes = await apiService.makeAuthenticatedRequest('/v1/notifications/regional');
        if (regionalRes.ok) {
          const data = await regionalRes.json();
          setRegionalNotifications(Array.isArray(data) ? data : data.items || []);
        }
      } catch (error) {
        console.warn('Failed to load regional notifications:', error);
      }

      // Load Workflow
      try {
        const workflowRes = await apiService.makeAuthenticatedRequest('/v1/workflow');
        if (workflowRes.ok) {
          const data = await workflowRes.json();
          setWorkflow(data);
        }
      } catch (error) {
        console.warn('Failed to load workflow:', error);
      }

      // Load Adoption Rules
      try {
        const adoptionRes = await apiService.makeAuthenticatedRequest('/v1/devices/adoptionrules');
        if (adoptionRes.ok) {
          const data = await adoptionRes.json();
          setAdoptionRules(Array.isArray(data) ? data : data.rules || []);
        }
      } catch (error) {
        console.warn('Failed to load adoption rules:', error);
      }

      // Load Network Time Settings
      try {
        const timeRes = await apiService.makeAuthenticatedRequest('/v1/system/time');
        if (timeRes.ok) {
          const data = await timeRes.json();
          setNetworkTime(data);
        }
      } catch (error) {
        console.warn('Failed to load network time settings:', error);
      }

      // Load System Information
      try {
        const infoRes = await apiService.makeAuthenticatedRequest('/v1/system/info');
        if (infoRes.ok) {
          const data = await infoRes.json();
          setSystemInfo(data);
        }
      } catch (error) {
        console.warn('Failed to load system info:', error);
      }

      // Load Logging Settings
      try {
        const logRes = await apiService.makeAuthenticatedRequest('/v1/system/logging');
        if (logRes.ok) {
          const data = await logRes.json();
          setLoggingSettings(data);
        }
      } catch (error) {
        console.warn('Failed to load logging settings:', error);
      }

      // Load Maintenance Settings
      try {
        const maintRes = await apiService.makeAuthenticatedRequest('/v1/system/maintenance');
        if (maintRes.ok) {
          const data = await maintRes.json();
          setMaintenanceSettings(data);
        }
      } catch (error) {
        console.warn('Failed to load maintenance settings:', error);
      }

    } catch (error) {
      console.error('Error loading system configuration:', error);
    } finally {
      setIsLoadingSystem(false);
    }
  };

  const handleSavePreferences = async () => {
    try {
      setSaving(true);
      
      // Save to localStorage
      localStorage.setItem('user_preferences', JSON.stringify(localPrefs));
      
      // Apply theme if changed
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(localPrefs.theme);
      root.setAttribute('data-theme', localPrefs.theme);
      document.body.classList.remove('light', 'dark');
      document.body.classList.add(localPrefs.theme);
      
      // Simulate async save delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      toast.success('Preferences saved successfully', {
        description: 'Your settings have been updated.'
      });
    } catch (error) {
      toast.error('Failed to save preferences', {
        description: 'Please try again.'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGlobalSettings = async () => {
    try {
      setSaving(true);
      const response = await apiService.makeAuthenticatedRequest('/v1/globalsettings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(globalSettings)
      });

      if (response.ok) {
        toast.success('Global settings saved successfully');
      } else {
        throw new Error('Failed to save global settings');
      }
    } catch (error) {
      toast.error('Failed to save global settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAdoptionRules = async () => {
    try {
      setSaving(true);
      const response = await apiService.makeAuthenticatedRequest('/v1/devices/adoptionrules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: adoptionRules })
      });

      if (response.ok) {
        toast.success('Adoption rules saved successfully');
      } else {
        throw new Error('Failed to save adoption rules');
      }
    } catch (error) {
      toast.error('Failed to save adoption rules');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNetworkTime = async () => {
    try {
      setSaving(true);
      const response = await apiService.makeAuthenticatedRequest('/v1/system/time', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(networkTime)
      });

      if (response.ok) {
        toast.success('Network time settings saved successfully');
      } else {
        throw new Error('Failed to save network time settings');
      }
    } catch (error) {
      toast.error('Failed to save network time settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLogging = async () => {
    try {
      setSaving(true);
      const response = await apiService.makeAuthenticatedRequest('/v1/system/logging', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loggingSettings)
      });

      if (response.ok) {
        toast.success('Logging settings saved successfully');
      } else {
        throw new Error('Failed to save logging settings');
      }
    } catch (error) {
      toast.error('Failed to save logging settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestNTP = async () => {
    try {
      setSaving(true);
      const response = await apiService.makeAuthenticatedRequest('/v1/system/time/test', {
        method: 'POST'
      });

      if (response.ok) {
        toast.success('NTP server is reachable');
      } else {
        toast.error('NTP server is not reachable');
      }
    } catch (error) {
      toast.error('Failed to test NTP server');
    } finally {
      setSaving(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  const formatSystemTime = (timestamp: string | undefined) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  // Popular timezones for search
  const popularTimezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Phoenix',
    'America/Los_Angeles',
    'America/Detroit',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney',
    'Pacific/Auckland'
  ];

  const filteredTimezones = popularTimezones.filter(tz =>
    tz.toLowerCase().includes(timezoneSearch.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[36px]">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your preferences and application settings
          </p>
        </div>
        <SettingsIcon className="h-8 w-8 text-muted-foreground" />
      </div>

      <Tabs defaultValue="preferences" className="w-full">
        <TabsList className="surface-1dp">
          <TabsTrigger value="preferences">
            <Palette className="h-4 w-4 mr-2" />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="system" onClick={() => !isLoadingSystem && loadSystemConfiguration()}>
            <Server className="h-4 w-4 mr-2" />
            System Configuration
          </TabsTrigger>
        </TabsList>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6 mt-6">
          <Card className="surface-2dp p-6">
            <h3 className="mb-6">User Preferences</h3>

            <div className="space-y-6">
              {/* Theme */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="theme">Theme</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose between light and dark mode
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={localPrefs.theme === 'light' ? 'default' : 'outline'}
                    onClick={() => setLocalPrefs(prev => ({ ...prev, theme: 'light' }))}
                  >
                    Light
                  </Button>
                  <Button
                    variant={localPrefs.theme === 'dark' ? 'default' : 'outline'}
                    onClick={() => setLocalPrefs(prev => ({ ...prev, theme: 'dark' }))}
                  >
                    Dark
                  </Button>
                </div>
              </div>

              {/* Sidebar */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="sidebar">Sidebar Collapsed by Default</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Default sidebar state when loading the dashboard
                  </p>
                </div>
                <Switch
                  id="sidebar"
                  checked={localPrefs.sidebarCollapsed}
                  onCheckedChange={(checked) =>
                    setLocalPrefs(prev => ({ ...prev, sidebarCollapsed: checked }))
                  }
                />
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t border-border">
                <Button
                  onClick={handleSavePreferences}
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90"
                >
                  {saving ? (
                    <>
                      <Save className="w-4 h-4 mr-2 animate-pulse" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Preferences
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6 mt-6">
          <Card className="surface-2dp p-6">
            <h3 className="mb-6">Notification Settings</h3>

            <div className="space-y-6">
              {/* Notifications Enabled */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="notifications">Enable Notifications</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Receive dashboard notifications for events and alerts
                  </p>
                </div>
                <Switch
                  id="notifications"
                  checked={localPrefs.notificationsEnabled}
                  onCheckedChange={(checked) =>
                    setLocalPrefs(prev => ({ ...prev, notificationsEnabled: checked }))
                  }
                />
              </div>

              {/* Notification Sound */}
              {localPrefs.notificationsEnabled && (
                <div className="flex items-center justify-between pl-6 border-l-2 border-primary/30">
                  <div>
                    <Label htmlFor="notif-sound">Sound</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Play sound when notifications appear
                    </p>
                  </div>
                  <Switch
                    id="notif-sound"
                    checked={localPrefs.notificationsSound}
                    onCheckedChange={(checked) =>
                      setLocalPrefs(prev => ({ ...prev, notificationsSound: checked }))
                    }
                  />
                </div>
              )}

              {/* Desktop Notifications */}
              {localPrefs.notificationsEnabled && (
                <div className="flex items-center justify-between pl-6 border-l-2 border-primary/30">
                  <div>
                    <Label htmlFor="notif-desktop">Desktop Notifications</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Show system notifications in your browser
                    </p>
                  </div>
                  <Switch
                    id="notif-desktop"
                    checked={localPrefs.notificationsDesktop}
                    onCheckedChange={(checked) =>
                      setLocalPrefs(prev => ({ ...prev, notificationsDesktop: checked }))
                    }
                  />
                </div>
              )}

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t border-border">
                <Button
                  onClick={handleSavePreferences}
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90"
                >
                  {saving ? (
                    <>
                      <Save className="w-4 h-4 mr-2 animate-pulse" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Preferences
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* System Configuration Tab */}
        <TabsContent value="system" className="space-y-6 mt-6">
          <Tabs defaultValue="global" className="w-full">
            <TabsList className="surface-1dp flex-wrap">
              <TabsTrigger value="global">
                <Server className="h-4 w-4 mr-2" />
                Global Settings
              </TabsTrigger>
              <TabsTrigger value="networktime">
                <Clock className="h-4 w-4 mr-2" />
                Network Time
              </TabsTrigger>
              <TabsTrigger value="systeminfo">
                <Info className="h-4 w-4 mr-2" />
                System Info
              </TabsTrigger>
              <TabsTrigger value="logging">
                <Database className="h-4 w-4 mr-2" />
                Logging
              </TabsTrigger>
              <TabsTrigger value="snmp">
                <Shield className="h-4 w-4 mr-2" />
                SNMP
              </TabsTrigger>
              <TabsTrigger value="audit">
                <FileText className="h-4 w-4 mr-2" />
                Audit Logs
              </TabsTrigger>
              <TabsTrigger value="adoption">
                <Wifi className="h-4 w-4 mr-2" />
                Adoption Rules
              </TabsTrigger>
            </TabsList>

            {/* Global Settings */}
            <TabsContent value="global" className="space-y-4 mt-6">
              <Card className="surface-2dp border-border">
                <div className="p-4 border-b border-border">
                  <h3 className="font-medium">Global Settings</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configure system-wide settings and parameters
                  </p>
                </div>
                <div className="p-6">
                  {isLoadingSystem ? (
                    <div className="space-y-4">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        {Object.keys(globalSettings).length > 0 ? (
                          Object.entries(globalSettings).map(([key, value]) => (
                            <div key={key} className="space-y-2">
                              <Label htmlFor={key}>{key.replace(/([A-Z])/g, ' $1').trim()}</Label>
                              <Input
                                id={key}
                                value={String(value || '')}
                                onChange={(e) => setGlobalSettings(prev => ({ ...prev, [key]: e.target.value }))}
                                placeholder={`Enter ${key}`}
                              />
                            </div>
                          ))
                        ) : (
                          <p className="col-span-2 text-center text-muted-foreground py-8">
                            No global settings available
                          </p>
                        )}
                      </div>
                      {Object.keys(globalSettings).length > 0 && (
                        <div className="flex justify-end pt-4 border-t border-border">
                          <Button onClick={handleSaveGlobalSettings} disabled={saving}>
                            {saving ? (
                              <>
                                <Save className="w-4 h-4 mr-2 animate-pulse" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Save className="w-4 h-4 mr-2" />
                                Save Global Settings
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            </TabsContent>

            {/* Network Time Configuration */}
            <TabsContent value="networktime" className="space-y-4 mt-6">
              <Card className="surface-2dp border-border">
                <div className="p-4 border-b border-border">
                  <h3 className="font-medium">Network Time Settings</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configure system time, timezone, and NTP synchronization
                  </p>
                </div>
                <div className="p-6">
                  {isLoadingSystem ? (
                    <div className="space-y-4">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* System Time Display */}
                      <div className="space-y-2">
                        <Label>System Time</Label>
                        <div className="text-2xl font-medium">
                          {formatSystemTime(networkTime.systemTime || new Date().toISOString())}
                        </div>
                      </div>

                      {/* Timezone Settings */}
                      <div className="space-y-2">
                        <Label htmlFor="timezone-search">Time zone Settings</Label>
                        <Input
                          id="timezone-search"
                          placeholder="Search for Time zone"
                          value={timezoneSearch}
                          onChange={(e) => setTimezoneSearch(e.target.value)}
                          className="mb-2"
                        />
                        <Label htmlFor="timezone">Time zone</Label>
                        <select
                          id="timezone"
                          className="w-full px-3 py-2 bg-input border border-border rounded-md"
                          value={networkTime.timezone || 'America/Detroit'}
                          onChange={(e) => setNetworkTime(prev => ({ ...prev, timezone: e.target.value }))}
                        >
                          {filteredTimezones.map(tz => (
                            <option key={tz} value={tz}>{tz}</option>
                          ))}
                        </select>
                      </div>

                      {/* Network Time (NTP/SNTP) */}
                      <div className="space-y-4 pt-4 border-t border-border">
                        <Label className="text-lg">Network Time</Label>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="ntp-enabled">NTP/SNTP</Label>
                            <p className="text-sm text-muted-foreground mt-1">
                              Enable network time synchronization
                            </p>
                          </div>
                          <Switch
                            id="ntp-enabled"
                            checked={networkTime.ntpEnabled !== false}
                            onCheckedChange={(checked) => setNetworkTime(prev => ({ ...prev, ntpEnabled: checked }))}
                          />
                        </div>

                        {networkTime.ntpEnabled !== false && (
                          <>
                            <div className="flex items-center gap-2">
                              <Label>NTP/SNTP Reachable</Label>
                              <Badge variant={networkTime.ntpReachable ? 'default' : 'secondary'}>
                                {networkTime.ntpReachable ? (
                                  <>
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Reachable
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Not Reachable
                                  </>
                                )}
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleTestNTP}
                                disabled={saving}
                              >
                                Test Connection
                              </Button>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="ntp-server1">NTP/SNTP Server 1</Label>
                              <Input
                                id="ntp-server1"
                                value={networkTime.ntpServer1 || ''}
                                onChange={(e) => setNetworkTime(prev => ({ ...prev, ntpServer1: e.target.value }))}
                                placeholder="time.apple.com"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="ntp-server2">NTP/SNTP Server 2</Label>
                              <Input
                                id="ntp-server2"
                                value={networkTime.ntpServer2 || ''}
                                onChange={(e) => setNetworkTime(prev => ({ ...prev, ntpServer2: e.target.value }))}
                                placeholder="time.nist.gov"
                              />
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex justify-end pt-4 border-t border-border">
                        <Button onClick={handleSaveNetworkTime} disabled={saving}>
                          {saving ? (
                            <>
                              <Save className="w-4 h-4 mr-2 animate-pulse" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4 mr-2" />
                              Save Network Time Settings
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </TabsContent>

            {/* System Information */}
            <TabsContent value="systeminfo" className="space-y-4 mt-6">
              <Card className="surface-2dp border-border">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">System Information</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      View system details and hardware information
                    </p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={loadSystemConfiguration}
                    disabled={isLoadingSystem}
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingSystem ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                <div className="p-6">
                  {isLoadingSystem ? (
                    <div className="space-y-4">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Hostname</Label>
                        <p className="font-medium">{systemInfo.hostname || 'N/A'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Model</Label>
                        <p className="font-medium">{systemInfo.model || 'N/A'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Serial Number</Label>
                        <p className="font-medium font-mono">{systemInfo.serialNumber || 'N/A'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Firmware Version</Label>
                        <p className="font-medium">{systemInfo.firmwareVersion || 'N/A'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Uptime</Label>
                        <p className="font-medium">{systemInfo.uptime || 'N/A'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">CPU Usage</Label>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div 
                              className="bg-primary h-2 rounded-full transition-all"
                              style={{ width: `${systemInfo.cpuUsage || 0}%` }}
                            />
                          </div>
                          <span className="font-medium">{systemInfo.cpuUsage || 0}%</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Memory Usage</Label>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div 
                              className="bg-secondary h-2 rounded-full transition-all"
                              style={{ width: `${systemInfo.memoryUsage || 0}%` }}
                            />
                          </div>
                          <span className="font-medium">{systemInfo.memoryUsage || 0}%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </TabsContent>

            {/* Logging Settings */}
            <TabsContent value="logging" className="space-y-4 mt-6">
              <Card className="surface-2dp border-border">
                <div className="p-4 border-b border-border">
                  <h3 className="font-medium">Logging Settings</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configure system logging and remote syslog servers
                  </p>
                </div>
                <div className="p-6">
                  {isLoadingSystem ? (
                    <div className="space-y-4">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="logging-enabled">Enable Logging</Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            Enable system event logging
                          </p>
                        </div>
                        <Switch
                          id="logging-enabled"
                          checked={loggingSettings.enabled !== false}
                          onCheckedChange={(checked) => setLoggingSettings(prev => ({ ...prev, enabled: checked }))}
                        />
                      </div>

                      {loggingSettings.enabled !== false && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="log-level">Log Level</Label>
                            <select
                              id="log-level"
                              className="w-full px-3 py-2 bg-input border border-border rounded-md"
                              value={loggingSettings.level || 'info'}
                              onChange={(e) => setLoggingSettings(prev => ({ ...prev, level: e.target.value }))}
                            >
                              <option value="debug">Debug</option>
                              <option value="info">Info</option>
                              <option value="warning">Warning</option>
                              <option value="error">Error</option>
                              <option value="critical">Critical</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="remote-server">Remote Syslog Server</Label>
                            <Input
                              id="remote-server"
                              value={loggingSettings.remoteServer || ''}
                              onChange={(e) => setLoggingSettings(prev => ({ ...prev, remoteServer: e.target.value }))}
                              placeholder="syslog.example.com"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="remote-port">Remote Syslog Port</Label>
                            <Input
                              id="remote-port"
                              type="number"
                              value={loggingSettings.remotePort || 514}
                              onChange={(e) => setLoggingSettings(prev => ({ ...prev, remotePort: parseInt(e.target.value) }))}
                              placeholder="514"
                            />
                          </div>
                        </>
                      )}

                      <div className="flex justify-end pt-4 border-t border-border">
                        <Button onClick={handleSaveLogging} disabled={saving}>
                          {saving ? (
                            <>
                              <Save className="w-4 h-4 mr-2 animate-pulse" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4 mr-2" />
                              Save Logging Settings
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </TabsContent>

            {/* SNMP Settings */}
            <TabsContent value="snmp" className="space-y-4 mt-6">
              <Card className="surface-2dp border-border">
                <div className="p-4 border-b border-border">
                  <h3 className="font-medium">SNMP Settings</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configure Simple Network Management Protocol settings
                  </p>
                </div>
                <div className="p-6">
                  {isLoadingSystem ? (
                    <div className="space-y-4">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="snmp-enabled">Enable SNMP</Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            Allow SNMP monitoring and management
                          </p>
                        </div>
                        <Switch
                          id="snmp-enabled"
                          checked={snmpSettings.enabled}
                          onCheckedChange={(checked) => setSnmpSettings(prev => ({ ...prev, enabled: checked }))}
                        />
                      </div>
                      {snmpSettings.enabled && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="snmp-community">Community String</Label>
                            <Input
                              id="snmp-community"
                              type="password"
                              value={snmpSettings.community || ''}
                              onChange={(e) => setSnmpSettings(prev => ({ ...prev, community: e.target.value }))}
                              placeholder="public"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="snmp-location">Location</Label>
                            <Input
                              id="snmp-location"
                              value={snmpSettings.location || ''}
                              onChange={(e) => setSnmpSettings(prev => ({ ...prev, location: e.target.value }))}
                              placeholder="Data Center 1"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="snmp-contact">Contact</Label>
                            <Input
                              id="snmp-contact"
                              value={snmpSettings.contact || ''}
                              onChange={(e) => setSnmpSettings(prev => ({ ...prev, contact: e.target.value }))}
                              placeholder="admin@example.com"
                            />
                          </div>
                        </>
                      )}
                      <div className="flex justify-end pt-4 border-t border-border">
                        <Button onClick={() => toast.info('SNMP settings are read-only')} variant="outline">
                          <Eye className="w-4 h-4 mr-2" />
                          View Only
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </TabsContent>

            {/* Audit Logs */}
            <TabsContent value="audit" className="space-y-4 mt-6">
              <Card className="surface-2dp border-border">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Audit Logs</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      System activity and administrative actions
                    </p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={loadSystemConfiguration}
                    disabled={isLoadingSystem}
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingSystem ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                <div className="p-4">
                  {isLoadingSystem ? (
                    <div className="space-y-4">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : auditLogs.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Timestamp</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Resource</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLogs.slice(0, 50).map(log => (
                          <TableRow key={log.id}>
                            <TableCell className="text-sm">{formatTimestamp(log.timestamp)}</TableCell>
                            <TableCell className="font-medium">{log.user}</TableCell>
                            <TableCell>{log.action}</TableCell>
                            <TableCell className="text-muted-foreground">{log.resource}</TableCell>
                            <TableCell>
                              <Badge variant={log.status === 'success' ? 'default' : 'destructive'}>
                                {log.status === 'success' ? (
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                ) : (
                                  <XCircle className="h-3 w-3 mr-1" />
                                )}
                                {log.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-12">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No audit logs available</p>
                    </div>
                  )}
                </div>
              </Card>
            </TabsContent>

            {/* Device Adoption Rules */}
            <TabsContent value="adoption" className="space-y-4 mt-6">
              <Card className="surface-2dp border-border">
                <div className="p-4 border-b border-border">
                  <h3 className="font-medium">Device Adoption Rules</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Automatic device adoption and site assignment rules
                  </p>
                </div>
                <div className="p-4">
                  {isLoadingSystem ? (
                    <div className="space-y-4">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : adoptionRules.length > 0 ? (
                    <div className="space-y-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rule Name</TableHead>
                            <TableHead>Site ID</TableHead>
                            <TableHead>Model Match</TableHead>
                            <TableHead>Serial Match</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {adoptionRules.map(rule => (
                            <TableRow key={rule.id}>
                              <TableCell className="font-medium">{rule.name}</TableCell>
                              <TableCell>{rule.siteId || 'Any'}</TableCell>
                              <TableCell className="text-muted-foreground">{rule.modelMatch || 'Any'}</TableCell>
                              <TableCell className="text-muted-foreground">{rule.serialMatch || 'Any'}</TableCell>
                              <TableCell>
                                <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                                  {rule.enabled ? 'Enabled' : 'Disabled'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <div className="flex justify-end pt-4 border-t border-border">
                        <Button onClick={handleSaveAdoptionRules} disabled={saving}>
                          {saving ? (
                            <>
                              <Save className="w-4 h-4 mr-2 animate-pulse" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4 mr-2" />
                              Save Adoption Rules
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Wifi className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No adoption rules configured</p>
                    </div>
                  )}
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
