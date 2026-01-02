/**
 * Context Configuration Modal
 *
 * Allows users to create, edit, and manage site contexts with configurable metrics.
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Plus, Trash2, RotateCcw, Save, Info } from 'lucide-react';
import { useSiteContexts } from '../hooks/useSiteContexts';
import { SiteContext, AVAILABLE_METRICS } from '../types/siteContext';
import { Alert, AlertDescription } from './ui/alert';

interface ContextConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContextConfigModal({ open, onOpenChange }: ContextConfigModalProps) {
  const { contexts, addContext, updateContext, deleteContext, resetToDefaults } = useSiteContexts();
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
  const [editingContext, setEditingContext] = useState<SiteContext | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contextToDelete, setContextToDelete] = useState<string | null>(null);

  const selectedContext = selectedContextId
    ? contexts.find(c => c.id === selectedContextId) || null
    : null;

  const handleCreateNew = () => {
    const newContext: Omit<SiteContext, 'id' | 'createdAt' | 'updatedAt'> = {
      name: 'New Context',
      description: 'Custom context configuration',
      icon: '📍',
      color: '#6b7280',
      metrics: {
        apUptimeThreshold: 95,
        throughputThreshold: 50,
        signalQualityThreshold: -70,
        clientDensity: 25,
        latencyThreshold: 50,
        packetLossThreshold: 1,
        coverageThreshold: 90,
        interferenceThreshold: 15
      },
      isCustom: true
    };
    setEditingContext(newContext as SiteContext);
    setIsCreating(true);
  };

  const handleSave = () => {
    if (!editingContext) return;

    if (isCreating) {
      const created = addContext(editingContext);
      setSelectedContextId(created.id);
      setIsCreating(false);
    } else if (selectedContextId) {
      updateContext(selectedContextId, editingContext);
    }
    setEditingContext(null);
  };

  const handleDelete = () => {
    if (contextToDelete) {
      deleteContext(contextToDelete);
      if (selectedContextId === contextToDelete) {
        setSelectedContextId(null);
      }
      setContextToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleMetricChange = (metricName: string, value: number) => {
    if (!editingContext) return;
    setEditingContext({
      ...editingContext,
      metrics: {
        ...editingContext.metrics,
        [metricName]: value
      }
    });
  };

  const renderMetricSlider = (metricConfig: typeof AVAILABLE_METRICS[0]) => {
    if (!editingContext) return null;

    const currentValue = editingContext.metrics[metricConfig.name as keyof SiteContext['metrics']];

    return (
      <div key={metricConfig.name} className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label htmlFor={metricConfig.name}>{metricConfig.label}</Label>
            <Badge variant="outline" className="text-xs">
              {metricConfig.category}
            </Badge>
          </div>
          <span className="text-sm font-medium">
            {currentValue} {metricConfig.unit}
          </span>
        </div>
        <Slider
          id={metricConfig.name}
          min={metricConfig.min}
          max={metricConfig.max}
          step={metricConfig.unit === '%' ? 1 : (metricConfig.max - metricConfig.min) > 100 ? 5 : 1}
          value={[currentValue]}
          onValueChange={([value]) => handleMetricChange(metricConfig.name, value)}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">{metricConfig.description}</p>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] sm:max-w-[90vw] lg:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Configure Site Contexts</DialogTitle>
            <DialogDescription>
              Define baseline metrics for different types of sites. Contexts help you understand what "healthy" means in different environments.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col sm:flex-row gap-4 flex-1 min-h-0 overflow-hidden">
            {/* Context List */}
            <div className="w-full sm:w-64 sm:border-r sm:pr-4 flex-shrink-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Contexts</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCreateNew}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="h-[200px] sm:h-[calc(90vh-300px)] max-h-[500px]">
                <div className="space-y-2">
                  {contexts.map((context) => (
                    <Card
                      key={context.id}
                      className={`cursor-pointer transition-colors ${
                        selectedContextId === context.id ? 'border-primary' : ''
                      }`}
                      onClick={() => {
                        setSelectedContextId(context.id);
                        setEditingContext(null);
                        setIsCreating(false);
                      }}
                    >
                      <CardHeader className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{context.icon}</span>
                            <div>
                              <CardTitle className="text-sm">{context.name}</CardTitle>
                              {context.isCustom && (
                                <Badge variant="secondary" className="text-xs mt-1">
                                  Custom
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
              <div className="mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetToDefaults}
                  className="w-full"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset to Defaults
                </Button>
              </div>
            </div>

            {/* Context Editor */}
            <div className="flex-1 min-w-0 overflow-hidden">
              {(selectedContext || editingContext) ? (
                <ScrollArea className="h-[calc(90vh-250px)] sm:h-[calc(90vh-200px)] pr-2 sm:pr-4">
                  <div className="space-y-6">
                    {/* Context Info */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-lg">
                          {editingContext ? 'Edit Context' : selectedContext?.name}
                        </h3>
                        <div className="flex items-center gap-2">
                          {!editingContext && selectedContext?.isCustom && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingContext({ ...selectedContext })}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setContextToDelete(selectedContext.id);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                          {editingContext && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingContext(null);
                                  setIsCreating(false);
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleSave}
                              >
                                <Save className="mr-2 h-4 w-4" />
                                Save
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {editingContext && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input
                              id="name"
                              value={editingContext.name}
                              onChange={(e) => setEditingContext({ ...editingContext, name: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="icon">Icon (emoji)</Label>
                            <Input
                              id="icon"
                              value={editingContext.icon}
                              onChange={(e) => setEditingContext({ ...editingContext, icon: e.target.value })}
                              maxLength={2}
                            />
                          </div>
                          <div className="sm:col-span-2 space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Input
                              id="description"
                              value={editingContext.description}
                              onChange={(e) => setEditingContext({ ...editingContext, description: e.target.value })}
                            />
                          </div>
                        </div>
                      )}

                      {!editingContext && selectedContext && (
                        <Alert>
                          <Info className="h-4 w-4" />
                          <AlertDescription>
                            {selectedContext.description}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>

                    {/* Metrics Configuration */}
                    <div className="space-y-4">
                      <h4 className="font-semibold">Baseline Metrics</h4>
                      <Tabs defaultValue="performance" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="performance">Performance</TabsTrigger>
                          <TabsTrigger value="reliability">Reliability</TabsTrigger>
                          <TabsTrigger value="quality">Quality</TabsTrigger>
                        </TabsList>

                        {(['performance', 'reliability', 'quality'] as const).map((category) => (
                          <TabsContent key={category} value={category} className="space-y-4 mt-4">
                            {AVAILABLE_METRICS
                              .filter((m) => m.category === category)
                              .map((metric) => renderMetricSlider(metric))}
                          </TabsContent>
                        ))}
                      </Tabs>
                    </div>
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <Info className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a context to view and edit its metrics</p>
                    <p className="text-sm mt-2">or create a new custom context</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Context</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this context? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
