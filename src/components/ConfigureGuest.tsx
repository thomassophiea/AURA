import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { 
  UserPlus, 
  Users, 
  Wifi, 
  Shield, 
  Clock, 
  RefreshCw, 
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Info,
  Search,
  Globe,
  Key,
  Calendar
} from 'lucide-react';
import { apiService, Service, Role } from '../services/api';
import { toast } from 'sonner';

interface GuestUser {
  id: string;
  username: string;
  email?: string;
  status: 'active' | 'expired' | 'disabled';
  createdDate: string;
  expiryDate?: string;
  network?: string;
  accessDuration: number;
  remainingTime?: number;
}

export function ConfigureGuest() {
  const [loading, setLoading] = useState(true);
  const [guestNetworks, setGuestNetworks] = useState<Service[]>([]);
  const [guestRoles, setGuestRoles] = useState<Role[]>([]);
  const [activeTab, setActiveTab] = useState('networks');
  const [error, setError] = useState<string>('');

  // Guest network creation state
  const [isCreatingNetwork, setIsCreatingNetwork] = useState(false);
  const [newGuestNetwork, setNewGuestNetwork] = useState({
    ssid: '',
    vlan: '',
    maxDuration: '24',
    requiresApproval: false,
    enableCaptivePortal: true
  });

  useEffect(() => {
    loadGuestData();
  }, []);

  const loadGuestData = async () => {
    setLoading(true);
    setError('');

    try {
      // Load all services/networks and filter for guest ones
      const [servicesData, rolesData] = await Promise.allSettled([
        apiService.getServices(),
        apiService.getRoles()
      ]);

      if (servicesData.status === 'fulfilled') {
        const allServices = Array.isArray(servicesData.value) ? servicesData.value : [];
        // Filter for guest networks (those with guestAccess enabled or captive portal)
        const guestServices = allServices.filter(service => 
          service.guestAccess === true || 
          service.captivePortal === true ||
          service.enableCaptivePortal === true ||
          service.serviceName?.toLowerCase().includes('guest')
        );
        setGuestNetworks(guestServices);
      }

      if (rolesData.status === 'fulfilled') {
        const allRoles = Array.isArray(rolesData.value) ? rolesData.value : [];
        // Filter for guest-related roles
        const guestRolesList = allRoles.filter(role =>
          role.name?.toLowerCase().includes('guest') ||
          role.cpTopologyId !== null || // Roles with captive portal configured
          role.cpRedirect !== ''
        );
        setGuestRoles(guestRolesList);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load guest configuration';
      setError(errorMessage);
      toast.error('Failed to load guest data', {
        description: errorMessage
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await loadGuestData();
    toast.success('Guest data refreshed');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl tracking-tight">Guest Access Management</h2>
          <p className="text-muted-foreground">
            Configure guest networks, access policies, and captive portal settings
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Guest Networks</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{guestNetworks.length}</div>
            <p className="text-xs text-muted-foreground">
              Active guest SSIDs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Guest Roles</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{guestRoles.length}</div>
            <p className="text-xs text-muted-foreground">
              Configured access policies
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Captive Portal</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              {guestNetworks.filter(n => n.captivePortal || n.enableCaptivePortal).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Networks with portal
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="networks">
            <Wifi className="mr-2 h-4 w-4" />
            Guest Networks
          </TabsTrigger>
          <TabsTrigger value="policies">
            <Shield className="mr-2 h-4 w-4" />
            Access Policies
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Globe className="mr-2 h-4 w-4" />
            Captive Portal
          </TabsTrigger>
        </TabsList>

        {/* Guest Networks Tab */}
        <TabsContent value="networks" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Guest Network Configuration</CardTitle>
                  <CardDescription>
                    Manage SSIDs and network settings for guest access
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {guestNetworks.length === 0 ? (
                <div className="text-center py-12">
                  <Wifi className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                  <h3 className="mt-4 text-lg">No guest networks configured</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Configure a network with guest access enabled in the Networks section
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SSID / Service Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Security</TableHead>
                      <TableHead>VLAN</TableHead>
                      <TableHead>Captive Portal</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {guestNetworks.map((network) => {
                      const ssid = network.ssid || network.serviceName || network.name || 'Unknown';
                      const isEnabled = network.enabled !== false && network.status !== 'disabled';
                      const hasCaptivePortal = network.captivePortal || network.enableCaptivePortal;
                      
                      // Determine security type
                      let securityType = 'Open';
                      if (network.WpaPskElement || network.privacy?.WpaPskElement) {
                        securityType = 'WPA/WPA2 PSK';
                      } else if (network.WpaEnterpriseElement || network.privacy?.WpaEnterpriseElement) {
                        securityType = 'WPA Enterprise';
                      } else if (network.WpaSaeElement || network.privacy?.WpaSaeElement) {
                        securityType = 'WPA3 SAE';
                      }

                      return (
                        <TableRow key={network.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Wifi className="h-4 w-4 text-muted-foreground" />
                              <span>{ssid}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={isEnabled ? 'default' : 'secondary'}>
                              {isEnabled ? (
                                <>
                                  <CheckCircle className="mr-1 h-3 w-3" />
                                  Enabled
                                </>
                              ) : (
                                <>
                                  <XCircle className="mr-1 h-3 w-3" />
                                  Disabled
                                </>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{securityType}</Badge>
                          </TableCell>
                          <TableCell>
                            {network.vlan || network.dot1dPortNumber || 'Default'}
                          </TableCell>
                          <TableCell>
                            {hasCaptivePortal ? (
                              <Badge variant="default">
                                <Globe className="mr-1 h-3 w-3" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Not configured</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Access Policies Tab */}
        <TabsContent value="policies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Guest Access Policies</CardTitle>
              <CardDescription>
                Roles and firewall policies for guest users
              </CardDescription>
            </CardHeader>
            <CardContent>
              {guestRoles.length === 0 ? (
                <div className="text-center py-12">
                  <Shield className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                  <h3 className="mt-4 text-lg">No guest policies configured</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Create a role with guest-specific access policies in the Policy section
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role Name</TableHead>
                      <TableHead>Default Action</TableHead>
                      <TableHead>Captive Portal</TableHead>
                      <TableHead>Features</TableHead>
                      <TableHead className="text-right">Filters</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {guestRoles.map((role) => (
                      <TableRow key={role.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-muted-foreground" />
                            <span>{role.name}</span>
                            {role.predefined && (
                              <Badge variant="secondary" className="text-xs">Built-in</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={role.defaultAction === 'allow' ? 'default' : 'destructive'}>
                            {role.defaultAction || 'N/A'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {role.cpRedirect ? (
                            <Badge variant="default">
                              <Globe className="mr-1 h-3 w-3" />
                              {role.cpRedirect}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">No redirect</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {role.cpHttp && <Badge variant="outline" className="text-xs">HTTP</Badge>}
                            {role.cpOauthUseGoogle && <Badge variant="outline" className="text-xs">Google OAuth</Badge>}
                            {role.cpOauthUseFacebook && <Badge variant="outline" className="text-xs">Facebook OAuth</Badge>}
                            {!role.cpHttp && !role.cpOauthUseGoogle && !role.cpOauthUseFacebook && (
                              <span className="text-xs text-muted-foreground">None</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="text-sm text-muted-foreground">
                            L2: {role.l2Filters?.length || 0} | 
                            L3: {role.l3Filters?.length || 0} | 
                            L7: {role.l7Filters?.length || 0}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Captive Portal Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Captive Portal Configuration</CardTitle>
              <CardDescription>
                Manage captive portal settings and authentication options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Captive portal settings are configured per role. Networks with guest access should be assigned to roles with captive portal configuration enabled.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium">Portal Features</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="oauth-google" className="text-sm">Google OAuth</Label>
                        <div className="text-xs text-muted-foreground">
                          {guestRoles.filter(r => r.cpOauthUseGoogle).length} role(s)
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="oauth-facebook" className="text-sm">Facebook OAuth</Label>
                        <div className="text-xs text-muted-foreground">
                          {guestRoles.filter(r => r.cpOauthUseFacebook).length} role(s)
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="oauth-microsoft" className="text-sm">Microsoft OAuth</Label>
                        <div className="text-xs text-muted-foreground">
                          {guestRoles.filter(r => r.cpOauthUseMicrosoft).length} role(s)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-medium">Portal Parameters</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Include AP Name</Label>
                        <div className="text-xs text-muted-foreground">
                          {guestRoles.filter(r => r.cpAddApNameAndSerial).length} role(s)
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Include MAC Address</Label>
                        <div className="text-xs text-muted-foreground">
                          {guestRoles.filter(r => r.cpAddMac).length} role(s)
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Include SSID</Label>
                        <div className="text-xs text-muted-foreground">
                          {guestRoles.filter(r => r.cpAddSsid).length} role(s)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h3 className="text-sm font-medium mb-3">Active Captive Portal Roles</h3>
                  {guestRoles.filter(r => r.cpRedirect).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No roles with captive portal redirect configured
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {guestRoles.filter(r => r.cpRedirect).map(role => (
                        <div key={role.id} className="flex items-center justify-between p-3 rounded-lg border">
                          <div className="flex items-center gap-3">
                            <Globe className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="text-sm font-medium">{role.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Redirect: {role.cpRedirect}
                              </div>
                            </div>
                          </div>
                          <Badge variant="outline">
                            {role.cpIdentity || 'No identity'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
