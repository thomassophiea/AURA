import { useState, useEffect } from 'react';
import { Folder, Plus, Trash2, Edit, Save, X } from 'lucide-react';
import { DetailSlideOut } from './DetailSlideOut';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import type { Site, SiteGroup } from '../types/network';

interface SiteGroupManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites: Site[];
  siteGroups: SiteGroup[];
  onSave: (groups: SiteGroup[]) => void;
}

export function SiteGroupManagementDialog({
  open,
  onOpenChange,
  sites,
  siteGroups,
  onSave
}: SiteGroupManagementDialogProps) {
  const [groups, setGroups] = useState<SiteGroup[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setGroups([...siteGroups]);
      setIsCreating(false);
      setEditingId(null);
    }
  }, [open, siteGroups]);

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) {
      toast.error('Group name is required');
      return;
    }

    if (selectedSites.length === 0) {
      toast.error('Please select at least one site');
      return;
    }

    const newGroup: SiteGroup = {
      id: `group_${Date.now()}`,
      name: newGroupName,
      description: newGroupDescription || undefined,
      siteIds: selectedSites,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      color: getRandomColor()
    };

    setGroups([...groups, newGroup]);
    setNewGroupName('');
    setNewGroupDescription('');
    setSelectedSites([]);
    setIsCreating(false);
    toast.success(`Site group "${newGroupName}" created`);
  };

  const handleDeleteGroup = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    setGroups(groups.filter(g => g.id !== groupId));
    toast.success(`Site group "${group?.name}" deleted`);
  };

  const handleUpdateGroup = (groupId: string, updates: Partial<SiteGroup>) => {
    setGroups(groups.map(g =>
      g.id === groupId
        ? { ...g, ...updates, lastModified: new Date().toISOString() }
        : g
    ));
    setEditingId(null);
    toast.success('Site group updated');
  };

  const toggleSiteInGroup = (siteId: string) => {
    setSelectedSites(prev =>
      prev.includes(siteId)
        ? prev.filter(id => id !== siteId)
        : [...prev, siteId]
    );
  };

  const handleSave = () => {
    onSave(groups);
    onOpenChange(false);
    toast.success(`${groups.length} site group(s) saved`);
  };

  const getRandomColor = () => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const getSiteName = (siteId: string) => {
    const site = sites.find(s => s.id === siteId);
    return site?.name || site?.siteName || siteId;
  };

  return (
    <DetailSlideOut
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Manage Site Groups"
      description="Create and manage site groups for easier WLAN deployment at scale"
      width="xl"
    >
      <div className="space-y-4">
          {/* Create New Group Section */}
          {isCreating ? (
            <Card className="border-primary">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium">Create New Site Group</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsCreating(false);
                      setNewGroupName('');
                      setNewGroupDescription('');
                      setSelectedSites([]);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="groupName">Group Name</Label>
                  <Input
                    id="groupName"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g., East Coast Sites, Production Sites..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="groupDescription">Description (Optional)</Label>
                  <Input
                    id="groupDescription"
                    value={newGroupDescription}
                    onChange={(e) => setNewGroupDescription(e.target.value)}
                    placeholder="Brief description of this group..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Select Sites ({selectedSites.length} selected)</Label>
                  <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                    {sites.map(site => (
                      <div
                        key={site.id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-accent ${
                          selectedSites.includes(site.id) ? 'bg-primary/10' : ''
                        }`}
                        onClick={() => toggleSiteInGroup(site.id)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSites.includes(site.id)}
                          onChange={() => {}}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">{getSiteName(site.id)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleCreateGroup} className="flex-1">
                    <Save className="h-4 w-4 mr-2" />
                    Create Group
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button onClick={() => setIsCreating(true)} className="w-full" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Create New Site Group
            </Button>
          )}

          {/* Existing Groups */}
          <div className="space-y-3">
            {groups.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Folder className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No site groups yet</p>
                <p className="text-xs mt-1">Create groups to organize sites for easier WLAN deployment</p>
              </div>
            ) : (
              groups.map(group => (
                <Card key={group.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: group.color }}
                        />
                        <div>
                          <h3 className="font-medium">{group.name}</h3>
                          {group.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteGroup(group.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-xs">
                        {group.siteIds.length} {group.siteIds.length === 1 ? 'site' : 'sites'}
                      </Badge>
                      {group.siteIds.slice(0, 5).map(siteId => (
                        <Badge key={siteId} variant="outline" className="text-xs">
                          {getSiteName(siteId)}
                        </Badge>
                      ))}
                      {group.siteIds.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{group.siteIds.length - 5} more
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

        {/* Footer Actions */}
        <div className="flex gap-2 pt-6 border-t mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} className="flex-1">
            Save Groups
          </Button>
        </div>
      </div>
    </DetailSlideOut>
  );
}
