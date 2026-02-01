import React, { useState, useCallback } from 'react';
import { Plus, Sparkles, Cpu, Users, Key, Bell, Send, X, Trash2 } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { cn } from './ui/utils';
import { WorkspaceWidget } from './WorkspaceWidget';
import {
  useWorkspace,
  PROMPT_SUGGESTIONS,
  TOPIC_COLORS,
  type WorkspaceTopic,
} from '@/hooks/useWorkspace';

/**
 * Topic configuration with icons
 */
const TOPICS: { id: WorkspaceTopic; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'Devices', label: 'Devices', icon: Cpu },
  { id: 'Clients', label: 'Clients', icon: Users },
  { id: 'Licensing', label: 'Licensing', icon: Key },
  { id: 'Alerts', label: 'Alerts', icon: Bell },
];

/**
 * Simulate widget data fetching
 * In a real implementation, this would call an AI service or API
 */
async function simulateWidgetData(prompt: string, topic: WorkspaceTopic): Promise<any> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

  // Generate mock data based on topic and prompt
  const lowerPrompt = prompt.toLowerCase();

  if (topic === 'Devices') {
    if (lowerPrompt.includes('how many') || lowerPrompt.includes('count')) {
      return { total: Math.floor(Math.random() * 500) + 50, label: 'Managed Devices' };
    }
    if (lowerPrompt.includes('list') || lowerPrompt.includes('show')) {
      return [
        { name: 'AP-Floor1-East', value: 'Online' },
        { name: 'AP-Floor1-West', value: 'Online' },
        { name: 'AP-Floor2-East', value: 'Warning' },
        { name: 'SW-Core-01', value: 'Online' },
        { name: 'SW-Access-01', value: 'Online' },
      ];
    }
    if (lowerPrompt.includes('cpu') || lowerPrompt.includes('memory')) {
      return [
        { name: 'SW-Core-01', value: '78%' },
        { name: 'SW-Access-03', value: '65%' },
        { name: 'AP-Floor3-East', value: '52%' },
      ];
    }
    if (lowerPrompt.includes('end of service') || lowerPrompt.includes('eos')) {
      return [
        { name: 'AP-Legacy-01', value: 'June 2026' },
        { name: 'SW-Old-Core', value: 'March 2026' },
      ];
    }
    return { total: Math.floor(Math.random() * 100) + 10, label: 'Devices' };
  }

  if (topic === 'Clients') {
    if (lowerPrompt.includes('how many') || lowerPrompt.includes('connected')) {
      return { total: Math.floor(Math.random() * 2000) + 500, label: 'Connected Clients' };
    }
    if (lowerPrompt.includes('bandwidth') || lowerPrompt.includes('consuming')) {
      return [
        { name: 'workstation-john', value: '125 Mbps' },
        { name: 'media-server-01', value: '98 Mbps' },
        { name: 'dev-laptop-sarah', value: '76 Mbps' },
        { name: 'conference-room-a', value: '54 Mbps' },
      ];
    }
    if (lowerPrompt.includes('roaming')) {
      return [
        { name: 'mobile-exec-01', value: '12 roams' },
        { name: 'tablet-floor-2', value: '8 roams' },
        { name: 'phone-support-3', value: '6 roams' },
      ];
    }
    return { total: Math.floor(Math.random() * 1000) + 100, label: 'Clients' };
  }

  if (topic === 'Licensing') {
    if (lowerPrompt.includes('use') || lowerPrompt.includes('available')) {
      return {
        used: Math.floor(Math.random() * 400) + 100,
        available: Math.floor(Math.random() * 200) + 50,
      };
    }
    if (lowerPrompt.includes('site') || lowerPrompt.includes('exhaustion')) {
      return [
        { name: 'HQ Campus', value: '95% used' },
        { name: 'Branch Office A', value: '88% used' },
        { name: 'Data Center', value: '72% used' },
      ];
    }
    if (lowerPrompt.includes('expir')) {
      return [
        { name: 'Enterprise License', value: 'Apr 15, 2026' },
        { name: 'Support Contract', value: 'Mar 1, 2026' },
        { name: 'Cloud Services', value: 'Feb 28, 2026' },
      ];
    }
    return { used: 320, available: 180 };
  }

  if (topic === 'Alerts') {
    if (lowerPrompt.includes('critical')) {
      return [
        { name: 'High CPU on SW-Core-01', value: 'Critical' },
        { name: 'AP-Floor3 Offline', value: 'Critical' },
        { name: 'License Limit Warning', value: 'Warning' },
      ];
    }
    if (lowerPrompt.includes('recurring')) {
      return [
        { name: 'SW-Access-02', value: '15 alerts' },
        { name: 'AP-Warehouse', value: '8 alerts' },
        { name: 'Link-Uplink-A', value: '5 alerts' },
      ];
    }
    if (lowerPrompt.includes('24 hours') || lowerPrompt.includes('today')) {
      return { total: Math.floor(Math.random() * 50) + 5, label: 'Alerts (24h)' };
    }
    return { total: Math.floor(Math.random() * 30) + 3, label: 'Active Alerts' };
  }

  return { total: Math.floor(Math.random() * 100), label: 'Results' };
}

