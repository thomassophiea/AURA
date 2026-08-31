/**
 * Renders the wpa_psk_file AURA would push to the AP for one SSID, and states
 * plainly that the Campus OS controller cannot yet accept it — so an operator
 * can apply it out of band (exactly how it was proven on lab hardware) without
 * being misled into thinking it is already live.
 */
import React, { useEffect, useState } from 'react';
import { Copy, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Button } from '../../ui/button';
import { ppskService, type PpskKeyFile } from '../../../services/ppskService';

export interface PpskKeyFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ssids: string[];
}

export function PpskKeyFileDialog({ open, onOpenChange, ssids }: PpskKeyFileDialogProps) {
  const [ssid, setSsid] = useState<string>(ssids[0] ?? '');
  const [file, setFile] = useState<PpskKeyFile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !ssid) return;
    let cancelled = false;
    setLoading(true);
    ppskService
      .keyfile(ssid)
      .then((f) => !cancelled && setFile(f))
      .catch(() => !cancelled && toast.error('Could not render the key file'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, ssid]);

  const copy = async () => {
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.content);
      toast.success('Key file copied');
    } catch {
      toast.error('Clipboard unavailable');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>wpa_psk_file preview</DialogTitle>
          <DialogDescription>
            What AURA would provision to APs serving this SSID. The AP resolves identity by
            matching the key against the 4-way-handshake MIC.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Select value={ssid} onValueChange={setSsid}>
            <SelectTrigger className="max-w-[280px]"><SelectValue placeholder="Select SSID" /></SelectTrigger>
            <SelectContent>
              {ssids.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {file ? `${file.entryCount} live ${file.entryCount === 1 ? 'key' : 'keys'}` : ''}
          </span>
          <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => void copy()} disabled={!file}>
            <Copy className="mr-2 h-4 w-4" /> Copy
          </Button>
        </div>

        {file && !file.provisioning.supported && (
          <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{file.provisioning.reason}</span>
          </div>
        )}

        <pre className="max-h-[320px] overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
          {loading ? 'Rendering…' : (file?.content ?? '')}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
