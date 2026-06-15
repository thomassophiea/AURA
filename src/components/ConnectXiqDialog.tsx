/**
 * Connect XIQ dialog — lets the user authenticate an XIQ account for a site
 * group from the UI. Saves the credentials (per site group) so the session is
 * re-established automatically on token expiry / redeploy, with no server env.
 *
 * On success it dispatches a global `xiq-connected` event; useSourceSites
 * listens for it and reloads the XIQ site list.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Cloud, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  xiqService,
  XIQ_REGION_LABELS,
  XIQ_REGION_ORDER,
  type XIQRegion,
} from '../services/xiqService';
import type { SiteGroup } from '../types/domain';

interface ConnectXiqDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteGroups: SiteGroup[];
  defaultSiteGroupId?: string | null;
}

export function ConnectXiqDialog({
  open,
  onOpenChange,
  siteGroups,
  defaultSiteGroupId,
}: ConnectXiqDialogProps) {
  const firstId = defaultSiteGroupId || siteGroups[0]?.id || '';
  const [siteGroupId, setSiteGroupId] = useState(firstId);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState<XIQRegion>('global');
  const [connecting, setConnecting] = useState(false);

  const targetId = siteGroupId || firstId;

  const handleConnect = async () => {
    if (!targetId) {
      toast.error('No site group available to connect XIQ to.');
      return;
    }
    if (!email.trim() || !password) {
      toast.error('Email and password are required.');
      return;
    }
    setConnecting(true);
    try {
      await xiqService.login(email.trim(), password, region, targetId);
      // Persist so the session re-establishes automatically (no server env needed).
      xiqService.saveCredentials(targetId, email.trim(), password, region);
      toast.success('XIQ connected');
      window.dispatchEvent(new CustomEvent('xiq-connected'));
      setPassword('');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'XIQ login failed');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-cyan-500" />
            Connect XIQ
          </DialogTitle>
          <DialogDescription>
            Sign in to ExtremeCloud IQ for a site group. Credentials are stored locally for this
            site group and reused automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {siteGroups.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Site Group</Label>
              <Select value={targetId} onValueChange={setSiteGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select site group" />
                </SelectTrigger>
                <SelectContent>
                  {siteGroups.map((sg) => (
                    <SelectItem key={sg.id} value={sg.id}>
                      {sg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="xiq-email" className="text-xs">
              XIQ Email
            </Label>
            <Input
              id="xiq-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="xiq-password" className="text-xs">
              Password
            </Label>
            <Input
              id="xiq-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConnect();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Region</Label>
            <Select value={region} onValueChange={(v) => setRegion(v as XIQRegion)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {XIQ_REGION_ORDER.map((r) => (
                  <SelectItem key={r} value={r}>
                    {XIQ_REGION_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={connecting}>
            Cancel
          </Button>
          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting…
              </>
            ) : (
              'Connect'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
