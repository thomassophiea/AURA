import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Plus, Trash2, Server, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';
import type { 
  AuthenticationProtocol, 
  CalledStationIdFormat, 
  AccountingType, 
  RADIUSServersMode 
} from '../types/network';

interface RADIUSServer {
  host: string;
  port: number;
  secret: string;
  timeout: number;
  retries: number;
}

interface AAAPolicyFormData {
  name: string;
  naiRouting: boolean;
  authenticationProtocol: AuthenticationProtocol;
  nasId: string;
  calledStationId: CalledStationIdFormat;
  accountingType: AccountingType;
  accountingInterimInterval: number;
  radiusAuthServersMode: RADIUSServersMode;
  radiusAcctServersMode: RADIUSServersMode;
  eventTimestamp: boolean;
  includeFramedIp: boolean;
  authServers: RADIUSServer[];
  acctServers: RADIUSServer[];
}

interface AAAPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy?: any;
  onSuccess: () => void;
}

const defaultServer: RADIUSServer = { host: '', port: 1812, secret: '', timeout: 5, retries: 3 };
const defaultAcctServer: RADIUSServer = { host: '', port: 1813, secret: '', timeout: 5, retries: 3 };

const initialFormData: AAAPolicyFormData = {
  name: '',
  naiRouting: false,
  authenticationProtocol: 'PAP',
  nasId: '',
  calledStationId: 'WIRED_MAC_COLON_SSID',
  accountingType: 'START-INTERIM-STOP',
  accountingInterimInterval: 300,
  radiusAuthServersMode: 'Failover',
  radiusAcctServersMode: 'Failover',
  eventTimestamp: true,
  includeFramedIp: false,
  authServers: [{ ...defaultServer }],
  acctServers: [{ ...defaultAcctServer }]
};

