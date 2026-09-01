/**
 * Audit Trail — every Private SAE create / update / enable / disable / delete /
 * reveal / keyfile-render / enroll / revoke-binding, from the AURA audit log
 * (server filters to sae.* actions). Passphrases never appear here; only who did
 * what, when, to which keyid.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog';
import { Badge } from '../../ui/badge';
import { privateSaeService, type SaeAuditEntry } from '../../../services/privateSaeService';

const ACTION_LABEL: Record<string, string> = {
  'sae.create': 'Created',
  'sae.update': 'Updated',
  'sae.enable': 'Enabled',
  'sae.disable': 'Disabled',
  'sae.delete': 'Deleted',
  'sae.reveal': 'Revealed',
  'sae.keyfile.render': 'Rendered sae_password file',
  'sae.enroll': 'Enrolled device',
  'sae.revoke-binding': 'Revoked device',
};

export interface PrivateSaeAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrivateSaeAuditDialog({ open, onOpenChange }: PrivateSaeAuditDialogProps) {
  const [entries, setEntries] = useState<SaeAuditEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEntries(null);
    privateSaeService
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
          <DialogDescription>Every change to a Private SAE key. Passphrases are never shown.</DialogDescription>
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
                <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No Private SAE activity recorded yet.</td></tr>
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
