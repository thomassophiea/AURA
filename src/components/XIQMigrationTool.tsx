import { useState, useEffect } from 'react';
import { CloudUpload, LogOut, CheckCircle, XCircle, Loader2, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { toast } from 'sonner';
import {
  xiqService,
  XIQ_REGION_LABELS,
  XIQ_REGION_ORDER,
  type XIQRegion,
  type XIQStoredToken,
} from '../services/xiqService';
import {
  getSSIDs,
  migrateSSIDs,
  type XIQMigrationSSID,
  type MigrationResult,
} from '../services/xiqMigrationService';
import { useAppContext } from '../contexts/AppContext';

type Step = 1 | 2 | 3;

export function XIQMigrationTool() {
  const { siteGroup } = useAppContext();
  const siteGroupId = siteGroup?.id ?? 'default';

  const [step, setStep] = useState<Step>(1);
  const [token, setToken] = useState<XIQStoredToken | null>(null);

  // Step 1 — Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState<XIQRegion>('global');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Step 2 — Select SSIDs
  const [ssids, setSSIDs] = useState<XIQMigrationSSID[]>([]);
  const [ssidsLoading, setSSIDsLoading] = useState(false);
  const [ssidsError, setSSIDsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Step 3 — Migration result
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);

  // Restore existing XIQ session on mount
  useEffect(() => {
    const existing = xiqService.getToken(siteGroupId);
    if (existing) {
      setToken(existing);
      setStep(2);
    }
  }, [siteGroupId]);

  // Fetch SSIDs when entering step 2
  useEffect(() => {
    if (step !== 2 || !token) return;
    let cancelled = false;

    setSSIDsLoading(true);
    setSSIDsError(null);

    getSSIDs(token)
      .then((data) => {
        if (!cancelled) {
          setSSIDs(data);
          setSelected(new Set());
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load SSIDs';
          setSSIDsError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setSSIDsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [step, token]);

  // Run migration when entering step 3
  useEffect(() => {
    if (step !== 3 || !token) return;

    const selectedSSIDs = ssids.filter((s) => selected.has(s.id));
    setMigrating(true);
    setResult(null);

    migrateSSIDs(selectedSSIDs, token)
      .then((res) => {
        setResult(res);
        if (res.succeeded.length > 0 && res.failed.length === 0) {
          toast.success(`${res.succeeded.length} SSID(s) migrated successfully`);
        } else if (res.succeeded.length > 0) {
          toast.warning(`${res.succeeded.length} succeeded, ${res.failed.length} failed`);
        } else {
          toast.error('Migration failed — no SSIDs were created');
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Migration error';
        setResult({ succeeded: [], failed: [{ name: 'Migration', error: msg }] });
        toast.error(msg);
      })
      .finally(() => setMigrating(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    xiqService
      .login(email, password, region, siteGroupId)
      .then((tok) => {
        setToken(tok);
        setStep(2);
      })
      .catch((err: unknown) => {
        setLoginError(err instanceof Error ? err.message : 'Login failed');
      })
      .finally(() => setLoginLoading(false));
  }

  function handleLogout() {
    xiqService.clearToken(siteGroupId);
    setToken(null);
    setSSIDs([]);
    setSelected(new Set());
    setResult(null);
    setStep(1);
  }

  function toggleSSID(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === ssids.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(ssids.map((s) => s.id)));
    }
  }

  return (
    <div className="p-6 overflow-auto h-full">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <CloudUpload className="h-5 w-5" />
            XIQ Migration
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Import SSIDs from ExtremeCloud IQ into this controller
          </p>
        </div>
        {step > 1 && token && (
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1" />
            Log Out of XIQ
          </Button>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        {(['Login', 'Select SSIDs', 'Migrate'] as const).map((label, i) => {
          const s = (i + 1) as Step;
          return (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  step === s
                    ? 'bg-primary text-primary-foreground'
                    : step > s
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {s}
              </span>
              <span className={step === s ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
              {i < 2 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          );
        })}
      </div>

      {/* ── Step 1: Login ─────────────────────────────────────────────────────── */}
      {step === 1 && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Connect to XIQ</CardTitle>
            <CardDescription>
              Enter your ExtremeCloud IQ credentials. Your Aura session remains unchanged.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="xiq-email">Email</Label>
                <Input
                  id="xiq-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="xiq-password">Password</Label>
                <Input
                  id="xiq-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="xiq-region">Region</Label>
                <Select value={region} onValueChange={(v) => setRegion(v as XIQRegion)}>
                  <SelectTrigger id="xiq-region">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {XIQ_REGION_ORDER.map((r) => (
                      <SelectItem key={r} value={r}>
                        {XIQ_REGION_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {loginError && (
                <Alert variant="destructive">
                  <AlertDescription>{loginError}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={loginLoading}>
                {loginLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  'Connect to XIQ'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Select SSIDs ──────────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Select SSIDs to Migrate</CardTitle>
            <CardDescription>
              Choose which SSIDs from XIQ to create on this controller. They will be created as
              disabled services — enable them after reviewing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ssidsLoading && (
              <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading SSIDs from XIQ…
              </div>
            )}
            {ssidsError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{ssidsError}</AlertDescription>
              </Alert>
            )}
            {!ssidsLoading && !ssidsError && ssids.length === 0 && (
              <p className="text-muted-foreground text-sm py-8 text-center">
                No SSIDs found in your XIQ account.
              </p>
            )}
            {!ssidsLoading && ssids.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <Button variant="outline" size="sm" onClick={toggleAll}>
                    {selected.size === ssids.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {selected.size} of {ssids.length} selected
                  </span>
                </div>
                <div className="divide-y rounded-lg border">
                  {ssids.map((ssid) => (
                    <label
                      key={ssid.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selected.has(ssid.id)}
                        onCheckedChange={() => toggleSSID(ssid.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm truncate block">{ssid.ssid_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {ssid.key_management ?? 'Unknown security'}
                          {ssid.access_vlan ? ` · VLAN ${ssid.access_vlan}` : ''}
                        </span>
                      </div>
                      <Badge
                        variant={ssid.enabled_status === 'ENABLE' ? 'default' : 'secondary'}
                        className="shrink-0"
                      >
                        {ssid.enabled_status === 'ENABLE' ? 'Active' : 'Disabled'}
                      </Badge>
                    </label>
                  ))}
                </div>
                <Button
                  className="w-full mt-2"
                  disabled={selected.size === 0}
                  onClick={() => setStep(3)}
                >
                  Migrate {selected.size > 0 ? `${selected.size} SSID(s)` : 'Selected'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Migration result ─────────────────────────────────────────── */}
      {step === 3 && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Migration</CardTitle>
            <CardDescription>
              Posting selected SSIDs to the controller as disabled services.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {migrating && (
              <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Migrating…
              </div>
            )}
            {result && (
              <>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    {result.succeeded.length} succeeded
                  </div>
                  {result.failed.length > 0 && (
                    <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                      <XCircle className="h-4 w-4" />
                      {result.failed.length} failed
                    </div>
                  )}
                </div>

                {result.succeeded.length > 0 && (
                  <div className="space-y-1">
                    {result.succeeded.map((name) => (
                      <div
                        key={name}
                        className="flex items-center gap-2 text-sm px-3 py-2 rounded-md bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300"
                      >
                        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                        {name}
                      </div>
                    ))}
                  </div>
                )}

                {result.failed.length > 0 && (
                  <div className="space-y-1">
                    {result.failed.map(({ name, error }) => (
                      <Alert key={name} variant="destructive">
                        <AlertDescription>
                          <span className="font-medium">{name}:</span> {error}
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    Migrate More
                  </Button>
                  <Button variant="ghost" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-1" />
                    Log Out of XIQ
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
