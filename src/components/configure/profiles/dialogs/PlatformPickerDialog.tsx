/**
 * Add Profile step 1 (add-edit-profile.html create mode) — required unique Name
 * plus the camera-filtered AP Platform picker. Confirm is gated until both are
 * valid; the parent then seeds a profile by cloning the platform's predefined
 * template and opens the full editor.
 */
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../ui/dialog';
import { Button } from '../../../ui/button';
import { Input } from '../../../ui/input';
import { LabelRow, PSelect } from '../controls';
import type { Opt } from '../types';

export interface PlatformPickerDialogProps {
  open: boolean;
  platforms: string[];
  existingNames: string[];
  onConfirm: (platform: string, name: string) => void;
  onClose: () => void;
}

export function PlatformPickerDialog({ open, platforms, existingNames, onConfirm, onClose }: PlatformPickerDialogProps) {
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('');

  const trimmed = name.trim();
  const nameErr = !trimmed
    ? 'Name is required'
    : existingNames.indexOf(trimmed) >= 0
      ? 'A profile with this name already exists'
      : null;
  const valid = !nameErr && !!platform;

  const opts: Opt[] = [{ id: '', label: '— Select Platform —' }, ...platforms.map((p) => ({ id: p, label: p }))];

  const reset = () => {
    setName('');
    setPlatform('');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Profile</DialogTitle>
          <DialogDescription>
            Selecting a platform seeds the profile with that platform&apos;s default radios, wired ports and feature set.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <LabelRow label="Name" labelWidth={110} error={name ? nameErr : null}>
            <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="Profile name" />
          </LabelRow>
          <LabelRow label="AP Platform" labelWidth={110}>
            <PSelect value={platform} options={opts} onChange={setPlatform} className="w-64" ariaLabel="AP platform" />
          </LabelRow>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!valid}
            onClick={() => {
              onConfirm(platform, trimmed);
              reset();
            }}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
