/**
 * Footer "Actions" menu for the AP list (ctrl.apActions + cert submenu, gaps
 * 18/19). Disabled with no selection, matching the controller graying the
 * menu. Parameterized items open ApActionsModal; Delete and Reboot are wired
 * to the real DELETE /v1/aps/{serial} and POST /v1/aps/{serial}/reboot
 * endpoints via confirmation dialogs owned by the page. The controller menu
 * also carries "Release to Cloud"; no release endpoint is identifiable in
 * this codebase, so that item is deliberately NOT offered (no fake actions).
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

/** Modal-backed action keys plus the two directly-wired list operations. */
export type ApMenuKey = ApActionKey | 'delete' | 'reboot';

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
          onSelect={() => onSelect('delete', 'Delete')}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
