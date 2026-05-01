import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CloudUpload,
  LogOut,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronRight,
  Download,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { toast } from 'sonner';
import {
  xiqService,
  XIQ_REGION_LABELS,
  XIQ_REGION_ORDER,
  type XIQRegion,
  type XIQStoredToken,
} from '../services/xiqService';
import {
  fetchAllXIQData,
  fetchControllerProfiles,
  fetchExistingTopologies,
  fetchExistingServices,
  convertToControllerFormat,
  executeMigration,
  downloadMigrationReport,
  type XIQMigrationData,
  type XIQNormalizedSSID,
  type XIQNormalizedVLAN,
  type XIQNormalizedRADIUS,
  type ControllerProfile,
  type MigrationSelections,
  type ProfileAssignmentMode,
  type MigrationResult,
  type LogEntry,
} from '../services/xiqMigrationService';
import { useAppContext } from '../contexts/AppContext';
import { apiService } from '../services/api';

type Step = 1 | 2 | 3 | 4;

const STEPS = ['Connect to XIQ', 'Select Objects', 'Assign Profiles', 'Execute Migration'] as const;

// ─── Selection helpers ────────────────────────────────────────────────────────

function SelectList<T extends { id: string; name: string }>({
  items,
  selected,
  onToggle,
  onSelectAll,
  onSelectNone,
  renderSub,
}: {
  items: T[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  renderSub?: (item: T) => React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onSelectAll}>
          Select All
        </Button>
        <Button variant="outline" size="sm" onClick={onSelectNone}>
          Select None
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {selected.size} / {items.length} selected
        </span>
      </div>
      <div className="divide-y rounded-lg border max-h-72 overflow-y-auto">
        {items.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">None available</p>
        )}
        {items.map((item) => (
          <label
            key={item.id}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 cursor-pointer"
          >
            <Checkbox
              checked={selected.has(item.id)}
              onCheckedChange={() => onToggle(item.id)}
              style={{ width: 20, height: 20, flexShrink: 0 }}
            />
            <span className="text-sm font-medium flex-1">{item.name}</span>
            {renderSub?.(item)}
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function XIQMigrationTool() {
  const { siteGroup } = useAppContext();
  const siteGroupId = siteGroup?.id ?? 'default';

  const [step, setStep] = useState<Step>(1);
  const [token, setToken] = useState<XIQStoredToken | null>(null);

  // Step 1 — login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState<XIQRegion>('global');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Post-login XIQ data
  const [xiqData, setXiqData] = useState<XIQMigrationData | null>(null);
  const [fetchingXiq, setFetchingXiq] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Step 2 — selections
  const [ssidSel, setSsidSel] = useState<Set<string>>(new Set());
  const [vlanSel, setVlanSel] = useState<Set<string>>(new Set());
  const [radiusSel, setRadiusSel] = useState<Set<string>>(new Set());

  // Step 3 — profiles
  const [profiles, setProfiles] = useState<ControllerProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [profileMode, setProfileMode] = useState<ProfileAssignmentMode>('all');

  // Step 4 — execution
  const [dryRun, setDryRun] = useState(false);
  const [enableAfterMigration, setEnableAfterMigration] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const [downloadReportAfter, setDownloadReportAfter] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Post-migration PSK fix-up: SSIDs imported with the "12345678" placeholder
  // and the new password the user has entered for each.
  const [placeholderSsids, setPlaceholderSsids] = useState<string[]>([]);
  const [pskFixups, setPskFixups] = useState<Record<string, string>>({});
  const [savingPskFixups, setSavingPskFixups] = useState(false);

  const addLog = useCallback((msg: string, level: LogEntry['level'] = 'info') => {
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message: msg,
    };
    setLogs((prev) => [...prev, entry]);
    setTimeout(
      () => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }),
      50
    );
  }, []);

  // Restore session — XIQ token + last selections (sessionStorage so reloads keep
  // state but a fresh tab starts clean)
  const sessionKey = `xiq-migration:${siteGroupId}`;
  useEffect(() => {
    const existing = xiqService.getToken(siteGroupId);
    if (existing) {
      setToken(existing);
      setFetchingXiq(true);
      fetchAllXIQData(existing)
        .then((data) => {
          setXiqData(data);
          // Try to restore selections from sessionStorage
          try {
            const raw = sessionStorage.getItem(sessionKey);
            if (raw) {
              const saved = JSON.parse(raw) as {
                step?: Step;
                ssidIds?: string[];
                vlanIds?: string[];
                radiusIds?: string[];
                profileMode?: ProfileAssignmentMode;
              };
              if (saved.ssidIds) setSsidSel(new Set(saved.ssidIds));
              if (saved.vlanIds) setVlanSel(new Set(saved.vlanIds));
              if (saved.radiusIds) setRadiusSel(new Set(saved.radiusIds));
              if (saved.profileMode) setProfileMode(saved.profileMode);
              if (saved.step && saved.step >= 2 && saved.step <= 4) setStep(saved.step);
              else setStep(2);
            } else {
              setStep(2);
            }
          } catch {
            setStep(2);
          }
        })
        .catch((e: unknown) => {
          setFetchError(e instanceof Error ? e.message : 'Failed to fetch XIQ data');
          setStep(2);
        })
        .finally(() => setFetchingXiq(false));
    }
  }, [siteGroupId, sessionKey]);

  // Persist selections to sessionStorage so a refresh inside the tool keeps state
  useEffect(() => {
    if (!xiqData) return;
    try {
      sessionStorage.setItem(
        sessionKey,
        JSON.stringify({
          step,
          ssidIds: Array.from(ssidSel),
          vlanIds: Array.from(vlanSel),
          radiusIds: Array.from(radiusSel),
          profileMode,
        })
      );
    } catch {
      /* quota exceeded — skip */
    }
  }, [step, ssidSel, vlanSel, radiusSel, profileMode, xiqData, sessionKey]);

  // Fetch profiles when entering step 3
  useEffect(() => {
    if (step !== 3) return;
    setProfilesLoading(true);
    setProfilesError(null);
    fetchControllerProfiles()
      .then(setProfiles)
      .catch((e: unknown) =>
        setProfilesError(e instanceof Error ? e.message : 'Failed to fetch profiles')
      )
      .finally(() => setProfilesLoading(false));
  }, [step]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    xiqService
      .login(email, password, region, siteGroupId)
      .then((tok) => {
        setToken(tok);
        setFetchingXiq(true);
        setFetchError(null);
        return fetchAllXIQData(tok).then((data) => {
          setXiqData(data);
          // Pre-select all objects
          setSsidSel(new Set(data.ssids.map((s) => s.id)));
          setVlanSel(new Set(data.vlans.map((v) => v.id)));
          setRadiusSel(new Set(data.radius.map((r) => r.id)));
          setStep(2);
        });
      })
      .catch((e: unknown) => {
        setLoginError(e instanceof Error ? e.message : 'Login failed');
      })
      .finally(() => {
        setLoginLoading(false);
        setFetchingXiq(false);
      });
  }

  function handleLogout() {
    xiqService.clearToken(siteGroupId);
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {
      /* ignore */
    }
    setToken(null);
    setXiqData(null);
    setSsidSel(new Set());
    setVlanSel(new Set());
    setRadiusSel(new Set());
    setProfiles([]);
    setMigrationResult(null);
    setLogs([]);
    setStep(1);
  }

  async function handleExecute() {
    if (!xiqData || !token) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setMigrating(true);
    setMigrationResult(null);
    setLogs([]);
    try {
      addLog('Fetching existing topologies and services from controller...');
      const [existingTopos, existingServices] = await Promise.all([
        fetchExistingTopologies(),
        skipExisting ? fetchExistingServices() : Promise.resolve([]),
      ]);
      const selections: MigrationSelections = {
        ssidIds: ssidSel,
        vlanIds: vlanSel,
        radiusIds: radiusSel,
      };
      addLog('Converting XIQ config to controller format...');
      const config = convertToControllerFormat(
        xiqData,
        selections,
        existingTopos,
        existingServices
      );
      // Remember which SSIDs need a real password supplied after migration
      const allPlaceholders = [...config.pskPlaceholders, ...config.ppskWarnings];
      setPlaceholderSsids(allPlaceholders);
      setPskFixups({});
      addLog(
        `Ready: ${config.topologies.length} topologies, ${config.aaaPolicies.length} AAA policies, ${config.services.length} new services` +
          (config.skippedExistingServices.length > 0
            ? ` (${config.skippedExistingServices.length} already on controller, will skip)`
            : '')
      );
      const result = await executeMigration(
        config,
        existingTopos.length,
        profiles,
        {
          dryRun,
          enableAfterMigration,
          profileAssignmentMode: profileMode,
          skipExisting,
          retryAttempts: 2,
          signal: controller.signal,
        },
        addLog
      );
      setMigrationResult(result);
      const ok = result.services.succeeded.length;
      const fail = result.services.failed.length;
      const skipped = result.services.skipped.length;
      if (result.aborted) toast.warning(`Migration aborted — ${ok} of ${ok + fail} applied`);
      else if (ok > 0 && fail === 0)
        toast.success(
          `${ok} SSID(s) migrated successfully${skipped ? ` (${skipped} skipped — already on controller)` : ''}`
        );
      else if (ok > 0) toast.warning(`${ok} succeeded, ${fail} failed`);
      else if (skipped > 0 && config.services.length === 0)
        toast.info(`Nothing to migrate — all ${skipped} SSID(s) already on controller`);
      else toast.error('Migration failed');
      if (downloadReportAfter) downloadMigrationReport(xiqData, result, ssidSel);
    } catch (err) {
      addLog(err instanceof Error ? err.message : 'Migration error', 'error');
      toast.error('Migration error');
    } finally {
      setMigrating(false);
      abortRef.current = null;
    }
  }

  function handleAbort() {
    if (abortRef.current) {
      abortRef.current.abort();
      addLog('Cancelling migration after current step…', 'warn');
    }
  }

  /**
   * Apply real PSK passwords to SSIDs that were imported with the placeholder.
   * Looks up each SSID by name on the controller, then PUTs an updated `privacy`.
   */
  async function handleApplyPskFixups() {
    const updates = Object.entries(pskFixups).filter(([, pwd]) => pwd && pwd.length >= 8);
    if (updates.length === 0) {
      toast.warning('Enter at least one password (minimum 8 characters)');
      return;
    }
    setSavingPskFixups(true);
    let ok = 0;
    let fail = 0;
    try {
      // Fetch all services once to map name → id
      const services = await fetchExistingServices();
      const byName = new Map<string, Record<string, unknown>>();
      for (const s of services) {
        const name = (s.serviceName as string) || (s.ssid as string);
        if (name) byName.set(name.toLowerCase(), s);
      }
      for (const [ssidName, password] of updates) {
        const svc = byName.get(ssidName.toLowerCase());
        if (!svc?.id) {
          fail++;
          addLog(`PSK fix-up: could not find "${ssidName}" on controller`, 'error');
          continue;
        }
        try {
          // Preserve existing privacy mode; only swap the presharedKey.
          const existingPrivacy = (svc.privacy ?? {}) as Record<string, unknown>;
          const wpa = (existingPrivacy.WpaPskElement ?? {}) as Record<string, unknown>;
          const updated = {
            ...svc,
            privacy: {
              ...existingPrivacy,
              WpaPskElement: {
                ...wpa,
                mode: (wpa.mode as string) ?? 'auto',
                pmfMode: (wpa.pmfMode as string) ?? 'enabled',
                keyHexEncoded: false,
                presharedKey: password,
              },
            },
          };
          // Cast: Service privacy type is loosely shaped; the controller PUT accepts the merged body verbatim.
          await apiService.updateService(
            svc.id as string,
            updated as unknown as Parameters<typeof apiService.updateService>[1]
          );
          ok++;
          addLog(`PSK updated for "${ssidName}"`);
        } catch (err) {
          fail++;
          addLog(
            `PSK fix-up failed for "${ssidName}": ${err instanceof Error ? err.message : 'error'}`,
            'error'
          );
        }
      }
      if (ok > 0 && fail === 0) toast.success(`Updated ${ok} password(s)`);
      else if (ok > 0) toast.warning(`${ok} updated, ${fail} failed`);
      else toast.error('No passwords were updated');
      // Drop the ones that succeeded so the user sees what's left to do
      setPlaceholderSsids((prev) =>
        prev.filter((n) => !(updates.find(([name]) => name === n) && pskFixups[n]))
      );
    } finally {
      setSavingPskFixups(false);
    }
  }

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  return (
    <div className="p-6 overflow-auto h-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <CloudUpload className="h-5 w-5" />
            XIQ Migration
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Import SSIDs, VLANs, and RADIUS config from ExtremeCloud IQ
          </p>
        </div>
        {step > 1 && (
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1" />
            Log Out of XIQ
          </Button>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1.5 text-sm flex-wrap">
        {STEPS.map((label, i) => {
          const s = (i + 1) as Step;
          return (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                  step === s
                    ? 'bg-primary text-primary-foreground'
                    : step > s
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {s}
              </span>
              <span className={step === s ? 'font-medium' : 'text-muted-foreground text-xs'}>
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Step 1: Login ─────────────────────────────────────────────────────── */}
      {step === 1 && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Connect to ExtremeCloud IQ</CardTitle>
            <CardDescription>
              Enter your XIQ credentials. Your Aura controller session is unchanged.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="xiq-email">XIQ Username</Label>
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
                <Label htmlFor="xiq-password">XIQ Password</Label>
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
              <Button type="submit" className="w-full" disabled={loginLoading || fetchingXiq}>
                {loginLoading || fetchingXiq ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {fetchingXiq ? 'Loading XIQ data…' : 'Connecting…'}
                  </>
                ) : (
                  'Connect to XIQ'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Select Objects ─────────────────────────────────────────────── */}
      {step === 2 && xiqData && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(
              [
                { label: 'SSIDs', count: xiqData.ssids.length },
                { label: 'VLANs', count: xiqData.vlans.length },
                { label: 'RADIUS', count: xiqData.radius.length },
                { label: 'Devices', count: xiqData.devices.length },
              ] as const
            ).map(({ label, count }) => (
              <Card key={label}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {label}
                  </p>
                  <p className="text-3xl font-bold text-primary mt-1">{count}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadMigrationReport(xiqData, undefined, ssidSel)}
            >
              <Download className="h-4 w-4 mr-1" />
              Download PDF Report
            </Button>
          </div>

          {fetchError && (
            <Alert variant="destructive">
              <AlertDescription>{fetchError}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Select Objects to Migrate</CardTitle>
              <CardDescription>
                Choose which objects to import to the controller. Selected VLANs will be created as
                topologies, RADIUS as AAA policies, SSIDs as disabled services.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="ssids">
                <TabsList>
                  <TabsTrigger value="ssids">SSIDs ({xiqData.ssids.length})</TabsTrigger>
                  <TabsTrigger value="vlans">VLANs ({xiqData.vlans.length})</TabsTrigger>
                  <TabsTrigger value="radius">RADIUS ({xiqData.radius.length})</TabsTrigger>
                </TabsList>
                <div className="mt-4">
                  <TabsContent value="ssids">
                    <SelectList<XIQNormalizedSSID>
                      items={xiqData.ssids}
                      selected={ssidSel}
                      onToggle={(id) => setSsidSel(toggle(ssidSel, id))}
                      onSelectAll={() => setSsidSel(new Set(xiqData.ssids.map((s) => s.id)))}
                      onSelectNone={() => setSsidSel(new Set())}
                      renderSub={(s) => (
                        <Badge
                          variant={s.enabled ? 'default' : 'secondary'}
                          className="shrink-0 text-xs"
                        >
                          {s.security.type.toUpperCase()}
                        </Badge>
                      )}
                    />
                  </TabsContent>
                  <TabsContent value="vlans">
                    <SelectList<XIQNormalizedVLAN>
                      items={xiqData.vlans}
                      selected={vlanSel}
                      onToggle={(id) => setVlanSel(toggle(vlanSel, id))}
                      onSelectAll={() => setVlanSel(new Set(xiqData.vlans.map((v) => v.id)))}
                      onSelectNone={() => setVlanSel(new Set())}
                      renderSub={(v) => (
                        <span className="text-xs text-muted-foreground shrink-0">
                          VLAN {v.vlan_id}
                        </span>
                      )}
                    />
                  </TabsContent>
                  <TabsContent value="radius">
                    <SelectList<XIQNormalizedRADIUS>
                      items={xiqData.radius}
                      selected={radiusSel}
                      onToggle={(id) => setRadiusSel(toggle(radiusSel, id))}
                      onSelectAll={() => setRadiusSel(new Set(xiqData.radius.map((r) => r.id)))}
                      onSelectNone={() => setRadiusSel(new Set())}
                      renderSub={(r) => (
                        <span className="text-xs text-muted-foreground shrink-0">{r.ip}</span>
                      )}
                    />
                  </TabsContent>
                </div>
              </Tabs>
              <Button
                className="mt-4 w-full"
                style={{
                  backgroundColor: ssidSel.size === 0 ? '#374151' : '#2563eb',
                  color: '#ffffff',
                  opacity: ssidSel.size === 0 ? 0.6 : 1,
                }}
                disabled={ssidSel.size === 0}
                onClick={() => setStep(3)}
              >
                Continue ({ssidSel.size} SSID{ssidSel.size !== 1 ? 's' : ''} selected)
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Step 3: Assign Profiles ────────────────────────────────────────────── */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Assign SSIDs to Profiles</CardTitle>
            <CardDescription>
              Select which Associated Profiles each SSID should be assigned to, and which radios
              should broadcast them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profilesLoading && (
              <div className="flex items-center gap-2 py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Fetching profiles from controller…
              </div>
            )}
            {profilesError && (
              <Alert variant="destructive">
                <AlertDescription>{profilesError}</AlertDescription>
              </Alert>
            )}
            {!profilesLoading && (
              <>
                <p className="text-sm text-muted-foreground">
                  {profiles.length} Associated Profile(s) found on controller.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={profileMode === 'all' ? 'default' : 'outline'}
                    onClick={() => setProfileMode('all')}
                  >
                    Assign All SSIDs to All Profiles
                  </Button>
                  <Button
                    variant={profileMode === 'custom' ? 'default' : 'outline'}
                    onClick={() => setProfileMode('custom')}
                  >
                    Assign All to Custom Profiles Only
                  </Button>
                  <Button
                    variant={profileMode === 'none' ? 'default' : 'outline'}
                    onClick={() => setProfileMode('none')}
                  >
                    Skip Profile Assignment
                  </Button>
                </div>
                {profileMode !== 'none' && (
                  <p className="text-xs text-muted-foreground">
                    {profileMode === 'custom'
                      ? `${profiles.filter((p) => p.isCustom).length} custom profile(s) will be updated`
                      : `All ${profiles.length} profile(s) will be updated`}
                  </p>
                )}
              </>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={() => setStep(4)} disabled={profilesLoading}>
                Continue to Migration
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: Execute ────────────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Migration Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={dryRun}
                  onCheckedChange={(v) => setDryRun(!!v)}
                  style={{ width: 20, height: 20, flexShrink: 0 }}
                />
                <span className="font-medium text-sm">Dry Run (no changes will be made)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={skipExisting}
                  onCheckedChange={(v) => setSkipExisting(!!v)}
                  style={{ width: 20, height: 20, flexShrink: 0 }}
                />
                <div>
                  <span className="font-medium text-sm block">
                    Skip SSIDs already on the controller
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Match by name (case-insensitive). Prevents duplicate services if you re-run a
                    migration.
                  </span>
                </div>
              </label>

              <div className="border-l-2 border-primary pl-4 space-y-2">
                <p className="text-sm font-semibold">SSID Broadcast Settings</p>
                <p className="text-xs text-muted-foreground">
                  Choose whether migrated SSIDs should start broadcasting immediately or remain
                  disabled for manual review.
                </p>
                <RadioGroup
                  value={enableAfterMigration ? 'enabled' : 'disabled'}
                  onValueChange={(v) => setEnableAfterMigration(v === 'enabled')}
                >
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="disabled" id="status-disabled" className="mt-0.5" />
                    <Label htmlFor="status-disabled" className="cursor-pointer">
                      <span className="font-medium">Import as Disabled</span>
                      <span className="text-muted-foreground">
                        {' '}
                        (Recommended) — SSIDs will be created but not broadcasting. You can review
                        and enable them manually.
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="enabled" id="status-enabled" className="mt-0.5" />
                    <Label htmlFor="status-enabled" className="cursor-pointer">
                      <span className="font-medium">Start Broadcasting Immediately</span>
                      <span className="text-muted-foreground">
                        {' '}
                        — SSIDs will be enabled as soon as migration completes.
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={downloadReportAfter}
                  onCheckedChange={(v) => setDownloadReportAfter(!!v)}
                  style={{ width: 20, height: 20, flexShrink: 0 }}
                />
                <div>
                  <span className="font-medium text-sm block">Download Migration Report</span>
                  <span className="text-xs text-muted-foreground">
                    Automatically download a JSON report with all migrated objects and results.
                  </span>
                </div>
              </label>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={() => setStep(3)} disabled={migrating}>
                  Back
                </Button>
                <Button onClick={handleExecute} disabled={migrating} className="min-w-36">
                  {migrating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Migrating…
                    </>
                  ) : (
                    'Execute Migration'
                  )}
                </Button>
                {migrating && (
                  <Button variant="destructive" onClick={handleAbort}>
                    Cancel
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStep(1);
                    handleLogout();
                  }}
                  disabled={migrating}
                >
                  Start Over
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Migration results */}
          {migrationResult && (
            <Card>
              <CardHeader>
                <CardTitle>Migration Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  {(
                    [
                      {
                        label: 'Services',
                        ok: migrationResult.services.succeeded.length,
                        fail: migrationResult.services.failed.length,
                        skipped: migrationResult.services.skipped.length,
                      },
                      {
                        label: 'Topologies',
                        ok: migrationResult.topologies.succeeded,
                        fail: migrationResult.topologies.failed,
                      },
                      {
                        label: 'AAA Policies',
                        ok: migrationResult.aaaPolicies.succeeded,
                        fail: migrationResult.aaaPolicies.failed,
                      },
                      {
                        label: 'Profile Updates',
                        ok: migrationResult.profileAssignments.updated,
                        fail: migrationResult.profileAssignments.failed,
                      },
                    ] as const
                  ).map((entry) => {
                    const { label, ok, fail } = entry;
                    const skipped = 'skipped' in entry ? entry.skipped : 0;
                    return (
                      <div key={label} className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground font-medium">{label}</p>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {ok > 0 && (
                            <span className="text-green-600 dark:text-green-400 font-semibold">
                              {ok} ✓
                            </span>
                          )}
                          {fail > 0 && (
                            <span className="text-red-600 dark:text-red-400 font-semibold">
                              {fail} ✗
                            </span>
                          )}
                          {skipped > 0 && (
                            <span
                              className="text-amber-600 dark:text-amber-400 font-medium text-xs"
                              title="Already on controller — skipped to avoid duplicates"
                            >
                              {skipped} skipped
                            </span>
                          )}
                          {ok === 0 && fail === 0 && skipped === 0 && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {migrationResult.aborted && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Migration was cancelled. Objects already created on the controller were not
                      rolled back — review the controller and re-run with "Skip existing" enabled to
                      finish.
                    </AlertDescription>
                  </Alert>
                )}
                {migrationResult.services.failed.length > 0 && (
                  <div className="space-y-1">
                    {migrationResult.services.failed.map(({ name, error }) => (
                      <Alert key={name} variant="destructive">
                        <AlertDescription>
                          <span className="font-medium">{name}:</span> {error}
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
                {migrationResult.services.succeeded.length > 0 && (
                  <div className="space-y-1">
                    {migrationResult.services.succeeded.map((name) => (
                      <div
                        key={name}
                        className="flex items-center gap-2 text-sm px-3 py-1.5 rounded bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300"
                      >
                        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                        {name}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                    Migrate More
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      xiqData && downloadMigrationReport(xiqData, migrationResult, ssidSel)
                    }
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* PSK Fix-Up — set real passwords for SSIDs that came in with the placeholder */}
          {migrationResult &&
            !migrationResult.aborted &&
            placeholderSsids.length > 0 &&
            placeholderSsids.some((n) => migrationResult.services.succeeded.includes(n)) && (
              <Card className="border-amber-300 dark:border-amber-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                    Set passwords for migrated PSK SSIDs
                  </CardTitle>
                  <CardDescription>
                    XIQ does not return PSK keys via API, so these SSIDs were imported with the
                    placeholder <code className="font-mono">12345678</code>. Enter the real password
                    for each before enabling the SSID.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {placeholderSsids
                    .filter((n) => migrationResult.services.succeeded.includes(n))
                    .map((ssidName) => (
                      <div key={ssidName} className="flex items-center gap-2">
                        <Label className="w-1/3 truncate font-mono text-xs" title={ssidName}>
                          {ssidName}
                        </Label>
                        <Input
                          type="password"
                          placeholder="New password (min 8 characters)"
                          value={pskFixups[ssidName] ?? ''}
                          onChange={(e) =>
                            setPskFixups((prev) => ({ ...prev, [ssidName]: e.target.value }))
                          }
                          minLength={8}
                          className="flex-1"
                        />
                      </div>
                    ))}
                  <div className="flex justify-end pt-1">
                    <Button onClick={handleApplyPskFixups} disabled={savingPskFixups}>
                      {savingPskFixups ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Applying…
                        </>
                      ) : (
                        'Apply Passwords'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Migration Log */}
          {(logs.length > 0 || migrating) && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Migration Logs</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setLogs([])}>
                    Clear
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div
                  ref={logRef}
                  className="h-48 overflow-y-auto bg-muted rounded-lg p-3 font-mono text-xs space-y-0.5"
                >
                  {logs.map((entry, i) => (
                    <div
                      key={i}
                      className={
                        entry.level === 'error'
                          ? 'text-red-500'
                          : entry.level === 'warn'
                            ? 'text-yellow-500'
                            : ''
                      }
                    >
                      <span className="text-muted-foreground mr-2">{entry.timestamp}</span>
                      {entry.message}
                    </div>
                  ))}
                  {migrating && <div className="text-muted-foreground animate-pulse">…</div>}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* XCircle import used in result icon */}
      <span className="hidden">
        <XCircle />
      </span>
    </div>
  );
}
