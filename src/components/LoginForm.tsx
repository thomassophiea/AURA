import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Loader2, Server, ChevronLeft, Globe, Plus, Trash2, Pencil, CheckCircle, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import extremeNetworksLogo from 'figma:asset/f6780e138108fdbc214f37376d5cea1e3356ac35.png';
import { apiService } from '../services/api';
import { tenantService, Controller } from '../services/tenantService';
import { toast } from 'sonner';

interface LoginFormProps {
  onLoginSuccess: () => void;
  theme?: 'light' | 'dark' | 'synthwave' | 'system';
  onThemeToggle?: () => void;
}

type LoginStep = 'controller' | 'credentials';

export function LoginForm({ onLoginSuccess, theme = 'system', onThemeToggle }: LoginFormProps) {
  // Login step state
  const [step, setStep] = useState<LoginStep>('controller');
  
  // Controller state
  const [controllers, setControllers] = useState<Controller[]>([]);
  const [selectedController, setSelectedController] = useState<Controller | null>(null);
  const [loadingControllers, setLoadingControllers] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  
  // Add/Edit controller state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingController, setEditingController] = useState<Controller | null>(null);
  const [controllerForm, setControllerForm] = useState({ name: '', url: '', description: '' });
  
  // Credentials state
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Load controllers on mount
  useEffect(() => {
    loadControllers();
  }, []);

  const loadControllers = async () => {
    setLoadingControllers(true);
    try {
      const data = await tenantService.getControllers();
      setControllers(data);
      
      // Auto-select: prefer saved controller, then default controller
      const saved = tenantService.getCurrentController();
      let selectedCtrl: Controller | null = null;
      
      if (saved) {
        const found = data.find(c => c.id === saved.id);
        if (found) {
          selectedCtrl = found;
        }
      }
      
      // If no saved controller, use default
      if (!selectedCtrl) {
        const defaultController = data.find(c => c.is_default);
        if (defaultController) {
          selectedCtrl = defaultController;
        }
      }
      
      // If still no selection but we have controllers, pick the first one
      if (!selectedCtrl && data.length > 0) {
        selectedCtrl = data[0];
      }
      
      if (selectedCtrl) {
        setSelectedController(selectedCtrl);
        tenantService.setCurrentController(selectedCtrl);
        
        // Update API service base URL
        const controllerUrl = tenantService.getControllerUrl();
        if (controllerUrl) {
          apiService.setBaseUrl(controllerUrl);
        }
      }
      
      // If only one controller, auto-proceed to credentials
      if (data.length === 1 && selectedCtrl) {
        setStep('credentials');
      }
    } catch (error) {
      console.error('Failed to load controllers:', error);
    } finally {
      setLoadingControllers(false);
    }
  };

  const handleAddController = async () => {
    if (!controllerForm.name.trim() || !controllerForm.url.trim()) {
      toast.error('Name and URL are required');
      return;
    }

    let url = controllerForm.url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    const newController = tenantService.addQuickController(
      controllerForm.name.trim(),
      url
    );

    setControllers(prev => [...prev, newController]);
    setSelectedController(newController);
    setShowAddForm(false);
    setControllerForm({ name: '', url: '', description: '' });
    toast.success('Controller added');
  };

  const handleEditController = async () => {
    if (!editingController) return;

    await tenantService.updateController(editingController.id, {
      name: controllerForm.name,
      url: controllerForm.url,
      description: controllerForm.description
    });

    setControllers(prev => prev.map(c => 
      c.id === editingController.id 
        ? { ...c, ...controllerForm }
        : c
    ));

    setEditingController(null);
    setControllerForm({ name: '', url: '', description: '' });
    toast.success('Controller updated');
  };

  const handleDeleteController = async (controller: Controller, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${controller.name}"?`)) return;

    await tenantService.deleteController(controller.id);
    setControllers(prev => prev.filter(c => c.id !== controller.id));
    
    if (selectedController?.id === controller.id) {
      setSelectedController(null);
    }
    toast.success('Controller deleted');
  };

  const handleTestConnection = async (controller: Controller, e: React.MouseEvent) => {
    e.stopPropagation();
    setTesting(controller.id);
    
    try {
      const result = await tenantService.testControllerConnection(controller);
      
      setControllers(prev => prev.map(c => 
        c.id === controller.id 
          ? { ...c, connection_status: result.success ? 'connected' : 'disconnected' }
          : c
      ));

      if (result.success) {
        toast.success(`Connected to ${controller.name}`, {
          description: result.latency ? `${result.latency}ms` : undefined
        });
      } else {
        toast.error(`Connection failed`, { description: result.message });
      }
    } finally {
      setTesting(null);
    }
  };

  const handleSelectController = (controller: Controller) => {
    setSelectedController(controller);
  };

  const handleProceedToLogin = () => {
    if (!selectedController) {
      toast.error('Please select a controller');
      return;
    }
    
    // Set the current controller in tenant service and API service
    tenantService.setCurrentController(selectedController);
    
    // Update API service base URL
    const controllerUrl = tenantService.getControllerUrl();
    if (controllerUrl) {
      apiService.setBaseUrl(controllerUrl);
    }
    
    setStep('credentials');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await apiService.login(userId, password);
      
      // Update controller connection status
      if (selectedController) {
        tenantService.updateController(selectedController.id, {
          connection_status: 'connected',
          last_connected_at: new Date().toISOString()
        });
      }
      
      onLoginSuccess();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      
      if (errorMessage.includes('401') || errorMessage.includes('Invalid credentials')) {
        setError('Invalid username or password.');
      } else if (errorMessage.includes('timeout')) {
        setError('Connection timeout. Check network connectivity.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        <Card className="w-full">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <ImageWithFallback 
                src={extremeNetworksLogo}
                alt="API Platform"
                className="h-12 w-12 object-contain"
              />
            </div>
            <CardTitle className="text-2xl"><span className="font-bold">API</span> | Integration ONE</CardTitle>
            <CardDescription className="text-center mt-2">
              {step === 'controller' ? 'Select a site group to connect' : 'Sign in to continue'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Controller Selection Step */}
            {step === 'controller' && (
              <div className="space-y-4">
                {loadingControllers ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : showAddForm || editingController ? (
                  /* Add/Edit Site Group Form */
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setShowAddForm(false);
                          setEditingController(null);
                          setControllerForm({ name: '', url: '', description: '' });
                        }}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="font-medium">
                        {editingController ? 'Edit Site Group' : 'Add Site Group'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ctrl-name">Name</Label>
                      <Input
                        id="ctrl-name"
                        placeholder="Production Sites"
                        value={controllerForm.name}
                        onChange={(e) => setControllerForm(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ctrl-url">URL</Label>
                      <Input
                        id="ctrl-url"
                        placeholder="https://controller.example.com"
                        value={controllerForm.url}
                        onChange={(e) => setControllerForm(prev => ({ ...prev, url: e.target.value }))}
                      />
                    </div>

                    <Button 
                      className="w-full"
                      onClick={editingController ? handleEditController : handleAddController}
                    >
                      {editingController ? 'Save Changes' : 'Add Site Group'}
                    </Button>
                  </div>
                ) : (
                  /* Site Group List */
                  <div className="space-y-3">
                    {controllers.length === 0 ? (
                      <div className="text-center py-8">
                        <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground mb-4">No site groups configured</p>
                        <Button onClick={() => setShowAddForm(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Site Group
                        </Button>
                      </div>
                    ) : (
                      <>
                        {controllers.map(controller => (
                          <div
                            key={controller.id}
                            className={`p-4 border rounded-lg cursor-pointer transition-all hover:border-primary/50 ${
                              selectedController?.id === controller.id 
                                ? 'border-primary bg-primary/5' 
                                : ''
                            }`}
                            onClick={() => handleSelectController(controller)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`p-2 rounded-lg shrink-0 ${
                                  selectedController?.id === controller.id 
                                    ? 'bg-primary/20' 
                                    : 'bg-muted'
                                }`}>
                                  <Server className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium truncate">{controller.name}</span>
                                    {getStatusIcon(controller.connection_status)}
                                  </div>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Globe className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{controller.url}</span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => handleTestConnection(controller, e)}
                                  disabled={testing === controller.id}
                                >
                                  {testing === controller.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Wifi className="h-3 w-3" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingController(controller);
                                    setControllerForm({
                                      name: controller.name,
                                      url: controller.url,
                                      description: controller.description || ''
                                    });
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => handleDeleteController(controller, e)}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}

                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => setShowAddForm(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Site Group
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {controllers.length > 0 && !showAddForm && !editingController && (
                  <Button 
                    className="w-full mt-4"
                    onClick={handleProceedToLogin}
                    disabled={!selectedController}
                  >
                    Continue to Login
                  </Button>
                )}
              </div>
            )}

            {/* Credentials Step */}
            {step === 'credentials' && (
              <div className="space-y-4">
                {/* Selected Controller Info */}
                {selectedController && (
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg mb-4">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{selectedController.name}</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setStep('controller')}
                    >
                      Change
                    </Button>
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="userId">User ID / Username</Label>
                    <Input
                      id="userId"
                      type="text"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      placeholder="Enter your username"
                      required
                      disabled={isLoading}
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      disabled={isLoading}
                      autoComplete="current-password"
                    />
                  </div>
                  
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading || !userId.trim() || !password.trim()}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Authenticating...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
