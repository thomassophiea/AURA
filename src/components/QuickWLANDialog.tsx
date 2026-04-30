import { useState, useEffect } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { toast } from 'sonner';
import { apiService } from '../services/api';
import { WLANAssignmentService } from '../services/wlanAssignment';
import { AssignmentSection } from './AssignmentSection';
import { useAppContext } from '@/contexts/AppContext';
import type { WLANAssignmentMode, SecurityType, Site } from '../types/network';

interface QuickWLANDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type QuickSecurityType = 'wpa2-psk' | 'wpa3-personal' | 'wpa2-enterprise' | 'open';

const PSK_MODES: QuickSecurityType[] = ['wpa2-psk', 'wpa3-personal'];

export function QuickWLANDialog({ open, onOpenChange, onSuccess }: QuickWLANDialogProps) {
  const { siteGroups } = useAppContext();

  const [ssid, setSsid] = useState('');
  const [vlan, setVlan] = useState('1');
  const [security, setSecurity] = useState<QuickSecurityType>('wpa2-psk');
  const [passphrase, setPassphrase] = useState('');
  const [assignmentMode, setAssignmentMode] = useState<WLANAssignmentMode>('all_sites');
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [selectedSiteGroupIds, setSelectedSiteGroupIds] = useState<string[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Load sites when dialog opens
  useEffect(() => {
    if (!open) return;
    apiService
      .getSites()
      .then(setSites)
      .catch(() => setSites([]));
  }, [open]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSsid('');
      setVlan('1');
      setSecurity('wpa2-psk');
      setPassphrase('');
      setAssignmentMode('all_sites');
      setSelectedSiteIds([]);
      setSelectedSiteGroupIds([]);
    }
  }, [open]);

  const requiresPassphrase = PSK_MODES.includes(security);

  const isValid = () => {
    if (!ssid.trim()) return false;
    if (requiresPassphrase && !passphrase.trim()) return false;
    if (
      assignmentMode === 'selected_targets' &&
      selectedSiteIds.length === 0 &&
      selectedSiteGroupIds.length === 0
    )
      return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!isValid()) return;
    setSubmitting(true);

    const serviceData = {
      serviceName: ssid.trim(),
      ssid: ssid.trim(),
      security: security as SecurityType,
      passphrase: requiresPassphrase ? passphrase : undefined,
      vlan: vlan ? parseInt(vlan, 10) : 1,
      band: 'dual' as const,
      enabled: true,
      sites: selectedSiteIds,
      mbo: true,
      uapsdEnabled: true,
      clientToClientCommunication: true,
    };

    try {
      const assignmentService = new WLANAssignmentService();

      if (assignmentMode === 'unassigned') {
        const result = await assignmentService.createWLANUnassigned(serviceData);
        if (!result.success) throw new Error(result.errors?.[0] ?? 'Creation failed');
        toast.success('WLAN Created', { description: `${ssid} saved globally (not deployed)` });
      } else if (assignmentMode === 'all_sites') {
        const allSiteIds = sites.map((s) => s.id);
        const result = await assignmentService.createWLANWithAutoAssignment({
          ...serviceData,
          sites: allSiteIds,
        });
        if (!result.success) throw new Error(result.errors?.[0] ?? 'Creation failed');
        toast.success('WLAN Created', {
          description: `Assigned to ${result.profilesAssigned} profile(s) across ${result.sitesProcessed} site(s)`,
        });
      } else {
        // selected_targets — apply ALL_PROFILES_AT_SITE to each selected site.
        // Cast sites to include site_group_id (present at runtime from API, not in network.ts Site type).
        const sitesWithGroup = sites as Array<Site & { site_group_id?: string }>;
        const allTargetSiteIds = Array.from(
          new Set([
            ...selectedSiteIds,
            ...sitesWithGroup
              .filter(
                (s) => s.site_group_id != null && selectedSiteGroupIds.includes(s.site_group_id)
              )
              .map((s) => s.id),
          ])
        );
        const siteAssignments = allTargetSiteIds.map((siteId) => ({
          siteId,
          siteName: sites.find((s) => s.id === siteId)?.name ?? siteId,
          deploymentMode: 'ALL_PROFILES_AT_SITE' as const,
          includedProfiles: [],
          excludedProfiles: [],
        }));
        const result = await assignmentService.createWLANWithSiteCentricDeployment(
          { ...serviceData, sites: allTargetSiteIds },
          siteAssignments
        );
        if (!result.success) throw new Error(result.errors?.[0] ?? 'Creation failed');
        toast.success('WLAN Created', {
          description: `Assigned to ${result.profilesAssigned} profile(s) across ${result.sitesProcessed} site(s)`,
        });
      }

      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error('Failed to create WLAN', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" style={{ maxWidth: 560 }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Zap className="h-4 w-4 text-emerald-500" />
            Quick WLAN
          </DialogTitle>
          <DialogDescription className="text-xs">
            Create a new WLAN with sensible defaults. Use the full editor for advanced settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* SSID + VLAN row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="qw-ssid">SSID Name</Label>
              <Input
                id="qw-ssid"
                placeholder="Network name"
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qw-vlan">VLAN</Label>
              <Input
                id="qw-vlan"
                placeholder="1"
                value={vlan}
                onChange={(e) => setVlan(e.target.value)}
                type="number"
                min={1}
                max={4094}
              />
            </div>
          </div>

          {/* Authentication */}
          <div className="space-y-1.5">
            <Label htmlFor="qw-security">Authentication</Label>
            <Select value={security} onValueChange={(v) => setSecurity(v as QuickSecurityType)}>
              <SelectTrigger id="qw-security" aria-label="Authentication">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wpa2-psk">WPA2-PSK (AES)</SelectItem>
                <SelectItem value="wpa3-personal">WPA3-Personal (SAE)</SelectItem>
                <SelectItem value="wpa2-enterprise">WPA2-Enterprise</SelectItem>
                <SelectItem value="open">Open</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Passphrase — hidden for open / enterprise */}
          {requiresPassphrase && (
            <div className="space-y-1.5">
              <Label htmlFor="qw-passphrase">Passphrase</Label>
              <Input
                id="qw-passphrase"
                placeholder="Passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>
          )}

          <Separator />

          {/* Deployment / assignment */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Deployment</Label>
            <AssignmentSection
              value={assignmentMode}
              onChange={setAssignmentMode}
              selectedSiteIds={selectedSiteIds}
              selectedSiteGroupIds={selectedSiteGroupIds}
              onSitesChange={setSelectedSiteIds}
              onSiteGroupsChange={setSelectedSiteGroupIds}
              sites={sites}
              siteGroups={siteGroups}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="h-9"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid() || submitting}
            className="h-9 px-4 font-medium"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create WLAN
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
