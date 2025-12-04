import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Switch } from './ui/switch';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertDescription } from './ui/alert';
import {
  Settings,
  Network,
  Clock,
  Bell,
  FileText,
  Save,
  Shield,
  Globe,
  Server,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';

interface SystemConfig {
  // General
  hostname: string;
  domain: string;
  contactEmail: string;
  location: string;

  // Network
  managementIp: string;
  subnetMask: string;
  defaultGateway: string;
  primaryDns: string;
  secondaryDns: string;

  // Time
  timezone: string;
  ntpEnabled: boolean;
  ntpServer1: string;
  ntpServer2: string;

  // SNMP
  snmpEnabled: boolean;
  snmpCommunity: string;
  snmpLocation: string;
  snmpContact: string;
  snmpTrapServer: string;

  // Syslog
  syslogEnabled: boolean;
  syslogServer: string;
  syslogPort: number;
  syslogLevel: 'debug' | 'info' | 'warning' | 'error';

  // Audit
  auditLoggingEnabled: boolean;
  auditRetentionDays: number;
  auditSyslogEnabled: boolean;
}

export function SystemAdministration() {
  const [config, setConfig] = useState<SystemConfig>({
    hostname: 'extreme-controller',
    domain: 'local',
    contactEmail: 'admin@example.com',
    location: 'Data Center',
    managementIp: '192.168.1.10',
    subnetMask: '255.255.255.0',
    defaultGateway: '192.168.1.1',
    primaryDns: '8.8.8.8',
    secondaryDns: '8.8.4.4',
    timezone: 'America/New_York',
    ntpEnabled: true,
    ntpServer1: 'pool.ntp.org',
    ntpServer2: 'time.google.com',
    snmpEnabled: true,
    snmpCommunity: 'public',
    snmpLocation: 'Data Center',
    snmpContact: 'admin@example.com',
    snmpTrapServer: '',
    syslogEnabled: false,
    syslogServer: '',
    syslogPort: 514,
    syslogLevel: 'info',
    auditLoggingEnabled: true,
    auditRetentionDays: 90,
    auditSyslogEnabled: false
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [apiNotAvailable, setApiNotAvailable] = useState(false);

  useEffect(() => {
    loadSystemConfig();
  }, []);

  const loadSystemConfig = async () => {
    setLoading(true);
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/system/config', {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        setConfig(prevConfig => ({ ...prevConfig, ...data }));
        setApiNotAvailable(false);
      } else if (response.status === 404) {
        setApiNotAvailable(true);
        console.warn('System configuration API endpoint not available on Extreme Platform ONE');
      }
    } catch (error) {
      console.error('Failed to load system config:', error);
      setApiNotAvailable(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      toast.info('Saving system configuration...');

      const response = await apiService.makeAuthenticatedRequest('/v1/system/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        toast.success('System configuration saved successfully');
      } else {
        throw new Error('Failed to save configuration');
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateConfig = (field: keyof SystemConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'Pacific/Honolulu',
    'America/Anchorage',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney'
  ];

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            System Administration
          </h2>
          <p className="text-muted-foreground">
            Configure system-wide settings and parameters
          </p>
        </div>
        <Button onClick={handleSaveConfig} disabled={saving || apiNotAvailable}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>

      {apiNotAvailable && (
        <Alert className="border-yellow-500">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            System configuration API endpoints are not available on this Extreme Platform ONE version.
            This feature requires Extreme Platform ONE API v1/system/config support.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
          <TabsTrigger value="time">Time & NTP</TabsTrigger>
          <TabsTrigger value="snmp">SNMP</TabsTrigger>
          <TabsTrigger value="syslog">Syslog</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                General Settings
              </CardTitle>
              <CardDescription>Basic system identification and contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Hostname</Label>
                  <Input
                    value={config.hostname}
                    onChange={(e) => handleUpdateConfig('hostname', e.target.value)}
                    placeholder="controller-01"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Domain</Label>
                  <Input
                    value={config.domain}
                    onChange={(e) => handleUpdateConfig('domain', e.target.value)}
                    placeholder="example.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Contact Email</Label>
                <Input
                  type="email"
                  value={config.contactEmail}
                  onChange={(e) => handleUpdateConfig('contactEmail', e.target.value)}
                  placeholder="admin@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={config.location}
                  onChange={(e) => handleUpdateConfig('location', e.target.value)}
                  placeholder="Building A, Floor 3"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Network Settings */}
        <TabsContent value="network" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Network Configuration
              </CardTitle>
              <CardDescription>Management interface and network settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Management IP Address</Label>
                  <Input
                    value={config.managementIp}
                    onChange={(e) => handleUpdateConfig('managementIp', e.target.value)}
                    placeholder="192.168.1.10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Subnet Mask</Label>
                  <Input
                    value={config.subnetMask}
                    onChange={(e) => handleUpdateConfig('subnetMask', e.target.value)}
                    placeholder="255.255.255.0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Default Gateway</Label>
                <Input
                  value={config.defaultGateway}
                  onChange={(e) => handleUpdateConfig('defaultGateway', e.target.value)}
                  placeholder="192.168.1.1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Primary DNS Server</Label>
                  <Input
                    value={config.primaryDns}
                    onChange={(e) => handleUpdateConfig('primaryDns', e.target.value)}
                    placeholder="8.8.8.8"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Secondary DNS Server</Label>
                  <Input
                    value={config.secondaryDns}
                    onChange={(e) => handleUpdateConfig('secondaryDns', e.target.value)}
                    placeholder="8.8.4.4"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Time & NTP */}
        <TabsContent value="time" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Time and NTP Configuration
              </CardTitle>
              <CardDescription>Configure timezone and NTP synchronization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={config.timezone} onValueChange={(value) => handleUpdateConfig('timezone', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map(tz => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable NTP Synchronization</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically sync time with NTP servers
                  </p>
                </div>
                <Switch
                  checked={config.ntpEnabled}
                  onCheckedChange={(checked) => handleUpdateConfig('ntpEnabled', checked)}
                />
              </div>

              {config.ntpEnabled && (
                <div className="space-y-4 pl-4 border-l-2">
                  <div className="space-y-2">
                    <Label>Primary NTP Server</Label>
                    <Input
                      value={config.ntpServer1}
                      onChange={(e) => handleUpdateConfig('ntpServer1', e.target.value)}
                      placeholder="pool.ntp.org"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Secondary NTP Server</Label>
                    <Input
                      value={config.ntpServer2}
                      onChange={(e) => handleUpdateConfig('ntpServer2', e.target.value)}
                      placeholder="time.google.com"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SNMP */}
        <TabsContent value="snmp" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                SNMP Configuration
              </CardTitle>
              <CardDescription>Configure SNMP monitoring and traps</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable SNMP</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow SNMP monitoring of the system
                  </p>
                </div>
                <Switch
                  checked={config.snmpEnabled}
                  onCheckedChange={(checked) => handleUpdateConfig('snmpEnabled', checked)}
                />
              </div>

              {config.snmpEnabled && (
                <div className="space-y-4 pl-4 border-l-2">
                  <div className="space-y-2">
                    <Label>Community String</Label>
                    <Input
                      value={config.snmpCommunity}
                      onChange={(e) => handleUpdateConfig('snmpCommunity', e.target.value)}
                      placeholder="public"
                      type="password"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>SNMP Location</Label>
                    <Input
                      value={config.snmpLocation}
                      onChange={(e) => handleUpdateConfig('snmpLocation', e.target.value)}
                      placeholder="Data Center"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>SNMP Contact</Label>
                    <Input
                      value={config.snmpContact}
                      onChange={(e) => handleUpdateConfig('snmpContact', e.target.value)}
                      placeholder="admin@example.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>SNMP Trap Server (Optional)</Label>
                    <Input
                      value={config.snmpTrapServer}
                      onChange={(e) => handleUpdateConfig('snmpTrapServer', e.target.value)}
                      placeholder="192.168.1.100"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Syslog */}
        <TabsContent value="syslog" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Syslog Configuration
              </CardTitle>
              <CardDescription>Configure remote syslog server</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable Syslog</Label>
                  <p className="text-sm text-muted-foreground">
                    Send logs to remote syslog server
                  </p>
                </div>
                <Switch
                  checked={config.syslogEnabled}
                  onCheckedChange={(checked) => handleUpdateConfig('syslogEnabled', checked)}
                />
              </div>

              {config.syslogEnabled && (
                <div className="space-y-4 pl-4 border-l-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Syslog Server</Label>
                      <Input
                        value={config.syslogServer}
                        onChange={(e) => handleUpdateConfig('syslogServer', e.target.value)}
                        placeholder="192.168.1.100"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Port</Label>
                      <Input
                        type="number"
                        value={config.syslogPort}
                        onChange={(e) => handleUpdateConfig('syslogPort', parseInt(e.target.value))}
                        placeholder="514"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Log Level</Label>
                    <Select
                      value={config.syslogLevel}
                      onValueChange={(value: SystemConfig['syslogLevel']) => handleUpdateConfig('syslogLevel', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="debug">Debug</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Logs */}
        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Audit Logging Configuration
              </CardTitle>
              <CardDescription>Configure audit trail and compliance logging</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable Audit Logging</Label>
                  <p className="text-sm text-muted-foreground">
                    Track administrative actions and changes
                  </p>
                </div>
                <Switch
                  checked={config.auditLoggingEnabled}
                  onCheckedChange={(checked) => handleUpdateConfig('auditLoggingEnabled', checked)}
                />
              </div>

              {config.auditLoggingEnabled && (
                <div className="space-y-4 pl-4 border-l-2">
                  <div className="space-y-2">
                    <Label>Retention Period (Days)</Label>
                    <Input
                      type="number"
                      value={config.auditRetentionDays}
                      onChange={(e) => handleUpdateConfig('auditRetentionDays', parseInt(e.target.value))}
                      placeholder="90"
                    />
                    <p className="text-xs text-muted-foreground">
                      Audit logs older than this will be automatically deleted
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Send to Syslog</Label>
                      <p className="text-sm text-muted-foreground">
                        Forward audit logs to syslog server
                      </p>
                    </div>
                    <Switch
                      checked={config.auditSyslogEnabled}
                      onCheckedChange={(checked) => handleUpdateConfig('auditSyslogEnabled', checked)}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
