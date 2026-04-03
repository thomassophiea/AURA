/**
 * Widget Picker
 *
 * Category-tabbed catalog browser for selecting widgets to add to a report page.
 * Uses WIDGET_CATEGORIES from widgetService.ts as the data source.
 */

import { useState, useMemo } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Plus, Search, BarChart3, TrendingUp, Hash, Layers, Check,
} from 'lucide-react';
import { cn } from '../ui/utils';
import { WIDGET_CATEGORIES } from '../../services/widgetService';
import type { ReportWidgetConfig, WidgetDisplayType } from '../../types/reportConfig';

// Infer display type from widget name
function inferDisplayType(widgetName: string): WidgetDisplayType {
  const lower = widgetName.toLowerCase();
  if (lower.includes('timeseries') || lower.includes('report') && (lower.includes('throughput') || lower.includes('usage') || lower.includes('unique'))) return 'timeseries';
  if (lower.includes('scorecard') || lower.includes('peak')) return 'scorecard';
  if (lower.includes('distribution') || lower.includes('health') || lower.includes('qoe')) return 'distribution';
  if (lower.includes('top') || lower.includes('worst') || lower.includes('channel')) return 'ranking';
  return 'ranking';
}

// Human-readable widget name
function formatWidgetName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .replace(/By/g, 'by')
    .replace(/Of/g, 'of')
    .replace(/Report$/, '')
    .replace(/Timeseries$/, '')
    .replace(/Scorecard$/, '')
    .trim();
}

const TYPE_BADGES: Record<WidgetDisplayType, { label: string; color: string }> = {
  timeseries: { label: 'Chart', color: 'bg-blue-500/15 text-blue-400' },
  ranking: { label: 'Table', color: 'bg-emerald-500/15 text-emerald-400' },
  scorecard: { label: 'KPI', color: 'bg-violet-500/15 text-violet-400' },
  distribution: { label: 'Dist', color: 'bg-amber-500/15 text-amber-400' },
  bar_chart: { label: 'Bar', color: 'bg-orange-500/15 text-orange-400' },
  pie_chart: { label: 'Pie', color: 'bg-pink-500/15 text-pink-400' },
};

interface WidgetPickerProps {
  existingWidgetKeys: Set<string>;
  onAddWidget: (widget: ReportWidgetConfig) => void;
}

export function WidgetPicker({ existingWidgetKeys, onAddWidget }: WidgetPickerProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(Object.keys(WIDGET_CATEGORIES)[0]);

  const categories = useMemo(() => {
    return Object.entries(WIDGET_CATEGORIES).map(([key, cat]) => ({
      key,
      name: (cat as any).name as string,
      widgets: ((cat as any).widgets as string[]).map(widgetName => ({
        name: widgetName,
        displayName: formatWidgetName(widgetName),
        displayType: inferDisplayType(widgetName),
        isAdded: existingWidgetKeys.has(widgetName),
      })),
    }));
  }, [existingWidgetKeys]);

  const filteredWidgets = useMemo(() => {
    const cat = categories.find(c => c.key === activeCategory);
    if (!cat) return [];
    if (!search) return cat.widgets;
    const q = search.toLowerCase();
    return cat.widgets.filter(w => w.displayName.toLowerCase().includes(q) || w.name.toLowerCase().includes(q));
  }, [categories, activeCategory, search]);

  const handleAdd = (widgetName: string, displayType: WidgetDisplayType) => {
    const widget: ReportWidgetConfig = {
      id: crypto.randomUUID(),
      widgetKey: widgetName,
      source: 'platform_report',
      displayType,
      title: formatWidgetName(widgetName),
      gridSpan: displayType === 'timeseries' ? 4 : displayType === 'ranking' ? 2 : 1,
    };
    onAddWidget(widget);
  };

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search widgets..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-md outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Category tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
          {categories.map(cat => (
            <TabsTrigger
              key={cat.key}
              value={cat.key}
              className="text-[10px] px-2 py-1 h-auto data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md"
            >
              {cat.name}
              <Badge variant="secondary" className="ml-1 text-[9px] h-4 px-1">{cat.widgets.length}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map(cat => (
          <TabsContent key={cat.key} value={cat.key} className="mt-3">
            <div className="grid grid-cols-1 gap-1.5 max-h-[300px] overflow-y-auto">
              {(search ? filteredWidgets : cat.widgets).map(w => {
                const typeBadge = TYPE_BADGES[w.displayType];
                return (
                  <div
                    key={w.name}
                    className={cn(
                      'flex items-center justify-between p-2 rounded-md border text-xs transition-colors',
                      w.isAdded
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border/50 hover:border-border hover:bg-muted/30'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{w.displayName}</span>
                      <Badge variant="secondary" className={cn('text-[9px] px-1.5 py-0', typeBadge.color)}>
                        {typeBadge.label}
                      </Badge>
                    </div>
                    <Button
                      variant={w.isAdded ? 'secondary' : 'outline'}
                      size="sm"
                      className="h-6 px-2 text-[10px] flex-shrink-0"
                      onClick={() => handleAdd(w.name, w.displayType)}
                      disabled={w.isAdded}
                    >
                      {w.isAdded ? <><Check className="h-3 w-3 mr-1" />Added</> : <><Plus className="h-3 w-3 mr-1" />Add</>}
                    </Button>
                  </div>
                );
              })}
              {filteredWidgets.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No matching widgets</p>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
