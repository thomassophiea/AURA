import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Link, Copy, Download, Upload, Check, Globe, FileText, Share2,
} from 'lucide-react';
import { toast } from 'sonner';

interface ReportShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareURL: string;
  configJSON: string;
  configName: string;
  onImport: (json: string) => boolean;
}

export function ReportShareDialog({
  open, onOpenChange, shareURL, configJSON, configName, onImport,
}: ReportShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareURL);
    setCopied(true);
    toast.success('Report link copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportJSON = () => {
    const blob = new Blob([configJSON], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${configName.replace(/\s+/g, '-').toLowerCase()}-report-config.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Report configuration exported');
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const json = ev.target?.result as string;
      const success = onImport(json);
      if (success) {
        toast.success('Report imported successfully');
        onOpenChange(false);
      } else {
        toast.error('Invalid report configuration file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            Share Interactive Report
          </DialogTitle>
          <DialogDescription>
            Create an Extreme Interactive Report — a live, shareable dashboard accessible from any browser
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Share Link */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Extreme Interactive Report</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Anyone with this link can view this report — no login required.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={shareURL}
                className="flex-1 px-3 py-1.5 text-[11px] font-mono bg-muted/50 border border-border rounded-md text-muted-foreground truncate"
              />
              <Button size="sm" onClick={handleCopyLink} className="flex-shrink-0">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Badge variant="outline" className="text-[9px]">No Login Required</Badge>
              Data snapshot embedded — viewable by anyone with the link
            </div>
          </div>

          <div className="border-t border-border/50" />

          {/* Export / Import */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleExportJSON}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-colors"
            >
              <Download className="h-5 w-5 text-emerald-400" />
              <span className="text-xs font-medium">Export Config</span>
              <span className="text-[10px] text-muted-foreground">Download as JSON file</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-colors"
            >
              <Upload className="h-5 w-5 text-blue-400" />
              <span className="text-xs font-medium">Import Config</span>
              <span className="text-[10px] text-muted-foreground">Load from JSON file</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportJSON}
            className="hidden"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
