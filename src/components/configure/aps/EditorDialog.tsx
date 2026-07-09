/**
 * Modal shell for the AP editor's sub-document popovers (Radio Advanced, WLAN
 * override matrix, Advanced Settings, Professional Install, Meshpoint
 * overrides, New AP, AP Actions). Sticky title, scrollable body, Cancel / OK
 * footer with dirty + valid gating — the pModalShell equivalent in AURA's kit.
 */
import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Button } from '../../ui/button';

export interface EditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** Max content width in px (Radix content is centered). */
  maxWidth?: number;
  okLabel?: string;
  okDisabled?: boolean;
  onOk: () => void;
  children: React.ReactNode;
}

export function EditorDialog({
  open,
  onOpenChange,
  title,
  maxWidth = 640,
  okLabel = 'OK',
  okDisabled,
  onOk,
  children,
}: EditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-[95vw]"
        style={{ width: maxWidth, maxWidth: '95vw' }}
      >
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">{children}</div>
        <DialogFooter className="border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={okDisabled} onClick={onOk}>
            {okLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
