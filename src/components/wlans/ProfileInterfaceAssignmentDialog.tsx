import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Search, Wifi, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../../services/api';

interface ProfileInterface {
  name: string;
  enabled: boolean;
  available: boolean;
}

interface ProfileWithInterfaces {
  id: string;
  name: string;
  deviceType: string;
  interfaces: {
    all: boolean;
    radio1: ProfileInterface;
    radio2: ProfileInterface;
    radio3: ProfileInterface;
    port1: ProfileInterface;
    port2: ProfileInterface;
    port3: ProfileInterface;
    camera: ProfileInterface;
    ge2: ProfileInterface;
    ethPoe: ProfileInterface;
  };
}

interface ProfileInterfaceAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceId: string;
  serviceName: string;
  onSave: (assignments: ProfileWithInterfaces[]) => Promise<void>;
}

export function ProfileInterfaceAssignmentDialog({
  open,
  onOpenChange,
  serviceId,
  serviceName,
  onSave
}: ProfileInterfaceAssignmentDialogProps) {
  const [profiles, setProfiles] = useState<ProfileWithInterfaces[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectAll, setSelectAll] = useState(false);

  useEffect(() => {
    if (open) {
      loadProfiles();
    }
  }, [open]);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const profilesData = await apiService.getProfiles();

      const mappedProfiles: ProfileWithInterfaces[] = profilesData.map((p: any) => {
        const deviceType = p.deviceType || p.hardwareType || 'Unknown';

        const hasRadio1 = true;
        const hasRadio2 = !deviceType.includes('305') && !deviceType.includes('302');
        const hasRadio3 = deviceType.includes('5010') || deviceType.includes('5020') || deviceType.includes('5050');
        const hasPorts = deviceType.includes('302W') || deviceType.includes('3915') || deviceType.includes('3916');
        const hasCamera = deviceType.includes('camera');
        const hasGe2 = deviceType.includes('302W');
        const hasEthPoe = deviceType.includes('302W') || deviceType.includes('3915');

        return {
          id: p.id,
          name: p.name || p.profileName || p.id,
          deviceType,
          interfaces: {
            all: false,
            radio1: { name: 'Radio 1', enabled: false, available: hasRadio1 },
            radio2: { name: 'Radio 2', enabled: false, available: hasRadio2 },
            radio3: { name: 'Radio 3', enabled: false, available: hasRadio3 },
            port1: { name: 'Port 1', enabled: false, available: hasPorts },
            port2: { name: 'Port 2', enabled: false, available: hasPorts },
            port3: { name: 'Port 3', enabled: false, available: hasPorts },
            camera: { name: 'Camera', enabled: false, available: hasCamera },
            ge2: { name: 'ge2', enabled: false, available: hasGe2 },
            ethPoe: { name: 'ETH/POE', enabled: false, available: hasEthPoe }
          }
        };
      });

      setProfiles(mappedProfiles);
    } catch (error) {
      console.error('Failed to load profiles:', error);
      toast.error('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const toggleAll = (profileId: string) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== profileId) return p;
      const newAll = !p.interfaces.all;
      const updatedInterfaces = { ...p.interfaces, all: newAll };

      Object.keys(updatedInterfaces).forEach(key => {
        if (key !== 'all') {
          const iface = updatedInterfaces[key as keyof typeof updatedInterfaces];
          if (typeof iface === 'object' && iface.available) {
            (updatedInterfaces[key as keyof typeof updatedInterfaces] as ProfileInterface).enabled = newAll;
          }
        }
      });

      return { ...p, interfaces: updatedInterfaces };
    }));
  };

  const toggleInterface = (profileId: string, interfaceKey: string) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== profileId) return p;
      const iface = p.interfaces[interfaceKey as keyof typeof p.interfaces] as ProfileInterface;
      if (!iface?.available) return p;

      const newEnabled = !iface.enabled;
      const updatedInterfaces = {
        ...p.interfaces,
        [interfaceKey]: { ...iface, enabled: newEnabled }
      };

      const allChecked = Object.entries(updatedInterfaces)
        .filter(([k, v]) => k !== 'all' && typeof v === 'object' && (v as ProfileInterface).available)
        .every(([, v]) => (v as ProfileInterface).enabled);
      updatedInterfaces.all = allChecked;

      return { ...p, interfaces: updatedInterfaces };
    }));
  };

  const toggleSelectAllProfiles = () => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);
    setProfiles(prev => prev.map(p => ({
      ...p,
      interfaces: {
        ...p.interfaces,
        all: newSelectAll,
        radio1: { ...p.interfaces.radio1, enabled: newSelectAll && p.interfaces.radio1.available },
        radio2: { ...p.interfaces.radio2, enabled: newSelectAll && p.interfaces.radio2.available },
        radio3: { ...p.interfaces.radio3, enabled: newSelectAll && p.interfaces.radio3.available },
        port1: { ...p.interfaces.port1, enabled: newSelectAll && p.interfaces.port1.available },
        port2: { ...p.interfaces.port2, enabled: newSelectAll && p.interfaces.port2.available },
        port3: { ...p.interfaces.port3, enabled: newSelectAll && p.interfaces.port3.available },
        camera: { ...p.interfaces.camera, enabled: newSelectAll && p.interfaces.camera.available },
        ge2: { ...p.interfaces.ge2, enabled: newSelectAll && p.interfaces.ge2.available },
        ethPoe: { ...p.interfaces.ethPoe, enabled: newSelectAll && p.interfaces.ethPoe.available }
      }
    })));
  };

  const filteredProfiles = profiles.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.deviceType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const assignedCount = profiles.filter(p =>
    p.interfaces.all ||
    Object.values(p.interfaces).some(v => typeof v === 'object' && v.enabled)
  ).length;

  const handleSave = async () => {
    const assignedProfiles = profiles.filter(p =>
      p.interfaces.all ||
      Object.values(p.interfaces).some(v => typeof v === 'object' && v.enabled)
    );

    if (assignedProfiles.length === 0) {
      toast.error('Select at least one profile interface');
      return;
    }

    setSaving(true);
    try {
      await onSave(assignedProfiles);
      toast.success(`Assigned to ${assignedProfiles.length} profile(s)`);
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to assign profiles');
    } finally {
      setSaving(false);
    }
  };

  const interfaceKeys = ['radio1', 'radio2', 'radio3', 'port1', 'port2', 'port3', 'camera', 'ge2', 'ethPoe'] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col z-[100]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-blue-500" />
            Assign Profiles for {serviceName}
          </DialogTitle>
          <DialogDescription>
            Select profiles and interfaces to deploy this WLAN to
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search profiles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Badge variant={assignedCount > 0 ? "default" : "secondary"} className="gap-1">
              <CheckCircle className="h-3 w-3" />
              {assignedCount} profile(s) selected
            </Badge>
          </div>

          <ScrollArea className="flex-1 min-h-[300px] max-h-[500px]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mb-2" />
                <p>{searchTerm ? 'No profiles match your search' : 'No profiles available'}</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Name</th>
                        <th className="px-3 py-2 text-left font-medium">Device Type</th>
                        <th className="px-2 py-2 text-center font-medium">
                          <div className="flex items-center justify-center gap-1">
                            <Checkbox
                              checked={selectAll}
                              onCheckedChange={toggleSelectAllProfiles}
                            />
                            <span>All</span>
                          </div>
                        </th>
                        <th className="px-2 py-2 text-center font-medium">Radio 1</th>
                        <th className="px-2 py-2 text-center font-medium">Radio 2</th>
                        <th className="px-2 py-2 text-center font-medium">Radio 3</th>
                        <th className="px-2 py-2 text-center font-medium">Port 1</th>
                        <th className="px-2 py-2 text-center font-medium">Port 2</th>
                        <th className="px-2 py-2 text-center font-medium">Port 3</th>
                        <th className="px-2 py-2 text-center font-medium">Camera</th>
                        <th className="px-2 py-2 text-center font-medium">ge2</th>
                        <th className="px-2 py-2 text-center font-medium">ETH/POE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProfiles.map(profile => (
                        <tr key={profile.id} className="border-t hover:bg-muted/50">
                          <td className="px-3 py-2 font-medium">{profile.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{profile.deviceType}</td>
                          <td className="px-2 py-2 text-center">
                            <Checkbox
                              checked={profile.interfaces.all}
                              onCheckedChange={() => toggleAll(profile.id)}
                            />
                          </td>
                          {interfaceKeys.map(key => {
                            const iface = profile.interfaces[key];
                            return (
                              <td key={key} className="px-2 py-2 text-center">
                                {iface.available ? (
                                  <Checkbox
                                    checked={iface.enabled}
                                    onCheckedChange={() => toggleInterface(profile.id, key)}
                                  />
                                ) : (
                                  <span className="text-muted-foreground/30">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              `Assign ${assignedCount} Profile(s)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { ProfileWithInterfaces, ProfileInterface, ProfileInterfaceAssignmentDialogProps };
