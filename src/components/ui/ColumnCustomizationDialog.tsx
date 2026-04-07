/**
 * Column Customization Dialog
 *
 * Main UI for customizing table columns.
 * Features:
 * - Column visibility selection
 * - Column reordering (drag & drop)
 * - Saved views management
 * - Reset to defaults
 * - Export configuration
 */

import { useState } from 'react';
import { Settings2, Save, RotateCcw, FileDown, Columns } from 'lucide-react';
import { TableCustomization } from '@/hooks/useTableCustomization';
import { ColumnSelector } from './ColumnSelector';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './tabs';
import { Label } from './label';
import { Input } from './input';
import { Textarea } from './textarea';
import { Badge } from './badge';
import { toast } from 'sonner';

interface ColumnCustomizationDialogProps {
  /** Table customization state and actions */
  customization: TableCustomization;

  /** Trigger button text */
  triggerLabel?: string;

  /** Show trigger button icon */
  showTriggerIcon?: boolean;

  /** Custom trigger element */
  trigger?: React.ReactNode;
}

export function ColumnCustomizationDialog({
  customization,
  triggerLabel = 'Customize Columns',
  showTriggerIcon = true,
  trigger
}: ColumnCustomizationDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('columns');
  const [newViewName, setNewViewName] = useState('');
  const [newViewDescription, setNewViewDescription] = useState('');

  const {
    columns,
    visibleColumns,
    savedViews,
    currentView,
    enableViews,
    hasUnsavedChanges,
    toggleColumn,
    showColumns,
    hideColumns,
    resetColumns,
    saveView,
    loadView,
    deleteView
  } = customization;

  // Save current configuration as a new view
  const handleSaveView = async () => {
    if (!newViewName.trim()) {
      toast.error('View name required', {
        description: 'Please enter a name for the view'
      });
      return;
    }

    try {
      await saveView({
        name: newViewName.trim(),
        description: newViewDescription.trim() || undefined,
        tableId: customization.tableId,
        columns: visibleColumns,
        createdBy: '' // Will be set by service
      });

      toast.success('View saved', {
        description: `"${newViewName}" has been saved successfully`
      });

      setNewViewName('');
      setNewViewDescription('');
      setActiveTab('views');
    } catch (error) {
      toast.error('Failed to save view', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  // Load a saved view
  const handleLoadView = (viewId: string) => {
    loadView(viewId);
    toast.success('View loaded', {
      description: 'Column configuration has been updated'
    });
  };

  // Delete a saved view
  const handleDeleteView = async (viewId: string) => {
    try {
      await deleteView(viewId);
      toast.success('View deleted', {
        description: 'The view has been removed'
      });
    } catch (error) {
      toast.error('Failed to delete view', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  // Reset to default columns
  const handleReset = () => {
    resetColumns();
    toast.success('Reset to defaults', {
      description: 'Column configuration has been reset'
    });
  };

  // Export configuration
  const handleExport = () => {
    const config = {
      tableId: customization.tableId,
      visibleColumns,
      columnOrder: customization.columnOrder,
      columnWidths: customization.columnWidths,
      pinnedColumns: customization.pinnedColumns
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${customization.tableId}-columns.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Configuration exported', {
      description: 'Column configuration has been downloaded'
    });
  };

  const defaultTrigger = (
    <Button variant="outline" size="sm">
      {showTriggerIcon && <Settings2 className="mr-2 h-4 w-4" />}
      {triggerLabel}
      {hasUnsavedChanges && (
        <Badge variant="destructive" className="ml-2 h-5 px-1">
          *
        </Badge>
      )}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Columns className="h-5 w-5" />
            Customize Columns
          </DialogTitle>
          <DialogDescription>
            Choose which columns to display and save your preferences.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="columns">
              Columns
              {hasUnsavedChanges && (
                <span className="ml-2 h-2 w-2 rounded-full bg-orange-500" />
              )}
            </TabsTrigger>
            <TabsTrigger value="save" disabled={!enableViews}>
              Save View
            </TabsTrigger>
            <TabsTrigger value="views" disabled={!enableViews || savedViews.length === 0}>
              Saved Views
              {savedViews.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {savedViews.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Columns Tab */}
          <TabsContent value="columns" className="flex-1 overflow-auto mt-4">
            <ColumnSelector
              columns={columns}
              visibleColumns={visibleColumns}
              onChange={showColumns}
              groupByCategory
              showSearch
              showQuickActions
            />
          </TabsContent>

          {/* Save View Tab */}
          <TabsContent value="save" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">View Name *</Label>
              <Input
                id="view-name"
                placeholder="e.g., My Custom View"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="view-description">Description</Label>
              <Textarea
                id="view-description"
                placeholder="Optional description for this view"
                value={newViewDescription}
                onChange={(e) => setNewViewDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="p-4 bg-muted rounded-md space-y-2">
              <div className="text-sm font-medium">Current Configuration</div>
              <div className="text-sm text-muted-foreground">
                {visibleColumns.length} columns selected
              </div>
              {customization.pinnedColumns.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  {customization.pinnedColumns.length} columns pinned
                </div>
              )}
            </div>

            <Button onClick={handleSaveView} className="w-full">
              <Save className="mr-2 h-4 w-4" />
              Save View
            </Button>
          </TabsContent>

          {/* Saved Views Tab */}
          <TabsContent value="views" className="space-y-2 mt-4 overflow-auto">
            {savedViews.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No saved views yet</p>
                <p className="text-sm mt-2">
                  Customize your columns and save them as a view
                </p>
              </div>
            ) : (
              savedViews.map((view) => (
                <div
                  key={view.id}
                  className={`p-4 border rounded-lg space-y-2 ${
                    currentView === view.id ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{view.name}</div>
                        {view.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                        {currentView === view.id && (
                          <Badge variant="default" className="text-xs">
                            Active
                          </Badge>
                        )}
                        {view.isShared && (
                          <Badge variant="outline" className="text-xs">
                            Shared
                          </Badge>
                        )}
                      </div>
                      {view.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {view.description}
                        </p>
                      )}
                      <div className="text-xs text-muted-foreground mt-2">
                        {view.columns.length} columns
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {currentView !== view.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleLoadView(view.id)}
                        >
                          Load
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteView(view.id)}
                      >
                        Delete
                        </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <FileDown className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
          <Button onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
