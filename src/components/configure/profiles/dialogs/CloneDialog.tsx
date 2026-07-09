/**
 * Profile Clone dialog (profile-clone.html) — single required, unique "Cloned
 * Profile Name" input. Confirm is gated until the name is valid.
 */
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../../ui/dialog';
import { Button } from '../../../ui/button';
import { Input } from '../../../ui/input';
import { LabelRow } from '../controls';

export interface CloneDialogProps {
  open: boolean;
  sourceName: string;
  existingNames: string[];
  onConfirm: (name: string) => void;
  onClose: () => void;
}

export function CloneDialog({ open, sourceName, existingNames, onConfirm, onClose }: CloneDialogProps) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName(sourceName ? `${sourceName} (copy)` : '');
  }, [open, sourceName]);

  const trimmed = name.trim();
  const err = !trimmed
    ? 'Name is required'
    : existingNames.indexOf(trimmed) >= 0
      ? 'A profile with this name already exists'
      : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Clone Profile</DialogTitle>
        </DialogHeader>
        <LabelRow label="Cloned Profile Name" labelWidth={150} error={name ? err : null}>
          <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} />
        </LabelRow>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!!err} onClick={() => onConfirm(trimmed)}>
            Clone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
