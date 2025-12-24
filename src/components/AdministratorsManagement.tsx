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
  Users,
  UserPlus,
  Edit,
  Trash2,
  Shield,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';

interface Administrator {
  id: string;
  username: string;
  email: string;
  role: 'super_admin' | 'admin' | 'operator' | 'viewer';
  enabled: boolean;
  lastLogin?: string;
  createdAt: string;
  twoFactorEnabled: boolean;
}

export function AdministratorsManagement() {
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Administrator | null>(null);
  const [apiNotAvailable, setApiNotAvailable] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'viewer' as Administrator['role'],
    enabled: true,
    twoFactorEnabled: false
  });

  useEffect(() => {
    loadAdministrators();
  }, []);

  const loadAdministrators = async () => {
    setLoading(true);
    try {
      console.log('[AdministratorsManagement] Fetching administrators from /v1/administrators...');

      const response = await apiService.makeAuthenticatedRequest('/v1/administrators', {
        method: 'GET'
      });

      console.log('[AdministratorsManagement] Response status:', response.status);
      console.log('[AdministratorsManagement] Response ok:', response.ok);

      if (response.ok) {
        const data = await response.json();
        console.log('[AdministratorsManagement] Raw API response:', data);
        console.log('[AdministratorsManagement] Response type:', typeof data, 'isArray:', Array.isArray(data));

        // Parse administrators data with flexible schema detection
        let rawAdmins: any[] = [];

        if (Array.isArray(data)) {
          rawAdmins = data;
        } else if (data && typeof data === 'object') {
          // Check for nested arrays in common property names
          const possibleKeys = ['administrators', 'admins', 'users', 'data', 'items', 'results'];
          for (const key of possibleKeys) {
            if (data[key] && Array.isArray(data[key])) {
              console.log('[AdministratorsManagement] Found administrators array at key:', key);
              rawAdmins = data[key];
              break;
            }
          }

          if (rawAdmins.length === 0) {
            console.log('[AdministratorsManagement] No admins found. Available keys:', Object.keys(data));
          }
        }

        console.log('[AdministratorsManagement] Parsed administrators count:', rawAdmins.length);
        if (rawAdmins.length > 0) {
          console.log('[AdministratorsManagement] Sample admin:', rawAdmins[0]);
        }

        // Transform Campus Controller format to our interface
        const adminList: Administrator[] = rawAdmins.map((admin: any) => {
          // Map adminRole from Campus Controller to our role format
          let role: Administrator['role'] = 'viewer';
          if (admin.adminRole === 'FULL' || admin.adminRole === 'SUPER_ADMIN') {
            role = 'super_admin';
          } else if (admin.adminRole === 'ADMIN' || admin.adminRole === 'NETWORK_ADMIN') {
            role = 'admin';
          } else if (admin.adminRole === 'OPERATOR' || admin.adminRole === 'NETWORK_OPERATOR') {
            role = 'operator';
          }

          return {
            id: admin.userId || admin.id || admin.username || 'unknown',
            username: admin.userId || admin.username || admin.name || 'unknown',
            email: admin.email || admin.properties?.email || `${admin.userId}@unknown.local`,
            role: role,
            enabled: admin.accountState === 'ENABLED' || admin.enabled === true,
            lastLogin: admin.lastLogin || admin.lastLoginTime || undefined,
            createdAt: admin.createdAt || admin.createTime || new Date().toISOString(),
            twoFactorEnabled: admin.twoFactorEnabled || admin.properties?.twoFactorEnabled || false
          };
        });

        console.log('[AdministratorsManagement] Transformed administrators:', adminList);

        setAdministrators(adminList);
        setApiNotAvailable(false);
      } else if (response.status === 404) {
        setApiNotAvailable(true);
        console.warn('[AdministratorsManagement] Administrators API endpoint not available (404)');
      } else {
        console.warn('[AdministratorsManagement] Unexpected response status:', response.status);
        setApiNotAvailable(true);
      }
    } catch (error) {
      console.error('[AdministratorsManagement] Failed to load administrators:', error);
      setApiNotAvailable(true);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (admin?: Administrator) => {
    if (admin) {
      setEditingAdmin(admin);
      setFormData({
        username: admin.username,
        email: admin.email,
        password: '',
        confirmPassword: '',
        role: admin.role,
        enabled: admin.enabled,
        twoFactorEnabled: admin.twoFactorEnabled
      });
    } else {
      setEditingAdmin(null);
      setFormData({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'viewer',
        enabled: true,
        twoFactorEnabled: false
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingAdmin(null);
    setFormData({
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'viewer',
      enabled: true,
      twoFactorEnabled: false
    });
  };

  const handleSaveAdministrator = async () => {
    // Validation
    if (!formData.username.trim()) {
      toast.error('Username is required');
      return;
    }

    if (!formData.email.trim()) {
      toast.error('Email is required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (!editingAdmin) {
      // Creating new admin - password required
      if (!formData.password) {
        toast.error('Password is required');
        return;
      }

      if (formData.password.length < 8) {
        toast.error('Password must be at least 8 characters');
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
    } else {
      // Editing existing admin - password optional
      if (formData.password && formData.password !== formData.confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
    }

    try {
      if (editingAdmin) {
        // Update existing administrator
        const updateData: any = {
          username: formData.username,
          email: formData.email,
          role: formData.role,
          enabled: formData.enabled,
          twoFactorEnabled: formData.twoFactorEnabled
        };

        if (formData.password) {
          updateData.password = formData.password;
        }

        const response = await apiService.makeAuthenticatedRequest(`/v1/administrators/${editingAdmin.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });

        if (response.ok) {
          toast.success('Administrator updated successfully');
          await loadAdministrators();
        } else {
          throw new Error('Failed to update administrator');
        }
      } else {
        // Create new administrator
        const response = await apiService.makeAuthenticatedRequest('/v1/administrators', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: formData.username,
            email: formData.email,
            password: formData.password,
            role: formData.role,
            enabled: formData.enabled,
            twoFactorEnabled: formData.twoFactorEnabled
          })
        });

        if (response.ok) {
          toast.success('Administrator created successfully');
          await loadAdministrators();
        } else {
          throw new Error('Failed to create administrator');
        }
      }

      handleCloseDialog();
    } catch (error) {
      toast.error('Failed to save administrator');
    }
  };

  const handleDeleteAdministrator = async (admin: Administrator) => {
    if (admin.role === 'super_admin') {
      toast.error('Cannot delete super admin account');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete administrator "${admin.username}"?`
    );

    if (!confirmed) return;

    try {
      const response = await apiService.makeAuthenticatedRequest(`/v1/administrators/${admin.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Administrator deleted successfully');
        await loadAdministrators();
      } else {
        throw new Error('Failed to delete administrator');
      }
    } catch (error) {
      toast.error('Failed to delete administrator');
    }
  };

  const handleToggleEnabled = async (admin: Administrator, enabled: boolean) => {
    if (admin.role === 'super_admin') {
      toast.error('Cannot disable super admin account');
      return;
    }

    try {
      const response = await apiService.makeAuthenticatedRequest(`/v1/administrators/${admin.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });

      if (response.ok) {
        toast.success(enabled ? 'Administrator enabled' : 'Administrator disabled');
        await loadAdministrators();
      } else {
        throw new Error('Failed to update administrator');
      }
    } catch (error) {
      toast.error('Failed to update administrator');
    }
  };

  const getRoleBadge = (role: Administrator['role']) => {
    const colors: Record<Administrator['role'], string> = {
      super_admin: 'bg-purple-500',
      admin: 'bg-blue-500',
      operator: 'bg-green-500',
      viewer: 'bg-gray-500'
    };

    const labels: Record<Administrator['role'], string> = {
      super_admin: 'Super Admin',
      admin: 'Admin',
      operator: 'Operator',
      viewer: 'Viewer'
    };

    return (
      <Badge className={colors[role]}>
        {labels[role]}
      </Badge>
    );
  };

  const getRoleDescription = (role: Administrator['role']) => {
    const descriptions: Record<Administrator['role'], string> = {
      super_admin: 'Full system access including user management',
      admin: 'Configuration and management access',
      operator: 'Operational access with limited configuration',
      viewer: 'Read-only access to view system status'
    };

    return descriptions[role];
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
              <Users className="h-5 w-5" />
              Administrators Management
            </CardTitle>
            <CardDescription>
              Configure system-wide user access and permissions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-end">
              <Button
                variant="default"
                size="sm"
                disabled={true}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Administrator
              </Button>
            </div>

            <Alert className="border-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                Administrators management API endpoints are not available on this controller version. This feature requires API v1/administrators support.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2 pt-2 border-t">
              <Button variant="ghost" size="sm" disabled className="text-muted-foreground">
                General
              </Button>
              <Button variant="ghost" size="sm" disabled className="text-muted-foreground">
                Roles
              </Button>
              <Button variant="ghost" size="sm" disabled className="text-muted-foreground">
                Permissions
              </Button>
              <Button variant="ghost" size="sm" disabled className="text-muted-foreground">
                Access Logs
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
            <Users className="h-6 w-6" />
            Administrators Management
          </h2>
          <p className="text-muted-foreground">
            Manage user accounts and permissions
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} disabled={apiNotAvailable}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Administrator
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingAdmin ? 'Edit Administrator' : 'Add Administrator'}
              </DialogTitle>
              <DialogDescription>
                {editingAdmin
                  ? 'Update administrator account details'
                  : 'Create a new administrator account'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="admin123"
                />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="admin@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label>Password {editingAdmin && '(leave blank to keep current)'}</Label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-2">
                <Label>Confirm Password</Label>
                <Input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: Administrator['role']) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">
                      <div>
                        <div className="font-medium">Super Admin</div>
                        <div className="text-xs text-muted-foreground">
                          Full system access
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div>
                        <div className="font-medium">Admin</div>
                        <div className="text-xs text-muted-foreground">
                          Configuration access
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="operator">
                      <div>
                        <div className="font-medium">Operator</div>
                        <div className="text-xs text-muted-foreground">
                          Operational access
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="viewer">
                      <div>
                        <div className="font-medium">Viewer</div>
                        <div className="text-xs text-muted-foreground">
                          Read-only access
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {getRoleDescription(formData.role)}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Account Enabled</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow user to log in
                  </p>
                </div>
                <Switch
                  checked={formData.enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Two-Factor Authentication</Label>
                  <p className="text-xs text-muted-foreground">
                    Require 2FA for login
                  </p>
                </div>
                <Switch
                  checked={formData.twoFactorEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, twoFactorEnabled: checked })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button onClick={handleSaveAdministrator}>
                {editingAdmin ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {apiNotAvailable && (
        <Alert className="border-yellow-500">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Administrators management API endpoints are not available on this controller version.
            This feature requires API v1/administrators support.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Administrator Accounts</CardTitle>
          <CardDescription>
            {administrators.length} administrator{administrators.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {administrators.map(admin => (
                <TableRow key={admin.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      {admin.username}
                    </div>
                  </TableCell>
                  <TableCell>{getRoleBadge(admin.role)}</TableCell>
                  <TableCell>
                    <Switch
                      checked={admin.enabled}
                      onCheckedChange={(checked) => handleToggleEnabled(admin, checked)}
                      disabled={admin.role === 'super_admin'}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenDialog(admin)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteAdministrator(admin)}
                        disabled={admin.role === 'super_admin'}
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
