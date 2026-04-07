import { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Globe, Plus, Trash2, ExternalLink, Shield, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';
import type { CaptivePortalConfig as CaptivePortalConfigType, CaptivePortalType, WalledGardenRule } from '../types/policy';

interface FormData {
  name: string;
  type: CaptivePortalType;
  enabled: boolean;
  mode: 'guest' | 'authenticated';
  welcomeMessage: string;
  termsAndConditions: string;
  externalUrl: string;
  redirectUrl: string;
  sessionTimeout: number;
  idleTimeout: number;
  walledGardenEnabled: boolean;
  walledGardenRules: Array<{ type: string; value: string }>;
  socialLoginEnabled: boolean;
  facebookEnabled: boolean;
  googleEnabled: boolean;
}

const defaultFormData: FormData = {
  name: '',
  type: 'internal',
  enabled: true,
  mode: 'guest',
  welcomeMessage: 'Welcome to our network',
  termsAndConditions: '',
  externalUrl: '',
  redirectUrl: '',
  sessionTimeout: 60,
  idleTimeout: 15,
  walledGardenEnabled: false,
  walledGardenRules: [],
  socialLoginEnabled: false,
  facebookEnabled: false,
  googleEnabled: false
};

export function CaptivePortalConfig() {
  const [portals, setPortals] = useState<CaptivePortalConfigType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPortal, setEditingPortal] = useState<CaptivePortalConfigType | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  const [formData, setFormData] = useState<FormData>(defaultFormData);

  const [newWalledGardenRule, setNewWalledGardenRule] = useState({ type: 'url', value: '' });

  useEffect(() => {
    loadPortals();
  }, []);

  const loadPortals = async () => {
    setLoading(true);
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/captiveportals', {}, 8000);
      if (response.ok) {
        const data = await response.json();
        setPortals(data || []);
      }
    } catch (error) {
      console.error('Failed to load captive portals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (portal: CaptivePortalConfigType | null = null) => {
    if (portal) {
      setEditingPortal(portal);
      setFormData({
        name: portal.name || '',
        type: portal.type || 'internal',
        enabled: portal.enabled ?? true,
        mode: portal.mode || 'guest',
        welcomeMessage: portal.welcomeMessage || 'Welcome to our network',
        termsAndConditions: portal.termsAndConditions || '',
        externalUrl: portal.externalUrl || '',
        redirectUrl: portal.redirectUrl || '',
        sessionTimeout: portal.sessionTimeout || 60,
        idleTimeout: portal.idleTimeout || 15,
        walledGardenEnabled: portal.walledGardenEnabled ?? false,
        walledGardenRules: portal.walledGardenRules?.map(r => ({ type: r.type, value: r.value })) || [],
        socialLoginEnabled: portal.socialLoginEnabled ?? false,
        facebookEnabled: portal.facebookEnabled ?? false,
        googleEnabled: portal.googleEnabled ?? false
      });
    } else {
      setEditingPortal(null);
      setFormData(defaultFormData);
    }
    setActiveTab('general');
    setIsDialogOpen(true);
  };

  const handleSavePortal = async () => {
    if (!formData.name.trim()) {
      toast.error('Portal name is required');
      return;
    }

    if (formData.type === 'external' && !formData.externalUrl.trim()) {
      toast.error('External URL is required for external portal type');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<CaptivePortalConfigType> = {
        name: formData.name,
        type: formData.type,
        enabled: formData.enabled,
        mode: formData.mode,
        welcomeMessage: formData.welcomeMessage,
        termsAndConditions: formData.termsAndConditions,
        externalUrl: formData.externalUrl,
        redirectUrl: formData.redirectUrl,
        sessionTimeout: formData.sessionTimeout,
        idleTimeout: formData.idleTimeout,
        walledGardenEnabled: formData.walledGardenEnabled,
        walledGardenRules: formData.walledGardenRules.map((r, i) => ({
          id: `rule-${i}`,
          name: `Rule ${i + 1}`,
          type: r.type as WalledGardenRule['type'],
          value: r.value,
          enabled: true
        })),
        redirectPorts: [80, 443],
        socialLoginEnabled: formData.socialLoginEnabled,
        facebookEnabled: formData.facebookEnabled,
        googleEnabled: formData.googleEnabled
      };

      if (editingPortal?.id) {
        await apiService.makeAuthenticatedRequest(`/v1/captiveportals/${editingPortal.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        }, 8000);
        toast.success('Portal updated successfully');
      } else {
        await apiService.makeAuthenticatedRequest('/v1/captiveportals', {
          method: 'POST',
          body: JSON.stringify(payload)
        }, 8000);
        toast.success('Portal created successfully');
      }

      setIsDialogOpen(false);
      await loadPortals();
    } catch (error) {
      toast.error('Failed to save portal', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePortal = async (portal: CaptivePortalConfigType) => {
    if (!confirm(`Delete portal "${portal.name}"? This cannot be undone.`)) return;

    try {
      await apiService.makeAuthenticatedRequest(`/v1/captiveportals/${portal.id}`, {
        method: 'DELETE'
      }, 8000);
      toast.success('Portal deleted successfully');
      await loadPortals();
    } catch (error) {
      toast.error('Failed to delete portal', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const addWalledGardenRule = () => {
    if (!newWalledGardenRule.value.trim()) {
      toast.error('Please enter a value for the walled garden rule');
      return;
    }
    setFormData({
      ...formData,
      walledGardenRules: [...formData.walledGardenRules, { ...newWalledGardenRule }]
    });
    setNewWalledGardenRule({ type: 'url', value: '' });
  };

  const removeWalledGardenRule = (index: number) => {
    setFormData({
      ...formData,
      walledGardenRules: formData.walledGardenRules.filter((_, i) => i !== index)
    });
  };

  const filteredPortals = portals.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Captive Portal Configuration</h1>
          <p className="text-muted-foreground">Configure guest access and authentication portals</p>
        </div>
        <Button onClick={() => handleOpenDialog(null)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Portal
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search portals..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={loadPortals}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Loading portals...
            </CardContent>
          </Card>
        ) : filteredPortals.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              {searchTerm ? 'No portals match your search' : 'No captive portals configured'}
            </CardContent>
          </Card>
        ) : (
          filteredPortals.map(portal => (
            <Card key={portal.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Globe className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">{portal.name}</div>
                    <div className="text-sm text-muted-foreground flex gap-2 mt-1">
                      <Badge variant="outline">{portal.type}</Badge>
                      <Badge variant={portal.enabled ? 'default' : 'secondary'}>
                        {portal.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      {portal.walledGardenEnabled && (
                        <Badge variant="outline">
                          <Shield className="h-3 w-3 mr-1" />
                          Walled Garden
                        </Badge>
                      )}
                      {portal.type === 'external' && portal.externalUrl && (
                        <Badge variant="outline">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          External
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(portal)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeletePortal(portal)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPortal ? 'Edit Portal' : 'Create Portal'}</DialogTitle>
            <DialogDescription>
              Configure captive portal settings for guest access
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="external">External</TabsTrigger>
              <TabsTrigger value="walled-garden">Walled Garden</TabsTrigger>
              <TabsTrigger value="session">Session</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Portal Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Guest Portal"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Portal Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v: CaptivePortalType) => setFormData({ ...formData, type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal Portal</SelectItem>
                    <SelectItem value="external">External Portal</SelectItem>
                    <SelectItem value="extremeguest">ExtremeGuest</SelectItem>
                    <SelectItem value="cwa">Centralized Web Auth (CWA)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Enabled</Label>
                  <p className="text-xs text-muted-foreground">Enable this captive portal</p>
                </div>
                <Switch
                  checked={formData.enabled}
                  onCheckedChange={(v) => setFormData({ ...formData, enabled: v })}
                />
              </div>

              {formData.type === 'internal' && (
                <div className="space-y-2">
                  <Label htmlFor="mode">Portal Mode</Label>
                  <Select
                    value={formData.mode}
                    onValueChange={(v: 'guest' | 'authenticated') => setFormData({ ...formData, mode: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="guest">Guest Access</SelectItem>
                      <SelectItem value="authenticated">Authenticated Access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </TabsContent>

            <TabsContent value="appearance" className="space-y-4 mt-4">
              {formData.type === 'internal' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="welcomeMessage">Welcome Message</Label>
                    <Input
                      id="welcomeMessage"
                      value={formData.welcomeMessage}
                      onChange={(e) => setFormData({ ...formData, welcomeMessage: e.target.value })}
                      placeholder="Welcome to our network"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="termsAndConditions">Terms & Conditions</Label>
                    <textarea
                      id="termsAndConditions"
                      className="w-full min-h-[150px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={formData.termsAndConditions}
                      onChange={(e) => setFormData({ ...formData, termsAndConditions: e.target.value })}
                      placeholder="Enter terms and conditions text..."
                    />
                  </div>
                </>
              )}

              {formData.type !== 'internal' && (
                <div className="p-4 text-center text-muted-foreground">
                  Appearance settings are only available for internal portals
                </div>
              )}
            </TabsContent>

            <TabsContent value="external" className="space-y-4 mt-4">
              {(formData.type === 'external' || formData.type === 'cwa') && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="externalUrl">External Portal URL *</Label>
                    <Input
                      id="externalUrl"
                      value={formData.externalUrl}
                      onChange={(e) => setFormData({ ...formData, externalUrl: e.target.value })}
                      placeholder="https://portal.example.com/login"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="redirectUrl">Success Redirect URL</Label>
                    <Input
                      id="redirectUrl"
                      value={formData.redirectUrl}
                      onChange={(e) => setFormData({ ...formData, redirectUrl: e.target.value })}
                      placeholder="https://example.com/welcome"
                    />
                  </div>
                </>
              )}

              {formData.type !== 'external' && formData.type !== 'cwa' && (
                <div className="p-4 text-center text-muted-foreground">
                  External URL settings are only available for external and CWA portals
                </div>
              )}
            </TabsContent>

            <TabsContent value="walled-garden" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable Walled Garden</Label>
                  <p className="text-xs text-muted-foreground">Allow access to specific URLs/IPs before authentication</p>
                </div>
                <Switch
                  checked={formData.walledGardenEnabled}
                  onCheckedChange={(v) => setFormData({ ...formData, walledGardenEnabled: v })}
                />
              </div>

              {formData.walledGardenEnabled && (
                <>
                  <div className="flex gap-2">
                    <Select
                      value={newWalledGardenRule.type}
                      onValueChange={(v) => setNewWalledGardenRule({ ...newWalledGardenRule, type: v })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="url">URL</SelectItem>
                        <SelectItem value="ip">IP Address</SelectItem>
                        <SelectItem value="domain">Domain</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      className="flex-1"
                      value={newWalledGardenRule.value}
                      onChange={(e) => setNewWalledGardenRule({ ...newWalledGardenRule, value: e.target.value })}
                      placeholder={
                        newWalledGardenRule.type === 'ip' ? '192.168.1.0/24' :
                        newWalledGardenRule.type === 'domain' ? '*.example.com' :
                        'https://example.com'
                      }
                    />
                    <Button onClick={addWalledGardenRule}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {formData.walledGardenRules.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground border rounded-md">
                        No walled garden rules configured
                      </div>
                    ) : (
                      formData.walledGardenRules.map((rule, index) => (
                        <div key={index} className="flex items-center justify-between p-2 border rounded-md">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{rule.type.toUpperCase()}</Badge>
                            <span className="text-sm">{rule.value}</span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeWalledGardenRule(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="session" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={formData.sessionTimeout}
                    onChange={(e) => setFormData({ ...formData, sessionTimeout: parseInt(e.target.value) || 60 })}
                    min="1"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="idleTimeout">Idle Timeout (minutes)</Label>
                  <Input
                    id="idleTimeout"
                    type="number"
                    value={formData.idleTimeout}
                    onChange={(e) => setFormData({ ...formData, idleTimeout: parseInt(e.target.value) || 15 })}
                    min="1"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Social Login</Label>
                    <p className="text-xs text-muted-foreground">Allow users to authenticate via social accounts</p>
                  </div>
                  <Switch
                    checked={formData.socialLoginEnabled}
                    onCheckedChange={(v) => setFormData({ ...formData, socialLoginEnabled: v })}
                  />
                </div>

                {formData.socialLoginEnabled && (
                  <div className="space-y-3 pl-4">
                    <div className="flex items-center justify-between">
                      <Label>Facebook</Label>
                      <Switch
                        checked={formData.facebookEnabled}
                        onCheckedChange={(v) => setFormData({ ...formData, facebookEnabled: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Google</Label>
                      <Switch
                        checked={formData.googleEnabled}
                        onCheckedChange={(v) => setFormData({ ...formData, googleEnabled: v })}
                      />
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePortal} disabled={saving}>
              {saving ? 'Saving...' : editingPortal ? 'Update Portal' : 'Create Portal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
