import { useState, useEffect, useRef, type ChangeEvent, type MouseEvent, type FormEvent, type ReactNode } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Loader2, Server, ChevronLeft, Globe, Plus, Trash2, Pencil, CheckCircle, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import extremeNetworksLogo from 'figma:asset/f6780e138108fdbc214f37376d5cea1e3356ac35.png';
import { apiService } from '../services/api';
import { tenantService, Controller } from '../services/tenantService';
import { xiqService, XIQ_REGION_ORDER, XIQ_REGION_LABELS, type XIQRegion } from '../services/xiqService';
import { toast } from 'sonner';

interface LoginFormProps {
  onLoginSuccess: () => void;
  theme?: 'light' | 'ep1';
  onThemeToggle?: () => void;
}

type LoginStep = 'controller' | 'credentials' | 'xiq';

/* ---------- Floating-label input (matches XIQ login aesthetic) ---------- */
function FloatingInput({
  id, type = 'text', value, onChange, label, disabled, autoComplete, required
}: {
  id: string; type?: string; value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  label: string; disabled?: boolean; autoComplete?: string; required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const isFloated = focused || Boolean(value);

  return (
    <div style={{ position: 'relative', height: '54px' }}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        autoComplete={autoComplete}
        required={required}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          paddingTop: '18px',
          paddingBottom: '4px',
          paddingLeft: '12px',
          paddingRight: '12px',
          boxSizing: 'border-box' as const,
          borderWidth: '1px',
          borderStyle: 'solid',
          borderRadius: '4px',
          backgroundColor: 'var(--input-bg, transparent)',
          borderColor: 'var(--input-border, rgba(0,0,0,0.15))',
          color: 'var(--input-text, inherit)',
          fontSize: '14px',
          outline: 'none',
          opacity: disabled ? 0.5 : 1,
        }}
      />
      <label
        htmlFor={id}
        style={{
          position: 'absolute',
          left: '12px',
          top: isFloated ? '8px' : '50%',
          transform: isFloated ? 'none' : 'translateY(-50%)',
          fontSize: isFloated ? '11px' : '14px',
          color: focused
            ? 'var(--input-border-focus, #8981e5)'
            : 'var(--input-placeholder, #babcce)',
          pointerEvents: 'none',
          transition: 'all 0.15s ease',
          lineHeight: 1,
        }}
      >
        {label}
      </label>
    </div>
  );
}

/* ---------- Floating-label select ---------- */
function FloatingSelect({
  id, value, onChange, label, disabled, children
}: {
  id: string; value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  label: string; disabled?: boolean; children: ReactNode;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ position: 'relative', height: '54px' }}>
      <select
        id={id}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          paddingTop: '18px',
          paddingBottom: '4px',
          paddingLeft: '12px',
          paddingRight: '32px',
          boxSizing: 'border-box' as const,
          borderWidth: '1px',
          borderStyle: 'solid',
          borderRadius: '4px',
          backgroundColor: 'var(--input-bg, transparent)',
          borderColor: 'var(--input-border, rgba(0,0,0,0.15))',
          color: 'var(--input-text, inherit)',
          fontSize: '14px',
          outline: 'none',
          appearance: 'none' as const,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {children}
      </select>
      <label
        htmlFor={id}
        style={{
          position: 'absolute',
          left: '12px',
          top: '8px',
          fontSize: '11px',
          color: focused
            ? 'var(--input-border-focus, #8981e5)'
            : 'var(--input-placeholder, #babcce)',
          pointerEvents: 'none',
          transition: 'color 0.15s ease',
          lineHeight: 1,
        }}
      >
        {label}
      </label>
      <div
        style={{
          position: 'absolute',
          right: '12px',
          top: '56%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: 'var(--input-placeholder, #babcce)',
        }}
      >
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );
}

// ─── Demo defaults (pre-filled for demo/dev environment) ────────────────────
const DEMO_CONTROLLER_NAME = 'tsophiea';
const DEMO_CONTROLLER_URL  = 'https://tsophiea.ddns.net';
const DEMO_USERNAME        = 'admin';
const DEMO_PASSWORD        = 'Bronco3.0!';
const DEMO_XIQ_EMAIL       = 'tsophiea+ep1@extremenetworks.com';
const DEMO_XIQ_REGION: XIQRegion = 'ca';
// ────────────────────────────────────────────────────────────────────────────

