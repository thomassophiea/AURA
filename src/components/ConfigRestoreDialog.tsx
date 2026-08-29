/**
 * Config restore dialog — dry run first, apply gated behind CONFIG_RESTORE_ENABLED.
 *
 * Opening the dialog immediately runs a dry-run POST (no `confirm`), which the
 * server always answers with `{ dryRun: true, plan }` and no controller
 * writes. An "Apply restore" action only appears once the server reports
 * restore is enabled for this deployment, and it stays disabled until the
 * admin types the exact snapshot id back — the same confirmation token the
 * server checks (`confirm === String(snapshotId)`).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { AlertTriangle, Plus, Minus, Pencil, RefreshCw, ShieldAlert, Loader2 } from 'lucide-react';
import { apiService, getDynamicControllerUrl } from '../services/api';
import { toast } from 'sonner';

interface RestorePlanSection {
  section: string;
  label: string;
  toCreate: string[];
  toUpdate: string[];
  toDelete: string[];
}

interface RestoreAppliedItem {
  section: string;
  name: string;
  op: 'create' | 'update' | 'delete';
  ok: boolean;
  error?: string;
  skipped?: string;
}

interface RestoreDryRunResponse {
  dryRun: true;
  plan: RestorePlanSection[];
  warning?: string | null;
}

interface RestoreAppliedResponse {
  dryRun: false;
  applied: RestoreAppliedItem[];
  plan: RestorePlanSection[];
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = apiService.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const controllerUrl = getDynamicControllerUrl();
  if (controllerUrl) headers['X-Controller-URL'] = controllerUrl;
  return headers;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, { credentials: 'include', ...init, headers: authHeaders() });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok && resp.status !== 403) {
    throw new Error(body.error ?? `HTTP ${resp.status}`);
  }
  return body as T;
}

function planHasChanges(plan: RestorePlanSection[]): boolean {
  return plan.some((s) => s.toCreate.length + s.toUpdate.length + s.toDelete.length > 0);
}

interface ConfigRestoreDialogProps {
  snapshotId: number;
  /** The controller this snapshot was captured from — shown so an admin can
   * confirm it matches the controller they're about to restore onto. */
  sourceBaseUrl?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ConfigRestoreDialog({
  snapshotId,
  sourceBaseUrl,
  open,
  onOpenChange,
}: ConfigRestoreDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<RestorePlanSection[] | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [disabledMessage, setDisabledMessage] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<RestoreAppliedItem[] | null>(null);

  const runDryRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    setApplied(null);
    setConfirmText('');
    try {
      const [dry, status] = await Promise.all([
        api<RestoreDryRunResponse>('/api/config/restore', {
          method: 'POST',
          body: JSON.stringify({ snapshotId }),
        }),
        api<{ enabled: boolean }>('/api/config/restore/status'),
      ]);
      setPlan(dry.plan ?? []);
      setWarning(dry.warning ?? null);
      setEnabled(Boolean(status.enabled));
      setDisabledMessage(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [snapshotId]);

  useEffect(() => {
    if (open) runDryRun();
  }, [open, runDryRun]);

  const applyRestore = async () => {
    setApplying(true);
    try {
      const result = await api<RestoreAppliedResponse & { error?: string; plan?: RestorePlanSection[] }>(
        '/api/config/restore',
        {
          method: 'POST',
          body: JSON.stringify({ snapshotId, confirm: confirmText }),
        }
      );
      if (result.dryRun === false) {
        setApplied(result.applied);
        setPlan(result.plan);
        toast.success(`Restore applied for snapshot #${snapshotId}`);
      } else {
        // Server reported the apply gate is off after all (raced env change).
        setDisabledMessage(result.error ?? 'Config restore is disabled.');
        if (result.plan) setPlan(result.plan);
      }
    } catch (err) {
      toast.error(`Restore failed: ${(err as Error).message}`);
    } finally {
      setApplying(false);
    }
  };

  const hasChanges = plan ? planHasChanges(plan) : false;
  const confirmMatches = confirmText.trim() === String(snapshotId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Restore snapshot #{snapshotId}</DialogTitle>
          <DialogDescription>
            Shows exactly what would be created, updated, or deleted on the live gateway to
            match this snapshot. Nothing is written until you explicitly apply.
          </DialogDescription>
          {sourceBaseUrl && (
            <p className="text-xs text-muted-foreground">
              Captured from <span className="font-mono">{sourceBaseUrl}</span>
            </p>
          )}
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> Computing restore plan...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && plan && (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {!hasChanges ? (
              <p className="text-sm text-emerald-500">
                The live configuration already matches this snapshot — nothing to restore.
              </p>
            ) : (
              plan
                .filter((s) => s.toCreate.length + s.toUpdate.length + s.toDelete.length > 0)
                .map((section) => (
                  <div key={section.section} className="rounded-lg border border-border/40 p-3">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-sm font-medium">{section.label}</span>
                      {section.toCreate.length > 0 && (
                        <Badge variant="outline" className="text-[10px] text-emerald-500">
                          +{section.toCreate.length} create
                        </Badge>
                      )}
                      {section.toUpdate.length > 0 && (
                        <Badge variant="outline" className="text-[10px] text-amber-500">
                          {section.toUpdate.length} update
                        </Badge>
                      )}
                      {section.toDelete.length > 0 && (
                        <Badge variant="outline" className="text-[10px] text-red-500">
                          -{section.toDelete.length} delete
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-1 text-xs">
                      {section.toCreate.map((name) => (
                        <div key={`c-${name}`} className="flex items-center gap-1.5 text-emerald-500">
                          <Plus className="h-3 w-3" /> {name}
                        </div>
                      ))}
                      {section.toUpdate.map((name) => (
                        <div key={`u-${name}`} className="flex items-center gap-1.5 text-amber-500">
                          <Pencil className="h-3 w-3" /> {name}
                        </div>
                      ))}
                      {section.toDelete.map((name) => (
                        <div key={`d-${name}`} className="flex items-center gap-1.5 text-red-500">
                          <Minus className="h-3 w-3" /> {name}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
            )}

            {applied && (
              <div className="rounded-lg border border-border/40 p-3 space-y-1">
                <div className="text-sm font-medium mb-1">Applied</div>
                {applied.map((item, i) => (
                  <div
                    key={`${item.section}-${item.op}-${item.name}-${i}`}
                    className={`flex items-center gap-1.5 text-xs ${
                      item.skipped
                        ? 'text-muted-foreground'
                        : item.ok
                          ? 'text-emerald-500'
                          : 'text-red-500'
                    }`}
                  >
                    <span className="uppercase tracking-wide text-[10px] w-12 shrink-0">
                      {item.op}
                    </span>
                    <span className="flex-1 truncate">{item.name}</span>
                    {item.skipped && <span>skipped — {item.skipped}</span>}
                    {!item.skipped && !item.ok && <span>failed{item.error ? ` — ${item.error}` : ''}</span>}
                  </div>
                ))}
              </div>
            )}

            {warning && !applied && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{warning}</span>
              </div>
            )}

            {hasChanges && !applied && (
              <div className="rounded-lg border border-border/40 p-3 space-y-2">
                {!enabled ? (
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      {disabledMessage ??
                        'Applying a restore is disabled on this deployment. Set CONFIG_RESTORE_ENABLED=true to allow it.'}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        This writes directly to the live gateway and cannot be undone by AURA.
                        Type <strong>{snapshotId}</strong> to confirm.
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="restore-confirm" className="sr-only">
                        Confirm snapshot id
                      </Label>
                      <Input
                        id="restore-confirm"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={`Type ${snapshotId} to confirm`}
                        className="h-8"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!confirmMatches || applying}
                        onClick={applyRestore}
                      >
                        {applying ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Apply restore
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
