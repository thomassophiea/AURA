import React, { useState, useEffect, useCallback } from 'react';
import {
  Wifi,
  Users,
  Activity,
  AppWindow,
  Lightbulb,
  Clock,
  MapPin,
  X,
  Trash2,
  Plus,
  LayoutGrid,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { cn } from './ui/utils';
import { WorkspaceWidget } from './WorkspaceWidget';
import {
  useWorkspace,
  getWidgetsByTopic,
  TOPIC_METADATA,
  TIME_RANGE_OPTIONS,
  PROMPT_SUGGESTIONS,
  type WorkspaceTopic,
  type WidgetCatalogItem,
} from '@/hooks/useWorkspace';
import { fetchWidgetData } from '@/services/workspaceDataService';

interface WorkspaceProps {
  api: any; // API service instance
}

/**
 * Topic icons mapping
 */
const TOPIC_ICONS: Record<WorkspaceTopic, React.ComponentType<{ className?: string }>> = {
  AccessPoints: Wifi,
  Clients: Users,
  ClientExperience: Activity,
  AppInsights: AppWindow,
  ContextualInsights: Lightbulb,
};

/**
 * Topics list
 */
const TOPICS: WorkspaceTopic[] = [
  'AccessPoints',
  'Clients',
  'ClientExperience',
  'AppInsights',
  'ContextualInsights',
];

export const Workspace: React.FC<WorkspaceProps> = ({ api }) => {
  const {
    widgets,
    selectedTopic,
    context,
    hasWidgets,
    selectTopic,
    updateContext,
    createWidgetFromCatalog,
    updateWidget,
    deleteWidget,
    duplicateWidget,
    refreshWidget,
    toggleWidgetLinking,
    clearWorkspace,
    emitSignals,
  } = useWorkspace();

  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingSites, setIsLoadingSites] = useState(true);

  // Fetch sites on mount
  useEffect(() => {
    async function loadSites() {
      try {
        const siteList = await api.getSites();
        setSites(siteList.map((s: any) => ({ id: s.id, name: s.name || s.siteName || s.id })));
      } catch (error) {
        console.warn('[Workspace] Failed to load sites:', error);
      } finally {
        setIsLoadingSites(false);
      }
    }
    loadSites();
  }, [api]);

  /**
   * Handle adding a widget from catalog
   */
  const handleAddWidget = useCallback(async (catalogItem: WidgetCatalogItem) => {
    const widget = createWidgetFromCatalog(catalogItem);

    // Fetch data for the widget
    try {
      const result = await fetchWidgetData(widget, context, api);
      updateWidget(widget.id, {
        isLoading: false,
        data: result.data,
        error: null,
      });
    } catch (error) {
      updateWidget(widget.id, {
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch data',
      });
    }
  }, [api, context, createWidgetFromCatalog, updateWidget]);

  /**
   * Handle widget refresh
   */
  const handleRefresh = useCallback(async (id: string) => {
    const widget = widgets.find(w => w.id === id);
    if (!widget) return;

    refreshWidget(id);

    try {
      const result = await fetchWidgetData(widget, context, api);
      updateWidget(id, {
        isLoading: false,
        data: result.data,
        error: null,
      });
    } catch (error) {
      updateWidget(id, {
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to refresh data',
      });
    }
  }, [api, context, widgets, refreshWidget, updateWidget]);

  /**
   * Handle time brush selection from a widget
   */
  const handleTimeBrush = useCallback((timeWindow: { start: number; end: number }) => {
    emitSignals({ selectedTimeWindow: timeWindow });
  }, [emitSignals]);

  // Get catalog items for selected topic
  const catalogItems = selectedTopic ? getWidgetsByTopic(selectedTopic) : [];
  const promptSuggestions = selectedTopic ? PROMPT_SUGGESTIONS[selectedTopic] : [];

  // Empty state - show centered layout with topic selector
  if (!hasWidgets) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex flex-col">
        {/* Compact Context Selectors at top */}
        <div className="flex items-center justify-center gap-4 mb-8 pt-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <Select
              value={context.siteId || 'all'}
              onValueChange={(value) => updateContext({ siteId: value === 'all' ? null : value })}
              disabled={isLoadingSites}
            >
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Select site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Select
              value={context.timeRange}
              onValueChange={(value) => updateContext({ timeRange: value })}
            >
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Centered content */}
        <div className="flex-1 flex flex-col items-center justify-center max-w-3xl mx-auto px-4">
          {/* Title */}
          <h1 className="text-2xl font-semibold text-foreground text-center mb-2">
            Workspace
          </h1>
          <p className="text-base text-muted-foreground text-center mb-8">
            Create your first widget by selecting a topic below.
          </p>

          {/* Centered Topic Selector */}
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {TOPICS.map((topic) => {
              const Icon = TOPIC_ICONS[topic];
              const metadata = TOPIC_METADATA[topic];
              const isSelected = selectedTopic === topic;

              return (
                <Button
                  key={topic}
                  variant={isSelected ? 'default' : 'outline'}
                  size="default"
                  onClick={() => selectTopic(isSelected ? null : topic)}
                  className={cn(
                    'transition-all px-5 py-2.5',
                    isSelected && metadata.color.bg,
                    isSelected && metadata.color.text,
                    isSelected && metadata.color.border
                  )}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {metadata.label}
                  {isSelected && <X className="h-3 w-3 ml-2 opacity-60" />}
                </Button>
              );
            })}
          </div>

          {/* Widget Catalog (shown when topic is selected) */}
          {selectedTopic && (
            <div className="w-full animate-in fade-in slide-in-from-top-2 duration-200">
              <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        TOPIC_METADATA[selectedTopic].color.bg,
                        TOPIC_METADATA[selectedTopic].color.text,
                        TOPIC_METADATA[selectedTopic].color.border
                      )}
                    >
                      {TOPIC_METADATA[selectedTopic].label}
                    </Badge>
                    <CardDescription>Available widgets</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Widget Catalog Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {catalogItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleAddWidget(item)}
                        className={cn(
                          'flex flex-col items-start p-4 rounded-lg border text-left transition-all',
                          'bg-card hover:bg-muted/50 hover:border-primary/50 hover:shadow-sm',
                          'focus:outline-none focus:ring-2 focus:ring-primary/50'
                        )}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Plus className="h-4 w-4 text-primary" />
                          <span className="font-medium text-sm">{item.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {item.description}
                        </p>
                        <Badge variant="outline" className="mt-2 text-xs">
                          {item.type.replace(/_/g, ' ')}
                        </Badge>
                      </button>
                    ))}
                  </div>

                  {/* Prompt Suggestions */}
                  {promptSuggestions.length > 0 && (
                    <div className="pt-4 border-t">
                      <p className="text-xs text-muted-foreground mb-3 text-center">Or explore with natural language:</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {promptSuggestions.map((suggestion, index) => (
                          <span
                            key={index}
                            className="px-3 py-1.5 text-xs rounded-full bg-muted/50 text-muted-foreground"
                          >
                            {suggestion}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Has widgets - show full workspace layout
  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Workspace</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {widgets.length} widget{widgets.length !== 1 ? 's' : ''} on canvas
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={clearWorkspace}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </div>
      </div>

      {/* Context Selectors */}
      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-muted/30 rounded-lg">
        {/* Site Selector */}
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <Select
            value={context.siteId || 'all'}
            onValueChange={(value) => updateContext({ siteId: value === 'all' ? null : value })}
            disabled={isLoadingSites}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select site" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sites</SelectItem>
              {sites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Time Range Selector */}
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Select
            value={context.timeRange}
            onValueChange={(value) => updateContext({ timeRange: value })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Topic Selector for adding more widgets */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Add widgets</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((topic) => {
            const Icon = TOPIC_ICONS[topic];
            const metadata = TOPIC_METADATA[topic];
            const isSelected = selectedTopic === topic;

            return (
              <Button
                key={topic}
                variant={isSelected ? 'default' : 'outline'}
                size="sm"
                onClick={() => selectTopic(isSelected ? null : topic)}
                className={cn(
                  'transition-all',
                  isSelected && metadata.color.bg,
                  isSelected && metadata.color.text,
                  isSelected && metadata.color.border
                )}
              >
                <Icon className="h-4 w-4 mr-2" />
                {metadata.label}
                {isSelected && <X className="h-3 w-3 ml-2 opacity-60" />}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Widget Catalog (shown when topic is selected) */}
      {selectedTopic && (
        <div className="mb-8 animate-in fade-in slide-in-from-top-2 duration-200">
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    TOPIC_METADATA[selectedTopic].color.bg,
                    TOPIC_METADATA[selectedTopic].color.text,
                    TOPIC_METADATA[selectedTopic].color.border
                  )}
                >
                  {TOPIC_METADATA[selectedTopic].label}
                </Badge>
                <CardDescription>Available widgets</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Widget Catalog Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {catalogItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleAddWidget(item)}
                    className={cn(
                      'flex flex-col items-start p-4 rounded-lg border text-left transition-all',
                      'bg-card hover:bg-muted/50 hover:border-primary/50 hover:shadow-sm',
                      'focus:outline-none focus:ring-2 focus:ring-primary/50'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Plus className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">{item.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                    <Badge variant="outline" className="mt-2 text-xs">
                      {item.type.replace(/_/g, ' ')}
                    </Badge>
                  </button>
                ))}
              </div>

              {/* Prompt Suggestions */}
              {promptSuggestions.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-xs text-muted-foreground mb-3">Or explore with natural language:</p>
                  <div className="flex flex-wrap gap-2">
                    {promptSuggestions.map((suggestion, index) => (
                      <span
                        key={index}
                        className="px-3 py-1.5 text-xs rounded-full bg-muted/50 text-muted-foreground"
                      >
                        {suggestion}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {widgets.map((widget) => (
          <WorkspaceWidget
            key={widget.id}
            widget={widget}
            onRefresh={handleRefresh}
            onDelete={deleteWidget}
            onDuplicate={duplicateWidget}
            onToggleLinking={toggleWidgetLinking}
            onTimeBrush={handleTimeBrush}
          />
        ))}
      </div>
    </div>
  );
};

export default Workspace;
