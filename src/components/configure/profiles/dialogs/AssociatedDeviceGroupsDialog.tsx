/**
 * Associated Device Groups dialog (associatedDeviceGroups.html) — surfaces the
 * site device groups that reference this profile. Sites are loaded lazily when
 * the dialog opens so the list view stays cheap.
 */
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../../ui/dialog';
import { Button } from '../../../ui/button';
import { sitesService } from '../../../../services/configure';
import { getUserFriendlyMessage } from '../../../../services/errorHandler';

export interface AssociatedDeviceGroupsDialogProps {
  open: boolean;
  profileId: string | null;
  onClose: () => void;
}

export function AssociatedDeviceGroupsDialog({ open, profileId, onClose }: AssociatedDeviceGroupsDialogProps) {
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !profileId) return;
    let active = true;
    setLoading(true);
    setError(null);
    sitesService
      .list()
      .then((sites) => {
        if (!active) return;
        const found: string[] = [];
        sites.forEach((s) =>
          (s.deviceGroups ?? []).forEach((g) => {
            if (g.profileId === profileId) found.push(`${g.groupName} @ ${s.siteName}`);
          })
        );
        setGroups(found);
      })
      .catch((err) => {
        if (active) setError(getUserFriendlyMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, profileId]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Associated Device Groups</DialogTitle>
        </DialogHeader>
        <div className="min-h-16 text-sm">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading device groups...
            </div>
          ) : error ? (
            <p className="text-destructive">{error}</p>
          ) : groups.length === 0 ? (
            <p className="text-muted-foreground">No device groups reference this profile.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5">
              {groups.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
