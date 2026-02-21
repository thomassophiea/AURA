import { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { AlertTriangle, Plus, Search, Edit2, Trash2, Shield, Network, AlertCircle, CheckCircle, RefreshCw, Lock, Unlock, Globe, Settings, Layers, Gauge } from 'lucide-react';
import { apiService, Role } from '../services/api';
import { toast } from 'sonner';
import { RoleEditDialog } from './RoleEditDialog';

export function ConfigurePolicy() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('roles');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);

  // VLAN/Topology state
  const [topologies, setTopologies] = useState<any[]>([]);
  const [loadingTopologies, setLoadingTopologies] = useState(false);
  const [topologySearchTerm, setTopologySearchTerm] = useState('');

  // Class of Service state
  const [cosProfiles, setCosProfiles] = useState<any[]>([]);
  const [loadingCos, setLoadingCos] = useState(false);

  // Topology dialog state
  const [selectedTopology, setSelectedTopology] = useState<any | null>(null);
  const [isTopologyDetailOpen, setIsTopologyDetailOpen] = useState(false);
  const [isTopologyEditOpen, setIsTopologyEditOpen] = useState(false);
  const [editingTopology, setEditingTopology] = useState<any | null>(null);
  const [selectedCos, setSelectedCos] = useState<any | null>(null);
  const [isCosDetailOpen, setIsCosDetailOpen] = useState(false);

  // Debug: Log dialog state changes
  useEffect(() => {
    console.log('🔧 ConfigurePolicy state - isEditDialogOpen:', isEditDialogOpen, 'editingRole:', editingRole?.name || 'null');
  }, [isEditDialogOpen, editingRole]);

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    setLoading(true);
    try {
      console.log('📡 Loading network roles from /v3/roles endpoint...');
      const rolesData = await apiService.getRoles();
      setRoles(rolesData || []);
      console.log(`✓ Loaded ${rolesData.length} network roles:`, rolesData.map(r => r.name));
      
      if (rolesData.length === 0) {
        console.warn('⚠️ No roles returned from API - check endpoint and authentication');
      }
    } catch (error) {
      console.error('❌ Error loading roles:', error);
      toast.error('Failed to load roles', {
        description: error instanceof Error ? error.message : 'There was an error loading network policy roles.'
      });
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTopologies = async () => {
    setLoadingTopologies(true);
    try {
      const data = await apiService.getTopologies();
      setTopologies(data || []);
      console.log(`✓ Loaded ${data.length} topologies/VLANs`);
    } catch (error) {
      console.error('❌ Error loading topologies:', error);
      setTopologies([]);
    } finally {
      setLoadingTopologies(false);
    }
  };

  const loadCosProfiles = async () => {
    setLoadingCos(true);
    try {
      const data = await apiService.getClassOfService();
      setCosProfiles(data || []);
      console.log(`✓ Loaded ${data.length} CoS profiles`);
    } catch (error) {
      console.error('❌ Error loading CoS profiles:', error);
      setCosProfiles([]);
    } finally {
      setLoadingCos(false);
    }
  };

  const filteredRoles = roles.filter(role => {
    const matchesSearch = role.name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const filteredTopologies = topologies.filter(topology => {
    const name = topology.name || topology.topologyName || '';
    return name.toLowerCase().includes(topologySearchTerm.toLowerCase());
  });

  // Load data when tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'topologies' && topologies.length === 0) {
      loadTopologies();
    } else if (tab === 'cos' && cosProfiles.length === 0) {
      loadCosProfiles();
    }
  };

  const handleViewRole = (role: Role) => {
    setSelectedRole(role);
    setIsDetailDialogOpen(true);
  };

  const handleCreateRole = () => {
    console.log('🔧 Create Role button clicked');
    setEditingRole(null);
    setIsEditDialogOpen(true);
    console.log('🔧 Dialog state set to open');
  };

  const handleEditRole = (role: Role, e?: React.MouseEvent) => {
    // Stop propagation if called from a button click
    if (e) {
      e.stopPropagation();
    }

    if (role.canEdit === false) {
      toast.error('Cannot edit role', {
        description: 'This role is read-only and cannot be modified.'
      });
      return;
    }

    // Toggle expansion for inline editing
    if (expandedRoleId === role.id) {
      setExpandedRoleId(null);
    } else {
      setExpandedRoleId(role.id);
    }
  };

  const handleToggleRole = (role: Role) => {
    // Toggle expansion when clicking the card
    if (expandedRoleId === role.id) {
      setExpandedRoleId(null);
    } else {
      setExpandedRoleId(role.id);
    }
  };

  const handleSaveRole = async (roleData: Partial<Role>) => {
    try {
      // Determine if editing an inline expanded role or creating via dialog
      const roleToUpdate = expandedRoleId ? roles.find(r => r.id === expandedRoleId) : editingRole;

      if (roleToUpdate) {
        // Update existing role
        await apiService.updateRole(roleToUpdate.id, roleData);
        toast.success('Role updated', {
          description: `Successfully updated role "${roleData.name}"`
        });
      } else {
        // Create new role
        await apiService.createRole(roleData);
        toast.success('Role created', {
          description: `Successfully created role "${roleData.name}"`
        });
      }

      await loadRoles();
      setIsEditDialogOpen(false);
      setEditingRole(null);
      setExpandedRoleId(null); // Close inline expansion
    } catch (error) {
      console.error('Error saving role:', error);
      toast.error(roleToUpdate ? 'Failed to update role' : 'Failed to create role', {
        description: error instanceof Error ? error.message : 'An error occurred'
      });
      throw error; // Re-throw so dialog can handle it
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (role.predefined) {
      toast.error('Cannot delete predefined role', {
        description: 'System roles cannot be deleted.'
      });
      return;
    }

    if (!role.canDelete) {
      toast.error('Cannot delete role', {
        description: 'This role is in use and cannot be deleted.'
      });
      return;
    }

    if (!confirm(`Are you sure you want to delete the role "${role.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setIsDeleting(true);
      await apiService.deleteRole(role.id);
      toast.success('Role deleted', {
        description: `Successfully deleted role "${role.name}"`
      });
      await loadRoles();
    } catch (error) {
      console.error('Error deleting role:', error);
      toast.error('Failed to delete role', {
        description: error instanceof Error ? error.message : 'An error occurred'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const renderEmptyState = (title: string, description: string) => (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        {description}
      </p>
    </div>
  );

  const getFilterCount = (role: Role): number => {
    return (role.l2Filters?.length || 0) + 
           (role.l3Filters?.length || 0) + 
           (role.l3SrcDestFilters?.length || 0) + 
           (role.l7Filters?.length || 0);
  };

  const hasCaptivePortal = (role: Role): boolean => {
    return !!(role.cpRedirect && role.cpRedirect.trim() !== '');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl mb-1">Policy Configuration</h1>
          <p className="text-sm text-muted-foreground">
            Manage network roles, access policies, and firewall rules
          </p>
        </div>
        <Button
          onClick={handleCreateRole}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Create Role
        </Button>
      </div>

      {/* Main Content */}
      <Card className="surface-2dp">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <div className="border-b border-border px-6 pt-6">
            <TabsList className="bg-transparent border-b-0 h-auto p-0 space-x-6">
              <TabsTrigger 
                value="roles" 
                className="bg-transparent border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-0 pb-3"
              >
                <Shield className="h-4 w-4 mr-2" />
                Network Roles
              </TabsTrigger>
              <TabsTrigger 
                value="topologies" 
                className="bg-transparent border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-0 pb-3"
              >
                <Layers className="h-4 w-4 mr-2" />
                VLANs / Topologies
              </TabsTrigger>
              <TabsTrigger 
                value="cos" 
                className="bg-transparent border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-0 pb-3"
              >
                <Gauge className="h-4 w-4 mr-2" />
                Class of Service
              </TabsTrigger>
              <TabsTrigger 
                value="firewall" 
                className="bg-transparent border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-0 pb-3"
              >
                <Network className="h-4 w-4 mr-2" />
                Firewall Rules
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Network Roles Tab */}
          <TabsContent value="roles" className="p-6 space-y-4">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search network roles..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                onClick={loadRoles}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Roles List */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredRoles.length === 0 ? (
              renderEmptyState(
                searchTerm ? 'No roles found' : 'No roles configured',
                searchTerm 
                  ? 'Try adjusting your search criteria'
                  : 'Network roles define access policies and security rules'
              )
            ) : (
              <div className="space-y-3">
                {filteredRoles.map((role) => (
                  <div key={role.id}>
                    <Card
                      className={`surface-1dp p-4 transition-all cursor-pointer ${
                        expandedRoleId === role.id
                          ? 'ring-2 ring-primary'
                          : 'hover:surface-2dp'
                      }`}
                      onClick={() => handleToggleRole(role)}
                    >
                      <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="font-medium">{role.name}</h3>
                          
                          {role.predefined && (
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <Lock className="h-3 w-3" />
                              System
                            </Badge>
                          )}
                          
                          <Badge 
                            variant={role.defaultAction === 'allow' ? 'default' : 'destructive'}
                            className="flex items-center gap-1"
                          >
                            {role.defaultAction === 'allow' ? (
                              <>
                                <Unlock className="h-3 w-3" />
                                Allow
                              </>
                            ) : (
                              <>
                                <Lock className="h-3 w-3" />
                                Deny
                              </>
                            )}
                          </Badge>

                          {hasCaptivePortal(role) && (
                            <Badge variant="outline" className="flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              Captive Portal
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                          {getFilterCount(role) > 0 && (
                            <span className="flex items-center gap-1">
                              <Network className="h-3 w-3" />
                              {getFilterCount(role)} filter rule(s)
                            </span>
                          )}
                          {role.profiles && role.profiles.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Settings className="h-3 w-3" />
                              {role.profiles.length} profile(s)
                            </span>
                          )}
                          {role.topology && (
                            <span className="flex items-center gap-1">
                              <Network className="h-3 w-3" />
                              Custom VLAN
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-3">
                          {!role.canEdit && (
                            <Badge variant="outline" className="text-xs">
                              Read-only
                            </Badge>
                          )}
                          {role.features && role.features.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {role.features.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewRole(role);
                          }}
                          className="h-8 w-8 p-0"
                          title="View details"
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                        {role.canDelete && !role.predefined && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRole(role);
                            }}
                            disabled={isDeleting}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete role"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      </div>
                    </Card>

                    {/* Inline Edit Mode */}
                    {expandedRoleId === role.id && (
                      <RoleEditDialog
                        role={role}
                        isOpen={true}
                        onClose={() => setExpandedRoleId(null)}
                        onSave={handleSaveRole}
                        isInline={true}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* VLANs / Topologies Tab */}
          <TabsContent value="topologies" className="p-6 space-y-4">
            {/* Search and Refresh */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search topologies..."
                  value={topologySearchTerm}
                  onChange={(e) => setTopologySearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                onClick={loadTopologies}
                disabled={loadingTopologies}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loadingTopologies ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                onClick={() => {
                  setEditingTopology(null);
                  setIsTopologyEditOpen(true);
                }}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Create Topology
              </Button>
            </div>

            {/* Topologies List */}
            {loadingTopologies ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTopologies.length === 0 ? (
              renderEmptyState(
                'No Topologies Found',
                topologySearchTerm ? 'No topologies match your search criteria.' : 'No VLAN topologies are configured on this controller.'
              )
            ) : (
              <div className="grid gap-3">
                {filteredTopologies.map((topology) => (
                  <Card key={topology.id} className="surface-1dp p-4 hover:surface-3dp transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/10">
                          <Layers className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                          <div className="font-medium">{topology.name || topology.topologyName || 'Unnamed'}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            {topology.vlanId && <Badge variant="outline">VLAN {topology.vlanId}</Badge>}
                            {topology.mode && <Badge variant="secondary">{topology.mode}</Badge>}
                            {topology.predefined && <Badge variant="secondary"><Lock className="h-3 w-3 mr-1" />System</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {topology.ipAddress && (
                          <span className="text-xs text-muted-foreground font-mono">{topology.ipAddress}</span>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0" 
                          title="View details"
                          onClick={() => {
                            setSelectedTopology(topology);
                            setIsTopologyDetailOpen(true);
                          }}
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Class of Service Tab */}
          <TabsContent value="cos" className="p-6 space-y-4">
            {/* Refresh Button */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={loadCosProfiles}
                disabled={loadingCos}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loadingCos ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* CoS List */}
            {loadingCos ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : cosProfiles.length === 0 ? (
              renderEmptyState(
                'No Class of Service Profiles Found',
                'No CoS profiles are configured on this controller.'
              )
            ) : (
              <div className="grid gap-3">
                {cosProfiles.map((cos) => (
                  <Card key={cos.id} className="surface-1dp p-4 hover:surface-3dp transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-500/10">
                          <Gauge className="h-4 w-4 text-purple-500" />
                        </div>
                        <div>
                          <div className="font-medium">{cos.name || cos.cosName || 'Unnamed'}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            {cos.priority !== undefined && <Badge variant="outline">Priority {cos.priority}</Badge>}
                            {cos.predefined && <Badge variant="secondary"><Lock className="h-3 w-3 mr-1" />System</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0" 
                          title="View details"
                          onClick={() => {
                            setSelectedCos(cos);
                            setIsCosDetailOpen(true);
                          }}
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Firewall Rules Tab - Coming Soon */}
          <TabsContent value="firewall" className="p-6">
            {renderEmptyState(
              'Firewall Rules Management',
              'Advanced firewall rule configuration will be available in a future update. Use the Network Roles tab to view roles with firewall filters.'
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {/* Role Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="surface-2dp max-w-[95vw] sm:max-w-[90vw] lg:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedRole?.name}
              {selectedRole?.predefined && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  System Role
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Network policy role configuration and details
            </DialogDescription>
          </DialogHeader>

          {selectedRole && (
            <div className="space-y-6 py-4">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="font-medium">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Role ID</Label>
                    <p className="text-sm font-mono mt-1">{selectedRole.id}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Default Action</Label>
                    <div className="mt-1">
                      <Badge variant={selectedRole.defaultAction === 'allow' ? 'default' : 'destructive'}>
                        {selectedRole.defaultAction}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Editable</Label>
                    <p className="text-sm mt-1">{selectedRole.canEdit ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Can Delete</Label>
                    <p className="text-sm mt-1">{selectedRole.canDelete ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </div>

              {/* Firewall Rules */}
              <div className="space-y-4">
                <h3 className="font-medium">Firewall Rules</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">L2 Filters</Label>
                    <p className="text-sm mt-1">{selectedRole.l2Filters?.length || 0} rule(s)</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">L3 Filters</Label>
                    <p className="text-sm mt-1">{selectedRole.l3Filters?.length || 0} rule(s)</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">L3 Src/Dest Filters</Label>
                    <p className="text-sm mt-1">{selectedRole.l3SrcDestFilters?.length || 0} rule(s)</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">L7 Filters</Label>
                    <p className="text-sm mt-1">{selectedRole.l7Filters?.length || 0} rule(s)</p>
                  </div>
                </div>

                {/* Show L3 Filter Details if present */}
                {selectedRole.l3Filters && selectedRole.l3Filters.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <Label>L3 Filter Rules</Label>
                    <div className="space-y-2">
                      {selectedRole.l3Filters.map((filter, idx) => (
                        <Card key={idx} className="surface-1dp p-3">
                          <div className="text-sm space-y-1">
                            <div className="font-medium">{filter.name}</div>
                            <div className="text-xs text-muted-foreground grid grid-cols-2 gap-2">
                              <span>Action: {filter.action}</span>
                              <span>Protocol: {filter.protocol}</span>
                              <span>Port: {filter.port}</span>
                              <span>IP Range: {filter.ipAddressRange}</span>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Show L7 Filter Details if present */}
                {selectedRole.l7Filters && selectedRole.l7Filters.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <Label>L7 Application Filters</Label>
                    <div className="space-y-2">
                      {selectedRole.l7Filters.map((filter, idx) => (
                        <Card key={idx} className="surface-1dp p-3">
                          <div className="text-sm space-y-1">
                            <div className="font-medium">{filter.name}</div>
                            <div className="text-xs text-muted-foreground">
                              <span>Action: {filter.action}</span>
                              {filter.appGroupId && <span className="ml-4">Group ID: {filter.appGroupId}</span>}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Captive Portal Configuration */}
              {hasCaptivePortal(selectedRole) && (
                <div className="space-y-4">
                  <h3 className="font-medium flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Captive Portal Configuration
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Redirect URL</Label>
                      <p className="text-sm mt-1 break-all font-mono">{selectedRole.cpRedirect}</p>
                    </div>
                    {selectedRole.cpIdentity && (
                      <div>
                        <Label className="text-muted-foreground">Identity</Label>
                        <p className="text-sm mt-1">{selectedRole.cpIdentity}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-muted-foreground">HTTP Enabled</Label>
                        <p className="text-sm mt-1">{selectedRole.cpHttp ? 'Yes' : 'No'}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Use FQDN</Label>
                        <p className="text-sm mt-1">{selectedRole.cpUseFQDN ? 'Yes' : 'No'}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Redirect Ports</Label>
                        <p className="text-sm mt-1">{selectedRole.cpRedirectPorts?.join(', ') || 'None'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Network Configuration */}
              <div className="space-y-4">
                <h3 className="font-medium">Network Configuration</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Topology ID</Label>
                    <p className="text-sm mt-1 font-mono">{selectedRole.topology || 'Default'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Default CoS</Label>
                    <p className="text-sm mt-1 font-mono">{selectedRole.defaultCos || 'None'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Features</Label>
                    <p className="text-sm mt-1">{selectedRole.features?.join(', ') || 'None'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Associated Profiles</Label>
                    <p className="text-sm mt-1">{selectedRole.profiles?.length || 0} profile(s)</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDetailDialogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Edit/Create Dialog */}
      <RoleEditDialog
        role={editingRole}
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setEditingRole(null);
        }}
        onSave={handleSaveRole}
      />

      {/* CoS Detail Dialog */}
      <Dialog open={isCosDetailOpen} onOpenChange={setIsCosDetailOpen}>
        <DialogContent className="surface-2dp max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              {selectedCos?.name || 'Class of Service Details'}
              {selectedCos?.predefined && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  System
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedCos && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Name</Label>
                  <p className="text-sm mt-1">{selectedCos.name || selectedCos.cosName}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Priority</Label>
                  <p className="text-sm mt-1">{selectedCos.priority ?? 'Default'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">ID</Label>
                  <p className="text-sm mt-1 font-mono text-xs">{selectedCos.id}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Editable</Label>
                  <p className="text-sm mt-1">{selectedCos.canEdit !== false ? 'Yes' : 'No'}</p>
                </div>
              </div>
              
              {/* Queue Mappings if available */}
              {selectedCos.queueMappings && (
                <div>
                  <Label className="text-muted-foreground">Queue Mappings</Label>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {Object.entries(selectedCos.queueMappings).map(([queue, value]) => (
                      <div key={queue} className="p-2 bg-muted rounded text-xs">
                        <span className="font-medium">{queue}:</span> {String(value)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* DSCP Mappings if available */}
              {selectedCos.dscpMappings && (
                <div>
                  <Label className="text-muted-foreground">DSCP Mappings</Label>
                  <p className="text-sm mt-1 text-muted-foreground">
                    {Array.isArray(selectedCos.dscpMappings) 
                      ? `${selectedCos.dscpMappings.length} mappings configured`
                      : 'Custom mappings configured'}
                  </p>
                </div>
              )}
              
              {selectedCos.description && (
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="text-sm mt-1">{selectedCos.description}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCosDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Topology Detail Dialog */}
      <Dialog open={isTopologyDetailOpen} onOpenChange={setIsTopologyDetailOpen}>
        <DialogContent className="surface-2dp max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              {selectedTopology?.name || 'Topology Details'}
            </DialogTitle>
          </DialogHeader>
          {selectedTopology && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Name</Label>
                  <p className="text-sm mt-1">{selectedTopology.name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">VLAN ID</Label>
                  <p className="text-sm mt-1">{selectedTopology.vlanId || 'Not set'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Mode</Label>
                  <p className="text-sm mt-1">{selectedTopology.mode || 'Default'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">IP Address</Label>
                  <p className="text-sm mt-1 font-mono">{selectedTopology.ipAddress || 'Not configured'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Subnet Mask</Label>
                  <p className="text-sm mt-1 font-mono">{selectedTopology.subnetMask || 'Not configured'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Gateway</Label>
                  <p className="text-sm mt-1 font-mono">{selectedTopology.gateway || 'Not configured'}</p>
                </div>
              </div>
              {selectedTopology.description && (
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="text-sm mt-1">{selectedTopology.description}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTopologyDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Topology Edit/Create Dialog */}
      <Dialog open={isTopologyEditOpen} onOpenChange={setIsTopologyEditOpen}>
        <DialogContent className="surface-2dp max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTopology ? 'Edit Topology' : 'Create Topology'}</DialogTitle>
            <DialogDescription>Configure VLAN topology settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input placeholder="Topology name" />
              </div>
              <div className="space-y-2">
                <Label>VLAN ID</Label>
                <Input type="number" placeholder="1-4094" min="1" max="4094" />
              </div>
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select defaultValue="bridged-at-ap">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bridged-at-ap">Bridged at AP</SelectItem>
                    <SelectItem value="bridged-at-controller">Bridged at Controller</SelectItem>
                    <SelectItem value="tunnel-to-controller">Tunnel to Controller</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>IP Address</Label>
                <Input placeholder="192.168.1.1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTopologyEditOpen(false)}>Cancel</Button>
            <Button>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
