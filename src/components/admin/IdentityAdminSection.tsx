/**
 * Access & Identity administration: AURA users and roles, optional SSO
 * configuration, AURA Cortex enablement, and the AURA-side audit trail.
 * All reads/writes go through /api/auth/* and /api/settings/identity, which
 * require an admin session (or a controller bearer for legacy API clients).
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Users, KeyRound, Brain, ScrollText, RefreshCw } from 'lucide-react';
import { apiService, getDynamicControllerUrl } from '../../services/api';
import { toast } from 'sonner';

interface AuraUser {
  username: string;
  displayName: string | null;
  email: string | null;
  role: string;
  source: string;
  disabled: boolean;
  lastLoginAt: string | null;
}

interface AuditEntry {
  id: number;
  actor: string | null;
  source: string | null;
  action: string;
  target: string | null;
  at: string;
}

interface GroupMapping {
  group: string;
  role: string;
}

interface IdentitySettings {
  sso: {
    enabled: boolean;
    issuer: string;
    clientId: string;
    defaultRole: string;
    clientSecretSet: boolean;
    groupsClaim: string;
    groupMappings: GroupMapping[];
  };
  cortex: { enabled: boolean };
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = apiService.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const controllerUrl = getDynamicControllerUrl();
  if (controllerUrl) headers['X-Controller-URL'] = controllerUrl;
  return headers;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { ...authHeaders(), ...(init?.headers as Record<string, string>) },
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

export function IdentityAdminSection() {
  const [users, setUsers] = useState<AuraUser[]>([]);
  const [roles, setRoles] = useState<string[]>(['viewer', 'operator', 'admin']);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [settings, setSettings] = useState<IdentitySettings | null>(null);
  const [ssoSecret, setSsoSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [usersResp, auditResp, settingsResp] = await Promise.all([
        api<{ users: AuraUser[]; roles: string[] }>('/api/auth/users'),
        api<{ entries: AuditEntry[] }>('/api/audit?limit=50'),
        api<IdentitySettings>('/api/settings/identity'),
      ]);
      setUsers(usersResp.users);
      setRoles(usersResp.roles);
      setAuditEntries(auditResp.entries);
      setSettings(settingsResp);
      setUnavailable(null);
    } catch (err) {
      setUnavailable((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const updateUser = async (username: string, patch: { role?: string; disabled?: boolean }) => {
    try {
      await api(`/api/auth/users/${encodeURIComponent(username)}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      toast.success(`Updated ${username}`);
      reload();
    } catch (err) {
      toast.error(`Update failed: ${(err as Error).message}`);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    try {
      await api('/api/settings/identity', {
        method: 'PUT',
        body: JSON.stringify({
          sso: {
            ...settings.sso,
            clientSecret: ssoSecret || undefined,
            // Drop blank rows before saving.
            groupMappings: settings.sso.groupMappings.filter((m) => m.group.trim()),
          },
          cortex: settings.cortex,
        }),
      });
      setSsoSecret('');
      toast.success('Identity settings saved');
      reload();
    } catch (err) {
      toast.error(`Save failed: ${(err as Error).message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading identity data...
      </div>
    );
  }

  if (unavailable) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Identity administration unavailable: {unavailable}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Users & roles */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Users & Roles</CardTitle>
              <CardDescription>
                Everyone who has signed in to AURA. Viewer is read-only, operator can act on
                monitoring, admin can manage the platform.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-2 font-medium">User</th>
                  <th className="text-left py-2 font-medium">Source</th>
                  <th className="text-left py-2 font-medium">Last login</th>
                  <th className="text-left py-2 font-medium w-36">Role</th>
                  <th className="text-center py-2 font-medium">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.username} className="border-b border-border/30">
                    <td className="py-2">
                      <div className="font-medium">{user.username}</div>
                      {user.email && (
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      )}
                    </td>
                    <td className="py-2">
                      <Badge variant="outline" className="text-[10px]">
                        {user.source}
                      </Badge>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-2">
                      <Select
                        value={user.role}
                        onValueChange={(role) => updateUser(user.username, { role })}
                      >
                        <SelectTrigger className="h-8 text-xs w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 text-center">
                      <Switch
                        checked={!user.disabled}
                        onCheckedChange={(enabled) =>
                          updateUser(user.username, { disabled: !enabled })
                        }
                        aria-label={`${user.username} enabled`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* SSO */}
      {settings && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Single Sign-On (OIDC)</CardTitle>
                  <CardDescription>
                    Optional. When enabled, the login page offers "Sign in with SSO"; SSO users
                    are served through the platform service account.
                  </CardDescription>
                </div>
              </div>
              <Switch
                checked={settings.sso.enabled}
                onCheckedChange={(enabled) =>
                  setSettings({ ...settings, sso: { ...settings.sso, enabled } })
                }
                aria-label="SSO enabled"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="sso-issuer" className="text-xs">
                  Issuer URL
                </Label>
                <Input
                  id="sso-issuer"
                  placeholder="https://login.example.com/realms/corp"
                  value={settings.sso.issuer}
                  onChange={(e) =>
                    setSettings({ ...settings, sso: { ...settings.sso, issuer: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sso-client" className="text-xs">
                  Client ID
                </Label>
                <Input
                  id="sso-client"
                  placeholder="aura"
                  value={settings.sso.clientId}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      sso: { ...settings.sso, clientId: e.target.value },
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sso-secret" className="text-xs">
                  Client Secret{' '}
                  {settings.sso.clientSecretSet && (
                    <span className="text-muted-foreground">(set — leave blank to keep)</span>
                  )}
                </Label>
                <Input
                  id="sso-secret"
                  type="password"
                  autoComplete="new-password"
                  value={ssoSecret}
                  onChange={(e) => setSsoSecret(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Default role for new SSO users</Label>
                <Select
                  value={settings.sso.defaultRole}
                  onValueChange={(defaultRole) =>
                    setSettings({ ...settings, sso: { ...settings.sso, defaultRole } })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Redirect URI to register with your identity provider:{' '}
              <code className="font-mono">{window.location.origin}/api/auth/sso/callback</code>
            </p>

            {/* Group → role mapping */}
            <div className="rounded-lg border border-border/40 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-sm font-medium">Group → role mapping</div>
                  <div className="text-xs text-muted-foreground">
                    When set, a user&apos;s IdP groups decide their AURA role on every login
                    (highest match wins). Otherwise new SSO users get the default role above.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Groups claim</Label>
                  <Input
                    value={settings.sso.groupsClaim}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        sso: { ...settings.sso, groupsClaim: e.target.value },
                      })
                    }
                    className="h-8 w-32"
                    placeholder="groups"
                  />
                </div>
              </div>

              {settings.sso.groupMappings.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={m.group}
                    placeholder="IdP group name"
                    onChange={(e) => {
                      const next = [...settings.sso.groupMappings];
                      next[i] = { ...next[i], group: e.target.value };
                      setSettings({ ...settings, sso: { ...settings.sso, groupMappings: next } });
                    }}
                    className="h-8 flex-1"
                  />
                  <span className="text-muted-foreground text-xs">→</span>
                  <Select
                    value={m.role}
                    onValueChange={(role) => {
                      const next = [...settings.sso.groupMappings];
                      next[i] = { ...next[i], role };
                      setSettings({ ...settings, sso: { ...settings.sso, groupMappings: next } });
                    }}
                  >
                    <SelectTrigger className="h-8 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-muted-foreground"
                    onClick={() => {
                      const next = settings.sso.groupMappings.filter((_, j) => j !== i);
                      setSettings({ ...settings, sso: { ...settings.sso, groupMappings: next } });
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSettings({
                    ...settings,
                    sso: {
                      ...settings.sso,
                      groupMappings: [
                        ...settings.sso.groupMappings,
                        { group: '', role: 'viewer' },
                      ],
                    },
                  })
                }
              >
                Add mapping
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cortex */}
      {settings && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">AURA Cortex</CardTitle>
                  <CardDescription>
                    Optional. Enables the AI network assistant (read-only gateway tool catalog)
                    and alert Diagnose buttons for all users. Requires an LLM provider key on the
                    server.
                  </CardDescription>
                </div>
              </div>
              <Switch
                checked={settings.cortex.enabled}
                onCheckedChange={(enabled) => setSettings({ ...settings, cortex: { enabled } })}
                aria-label="Cortex enabled"
              />
            </div>
          </CardHeader>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={saveSettings}>Save Identity Settings</Button>
      </div>

      {/* AURA audit trail */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">AURA Audit Trail</CardTitle>
              <CardDescription>
                Actions taken inside AURA — logins, acknowledgements, schedule and settings
                changes — with who did them. Gateway-side changes appear in Audit Logs.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {auditEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AURA actions recorded yet.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-1.5 font-medium">When</th>
                    <th className="text-left py-1.5 font-medium">Actor</th>
                    <th className="text-left py-1.5 font-medium">Action</th>
                    <th className="text-left py-1.5 font-medium">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEntries.map((entry) => (
                    <tr key={entry.id} className="border-b border-border/20">
                      <td className="py-1.5 whitespace-nowrap text-muted-foreground">
                        {new Date(entry.at).toLocaleString()}
                      </td>
                      <td className="py-1.5">{entry.actor ?? '—'}</td>
                      <td className="py-1.5 font-mono">{entry.action}</td>
                      <td className="py-1.5 text-muted-foreground">{entry.target ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
