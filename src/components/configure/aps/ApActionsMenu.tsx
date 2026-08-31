/**
 * Footer "Actions" menu for the AP list (ctrl.apActions + cert submenu, gaps
 * 18/19). Disabled with no selection, matching the controller graying the
 * menu. Parameterized items open ApActionsModal; Delete, Reboot and Release
 * to Cloud are wired to the real DELETE /v1/aps/{serial},
 * POST /v1/aps/{serial}/reboot and PUT /v1/aps/releasetocloud endpoints via
 * confirmation dialogs owned by the page. The release contract was recovered
 * from the gateway's own UI bundles (device-data-factory `release`:
 * PUT aps/releasetocloud, body {serialNumbers}); the gateway offers the item
 * unconditionally on a multi-selection, which is the behavior mirrored here.
 */
import React from 'react';
import { ChevronDown, Settings2 } from 'lucide-react';
import { Button } from '../../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import type { ApActionKey } from './ApActionsModal';

/** Modal-backed action keys plus the directly-wired list operations. */
export type ApMenuKey = ApActionKey | 'delete' | 'reboot' | 'release';

export interface ApActionsMenuProps {
  selectedCount: number;
  onSelect: (key: ApMenuKey, label: string) => void;
}

export function ApActionsMenu({ selectedCount, onSelect }: ApActionsMenuProps) {
  const disabled = selectedCount === 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Settings2 className="mr-1 h-4 w-4" />
          Actions
          <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onSelect('assign', 'Assign to Site')}>
          Assign to Site
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect('adopt', 'Adoption Preference')}>
          Adoption Preference
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect('event', 'Event Level')}>
          Event Level
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect('image', 'Image Upgrade')}>
          Image Upgrade
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Manage Certificate</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => onSelect('csr', 'Generate Signing Request')}>
              Generate Signing Request
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSelect('applycert', 'Apply Certificate')}>
              Apply Certificate
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onSelect('reboot', 'Reboot')}>Reboot</DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => onSelect('release', 'Release to Cloud')}
        >
          Release to Cloud
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => onSelect('delete', 'Delete')}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
