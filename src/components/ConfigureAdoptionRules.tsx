import { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  GripVertical, 
  CheckCircle, 
  XCircle,
  MapPin,
  Network,
  Wifi,
  Users,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  Settings
} from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface AdoptionRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
  matchCount: number;
  lastMatched?: string;
  createdAt: string;
  modifiedAt: string;
}

interface RuleCondition {
  id: string;
  field: 'macAddress' | 'serialNumber' | 'model' | 'manufacturer' | 'location' | 'apName' | 'ipSubnet';
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' | 'inRange';
  value: string;
}

interface RuleAction {
  id: string;
  type: 'assignSite' | 'assignProfile' | 'assignVlan' | 'assignRole' | 'setTags';
  value: string;
  label?: string;
}

interface Site {
  id: string;
  name: string;
}

const CONDITION_FIELDS = [
  { value: 'macAddress', label: 'MAC Address' },
  { value: 'serialNumber', label: 'Serial Number' },
  { value: 'model', label: 'Device Model' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'location', label: 'Location' },
  { value: 'apName', label: 'AP Name' },
  { value: 'ipSubnet', label: 'IP Subnet' }
];

const OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'startsWith', label: 'Starts With' },
  { value: 'endsWith', label: 'Ends With' },
  { value: 'matches', label: 'Matches (Regex)' },
  { value: 'inRange', label: 'In Range' }
];

const ACTION_TYPES = [
  { value: 'assignSite', label: 'Assign to Site', icon: MapPin },
  { value: 'assignProfile', label: 'Assign Profile', icon: Settings },
  { value: 'assignVlan', label: 'Assign VLAN', icon: Network },
  { value: 'assignRole', label: 'Assign Role', icon: Users },
  { value: 'setTags', label: 'Set Tags', icon: AlertCircle }
];

