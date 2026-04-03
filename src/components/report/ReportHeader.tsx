import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  RefreshCw, Download, Printer, Share2, Settings, Clock, Pencil,
  Copy, Plus, Trash2, RotateCcw, Check, X,
} from 'lucide-react';
import { cn } from '../ui/utils';
import type { ReportConfig, ReportPageConfig } from '../../types/reportConfig';

const DURATION_OPTIONS = [
  { value: '3H', label: '3 Hours' },
  { value: '24H', label: '24 Hours' },
  { value: '7D', label: '7 Days' },
  { value: '30D', label: '30 Days' },
];

interface ReportHeaderProps {
  configs: ReportConfig[];
  activeConfig: ReportConfig;
  activePage: ReportPageConfig | null;
  duration: string;
  lastUpdated: Date | null;
  refreshing: boolean;
  isEditing: boolean;
  siteLabel: string;
  onSelectConfig: (id: string) => void;
  onDurationChange: (dur: string) => void;
  onRefresh: () => void;
  onExport: () => void;
  onPrint: () => void;
  onShare: () => void;
  onToggleEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReset: () => void;
  onCreateNew: () => void;
}

export function ReportHeader({
  configs, activeConfig, activePage, duration, lastUpdated, refreshing,
  isEditing, siteLabel,
  onSelectConfig, onDurationChange, onRefresh, onExport, onPrint, onShare,
  onToggleEdit, onDuplicate, onDelete, onReset, onCreateNew,
}: ReportHeaderProps) {
  const pageIcon = activePage ? (
    <div className="p-1.5 rounded-lg bg-primary/10">
      <Settings className="h-5 w-5 text-primary" />
    </div>
  ) : null;

  return (
    <div className="flex-shrink-0 px-4 py-3 border-b border-border/50 bg-card/30 print:bg-white print:border-b-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* Left side: config selector + page info */}
        <div className="flex items-center gap-3">
          {/* Config selector */}
          <Select value={activeConfig.id} onValueChange={onSelectConfig}>
            <SelectTrigger size="sm" className="w-[200px] text-xs bg-transparent border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {configs.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-2">
                    <span>{c.name}</span>
                    {c.isDefault && <Badge variant="secondary" className="text-[9px]">Default</Badge>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activePage && (
            <div>
              <h1 className="text-sm font-semibold">{activePage.title}</h1>
              {activePage.description && <p className="text-[10px] text-muted-foreground">{activePage.description}</p>}
            </div>
          )}
        </div>

        {/* Right side: controls */}
        <div className="flex items-center gap-1.5 print:hidden">
          {/* Edit toggle */}
          <Button
            variant={isEditing ? 'default' : 'outline'}
            size="sm"
            onClick={onToggleEdit}
            className="text-xs"
          >
            {isEditing ? <><Check className="h-3.5 w-3.5 mr-1" />Done</> : <><Pencil className="h-3.5 w-3.5 mr-1" />Edit</>}
          </Button>

          {isEditing ? (
            <>
              <Button variant="outline" size="sm" className="text-xs" onClick={onCreateNew}>
                <Plus className="h-3.5 w-3.5 mr-1" />New
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={onDuplicate}>
                <Copy className="h-3.5 w-3.5 mr-1" />Duplicate
              </Button>
              {!activeConfig.isDefault && (
                <Button variant="outline" size="sm" className="text-xs text-red-400 hover:text-red-500" onClick={onDelete}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                </Button>
              )}
              <Button variant="outline" size="sm" className="text-xs" onClick={onReset}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />Reset
              </Button>
            </>
          ) : (
            <>
              {/* Duration selector */}
              <div className="flex items-center border border-border/50 rounded-md overflow-hidden">
                {DURATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => onDurationChange(opt.value)}
                    className={cn(
                      'px-2 py-1 text-[11px] font-medium transition-colors',
                      duration === opt.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
                <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              </Button>
              <Button variant="outline" size="sm" onClick={onShare}>
                <Share2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={onExport}>
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={onPrint}>
                <Printer className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {lastUpdated && !isEditing && (
        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          Updated {lastUpdated.toLocaleTimeString()} &middot; {duration} &middot; {siteLabel}
        </div>
      )}
    </div>
  );
}
