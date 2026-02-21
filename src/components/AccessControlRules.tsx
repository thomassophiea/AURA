import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Skeleton } from './ui/skeleton';
import { Textarea } from './ui/textarea';
import { ListChecks, Plus, Edit, Trash2, GripVertical, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';

interface AccessRule {
  id: string;
  name: string;
  order: number;
  enabled: boolean;
  action: 'accept' | 'deny' | 'redirect';
  endSystemGroupId: string;
  deviceTypeGroupId: string;
  locationGroupId: string;
  timeGroupId: string;
  authType: string;
  policyRoleId: string;
  portalId: string;
  description: string;
}

interface GroupOption {
  id: string;
  name: string;
}

export function AccessControlRules() {
  const [rules, setRules] = useState<AccessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AccessRule | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    order: 1,
    enabled: true,
    action: 'accept' as 'accept' | 'deny' | 'redirect',
    endSystemGroupId: '',
    deviceTypeGroupId: '',
    locationGroupId: '',
    timeGroupId: '',
    authType: '',
    policyRoleId: '',
    portalId: '',
    description: ''
  });

  const [endSystemGroups, setEndSystemGroups] = useState<GroupOption[]>([]);
  const [deviceTypeGroups, setDeviceTypeGroups] = useState<GroupOption[]>([]);
  const [locationGroups, setLocationGroups] = useState<GroupOption[]>([]);
  const [timeGroups, setTimeGroups] = useState<GroupOption[]>([]);
  const [policyRoles, setPolicyRoles] = useState<GroupOption[]>([]);
  const [portals, setPortals] = useState<GroupOption[]>([]);

  const loadRules = async () => {
    setLoading(true);
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/accesscontrol/rules', {}, 8000);
      if (response.ok) {
        const data = await response.json();
        setRules(Array.isArray(data) ? data.sort((a: AccessRule, b: AccessRule) => a.order - b.order) : []);
      }
    } catch (error) {
      console.error('Failed to load access control rules:', error);
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDropdownOptions = async () => {
    try {
      const [esGroups, dtGroups, locGroups, tGroups, roles, portalList] = await Promise.all([
        apiService.makeAuthenticatedRequest('/v1/endsystemgroups', {}, 5000).then(r => r.ok ? r.json() : []).catch(() => []),
        apiService.makeAuthenticatedRequest('/v1/devicetypegroups', {}, 5000).then(r => r.ok ? r.json() : []).catch(() => []),
        apiService.makeAuthenticatedRequest('/v1/locationgroups', {}, 5000).then(r => r.ok ? r.json() : []).catch(() => []),
        apiService.makeAuthenticatedRequest('/v1/timegroups', {}, 5000).then(r => r.ok ? r.json() : []).catch(() => []),
        apiService.makeAuthenticatedRequest('/v1/roles', {}, 5000).then(r => r.ok ? r.json() : []).catch(() => []),
        apiService.makeAuthenticatedRequest('/v1/portals', {}, 5000).then(r => r.ok ? r.json() : []).catch(() => [])
      ]);
      setEndSystemGroups(Array.isArray(esGroups) ? esGroups : []);
      setDeviceTypeGroups(Array.isArray(dtGroups) ? dtGroups : []);
      setLocationGroups(Array.isArray(locGroups) ? locGroups : []);
      setTimeGroups(Array.isArray(tGroups) ? tGroups : []);
      setPolicyRoles(Array.isArray(roles) ? roles : []);
      setPortals(Array.isArray(portalList) ? portalList : []);
    } catch (error) {
      console.error('Failed to load dropdown options:', error);
    }
  };

  useEffect(() => {
    loadRules();
    loadDropdownOptions();
  }, []);

  const handleSaveRule = async () => {
    if (!formData.name.trim()) {
      toast.error('Rule name is required');
      return;
    }

    try {
      if (editingRule?.id) {
        await apiService.makeAuthenticatedRequest(`/v1/accesscontrol/rules/${editingRule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        toast.success('Rule updated');
      } else {
        await apiService.makeAuthenticatedRequest('/v1/accesscontrol/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        toast.success('Rule created');
      }
      setIsDialogOpen(false);
      loadRules();
    } catch (error) {
      toast.error('Failed to save rule');
    }
  };

  const handleDeleteRule = async (rule: AccessRule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await apiService.makeAuthenticatedRequest(`/v1/accesscontrol/rules/${rule.id}`, { method: 'DELETE' });
      toast.success('Rule deleted');
      loadRules();
    } catch (error) {
      toast.error('Failed to delete rule');
    }
  };

  const handleToggleEnabled = async (rule: AccessRule) => {
    try {
      await apiService.makeAuthenticatedRequest(`/v1/accesscontrol/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rule, enabled: !rule.enabled })
      });
      setRules(rules.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
      toast.success(`Rule ${!rule.enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      toast.error('Failed to update rule');
    }
  };

  const openCreateDialog = () => {
    setEditingRule(null);
    setFormData({
      name: '',
      order: rules.length + 1,
      enabled: true,
      action: 'accept',
      endSystemGroupId: '',
      deviceTypeGroupId: '',
      locationGroupId: '',
      timeGroupId: '',
      authType: '',
      policyRoleId: '',
      portalId: '',
      description: ''
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (rule: AccessRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      order: rule.order,
      enabled: rule.enabled,
      action: rule.action,
      endSystemGroupId: rule.endSystemGroupId || '',
      deviceTypeGroupId: rule.deviceTypeGroupId || '',
      locationGroupId: rule.locationGroupId || '',
      timeGroupId: rule.timeGroupId || '',
      authType: rule.authType || '',
      policyRoleId: rule.policyRoleId || '',
      portalId: rule.portalId || '',
      description: rule.description || ''
    });
    setIsDialogOpen(true);
  };

  const filteredRules = rules.filter(rule =>
    rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rule.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActionBadgeClass = (action: string) => {
    switch (action) {
      case 'accept': return 'bg-green-500 hover:bg-green-600';
      case 'deny': return 'bg-red-500 hover:bg-red-600';
      case 'redirect': return 'bg-blue-500 hover:bg-blue-600';
      default: return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ListChecks className="h-6 w-6" />
            Access Control Rules
          </h2>
          <p className="text-muted-foreground">Define rules for network access control and policy assignment</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Create Rule
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Access Rules</CardTitle>
              <CardDescription>{filteredRules.length} rule(s) configured (processed in order)</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search rules..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? 'No rules match your search' : 'No access control rules configured'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    </TableCell>
                    <TableCell className="font-medium">{rule.order}</TableCell>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <Badge className={getActionBadgeClass(rule.action)}>
                        {rule.action.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">
                      {rule.description || '-'}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => handleToggleEnabled(rule)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(rule)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDeleteRule(rule)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit' : 'Create'} Access Control Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Rule name"
                />
              </div>
              <div className="space-y-2">
                <Label>Order</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.order}
                  onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Action *</Label>
              <Select
                value={formData.action}
                onValueChange={(v: 'accept' | 'deny' | 'redirect') => setFormData({ ...formData, action: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accept">Accept</SelectItem>
                  <SelectItem value="deny">Deny</SelectItem>
                  <SelectItem value="redirect">Redirect</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Matching Conditions</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>End System Group</Label>
                  <Select
                    value={formData.endSystemGroupId}
                    onValueChange={(v) => setFormData({ ...formData, endSystemGroupId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any</SelectItem>
                      {endSystemGroups.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Device Type Group</Label>
                  <Select
                    value={formData.deviceTypeGroupId}
                    onValueChange={(v) => setFormData({ ...formData, deviceTypeGroupId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any</SelectItem>
                      {deviceTypeGroups.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Location Group</Label>
                  <Select
                    value={formData.locationGroupId}
                    onValueChange={(v) => setFormData({ ...formData, locationGroupId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any</SelectItem>
                      {locationGroups.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Time Group</Label>
                  <Select
                    value={formData.timeGroupId}
                    onValueChange={(v) => setFormData({ ...formData, timeGroupId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any</SelectItem>
                      {timeGroups.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Auth Type</Label>
              <Select
                value={formData.authType}
                onValueChange={(v) => setFormData({ ...formData, authType: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  <SelectItem value="dot1x">802.1X</SelectItem>
                  <SelectItem value="mac">MAC Auth</SelectItem>
                  <SelectItem value="captive">Captive Portal</SelectItem>
                  <SelectItem value="radius">RADIUS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.action === 'accept' && (
              <div className="space-y-2 border-t pt-4">
                <Label>Policy Role (for Accept action)</Label>
                <Select
                  value={formData.policyRoleId}
                  onValueChange={(v) => setFormData({ ...formData, policyRoleId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select policy role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {policyRoles.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.action === 'redirect' && (
              <div className="space-y-2 border-t pt-4">
                <Label>Portal (for Redirect action)</Label>
                <Select
                  value={formData.portalId}
                  onValueChange={(v) => setFormData({ ...formData, portalId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select portal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {portals.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center space-x-2 pt-2">
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(c) => setFormData({ ...formData, enabled: c })}
              />
              <Label htmlFor="enabled">Rule Enabled</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRule}>{editingRule ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
