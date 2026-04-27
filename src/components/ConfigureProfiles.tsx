import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Plus, Search, Edit2, Trash2, Cpu, RefreshCw } from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';
import { DevEpicBadge } from './DevEpicBadge';
import { ProfileEditSheet } from './ProfileEditSheet';
import type { DeviceProfile } from './ProfileEditSheet';
import { useGridMode } from '@/contexts/GridModeContext';
import { AGGridWrapper } from '@/components/ui/AGGridWrapper';
import type { ColDef } from 'ag-grid-community';

export function ConfigureProfiles() {
  const [profiles, setProfiles] = useState<DeviceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingProfile, setEditingProfile] = useState<DeviceProfile | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.getProfiles();
      setProfiles(Array.isArray(data) ? (data as DeviceProfile[]) : []);
    } catch {
      toast.error('Failed to load device profiles');
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleDelete = async (profileId: string, profileName: string) => {
    if (!confirm(`Delete profile "${profileName}"?`)) return;
    try {
      await apiService.deleteProfile(profileId);
      toast.success(`Deleted "${profileName}"`);
      loadProfiles();
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    }
  };

  const openCreate = () => {
    setEditingProfile(null);
    setSheetOpen(true);
  };
  const openEdit = (profile: DeviceProfile) => {
    setEditingProfile(profile);
    setSheetOpen(true);
  };
  const handleSaved = () => {
    setSheetOpen(false);
    loadProfiles();
  };

  const { agGridEnabled } = useGridMode();

  const agColDefs: ColDef<DeviceProfile>[] = [
    {
      field: 'name',
      headerName: 'Name',
      flex: 2,
      cellRenderer: (params: { value: string }) => (
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          {params.value}
        </div>
      ),
    },
    {
      field: 'type',
      headerName: 'Type',
      flex: 1,
      cellRenderer: (params: { value: string }) => (
        <Badge variant={params.value === 'DEFAULT' ? 'default' : 'secondary'}>
          {params.value === 'DEFAULT' ? 'Site Default' : 'Device'}
        </Badge>
      ),
    },
    {
      headerName: 'AP Platform',
      flex: 1,
      valueGetter: (params: { data?: DeviceProfile }) =>
        params.data?.apPlatform || params.data?.deviceType || '—',
    },
    {
      headerName: 'Actions',
      flex: 1,
      cellRenderer: (params: { data?: DeviceProfile }) =>
        params.data ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(params.data!)}>
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              onClick={() => handleDelete(params.data!.id, params.data!.name)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null,
    },
  ];

  const filtered = profiles.filter((p) => p.name?.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Device Profiles</h1>
            <DevEpicBadge
              epicKey="NVO-9702"
              epicTitle="Profile Configuration & Assignment"
              jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-9702"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Site Default profiles apply to all APs. Device profiles are model-specific overrides.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadProfiles} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-high-emphasis border-border hover:bg-accent hover:text-high-emphasis"
            onClick={openCreate}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Profile
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search profiles..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {agGridEnabled ? (
            <AGGridWrapper rowData={filtered} columnDefs={agColDefs} height={500} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>AP Platform</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Loading profiles...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? 'No profiles match your search' : 'No profiles configured'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-muted-foreground" />
                          {profile.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={profile.type === 'DEFAULT' ? 'default' : 'secondary'}>
                          {profile.type === 'DEFAULT' ? 'Site Default' : 'Device'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {profile.apPlatform || profile.deviceType || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(profile)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(profile.id, profile.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProfileEditSheet
        profile={editingProfile}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSaved={handleSaved}
      />
    </div>
  );
}