export function ConfigureAdoptionRules() {
  const [rules, setRules] = useState<AdoptionRule[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEnabled, setFilterEnabled] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<AdoptionRule | null>(null);
  const [activeTab, setActiveTab] = useState('general');

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formConditions, setFormConditions] = useState<RuleCondition[]>([]);
  const [formActions, setFormActions] = useState<RuleAction[]>([]);

  useEffect(() => {
    loadRules();
    loadSites();
  }, []);

  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await apiService.getAdoptionRules();

      // If no rules from API, use mock data for demonstration
      if (!data || data.length === 0) {
        const mockRules: AdoptionRule[] = [
        {
          id: '1',
          name: 'Building A Access Points',
          description: 'Automatically assign all Building A APs to the correct site',
          enabled: true,
          priority: 1,
          conditions: [
            { id: 'c1', field: 'apName', operator: 'startsWith', value: 'BLDG-A-' }
          ],
          actions: [
            { id: 'a1', type: 'assignSite', value: 'site-001', label: 'Building A - Main Campus' }
          ],
          matchCount: 24,
          lastMatched: new Date().toISOString(),
          createdAt: '2025-01-10T10:00:00Z',
          modifiedAt: '2025-01-15T14:30:00Z'
        },
        {
          id: '2',
          name: 'Guest Network Devices',
          description: 'Assign guest VLAN to devices matching guest patterns',
          enabled: true,
          priority: 2,
          conditions: [
            { id: 'c2', field: 'apName', operator: 'contains', value: 'GUEST' }
          ],
          actions: [
            { id: 'a2', type: 'assignVlan', value: '100', label: 'VLAN 100 (Guest)' }
          ],
          matchCount: 12,
          lastMatched: new Date().toISOString(),
          createdAt: '2025-01-12T09:00:00Z',
          modifiedAt: '2025-01-12T09:00:00Z'
        },
        {
          id: '3',
          name: 'Corporate APs by MAC Range',
          description: 'Assign corporate profile based on MAC address range',
          enabled: false,
          priority: 3,
          conditions: [
            { id: 'c3', field: 'macAddress', operator: 'startsWith', value: 'AA:BB:CC' }
          ],
          actions: [
            { id: 'a3', type: 'assignProfile', value: 'corp-standard', label: 'Corporate Standard Profile' },
            { id: 'a4', type: 'setTags', value: 'corporate,managed', label: 'Tags: corporate, managed' }
          ],
          matchCount: 0,
          createdAt: '2025-01-08T16:00:00Z',
          modifiedAt: '2025-01-14T11:20:00Z'
        }
      ];

        setRules(mockRules);
      } else {
        setRules(data);
      }
    } catch (error) {
      console.error('Error loading adoption rules:', error);
      toast.error('Failed to load adoption rules');
    } finally {
      setLoading(false);
    }
  };

  const loadSites = async () => {
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/sites', {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error('Failed to load sites');
      }

      const data = await response.json();
      const sitesData = data.items || data.sites || data || [];
      setSites(sitesData.map((site: any) => ({
        id: site.id || site.siteId,
        name: site.name || site.siteName || 'Unnamed Site'
      })));
    } catch (error) {
      console.error('Error loading sites:', error);
      // Use mock sites if API fails
      setSites([
        { id: 'site-001', name: 'Building A - Main Campus' },
        { id: 'site-002', name: 'Building B - Research Lab' },
        { id: 'site-003', name: 'Building C - Admin' }
      ]);
    }
  };

  const handleCreateRule = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const handleEditRule = (rule: AdoptionRule) => {
    setSelectedRule(rule);
    setFormName(rule.name);
    setFormDescription(rule.description);
    setFormEnabled(rule.enabled);
    setFormConditions([...rule.conditions]);
    setFormActions([...rule.actions]);
    setActiveTab('general');
    setIsEditDialogOpen(true);
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this adoption rule?')) {
      return;
    }

    try {
      await apiService.deleteAdoptionRule(ruleId);
      setRules(rules.filter(r => r.id !== ruleId));
      toast.success('Adoption rule deleted successfully');
    } catch (error) {
      console.error('Error deleting rule:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete adoption rule');
    }
  };

  const handleToggleEnabled = async (ruleId: string, enabled: boolean) => {
    try {
      await apiService.toggleAdoptionRule(ruleId, enabled);
      setRules(rules.map(r =>
        r.id === ruleId ? { ...r, enabled } : r
      ));
      toast.success(`Rule ${enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
      console.error('Error toggling rule:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update rule status');
    }
  };

  const handleMovePriority = (ruleId: string, direction: 'up' | 'down') => {
    const index = rules.findIndex(r => r.id === ruleId);
    if (index === -1) return;
    
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === rules.length - 1) return;

    const newRules = [...rules];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Swap rules
    [newRules[index], newRules[targetIndex]] = [newRules[targetIndex], newRules[index]];
    
    // Update priorities
    newRules.forEach((rule, idx) => {
      rule.priority = idx + 1;
    });

    setRules(newRules);
    toast.success('Rule priority updated');
  };

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormEnabled(true);
    setFormConditions([]);
    setFormActions([]);
    setActiveTab('general');
  };

  const handleSaveRule = async () => {
    if (!formName.trim()) {
      toast.error('Please enter a rule name');
      return;
    }

    if (formConditions.length === 0) {
      toast.error('Please add at least one condition');
      return;
    }

    if (formActions.length === 0) {
      toast.error('Please add at least one action');
      return;
    }

    try {
      const newRule: AdoptionRule = {
        id: isEditDialogOpen && selectedRule ? selectedRule.id : `rule-${Date.now()}`,
        name: formName,
        description: formDescription,
        enabled: formEnabled,
        priority: isEditDialogOpen && selectedRule ? selectedRule.priority : rules.length + 1,
        conditions: formConditions,
        actions: formActions,
        matchCount: isEditDialogOpen && selectedRule ? selectedRule.matchCount : 0,
        lastMatched: isEditDialogOpen && selectedRule ? selectedRule.lastMatched : undefined,
        createdAt: isEditDialogOpen && selectedRule ? selectedRule.createdAt : new Date().toISOString(),
        modifiedAt: new Date().toISOString()
      };

      if (isEditDialogOpen && selectedRule) {
        await apiService.updateAdoptionRule(selectedRule.id, newRule);
        setRules(rules.map(r => r.id === selectedRule.id ? newRule : r));
        toast.success('Adoption rule updated successfully');
      } else {
        const createdRule = await apiService.createAdoptionRule(newRule);
        setRules([...rules, createdRule || newRule]);
        toast.success('Adoption rule created successfully');
      }

      setIsCreateDialogOpen(false);
      setIsEditDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving rule:', error);
      toast.error('Failed to save adoption rule');
    }
  };

  const addCondition = () => {
    const newCondition: RuleCondition = {
      id: `cond-${Date.now()}`,
      field: 'macAddress',
      operator: 'equals',
      value: ''
    };
    setFormConditions([...formConditions, newCondition]);
  };

  const updateCondition = (id: string, updates: Partial<RuleCondition>) => {
    setFormConditions(formConditions.map(c => 
      c.id === id ? { ...c, ...updates } : c
    ));
  };

  const removeCondition = (id: string) => {
    setFormConditions(formConditions.filter(c => c.id !== id));
  };

  const addAction = () => {
    const newAction: RuleAction = {
      id: `action-${Date.now()}`,
      type: 'assignSite',
      value: '',
      label: ''
    };
    setFormActions([...formActions, newAction]);
  };

  const updateAction = (id: string, updates: Partial<RuleAction>) => {
    setFormActions(formActions.map(a => 
      a.id === id ? { ...a, ...updates } : a
    ));
  };

  const removeAction = (id: string) => {
    setFormActions(formActions.filter(a => a.id !== id));
  };

  // Filter rules
  const filteredRules = rules.filter(rule => {
    const matchesSearch = rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         rule.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEnabled = filterEnabled === 'all' || 
                          (filterEnabled === 'enabled' && rule.enabled) ||
                          (filterEnabled === 'disabled' && !rule.enabled);
    return matchesSearch && matchesEnabled;
  });

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <Card className="bg-card border-border">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-lg text-card-foreground mb-2">Adoption Rules</h3>
              <p className="text-sm text-muted-foreground">
                Configure automatic device adoption rules based on device properties
              </p>
            </div>
            <Button onClick={handleCreateRule} className="bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" />
              Create Rule
            </Button>
          </div>

          {/* Filters */}
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search rules..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterEnabled} onValueChange={setFilterEnabled}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Rules</SelectItem>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Rules List */}
      <Card className="bg-card border-border">
        <div className="p-6">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading adoption rules...
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchTerm || filterEnabled !== 'all' 
                  ? 'No rules match your filters' 
                  : 'No adoption rules configured yet'}
              </p>
              {!searchTerm && filterEnabled === 'all' && (
                <Button onClick={handleCreateRule} variant="outline" className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Rule
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Priority</TableHead>
                  <TableHead className="w-12">Status</TableHead>
                  <TableHead>Rule Name</TableHead>
                  <TableHead>Conditions</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead className="text-right">Matched</TableHead>
                  <TableHead className="text-right w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRules.map((rule, index) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMovePriority(rule.id, 'up')}
                          disabled={index === 0}
                          className="h-5 w-5 p-0"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <span className="text-center text-xs">{rule.priority}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMovePriority(rule.id, 'down')}
                          disabled={index === filteredRules.length - 1}
                          className="h-5 w-5 p-0"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={(checked) => handleToggleEnabled(rule.id, checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="text-card-foreground">{rule.name}</div>
                        <div className="text-xs text-muted-foreground">{rule.description}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {rule.conditions.map(condition => (
                          <Badge key={condition.id} variant="outline" className="text-xs">
                            {CONDITION_FIELDS.find(f => f.value === condition.field)?.label} {condition.operator} "{condition.value}"
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {rule.actions.map(action => (
                          <Badge key={action.id} variant="secondary" className="text-xs">
                            {ACTION_TYPES.find(t => t.value === action.type)?.label}: {action.label || action.value}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="text-sm">
                        {rule.matchCount > 0 ? (
                          <span className="text-green-600 dark:text-green-400">{rule.matchCount} devices</span>
                        ) : (
                          <span className="text-muted-foreground">0 devices</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditRule(rule)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRule(rule.id)}
                          className="text-destructive hover:text-destructive"
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

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen || isEditDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false);
          setIsEditDialogOpen(false);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-[95vw] sm:max-w-[90vw] lg:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditDialogOpen ? 'Edit Adoption Rule' : 'Create Adoption Rule'}
            </DialogTitle>
            <DialogDescription>
              Configure conditions and actions for automatic device adoption
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="conditions">Conditions</TabsTrigger>
              <TabsTrigger value="actions">Actions</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Rule Name</Label>
                <Input
                  id="name"
                  placeholder="Enter rule name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Enter rule description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="enabled"
                  checked={formEnabled}
                  onCheckedChange={setFormEnabled}
                />
                <Label htmlFor="enabled">Enable this rule</Label>
              </div>
            </TabsContent>

            <TabsContent value="conditions" className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-muted-foreground">
                  Add conditions that devices must match for this rule to apply
                </p>
                <Button onClick={addCondition} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Condition
                </Button>
              </div>

              {formConditions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No conditions added yet. Click "Add Condition" to start.
                </div>
              ) : (
                <div className="space-y-3">
                  {formConditions.map((condition, index) => (
                    <Card key={condition.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <GripVertical className="h-5 w-5 text-muted-foreground mt-2" />
                        <div className="flex-1 grid grid-cols-3 gap-3">
                          <div>
                            <Label className="text-xs">Field</Label>
                            <Select
                              value={condition.field}
                              onValueChange={(value) => updateCondition(condition.id, { field: value as any })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CONDITION_FIELDS.map(field => (
                                  <SelectItem key={field.value} value={field.value}>
                                    {field.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Operator</Label>
                            <Select
                              value={condition.operator}
                              onValueChange={(value) => updateCondition(condition.id, { operator: value as any })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {OPERATORS.map(op => (
                                  <SelectItem key={op.value} value={op.value}>
                                    {op.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Value</Label>
                            <Input
                              value={condition.value}
                              onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                              placeholder="Enter value"
                            />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCondition(condition.id)}
                          className="mt-6"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      {index < formConditions.length - 1 && (
                        <div className="flex items-center justify-center mt-2">
                          <Badge variant="outline" className="text-xs">AND</Badge>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="actions" className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-muted-foreground">
                  Define actions to take when a device matches this rule
                </p>
                <Button onClick={addAction} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Action
                </Button>
              </div>

              {formActions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No actions added yet. Click "Add Action" to start.
                </div>
              ) : (
                <div className="space-y-3">
                  {formActions.map((action) => (
                    <Card key={action.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Action Type</Label>
                            <Select
                              value={action.type}
                              onValueChange={(value) => updateAction(action.id, { type: value as any })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ACTION_TYPES.map(type => (
                                  <SelectItem key={type.value} value={type.value}>
                                    {type.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">
                              {action.type === 'assignSite' ? 'Site' :
                               action.type === 'assignProfile' ? 'Profile' :
                               action.type === 'assignVlan' ? 'VLAN ID' :
                               action.type === 'assignRole' ? 'Role' :
                               'Tags'}
                            </Label>
                            {action.type === 'assignSite' ? (
                              <Select
                                value={action.value}
                                onValueChange={(value) => {
                                  const site = sites.find(s => s.id === value);
                                  updateAction(action.id, { value, label: site?.name });
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select site" />
                                </SelectTrigger>
                                <SelectContent>
                                  {sites.map(site => (
                                    <SelectItem key={site.id} value={site.id}>
                                      {site.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                value={action.value}
                                onChange={(e) => updateAction(action.id, { value: e.target.value, label: e.target.value })}
                                placeholder={
                                  action.type === 'assignVlan' ? 'Enter VLAN ID' :
                                  action.type === 'setTags' ? 'Enter tags (comma-separated)' :
                                  'Enter value'
                                }
                              />
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAction(action.id)}
                          className="mt-6"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreateDialogOpen(false);
              setIsEditDialogOpen(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={handleSaveRule} className="bg-primary hover:bg-primary/90">
              {isEditDialogOpen ? 'Update Rule' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
