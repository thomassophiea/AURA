/**
 * SiteGroupSettingsPage — Per-site-group configuration page.
 *
 * Tabs: Connection, Variables, Deployment, Info
 */

import { useState } from 'react';
import { Settings, Wifi, Braces, Rocket, Info, Server } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { VariableScopeEditor } from './global-elements/VariableScopeEditor';
import { useAppContext } from '../contexts/AppContext';
import { useSiteGroupSettings } from '../hooks/useSiteGroupSettings';
import { useVariableDefinitions, useVariableValues } from '../hooks/useGlobalElements';

export function SiteGroupSettingsPage() {
  const { organization, siteGroup, siteGroups } = useAppContext();
  const orgId = organization?.id;
  const sgId = siteGroup?.id;

  const { settings, updateSettings } = useSiteGroupSettings(sgId);
  const { definitions } = useVariableDefinitions(orgId);
  const { values, setValue, deleteValue } = useVariableValues(orgId);

  const [activeTab, setActiveTab] = useState('connection');
  const [saving, setSaving] = useState(false);

  if (!siteGroup) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Server className="h-8 w-8 mx-auto mb-3 opacity-50" />
        <p className="text-sm">No site group selected</p>
        <p className="text-xs mt-1">Select a site group from the sidebar to configure settings</p>
      </div>
    );
  }

  const handleSaveConnection = async () => {
    setSaving(true);
    try {
      await updateSettings({ connection: settings.connection });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDeployment = async () => {
    setSaving(true);
    try {
      await updateSettings({ deployment: settings.deployment });
    } finally {
      setSaving(false);
    }
  };

  // Filter variable values to only those for this site group
  const sgValues = values.filter(v => v.scope_type === 'site_group' && v.scope_id === sgId);
  // Find a variable to select by default
  const [selectedVarId, setSelectedVarId] = useState<string | null>(null);
  const selectedVar = definitions.find(d => d.id === selectedVarId) ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl">{siteGroup.name} Settings</h1>
          <Badge variant={siteGroup.connection_status === 'connected' ? 'success' : 'secondary'}>
            {siteGroup.connection_status}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Configure connection, variables, and deployment preferences
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="connection">
            <Wifi className="h-4 w-4 mr-2" />
            Connection
          </TabsTrigger>
          <TabsTrigger value="variables">
            <Braces className="h-4 w-4 mr-2" />
            Variables
          </TabsTrigger>
          <TabsTrigger value="deployment">
            <Rocket className="h-4 w-4 mr-2" />
            Deployment
          </TabsTrigger>
          <TabsTrigger value="info">
            <Info className="h-4 w-4 mr-2" />
            Info
          </TabsTrigger>
        </TabsList>

        {/* Connection Tab */}
        <TabsContent value="connection" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connection Settings</CardTitle>
              <CardDescription>Configure how AURA connects to this controller</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Controller URL</Label>
                <Input value={siteGroup.controller_url} disabled className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">Read-only — managed in Site Groups configuration</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeout">Request Timeout (ms)</Label>
                <Input
                  id="timeout"
                  type="number"
                  value={settings.connection.timeout_ms}
                  onChange={e => {
                    const conn = { ...settings.connection, timeout_ms: Number(e.target.value) || 10000 };
                    updateSettings({ connection: conn });
                  }}
                  min={1000}
                  max={60000}
                  step={1000}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="retries">Retry Count</Label>
                <Input
                  id="retries"
                  type="number"
                  value={settings.connection.retry_count}
                  onChange={e => {
                    const conn = { ...settings.connection, retry_count: Number(e.target.value) || 3 };
                    updateSettings({ connection: conn });
                  }}
                  min={0}
                  max={10}
                />
              </div>

              <div className="space-y-2">
                <Label>Preferred Protocol</Label>
                <Select
                  value={settings.connection.preferred_protocol}
                  onValueChange={(v) => {
                    const conn = { ...settings.connection, preferred_protocol: v as 'https' | 'http' };
                    updateSettings({ connection: conn });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="https">HTTPS</SelectItem>
                    <SelectItem value="http">HTTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleSaveConnection} disabled={saving}>
                {saving ? 'Saving...' : 'Save Connection Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Variables Tab */}
        <TabsContent value="variables" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Variable Overrides</CardTitle>
              <CardDescription>
                Set variable values specific to this site group. These override organization-level defaults.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {definitions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No variables defined yet</p>
                  <p className="text-xs mt-1">Create variables in Global Elements → Variables tab</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Variable selector */}
                  <Select value={selectedVarId ?? ''} onValueChange={setSelectedVarId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a variable to configure..." />
                    </SelectTrigger>
                    <SelectContent>
                      {definitions.map(d => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} ({`{{${d.token}}}`})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedVar && (
                    <VariableScopeEditor
                      variable={selectedVar}
                      values={values.filter(v => v.variable_id === selectedVar.id)}
                      orgId={orgId!}
                      orgName={organization?.name ?? 'Organization'}
                      siteGroups={[siteGroup]}
                      sites={[]}
                      onSetValue={setValue}
                      onDeleteValue={deleteValue}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deployment Tab */}
        <TabsContent value="deployment" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deployment Preferences</CardTitle>
              <CardDescription>Configure how templates are deployed to this controller</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto Deploy</Label>
                  <p className="text-xs text-muted-foreground">Automatically deploy when template changes</p>
                </div>
                <Switch
                  checked={settings.deployment.auto_deploy}
                  onCheckedChange={(v) => {
                    const dep = { ...settings.deployment, auto_deploy: v };
                    updateSettings({ deployment: dep });
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>Deployment Mode</Label>
                <Select
                  value={settings.deployment.deployment_mode}
                  onValueChange={(v) => {
                    const dep = { ...settings.deployment, deployment_mode: v as 'create_only' | 'create_or_update' };
                    updateSettings({ deployment: dep });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create_only">Create Only (skip if exists)</SelectItem>
                    <SelectItem value="create_or_update">Create or Update</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Notify on Failure</Label>
                  <p className="text-xs text-muted-foreground">Show notification when deployment fails</p>
                </div>
                <Switch
                  checked={settings.deployment.notify_on_failure}
                  onCheckedChange={(v) => {
                    const dep = { ...settings.deployment, notify_on_failure: v };
                    updateSettings({ deployment: dep });
                  }}
                />
              </div>

              <Button onClick={handleSaveDeployment} disabled={saving}>
                {saving ? 'Saving...' : 'Save Deployment Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Info Tab */}
        <TabsContent value="info" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Site Group Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <InfoRow label="Name" value={siteGroup.name} />
                <InfoRow label="ID" value={siteGroup.id} mono />
                <InfoRow label="Controller URL" value={siteGroup.controller_url} mono />
                {siteGroup.controller_port && <InfoRow label="Port" value={String(siteGroup.controller_port)} />}
                <InfoRow label="Connection Status" value={siteGroup.connection_status} badge />
                {siteGroup.last_connected_at && <InfoRow label="Last Connected" value={new Date(siteGroup.last_connected_at).toLocaleString()} />}
                <InfoRow label="Default" value={siteGroup.is_default ? 'Yes' : 'No'} />
                {siteGroup.region && <InfoRow label="Region" value={siteGroup.region} />}
                {siteGroup.xiq_authenticated !== undefined && <InfoRow label="XIQ Connected" value={siteGroup.xiq_authenticated ? 'Yes' : 'No'} />}
                {siteGroup.xiq_region && <InfoRow label="XIQ Region" value={siteGroup.xiq_region} />}
                {siteGroup.site_count !== undefined && <InfoRow label="Sites" value={String(siteGroup.site_count)} />}
                {siteGroup.created_at && <InfoRow label="Created" value={new Date(siteGroup.created_at).toLocaleString()} />}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ label, value, mono, badge }: { label: string; value: string; mono?: boolean; badge?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {badge ? (
        <Badge variant={value === 'connected' ? 'success' : 'secondary'}>{value}</Badge>
      ) : (
        <span className={`text-sm ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
      )}
    </div>
  );
}
