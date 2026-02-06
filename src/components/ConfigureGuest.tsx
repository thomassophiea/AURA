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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { Separator } from './ui/separator';
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
  Calendar,
  Ticket,
  Save
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
  const [eGuestProfiles, setEGuestProfiles] = useState<any[]>([]);
  const [guestAccounts, setGuestAccounts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('networks');
  const [error, setError] = useState<string>('');

  // eGuest portal dialog state
  const [portalDialogOpen, setPortalDialogOpen] = useState(false);
  const [editingPortal, setEditingPortal] = useState<any | null>(null);
  const [portalForm, setPortalForm] = useState({
    name: '',
    description: '',
    authType: 'selfRegistration',
    termsEnabled: false,
    termsText: '',
    redirectUrl: '',
    sessionTimeout: 3600,
    idleTimeout: 600,
    maxDevices: 5
  });
  const [savingPortal, setSavingPortal] = useState(false);

  // Guest account dialog state
  const [guestDialogOpen, setGuestDialogOpen] = useState(false);
  const [guestForm, setGuestForm] = useState({
    username: '',
    email: '',
    accessDuration: 24,
    network: ''
  });
  const [savingGuest, setSavingGuest] = useState(false);

  useEffect(() => {
    loadGuestData();
  }, []);

  const loadGuestData = async () => {
    setLoading(true);
    setError('');

    try {
      const [servicesData, rolesData, eGuestData, guestsData] = await Promise.allSettled([
        apiService.getServices(),
        apiService.getRoles(),
        apiService.getEGuestProfiles(),
        apiService.getGuests()
      ]);

      if (servicesData.status === 'fulfilled') {
        const allServices = Array.isArray(servicesData.value) ? servicesData.value : [];
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
        const guestRolesList = allRoles.filter(role =>
          role.name?.toLowerCase().includes('guest') ||
          role.cpTopologyId !== null ||
          role.cpRedirect !== ''
        );
        setGuestRoles(guestRolesList);
      }

      if (eGuestData.status === 'fulfilled') {
        setEGuestProfiles(Array.isArray(eGuestData.value) ? eGuestData.value : []);
      }

      if (guestsData.status === 'fulfilled') {
        setGuestAccounts(Array.isArray(guestsData.value) ? guestsData.value : []);
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

  // === eGuest Portal CRUD ===
  const handleCreatePortal = () => {
    setEditingPortal(null);
    setPortalForm({
      name: '',
      description: '',
      authType: 'selfRegistration',
      termsEnabled: false,
      termsText: '',
      redirectUrl: '',
      sessionTimeout: 3600,
      idleTimeout: 600,
      maxDevices: 5
    });
    setPortalDialogOpen(true);
  };

  const handleEditPortal = (portal: any) => {
    setEditingPortal(portal);
    setPortalForm({
      name: portal.name || portal.portalName || '',
      description: portal.description || '',
      authType: portal.authType || portal.authenticationType || 'selfRegistration',
      termsEnabled: portal.termsEnabled || portal.termsAndConditions || false,
      termsText: portal.termsText || portal.termsAndConditionsText || '',
      redirectUrl: portal.redirectUrl || portal.successRedirectUrl || '',
      sessionTimeout: portal.sessionTimeout || 3600,
      idleTimeout: portal.idleTimeout || 600,
      maxDevices: portal.maxDevices || portal.maxDevicesPerUser || 5
    });
    setPortalDialogOpen(true);
  };

  const handleSavePortal = async () => {
    if (!portalForm.name.trim()) {
      toast.error('Portal name is required');
      return;
    }

    setSavingPortal(true);
    try {
      const payload = {
        name: portalForm.name,
        portalName: portalForm.name,
        description: portalForm.description,
        authenticationType: portalForm.authType,
        termsAndConditions: portalForm.termsEnabled,
        termsAndConditionsText: portalForm.termsText,
        successRedirectUrl: portalForm.redirectUrl,
        sessionTimeout: portalForm.sessionTimeout,
        idleTimeout: portalForm.idleTimeout,
        maxDevicesPerUser: portalForm.maxDevices
      };

      if (editingPortal) {
        await apiService.updateEGuestProfile(editingPortal.id, { ...editingPortal, ...payload });
        toast.success('Portal profile updated');
      } else {
        await apiService.createEGuestProfile(payload);
        toast.success('Portal profile created');
      }

      setPortalDialogOpen(false);
      await loadGuestData();
    } catch (err) {
      toast.error('Failed to save portal profile', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setSavingPortal(false);
    }
  };

  const handleDeletePortal = async (portal: any) => {
    if (!confirm(`Delete portal "${portal.name || portal.portalName}"? This cannot be undone.`)) return;
    try {
      await apiService.deleteEGuestProfile(portal.id);
      toast.success('Portal profile deleted');
      await loadGuestData();
    } catch (err) {
      toast.error('Failed to delete portal', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  };

  // === Guest Account CRUD ===
  const handleCreateGuest = () => {
    setGuestForm({ username: '', email: '', accessDuration: 24, network: '' });
    setGuestDialogOpen(true);
  };

  const handleSaveGuest = async () => {
    if (!guestForm.username.trim()) {
      toast.error('Username is required');
      return;
    }

    setSavingGuest(true);
    try {
      await apiService.createGuest({
        username: guestForm.username,
        email: guestForm.email || undefined,
        accessDuration: guestForm.accessDuration * 3600,
        network: guestForm.network || undefined
      });
      toast.success('Guest account created');
      setGuestDialogOpen(false);
      await loadGuestData();
    } catch (err) {
      toast.error('Failed to create guest account', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setSavingGuest(false);
    }
  };

  const handleDeleteGuest = async (guest: any) => {
    const guestName = guest.username || guest.name || guest.id;
    if (!confirm(`Delete guest "${guestName}"? This cannot be undone.`)) return;
    try {
      await apiService.deleteGuest(guest.id);
      toast.success('Guest account deleted');
      await loadGuestData();
    } catch (err) {
      toast.error('Failed to delete guest', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  };

  const handleGenerateVoucher = async (guest: any) => {
    try {
      const voucher = await apiService.generateGuestVoucher(guest.id, 86400);
      toast.success('Voucher generated', {
        description: `Voucher code: ${voucher?.code || voucher?.voucherCode || 'Generated successfully'}`
      });
    } catch (err) {
      toast.error('Failed to generate voucher', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    }
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
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
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
            Configure guest networks, portals, access policies, and guest accounts
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
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Guest Networks</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{guestNetworks.length}</div>
            <p className="text-xs text-muted-foreground">Active guest SSIDs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Portal Profiles</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{eGuestProfiles.length}</div>
            <p className="text-xs text-muted-foreground">eGuest portal configurations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Guest Accounts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{guestAccounts.length}</div>
            <p className="text-xs text-muted-foreground">Registered guests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Guest Roles</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{guestRoles.length}</div>
            <p className="text-xs text-muted-foreground">Access policies</p>
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
          <TabsTrigger value="portals">
            <Globe className="mr-2 h-4 w-4" />
            Portal Profiles
          </TabsTrigger>
          <TabsTrigger value="accounts">
            <Users className="mr-2 h-4 w-4" />
            Guest Accounts
          </TabsTrigger>
          <TabsTrigger value="policies">
            <Shield className="mr-2 h-4 w-4" />
            Access Policies
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
                      <TableHead>eGuest Portal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {guestNetworks.map((network) => {
                      const ssid = network.ssid || network.serviceName || network.name || 'Unknown';
                      const isEnabled = network.enabled !== false && network.status !== 'disabled';
                      const hasCaptivePortal = network.captivePortal || network.enableCaptivePortal;

                      let securityType = 'Open';
                      if (network.WpaPskElement || network.privacy?.WpaPskElement) {
                        securityType = 'WPA/WPA2 PSK';
                      } else if (network.WpaEnterpriseElement || network.privacy?.WpaEnterpriseElement) {
                        securityType = 'WPA Enterprise';
                      } else if (network.WpaSaeElement || network.privacy?.WpaSaeElement) {
                        securityType = 'WPA3 SAE';
                      }

                      const portalProfile = network.eGuestPortalId
                        ? eGuestProfiles.find(p => p.id === network.eGuestPortalId)
                        : null;

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
                                <><CheckCircle className="mr-1 h-3 w-3" />Enabled</>
                              ) : (
                                <><XCircle className="mr-1 h-3 w-3" />Disabled</>
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
                                <Globe className="mr-1 h-3 w-3" />Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Not configured</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {portalProfile ? (
                              <Badge variant="outline">
                                {portalProfile.name || portalProfile.portalName}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">None</span>
                            )}
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

        {/* Portal Profiles Tab (eGuest CRUD) */}
        <TabsContent value="portals" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>eGuest Portal Profiles</CardTitle>
                  <CardDescription>
                    Create and manage captive portal configurations for guest access
                  </CardDescription>
                </div>
                <Button onClick={handleCreatePortal}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Portal
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {eGuestProfiles.length === 0 ? (
                <div className="text-center py-12">
                  <Globe className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                  <h3 className="mt-4 text-lg">No portal profiles configured</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Create an eGuest portal profile to customize the guest authentication experience
                  </p>
                  <Button onClick={handleCreatePortal} className="mt-4">
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Portal
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Portal Name</TableHead>
                      <TableHead>Authentication</TableHead>
                      <TableHead>Terms & Conditions</TableHead>
                      <TableHead>Session Timeout</TableHead>
                      <TableHead>Max Devices</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eGuestProfiles.map((portal) => (
                      <TableRow key={portal.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <span className="font-medium">{portal.name || portal.portalName || 'Unnamed'}</span>
                              {portal.description && (
                                <p className="text-xs text-muted-foreground">{portal.description}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {portal.authenticationType || portal.authType || 'Self Registration'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(portal.termsAndConditions || portal.termsEnabled) ? (
                            <Badge variant="default"><CheckCircle className="mr-1 h-3 w-3" />Enabled</Badge>
                          ) : (
                            <Badge variant="secondary">Disabled</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {portal.sessionTimeout ? `${Math.floor(portal.sessionTimeout / 60)} min` : 'Default'}
                        </TableCell>
                        <TableCell>
                          {portal.maxDevicesPerUser || portal.maxDevices || 'Unlimited'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEditPortal(portal)} title="Edit portal">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeletePortal(portal)}
                              className="text-destructive hover:text-destructive"
                              title="Delete portal"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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

        {/* Guest Accounts Tab */}
        <TabsContent value="accounts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Guest Accounts</CardTitle>
                  <CardDescription>
                    Create and manage guest user accounts and access vouchers
                  </CardDescription>
                </div>
                <Button onClick={handleCreateGuest}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create Guest
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {guestAccounts.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                  <h3 className="mt-4 text-lg">No guest accounts</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Create guest accounts for visitors to access the network
                  </p>
                  <Button onClick={handleCreateGuest} className="mt-4">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Create First Guest
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {guestAccounts.map((guest) => {
                      const status = guest.status || guest.accountStatus || 'unknown';
                      return (
                        <TableRow key={guest.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span>{guest.username || guest.name || guest.id}</span>
                            </div>
                          </TableCell>
                          <TableCell>{guest.email || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={status === 'active' ? 'default' : status === 'expired' ? 'destructive' : 'secondary'}>
                              {status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {guest.createdDate || guest.createTime ? new Date(guest.createdDate || guest.createTime).toLocaleString() : '-'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {guest.expiryDate || guest.expireTime ? new Date(guest.expiryDate || guest.expireTime).toLocaleString() : 'Never'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handleGenerateVoucher(guest)} title="Generate voucher">
                                <Ticket className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteGuest(guest)}
                                className="text-destructive hover:text-destructive"
                                title="Delete guest"
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
                            {role.cpOauthUseMicrosoft && <Badge variant="outline" className="text-xs">Microsoft OAuth</Badge>}
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
      </Tabs>

      {/* eGuest Portal Create/Edit Dialog */}
      <Dialog open={portalDialogOpen} onOpenChange={setPortalDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPortal ? 'Edit Portal Profile' : 'Create Portal Profile'}</DialogTitle>
            <DialogDescription>
              Configure the eGuest captive portal settings
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="portal-name">Portal Name *</Label>
              <Input
                id="portal-name"
                value={portalForm.name}
                onChange={(e) => setPortalForm({ ...portalForm, name: e.target.value })}
                placeholder="Guest Portal"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="portal-desc">Description</Label>
              <Input
                id="portal-desc"
                value={portalForm.description}
                onChange={(e) => setPortalForm({ ...portalForm, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="portal-auth">Authentication Type</Label>
              <Select value={portalForm.authType} onValueChange={(v) => setPortalForm({ ...portalForm, authType: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="selfRegistration">Self Registration</SelectItem>
                  <SelectItem value="preApproved">Pre-Approved</SelectItem>
                  <SelectItem value="socialLogin">Social Login</SelectItem>
                  <SelectItem value="voucher">Voucher Based</SelectItem>
                  <SelectItem value="radius">RADIUS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="portal-redirect">Success Redirect URL</Label>
              <Input
                id="portal-redirect"
                value={portalForm.redirectUrl}
                onChange={(e) => setPortalForm({ ...portalForm, redirectUrl: e.target.value })}
                placeholder="https://example.com/welcome"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label>Terms & Conditions</Label>
                <p className="text-xs text-muted-foreground">Require acceptance before access</p>
              </div>
              <Switch
                checked={portalForm.termsEnabled}
                onCheckedChange={(v) => setPortalForm({ ...portalForm, termsEnabled: v })}
              />
            </div>

            {portalForm.termsEnabled && (
              <div className="space-y-2">
                <Label htmlFor="portal-terms">Terms Text</Label>
                <Input
                  id="portal-terms"
                  value={portalForm.termsText}
                  onChange={(e) => setPortalForm({ ...portalForm, termsText: e.target.value })}
                  placeholder="By connecting you agree to..."
                />
              </div>
            )}

            <Separator />

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="portal-session">Session (sec)</Label>
                <Input
                  id="portal-session"
                  type="number"
                  value={portalForm.sessionTimeout}
                  onChange={(e) => setPortalForm({ ...portalForm, sessionTimeout: parseInt(e.target.value) || 3600 })}
                  min="60"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portal-idle">Idle (sec)</Label>
                <Input
                  id="portal-idle"
                  type="number"
                  value={portalForm.idleTimeout}
                  onChange={(e) => setPortalForm({ ...portalForm, idleTimeout: parseInt(e.target.value) || 600 })}
                  min="60"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portal-devices">Max Devices</Label>
                <Input
                  id="portal-devices"
                  type="number"
                  value={portalForm.maxDevices}
                  onChange={(e) => setPortalForm({ ...portalForm, maxDevices: parseInt(e.target.value) || 5 })}
                  min="1"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPortalDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePortal} disabled={savingPortal}>
              <Save className="mr-2 h-4 w-4" />
              {savingPortal ? 'Saving...' : editingPortal ? 'Update Portal' : 'Create Portal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guest Account Create Dialog */}
      <Dialog open={guestDialogOpen} onOpenChange={setGuestDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Guest Account</DialogTitle>
            <DialogDescription>
              Create a new guest user with time-limited access
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="guest-username">Username *</Label>
              <Input
                id="guest-username"
                value={guestForm.username}
                onChange={(e) => setGuestForm({ ...guestForm, username: e.target.value })}
                placeholder="guest-user"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="guest-email">Email</Label>
              <Input
                id="guest-email"
                type="email"
                value={guestForm.email}
                onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })}
                placeholder="guest@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="guest-duration">Access Duration (hours)</Label>
              <Select
                value={guestForm.accessDuration.toString()}
                onValueChange={(v) => setGuestForm({ ...guestForm, accessDuration: parseInt(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 hour</SelectItem>
                  <SelectItem value="4">4 hours</SelectItem>
                  <SelectItem value="8">8 hours</SelectItem>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="72">3 days</SelectItem>
                  <SelectItem value="168">7 days</SelectItem>
                  <SelectItem value="720">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {guestNetworks.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="guest-network">Assign to Network</Label>
                <Select
                  value={guestForm.network}
                  onValueChange={(v) => setGuestForm({ ...guestForm, network: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select network..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any network</SelectItem>
                    {guestNetworks.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.ssid || n.serviceName || n.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGuestDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveGuest} disabled={savingGuest}>
              <UserPlus className="mr-2 h-4 w-4" />
              {savingGuest ? 'Creating...' : 'Create Guest'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
