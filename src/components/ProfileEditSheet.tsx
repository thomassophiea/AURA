import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Switch } from './ui/switch';
import { apiService } from '../services/api';
import { toast } from 'sonner';

export interface DeviceProfile {
  id: string;
  name: string;
  hostname?: string;
  description?: string;
  type?: 'DEFAULT' | 'DEVICE';
  apPlatform?: string;
  radio1?: { adminMode?: boolean; rfControl?: string; fixedChannel?: string; maxTxPower?: string };
  radio2?: { adminMode?: boolean; rfControl?: string; fixedChannel?: string; maxTxPower?: string };
  radio3?: { adminMode?: boolean; rfControl?: string; fixedChannel?: string; maxTxPower?: string };
  mgmtVlanId?: string;
  staticMtu?: string;
  enableSsh?: boolean;
  ledStatus?: boolean;
  adoptionPreference?: string;
  usbPower?: boolean;
  peapUsername?: string;
  peapPassword?: string;
  enforceManufacturingCert?: boolean;
}

interface ProfileEditSheetProps {
  profile: DeviceProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const DEFAULT_FORM = {
  name: '', hostname: '', description: '', type: 'DEFAULT', apPlatform: '',
  radio1AdminMode: true, radio2AdminMode: true, radio3AdminMode: false,
  radio1RfControl: 'RRM', radio2RfControl: 'RRM', radio3RfControl: 'RRM',
  radio1FixedChannel: '', radio2FixedChannel: '', radio3FixedChannel: '',
  radio1MaxTxPower: '', radio2MaxTxPower: '', radio3MaxTxPower: '',
  mgmtVlanId: '', staticMtu: '', enableSsh: false, ledStatus: true,
  adoptionPreference: 'CLOUD', usbPower: true,
  peapUsername: 'NA', peapPassword: 'NA', enforceManufacturingCert: false,
};

export function ProfileEditSheet({ profile, open, onOpenChange, onSaved }: ProfileEditSheetProps) {
  const isEditing = !!profile;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...DEFAULT_FORM });

  useEffect(() => {
    if (!open) return;
    if (profile) {
      setForm({
        name: profile.name || '',
        hostname: profile.hostname || '',
        description: profile.description || '',
        type: profile.type || 'DEFAULT',
        apPlatform: profile.apPlatform || '',
        radio1AdminMode: profile.radio1?.adminMode !== false,
        radio2AdminMode: profile.radio2?.adminMode !== false,
        radio3AdminMode: profile.radio3?.adminMode || false,
        radio1RfControl: profile.radio1?.rfControl || 'RRM',
        radio2RfControl: profile.radio2?.rfControl || 'RRM',
        radio3RfControl: profile.radio3?.rfControl || 'RRM',
        radio1FixedChannel: profile.radio1?.fixedChannel || '',
        radio2FixedChannel: profile.radio2?.fixedChannel || '',
        radio3FixedChannel: profile.radio3?.fixedChannel || '',
        radio1MaxTxPower: profile.radio1?.maxTxPower || '',
        radio2MaxTxPower: profile.radio2?.maxTxPower || '',
        radio3MaxTxPower: profile.radio3?.maxTxPower || '',
        mgmtVlanId: profile.mgmtVlanId || '',
        staticMtu: profile.staticMtu || '',
        enableSsh: profile.enableSsh || false,
        ledStatus: profile.ledStatus !== false,
        adoptionPreference: profile.adoptionPreference || 'CLOUD',
        usbPower: profile.usbPower !== false,
        peapUsername: profile.peapUsername || 'NA',
        peapPassword: profile.peapPassword || 'NA',
        enforceManufacturingCert: profile.enforceManufacturingCert || false,
      });
    } else {
      setForm({ ...DEFAULT_FORM });
    }
  }, [open, profile]);

  const setField = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Profile name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        hostname: form.hostname.trim(),
        description: form.description.trim(),
        type: form.type,
        apPlatform: form.type === 'DEVICE' ? form.apPlatform : undefined,
        radio1: {
          adminMode: form.radio1AdminMode,
          rfControl: form.radio1RfControl,
          fixedChannel: form.radio1RfControl === 'FIXED' ? form.radio1FixedChannel : undefined,
          maxTxPower: form.radio1RfControl === 'FIXED' ? form.radio1MaxTxPower : undefined,
        },
        radio2: {
          adminMode: form.radio2AdminMode,
          rfControl: form.radio2RfControl,
          fixedChannel: form.radio2RfControl === 'FIXED' ? form.radio2FixedChannel : undefined,
          maxTxPower: form.radio2RfControl === 'FIXED' ? form.radio2MaxTxPower : undefined,
        },
        radio3: {
          adminMode: form.radio3AdminMode,
          rfControl: form.radio3RfControl,
          fixedChannel: form.radio3RfControl === 'FIXED' ? form.radio3FixedChannel : undefined,
          maxTxPower: form.radio3RfControl === 'FIXED' ? form.radio3MaxTxPower : undefined,
        },
        mgmtVlanId: form.mgmtVlanId || undefined,
        staticMtu: form.staticMtu || undefined,
        enableSsh: form.enableSsh,
        ledStatus: form.ledStatus,
        adoptionPreference: form.adoptionPreference,
        usbPower: form.usbPower,
        peapUsername: form.peapUsername,
        peapPassword: form.peapPassword,
        enforceManufacturingCert: form.enforceManufacturingCert,
      };
      if (isEditing) {
        await apiService.updateProfile(profile.id, payload);
        toast.success(`Updated "${form.name}"`);
      } else {
        await apiService.createProfile(payload);
        toast.success(`Created "${form.name}"`);
      }
      onSaved();
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  interface RadioDescriptor {
    label: string;
    adminKey: keyof typeof DEFAULT_FORM;
    rfKey: keyof typeof DEFAULT_FORM;
    chanKey: keyof typeof DEFAULT_FORM;
    powerKey: keyof typeof DEFAULT_FORM;
  }

  const radios: RadioDescriptor[] = [
    {
      label: '2.4 GHz (Radio 1)',
      adminKey: 'radio1AdminMode',
      rfKey: 'radio1RfControl',
      chanKey: 'radio1FixedChannel',
      powerKey: 'radio1MaxTxPower',
    },
    {
      label: '5 GHz (Radio 2)',
      adminKey: 'radio2AdminMode',
      rfKey: 'radio2RfControl',
      chanKey: 'radio2FixedChannel',
      powerKey: 'radio2MaxTxPower',
    },
    {
      label: '6 GHz (Radio 3)',
      adminKey: 'radio3AdminMode',
      rfKey: 'radio3RfControl',
      chanKey: 'radio3FixedChannel',
      powerKey: 'radio3MaxTxPower',
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? `Edit: ${profile?.name}` : 'New Device Profile'}</SheetTitle>
          <SheetDescription>
            Site Default profiles apply to all APs at a site. Device profiles are model-specific
            overrides.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          <Tabs defaultValue="header">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="header">Header</TabsTrigger>
              <TabsTrigger value="radios">Radios</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            {/* Header Tab */}
            <TabsContent value="header" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.name}
                  onChange={e => setField('name', e.target.value)}
                  placeholder="Profile name"
                />
              </div>
              <div className="space-y-2">
                <Label>Hostname</Label>
                <Input
                  value={form.hostname}
                  onChange={e => setField('hostname', e.target.value)}
                  placeholder="Optional hostname template"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={e => setField('description', e.target.value)}
                  placeholder="Optional description"
                />
              </div>
              <div className="space-y-2">
                <Label>Profile Type</Label>
                <Select value={form.type} onValueChange={v => setField('type', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEFAULT">Site Default (all APs)</SelectItem>
                    <SelectItem value="DEVICE">Device Profile (model-specific)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.type === 'DEVICE' && (
                <div className="space-y-2">
                  <Label>AP Platform</Label>
                  <Input
                    value={form.apPlatform}
                    onChange={e => setField('apPlatform', e.target.value)}
                    placeholder="e.g. AP5020"
                  />
                  <p className="text-xs text-muted-foreground">
                    Exact AP model this profile applies to (e.g. AP5020, AP410C)
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Radios Tab */}
            <TabsContent value="radios" className="space-y-4 mt-4">
              {radios.map(radio => (
                <div key={radio.label} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="font-medium">{radio.label}</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Admin Mode</span>
                      <Switch
                        checked={form[radio.adminKey] as boolean}
                        onCheckedChange={v => setField(radio.adminKey, v)}
                      />
                    </div>
                  </div>
                  {form[radio.adminKey] && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm">RF Control Mode</Label>
                        <Select
                          value={form[radio.rfKey] as string}
                          onValueChange={v => setField(radio.rfKey, v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="RRM">RF Management Policy (RRM)</SelectItem>
                            <SelectItem value="FIXED">Fixed Channel</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {form[radio.rfKey] === 'FIXED' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label className="text-sm">Fixed Channel</Label>
                            <Input
                              value={form[radio.chanKey] as string}
                              onChange={e => setField(radio.chanKey, e.target.value)}
                              placeholder="e.g. 36"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Max Tx Power (dBm)</Label>
                            <Input
                              value={form[radio.powerKey] as string}
                              onChange={e => setField(radio.powerKey, e.target.value)}
                              placeholder="e.g. 20"
                            />
                          </div>
                        </div>
                      )}
                      {form[radio.rfKey] === 'RRM' && (
                        <p className="text-xs text-muted-foreground">
                          Channel and Tx Power controlled by RF Management Policy (RRM)
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </TabsContent>

            {/* Advanced Tab */}
            <TabsContent value="advanced" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Management VLAN ID</Label>
                  <Input
                    value={form.mgmtVlanId}
                    onChange={e => setField('mgmtVlanId', e.target.value)}
                    placeholder="e.g. 1"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Static MTU</Label>
                  <Input
                    value={form.staticMtu}
                    onChange={e => setField('staticMtu', e.target.value)}
                    placeholder="e.g. 1500"
                  />
                </div>
              </div>
              <div className="space-y-3">
                {(
                  [
                    { label: 'Enable SSH', key: 'enableSsh' },
                    { label: 'LED Status', key: 'ledStatus' },
                    { label: 'USB Power', key: 'usbPower' },
                    { label: 'Enforce Manufacturing Certificate', key: 'enforceManufacturingCert' },
                  ] as { label: string; key: keyof typeof DEFAULT_FORM }[]
                ).map(({ label, key }) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label>{label}</Label>
                    <Switch checked={form[key] as boolean} onCheckedChange={v => setField(key, v)} />
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <Label>Adoption Preference</Label>
                <Select
                  value={form.adoptionPreference}
                  onValueChange={v => setField('adoptionPreference', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLOUD">Cloud</SelectItem>
                    <SelectItem value="LOCAL">Local</SelectItem>
                    <SelectItem value="AUTO">Auto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>PEAP Username</Label>
                  <Select
                    value={form.peapUsername}
                    onValueChange={v => setField('peapUsername', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NA">N/A</SelectItem>
                      <SelectItem value="NAME">Name</SelectItem>
                      <SelectItem value="SERIAL">Serial</SelectItem>
                      <SelectItem value="MAC">MAC</SelectItem>
                      <SelectItem value="CUSTOM">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>PEAP Password</Label>
                  <Select
                    value={form.peapPassword}
                    onValueChange={v => setField('peapPassword', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NA">N/A</SelectItem>
                      <SelectItem value="NAME">Name</SelectItem>
                      <SelectItem value="SERIAL">Serial</SelectItem>
                      <SelectItem value="MAC">MAC</SelectItem>
                      <SelectItem value="CUSTOM">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEditing ? 'Update Profile' : 'Create Profile'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
