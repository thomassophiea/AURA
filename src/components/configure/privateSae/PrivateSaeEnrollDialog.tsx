/**
 * Enroll Device — bind a station MAC to a Private SAE credential (the enrollment
 * loop that is the product differentiator). An operator can bind a MAC manually,
 * see the credential's current bindings and revoke one, and hand the end user an
 * enrollment link / short-code (with a QR placeholder) for the self-service path.
 *
 * Enrollment is honest about the wireless plane: a binding is stored and shown,
 * but the controller does not yet consume it — the banner says so, matching the
 * sae_password preview.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { QrCode, Trash2, Link2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import {
  privateSaeService,
  SaeRequestError,
  type SaeCredential,
  type SaeBinding,
} from '../../../services/privateSaeService';

export interface PrivateSaeEnrollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credential: SaeCredential | null;
  onChanged?: () => void;
}

/** Deterministic short-code from the credential id — a stand-in for a signed enrollment token. */
function shortCode(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h.toString(36).toUpperCase().slice(0, 6).padStart(6, '0');
}

export function PrivateSaeEnrollDialog({ open, onOpenChange, credential, onChanged }: PrivateSaeEnrollDialogProps) {
  const [mac, setMac] = useState('');
  const [busy, setBusy] = useState(false);
  const [bindings, setBindings] = useState<SaeBinding[] | null>(null);

  const load = useCallback(async () => {
    if (!credential) return;
    try {
      setBindings(await privateSaeService.bindings(credential.id));
    } catch {
      toast.error('Could not load current bindings');
    }
  }, [credential]);

  useEffect(() => {
    if (open && credential) {
      setMac('');
      setBindings(null);
      void load();
    }
  }, [open, credential, load]);

  const enrollLink = useMemo(() => {
    if (!credential) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/enroll/${credential.id}?code=${shortCode(credential.id)}`;
  }, [credential]);

  const atCapacity =
    credential?.maxDevices != null && bindings != null && bindings.length >= credential.maxDevices;

  const enroll = async () => {
    if (!credential || !mac.trim()) return;
    setBusy(true);
    try {
      await privateSaeService.enroll(credential.id, mac.trim());
      toast.success(`Enrolled ${mac.trim()}`);
      setMac('');
      await load();
      onChanged?.();
    } catch (err) {
      if (err instanceof SaeRequestError && err.isMaxDevices) {
        toast.error('This key has reached its maximum number of devices');
      } else {
        toast.error('Could not enroll device', { description: err instanceof Error ? err.message : undefined });
      }
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (m: string) => {
    if (!credential) return;
    try {
      await privateSaeService.revokeBinding(credential.id, m);
      toast.success(`Revoked ${m}`);
      await load();
      onChanged?.();
    } catch {
      toast.error('Could not revoke binding');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(enrollLink);
      toast.success('Enrollment link copied');
    } catch {
      toast.error('Clipboard unavailable');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enroll Device{credential ? ` — ${credential.keyid}` : ''}</DialogTitle>
          <DialogDescription>
            Bind a device MAC to this key, or share the enrollment link so the user enrolls the
            device they are on.
          </DialogDescription>
        </DialogHeader>

        {/* Manual bind */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Bind a MAC manually</label>
          <div className="flex items-center gap-2">
            <Input value={mac} placeholder="AA:BB:CC:DD:EE:FF" onChange={(e) => setMac(e.target.value)} />
            <Button type="button" onClick={() => void enroll()} disabled={busy || !mac.trim() || Boolean(atCapacity)}>
              Enroll
            </Button>
          </div>
          {atCapacity && (
            <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> At capacity ({credential?.maxDevices} devices).
            </p>
          )}
        </div>

        {/* Self-service link + QR placeholder */}
        <div className="rounded-md border border-border p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
              <QrCode className="h-10 w-10" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs text-muted-foreground">Enrollment link</p>
              <code className="block truncate rounded bg-muted px-2 py-1 text-xs">{enrollLink}</code>
              <div className="flex items-center gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
                  <Link2 className="mr-2 h-4 w-4" /> Copy link
                </Button>
                {credential && (
                  <span className="text-xs text-muted-foreground">
                    Short code: <span className="font-mono font-semibold">{shortCode(credential.id)}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] italic text-muted-foreground">
            QR is a placeholder. The controller does not yet consume bindings; they are recorded and
            applied out of band until the enhancement ships.
          </p>
        </div>

        {/* Current bindings */}
        <div>
          <p className="mb-1 text-sm font-medium">
            Bound devices{bindings ? ` (${bindings.length}${credential?.maxDevices != null ? ` / ${credential.maxDevices}` : ''})` : ''}
          </p>
          <div className="max-h-40 overflow-y-auto rounded border border-border">
            {bindings === null && <div className="px-3 py-4 text-center text-xs text-muted-foreground">Loading…</div>}
            {bindings?.length === 0 && <div className="px-3 py-4 text-center text-xs text-muted-foreground">No devices enrolled yet.</div>}
            {bindings?.map((b) => (
              <div key={b.id} className="flex items-center justify-between border-b border-border/60 px-3 py-2 last:border-0">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono">{b.mac}</Badge>
                  <span className="text-xs text-muted-foreground">bound {new Date(b.boundAt).toLocaleDateString()}</span>
                </div>
                <button type="button" className="text-destructive hover:opacity-80" aria-label={`Revoke ${b.mac}`}
                  onClick={() => void revoke(b.mac)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
