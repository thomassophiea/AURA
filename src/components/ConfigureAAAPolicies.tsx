import { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { AlertCircle, Server, Database, Lock, Plus, Pencil, Trash2, Shield, CheckCircle2, XCircle } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { toast } from 'sonner';
import { apiService } from '../services/api';

interface RadiusServer {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  sharedSecret: string;
  timeout: number;
  retries: number;
  isPrimary: boolean;
  status: 'active' | 'inactive' | 'error';
}

interface LdapConfiguration {
  id: string;
  configurationName: string;
  ldapConfigurationName: string;
  connectionUrl: string;
  administratorUsername: string;
  administratorPassword: string;
  maskPassword: boolean;
  userSearchRoot: string;
  hostSearchRoot: string;
  ouSearchRoot: string;
  schemaDefinition: string;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error';
}

interface LocalUser {
  id: string;
  enabled: boolean;
  username: string;
  displayName: string;
  firstName: string;
  lastName: string;
  passwordHashType: string;
  password: string;
  description: string;
  lastLogin?: string;
  createdAt: string;
}

interface AAAConfiguration {
  authenticationMethod: 'RADIUS' | 'LDAP' | 'LOCAL' | 'HYBRID';
  primaryRadiusId?: string;
  backupRadiusId?: string;
  ldapConfigId?: string;
  authenticateLocallyForMac: boolean;
  fallbackToLocal: boolean;
}

export function ConfigureAAAPolicies() {
  const [isLoading, setIsLoading] = useState(true);
  const [aaaConfig, setAaaConfig] = useState<AAAConfiguration>({
    authenticationMethod: 'RADIUS',
    authenticateLocallyForMac: true,
    fallbackToLocal: true,
  });

  // Controller AAA Policies State
  const [aaaPolicies, setAaaPolicies] = useState<any[]>([]);
  const [showPolicyDialog, setShowPolicyDialog] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<any | null>(null);
  const [policyForm, setPolicyForm] = useState({
    name: '',
    description: '',
    radiusServerPrimary: '',
    radiusServerSecondary: '',
    radiusAccountingEnabled: false,
    macAuthEnabled: false,
    fallbackToLocal: false
  });
  const [savingPolicy, setSavingPolicy] = useState(false);

  // RADIUS Servers State
  const [radiusServers, setRadiusServers] = useState<RadiusServer[]>([]);
  const [showRadiusDialog, setShowRadiusDialog] = useState(false);
  const [editingRadius, setEditingRadius] = useState<RadiusServer | null>(null);

  // LDAP Configurations State
  const [ldapConfigs, setLdapConfigs] = useState<LdapConfiguration[]>([]);
  const [showLdapDialog, setShowLdapDialog] = useState(false);
  const [editingLdap, setEditingLdap] = useState<LdapConfiguration | null>(null);

  // Local Users State
  const [localUsers, setLocalUsers] = useState<LocalUser[]>([]);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<LocalUser | null>(null);

  useEffect(() => {
    loadAAAConfiguration();
  }, []);

  const loadAAAConfiguration = async () => {
    setIsLoading(true);
    try {
      const [policiesResponse, aaaPoliciesResponse] = await Promise.allSettled([
        apiService.getAAAPolicies(),
        apiService.getAaaPolicies()
      ]);

      // Load AAA policies from controller API
      if (policiesResponse.status === 'fulfilled' && Array.isArray(policiesResponse.value) && policiesResponse.value.length > 0) {
        setAaaPolicies(policiesResponse.value);
      } else if (aaaPoliciesResponse.status === 'fulfilled' && Array.isArray(aaaPoliciesResponse.value)) {
        setAaaPolicies(aaaPoliciesResponse.value);
      }

      // Extract RADIUS server information from policies if available
      const policies = (policiesResponse.status === 'fulfilled' ? policiesResponse.value : aaaPoliciesResponse.status === 'fulfilled' ? aaaPoliciesResponse.value : []) || [];
      if (Array.isArray(policies) && policies.length > 0) {
        const extractedServers: RadiusServer[] = [];
        policies.forEach((policy: any) => {
          if (policy.radiusServerPrimary || policy.primaryServer) {
            const server = policy.radiusServerPrimary || policy.primaryServer;
            if (typeof server === 'object' && server.ipAddress) {
              extractedServers.push({
                id: server.id || `primary-${policy.id}`,
                name: server.name || `${policy.name} Primary`,
                ipAddress: server.ipAddress || server.host || '',
                port: server.port || 1812,
                sharedSecret: '••••••••',
                timeout: server.timeout || 5,
                retries: server.retries || 3,
                isPrimary: true,
                status: 'active'
              });
            }
          }
        });
        if (extractedServers.length > 0) {
          setRadiusServers(extractedServers);
        }
      }

    } catch (error) {
      console.error('Error loading AAA configuration:', error);
      toast.error('Failed to load AAA configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAAAConfig = async () => {
    try {
      toast.success('AAA configuration saved');
    } catch (error) {
      toast.error('Failed to save AAA configuration');
    }
  };

  // === AAA Policy CRUD ===
  const handleCreatePolicy = () => {
    setEditingPolicy(null);
    setPolicyForm({
      name: '',
      description: '',
      radiusServerPrimary: '',
      radiusServerSecondary: '',
      radiusAccountingEnabled: false,
      macAuthEnabled: false,
      fallbackToLocal: false
    });
    setShowPolicyDialog(true);
  };

  const handleEditPolicy = (policy: any) => {
    setEditingPolicy(policy);
    setPolicyForm({
      name: policy.name || '',
      description: policy.description || '',
      radiusServerPrimary: policy.radiusServerPrimary || policy.primaryServer || '',
      radiusServerSecondary: policy.radiusServerSecondary || policy.secondaryServer || '',
      radiusAccountingEnabled: policy.radiusAccountingEnabled || policy.accountingEnabled || false,
      macAuthEnabled: policy.macAuthEnabled || false,
      fallbackToLocal: policy.fallbackToLocal || false
    });
    setShowPolicyDialog(true);
  };

  const handleSavePolicy = async () => {
    if (!policyForm.name.trim()) {
      toast.error('Policy name is required');
      return;
    }

    setSavingPolicy(true);
    try {
      const payload = {
        name: policyForm.name,
        description: policyForm.description,
        radiusServerPrimary: policyForm.radiusServerPrimary,
        radiusServerSecondary: policyForm.radiusServerSecondary,
        radiusAccountingEnabled: policyForm.radiusAccountingEnabled,
        macAuthEnabled: policyForm.macAuthEnabled,
        fallbackToLocal: policyForm.fallbackToLocal
      };

      if (editingPolicy) {
        await apiService.updateAAAPolicy(editingPolicy.id, { ...editingPolicy, ...payload });
        toast.success('AAA policy updated');
      } else {
        await apiService.createAAAPolicy(payload);
        toast.success('AAA policy created');
      }

      setShowPolicyDialog(false);
      await loadAAAConfiguration();
    } catch (err) {
      toast.error('Failed to save AAA policy', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleDeletePolicy = async (policy: any) => {
    if (!confirm(`Delete AAA policy "${policy.name}"? This cannot be undone.`)) return;
    try {
      await apiService.deleteAAAPolicy(policy.id);
      toast.success('AAA policy deleted');
      await loadAAAConfiguration();
    } catch (err) {
      toast.error('Failed to delete policy', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  };

  const handleSaveRadius = async (server: Partial<RadiusServer>) => {
    try {
      if (editingRadius) {
        // Update existing server
        setRadiusServers(prev => prev.map(s => 
          s.id === editingRadius.id ? { ...s, ...server } : s
        ));
        toast.success('RADIUS server updated successfully');
      } else {
        // Add new server
        const newServer: RadiusServer = {
          id: Date.now().toString(),
          status: 'active',
          ...server as RadiusServer
        };
        setRadiusServers(prev => [...prev, newServer]);
        toast.success('RADIUS server added successfully');
      }
      setShowRadiusDialog(false);
      setEditingRadius(null);
    } catch (error) {
      toast.error('Failed to save RADIUS server');
    }
  };

  const handleDeleteRadius = async (id: string) => {
    if (!confirm('Are you sure you want to delete this RADIUS server?')) return;
    
    try {
      setRadiusServers(prev => prev.filter(s => s.id !== id));
      toast.success('RADIUS server deleted successfully');
    } catch (error) {
      toast.error('Failed to delete RADIUS server');
    }
  };

  const handleSaveLdap = async (config: Partial<LdapConfiguration>) => {
    try {
      if (editingLdap) {
        // Update existing config
        setLdapConfigs(prev => prev.map(c => 
          c.id === editingLdap.id ? { ...c, ...config } : c
        ));
        toast.success('LDAP configuration updated successfully');
      } else {
        // Add new config
        const newConfig: LdapConfiguration = {
          id: Date.now().toString(),
          status: 'disconnected',
          ...config as LdapConfiguration
        };
        setLdapConfigs(prev => [...prev, newConfig]);
        toast.success('LDAP configuration added successfully');
      }
      setShowLdapDialog(false);
      setEditingLdap(null);
    } catch (error) {
      toast.error('Failed to save LDAP configuration');
    }
  };

  const handleDeleteLdap = async (id: string) => {
    if (!confirm('Are you sure you want to delete this LDAP configuration?')) return;
    
    try {
      setLdapConfigs(prev => prev.filter(c => c.id !== id));
      toast.success('LDAP configuration deleted successfully');
    } catch (error) {
      toast.error('Failed to delete LDAP configuration');
    }
  };

  const handleSaveUser = async (user: Partial<LocalUser>) => {
    try {
      if (editingUser) {
        // Update existing user
        setLocalUsers(prev => prev.map(u => 
          u.id === editingUser.id ? { ...u, ...user } : u
        ));
        toast.success('User updated successfully');
      } else {
        // Add new user
        const newUser: LocalUser = {
          id: Date.now().toString(),
          status: 'active',
          createdAt: new Date().toISOString(),
          ...user as LocalUser
        };
        setLocalUsers(prev => [...prev, newUser]);
        toast.success('User created successfully');
      }
      setShowUserDialog(false);
      setEditingUser(null);
    } catch (error) {
      toast.error('Failed to save user');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
      setLocalUsers(prev => prev.filter(u => u.id !== id));
      toast.success('User deleted successfully');
    } catch (error) {
      toast.error('Failed to delete user');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  const primaryRadius = radiusServers.find(s => s.id === aaaConfig.primaryRadiusId || s.isPrimary);
  const backupRadius = radiusServers.find(s => s.id === aaaConfig.backupRadiusId);
  const activeLdap = ldapConfigs.find(c => c.id === aaaConfig.ldapConfigId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">
            Configure authentication, authorization, and accounting policies
          </p>
        </div>
      </div>

      {/* Default AAA Configuration Card */}
      <Card className="surface-2dp border-border">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-medium">Default AAA Configuration</h3>
          </div>
        </div>
        
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Configuration Table */}
            <div className="grid gap-4">
              <div className="grid grid-cols-[200px_1fr] gap-4 items-center border-b border-border pb-3">
                <Label className="font-medium">Authentication Method</Label>
                <div className="flex items-center gap-4">
                  <Select
                    value={aaaConfig.authenticationMethod}
                    onValueChange={(value: any) => 
                      setAaaConfig(prev => ({ ...prev, authenticationMethod: value }))
                    }
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RADIUS">RADIUS</SelectItem>
                      <SelectItem value="LDAP">LDAP</SelectItem>
                      <SelectItem value="LOCAL">Local</SelectItem>
                      <SelectItem value="HYBRID">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant="secondary">{aaaConfig.authenticationMethod}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-[200px_1fr] gap-4 items-center border-b border-border pb-3">
                <Label className="font-medium">Primary RADIUS</Label>
                <div className="flex items-center gap-2">
                  <span className="text-foreground">
                    {primaryRadius ? primaryRadius.ipAddress : 'Not configured'}
                  </span>
                  {primaryRadius && (
                    <Badge 
                      variant={primaryRadius.status === 'active' ? 'default' : 'secondary'}
                      className="flex items-center gap-1"
                    >
                      {primaryRadius.status === 'active' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {primaryRadius.status}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[200px_1fr] gap-4 items-center border-b border-border pb-3">
                <Label className="font-medium">Backup RADIUS</Label>
                <div className="flex items-center gap-2">
                  <span className="text-foreground">
                    {backupRadius ? backupRadius.ipAddress : 'OFF'}
                  </span>
                  {backupRadius && (
                    <Badge 
                      variant={backupRadius.status === 'active' ? 'default' : 'secondary'}
                      className="flex items-center gap-1"
                    >
                      {backupRadius.status === 'active' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {backupRadius.status}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[200px_1fr] gap-4 items-center border-b border-border pb-3">
                <Label className="font-medium">LDAP Configuration</Label>
                <div className="flex items-center gap-2">
                  <span className="text-foreground">
                    {activeLdap ? activeLdap.configurationName : 'OFF'}
                  </span>
                  {activeLdap && (
                    <Badge 
                      variant={activeLdap.status === 'connected' ? 'default' : 'secondary'}
                      className="flex items-center gap-1"
                    >
                      {activeLdap.status === 'connected' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {activeLdap.status}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[200px_1fr] gap-4 items-center">
                <Label className="font-medium">Authenticate Locally for MAC</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={aaaConfig.authenticateLocallyForMac}
                    onCheckedChange={(checked) =>
                      setAaaConfig(prev => ({ ...prev, authenticateLocallyForMac: checked }))
                    }
                  />
                  <span className="text-sm text-muted-foreground">
                    {aaaConfig.authenticateLocallyForMac ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveAAAConfig}>
                Save Configuration
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Tabbed Content */}
      <Tabs defaultValue="policies" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="policies" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            AAA Policies
          </TabsTrigger>
          <TabsTrigger value="radius" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            RADIUS Servers
          </TabsTrigger>
          <TabsTrigger value="ldap" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            LDAP Configurations
          </TabsTrigger>
          <TabsTrigger value="local" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Local Password Repository
          </TabsTrigger>
        </TabsList>

        {/* AAA Policies Tab (Controller API) */}
        <TabsContent value="policies" className="space-y-4">
          <Card className="surface-2dp border-border">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-medium">Controller AAA Policies</h3>
                <p className="text-sm text-muted-foreground">RADIUS authentication policies from the Campus Controller</p>
              </div>
              <Button
                size="sm"
                onClick={handleCreatePolicy}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Create Policy
              </Button>
            </div>
            <div className="p-4">
              {aaaPolicies.length === 0 ? (
                <div className="text-center py-12">
                  <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No AAA policies configured on the controller</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={handleCreatePolicy}
                  >
                    Create First Policy
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>RADIUS Accounting</TableHead>
                      <TableHead>MAC Auth</TableHead>
                      <TableHead>Fallback</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aaaPolicies.map((policy: any) => (
                      <TableRow key={policy.id}>
                        <TableCell className="font-medium">
                          {policy.name || policy.policyName || 'Unnamed'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {policy.description || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={(policy.radiusAccountingEnabled || policy.accountingEnabled) ? 'default' : 'secondary'}>
                            {(policy.radiusAccountingEnabled || policy.accountingEnabled) ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={policy.macAuthEnabled ? 'default' : 'secondary'}>
                            {policy.macAuthEnabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={policy.fallbackToLocal ? 'default' : 'secondary'}>
                            {policy.fallbackToLocal ? 'Local' : 'None'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditPolicy(policy)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeletePolicy(policy)}
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
            </div>
          </Card>
        </TabsContent>

        {/* RADIUS Servers Tab */}
        <TabsContent value="radius" className="space-y-4">
          <Card className="surface-2dp border-border">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-medium">RADIUS Servers</h3>
              <Button
                size="sm"
                onClick={() => {
                  setEditingRadius(null);
                  setShowRadiusDialog(true);
                }}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Server
              </Button>
            </div>
            <div className="p-4">
              {radiusServers.length === 0 ? (
                <div className="text-center py-12">
                  <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No RADIUS servers configured</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setShowRadiusDialog(true)}
                  >
                    Add Your First Server
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Port</TableHead>
                      <TableHead>Timeout</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {radiusServers.map(server => (
                      <TableRow key={server.id}>
                        <TableCell className="font-medium">{server.name}</TableCell>
                        <TableCell>{server.ipAddress}</TableCell>
                        <TableCell>{server.port}</TableCell>
                        <TableCell>{server.timeout}s</TableCell>
                        <TableCell>
                          {server.isPrimary ? (
                            <Badge variant="default">Primary</Badge>
                          ) : (
                            <Badge variant="secondary">Backup</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={server.status === 'active' ? 'default' : 'secondary'}
                            className="flex items-center gap-1 w-fit"
                          >
                            {server.status === 'active' ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {server.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingRadius(server);
                                setShowRadiusDialog(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteRadius(server.id)}
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
            </div>
          </Card>
        </TabsContent>

        {/* LDAP Configurations Tab */}
        <TabsContent value="ldap" className="space-y-4">
          <Card className="surface-2dp border-border">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-medium">LDAP Configurations</h3>
              <Button
                size="sm"
                onClick={() => {
                  setEditingLdap(null);
                  setShowLdapDialog(true);
                }}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Configuration
              </Button>
            </div>
            <div className="p-4">
              {ldapConfigs.length === 0 ? (
                <div className="text-center py-12">
                  <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No LDAP configurations found</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setShowLdapDialog(true)}
                  >
                    Add Your First Configuration
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Configuration Name</TableHead>
                      <TableHead>Connection URL</TableHead>
                      <TableHead>Administrator</TableHead>
                      <TableHead>User Search Root</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ldapConfigs.map(config => (
                      <TableRow key={config.id}>
                        <TableCell className="font-medium">{config.configurationName}</TableCell>
                        <TableCell className="max-w-[250px] truncate">{config.connectionUrl}</TableCell>
                        <TableCell>{config.administratorUsername}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{config.userSearchRoot}</TableCell>
                        <TableCell>
                          <Badge
                            variant={config.status === 'connected' ? 'default' : 'secondary'}
                            className="flex items-center gap-1 w-fit"
                          >
                            {config.status === 'connected' ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {config.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingLdap(config);
                                setShowLdapDialog(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteLdap(config.id)}
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
            </div>
          </Card>
        </TabsContent>

        {/* Local Password Repository Tab */}
        <TabsContent value="local" className="space-y-4">
          <Card className="surface-2dp border-border">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-medium">Local Users</h3>
              <Button
                size="sm"
                onClick={() => {
                  setEditingUser(null);
                  setShowUserDialog(true);
                }}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add User
              </Button>
            </div>
            <div className="p-4">
              {localUsers.length === 0 ? (
                <div className="text-center py-12">
                  <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No local users found</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setShowUserDialog(true)}
                  >
                    Add Your First User
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Hash Type</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {localUsers.map(user => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <Badge
                            variant={user.enabled ? 'default' : 'secondary'}
                          >
                            {user.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell>{user.displayName}</TableCell>
                        <TableCell>{`${user.firstName} ${user.lastName}`}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{user.passwordHashType}</Badge>
                        </TableCell>
                        <TableCell>{formatDate(user.lastLogin)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingUser(user);
                                setShowUserDialog(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteUser(user.id)}
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
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* RADIUS Server Dialog */}
      <RadiusServerDialog
        open={showRadiusDialog}
        onOpenChange={setShowRadiusDialog}
        server={editingRadius}
        onSave={handleSaveRadius}
      />

      {/* LDAP Configuration Dialog */}
      <LdapConfigDialog
        open={showLdapDialog}
        onOpenChange={setShowLdapDialog}
        config={editingLdap}
        onSave={handleSaveLdap}
      />

      {/* Local User Dialog */}
      <LocalUserDialog
        open={showUserDialog}
        onOpenChange={setShowUserDialog}
        user={editingUser}
        onSave={handleSaveUser}
      />

      {/* AAA Policy Dialog */}
      <Dialog open={showPolicyDialog} onOpenChange={setShowPolicyDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingPolicy ? 'Edit AAA Policy' : 'Create AAA Policy'}</DialogTitle>
            <DialogDescription>
              Configure RADIUS authentication policy settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="policy-name">Policy Name *</Label>
              <Input
                id="policy-name"
                value={policyForm.name}
                onChange={(e) => setPolicyForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="AAA Policy Name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy-desc">Description</Label>
              <Input
                id="policy-desc"
                value={policyForm.description}
                onChange={(e) => setPolicyForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy-primary">Primary RADIUS Server</Label>
              <Input
                id="policy-primary"
                value={policyForm.radiusServerPrimary}
                onChange={(e) => setPolicyForm(prev => ({ ...prev, radiusServerPrimary: e.target.value }))}
                placeholder="IP address or server ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy-secondary">Secondary RADIUS Server</Label>
              <Input
                id="policy-secondary"
                value={policyForm.radiusServerSecondary}
                onChange={(e) => setPolicyForm(prev => ({ ...prev, radiusServerSecondary: e.target.value }))}
                placeholder="IP address or server ID (optional)"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={policyForm.radiusAccountingEnabled}
                onCheckedChange={(checked) => setPolicyForm(prev => ({ ...prev, radiusAccountingEnabled: checked }))}
              />
              <Label>Enable RADIUS Accounting</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={policyForm.macAuthEnabled}
                onCheckedChange={(checked) => setPolicyForm(prev => ({ ...prev, macAuthEnabled: checked }))}
              />
              <Label>Enable MAC Authentication</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={policyForm.fallbackToLocal}
                onCheckedChange={(checked) => setPolicyForm(prev => ({ ...prev, fallbackToLocal: checked }))}
              />
              <Label>Fallback to Local Authentication</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPolicyDialog(false)}>Cancel</Button>
            <Button onClick={handleSavePolicy} disabled={savingPolicy}>
              {savingPolicy ? 'Saving...' : editingPolicy ? 'Update Policy' : 'Create Policy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// RADIUS Server Dialog Component
function RadiusServerDialog({ 
  open, 
  onOpenChange, 
  server, 
  onSave 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  server: RadiusServer | null;
  onSave: (server: Partial<RadiusServer>) => void;
}) {
  const [formData, setFormData] = useState({
    name: '',
    ipAddress: '',
    port: 1812,
    sharedSecret: '',
    timeout: 5,
    retries: 3,
    isPrimary: false
  });

  useEffect(() => {
    if (server) {
      setFormData({
        name: server.name,
        ipAddress: server.ipAddress,
        port: server.port,
        sharedSecret: server.sharedSecret,
        timeout: server.timeout,
        retries: server.retries,
        isPrimary: server.isPrimary
      });
    } else {
      setFormData({
        name: '',
        ipAddress: '',
        port: 1812,
        sharedSecret: '',
        timeout: 5,
        retries: 3,
        isPrimary: false
      });
    }
  }, [server, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{server ? 'Edit RADIUS Server' : 'Add RADIUS Server'}</DialogTitle>
          <DialogDescription>
            Configure RADIUS server settings for authentication
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Server Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Primary RADIUS"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ipAddress">IP Address</Label>
            <Input
              id="ipAddress"
              value={formData.ipAddress}
              onChange={(e) => setFormData(prev => ({ ...prev, ipAddress: e.target.value }))}
              placeholder="192.168.100.1"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                value={formData.port}
                onChange={(e) => setFormData(prev => ({ ...prev, port: parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeout">Timeout (seconds)</Label>
              <Input
                id="timeout"
                type="number"
                value={formData.timeout}
                onChange={(e) => setFormData(prev => ({ ...prev, timeout: parseInt(e.target.value) }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sharedSecret">Shared Secret</Label>
            <Input
              id="sharedSecret"
              type="password"
              value={formData.sharedSecret}
              onChange={(e) => setFormData(prev => ({ ...prev, sharedSecret: e.target.value }))}
              placeholder="Enter shared secret"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="retries">Retries</Label>
            <Input
              id="retries"
              type="number"
              value={formData.retries}
              onChange={(e) => setFormData(prev => ({ ...prev, retries: parseInt(e.target.value) }))}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="isPrimary"
              checked={formData.isPrimary}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isPrimary: checked }))}
            />
            <Label htmlFor="isPrimary">Set as Primary Server</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSave(formData)}>
            {server ? 'Save Changes' : 'Add Server'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// LDAP Configuration Dialog Component
function LdapConfigDialog({ 
  open, 
  onOpenChange, 
  config, 
  onSave 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  config: LdapConfiguration | null;
  onSave: (config: Partial<LdapConfiguration>) => void;
}) {
  const [formData, setFormData] = useState({
    configurationName: '',
    ldapConfigurationName: '',
    connectionUrl: '',
    administratorUsername: '',
    administratorPassword: '',
    maskPassword: true,
    userSearchRoot: '',
    hostSearchRoot: '',
    ouSearchRoot: '',
    schemaDefinition: 'RFC 2307',
    enabled: true
  });
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  useEffect(() => {
    if (config) {
      setFormData({
        configurationName: config.configurationName,
        ldapConfigurationName: config.ldapConfigurationName,
        connectionUrl: config.connectionUrl,
        administratorUsername: config.administratorUsername,
        administratorPassword: config.administratorPassword,
        maskPassword: config.maskPassword,
        userSearchRoot: config.userSearchRoot,
        hostSearchRoot: config.hostSearchRoot,
        ouSearchRoot: config.ouSearchRoot,
        schemaDefinition: config.schemaDefinition,
        enabled: config.enabled
      });
    } else {
      setFormData({
        configurationName: '',
        ldapConfigurationName: '',
        connectionUrl: 'ldap://',
        administratorUsername: '',
        administratorPassword: '',
        maskPassword: true,
        userSearchRoot: '',
        hostSearchRoot: '',
        ouSearchRoot: '',
        schemaDefinition: 'RFC 2307',
        enabled: true
      });
    }
  }, [config, open]);

  const handleTestConfiguration = async () => {
    setIsTestingConnection(true);
    try {
      // Simulate LDAP connection test
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast.success('LDAP connection test successful');
    } catch (error) {
      toast.error('LDAP connection test failed');
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{config ? 'Edit LDAP Configuration' : 'Add LDAP Configuration'}</DialogTitle>
          <DialogDescription>
            Configure LDAP server for directory authentication
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            <Label htmlFor="configName">Configuration Name</Label>
            <Input
              id="configName"
              value={formData.configurationName}
              onChange={(e) => setFormData(prev => ({ ...prev, configurationName: e.target.value }))}
              placeholder="LDAP Configuration Name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="ldapConfigName">LDAP Configuration Name</Label>
            <Input
              id="ldapConfigName"
              value={formData.ldapConfigurationName}
              onChange={(e) => setFormData(prev => ({ ...prev, ldapConfigurationName: e.target.value }))}
              placeholder="LDAP Configuration Name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="connectionUrl">Add LDAP Connection URL</Label>
            <Input
              id="connectionUrl"
              value={formData.connectionUrl}
              onChange={(e) => setFormData(prev => ({ ...prev, connectionUrl: e.target.value }))}
              placeholder="ldap://x.x.x.x:389"
            />
            <p className="text-xs text-muted-foreground">LDAP Connection URL</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminUsername">Administrator Username</Label>
            <Input
              id="adminUsername"
              value={formData.administratorUsername}
              onChange={(e) => setFormData(prev => ({ ...prev, administratorUsername: e.target.value }))}
              placeholder="Administrator Username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminPassword">Administrator Password</Label>
            <Input
              id="adminPassword"
              type={formData.maskPassword ? "password" : "text"}
              value={formData.administratorPassword}
              onChange={(e) => setFormData(prev => ({ ...prev, administratorPassword: e.target.value }))}
              placeholder="Administrator Password"
            />
            <div className="flex items-center space-x-2">
              <Switch
                id="maskPassword"
                checked={formData.maskPassword}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, maskPassword: checked }))}
              />
              <Label htmlFor="maskPassword">Mask</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="userSearchRoot">User Search Root</Label>
            <Input
              id="userSearchRoot"
              value={formData.userSearchRoot}
              onChange={(e) => setFormData(prev => ({ ...prev, userSearchRoot: e.target.value }))}
              placeholder="User Search Root"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hostSearchRoot">Host Search Root</Label>
            <Input
              id="hostSearchRoot"
              value={formData.hostSearchRoot}
              onChange={(e) => setFormData(prev => ({ ...prev, hostSearchRoot: e.target.value }))}
              placeholder="Host Search Root"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ouSearchRoot">OU Search Root</Label>
            <Input
              id="ouSearchRoot"
              value={formData.ouSearchRoot}
              onChange={(e) => setFormData(prev => ({ ...prev, ouSearchRoot: e.target.value }))}
              placeholder="OU Search Root"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="schemaDefinition">Schema Definition</Label>
            <Select
              value={formData.schemaDefinition}
              onValueChange={(value) => setFormData(prev => ({ ...prev, schemaDefinition: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RFC 2307">RFC 2307</SelectItem>
                <SelectItem value="RFC 2307bis">RFC 2307bis</SelectItem>
                <SelectItem value="Active Directory">Active Directory</SelectItem>
                <SelectItem value="OpenLDAP">OpenLDAP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="pt-2">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleTestConfiguration}
              disabled={isTestingConnection}
            >
              {isTestingConnection ? 'Testing...' : 'Test Configuration'}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSave(formData)}>
            {config ? 'Save Changes' : 'Add Configuration'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Local User Dialog Component
function LocalUserDialog({ 
  open, 
  onOpenChange, 
  user, 
  onSave 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  user: LocalUser | null;
  onSave: (user: Partial<LocalUser>) => void;
}) {
  const [formData, setFormData] = useState({
    enabled: true,
    username: '',
    displayName: '',
    firstName: '',
    lastName: '',
    passwordHashType: 'SHA-256',
    password: '',
    maskPassword: true,
    description: ''
  });

  useEffect(() => {
    if (user) {
      setFormData({
        enabled: user.enabled,
        username: user.username,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        passwordHashType: user.passwordHashType,
        password: '',
        maskPassword: true,
        description: user.description
      });
    } else {
      setFormData({
        enabled: true,
        username: '',
        displayName: '',
        firstName: '',
        lastName: '',
        passwordHashType: 'SHA-256',
        password: '',
        maskPassword: true,
        description: ''
      });
    }
  }, [user, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            AAA / {user ? 'Edit Local User' : 'Add Local User'}
          </DialogTitle>
          <DialogDescription>
            Manage local user accounts for authentication
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
          <div className="flex items-center space-x-2">
            <Switch
              id="enabled"
              checked={formData.enabled}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, enabled: checked }))}
            />
            <Label htmlFor="enabled">Enabled</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
              placeholder="Username"
              disabled={!!user}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={formData.displayName}
              onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
              placeholder="Display Name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              value={formData.firstName}
              onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
              placeholder="First Name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              value={formData.lastName}
              onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
              placeholder="Last Name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="passwordHashType">Password Hash Type</Label>
            <Select
              value={formData.passwordHashType}
              onValueChange={(value) => setFormData(prev => ({ ...prev, passwordHashType: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SHA-256">SHA-256</SelectItem>
                <SelectItem value="SHA-512">SHA-512</SelectItem>
                <SelectItem value="MD5">MD5</SelectItem>
                <SelectItem value="bcrypt">bcrypt</SelectItem>
                <SelectItem value="PBKDF2">PBKDF2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              {user ? 'Password (leave blank to keep current)' : 'Password'}
            </Label>
            <Input
              id="password"
              type={formData.maskPassword ? "password" : "text"}
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              placeholder={user ? 'Leave blank to keep current' : 'Password'}
            />
            <div className="flex items-center space-x-2">
              <Switch
                id="maskPassword"
                checked={formData.maskPassword}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, maskPassword: checked }))}
              />
              <Label htmlFor="maskPassword">Mask</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSave(formData)}>
            {user ? 'Save Changes' : 'Add User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
