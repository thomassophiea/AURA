import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { Users, Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface AccessGroup {
  id: string;
  name: string;
  description: string;
  vlan: number;
  bandwidth: number;
  memberCount: number;
}

export function AccessControlGroups() {
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AccessGroup | null>(null);
  const [formData, setFormData] = useState<Partial<AccessGroup>>({ name: '', description: '', vlan: 10, bandwidth: 100 });

  useEffect(() => {
    const loadGroups = async () => {
      setLoading(true);
      try {
        const response = await apiService.makeAuthenticatedRequest('/v1/access-control/groups', {
          method: 'GET'
        });

        if (response.ok) {
          const data = await response.json();
          setGroups(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        toast.error('Failed to load groups');
      } finally {
        setLoading(false);
      }
    };

    loadGroups();
  }, []);

  const handleSave = () => {
    if (!formData.name?.trim()) { toast.error('Group name required'); return; }
    if (editingGroup) {
      setGroups(groups.map(g => g.id === editingGroup.id ? { ...editingGroup, ...formData, memberCount: editingGroup.memberCount } as AccessGroup : g));
      toast.success('Group updated');
    } else {
      setGroups([...groups, { id: Date.now().toString(), ...formData, memberCount: 0 } as AccessGroup]);
      toast.success('Group created');
    }
    setDialogOpen(false);
  };

  if (loading) return <div className="p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Access Control Groups
          </h2>
          <p className="text-muted-foreground">Define user groups with access policies</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingGroup(null); setFormData({ name: '', vlan: 10, bandwidth: 100 }); }}>
              <Plus className="h-4 w-4 mr-2" />Create Group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingGroup ? 'Edit' : 'Create'} Group</DialogTitle></DialogHeader>
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
                <Label>VLAN</Label>
                <Input type="number" value={formData.vlan} onChange={(e) => setFormData({ ...formData, vlan: parseInt(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Bandwidth Limit (Mbps)</Label>
                <Input type="number" value={formData.bandwidth} onChange={(e) => setFormData({ ...formData, bandwidth: parseInt(e.target.value) })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>{editingGroup ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Access Groups</CardTitle>
          <CardDescription>{groups.length} group(s) configured</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>VLAN</TableHead>
                <TableHead>Bandwidth</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map(group => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{group.description}</TableCell>
                  <TableCell><Badge>VLAN {group.vlan}</Badge></TableCell>
                  <TableCell>{group.bandwidth} Mbps</TableCell>
                  <TableCell>{group.memberCount} users</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setEditingGroup(group); setFormData(group); setDialogOpen(true); }}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => { if (window.confirm('Delete group?')) { setGroups(groups.filter(g => g.id !== group.id)); toast.success('Group deleted'); } }}>
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
