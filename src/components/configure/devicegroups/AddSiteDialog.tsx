/**
 * Add a member Site to an aggregated Device Group. The group is applied to
 * the site with its Profile and RF policy already set (one binding, many
 * sites); AP membership is chosen afterwards per site. Read-only sites are
 * listed but not addable — saving the group PUTs the owning site record.
 */
import React from 'react';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import type { SiteConfig } from '../../../types/configure';
import { apEligibility, type DeviceGroupAp, type SerialClaim } from './devicegroupsModel';

export interface AddSiteDialogProps {
  groupName: string;
  platform: string;
  /** Sites not yet members of the group. */
  candidates: SiteConfig[];
  aps: DeviceGroupAp[];
  claims: Map<string, SerialClaim>;
  onAdd: (site: SiteConfig) => void;
  onClose: () => void;
}

export function AddSiteDialog({
  groupName,
  platform,
  candidates,
  aps,
  claims,
  onAdd,
  onClose,
}: AddSiteDialogProps) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{`Add Site to ${groupName || 'Device Group'}`}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          The group is applied to the site with its profile and policy already set. Choose its
          access points afterwards.
        </p>
        <div className="max-h-[360px] overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>{platform ? `${platform} access points` : 'Access points'}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.length ? (
                candidates.map((site) => {
                  const eligible = apEligibility(aps, site.siteName, platform, claims).eligible;
                  const editable = site.canEdit !== false;
                  return (
                    <TableRow key={site.id}>
                      <TableCell className="font-medium">{site.siteName}</TableCell>
                      <TableCell>{eligible.length}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!editable}
                          title={editable ? undefined : 'This site is read-only'}
                          onClick={() => onAdd(site)}
                        >
                          Add
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    Every site is already a member
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
