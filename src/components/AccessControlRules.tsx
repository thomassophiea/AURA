import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Skeleton } from './ui/skeleton';
import { ListChecks, Plus, Edit, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';

interface AccessRule {
  id: string;
  name: string;
  priority: number;
  condition: 'ssid' | 'mac' | 'username' | 'vlan';
  conditionValue: string;
  action: 'allow' | 'deny' | 'redirect';
  group: string;
  enabled: boolean;
}

export function AccessControlRules() {
  const [rules, setRules] = useState<AccessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AccessRule | null>(null);
  const [formData, setFormData] = useState<Partial<AccessRule>>({ name: '', priority: 100, condition: 'ssid', action: 'allow', enabled: true });

  useEffect(() => {
    const loadRules = async () => {
      setLoading(true);
      try {
        const response = await apiService.makeAuthenticatedRequest('/v1/access-control/rules', {
          method: 'GET'
        });

        if (response.ok) {
          const data = await response.json();
          setRules(Array.isArray(data) ? data.sort((a: AccessRule, b: AccessRule) => a.priority - b.priority) : []);
        }
      } catch (error) {
        toast.error('Failed to load rules');
      } finally {
        setLoading(false);
      }
    };

    loadRules();
  }, []);

  const handleSave = () => {
    if (!formData.name?.trim()) { toast.error('Rule name required'); return; }
    if (editingRule) {
      setRules(rules.map(r => r.id === editingRule.id ? { ...editingRule, ...formData } as AccessRule : r).sort((a, b) => a.priority - b.priority));
      toast.success('Rule updated');
    } else {
      setRules([...rules, { id: Date.now().toString(), ...formData } as AccessRule].sort((a, b) => a.priority - b.priority));
      toast.success('Rule created');
    }
    setDialogOpen(false);
  };

  const movePriority = (id: string, direction: 'up' | 'down') => {
    const idx = rules.findIndex(r => r.id === id);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === rules.length - 1) return;

    const newRules = [...rules];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newRules[idx].priority, newRules[swapIdx].priority] = [newRules[swapIdx].priority, newRules[idx].priority];
    setRules(newRules.sort((a, b) => a.priority - b.priority));
    toast.success('Priority updated');
  };

  if (loading) return <div className="p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ListChecks className="h-6 w-6" />
            Access Control Rules
          </h2>
          <p className="text-muted-foreground">Define rules for client access and group assignment</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingRule(null); setFormData({ name: '', priority: 100, condition: 'ssid', action: 'allow', enabled: true }); }}>
              <Plus className="h-4 w-4 mr-2" />Create Rule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingRule ? 'Edit' : 'Create'} Rule</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Priority (lower = higher priority)</Label>
                <Input type="number" value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Condition Type</Label>
                <Select value={formData.condition} onValueChange={(v: any) => setFormData({ ...formData, condition: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ssid">SSID</SelectItem>
                    <SelectItem value="mac">MAC Address</SelectItem>
                    <SelectItem value="username">Username</SelectItem>
                    <SelectItem value="vlan">VLAN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Condition Value</Label>
                <Input value={formData.conditionValue} onChange={(e) => setFormData({ ...formData, conditionValue: e.target.value })} placeholder="e.g., Guest-WiFi or 00:11:22:*" />
              </div>
              <div className="space-y-2">
                <Label>Action</Label>
                <Select value={formData.action} onValueChange={(v: any) => setFormData({ ...formData, action: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow">Allow</SelectItem>
                    <SelectItem value="deny">Deny</SelectItem>
                    <SelectItem value="redirect">Redirect</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assign to Group</Label>
                <Input value={formData.group} onChange={(e) => setFormData({ ...formData, group: e.target.value })} placeholder="Group name" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>{editingRule ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Access Rules</CardTitle>
          <CardDescription>{rules.length} rule(s) configured (processed in priority order)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priority</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule, idx) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{rule.priority}</span>
                      <div className="flex flex-col gap-1">
                        <Button size="sm" variant="ghost" className="h-4 w-4 p-0" onClick={() => movePriority(rule.id, 'up')} disabled={idx === 0}>
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-4 w-4 p-0" onClick={() => movePriority(rule.id, 'down')} disabled={idx === rules.length - 1}>
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>
                    <div>
                      <Badge variant="outline">{rule.condition.toUpperCase()}</Badge>
                      <div className="text-xs text-muted-foreground mt-1">{rule.conditionValue}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={rule.action === 'deny' ? 'bg-red-500' : rule.action === 'allow' ? 'bg-green-500' : 'bg-blue-500'}>
                      {rule.action.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>{rule.group || 'N/A'}</TableCell>
                  <TableCell><Switch checked={rule.enabled} onCheckedChange={(c) => setRules(rules.map(r => r.id === rule.id ? { ...r, enabled: c } : r))} /></TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setEditingRule(rule); setFormData(rule); setDialogOpen(true); }}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => { if (window.confirm('Delete rule?')) { setRules(rules.filter(r => r.id !== rule.id)); toast.success('Rule deleted'); } }}>
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
