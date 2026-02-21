/**
 * Controller Selector Component
 * Allows users to select, add, and manage Platform ONE controllers
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Separator } from './ui/separator';
import { 
  Server, 
  Plus, 
  Trash2, 
  CheckCircle, 
  AlertCircle, 
  Wifi, 
  WifiOff,
  Loader2,
  Settings,
  ChevronRight,
  Globe,
  Pencil
} from 'lucide-react';
import { tenantService, Controller } from '../services/tenantService';
import { toast } from 'sonner';

interface ControllerSelectorProps {
  onControllerSelected: (controller: Controller) => void;
  onSkip?: () => void;
  showSkip?: boolean;
}

export function ControllerSelector({ 
  onControllerSelected, 
  onSkip,
  showSkip = false 
}: ControllerSelectorProps) {
  const [controllers, setControllers] = useState<Controller[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedController, setSelectedController] = useState<Controller | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editController, setEditController] = useState<Controller | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  // Add/Edit form state
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    description: ''
  });

  useEffect(() => {
    loadControllers();
  }, []);

  const loadControllers = async () => {
    setLoading(true);
    try {
      const data = await tenantService.getControllers();
      setControllers(data);
      
      // Auto-select if only one controller
      if (data.length === 1) {
        setSelectedController(data[0]);
      }
      
      // Select the default controller if available
      const defaultController = data.find(c => c.is_default);
      if (defaultController) {
        setSelectedController(defaultController);
      }
    } catch (error) {
      console.error('Failed to load controllers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddController = async () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      toast.error('Name and URL are required');
      return;
    }

    try {
      // Clean up URL
      let url = formData.url.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }

      const newController = await tenantService.createController({
        org_id: tenantService.getCurrentOrganization()?.id || 'local',
        name: formData.name.trim(),
        url,
        description: formData.description.trim() || undefined,
        is_active: true,
        is_default: controllers.length === 0
      });

      setControllers(prev => [...prev, newController]);
      setSelectedController(newController);
      setAddDialogOpen(false);
      setFormData({ name: '', url: '', description: '' });
      
      toast.success('Controller added successfully');
    } catch (error) {
      toast.error('Failed to add controller');
    }
  };

  const handleEditController = async () => {
    if (!editController) return;

    try {
      await tenantService.updateController(editController.id, {
        name: formData.name.trim(),
        url: formData.url.trim(),
        description: formData.description.trim() || undefined
      });

      setControllers(prev => prev.map(c => 
        c.id === editController.id 
          ? { ...c, name: formData.name, url: formData.url, description: formData.description }
          : c
      ));

      setEditController(null);
      setFormData({ name: '', url: '', description: '' });
      toast.success('Controller updated');
    } catch (error) {
      toast.error('Failed to update controller');
    }
  };

  const handleDeleteController = async (controller: Controller) => {
    if (!confirm(`Delete controller "${controller.name}"?`)) return;

    try {
      await tenantService.deleteController(controller.id);
      setControllers(prev => prev.filter(c => c.id !== controller.id));
      
      if (selectedController?.id === controller.id) {
        setSelectedController(null);
      }
      
      toast.success('Controller deleted');
    } catch (error) {
      toast.error('Failed to delete controller');
    }
  };

  const handleTestConnection = async (controller: Controller) => {
    setTesting(controller.id);
    
    try {
      const result = await tenantService.testControllerConnection(controller);
      
      // Update local state with new status
      setControllers(prev => prev.map(c => 
        c.id === controller.id 
          ? { ...c, connection_status: result.success ? 'connected' : 'disconnected' }
          : c
      ));

      if (result.success) {
        toast.success(`Connected to ${controller.name}`, {
          description: result.latency ? `Latency: ${result.latency}ms` : undefined
        });
      } else {
        toast.error(`Failed to connect to ${controller.name}`, {
          description: result.message
        });
      }
    } finally {
      setTesting(null);
    }
  };

  const handleConnect = () => {
    if (selectedController) {
      tenantService.setCurrentController(selectedController);
      onControllerSelected(selectedController);
    }
  };

  const openEditDialog = (controller: Controller) => {
    setEditController(controller);
    setFormData({
      name: controller.name,
      url: controller.url,
      description: controller.description || ''
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'disconnected':
        return <WifiOff className="h-4 w-4 text-red-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      default:
        return <Wifi className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge variant="outline" className="text-green-500 border-green-500">Connected</Badge>;
      case 'disconnected':
        return <Badge variant="outline" className="text-red-500 border-red-500">Offline</Badge>;
      case 'error':
        return <Badge variant="outline" className="text-amber-500 border-amber-500">Error</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold">Select Site Group</h2>
        <p className="text-muted-foreground mt-1">
          Choose a Platform ONE site group to manage
        </p>
      </div>

      {/* Controller List */}
      {controllers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Server className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Site Groups</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add a Platform ONE site group to get started
            </p>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Site Group
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {controllers.map(controller => (
            <Card 
              key={controller.id}
              className={`cursor-pointer transition-all hover:border-primary/50 ${
                selectedController?.id === controller.id 
                  ? 'border-primary bg-primary/5' 
                  : ''
              }`}
              onClick={() => setSelectedController(controller)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      selectedController?.id === controller.id 
                        ? 'bg-primary/20' 
                        : 'bg-muted'
                    }`}>
                      <Server className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{controller.name}</span>
                        {controller.is_default && (
                          <Badge variant="secondary" className="text-xs">Default</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        <span>{controller.url}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {getStatusBadge(controller.connection_status)}
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTestConnection(controller);
                      }}
                      disabled={testing === controller.id}
                    >
                      {testing === controller.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wifi className="h-4 w-4" />
                      )}
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditDialog(controller);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteController(controller);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        <Button 
          variant="outline" 
          onClick={() => setAddDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Site Group
        </Button>

        <div className="flex gap-2">
          {showSkip && onSkip && (
            <Button variant="ghost" onClick={onSkip}>
              Skip
            </Button>
          )}
          
          <Button 
            onClick={handleConnect}
            disabled={!selectedController}
          >
            Connect
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* Add Site Group Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Site Group</DialogTitle>
            <DialogDescription>
              Add a new Platform ONE site group to manage
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Production Sites"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                placeholder="https://controller.example.com"
                value={formData.url}
                onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                The base URL of the Platform ONE controller
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                placeholder="Main production environment"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddController}>
              Add Site Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Site Group Dialog */}
      <Dialog open={!!editController} onOpenChange={(open) => !open && setEditController(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Site Group</DialogTitle>
            <DialogDescription>
              Update site group settings
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-url">URL</Label>
              <Input
                id="edit-url"
                value={formData.url}
                onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditController(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditController}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
