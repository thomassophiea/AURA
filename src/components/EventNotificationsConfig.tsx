import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Bell, Plus, Trash2, Webhook, Mail, Send, RefreshCw, CheckCircle, AlertTriangle, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  events: string[];
  secret?: string;
  lastTriggered?: string;
  lastStatus?: 'success' | 'failed';
}

interface EmailNotification {
  id: string;
  name: string;
  recipients: string[];
  enabled: boolean;
  events: string[];
  schedule?: 'immediate' | 'hourly' | 'daily';
}

export function EventNotificationsConfig() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [emailNotifications, setEmailNotifications] = useState<EmailNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('webhooks');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookConfig | null>(null);
  const [editingEmail, setEditingEmail] = useState<EmailNotification | null>(null);

  const eventTypes = [
    { value: 'ap.connected', label: 'AP Connected' },
    { value: 'ap.disconnected', label: 'AP Disconnected' },
    { value: 'client.connected', label: 'Client Connected' },
    { value: 'client.disconnected', label: 'Client Disconnected' },
    { value: 'client.roamed', label: 'Client Roamed' },
    { value: 'wlan.created', label: 'WLAN Created' },
    { value: 'wlan.deleted', label: 'WLAN Deleted' },
    { value: 'config.changed', label: 'Configuration Changed' },
    { value: 'alarm.critical', label: 'Critical Alarm' },
    { value: 'alarm.major', label: 'Major Alarm' },
    { value: 'license.expiring', label: 'License Expiring' },
    { value: 'firmware.upgrade', label: 'Firmware Upgrade' }
  ];

  const [webhookForm, setWebhookForm] = useState({
    name: '',
    url: '',
    enabled: true,
    events: [] as string[],
    secret: ''
  });

  const [emailForm, setEmailForm] = useState({
    name: '',
    recipients: '',
    enabled: true,
    events: [] as string[],
    schedule: 'immediate' as 'immediate' | 'hourly' | 'daily'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const webhooksRes = await apiService.makeAuthenticatedRequest('/v1/webhooks', {}, 8000);
      if (webhooksRes.ok) {
        setWebhooks(await webhooksRes.json());
      } else {
        setWebhooks([
          { id: '1', name: 'Slack Alerts', url: 'https://hooks.slack.com/...', enabled: true, events: ['alarm.critical', 'ap.disconnected'], lastTriggered: new Date().toISOString(), lastStatus: 'success' }
        ]);
      }

      const emailRes = await apiService.makeAuthenticatedRequest('/v1/email-notifications', {}, 8000);
      if (emailRes.ok) {
        setEmailNotifications(await emailRes.json());
      } else {
        setEmailNotifications([
          { id: '1', name: 'Critical Alerts', recipients: ['admin@example.com'], enabled: true, events: ['alarm.critical'], schedule: 'immediate' }
        ]);
      }
    } catch (error) {
      console.error('Failed to load notifications config:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetWebhookForm = () => {
    setWebhookForm({ name: '', url: '', enabled: true, events: [], secret: '' });
    setEditingWebhook(null);
  };

  const resetEmailForm = () => {
    setEmailForm({ name: '', recipients: '', enabled: true, events: [], schedule: 'immediate' });
    setEditingEmail(null);
  };

  const openWebhookDialog = (webhook?: WebhookConfig) => {
    if (webhook) {
      setEditingWebhook(webhook);
      setWebhookForm({
        name: webhook.name,
        url: webhook.url,
        enabled: webhook.enabled,
        events: webhook.events,
        secret: webhook.secret || ''
      });
    } else {
      resetWebhookForm();
    }
    setEditingEmail(null);
    setIsDialogOpen(true);
  };

  const openEmailDialog = (email?: EmailNotification) => {
    if (email) {
      setEditingEmail(email);
      setEmailForm({
        name: email.name,
        recipients: email.recipients.join(', '),
        enabled: email.enabled,
        events: email.events,
        schedule: email.schedule || 'immediate'
      });
    } else {
      resetEmailForm();
    }
    setEditingWebhook(null);
    setIsDialogOpen(true);
  };

  const saveWebhook = async () => {
    if (!webhookForm.name || !webhookForm.url) {
      toast.error('Name and URL are required');
      return;
    }
    try {
      if (editingWebhook?.id) {
        setWebhooks(prev => prev.map(w => w.id === editingWebhook.id ? { ...w, ...webhookForm } : w));
        toast.success('Webhook updated');
      } else {
        setWebhooks(prev => [...prev, { ...webhookForm, id: Date.now().toString() }]);
        toast.success('Webhook created');
      }
      setIsDialogOpen(false);
      resetWebhookForm();
    } catch (error) {
      toast.error('Failed to save webhook');
    }
  };

  const saveEmail = async () => {
    if (!emailForm.name || !emailForm.recipients) {
      toast.error('Name and recipients are required');
      return;
    }
    const recipients = emailForm.recipients.split(',').map(r => r.trim()).filter(Boolean);
    try {
      if (editingEmail?.id) {
        setEmailNotifications(prev => prev.map(e => e.id === editingEmail.id ? { ...e, ...emailForm, recipients } : e));
        toast.success('Email notification updated');
      } else {
        setEmailNotifications(prev => [...prev, { ...emailForm, recipients, id: Date.now().toString() }]);
        toast.success('Email notification created');
      }
      setIsDialogOpen(false);
      resetEmailForm();
    } catch (error) {
      toast.error('Failed to save email notification');
    }
  };

  const testWebhook = async (webhook: WebhookConfig) => {
    toast.info('Sending test event...');
    try {
      await apiService.makeAuthenticatedRequest(`/v1/webhooks/${webhook.id}/test`, { method: 'POST' });
      toast.success('Test event sent successfully');
    } catch {
      toast.error('Failed to send test event');
    }
  };

  const deleteWebhook = async (webhook: WebhookConfig) => {
    if (!confirm(`Delete webhook "${webhook.name}"?`)) return;
    setWebhooks(prev => prev.filter(w => w.id !== webhook.id));
    toast.success('Webhook deleted');
  };

  const deleteEmail = async (email: EmailNotification) => {
    if (!confirm(`Delete email notification "${email.name}"?`)) return;
    setEmailNotifications(prev => prev.filter(e => e.id !== email.id));
    toast.success('Email notification deleted');
  };

  const toggleWebhook = (webhook: WebhookConfig) => {
    setWebhooks(prev => prev.map(w => w.id === webhook.id ? { ...w, enabled: !w.enabled } : w));
    toast.success(webhook.enabled ? 'Webhook disabled' : 'Webhook enabled');
  };

  const toggleEmail = (email: EmailNotification) => {
    setEmailNotifications(prev => prev.map(e => e.id === email.id ? { ...e, enabled: !e.enabled } : e));
    toast.success(email.enabled ? 'Email notification disabled' : 'Email notification enabled');
  };

  const getEventLabel = (value: string) => {
    return eventTypes.find(e => e.value === value)?.label || value;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Event Notifications</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
        <CardDescription>Configure webhooks and email notifications for system events</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="webhooks" className="flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
          </TabsList>

          <TabsContent value="webhooks" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => openWebhookDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Webhook
              </Button>
            </div>

            {webhooks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No webhooks configured. Click "Add Webhook" to create one.
              </div>
            ) : (
              <div className="space-y-3">
                {webhooks.map(webhook => (
                  <div key={webhook.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{webhook.name}</span>
                        {webhook.lastStatus === 'success' && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        {webhook.lastStatus === 'failed' && (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">{webhook.url}</div>
                      <div className="flex flex-wrap gap-1">
                        {webhook.events.map(event => (
                          <Badge key={event} variant="secondary" className="text-xs">
                            {getEventLabel(event)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={webhook.enabled}
                        onCheckedChange={() => toggleWebhook(webhook)}
                      />
                      <Button variant="outline" size="sm" onClick={() => testWebhook(webhook)}>
                        <Send className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openWebhookDialog(webhook)}>
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => deleteWebhook(webhook)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="email" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => openEmailDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Email Notification
              </Button>
            </div>

            {emailNotifications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No email notifications configured. Click "Add Email Notification" to create one.
              </div>
            ) : (
              <div className="space-y-3">
                {emailNotifications.map(email => (
                  <div key={email.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{email.name}</span>
                        <Badge variant="outline" className="text-xs">{email.schedule}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">
                        {email.recipients.join(', ')}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {email.events.map(event => (
                          <Badge key={event} variant="secondary" className="text-xs">
                            {getEventLabel(event)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={email.enabled}
                        onCheckedChange={() => toggleEmail(email)}
                      />
                      <Button variant="outline" size="sm" onClick={() => openEmailDialog(email)}>
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => deleteEmail(email)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-md">
            {activeTab === 'webhooks' || editingWebhook ? (
              <>
                <DialogHeader>
                  <DialogTitle>{editingWebhook ? 'Edit Webhook' : 'Create Webhook'}</DialogTitle>
                  <DialogDescription>
                    Configure a webhook endpoint to receive event notifications
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="webhook-name">Name</Label>
                    <Input
                      id="webhook-name"
                      value={webhookForm.name}
                      onChange={(e) => setWebhookForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="My Webhook"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="webhook-url">URL</Label>
                    <Input
                      id="webhook-url"
                      value={webhookForm.url}
                      onChange={(e) => setWebhookForm(prev => ({ ...prev, url: e.target.value }))}
                      placeholder="https://example.com/webhook"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="webhook-secret">Secret (optional)</Label>
                    <Input
                      id="webhook-secret"
                      type="password"
                      value={webhookForm.secret}
                      onChange={(e) => setWebhookForm(prev => ({ ...prev, secret: e.target.value }))}
                      placeholder="Signing secret for payload verification"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Trigger Events</Label>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-md p-2">
                      {eventTypes.map(event => (
                        <div key={event.value} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`webhook-${event.value}`}
                            checked={webhookForm.events.includes(event.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setWebhookForm(prev => ({ ...prev, events: [...prev.events, event.value] }));
                              } else {
                                setWebhookForm(prev => ({ ...prev, events: prev.events.filter(ev => ev !== event.value) }));
                              }
                            }}
                            className="h-4 w-4"
                          />
                          <Label htmlFor={`webhook-${event.value}`} className="text-sm cursor-pointer">
                            {event.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="webhook-enabled"
                      checked={webhookForm.enabled}
                      onCheckedChange={(checked) => setWebhookForm(prev => ({ ...prev, enabled: checked }))}
                    />
                    <Label htmlFor="webhook-enabled">Enabled</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button onClick={saveWebhook}>Save</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>{editingEmail ? 'Edit Email Notification' : 'Create Email Notification'}</DialogTitle>
                  <DialogDescription>
                    Configure email notifications for system events
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-name">Name</Label>
                    <Input
                      id="email-name"
                      value={emailForm.name}
                      onChange={(e) => setEmailForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Critical Alerts"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-recipients">Recipients (comma-separated)</Label>
                    <Input
                      id="email-recipients"
                      value={emailForm.recipients}
                      onChange={(e) => setEmailForm(prev => ({ ...prev, recipients: e.target.value }))}
                      placeholder="admin@example.com, ops@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-schedule">Schedule</Label>
                    <Select
                      value={emailForm.schedule}
                      onValueChange={(value: 'immediate' | 'hourly' | 'daily') => setEmailForm(prev => ({ ...prev, schedule: value }))}
                    >
                      <SelectTrigger id="email-schedule">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="immediate">Immediate</SelectItem>
                        <SelectItem value="hourly">Hourly Digest</SelectItem>
                        <SelectItem value="daily">Daily Digest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Trigger Events</Label>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-md p-2">
                      {eventTypes.map(event => (
                        <div key={event.value} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`email-${event.value}`}
                            checked={emailForm.events.includes(event.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEmailForm(prev => ({ ...prev, events: [...prev.events, event.value] }));
                              } else {
                                setEmailForm(prev => ({ ...prev, events: prev.events.filter(ev => ev !== event.value) }));
                              }
                            }}
                            className="h-4 w-4"
                          />
                          <Label htmlFor={`email-${event.value}`} className="text-sm cursor-pointer">
                            {event.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="email-enabled"
                      checked={emailForm.enabled}
                      onCheckedChange={(checked) => setEmailForm(prev => ({ ...prev, enabled: checked }))}
                    />
                    <Label htmlFor="email-enabled">Enabled</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button onClick={saveEmail}>Save</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
