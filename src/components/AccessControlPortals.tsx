import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Skeleton } from './ui/skeleton';
import { Globe, Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Portal {
  id: string;
  name: string;
  portalUrl: string;
  redirectUrl: string;
  sessionTimeout: number;
  enabled: boolean;
}

export function AccessControlPortals() {
  const [portals, setPortals] = useState<Portal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPortal, setEditingPortal] = useState<Portal | null>(null);
  const [formData, setFormData] = useState<Partial<Portal>>({ name: '', portalUrl: '', redirectUrl: '', sessionTimeout: 3600, enabled: true });

  useEffect(() => {
    const loadPortals = async () => {
      setLoading(true);
      try {
        const response = await apiService.makeAuthenticatedRequest('/v1/access-control/portals', {
          method: 'GET'
        });

        if (response.ok) {
          const data = await response.json();
          setPortals(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        toast.error('Failed to load portals');
      } finally {
        setLoading(false);
      }
    };

    loadPortals();
  }, []);

  const handleSave = () => {
    if (!formData.name?.trim()) { toast.error('Portal name required'); return; }
    if (editingPortal) {
      setPortals(portals.map(p => p.id === editingPortal.id ? { ...editingPortal, ...formData } as Portal : p));
      toast.success('Portal updated');
    } else {
      setPortals([...portals, { id: Date.now().toString(), ...formData } as Portal]);
      toast.success('Portal created');
    }
    setDialogOpen(false);
  };

  if (loading) return <div className="p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6" />
            Captive Portals
          </h2>
          <p className="text-muted-foreground">Configure guest and authentication portals</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingPortal(null); setFormData({ name: '', enabled: true, sessionTimeout: 3600 }); }}>
              <Plus className="h-4 w-4 mr-2" />Create Portal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingPortal ? 'Edit' : 'Create'} Portal</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Portal URL</Label>
                <Input value={formData.portalUrl} onChange={(e) => setFormData({ ...formData, portalUrl: e.target.value })} placeholder="https://portal.example.com" />
              </div>
              <div className="space-y-2">
                <Label>Redirect URL</Label>
                <Input value={formData.redirectUrl} onChange={(e) => setFormData({ ...formData, redirectUrl: e.target.value })} placeholder="https://example.com/welcome" />
              </div>
              <div className="space-y-2">
                <Label>Session Timeout (seconds)</Label>
                <Input type="number" value={formData.sessionTimeout} onChange={(e) => setFormData({ ...formData, sessionTimeout: parseInt(e.target.value) })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>{editingPortal ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Captive Portals</CardTitle>
          <CardDescription>{portals.length} portal(s) configured</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Portal URL</TableHead>
                <TableHead>Redirect URL</TableHead>
                <TableHead>Session Timeout</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portals.map(portal => (
                <TableRow key={portal.id}>
                  <TableCell className="font-medium">{portal.name}</TableCell>
                  <TableCell className="text-sm">{portal.portalUrl}</TableCell>
                  <TableCell className="text-sm">{portal.redirectUrl}</TableCell>
                  <TableCell>{portal.sessionTimeout}s</TableCell>
                  <TableCell><Switch checked={portal.enabled} onCheckedChange={(c) => setPortals(portals.map(p => p.id === portal.id ? { ...p, enabled: c } : p))} /></TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setEditingPortal(portal); setFormData(portal); setDialogOpen(true); }}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => { if (window.confirm('Delete portal?')) { setPortals(portals.filter(p => p.id !== portal.id)); toast.success('Portal deleted'); } }}>
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
