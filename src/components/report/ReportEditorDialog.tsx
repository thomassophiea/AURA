/**
 * Report Editor Dialog
 *
 * Allows editing the active report page: title, description,
 * widget selection via WidgetPicker, and widget reordering.
 */

import { useState, useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../ui/sheet';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { GripVertical, Trash2, Settings, Columns, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../ui/utils';
import { WidgetPicker } from './WidgetPicker';
import type { ReportPageConfig, ReportWidgetConfig } from '../../types/reportConfig';

interface ReportEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: ReportPageConfig | null;
  onUpdatePage: (pageId: string, updates: Partial<Pick<ReportPageConfig, 'title' | 'description'>>) => void;
  onAddWidget: (pageId: string, widget: ReportWidgetConfig) => void;
  onRemoveWidget: (pageId: string, widgetId: string) => void;
  onReorderWidgets: (pageId: string, fromIndex: number, toIndex: number) => void;
  onUpdateWidget: (pageId: string, widgetId: string, updates: Partial<ReportWidgetConfig>) => void;
}

export function ReportEditorDialog({
  open, onOpenChange, page,
  onUpdatePage, onAddWidget, onRemoveWidget, onReorderWidgets, onUpdateWidget,
}: ReportEditorDialogProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  if (!page) return null;

  const existingKeys = new Set(page.widgets.map(w => w.widgetKey));

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragRef.current = index;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragRef.current !== null && dragRef.current !== index) setDropIndex(index);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragRef.current !== null && dragRef.current !== index) {
      onReorderWidgets(page.id, dragRef.current, index);
    }
    dragRef.current = null;
    setDragIndex(null);
    setDropIndex(null);
  };

  const handleDragEnd = () => {
    dragRef.current = null;
    setDragIndex(null);
    setDropIndex(null);
  };

  const gridSpanOptions: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Edit Page</SheetTitle>
          <SheetDescription>Customize this report page's content and layout</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Page Details */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Page Title</label>
            <input
              type="text"
              value={page.title}
              onChange={e => onUpdatePage(page.id, { title: e.target.value })}
              className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded-md outline-none focus:ring-1 focus:ring-primary"
            />
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
            <input
              type="text"
              value={page.description || ''}
              onChange={e => onUpdatePage(page.id, { description: e.target.value })}
              className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded-md outline-none focus:ring-1 focus:ring-primary"
              placeholder="Optional page description"
            />
          </div>

          {/* Current Widgets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Widgets ({page.widgets.length})
              </label>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowPicker(!showPicker)}>
                {showPicker ? <><ChevronUp className="h-3 w-3 mr-1" />Hide Catalog</> : <><ChevronDown className="h-3 w-3 mr-1" />Add Widget</>}
              </Button>
            </div>

            {/* Widget Picker (collapsible) */}
            {showPicker && (
              <div className="border border-border/50 rounded-lg p-3 bg-card/50">
                <WidgetPicker
                  existingWidgetKeys={existingKeys}
                  onAddWidget={(widget) => onAddWidget(page.id, widget)}
                />
              </div>
            )}

            {/* Widget List */}
            <div className="space-y-1">
              {page.widgets.map((widget, index) => (
                <div
                  key={widget.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded-md border border-border/50 bg-card/30 group',
                    dragIndex === index && 'opacity-40',
                    dropIndex === index && 'ring-1 ring-primary',
                  )}
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab flex-shrink-0" />

                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={widget.title || widget.widgetKey}
                      onChange={e => onUpdateWidget(page.id, widget.id, { title: e.target.value })}
                      className="w-full text-xs bg-transparent outline-none font-medium"
                    />
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="secondary" className="text-[9px] py-0">{widget.displayType}</Badge>
                      <span className="text-[9px] text-muted-foreground">{widget.source === 'metric_computed' ? 'Local' : 'API'}</span>
                    </div>
                  </div>

                  {/* Grid span selector */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <Columns className="h-3 w-3 text-muted-foreground" />
                    {gridSpanOptions.map(span => (
                      <button
                        key={span}
                        onClick={() => onUpdateWidget(page.id, widget.id, { gridSpan: span })}
                        className={cn(
                          'w-5 h-5 text-[9px] rounded border transition-colors',
                          (widget.gridSpan || 1) === span
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border/50 text-muted-foreground hover:border-border'
                        )}
                      >
                        {span}
                      </button>
                    ))}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-500 flex-shrink-0"
                    onClick={() => onRemoveWidget(page.id, widget.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              {page.widgets.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No widgets on this page. Click "Add Widget" to get started.
                </p>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