export const Workspace: React.FC = () => {
  const {
    widgets,
    selectedTopic,
    hasWidgets,
    selectTopic,
    createWidget,
    updateWidget,
    deleteWidget,
    refreshWidget,
    clearWorkspace,
  } = useWorkspace();

  const [customPrompt, setCustomPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Handle prompt selection or submission
   */
  const handlePromptSubmit = useCallback(async (prompt: string) => {
    if (!selectedTopic || !prompt.trim()) return;

    setIsSubmitting(true);
    const widget = createWidget(prompt.trim(), selectedTopic);

    try {
      const data = await simulateWidgetData(prompt, selectedTopic);
      updateWidget(widget.id, { isLoading: false, data, error: null });
    } catch (error) {
      updateWidget(widget.id, {
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch data',
      });
    } finally {
      setIsSubmitting(false);
      setCustomPrompt('');
    }
  }, [selectedTopic, createWidget, updateWidget]);

  /**
   * Handle widget refresh
   */
  const handleRefresh = useCallback(async (id: string) => {
    const widget = widgets.find(w => w.id === id);
    if (!widget) return;

    refreshWidget(id);

    try {
      const data = await simulateWidgetData(widget.prompt, widget.topic);
      updateWidget(id, { isLoading: false, data, error: null });
    } catch (error) {
      updateWidget(id, {
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to refresh data',
      });
    }
  }, [widgets, refreshWidget, updateWidget]);

  /**
   * Handle custom prompt input
   */
  const handleCustomPromptKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePromptSubmit(customPrompt);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Workspace</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {hasWidgets
                ? `${widgets.length} widget${widgets.length !== 1 ? 's' : ''} created`
                : 'Create your first widget by selecting a topic below.'}
            </p>
          </div>
          {hasWidgets && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearWorkspace}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Topic Selector */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Select a topic</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map(topic => {
            const Icon = topic.icon;
            const isSelected = selectedTopic === topic.id;
            const colors = TOPIC_COLORS[topic.id];

            return (
              <Button
                key={topic.id}
                variant={isSelected ? 'default' : 'outline'}
                size="sm"
                onClick={() => selectTopic(isSelected ? null : topic.id)}
                className={cn(
                  'transition-all',
                  isSelected && colors.bg,
                  isSelected && colors.text,
                  isSelected && colors.border
                )}
              >
                <Icon className="h-4 w-4 mr-2" />
                {topic.label}
                {isSelected && (
                  <X className="h-3 w-3 ml-2 opacity-60" />
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Prompt Suggestions (shown when topic is selected) */}
      {selectedTopic && (
        <div className="mb-8 animate-in fade-in slide-in-from-top-2 duration-200">
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="outline" className={cn(TOPIC_COLORS[selectedTopic].bg, TOPIC_COLORS[selectedTopic].text, TOPIC_COLORS[selectedTopic].border)}>
                  {selectedTopic}
                </Badge>
                <span className="text-sm text-muted-foreground">Suggested queries</span>
              </div>

              {/* Suggestion Pills */}
              <div className="flex flex-wrap gap-2 mb-4">
                {PROMPT_SUGGESTIONS[selectedTopic].map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handlePromptSubmit(suggestion)}
                    disabled={isSubmitting}
                    className={cn(
                      'px-3 py-1.5 text-sm rounded-full border transition-all',
                      'bg-muted/50 hover:bg-muted text-foreground',
                      'hover:border-primary/50 hover:shadow-sm',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'text-left'
                    )}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              {/* Custom Prompt Input */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder="Or type your own question..."
                    value={customPrompt}
                    onChange={e => setCustomPrompt(e.target.value)}
                    onKeyDown={handleCustomPromptKeyDown}
                    disabled={isSubmitting}
                    className="pr-10"
                  />
                  {customPrompt && (
                    <button
                      onClick={() => setCustomPrompt('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Button
                  onClick={() => handlePromptSubmit(customPrompt)}
                  disabled={!customPrompt.trim() || isSubmitting}
                  size="icon"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Widgets Grid */}
      {hasWidgets ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {widgets.map(widget => (
            <WorkspaceWidget
              key={widget.id}
              widget={widget}
              onRefresh={handleRefresh}
              onDelete={deleteWidget}
            />
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <Plus className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No widgets yet</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Select a topic above and choose a suggested query or type your own question to create
            your first widget.
          </p>
        </div>
      )}
    </div>
  );
};

export default Workspace;
