/**
 * Right-side editor drawer for Configure resources (700-840px), modeled on
 * the ConfigureRRM/ProfileEditSheet pattern: sticky header, scrollable body
 * (tabs slot), footer with dirty+valid-gated Save. Closing with unsaved
 * changes asks for confirmation.
 */
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../ui/sheet';
import { Button } from '../../ui/button';
import { ConfirmDialog } from './ConfirmDialog';

export interface EditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Drawer width in px, clamped to the 700-840 kit range. */
  width?: number;
  /** Unsaved changes exist — gates Save and arms the discard guard. */
  dirty: boolean;
  /** Current form state passes validation — gates Save. */
  valid: boolean;
  saving?: boolean;
  onSave: () => void | Promise<void>;
  saveLabel?: string;
  cancelLabel?: string;
  /** Extra footer content, rendered left of Cancel/Save. */
  footerExtra?: React.ReactNode;
  children: React.ReactNode;
}

export function EditorSheet({
  open,
  onOpenChange,
  title,
  description,
  width = 760,
  dirty,
  valid,
  saving = false,
  onSave,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
  footerExtra,
  children,
}: EditorSheetProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const clampedWidth = Math.min(840, Math.max(700, width));

  const requestClose = () => {
    if (dirty && !saving) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
          else onOpenChange(true);
        }}
      >
        <SheetContent
          side="right"
          className="flex h-full max-w-full flex-col gap-0 p-0 sm:max-w-none"
          style={{ width: clampedWidth }}
        >
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
            {footerExtra && <div className="mr-auto">{footerExtra}</div>}
            <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
              {cancelLabel}
            </Button>
            <Button
              type="button"
              onClick={() => void onSave()}
              disabled={!dirty || !valid || saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saveLabel}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard unsaved changes?"
        description="Your edits have not been saved to the controller and will be lost."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setConfirmDiscard(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
