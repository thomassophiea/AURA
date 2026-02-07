import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Radio, RefreshCw, AlertCircle, Plus, Edit, Trash2 } from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface RFProfile {
  id: string;
  name: string;
  custId?: string;
  canEdit: boolean;
  canDelete: boolean;
  type: string;
  smartRf?: {
    basic: {
      sensitivity: string;
      coverageHoleRecovery: boolean;
      interferenceRecovery: boolean;
      neighborRecovery: boolean;
    };
    powerAndChannel?: {
      bandSettings?: any[];
    };
    scanning?: any;
    neighbourRecovery?: any;
    interferenceRecovery?: any;
    coverageHoleRecovery?: any;
  };
  acs?: any;
  xaiRf?: any;
  [key: string]: any;
}

const defaultRFForm = {
  name: '',
  type: 'SmartRf' as string,
  sensitivity: 'Medium' as string,
  coverageHoleRecovery: true,
  interferenceRecovery: true,
  neighborRecovery: true,
};

export function RFManagementTools() {
  const [profiles, setProfiles] = useState<RFProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<RFProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [rfForm, setRfForm] = useState(defaultRFForm);

  useEffect(() => {
    loadRFProfiles();
  }, []);

  const loadRFProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.getRFManagementProfiles();
      setProfiles(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load RF profiles');
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRFProfiles();
    setRefreshing(false);
    toast.success('RF profiles refreshed');
  };

  const handleCreate = () => {
    setEditingProfile(null);
    setRfForm(defaultRFForm);
    setShowDialog(true);
  };

  const handleEdit = (profile: RFProfile) => {
    setEditingProfile(profile);
    setRfForm({
      name: profile.name || '',
      type: profile.type || 'SmartRf',
      sensitivity: profile.smartRf?.basic?.sensitivity || 'Medium',
      coverageHoleRecovery: profile.smartRf?.basic?.coverageHoleRecovery ?? true,
      interferenceRecovery: profile.smartRf?.basic?.interferenceRecovery ?? true,
      neighborRecovery: profile.smartRf?.basic?.neighborRecovery ?? true,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!rfForm.name.trim()) {
      toast.error('Profile name is required');
      return;
    }
    setSaving(true);
    try {
      const profileData: any = {
        name: rfForm.name.trim(),
        type: rfForm.type,
      };
      if (rfForm.type === 'SmartRf') {
        profileData.smartRf = {
          basic: {
            sensitivity: rfForm.sensitivity,
            coverageHoleRecovery: rfForm.coverageHoleRecovery,
            interferenceRecovery: rfForm.interferenceRecovery,
            neighborRecovery: rfForm.neighborRecovery,
          },
        };
      }
      if (editingProfile) {
        profileData.id = editingProfile.id;
        profileData.custId = editingProfile.custId;
        await apiService.updateRFManagementProfile(editingProfile.id, { ...editingProfile, ...profileData });
        toast.success('RF profile updated');
      } else {
        await apiService.createRFManagementProfile(profileData);
        toast.success('RF profile created');
      }
      setShowDialog(false);
      loadRFProfiles();
    } catch (err) {
      toast.error(editingProfile ? 'Failed to update RF profile' : 'Failed to create RF profile', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (profile: RFProfile) => {
    if (!profile.canDelete) {
      toast.error('This profile cannot be deleted');
      return;
    }
    if (!confirm(`Delete RF profile "${profile.name}"?`)) return;
    try {
      await apiService.deleteRFManagementProfile(profile.id);
      toast.success('RF profile deleted');
      loadRFProfiles();
    } catch (err) {
      toast.error('Failed to delete RF profile', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Radio className="h-8 w-8" />
              RF Management
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage RF profiles, Smart RF settings, and wireless optimization
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Profile
            </Button>
          </div>
        </div>

        {error && (
          <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>RF Management Profiles ({profiles.length})</CardTitle>
            <CardDescription>
              SmartRF, ACS, and XAI RF optimization profiles
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : profiles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Radio className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No RF profiles found</p>
                <Button onClick={handleCreate} variant="outline" className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Profile
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profile Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Smart RF Settings</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">{profile.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{profile.type}</Badge>
                      </TableCell>
                      <TableCell>
                        {profile.smartRf ? (
                          <div className="text-sm space-y-1">
                            <div>Sensitivity: <Badge variant="secondary" className="text-xs">{profile.smartRf.basic?.sensitivity || 'N/A'}</Badge></div>
                            <div className="flex gap-1 flex-wrap">
                              {profile.smartRf.basic?.coverageHoleRecovery && (
                                <Badge variant="secondary" className="text-xs">Coverage Recovery</Badge>
                              )}
                              {profile.smartRf.basic?.interferenceRecovery && (
                                <Badge variant="secondary" className="text-xs">Interference Recovery</Badge>
                              )}
                              {profile.smartRf.basic?.neighborRecovery && (
                                <Badge variant="secondary" className="text-xs">Neighbor Recovery</Badge>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={profile.canEdit ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                          {profile.canEdit ? 'Editable' : 'Read-only'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(profile)} disabled={!profile.canEdit}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(profile)} disabled={!profile.canDelete}>
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

        {/* Create/Edit Slide-out */}
        <Sheet open={showDialog} onOpenChange={setShowDialog}>
          <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{editingProfile ? 'Edit RF Profile' : 'Create RF Profile'}</SheetTitle>
              <SheetDescription>
                Configure RF management policy settings
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="rfName">Profile Name</Label>
                <Input
                  id="rfName"
                  value={rfForm.name}
                  onChange={(e) => setRfForm({ ...rfForm, name: e.target.value })}
                  placeholder="My RF Profile"
                />
              </div>

              <div>
                <Label>Policy Type</Label>
                <Select value={rfForm.type} onValueChange={(value) => setRfForm({ ...rfForm, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SmartRf">Smart RF</SelectItem>
                    <SelectItem value="Acs">ACS (Automatic Channel Selection)</SelectItem>
                    <SelectItem value="Xai">XAI RF</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {rfForm.type === 'SmartRf' && (
                <div className="space-y-4 border rounded-lg p-4">
                  <h4 className="text-sm font-medium">Smart RF Settings</h4>
                  <div>
                    <Label>Sensitivity</Label>
                    <Select value={rfForm.sensitivity} onValueChange={(value) => setRfForm({ ...rfForm, sensitivity: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Coverage Hole Recovery</Label>
                    <Switch checked={rfForm.coverageHoleRecovery} onCheckedChange={(v) => setRfForm({ ...rfForm, coverageHoleRecovery: v })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Interference Recovery</Label>
                    <Switch checked={rfForm.interferenceRecovery} onCheckedChange={(v) => setRfForm({ ...rfForm, interferenceRecovery: v })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Neighbor Recovery</Label>
                    <Switch checked={rfForm.neighborRecovery} onCheckedChange={(v) => setRfForm({ ...rfForm, neighborRecovery: v })} />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : editingProfile ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
