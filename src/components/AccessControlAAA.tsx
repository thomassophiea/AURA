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
import { Shield, Plus, Edit, Trash2, Server, Users, Key, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface AAAProfile {
  id: string;
  name: string;
  description: string;
  authMethod: 'radius' | 'ldap' | 'local';
  radiusServer?: string;
  radiusPort?: number;
  radiusSecret?: string;
  ldapServer?: string;
  ldapPort?: number;
  ldapBaseDN?: string;
  accountingEnabled: boolean;
  macAuthEnabled: boolean;
  enabled: boolean;
}

export function AccessControlAAA() {
  const [profiles, setProfiles] = useState<AAAProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<AAAProfile | null>(null);
  const [formData, setFormData] = useState<Partial<AAAProfile>>({
    name: '',
    description: '',
    authMethod: 'radius',
    accountingEnabled: false,
    macAuthEnabled: false,
    enabled: true
  });

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/access-control/aaa', {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        setProfiles(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      toast.error('Failed to load AAA profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!formData.name?.trim()) {
      toast.error('Profile name is required');
      return;
    }

    if (editingProfile) {
      setProfiles(profiles.map(p => p.id === editingProfile.id ? { ...editingProfile, ...formData } as AAAProfile : p));
      toast.success('AAA profile updated');
    } else {
      const newProfile: AAAProfile = {
        id: Date.now().toString(),
        ...formData as AAAProfile
      };
      setProfiles([...profiles, newProfile]);
      toast.success('AAA profile created');
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this AAA profile?')) {
      setProfiles(profiles.filter(p => p.id !== id));
      toast.success('AAA profile deleted');
    }
  };

  if (loading) return <div className="p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            AAA (Authentication, Authorization, Accounting)
          </h2>
          <p className="text-muted-foreground">Configure authentication and authorization profiles</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingProfile(null); setFormData({ name: '', authMethod: 'radius', enabled: true }); }}>
              <Plus className="h-4 w-4 mr-2" />
              Create Profile
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingProfile ? 'Edit' : 'Create'} AAA Profile</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Authentication Method</Label>
                <Select value={formData.authMethod} onValueChange={(v: any) => setFormData({ ...formData, authMethod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="radius">RADIUS</SelectItem>
                    <SelectItem value="ldap">LDAP</SelectItem>
                    <SelectItem value="local">Local</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.authMethod === 'radius' && (
                <div className="space-y-4 pl-4 border-l-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>RADIUS Server</Label>
                      <Input value={formData.radiusServer} onChange={(e) => setFormData({ ...formData, radiusServer: e.target.value })} placeholder="192.168.1.50" />
                    </div>
                    <div className="space-y-2">
                      <Label>Port</Label>
                      <Input type="number" value={formData.radiusPort} onChange={(e) => setFormData({ ...formData, radiusPort: parseInt(e.target.value) })} placeholder="1812" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Shared Secret</Label>
                    <Input type="password" value={formData.radiusSecret} onChange={(e) => setFormData({ ...formData, radiusSecret: e.target.value })} />
                  </div>
                </div>
              )}
              {formData.authMethod === 'ldap' && (
                <div className="space-y-4 pl-4 border-l-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>LDAP Server</Label>
                      <Input value={formData.ldapServer} onChange={(e) => setFormData({ ...formData, ldapServer: e.target.value })} placeholder="ldap.example.com" />
                    </div>
                    <div className="space-y-2">
                      <Label>Port</Label>
                      <Input type="number" value={formData.ldapPort} onChange={(e) => setFormData({ ...formData, ldapPort: parseInt(e.target.value) })} placeholder="389" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Base DN</Label>
                    <Input value={formData.ldapBaseDN} onChange={(e) => setFormData({ ...formData, ldapBaseDN: e.target.value })} placeholder="dc=example,dc=com" />
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label>Enable Accounting</Label>
                <Switch checked={formData.accountingEnabled} onCheckedChange={(c) => setFormData({ ...formData, accountingEnabled: c })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>MAC Authentication</Label>
                <Switch checked={formData.macAuthEnabled} onCheckedChange={(c) => setFormData({ ...formData, macAuthEnabled: c })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>{editingProfile ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AAA Profiles</CardTitle>
          <CardDescription>{profiles.length} profile(s) configured</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Server</TableHead>
                <TableHead>Accounting</TableHead>
                <TableHead>MAC Auth</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map(profile => (
                <TableRow key={profile.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{profile.name}</div>
                      <div className="text-xs text-muted-foreground">{profile.description}</div>
                    </div>
                  </TableCell>
                  <TableCell><Badge>{profile.authMethod.toUpperCase()}</Badge></TableCell>
                  <TableCell className="text-sm">{profile.radiusServer || profile.ldapServer || 'N/A'}</TableCell>
                  <TableCell>{profile.accountingEnabled ? <CheckCircle className="h-4 w-4 text-green-500" /> : '-'}</TableCell>
                  <TableCell>{profile.macAuthEnabled ? <CheckCircle className="h-4 w-4 text-green-500" /> : '-'}</TableCell>
                  <TableCell><Switch checked={profile.enabled} onCheckedChange={(c) => setProfiles(profiles.map(p => p.id === profile.id ? { ...p, enabled: c } : p))} /></TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setEditingProfile(profile); setFormData(profile); setDialogOpen(true); }}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(profile.id)}>
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
