/**
 * Client Bridge Credentials dialog (cbUser.html) — writes cbUser / cbPassword.
 */
import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../../ui/dialog';
import { Button } from '../../../ui/button';
import { Input } from '../../../ui/input';
import { LabelRow } from '../controls';
import { MaskedInput } from '../../_kit';

export interface ClientBridgeDialogProps {
  open: boolean;
  cbUser: string;
  cbPassword: string;
  onChange: (key: 'cbUser' | 'cbPassword', value: string) => void;
  onClose: () => void;
}

export function ClientBridgeDialog({ open, cbUser, cbPassword, onChange, onClose }: ClientBridgeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Client Bridge Credentials</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <LabelRow label="Username" labelWidth={110}>
            <Input className="h-9" value={cbUser || ''} onChange={(e) => onChange('cbUser', e.target.value)} />
          </LabelRow>
          <LabelRow label="Password" labelWidth={110}>
            <MaskedInput value={cbPassword || ''} onChange={(v) => onChange('cbPassword', v)} />
          </LabelRow>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