/* ---------- Main LoginForm ---------- */
export function LoginForm({ onLoginSuccess, theme: _theme = 'ep1', onThemeToggle: _onThemeToggle }: LoginFormProps) {
  // Login step state
  const [step, setStep] = useState<LoginStep>('xiq');

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

  // XIQ state — pre-filled with demo defaults
  const [xiqEmail, setXiqEmail] = useState(DEMO_XIQ_EMAIL);
  const [xiqPassword, setXiqPassword] = useState('');
  const [xiqRegion, setXiqRegion] = useState<XIQRegion>(DEMO_XIQ_REGION);
  const [xiqLoading, setXiqLoading] = useState(false);
  const [xiqError, setXiqError] = useState('');

  // Prevents auto-login from firing more than once
  const autoLoginDone = useRef(false);

  // Load controllers on mount
  useEffect(() => {
    loadControllers();
  }, []);

  // Auto-login to controller once XIQ is done and credentials are pre-filled
  useEffect(() => {
    if (loadingControllers || autoLoginDone.current) return;
    if (step !== 'credentials') return;
    if (!selectedController || !userId || !password) return;
    autoLoginDone.current = true;

    setIsLoading(true);
    tenantService.setCurrentController(selectedController);
    const ctrlUrl = tenantService.getControllerUrl();
    if (ctrlUrl) apiService.setBaseUrl(ctrlUrl);

    apiService.login(userId, password)
      .then(() => {
        tenantService.saveSiteGroupLogin(selectedController.id, userId.trim(), password);
        tenantService.updateController(selectedController.id, {
          connection_status: 'connected',
          last_connected_at: new Date().toISOString()
        });
        onLoginSuccess();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Login failed';
        setError(
          msg.includes('401') || msg.includes('Invalid credentials')
            ? 'Invalid username or password.'
            : msg
        );
        setStep('credentials');
      })
      .finally(() => setIsLoading(false));
  // onLoginSuccess is a stable prop — intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingControllers, step, selectedController, userId, password]);

  const loadControllers = async () => {
    setLoadingControllers(true);
    try {
      const raw = await tenantService.getControllers();

      // Seed demo controller on first run (no stored controllers)
      let data = raw;
      if (raw.length === 0) {
        const demo = tenantService.addQuickController(DEMO_CONTROLLER_NAME, DEMO_CONTROLLER_URL);
        tenantService.saveSiteGroupLogin(demo.id, DEMO_USERNAME, DEMO_PASSWORD);
        data = [demo];
      }

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

        // Pre-fill saved controller credentials
        const savedLogin = tenantService.getSiteGroupLogin(selectedCtrl.id);
        if (savedLogin) {
          setUserId(savedLogin.username);
          setPassword(savedLogin.password);
        }

        // Pre-fill saved ExtremeCloud credentials for this site group
        const savedXIQ = xiqService.getCredentials(selectedCtrl.id);
        if (savedXIQ) {
          setXiqEmail(savedXIQ.email);
          setXiqPassword(savedXIQ.password);
          setXiqRegion(savedXIQ.region);
        }
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

    // Validate the URL is well-formed and uses an allowed scheme
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        toast.error('Controller URL must use http or https');
        return;
      }
    } catch {
      toast.error('Invalid controller URL — please enter a valid address');
      return;
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

    const url = controllerForm.url.trim();
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        toast.error('Controller URL must use http or https');
        return;
      }
    } catch {
      toast.error('Invalid controller URL — please enter a valid address');
      return;
    }

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

  const handleDeleteController = async (controller: Controller, e: MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${controller.name}"?`)) return;

    await tenantService.deleteController(controller.id);
    setControllers(prev => prev.filter(c => c.id !== controller.id));

    if (selectedController?.id === controller.id) {
      setSelectedController(null);
    }
    toast.success('Controller deleted');
  };

  const handleTestConnection = async (controller: Controller, e: MouseEvent) => {
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
    // Pre-fill saved credentials when the user selects a controller
    const saved = tenantService.getSiteGroupLogin(controller.id);
    if (saved) {
      setUserId(saved.username);
      setPassword(saved.password);
    } else {
      // Clear any leftover credentials from a previous controller
      setUserId('');
      setPassword('');
    }
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

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await apiService.login(userId, password);

      // Persist credentials and update connection status for this controller
      if (selectedController) {
        tenantService.saveSiteGroupLogin(selectedController.id, userId.trim(), password);
        tenantService.updateController(selectedController.id, {
          connection_status: 'connected',
          last_connected_at: new Date().toISOString()
        });

        // Migrate any pending XIQ token/credentials to the real controller ID
        const pendingCreds = xiqService.getCredentials('xiq_pending');
        if (pendingCreds) {
          xiqService.saveCredentials(
            selectedController.id,
            pendingCreds.email,
            pendingCreds.password,
            pendingCreds.region
          );
          // Re-establish token under real controller ID (best-effort background call)
          if (xiqService.getToken('xiq_pending')) {
            xiqService.login(pendingCreds.email, pendingCreds.password, pendingCreds.region, selectedController.id)
              .catch(() => {/* silent */});
          }
          xiqService.clearCredentials('xiq_pending');
        }
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

  const handleXIQLogin = async () => {
    setXiqLoading(true);
    setXiqError('');
    try {
      // XIQ login happens before controller selection — store under 'xiq_pending'.
      // After the user logs into their controller, credentials are re-associated to
      // the real controller ID.
      await xiqService.login(xiqEmail, xiqPassword, xiqRegion, 'xiq_pending');
      xiqService.saveCredentials('xiq_pending', xiqEmail, xiqPassword, xiqRegion);
      toast.success('Connected to XIQ', { description: `Region: ${XIQ_REGION_LABELS[xiqRegion]}` });
      // Skip controller step if there is only one and it is already selected
      if (controllers.length === 1 && selectedController) {
        setStep('credentials');
      } else {
        setStep('controller');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'XIQ login failed';
      if (msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('invalid')) {
        setXiqError('Invalid XIQ email or password.');
      } else if (msg.toLowerCase().includes('timeout')) {
        setXiqError('Connection timed out. Check your network and region selection.');
      } else {
        setXiqError(msg);
      }
    } finally {
      setXiqLoading(false);
    }
  };

  const handleSkipXIQ = () => {
    if (controllers.length === 1 && selectedController) {
      setStep('credentials');
    } else {
      setStep('controller');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-[color:var(--status-success)]" />;
      case 'disconnected':
        return <WifiOff className="h-4 w-4 text-[color:var(--status-error)]" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-[color:var(--status-warning)]" />;
      default:
        return <Wifi className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        <Card className="w-full shadow-2xl">
          <CardHeader className="pb-2 text-center">
            <div className="flex justify-center mb-5">
              <ImageWithFallback
                src={extremeNetworksLogo}
                alt="AURA"
                className="h-12 w-12 object-contain"
              />
            </div>
            <CardTitle className="text-2xl font-bold tracking-widest">AURA</CardTitle>
            <div className="text-[11px] text-muted-foreground text-center mt-1">
              Autonomous Unified Radio Agent
            </div>
            <CardDescription className="text-center mt-2">
              {step === 'controller' ? 'Select a site group to connect' :
               step === 'xiq' ? 'Sign in to ExtremeCloud' :
               'Sign in to continue'}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4">
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

                    <FloatingInput
                      id="ctrl-name"
                      label="Name"
                      value={controllerForm.name}
                      onChange={(e) => setControllerForm(prev => ({ ...prev, name: e.target.value }))}
                    />

                    <FloatingInput
                      id="ctrl-url"
                      label="URL"
                      value={controllerForm.url}
                      onChange={(e) => setControllerForm(prev => ({ ...prev, url: e.target.value }))}
                    />

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
                    <div className="flex items-center gap-2 min-w-0">
                      <Server className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium truncate block">{selectedController.name}</span>
                        {tenantService.getSiteGroupLogin(selectedController.id) && (
                          <span className="text-[11px] text-muted-foreground">Saved credentials loaded</span>
                        )}
                      </div>
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

                <form onSubmit={handleLogin} className="space-y-3">
                  <FloatingInput
                    id="userId"
                    label="User ID / Username"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    required
                    disabled={isLoading}
                    autoComplete="username"
                  />
                  <FloatingInput
                    id="password"
                    type="password"
                    label="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    autoComplete="current-password"
                  />

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

            {/* ExtremeCloud Step */}
            {step === 'xiq' && (
              <div className="space-y-3">
                {/* Already authenticated notice */}
                {xiqService.isAuthenticated('xiq_pending') && (
                  <div className="flex items-center gap-2 p-3 bg-[color:var(--status-success-bg)] border border-[color:var(--status-success)]/30 rounded-lg text-sm text-[color:var(--status-success)]">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    <span>ExtremeCloud session active.</span>
                  </div>
                )}

                <form onSubmit={e => { e.preventDefault(); if (xiqEmail.trim() && xiqPassword.trim()) handleXIQLogin(); }} className="space-y-3">
                  <FloatingSelect
                    id="xiq-region"
                    label="Region"
                    value={xiqRegion}
                    onChange={e => setXiqRegion(e.target.value as XIQRegion)}
                    disabled={xiqLoading}
                  >
                    {XIQ_REGION_ORDER.map(r => (
                      <option key={r} value={r}>{XIQ_REGION_LABELS[r]}</option>
                    ))}
                  </FloatingSelect>

                  <FloatingInput
                    id="xiq-email"
                    type="email"
                    label="Email"
                    value={xiqEmail}
                    onChange={e => setXiqEmail(e.target.value)}
                    disabled={xiqLoading}
                    autoComplete="username"
                  />

                  <FloatingInput
                    id="xiq-password"
                    type="password"
                    label="Password"
                    value={xiqPassword}
                    onChange={e => setXiqPassword(e.target.value)}
                    disabled={xiqLoading}
                    autoComplete="current-password"
                  />

                  {xiqError && (
                    <Alert variant="destructive">
                      <AlertDescription>{xiqError}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={xiqLoading || !xiqEmail.trim() || !xiqPassword.trim()}
                  >
                    {xiqLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In to ExtremeCloud'
                    )}
                  </Button>
                </form>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSkipXIQ}
                  disabled={xiqLoading}
                >
                  Skip for now
                </Button>

                <p className="text-[11px] text-muted-foreground text-center pt-1">
                  Connects AURA to your ExtremeCloud organization for future migration.
                  You can connect later from Site Group settings.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
