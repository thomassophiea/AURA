/**
 * Context Configuration - Full Page
 *
 * Allows users to create, edit, and manage site contexts with configurable metrics.
 * Uses a full-page layout for better usability.
 */

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Plus, Trash2, RotateCcw, Save, Info, ArrowLeft, Settings2, Building2, Warehouse, Store, Landmark } from 'lucide-react';
import { useSiteContexts } from '../hooks/useSiteContexts';
import { SiteContext, AVAILABLE_METRICS } from '../types/siteContext';
import { Alert, AlertDescription } from './ui/alert';

interface ContextConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Icon mapping for context types
const getContextIcon = (name: string) => {
  const nameLower = name.toLowerCase();
  if (nameLower.includes('retail') || nameLower.includes('store')) return Store;
  if (nameLower.includes('warehouse') || nameLower.includes('distribution')) return Warehouse;
  if (nameLower.includes('headquarters') || nameLower.includes('office') || nameLower.includes('corporate')) return Building2;
  return Landmark;
};

export function ContextConfigModal({ open, onOpenChange }: ContextConfigModalProps) {
  const { contexts, addContext, updateContext, deleteContext, resetToDefaults } = useSiteContexts();
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
  const [editingContext, setEditingContext] = useState<SiteContext | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contextToDelete, setContextToDelete] = useState<string | null>(null);

  // Auto-select first context when modal opens
  React.useEffect(() => {
    if (open && contexts.length > 0 && !selectedContextId) {
      setSelectedContextId(contexts[0].id);
    }
  }, [open, contexts, selectedContextId]);

  const selectedContext = selectedContextId
    ? contexts.find(c => c.id === selectedContextId) || null
    : null;

  const handleCreateNew = () => {
    const newContext: Omit<SiteContext, 'id' | 'createdAt' | 'updatedAt'> = {
      name: 'New Context',
      description: 'Custom context configuration',
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
    const context = editingContext || selectedContext;
    if (!context) return null;

    const currentValue = context.metrics[metricConfig.name as keyof SiteContext['metrics']];
    const isEditing = !!editingContext;

    return (
      <div key={metricConfig.name} className="space-y-3 p-4 rounded-lg bg-muted/30 border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label htmlFor={metricConfig.name} className="text-sm font-medium">{metricConfig.label}</Label>
            <Badge variant="outline" className="text-xs">
              {metricConfig.category}
            </Badge>
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {currentValue} {metricConfig.unit}
          </span>
        </div>
        <Slider
          id={metricConfig.name}
          min={metricConfig.min}
          max={metricConfig.max}
          step={metricConfig.unit === '%' ? 1 : (metricConfig.max - metricConfig.min) > 100 ? 5 : 1}
          value={[currentValue]}
          onValueChange={([value]) => isEditing && handleMetricChange(metricConfig.name, value)}
          disabled={!isEditing}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">{metricConfig.description}</p>
      </div>
    );
  };

  if (!open) return null;

  return (
    <>
      {/* Full Page Overlay */}
      <div className="fixed inset-0 z-50 bg-background">
        <div className="h-full flex flex-col">
          {/* Page Header */}
          <div className="border-b bg-background px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="mr-2"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Settings2 className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Configure Site Contexts</h1>
                <p className="text-sm text-muted-foreground">
                  Define baseline metrics for different types of sites to understand what "healthy" means in each environment
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={resetToDefaults}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset to Defaults
            </Button>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-hidden">
            <div className="h-full flex">
              {/* Context List - Left Sidebar */}
              <div className="w-80 border-r bg-muted/20 flex flex-col">
                <div className="p-4 border-b bg-background">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">Contexts</h3>
                    <Button
                      size="sm"
                      onClick={handleCreateNew}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      New
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {contexts.length} context{contexts.length !== 1 ? 's' : ''} configured
                  </p>
                </div>
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-2">
                    {contexts.map((context) => {
                      const IconComponent = getContextIcon(context.name);
                      return (
                        <Card
                          key={context.id}
                          className={`cursor-pointer transition-all hover:shadow-md ${
                            selectedContextId === context.id
                              ? 'border-primary ring-1 ring-primary shadow-md'
                              : 'hover:border-muted-foreground/30'
                          }`}
                          onClick={() => {
                            setSelectedContextId(context.id);
                            setEditingContext(null);
                            setIsCreating(false);
                          }}
                        >
                          <CardHeader className="p-4">
                            <div className="flex items-start gap-3">
                              <div
                                className="p-2 rounded-lg"
                                style={{ backgroundColor: `${context.color}20` }}
                              >
                                <IconComponent
                                  className="h-5 w-5"
                                  style={{ color: context.color }}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-sm font-medium truncate">
                                  {context.name}
                                </CardTitle>
                                <CardDescription className="text-xs mt-0.5 line-clamp-2">
                                  {context.description}
                                </CardDescription>
                                {context.isCustom && (
                                  <Badge variant="secondary" className="text-xs mt-2">
                                    Custom
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* Context Editor - Main Area */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {(selectedContext || editingContext) ? (
                  <>
                    {/* Editor Header */}
                    <div className="p-6 border-b bg-background">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {!editingContext && selectedContext && (
                            <>
                              <div
                                className="p-3 rounded-xl"
                                style={{ backgroundColor: `${selectedContext.color}20` }}
                              >
                                {(() => {
                                  const Icon = getContextIcon(selectedContext.name);
                                  return <Icon className="h-6 w-6" style={{ color: selectedContext.color }} />;
                                })()}
                              </div>
                              <div>
                                <h2 className="text-xl font-semibold">{selectedContext.name}</h2>
                                <p className="text-sm text-muted-foreground">{selectedContext.description}</p>
                              </div>
                            </>
                          )}
                          {editingContext && (
                            <h2 className="text-xl font-semibold">
                              {isCreating ? 'Create New Context' : 'Edit Context'}
                            </h2>
                          )}
                        </div>
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
                          {!editingContext && selectedContext && !selectedContext.isCustom && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingContext({ ...selectedContext })}
                            >
                              Customize
                            </Button>
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
                                {isCreating ? 'Create' : 'Save'}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Name and Description fields when editing */}
                      {editingContext && (
                        <div className="grid grid-cols-2 gap-4 mt-6">
                          <div className="space-y-2">
                            <Label htmlFor="name">Context Name</Label>
                            <Input
                              id="name"
                              value={editingContext.name}
                              onChange={(e) => setEditingContext({ ...editingContext, name: e.target.value })}
                              placeholder="e.g., Retail Store, Warehouse"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Input
                              id="description"
                              value={editingContext.description}
                              onChange={(e) => setEditingContext({ ...editingContext, description: e.target.value })}
                              placeholder="Brief description of this environment"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Metrics Configuration */}
                    <ScrollArea className="flex-1 p-6">
                      <div className="max-w-4xl">
                        <div className="mb-6">
                          <h3 className="font-semibold text-lg mb-1">Baseline Metrics</h3>
                          <p className="text-sm text-muted-foreground">
                            {editingContext
                              ? 'Adjust the thresholds below to define what "healthy" means for this type of site.'
                              : 'These thresholds define what "healthy" means for this type of site.'}
                          </p>
                        </div>

                        <Tabs defaultValue="performance" className="w-full">
                          <TabsList className="grid w-full grid-cols-3 mb-6">
                            <TabsTrigger value="performance" className="gap-2">
                              Performance
                            </TabsTrigger>
                            <TabsTrigger value="reliability" className="gap-2">
                              Reliability
                            </TabsTrigger>
                            <TabsTrigger value="quality" className="gap-2">
                              Quality
                            </TabsTrigger>
                          </TabsList>

                          {(['performance', 'reliability', 'quality'] as const).map((category) => (
                            <TabsContent key={category} value={category} className="mt-0">
                              <div className="grid gap-4">
                                {AVAILABLE_METRICS
                                  .filter((m) => m.category === category)
                                  .map((metric) => renderMetricSlider(metric))}
                              </div>
                            </TabsContent>
                          ))}
                        </Tabs>

                        {!editingContext && selectedContext && (
                          <Alert className="mt-6">
                            <Info className="h-4 w-4" />
                            <AlertDescription>
                              {selectedContext.isCustom
                                ? 'This is a custom context. Click "Edit" to modify its settings.'
                                : 'This is a default context. Click "Customize" to create your own version with modified thresholds.'}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </ScrollArea>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Settings2 className="h-16 w-16 mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-medium">Select a context to view and edit</p>
                      <p className="text-sm mt-2">or create a new custom context</p>
                      <Button
                        size="sm"
                        className="mt-4"
                        onClick={handleCreateNew}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create New Context
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

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
