/**
 * Footer "Actions" menu for the AP list (ctrl.apActions + cert submenu, gaps
 * 18/19). Disabled with no selection, matching the controller graying the
 * menu. Each item opens its parameterized modal (ApActionsModal). The cert
 * submenu = Generate Signing Request / Apply Certificate.
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

export interface ApActionsMenuProps {
  selectedCount: number;
  onSelect: (key: ApActionKey, label: string) => void;
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
