import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertDescription } from './ui/alert';
import {
  Package,
  Plus,
  Edit,
  Trash2,
  Key,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';

interface Application {
  id: string;
  name: string;
  description: string;
  url?: string;
  version?: string;
  status: 'installed' | 'available' | 'running' | 'stopped';
  enabled: boolean;
  icon?: string;
}

export function ApplicationsManagement() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [apiNotAvailable, setApiNotAvailable] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    grantType: 'client_credentials' as Application['grantType'],
    scopes: [] as string[],
    enabled: true
  });

  const availableScopes = [
    'read:devices',
    'write:devices',
    'read:networks',
    'write:networks',
    'read:clients',
    'write:clients',
    'read:sites',
    'write:sites',
    'read:reports',
    'admin:users'
  ];

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    setLoading(true);
    try {
      console.log('[ApplicationsManagement] Fetching applications from /platformmanager/v1/apps...');

      const response = await apiService.makeAuthenticatedRequest('/platformmanager/v1/apps', {
        method: 'GET'
      });

      console.log('[ApplicationsManagement] Response status:', response.status);
      console.log('[ApplicationsManagement] Response ok:', response.ok);

      if (response.ok) {
        const data = await response.json();
        console.log('[ApplicationsManagement] Raw API response:', data);
        console.log('[ApplicationsManagement] Response type:', typeof data, 'isArray:', Array.isArray(data));

        // Parse applications data with flexible schema detection
        let rawApps: any[] = [];

        if (Array.isArray(data)) {
          rawApps = data;
        } else if (data && typeof data === 'object') {
          // Check for nested arrays in common property names
          const possibleKeys = ['applications', 'apps', 'oauthApplications', 'clients', 'data', 'items', 'results'];
          for (const key of possibleKeys) {
            if (data[key] && Array.isArray(data[key])) {
              console.log('[ApplicationsManagement] Found applications array at key:', key);
              rawApps = data[key];
              break;
            }
          }

          if (rawApps.length === 0) {
            console.log('[ApplicationsManagement] No apps found. Available keys:', Object.keys(data));
          }
        }

        console.log('[ApplicationsManagement] Parsed applications count:', rawApps.length);
        if (rawApps.length > 0) {
          console.log('[ApplicationsManagement] Sample app:', rawApps[0]);
        }

        // Transform Campus Controller format to our interface
        const appList: Application[] = rawApps.map((app: any, index: number) => {
          // Map status from Campus Controller
          let status: Application['status'] = 'available';
          if (app.status === 'installed' || app.state === 'installed' || app.installed === true) {
            status = 'installed';
          } else if (app.status === 'running' || app.state === 'running' || app.running === true) {
            status = 'running';
          } else if (app.status === 'stopped' || app.state === 'stopped') {
            status = 'stopped';
          }

          return {
            id: app.id || app.appId || app.applicationId || `app-${index}`,
            name: app.name || app.applicationName || app.title || `Application ${index + 1}`,
            description: app.description || app.desc || app.summary || '',
            url: app.url || app.endpoint || app.dashboardUrl || undefined,
            version: app.version || app.appVersion || undefined,
            status: status,
            enabled: app.enabled !== undefined ? app.enabled : app.status === 'running' || app.status === 'installed',
            icon: app.icon || app.iconUrl || undefined
          };
        });

        console.log('[ApplicationsManagement] Transformed applications:', appList);

        setApplications(appList);
        setApiNotAvailable(false);
      } else if (response.status === 404) {
        setApiNotAvailable(true);
        console.warn('[ApplicationsManagement] Applications API endpoint not available (404)');
      } else {
        console.warn('[ApplicationsManagement] Unexpected response status:', response.status);
        setApiNotAvailable(true);
      }
    } catch (error) {
      console.error('[ApplicationsManagement] Failed to load applications:', error);
      setApiNotAvailable(true);
    } finally {
      setLoading(false);
    }
  };

  const generateClientId = () => {
    return 'app-' + Math.random().toString(36).substring(2, 15);
  };

  const generateClientSecret = () => {
    return 'secret-' + Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  };

  const handleOpenDialog = (app?: Application) => {
    if (app) {
      setEditingApp(app);
      setFormData({
        name: app.name,
        description: app.description,
        grantType: app.grantType,
        scopes: app.scopes,
        enabled: app.enabled
      });
    } else {
      setEditingApp(null);
      setFormData({
        name: '',
        description: '',
        grantType: 'client_credentials',
        scopes: [],
        enabled: true
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingApp(null);
  };

  const handleSaveApplication = async () => {
    if (!formData.name.trim()) {
      toast.error('Application name is required');
      return;
    }

    if (formData.scopes.length === 0) {
      toast.error('At least one scope is required');
      return;
    }

    try {
      if (editingApp) {
        // Update existing application
        const updatedApps = applications.map(app =>
          app.id === editingApp.id
            ? {
                ...app,
                name: formData.name,
                description: formData.description,
                grantType: formData.grantType,
                scopes: formData.scopes,
                enabled: formData.enabled
              }
            : app
        );
        setApplications(updatedApps);
        toast.success('Application updated successfully');
      } else {
        // Create new application
        const newApp: Application = {
          id: Date.now().toString(),
          name: formData.name,
          description: formData.description,
          clientId: generateClientId(),
          clientSecret: generateClientSecret(),
          grantType: formData.grantType,
          scopes: formData.scopes,
          enabled: formData.enabled,
          createdAt: new Date().toISOString(),
          requestCount: 0
        };
        setApplications([...applications, newApp]);
        toast.success('Application created successfully. Save the client secret - it will not be shown again!');
      }

      handleCloseDialog();
    } catch (error) {
      toast.error('Failed to save application');
    }
  };

  const handleDeleteApplication = (app: Application) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete application "${app.name}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    setApplications(applications.filter(a => a.id !== app.id));
    toast.success('Application deleted successfully');
  };

  const handleToggleEnabled = (app: Application, enabled: boolean) => {
    const updatedApps = applications.map(a =>
      a.id === app.id ? { ...a, enabled } : a
    );
    setApplications(updatedApps);
    toast.success(enabled ? 'Application enabled' : 'Application disabled');
  };

  const handleRegenerateSecret = (app: Application) => {
    const confirmed = window.confirm(
      `Are you sure you want to regenerate the client secret for "${app.name}"? The old secret will stop working immediately.`
    );

    if (!confirmed) return;

    const newSecret = generateClientSecret();
    const updatedApps = applications.map(a =>
      a.id === app.id ? { ...a, clientSecret: newSecret } : a
    );
    setApplications(updatedApps);
    toast.success('Client secret regenerated. Save it now - it will not be shown again!');
  };

  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const toggleShowSecret = (appId: string) => {
    setShowSecrets(prev => ({ ...prev, [appId]: !prev[appId] }));
  };

  const handleToggleScope = (scope: string) => {
    setFormData(prev => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter(s => s !== scope)
        : [...prev.scopes, scope]
    }));
  };

  const getGrantTypeBadge = (grantType: Application['grantType']) => {
    const colors: Record<Application['grantType'], string> = {
      client_credentials: 'bg-blue-500',
      password: 'bg-yellow-500',
      authorization_code: 'bg-green-500'
    };

    const labels: Record<Application['grantType'], string> = {
      client_credentials: 'Client Credentials',
      password: 'Password',
      authorization_code: 'Authorization Code'
    };

    return (
      <Badge className={colors[grantType]}>
        {labels[grantType]}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (apiNotAvailable) {
    return (
      <div className="space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Applications Management
            </CardTitle>
            <CardDescription>
              Manage API applications and OAuth clients
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-end">
              <Button
                variant="default"
                size="sm"
                disabled={true}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Application
              </Button>
            </div>

            <Alert className="border-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                OAuth applications management API endpoints are not available on this Extreme Platform ONE version. This feature requires Extreme Platform ONE API v1/oauth/applications support.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2 pt-2 border-t">
              <Button variant="ghost" size="sm" disabled className="text-muted-foreground">
                OAuth Apps
              </Button>
              <Button variant="ghost" size="sm" disabled className="text-muted-foreground">
                API Keys
              </Button>
              <Button variant="ghost" size="sm" disabled className="text-muted-foreground">
                Webhooks
              </Button>
              <Button variant="ghost" size="sm" disabled className="text-muted-foreground">
                Integrations
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            Applications Management
          </h2>
          <p className="text-muted-foreground">
            Manage API applications and OAuth clients
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} disabled={apiNotAvailable}>
              <Plus className="h-4 w-4 mr-2" />
              Create Application
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingApp ? 'Edit Application' : 'Create Application'}
              </DialogTitle>
              <DialogDescription>
                {editingApp
                  ? 'Update application configuration'
                  : 'Create a new API application'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Application Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Integration App"
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of what this application does"
                />
              </div>

              <div className="space-y-2">
                <Label>Grant Type</Label>
                <Select
                  value={formData.grantType}
                  onValueChange={(value: Application['grantType']) => setFormData({ ...formData, grantType: value })}
                  disabled={!!editingApp}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client_credentials">Client Credentials (M2M)</SelectItem>
                    <SelectItem value="password">Password (User Auth)</SelectItem>
                    <SelectItem value="authorization_code">Authorization Code (OAuth)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>API Scopes</Label>
                <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg">
                  {availableScopes.map(scope => (
                    <div key={scope} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={scope}
                        checked={formData.scopes.includes(scope)}
                        onChange={() => handleToggleScope(scope)}
                        className="rounded"
                      />
                      <label htmlFor={scope} className="text-sm cursor-pointer">
                        {scope}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Enabled</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow API requests from this application
                  </p>
                </div>
                <Switch
                  checked={formData.enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button onClick={handleSaveApplication}>
                {editingApp ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API Applications</CardTitle>
          <CardDescription>
            {applications.length} application{applications.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Grant Type</TableHead>
                <TableHead>Client ID</TableHead>
                <TableHead>Client Secret</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map(app => (
                <TableRow key={app.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{app.name}</div>
                      <div className="text-xs text-muted-foreground">{app.description}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {app.scopes.slice(0, 2).map(scope => (
                          <Badge key={scope} variant="outline" className="text-xs">
                            {scope}
                          </Badge>
                        ))}
                        {app.scopes.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{app.scopes.length - 2}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{getGrantTypeBadge(app.grantType)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {app.clientId}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopyToClipboard(app.clientId, 'Client ID')}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {showSecrets[app.id] ? app.clientSecret : '••••••••••••'}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleShowSecret(app.id)}
                      >
                        {showSecrets[app.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                      {showSecrets[app.id] && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopyToClipboard(app.clientSecret, 'Client Secret')}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => handleRegenerateSecret(app)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Regenerate
                    </Button>
                  </TableCell>
                  <TableCell className="text-sm">
                    {app.requestCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {app.lastUsed ? new Date(app.lastUsed).toLocaleString() : 'Never'}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={app.enabled}
                      onCheckedChange={(checked) => handleToggleEnabled(app, checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenDialog(app)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteApplication(app)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