export function AAAPolicyDialog({ open, onOpenChange, policy, onSuccess }: AAAPolicyDialogProps) {
  const [formData, setFormData] = useState<AAAPolicyFormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  const isEditMode = !!policy?.id;

  useEffect(() => {
    if (policy) {
      setFormData({
        name: policy.name || '',
        naiRouting: policy.naiRouting ?? false,
        authenticationProtocol: policy.authenticationProtocol || 'PAP',
        nasId: policy.nasId || '',
        calledStationId: policy.calledStationId || 'WIRED_MAC_COLON_SSID',
        accountingType: policy.accountingType || 'START-INTERIM-STOP',
        accountingInterimInterval: policy.accountingInterimInterval ?? 300,
        radiusAuthServersMode: policy.radiusAuthServersMode || 'Failover',
        radiusAcctServersMode: policy.radiusAcctServersMode || 'Failover',
        eventTimestamp: policy.eventTimestamp ?? true,
        includeFramedIp: policy.includeFramedIp ?? false,
        authServers: policy.radiusAuthServers?.length 
          ? policy.radiusAuthServers.map((s: any) => ({
              host: s.host || '',
              port: s.port || 1812,
              secret: s.secret || '',
              timeout: s.timeout ?? 5,
              retries: s.retries ?? 3
            }))
          : [{ ...defaultServer }],
        acctServers: policy.radiusAcctServers?.length
          ? policy.radiusAcctServers.map((s: any) => ({
              host: s.host || '',
              port: s.port || 1813,
              secret: s.secret || '',
              timeout: s.timeout ?? 5,
              retries: s.retries ?? 3
            }))
          : [{ ...defaultAcctServer }]
      });
    } else {
      setFormData(initialFormData);
    }
    setActiveTab('general');
  }, [policy, open]);

  const addAuthServer = () => {
    if (formData.authServers.length >= 4) {
      toast.error('Maximum 4 authentication servers allowed');
      return;
    }
    setFormData(prev => ({
      ...prev,
      authServers: [...prev.authServers, { ...defaultServer }]
    }));
  };

  const removeAuthServer = (index: number) => {
    if (formData.authServers.length <= 1) {
      toast.error('At least one authentication server is required');
      return;
    }
    setFormData(prev => ({
      ...prev,
      authServers: prev.authServers.filter((_, i) => i !== index)
    }));
  };

  const updateAuthServer = (index: number, field: keyof RADIUSServer, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      authServers: prev.authServers.map((s, i) => 
        i === index ? { ...s, [field]: value } : s
      )
    }));
  };

  const addAcctServer = () => {
    if (formData.acctServers.length >= 4) {
      toast.error('Maximum 4 accounting servers allowed');
      return;
    }
    setFormData(prev => ({
      ...prev,
      acctServers: [...prev.acctServers, { ...defaultAcctServer }]
    }));
  };

  const removeAcctServer = (index: number) => {
    setFormData(prev => ({
      ...prev,
      acctServers: prev.acctServers.filter((_, i) => i !== index)
    }));
  };

  const updateAcctServer = (index: number, field: keyof RADIUSServer, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      acctServers: prev.acctServers.map((s, i) => 
        i === index ? { ...s, [field]: value } : s
      )
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Policy name is required');
      return;
    }

    const validAuthServers = formData.authServers.filter(s => s.host.trim());
    if (validAuthServers.length === 0) {
      toast.error('At least one authentication server with a host is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: formData.name,
        naiRouting: formData.naiRouting,
        authenticationProtocol: formData.authenticationProtocol,
        nasId: formData.nasId || undefined,
        calledStationId: formData.calledStationId,
        accountingType: formData.accountingType,
        accountingInterimInterval: formData.accountingInterimInterval,
        radiusAuthServersMode: formData.radiusAuthServersMode,
        radiusAcctServersMode: formData.radiusAcctServersMode,
        eventTimestamp: formData.eventTimestamp,
        includeFramedIp: formData.includeFramedIp,
        radiusAuthServers: validAuthServers.map((s, index) => ({
          order: index + 1,
          host: s.host,
          port: s.port,
          secret: s.secret,
          timeout: s.timeout,
          retries: s.retries
        })),
        radiusAcctServers: formData.acctServers
          .filter(s => s.host.trim())
          .map((s, index) => ({
            order: index + 1,
            host: s.host,
            port: s.port,
            secret: s.secret,
            timeout: s.timeout,
            retries: s.retries
          }))
      };

      if (isEditMode) {
        await apiService.updateAAAPolicy(policy.id, payload);
        toast.success('AAA Policy updated');
      } else {
        await apiService.createAAAPolicy(payload);
        toast.success('AAA Policy created');
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to save AAA Policy');
    } finally {
      setSubmitting(false);
    }
  };

  const renderServerCard = (
    server: RADIUSServer, 
    index: number, 
    type: 'auth' | 'acct',
    onUpdate: (index: number, field: keyof RADIUSServer, value: string | number) => void,
    onRemove: (index: number) => void,
    canRemove: boolean
  ) => (
    <Card key={index} className="mb-3">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Server className="h-4 w-4" />
            {type === 'auth' ? 'Authentication' : 'Accounting'} Server {index + 1}
          </CardTitle>
          {canRemove && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(index)}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Host</Label>
            <Input
              placeholder="192.168.1.100"
              value={server.host}
              onChange={e => onUpdate(index, 'host', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Port</Label>
            <Input
              type="number"
              value={server.port}
              onChange={e => onUpdate(index, 'port', parseInt(e.target.value) || (type === 'auth' ? 1812 : 1813))}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Shared Secret</Label>
          <Input
            type="password"
            placeholder="Enter shared secret"
            value={server.secret}
            onChange={e => onUpdate(index, 'secret', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Timeout (seconds)</Label>
            <Input
              type="number"
              value={server.timeout}
              onChange={e => onUpdate(index, 'timeout', parseInt(e.target.value) || 5)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Retries</Label>
            <Input
              type="number"
              value={server.retries}
              onChange={e => onUpdate(index, 'retries', parseInt(e.target.value) || 3)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {isEditMode ? 'Edit AAA Policy' : 'Create AAA Policy'}
          </DialogTitle>
          <DialogDescription>
            Configure RADIUS authentication and accounting settings for 802.1X/EAP.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="auth-servers">
              Auth Servers
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
                {formData.authServers.filter(s => s.host).length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="acct-servers">
              Acct Servers
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
                {formData.acctServers.filter(s => s.host).length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="options">Options</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Policy Name *</Label>
              <Input
                placeholder="Enter policy name"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>NAI Routing</Label>
                <p className="text-xs text-muted-foreground">Enable Network Access Identifier routing</p>
              </div>
              <Switch
                checked={formData.naiRouting}
                onCheckedChange={checked => setFormData(prev => ({ ...prev, naiRouting: checked }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Authentication Protocol</Label>
              <Select
                value={formData.authenticationProtocol}
                onValueChange={(value: AuthenticationProtocol) => 
                  setFormData(prev => ({ ...prev, authenticationProtocol: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAP">PAP</SelectItem>
                  <SelectItem value="CHAP">CHAP</SelectItem>
                  <SelectItem value="MS-CHAP">MS-CHAP</SelectItem>
                  <SelectItem value="MS-CHAP2">MS-CHAP2</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>NAS ID</Label>
              <Input
                placeholder="Enter NAS Identifier (optional)"
                value={formData.nasId}
                onChange={e => setFormData(prev => ({ ...prev, nasId: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Called Station ID Format</Label>
              <Select
                value={formData.calledStationId}
                onValueChange={(value: CalledStationIdFormat) => 
                  setFormData(prev => ({ ...prev, calledStationId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WIRED_MAC_COLON_SSID">WIRED_MAC_COLON_SSID</SelectItem>
                  <SelectItem value="BSSID">BSSID</SelectItem>
                  <SelectItem value="SITE_NAME">SITE_NAME</SelectItem>
                  <SelectItem value="SITE_NAME_COLON_DEVICE_GROUP_NAME">SITE_NAME:DEVICE_GROUP_NAME</SelectItem>
                  <SelectItem value="SERIAL">SERIAL</SelectItem>
                  <SelectItem value="SITE_CAMPUS">SITE_CAMPUS</SelectItem>
                  <SelectItem value="SITE_REGION">SITE_REGION</SelectItem>
                  <SelectItem value="SITE_CITY">SITE_CITY</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="auth-servers" className="mt-4">
            <div className="space-y-3">
              {formData.authServers.map((server, index) => 
                renderServerCard(
                  server, 
                  index, 
                  'auth', 
                  updateAuthServer, 
                  removeAuthServer,
                  formData.authServers.length > 1
                )
              )}
              <Button
                variant="outline"
                onClick={addAuthServer}
                disabled={formData.authServers.length >= 4}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Authentication Server
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="acct-servers" className="mt-4">
            <div className="space-y-3">
              {formData.acctServers.map((server, index) => 
                renderServerCard(
                  server, 
                  index, 
                  'acct', 
                  updateAcctServer, 
                  removeAcctServer,
                  true
                )
              )}
              <Button
                variant="outline"
                onClick={addAcctServer}
                disabled={formData.acctServers.length >= 4}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Accounting Server
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="options" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Accounting Type</Label>
              <Select
                value={formData.accountingType}
                onValueChange={(value: AccountingType) => 
                  setFormData(prev => ({ ...prev, accountingType: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="START-INTERIM-STOP">START-INTERIM-STOP</SelectItem>
                  <SelectItem value="START-STOP">START-STOP</SelectItem>
                  <SelectItem value="INTERIM-UPDATE">INTERIM-UPDATE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Accounting Interim Interval (seconds)</Label>
              <Input
                type="number"
                value={formData.accountingInterimInterval}
                onChange={e => setFormData(prev => ({ 
                  ...prev, 
                  accountingInterimInterval: parseInt(e.target.value) || 300 
                }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Authentication Servers Mode</Label>
              <Select
                value={formData.radiusAuthServersMode}
                onValueChange={(value: RADIUSServersMode) => 
                  setFormData(prev => ({ ...prev, radiusAuthServersMode: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Failover">Failover</SelectItem>
                  <SelectItem value="Load-Balance">Load Balance</SelectItem>
                  <SelectItem value="Broadcast">Broadcast</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Accounting Servers Mode</Label>
              <Select
                value={formData.radiusAcctServersMode}
                onValueChange={(value: RADIUSServersMode) => 
                  setFormData(prev => ({ ...prev, radiusAcctServersMode: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Failover">Failover</SelectItem>
                  <SelectItem value="Load-Balance">Load Balance</SelectItem>
                  <SelectItem value="Broadcast">Broadcast</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Event Timestamp</Label>
                <p className="text-xs text-muted-foreground">Include event timestamp in RADIUS packets</p>
              </div>
              <Switch
                checked={formData.eventTimestamp}
                onCheckedChange={checked => setFormData(prev => ({ ...prev, eventTimestamp: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Include Framed IP</Label>
                <p className="text-xs text-muted-foreground">Include Framed-IP-Address attribute</p>
              </div>
              <Switch
                checked={formData.includeFramedIp}
                onCheckedChange={checked => setFormData(prev => ({ ...prev, includeFramedIp: checked }))}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving...' : (isEditMode ? 'Update Policy' : 'Create Policy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
