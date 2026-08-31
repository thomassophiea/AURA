/**
 * Audit Trail — every PPSK create / update / enable / disable / delete / reveal
 * / keyfile-render, from the AURA audit log (server filters to ppsk.* actions).
 * Passphrases never appear here; only who did what, when, to which keyid.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../ui/dialog';
import { Badge } from '../../ui/badge';
import { ppskService, type PpskAuditEntry } from '../../../services/ppskService';

const ACTION_LABEL: Record<string, string> = {
  'ppsk.create': 'Created',
  'ppsk.update': 'Updated',
  'ppsk.enable': 'Enabled',
  'ppsk.disable': 'Disabled',
  'ppsk.delete': 'Deleted',
  'ppsk.reveal': 'Revealed',
  'ppsk.keyfile.render': 'Rendered key file',
};

export interface PpskAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PpskAuditDialog({ open, onOpenChange }: PpskAuditDialogProps) {
  const [entries, setEntries] = useState<PpskAuditEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEntries(null);
    ppskService
      .audit(200)
      .then((e) => !cancelled && setEntries(e))
      .catch(() => !cancelled && toast.error('Could not load the audit trail'));
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Audit Trail</DialogTitle>
          <DialogDescription>Every change to a Pre-Shared Key. Passphrases are never shown.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">When</th>
                <th className="px-3 py-2 text-left font-medium">Action</th>
                <th className="px-3 py-2 text-left font-medium">Key</th>
                <th className="px-3 py-2 text-left font-medium">Actor</th>
              </tr>
            </thead>
            <tbody>
              {entries === null && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {entries?.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No PPSK activity recorded yet.</td></tr>
              )}
              {entries?.map((e) => (
                <tr key={e.id} className="border-t border-border/60">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{new Date(e.at).toLocaleString()}</td>
                  <td className="px-3 py-2"><Badge variant="secondary">{ACTION_LABEL[e.action] ?? e.action}</Badge></td>
                  <td className="px-3 py-2 font-medium">{e.target ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.actor ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
