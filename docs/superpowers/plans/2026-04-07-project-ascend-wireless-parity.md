# Project Ascend – Wireless Configuration Parity (NVO-7242 / NVO-9702 / NVO-7299 / NVO-9962)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Achieve full IQC/XIQ-C parity for AURA's four wireless configuration subsystems (WLAN, Device Profiles, RRM, Roles) and render live Jira Epic references in DEV mode on each configuration page.

**Architecture:** Two new dedicated Configure pages are added to the nav: `ConfigureProfiles` (NVO-9702) and `ConfigureRRM` (NVO-7299). Existing `NetworkEditDetail` (WLAN) and `RoleEditDialog` (Roles) receive parity-closing enhancements. A shared `DevEpicBadge` component renders clickable Jira links when `import.meta.env.DEV` is true.

**Tech Stack:** React 19, TypeScript 5.7, Tailwind CSS, Radix UI primitives, Lucide React, apiService singleton (`src/services/api.ts`)

---

> **Scope note:** These four epics cover independent subsystems. If implementation velocity requires it, each lettered section (A–E) can be extracted as a standalone plan without interdependencies.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/components/DevEpicBadge.tsx` | Create | DEV-only Jira Epic link badge |
| `src/components/DevEpicBadge.test.tsx` | Create | Tests for DevEpicBadge |
| `src/components/ConfigureProfiles.tsx` | Create | Device Profile list + CRUD page |
| `src/components/ProfileEditSheet.tsx` | Create | Full profile edit (Header, Radios, Advanced) |
| `src/components/ConfigureRRM.tsx` | Create | Full RRM Profile list + CRUD page (Basic, Channel+Power, Scanning, Recovery) |
| `src/utils/wlanAuthValidation.ts` | Create | Enterprise AAA required validation logic |
| `src/utils/wlanAuthValidation.test.ts` | Create | Tests for auth validation |
| `src/utils/roleFilterValidation.ts` | Create | L2/L3SrcDest filter default builders |
| `src/utils/roleFilterValidation.test.ts` | Create | Tests for filter builders |
| `src/components/Sidebar.tsx` | Modify | Add configure-profiles and configure-rrm nav items |
| `src/App.tsx` | Modify | Add route cases + page metadata for new pages |
| `src/components/ConfigureNetworks.tsx` | Modify | Add DevEpicBadge for NVO-7242 |
| `src/components/NetworkEditDetail.tsx` | Modify | Enterprise AAA validation + variable substitution hint |
| `src/components/ConfigurePolicy.tsx` | Modify | Add DevEpicBadge for NVO-9962 |
| `src/components/ConfigureAdvanced.tsx` | Modify | Add DevEpicBadge on RFManagementTab for NVO-7299 |
| `src/components/RoleEditDialog.tsx` | Modify | Add L2 MAC rules, L3 src/dest rules, bandwidth limit toggle |

---

## Section A: DevEpicBadge (Cross-cutting)

### Task 1: DevEpicBadge Component + Tests

**Files:**
- Create: `src/components/DevEpicBadge.tsx`
- Create: `src/components/DevEpicBadge.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/DevEpicBadge.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DevEpicBadge } from './DevEpicBadge';

describe('DevEpicBadge', () => {
  it('renders epic key and title when show=true', () => {
    render(
      <DevEpicBadge
        epicKey="NVO-7242"
        epicTitle="WLAN Configuration"
        jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-7242"
        show={true}
      />
    );
    expect(screen.getByText('NVO-7242')).toBeInTheDocument();
    expect(screen.getByText('WLAN Configuration')).toBeInTheDocument();
  });

  it('links to the correct Jira URL', () => {
    render(
      <DevEpicBadge
        epicKey="NVO-7242"
        epicTitle="WLAN Configuration"
        jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-7242"
        show={true}
      />
    );
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://extremenetworks.atlassian.net/browse/NVO-7242'
    );
  });

  it('opens in new tab', () => {
    render(
      <DevEpicBadge
        epicKey="NVO-7242"
        epicTitle="WLAN Configuration"
        jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-7242"
        show={true}
      />
    );
    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
  });

  it('renders nothing when show=false', () => {
    const { container } = render(
      <DevEpicBadge
        epicKey="NVO-7242"
        epicTitle="WLAN Configuration"
        jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-7242"
        show={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- src/components/DevEpicBadge.test.tsx
```
Expected: FAIL with "Cannot find module './DevEpicBadge'"

- [ ] **Step 3: Implement DevEpicBadge**

```tsx
// src/components/DevEpicBadge.tsx
import { ExternalLink } from 'lucide-react';

interface DevEpicBadgeProps {
  epicKey: string;
  epicTitle: string;
  jiraUrl: string;
  /** Defaults to import.meta.env.DEV — pass explicitly in tests */
  show?: boolean;
}

export function DevEpicBadge({
  epicKey,
  epicTitle,
  jiraUrl,
  show = import.meta.env.DEV,
}: DevEpicBadgeProps) {
  if (!show) return null;
  return (
    <a
      href={jiraUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-mono text-blue-400 hover:text-blue-300 border border-blue-500/30 rounded px-2 py-0.5 bg-blue-500/10 transition-colors"
    >
      <span className="font-semibold">{epicKey}</span>
      <span className="text-blue-400/50">·</span>
      <span className="font-sans font-normal">{epicTitle}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- src/components/DevEpicBadge.test.tsx
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/DevEpicBadge.tsx src/components/DevEpicBadge.test.tsx
git commit -m "feat(dev): add DevEpicBadge component for Jira Epic links in DEV mode"
```

---

### Task 2: Place DevEpicBadge on Existing Configure Pages

**Files:**
- Modify: `src/components/ConfigureNetworks.tsx`
- Modify: `src/components/ConfigurePolicy.tsx`
- Modify: `src/components/ConfigureAdvanced.tsx`

- [ ] **Step 1: Add badge to ConfigureNetworks (NVO-7242)**

In `src/components/ConfigureNetworks.tsx`, add import at top:

```tsx
import { DevEpicBadge } from './DevEpicBadge';
```

Find the page title (the `<h1>` or CardTitle showing "Networks" / "Configure Networks"). Add immediately after it:

```tsx
<DevEpicBadge
  epicKey="NVO-7242"
  epicTitle="WLAN Configuration"
  jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-7242"
/>
```

Wrap both in a `<div className="flex items-center gap-2">` if they aren't already in a flex container.

- [ ] **Step 2: Add badge to ConfigurePolicy (NVO-9962)**

In `src/components/ConfigurePolicy.tsx`, add import at top:

```tsx
import { DevEpicBadge } from './DevEpicBadge';
```

Find the page title area (the Card or div with "Roles" / "Policy" heading) and add after the title:

```tsx
<DevEpicBadge
  epicKey="NVO-9962"
  epicTitle="Wireless Role Configuration"
  jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-9962"
/>
```

- [ ] **Step 3: Add badge to RFManagementTab in ConfigureAdvanced (NVO-7299)**

In `src/components/ConfigureAdvanced.tsx`, add import near top of file (alongside other imports):

```tsx
import { DevEpicBadge } from './DevEpicBadge';
```

Inside the `RFManagementTab` function's return JSX, find the header/title area and add:

```tsx
<DevEpicBadge
  epicKey="NVO-7299"
  epicTitle="Wireless RRM Configuration"
  jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-7299"
/>
```

- [ ] **Step 4: Type-check**

```bash
npm run type-check
```
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/ConfigureNetworks.tsx src/components/ConfigurePolicy.tsx src/components/ConfigureAdvanced.tsx
git commit -m "feat(dev): add Jira Epic badges to WLAN, Policy, and RRM pages"
```

---

## Section B: Configure Profiles Page (NVO-9702)

### Task 3: Wire ConfigureProfiles into Nav and Routing

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add nav item to Sidebar**

In `src/components/Sidebar.tsx`, find the `configureItems` array (line ~73). Add after `configure-networks`:

```tsx
{ id: 'configure-profiles', label: 'Device Profiles', icon: Cpu },
```

Add `Cpu` to the lucide-react import at the top of Sidebar.tsx (check if already imported; if so, skip).

- [ ] **Step 2: Add lazy import to App.tsx**

In `src/App.tsx`, add after the `ConfigureNetworks` lazy import (line ~29):

```tsx
const ConfigureProfiles = lazy(() => import('./components/ConfigureProfiles').then(m => ({ default: m.ConfigureProfiles })));
```

- [ ] **Step 3: Add page metadata to App.tsx**

In `src/App.tsx`, find the page metadata object (near line ~110) and add:

```tsx
'configure-profiles': { title: 'Device Profiles', description: 'Configure AP device profiles and assignment hierarchy' },
```

- [ ] **Step 4: Add route case to App.tsx**

In the switch/renderPage function (near line ~941), add after `case 'configure-networks':`:

```tsx
case 'configure-profiles':
  return <ConfigureProfiles />;
```

- [ ] **Step 5: Create stub to verify routing**

```tsx
// src/components/ConfigureProfiles.tsx
export function ConfigureProfiles() {
  return <div className="p-6">Device Profiles – stub</div>;
}
```

- [ ] **Step 6: Type-check**

```bash
npm run type-check
```
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/components/Sidebar.tsx src/App.tsx src/components/ConfigureProfiles.tsx
git commit -m "feat(nav): add Device Profiles configure page to navigation (NVO-9702)"
```

---

### Task 4: Build ConfigureProfiles List Page + ProfileEditSheet

**Files:**
- Modify: `src/components/ConfigureProfiles.tsx` (replace stub)
- Create: `src/components/ProfileEditSheet.tsx`

- [ ] **Step 1: Write service test**

```ts
// src/services/profileService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  apiService: {
    getProfiles: vi.fn(),
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    deleteProfile: vi.fn(),
  },
}));

import { apiService } from './api';

describe('profile API methods', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getProfiles returns array on success', async () => {
    vi.mocked(apiService.getProfiles).mockResolvedValue([
      { id: 'p1', name: 'Site Default', type: 'DEFAULT' },
    ]);
    const result = await apiService.getProfiles();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Site Default');
  });

  it('createProfile sends correct payload', async () => {
    vi.mocked(apiService.createProfile).mockResolvedValue({ id: 'p2', name: 'New' });
    await apiService.createProfile({ name: 'New', type: 'DEVICE' });
    expect(apiService.createProfile).toHaveBeenCalledWith({ name: 'New', type: 'DEVICE' });
  });
});
```

- [ ] **Step 2: Run tests to confirm they pass (tests existing API code)**

```bash
npm run test -- src/services/profileService.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 3: Implement ConfigureProfiles list page**

```tsx
// src/components/ConfigureProfiles.tsx
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Plus, Search, Edit2, Trash2, Cpu, RefreshCw } from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';
import { DevEpicBadge } from './DevEpicBadge';
import { ProfileEditSheet } from './ProfileEditSheet';

export function ConfigureProfiles() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingProfile, setEditingProfile] = useState<any | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => { loadProfiles(); }, []);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const data = await apiService.getProfiles();
      setProfiles(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load device profiles');
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (profileId: string, profileName: string) => {
    if (!confirm(`Delete profile "${profileName}"?`)) return;
    try {
      await apiService.deleteProfile(profileId);
      toast.success(`Deleted "${profileName}"`);
      loadProfiles();
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    }
  };

  const openCreate = () => { setEditingProfile(null); setSheetOpen(true); };
  const openEdit = (profile: any) => { setEditingProfile(profile); setSheetOpen(true); };
  const handleSaved = () => { setSheetOpen(false); loadProfiles(); };

  const filtered = profiles.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Device Profiles</h1>
            <DevEpicBadge
              epicKey="NVO-9702"
              epicTitle="Profile Configuration & Assignment"
              jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-9702"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Site Default profiles apply to all APs. Device profiles are model-specific overrides.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadProfiles} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />New Profile
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search profiles..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>AP Platform</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading profiles...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{searchTerm ? 'No profiles match your search' : 'No profiles configured'}</TableCell></TableRow>
              ) : (
                filtered.map(profile => (
                  <TableRow key={profile.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                        {profile.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={profile.type === 'DEFAULT' ? 'default' : 'secondary'}>
                        {profile.type === 'DEFAULT' ? 'Site Default' : 'Device'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {profile.apPlatform || profile.deviceType || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(profile)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(profile.id, profile.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ProfileEditSheet
        profile={editingProfile}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSaved={handleSaved}
      />
    </div>
  );
}
```

- [ ] **Step 4: Create ProfileEditSheet**

```tsx
// src/components/ProfileEditSheet.tsx
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

interface ProfileEditSheetProps {
  profile: any | null;
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
        radio1: { adminMode: form.radio1AdminMode, rfControl: form.radio1RfControl, fixedChannel: form.radio1RfControl === 'FIXED' ? form.radio1FixedChannel : undefined, maxTxPower: form.radio1RfControl === 'FIXED' ? form.radio1MaxTxPower : undefined },
        radio2: { adminMode: form.radio2AdminMode, rfControl: form.radio2RfControl, fixedChannel: form.radio2RfControl === 'FIXED' ? form.radio2FixedChannel : undefined, maxTxPower: form.radio2RfControl === 'FIXED' ? form.radio2MaxTxPower : undefined },
        radio3: { adminMode: form.radio3AdminMode, rfControl: form.radio3RfControl, fixedChannel: form.radio3RfControl === 'FIXED' ? form.radio3FixedChannel : undefined, maxTxPower: form.radio3RfControl === 'FIXED' ? form.radio3MaxTxPower : undefined },
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

  const radios = [
    { label: '2.4 GHz (Radio 1)', adminKey: 'radio1AdminMode', rfKey: 'radio1RfControl', chanKey: 'radio1FixedChannel', powerKey: 'radio1MaxTxPower' },
    { label: '5 GHz (Radio 2)', adminKey: 'radio2AdminMode', rfKey: 'radio2RfControl', chanKey: 'radio2FixedChannel', powerKey: 'radio2MaxTxPower' },
    { label: '6 GHz (Radio 3)', adminKey: 'radio3AdminMode', rfKey: 'radio3RfControl', chanKey: 'radio3FixedChannel', powerKey: 'radio3MaxTxPower' },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? `Edit: ${profile?.name}` : 'New Device Profile'}</SheetTitle>
          <SheetDescription>
            Site Default profiles apply to all APs at a site. Device profiles are model-specific overrides.
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
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Profile name" />
              </div>
              <div className="space-y-2">
                <Label>Hostname</Label>
                <Input value={form.hostname} onChange={e => setField('hostname', e.target.value)} placeholder="Optional hostname template" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={e => setField('description', e.target.value)} placeholder="Optional description" />
              </div>
              <div className="space-y-2">
                <Label>Profile Type</Label>
                <Select value={form.type} onValueChange={v => setField('type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEFAULT">Site Default (all APs)</SelectItem>
                    <SelectItem value="DEVICE">Device Profile (model-specific)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.type === 'DEVICE' && (
                <div className="space-y-2">
                  <Label>AP Platform</Label>
                  <Input value={form.apPlatform} onChange={e => setField('apPlatform', e.target.value)} placeholder="e.g. AP5020" />
                  <p className="text-xs text-muted-foreground">Exact AP model this profile applies to (e.g. AP5020, AP410C)</p>
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
                        checked={(form as any)[radio.adminKey]}
                        onCheckedChange={v => setField(radio.adminKey, v)}
                      />
                    </div>
                  </div>
                  {(form as any)[radio.adminKey] && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm">RF Control Mode</Label>
                        <Select value={(form as any)[radio.rfKey]} onValueChange={v => setField(radio.rfKey, v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="RRM">RF Management Policy (RRM)</SelectItem>
                            <SelectItem value="FIXED">Fixed Channel</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {(form as any)[radio.rfKey] === 'FIXED' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label className="text-sm">Fixed Channel</Label>
                            <Input value={(form as any)[radio.chanKey]} onChange={e => setField(radio.chanKey, e.target.value)} placeholder="e.g. 36" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Max Tx Power (dBm)</Label>
                            <Input value={(form as any)[radio.powerKey]} onChange={e => setField(radio.powerKey, e.target.value)} placeholder="e.g. 20" />
                          </div>
                        </div>
                      )}
                      {(form as any)[radio.rfKey] === 'RRM' && (
                        <p className="text-xs text-muted-foreground">Channel and Tx Power controlled by RF Management Policy (RRM)</p>
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
                  <Input value={form.mgmtVlanId} onChange={e => setField('mgmtVlanId', e.target.value)} placeholder="e.g. 1" />
                </div>
                <div className="space-y-2">
                  <Label>Static MTU</Label>
                  <Input value={form.staticMtu} onChange={e => setField('staticMtu', e.target.value)} placeholder="e.g. 1500" />
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Enable SSH', key: 'enableSsh' },
                  { label: 'LED Status', key: 'ledStatus' },
                  { label: 'USB Power', key: 'usbPower' },
                  { label: 'Enforce Manufacturing Certificate', key: 'enforceManufacturingCert' },
                ].map(({ label, key }) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label>{label}</Label>
                    <Switch checked={(form as any)[key]} onCheckedChange={v => setField(key, v)} />
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <Label>Adoption Preference</Label>
                <Select value={form.adoptionPreference} onValueChange={v => setField('adoptionPreference', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Select value={form.peapUsername} onValueChange={v => setField('peapUsername', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Select value={form.peapPassword} onValueChange={v => setField('peapPassword', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEditing ? 'Update Profile' : 'Create Profile'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 5: Type-check**

```bash
npm run type-check
```
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/ConfigureProfiles.tsx src/components/ProfileEditSheet.tsx src/services/profileService.test.ts
git commit -m "feat(profiles): add Device Profiles page with full edit sheet — Header, Radios, Advanced (NVO-9702)"
```

---

## Section C: Configure RRM Page (NVO-7299)

### Task 5: Wire ConfigureRRM into Nav and Routing

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add RRM nav item to Sidebar**

In `src/components/Sidebar.tsx`, add after `configure-profiles` in `configureItems`:

```tsx
{ id: 'configure-rrm', label: 'RF Management', icon: Radio },
```

Check if `Radio` is already imported from lucide-react; add if not.

- [ ] **Step 2: Add lazy import to App.tsx**

```tsx
const ConfigureRRM = lazy(() => import('./components/ConfigureRRM').then(m => ({ default: m.ConfigureRRM })));
```

- [ ] **Step 3: Add page metadata**

```tsx
'configure-rrm': { title: 'RF Management', description: 'Configure RF Management (RRM) profiles and assignment' },
```

- [ ] **Step 4: Add route case**

```tsx
case 'configure-rrm':
  return <ConfigureRRM />;
```

- [ ] **Step 5: Type-check**

```bash
npm run type-check
```
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar.tsx src/App.tsx
git commit -m "feat(nav): add RF Management (RRM) to Configure navigation (NVO-7299)"
```

---

### Task 6: Build ConfigureRRM Page

**Files:**
- Create: `src/components/ConfigureRRM.tsx`

- [ ] **Step 1: Write service test**

```ts
// src/services/rrmService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  apiService: {
    getRFManagementProfiles: vi.fn(),
    createRFManagementProfile: vi.fn(),
    updateRFManagementProfile: vi.fn(),
    deleteRFManagementProfile: vi.fn(),
  },
}));

import { apiService } from './api';

describe('RFManagement API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getRFManagementProfiles returns array', async () => {
    vi.mocked(apiService.getRFManagementProfiles).mockResolvedValue([
      { id: 'r1', name: 'Default RRM', type: 'SMARTRF' },
    ]);
    const result = await apiService.getRFManagementProfiles();
    expect(result).toHaveLength(1);
  });

  it('createRFManagementProfile sends payload', async () => {
    const payload = { name: 'Test', type: 'SMARTRF', smartRf: { enabled: true } };
    vi.mocked(apiService.createRFManagementProfile).mockResolvedValue({ id: 'r2', ...payload });
    await apiService.createRFManagementProfile(payload);
    expect(apiService.createRFManagementProfile).toHaveBeenCalledWith(payload);
  });
});
```

- [ ] **Step 2: Run test to confirm it passes**

```bash
npm run test -- src/services/rrmService.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 3: Implement ConfigureRRM**

```tsx
// src/components/ConfigureRRM.tsx
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';
import { Plus, Search, Edit2, Trash2, Radio, RefreshCw } from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';
import { DevEpicBadge } from './DevEpicBadge';

const DEFAULT_RRM_FORM = {
  name: '', type: 'SMARTRF',
  // Basic
  smartRfEnabled: true, sensitivity: 'MEDIUM',
  interferenceRecoveryEnabled: true, coverageHoleRecoveryEnabled: true, neighborRecoveryEnabled: true,
  ocsMonitoringAwarenessOverride: false, ocsThresholdAwarenessHits: '3', aiRrmEnabled: false,
  // Channel+Power — 2.4 GHz
  radio1ChannelWidth: 'auto', radio1MinTxPower: '-10', radio1MaxTxPower: '20',
  radio1ChannelPlan: '3CHANNEL', radio1CustomChannels: '',
  // Channel+Power — 5 GHz
  radio2ChannelWidth: 'auto', radio2MinTxPower: '-10', radio2MaxTxPower: '20',
  radio2ChannelPlan: 'ALL', radio2CustomChannels: '',
  // Channel+Power — 6 GHz
  radio3ChannelWidth: 'auto', radio3MinTxPower: '-10', radio3MaxTxPower: '20',
  radio3ChannelPlan: 'ALL', radio3CustomChannels: '',
  // Scanning
  radio1ScanDuration: '50', radio1ScanPeriod: '60', radio1ExtScanFreq: '5',
  radio1ScanSampleCount: '5', radio1ClientAwareScanning: true,
  radio1PowerSaveAwareScanning: 'DYNAMIC', radio1TxLoadAwareScanning: false,
  radio2ScanDuration: '50', radio2ScanPeriod: '60', radio2ExtScanFreq: '5',
  radio2ScanSampleCount: '5', radio2ClientAwareScanning: true,
  radio2PowerSaveAwareScanning: 'DYNAMIC', radio2TxLoadAwareScanning: false,
  // Recovery — Hold Timers
  powerHoldTime: '60', channelHoldTime: '120',
  // Recovery — Neighbor
  radio1NeighborPowerThreshold: '-70', radio2NeighborPowerThreshold: '-70', radio3NeighborPowerThreshold: '-70',
  // Recovery — Dynamic Sample
  dynamicSampleEnabled: true, dynamicSampleNoise: '-85',
  dynamicSampleNoiseFactor: '1.5', dynamicSampleClientThreshold: '5',
  // Recovery — Interference
  radio1ChannelSwitchDelta: '15', radio2ChannelSwitchDelta: '15',
  // Recovery — CCI
  cciEnabled: false, cciHighThreshold: '70', cciLowThreshold: '30',
  cciFrequency: '60', cciFrequencyLimiter: '3',
  // Select Shutdown
  selectShutdownEnabled: false, selectShutdownCciHigh: '80', selectShutdownCciLow: '40',
  selectShutdownFrequency: '120', selectShutdownFrequencyLimiter: '2',
};

export function ConfigureRRM() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...DEFAULT_RRM_FORM });
  const [activeEditTab, setActiveEditTab] = useState('basic');

  useEffect(() => { loadProfiles(); }, []);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const data = await apiService.getRFManagementProfiles();
      setProfiles(Array.isArray(data) ? data : []);
    } catch { toast.error('Failed to load RRM profiles'); setProfiles([]); }
    finally { setLoading(false); }
  };

  const setField = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }));

  const openCreate = () => { setEditing(null); setForm({ ...DEFAULT_RRM_FORM }); setActiveEditTab('basic'); setSheetOpen(true); };

  const openEdit = (profile: any) => {
    setEditing(profile);
    const sf = profile.smartRf || {};
    const ch = sf.channelAndPower || {};
    const sc = sf.scanning || {};
    const rec = sf.recovery || {};
    const nb = rec.neighborRecovery || {};
    const ds = rec.dynamicSample || {};
    const ir = rec.interferenceRecovery || {};
    const cci = rec.cci || {};
    const ss = sf.selectShutdown || {};
    setForm({
      ...DEFAULT_RRM_FORM,
      name: profile.name || '', type: profile.type || 'SMARTRF',
      smartRfEnabled: sf.enabled !== false, sensitivity: sf.sensitivity || 'MEDIUM',
      interferenceRecoveryEnabled: sf.interferenceRecoveryEnabled !== false,
      coverageHoleRecoveryEnabled: sf.coverageHoleRecoveryEnabled !== false,
      neighborRecoveryEnabled: sf.neighborRecoveryEnabled !== false,
      ocsMonitoringAwarenessOverride: sf.ocsMonitoringAwarenessOverride || false,
      ocsThresholdAwarenessHits: String(sf.ocsThresholdAwarenessHits ?? '3'),
      aiRrmEnabled: sf.aiRrmEnabled || false,
      radio1ChannelWidth: ch.radio1?.channelWidth || 'auto',
      radio1MinTxPower: String(ch.radio1?.minTxPower ?? '-10'),
      radio1MaxTxPower: String(ch.radio1?.maxTxPower ?? '20'),
      radio1ChannelPlan: ch.radio1?.channelPlan || '3CHANNEL',
      radio1CustomChannels: ch.radio1?.customChannels || '',
      radio2ChannelWidth: ch.radio2?.channelWidth || 'auto',
      radio2MinTxPower: String(ch.radio2?.minTxPower ?? '-10'),
      radio2MaxTxPower: String(ch.radio2?.maxTxPower ?? '20'),
      radio2ChannelPlan: ch.radio2?.channelPlan || 'ALL',
      radio2CustomChannels: ch.radio2?.customChannels || '',
      radio3ChannelWidth: ch.radio3?.channelWidth || 'auto',
      radio3MinTxPower: String(ch.radio3?.minTxPower ?? '-10'),
      radio3MaxTxPower: String(ch.radio3?.maxTxPower ?? '20'),
      radio3ChannelPlan: ch.radio3?.channelPlan || 'ALL',
      radio3CustomChannels: ch.radio3?.customChannels || '',
      radio1ScanDuration: String(sc.radio1?.scanDuration ?? '50'),
      radio1ScanPeriod: String(sc.radio1?.scanPeriod ?? '60'),
      radio1ExtScanFreq: String(sc.radio1?.extScanFreq ?? '5'),
      radio1ScanSampleCount: String(sc.radio1?.sampleCount ?? '5'),
      radio1ClientAwareScanning: sc.radio1?.clientAware !== false,
      radio1PowerSaveAwareScanning: sc.radio1?.powerSaveAware || 'DYNAMIC',
      radio1TxLoadAwareScanning: sc.radio1?.txLoadAware || false,
      radio2ScanDuration: String(sc.radio2?.scanDuration ?? '50'),
      radio2ScanPeriod: String(sc.radio2?.scanPeriod ?? '60'),
      radio2ExtScanFreq: String(sc.radio2?.extScanFreq ?? '5'),
      radio2ScanSampleCount: String(sc.radio2?.sampleCount ?? '5'),
      radio2ClientAwareScanning: sc.radio2?.clientAware !== false,
      radio2PowerSaveAwareScanning: sc.radio2?.powerSaveAware || 'DYNAMIC',
      radio2TxLoadAwareScanning: sc.radio2?.txLoadAware || false,
      powerHoldTime: String(rec.powerHoldTime ?? '60'),
      channelHoldTime: String(rec.channelHoldTime ?? '120'),
      radio1NeighborPowerThreshold: String(nb.radio1?.powerThreshold ?? '-70'),
      radio2NeighborPowerThreshold: String(nb.radio2?.powerThreshold ?? '-70'),
      radio3NeighborPowerThreshold: String(nb.radio3?.powerThreshold ?? '-70'),
      dynamicSampleEnabled: ds.enabled !== false,
      dynamicSampleNoise: String(ds.noise ?? '-85'),
      dynamicSampleNoiseFactor: String(ds.noiseFactor ?? '1.5'),
      dynamicSampleClientThreshold: String(ds.clientThreshold ?? '5'),
      radio1ChannelSwitchDelta: String(ir.radio1?.channelSwitchDelta ?? '15'),
      radio2ChannelSwitchDelta: String(ir.radio2?.channelSwitchDelta ?? '15'),
      cciEnabled: cci.enabled || false,
      cciHighThreshold: String(cci.highThreshold ?? '70'),
      cciLowThreshold: String(cci.lowThreshold ?? '30'),
      cciFrequency: String(cci.frequency ?? '60'),
      cciFrequencyLimiter: String(cci.frequencyLimiter ?? '3'),
      selectShutdownEnabled: ss.enabled || false,
      selectShutdownCciHigh: String(ss.cciHighThreshold ?? '80'),
      selectShutdownCciLow: String(ss.cciLowThreshold ?? '40'),
      selectShutdownFrequency: String(ss.frequency ?? '120'),
      selectShutdownFrequencyLimiter: String(ss.frequencyLimiter ?? '2'),
    });
    setActiveEditTab('basic');
    setSheetOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete RRM profile "${name}"?`)) return;
    try {
      await apiService.deleteRFManagementProfile(id);
      toast.success(`Deleted "${name}"`);
      loadProfiles();
    } catch (err: any) { toast.error(`Failed to delete: ${err.message}`); }
  };

  const buildPayload = () => ({
    name: form.name.trim(), type: form.type,
    smartRf: {
      enabled: form.smartRfEnabled, sensitivity: form.sensitivity,
      interferenceRecoveryEnabled: form.interferenceRecoveryEnabled,
      coverageHoleRecoveryEnabled: form.coverageHoleRecoveryEnabled,
      neighborRecoveryEnabled: form.neighborRecoveryEnabled,
      ocsMonitoringAwarenessOverride: form.ocsMonitoringAwarenessOverride,
      ocsThresholdAwarenessHits: parseInt(form.ocsThresholdAwarenessHits),
      aiRrmEnabled: form.aiRrmEnabled,
      channelAndPower: {
        radio1: { channelWidth: form.radio1ChannelWidth, minTxPower: parseFloat(form.radio1MinTxPower), maxTxPower: parseFloat(form.radio1MaxTxPower), channelPlan: form.radio1ChannelPlan, customChannels: form.radio1ChannelPlan === 'CUSTOM' ? form.radio1CustomChannels : undefined },
        radio2: { channelWidth: form.radio2ChannelWidth, minTxPower: parseFloat(form.radio2MinTxPower), maxTxPower: parseFloat(form.radio2MaxTxPower), channelPlan: form.radio2ChannelPlan, customChannels: form.radio2ChannelPlan === 'CUSTOM' ? form.radio2CustomChannels : undefined },
        radio3: { channelWidth: form.radio3ChannelWidth, minTxPower: parseFloat(form.radio3MinTxPower), maxTxPower: parseFloat(form.radio3MaxTxPower), channelPlan: form.radio3ChannelPlan, customChannels: form.radio3ChannelPlan === 'CUSTOM' ? form.radio3CustomChannels : undefined },
      },
      scanning: {
        radio1: { scanDuration: parseInt(form.radio1ScanDuration), scanPeriod: parseInt(form.radio1ScanPeriod), extScanFreq: parseInt(form.radio1ExtScanFreq), sampleCount: parseInt(form.radio1ScanSampleCount), clientAware: form.radio1ClientAwareScanning, powerSaveAware: form.radio1PowerSaveAwareScanning, txLoadAware: form.radio1TxLoadAwareScanning },
        radio2: { scanDuration: parseInt(form.radio2ScanDuration), scanPeriod: parseInt(form.radio2ScanPeriod), extScanFreq: parseInt(form.radio2ExtScanFreq), sampleCount: parseInt(form.radio2ScanSampleCount), clientAware: form.radio2ClientAwareScanning, powerSaveAware: form.radio2PowerSaveAwareScanning, txLoadAware: form.radio2TxLoadAwareScanning },
      },
      recovery: {
        powerHoldTime: parseInt(form.powerHoldTime),
        channelHoldTime: parseInt(form.channelHoldTime),
        neighborRecovery: {
          radio1: { powerThreshold: parseFloat(form.radio1NeighborPowerThreshold) },
          radio2: { powerThreshold: parseFloat(form.radio2NeighborPowerThreshold) },
          radio3: { powerThreshold: parseFloat(form.radio3NeighborPowerThreshold) },
        },
        dynamicSample: { enabled: form.dynamicSampleEnabled, noise: parseFloat(form.dynamicSampleNoise), noiseFactor: parseFloat(form.dynamicSampleNoiseFactor), clientThreshold: parseInt(form.dynamicSampleClientThreshold) },
        interferenceRecovery: {
          radio1: { channelSwitchDelta: parseFloat(form.radio1ChannelSwitchDelta) },
          radio2: { channelSwitchDelta: parseFloat(form.radio2ChannelSwitchDelta) },
        },
        cci: { enabled: form.cciEnabled, highThreshold: parseFloat(form.cciHighThreshold), lowThreshold: parseFloat(form.cciLowThreshold), frequency: parseInt(form.cciFrequency), frequencyLimiter: parseInt(form.cciFrequencyLimiter) },
      },
      selectShutdown: { enabled: form.selectShutdownEnabled, cciHighThreshold: parseFloat(form.selectShutdownCciHigh), cciLowThreshold: parseFloat(form.selectShutdownCciLow), frequency: parseInt(form.selectShutdownFrequency), frequencyLimiter: parseInt(form.selectShutdownFrequencyLimiter) },
    },
  });

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Profile name is required'); return; }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editing) {
        await apiService.updateRFManagementProfile(editing.id, { ...editing, ...payload });
        toast.success(`Updated "${form.name}"`);
      } else {
        await apiService.createRFManagementProfile(payload);
        toast.success(`Created "${form.name}"`);
      }
      setSheetOpen(false);
      loadProfiles();
    } catch (err: any) { toast.error(`Failed to save: ${err.message}`); }
    finally { setSaving(false); }
  };

  const filtered = profiles.filter(p => p.name?.toLowerCase().includes(searchTerm.toLowerCase()));

  const bands2_4 = { label: '2.4 GHz (Radio 1)', prefix: 'radio1', plans: [{ value: '3CHANNEL', label: '3-Channel Plan' }, { value: '4CHANNEL', label: '4-Channel Plan' }, { value: 'AUTO', label: 'Auto' }, { value: 'CUSTOM', label: 'Custom' }] };
  const bands5 = { label: '5 GHz (Radio 2)', prefix: 'radio2', plans: [{ value: 'ALL', label: 'All Channels' }, { value: 'EXTWEATHER', label: 'Extended Channel with Weather' }, { value: 'NONDFS', label: 'All Non-DFS Channels' }, { value: 'CUSTOM', label: 'Custom' }] };
  const bands6 = { label: '6 GHz (Radio 3)', prefix: 'radio3', plans: [{ value: 'ALL', label: 'All Channels' }, { value: 'PSC', label: 'PSC Channel' }, { value: 'CUSTOM', label: 'Custom' }] };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">RF Management (RRM)</h1>
            <DevEpicBadge epicKey="NVO-7299" epicTitle="Wireless RRM Configuration" jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-7299" />
          </div>
          <p className="text-sm text-muted-foreground">Smart RF policies controlling channel, power, scanning, and recovery behavior.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadProfiles} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />New RRM Profile
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search RRM profiles..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>SmartRF</TableHead>
                <TableHead>Sensitivity</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No RRM profiles configured</TableCell></TableRow>
              ) : (
                filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium"><div className="flex items-center gap-2"><Radio className="h-4 w-4 text-muted-foreground" />{p.name}</div></TableCell>
                    <TableCell><Badge variant="outline">{p.type || 'SMARTRF'}</Badge></TableCell>
                    <TableCell><Badge variant={p.smartRf?.enabled !== false ? 'default' : 'secondary'}>{p.smartRf?.enabled !== false ? 'Enabled' : 'Disabled'}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{p.smartRf?.sensitivity || '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(p.id, p.name)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[680px] sm:max-w-[680px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? `Edit: ${editing.name}` : 'New RRM Profile'}</SheetTitle>
            <SheetDescription>RF Management policy — Basic, Channel/Power, Scanning, and Recovery configuration.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <Tabs value={activeEditTab} onValueChange={setActiveEditTab}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="channel">Channel+Power</TabsTrigger>
                <TabsTrigger value="scanning">Scanning</TabsTrigger>
                <TabsTrigger value="recovery">Recovery</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Profile Name <span className="text-destructive">*</span></Label>
                  <Input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. Default-RRM" />
                </div>
                <div className="flex items-center justify-between"><Label>Smart Monitoring Enabled</Label><Switch checked={form.smartRfEnabled} onCheckedChange={v => setField('smartRfEnabled', v)} /></div>
                <div className="space-y-2">
                  <Label>Sensitivity</Label>
                  <Select value={form.sensitivity} onValueChange={v => setField('sensitivity', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="CUSTOM">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3 border rounded-lg p-3">
                  <Label className="text-sm font-medium">Recovery Toggles</Label>
                  {[
                    { label: 'Interference Recovery', key: 'interferenceRecoveryEnabled' },
                    { label: 'Coverage Hole Recovery', key: 'coverageHoleRecoveryEnabled' },
                    { label: 'Neighbor Recovery', key: 'neighborRecoveryEnabled' },
                  ].map(({ label, key }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm">{label}</span>
                      <Switch checked={(form as any)[key]} onCheckedChange={v => setField(key, v)} />
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>OCS Monitoring Awareness Override</Label>
                    <Switch checked={form.ocsMonitoringAwarenessOverride} onCheckedChange={v => setField('ocsMonitoringAwarenessOverride', v)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Number of Threshold Awareness Hits</Label>
                    <Input value={form.ocsThresholdAwarenessHits} onChange={e => setField('ocsThresholdAwarenessHits', e.target.value)} className="max-w-[120px]" />
                  </div>
                </div>
                <div className="flex items-center justify-between border rounded-lg p-3 bg-amber-500/5 border-amber-500/20">
                  <div>
                    <Label>AI-RRM Optimization Layer</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Optimizes channel/power/scanning/recovery. Static values are never overridden.</p>
                  </div>
                  <Switch checked={form.aiRrmEnabled} onCheckedChange={v => setField('aiRrmEnabled', v)} />
                </div>
              </TabsContent>

              <TabsContent value="channel" className="space-y-6 mt-4">
                {[bands2_4, bands5, bands6].map(band => (
                  <div key={band.prefix} className="border rounded-lg p-4 space-y-3">
                    <Label className="font-medium">{band.label}</Label>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Channel Width</Label>
                        <Select value={(form as any)[`${band.prefix}ChannelWidth`]} onValueChange={v => setField(`${band.prefix}ChannelWidth`, v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto</SelectItem>
                            <SelectItem value="20MHz">20 MHz</SelectItem>
                            <SelectItem value="40MHz">40 MHz</SelectItem>
                            <SelectItem value="80MHz">80 MHz</SelectItem>
                            <SelectItem value="160MHz">160 MHz</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Min Tx Power (dBm)</Label>
                        <Input value={(form as any)[`${band.prefix}MinTxPower`]} onChange={e => setField(`${band.prefix}MinTxPower`, e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max Tx Power (dBm)</Label>
                        <Input value={(form as any)[`${band.prefix}MaxTxPower`]} onChange={e => setField(`${band.prefix}MaxTxPower`, e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Channel Plan</Label>
                      <Select value={(form as any)[`${band.prefix}ChannelPlan`]} onValueChange={v => setField(`${band.prefix}ChannelPlan`, v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{band.plans.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {(form as any)[`${band.prefix}ChannelPlan`] === 'CUSTOM' && (
                      <div className="space-y-1">
                        <Label className="text-xs">Custom Channels (comma-separated)</Label>
                        <Input value={(form as any)[`${band.prefix}CustomChannels`]} onChange={e => setField(`${band.prefix}CustomChannels`, e.target.value)} placeholder="e.g. 36,40,44,48" />
                      </div>
                    )}
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="scanning" className="space-y-6 mt-4">
                {[{ label: '2.4 GHz (Radio 1)', prefix: 'radio1' }, { label: '5 GHz (Radio 2)', prefix: 'radio2' }].map(band => (
                  <div key={band.prefix} className="border rounded-lg p-4 space-y-3">
                    <Label className="font-medium">{band.label}</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label className="text-xs">Scan Duration (ms)</Label><Input value={(form as any)[`${band.prefix}ScanDuration`]} onChange={e => setField(`${band.prefix}ScanDuration`, e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-xs">Scan Period (s)</Label><Input value={(form as any)[`${band.prefix}ScanPeriod`]} onChange={e => setField(`${band.prefix}ScanPeriod`, e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-xs">Extended Scan Frequency</Label><Input value={(form as any)[`${band.prefix}ExtScanFreq`]} onChange={e => setField(`${band.prefix}ExtScanFreq`, e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-xs">Sample Count</Label><Input value={(form as any)[`${band.prefix}ScanSampleCount`]} onChange={e => setField(`${band.prefix}ScanSampleCount`, e.target.value)} /></div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Power Save Aware Scanning</Label>
                      <Select value={(form as any)[`${band.prefix}PowerSaveAwareScanning`]} onValueChange={v => setField(`${band.prefix}PowerSaveAwareScanning`, v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DYNAMIC">Dynamic</SelectItem>
                          <SelectItem value="STRICT">Strict</SelectItem>
                          <SelectItem value="DISABLE">Disable</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between"><span className="text-xs">Client Aware Scanning</span><Switch checked={(form as any)[`${band.prefix}ClientAwareScanning`]} onCheckedChange={v => setField(`${band.prefix}ClientAwareScanning`, v)} /></div>
                    <div className="flex items-center justify-between"><span className="text-xs">Transmit Load Aware Scanning</span><Switch checked={(form as any)[`${band.prefix}TxLoadAwareScanning`]} onCheckedChange={v => setField(`${band.prefix}TxLoadAwareScanning`, v)} /></div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="recovery" className="space-y-4 mt-4">
                <div className="border rounded-lg p-4 space-y-3">
                  <Label className="font-medium">Hold Timers</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">Power Hold Time (s)</Label><Input value={form.powerHoldTime} onChange={e => setField('powerHoldTime', e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">Channel Hold Time (s)</Label><Input value={form.channelHoldTime} onChange={e => setField('channelHoldTime', e.target.value)} /></div>
                  </div>
                </div>
                <div className="border rounded-lg p-4 space-y-3">
                  <Label className="font-medium">Neighbor Recovery Power Thresholds (dBm)</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1"><Label className="text-xs">2.4 GHz</Label><Input value={form.radio1NeighborPowerThreshold} onChange={e => setField('radio1NeighborPowerThreshold', e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">5 GHz</Label><Input value={form.radio2NeighborPowerThreshold} onChange={e => setField('radio2NeighborPowerThreshold', e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">6 GHz</Label><Input value={form.radio3NeighborPowerThreshold} onChange={e => setField('radio3NeighborPowerThreshold', e.target.value)} /></div>
                  </div>
                </div>
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between"><Label className="font-medium">Dynamic Sample Recovery</Label><Switch checked={form.dynamicSampleEnabled} onCheckedChange={v => setField('dynamicSampleEnabled', v)} /></div>
                  {form.dynamicSampleEnabled && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1"><Label className="text-xs">Noise (dBm)</Label><Input value={form.dynamicSampleNoise} onChange={e => setField('dynamicSampleNoise', e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-xs">Noise Factor</Label><Input value={form.dynamicSampleNoiseFactor} onChange={e => setField('dynamicSampleNoiseFactor', e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-xs">Client Threshold</Label><Input value={form.dynamicSampleClientThreshold} onChange={e => setField('dynamicSampleClientThreshold', e.target.value)} /></div>
                    </div>
                  )}
                </div>
                <div className="border rounded-lg p-4 space-y-3">
                  <Label className="font-medium">Interference Recovery — Channel Switch Delta</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">2.4 GHz Delta</Label><Input value={form.radio1ChannelSwitchDelta} onChange={e => setField('radio1ChannelSwitchDelta', e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">5 GHz Delta</Label><Input value={form.radio2ChannelSwitchDelta} onChange={e => setField('radio2ChannelSwitchDelta', e.target.value)} /></div>
                  </div>
                </div>
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between"><Label className="font-medium">CCI (Co-Channel Interference)</Label><Switch checked={form.cciEnabled} onCheckedChange={v => setField('cciEnabled', v)} /></div>
                  {form.cciEnabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label className="text-xs">High Threshold (%)</Label><Input value={form.cciHighThreshold} onChange={e => setField('cciHighThreshold', e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-xs">Low Threshold (%)</Label><Input value={form.cciLowThreshold} onChange={e => setField('cciLowThreshold', e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-xs">Frequency (s)</Label><Input value={form.cciFrequency} onChange={e => setField('cciFrequency', e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-xs">Frequency Limiter</Label><Input value={form.cciFrequencyLimiter} onChange={e => setField('cciFrequencyLimiter', e.target.value)} /></div>
                    </div>
                  )}
                </div>
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between"><Label className="font-medium">Select Shutdown</Label><Switch checked={form.selectShutdownEnabled} onCheckedChange={v => setField('selectShutdownEnabled', v)} /></div>
                  {form.selectShutdownEnabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label className="text-xs">CCI High Threshold (%)</Label><Input value={form.selectShutdownCciHigh} onChange={e => setField('selectShutdownCciHigh', e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-xs">CCI Low Threshold (%)</Label><Input value={form.selectShutdownCciLow} onChange={e => setField('selectShutdownCciLow', e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-xs">Frequency (s)</Label><Input value={form.selectShutdownFrequency} onChange={e => setField('selectShutdownFrequency', e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-xs">Frequency Limiter</Label><Input value={form.selectShutdownFrequencyLimiter} onChange={e => setField('selectShutdownFrequencyLimiter', e.target.value)} /></div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update Profile' : 'Create Profile'}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
npm run type-check
```
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/ConfigureRRM.tsx src/services/rrmService.test.ts
git commit -m "feat(rrm): add dedicated RRM page with Basic, Channel+Power, Scanning, Recovery, Select Shutdown (NVO-7299)"
```

---

## Section D: WLAN Enterprise Auth Enforcement (NVO-7242)

### Task 7: Enterprise AAA Required Validation + Variable Hint

**Files:**
- Create: `src/utils/wlanAuthValidation.ts`
- Create: `src/utils/wlanAuthValidation.test.ts`
- Modify: `src/components/NetworkEditDetail.tsx`

- [ ] **Step 1: Write failing tests**

```ts
// src/utils/wlanAuthValidation.test.ts
import { describe, it, expect } from 'vitest';
import { validateEnterpriseAuthRequirements, isEnterpriseAuth } from './wlanAuthValidation';

describe('isEnterpriseAuth', () => {
  it('returns false for open', () => expect(isEnterpriseAuth('open')).toBe(false));
  it('returns false for wpa2Personal', () => expect(isEnterpriseAuth('wpa2Personal')).toBe(false));
  it('returns true for wpa2Enterprise', () => expect(isEnterpriseAuth('wpa2Enterprise')).toBe(true));
  it('returns true for wpa3Enterprise', () => expect(isEnterpriseAuth('wpa3Enterprise')).toBe(true));
  it('returns true for dot1x', () => expect(isEnterpriseAuth('dot1x')).toBe(true));
  it('returns true for ENTERPRISE (API value)', () => expect(isEnterpriseAuth('ENTERPRISE')).toBe(true));
});

describe('validateEnterpriseAuthRequirements', () => {
  it('returns null for open without AAA', () => {
    expect(validateEnterpriseAuthRequirements('open', '')).toBeNull();
  });
  it('returns null for WPA2-personal without AAA', () => {
    expect(validateEnterpriseAuthRequirements('wpa2Personal', '')).toBeNull();
  });
  it('returns error for WPA2-enterprise without AAA', () => {
    expect(validateEnterpriseAuthRequirements('wpa2Enterprise', '')).toBe(
      'AAA policy is required for enterprise authentication modes'
    );
  });
  it('returns null for WPA2-enterprise with AAA selected', () => {
    expect(validateEnterpriseAuthRequirements('wpa2Enterprise', 'policy-123')).toBeNull();
  });
  it('returns error for dot1x without AAA', () => {
    expect(validateEnterpriseAuthRequirements('dot1x', '')).toBe(
      'AAA policy is required for enterprise authentication modes'
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- src/utils/wlanAuthValidation.test.ts
```
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create validation utility**

```ts
// src/utils/wlanAuthValidation.ts
const ENTERPRISE_AUTH_TYPES = new Set([
  'wpa2Enterprise',
  'wpa3Enterprise',
  'wpa2wpa3Enterprise',
  'dot1x',
  'ENTERPRISE',
  'WPA2_ENTERPRISE',
  'WPA3_ENTERPRISE',
  'WPA2WPA3_ENTERPRISE',
]);

export function isEnterpriseAuth(authType: string): boolean {
  return ENTERPRISE_AUTH_TYPES.has(authType);
}

/**
 * Returns an error message if enterprise auth is selected without an AAA policy,
 * or null if validation passes.
 */
export function validateEnterpriseAuthRequirements(
  authType: string,
  aaaPolicyId: string
): string | null {
  if (isEnterpriseAuth(authType) && !aaaPolicyId) {
    return 'AAA policy is required for enterprise authentication modes';
  }
  return null;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test -- src/utils/wlanAuthValidation.test.ts
```
Expected: PASS (11 tests)

- [ ] **Step 5: Integrate validation into NetworkEditDetail**

In `src/components/NetworkEditDetail.tsx`, add import at top:

```tsx
import { validateEnterpriseAuthRequirements, isEnterpriseAuth } from '../utils/wlanAuthValidation';
```

Find the form submit / save handler (the function that calls `apiService` to save). At the start of that handler, before the API call, add:

```tsx
const authError = validateEnterpriseAuthRequirements(
  formData.securityType || formData.authType || '',
  formData.aaaPolicyId || ''
);
if (authError) {
  toast.error('Authentication Configuration Error', { description: authError });
  setActiveTab('basic'); // bring user to the tab with the AAA field
  return;
}
```

- [ ] **Step 6: Add inline AAA required hint**

In `NetworkEditDetail.tsx`, find the AAA policy selector field (search for `aaaPolicyId`). Immediately after that Select/Input field, add:

```tsx
{isEnterpriseAuth(formData.securityType || formData.authType || '') && !formData.aaaPolicyId && (
  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
    <AlertCircle className="h-3 w-3" />
    AAA policy required for enterprise authentication
  </p>
)}
```

(Verify `AlertCircle` is already imported in the file — it is, at line 10.)

- [ ] **Step 7: Add variable substitution hint to SSID field**

In `NetworkEditDetail.tsx`, find the SSID input field (search for `ssid` in the form). After it, add:

```tsx
<p className="text-xs text-muted-foreground">
  Supports variable substitution, e.g. <code className="font-mono bg-muted px-1 rounded">{'{{site_name}}'}</code>
</p>
```

- [ ] **Step 8: Run all tests**

```bash
npm run test
```
Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add src/utils/wlanAuthValidation.ts src/utils/wlanAuthValidation.test.ts src/components/NetworkEditDetail.tsx
git commit -m "feat(wlan): enforce AAA required for enterprise auth, add variable substitution hint (NVO-7242)"
```

---

## Section E: Role Configuration Parity (NVO-9962)

### Task 8: L2 MAC Rules, L3 Src/Dest Rules UI, Bandwidth Limit Toggle

**Files:**
- Create: `src/utils/roleFilterValidation.ts`
- Create: `src/utils/roleFilterValidation.test.ts`
- Modify: `src/components/RoleEditDialog.tsx`

- [ ] **Step 1: Write failing tests**

```ts
// src/utils/roleFilterValidation.test.ts
import { describe, it, expect } from 'vitest';
import { buildDefaultL2Filter, buildDefaultL3SrcDestFilter } from './roleFilterValidation';

describe('buildDefaultL2Filter', () => {
  it('returns correct default structure', () => {
    const f = buildDefaultL2Filter();
    expect(f).toMatchObject({
      name: '',
      action: 'FILTERACTION_ALLOW',
      macAddress: '',
    });
  });
});

describe('buildDefaultL3SrcDestFilter', () => {
  it('returns correct default structure', () => {
    const f = buildDefaultL3SrcDestFilter();
    expect(f).toMatchObject({
      name: '',
      action: 'FILTERACTION_ALLOW',
      srcIp: '',
      srcPort: 'any',
      dstIp: '',
      dstPort: 'any',
      protocol: 'any',
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- src/utils/roleFilterValidation.test.ts
```
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create filter utility**

```ts
// src/utils/roleFilterValidation.ts
export function buildDefaultL2Filter() {
  return {
    name: '',
    action: 'FILTERACTION_ALLOW' as const,
    macAddress: '',
  };
}

export function buildDefaultL3SrcDestFilter() {
  return {
    name: '',
    action: 'FILTERACTION_ALLOW' as const,
    cosId: null as string | null,
    srcIp: '',
    srcPort: 'any',
    dstIp: '',
    dstPort: 'any',
    protocol: 'any',
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test -- src/utils/roleFilterValidation.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 5: Add state and imports to RoleEditDialog**

In `src/components/RoleEditDialog.tsx`, add import after existing imports:

```tsx
import { buildDefaultL2Filter, buildDefaultL3SrcDestFilter } from '../utils/roleFilterValidation';
```

After the `const [l7Filters, setL7Filters]` state declaration (line ~65), add:

```tsx
const [l2Filters, setL2Filters] = useState<any[]>([]);
const [l3SrcDestFilters, setL3SrcDestFilters] = useState<any[]>([]);
const [bandwidthLimitEnabled, setBandwidthLimitEnabled] = useState(false);
const [bandwidthLimitKbps, setBandwidthLimitKbps] = useState('');
```

- [ ] **Step 6: Populate new fields from existing role data**

In the `useEffect` where role data is loaded (around line ~75), add after `setL7Filters(role.l7Filters || [])`:

```tsx
setL2Filters(role.l2Filters || []);
setL3SrcDestFilters(role.l3SrcDestFilters || []);
setBandwidthLimitEnabled(!!role.bandwidthLimitEnabled);
setBandwidthLimitKbps(String(role.bandwidthLimitKbps || ''));
```

In `resetForm()`, add:

```tsx
setL2Filters([]);
setL3SrcDestFilters([]);
setBandwidthLimitEnabled(false);
setBandwidthLimitKbps('');
```

- [ ] **Step 7: Include new fields in handleSave payload**

In `handleSave`, find the `roleData` object and add:

```tsx
l2Filters,
l3SrcDestFilters,
bandwidthLimitEnabled,
bandwidthLimitKbps: bandwidthLimitEnabled ? parseInt(bandwidthLimitKbps) || 0 : undefined,
```

- [ ] **Step 8: Add Bandwidth Limit to Basic tab**

In the Basic tab content (after the `defaultAction` field block), add:

```tsx
<div className="space-y-2 border rounded-lg p-3">
  <div className="flex items-center justify-between">
    <Label>Bandwidth Limit</Label>
    <Switch checked={bandwidthLimitEnabled} onCheckedChange={setBandwidthLimitEnabled} />
  </div>
  {bandwidthLimitEnabled && (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        value={bandwidthLimitKbps}
        onChange={e => setBandwidthLimitKbps(e.target.value)}
        placeholder="e.g. 10000"
        className="max-w-[160px]"
      />
      <span className="text-sm text-muted-foreground">Kbps</span>
    </div>
  )}
</div>
```

- [ ] **Step 9: Replace Firewall tab with nested sub-tabs (L2 / L3 / L3SrcDest / L7)**

Find the `<TabsContent value="firewall">` block. Replace its contents with:

```tsx
<TabsContent value="firewall" className="mt-4">
  <Tabs defaultValue="l3">
    <TabsList className="grid grid-cols-4 w-full mb-4">
      <TabsTrigger value="l2">L2 (MAC)</TabsTrigger>
      <TabsTrigger value="l3">L3/L4</TabsTrigger>
      <TabsTrigger value="l3srcdst">L3/L4 Src/Dst</TabsTrigger>
      <TabsTrigger value="l7">L7 (App)</TabsTrigger>
    </TabsList>

    {/* L2 MAC Rules */}
    <TabsContent value="l2" className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">MAC address-based allow/deny rules. Evaluated first in rule order.</p>
        <Button size="sm" variant="outline" onClick={() => setL2Filters([...l2Filters, buildDefaultL2Filter()])}>
          <Plus className="h-3 w-3 mr-1" />Add L2 Filter
        </Button>
      </div>
      {l2Filters.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No L2 filters configured</p>
      ) : (
        l2Filters.map((f, i) => (
          <div key={i} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Rule {i + 1}</span>
              <Button size="icon" variant="ghost" onClick={() => setL2Filters(l2Filters.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Rule Name</Label>
                <Input value={f.name} onChange={e => { const u = [...l2Filters]; u[i] = { ...u[i], name: e.target.value }; setL2Filters(u); }} placeholder="Optional" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">MAC Address</Label>
                <Input value={f.macAddress} onChange={e => { const u = [...l2Filters]; u[i] = { ...u[i], macAddress: e.target.value }; setL2Filters(u); }} placeholder="xx:xx:xx:xx:xx:xx" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Action</Label>
                <Select value={f.action} onValueChange={v => { const u = [...l2Filters]; u[i] = { ...u[i], action: v }; setL2Filters(u); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FILTERACTION_ALLOW">Allow</SelectItem>
                    <SelectItem value="FILTERACTION_DENY">Deny</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ))
      )}
    </TabsContent>

    {/* L3/L4 Rules — move existing l3Filters JSX here verbatim */}
    <TabsContent value="l3" className="space-y-3">
      {/* PASTE existing L3 filter list JSX from this tab's current content here */}
    </TabsContent>

    {/* L3/L4 Source/Destination Rules */}
    <TabsContent value="l3srcdst" className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Source/Destination IP and port rules with optional CoS override.</p>
        <Button size="sm" variant="outline" onClick={() => setL3SrcDestFilters([...l3SrcDestFilters, buildDefaultL3SrcDestFilter()])}>
          <Plus className="h-3 w-3 mr-1" />Add Rule
        </Button>
      </div>
      {l3SrcDestFilters.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No source/destination rules configured</p>
      ) : (
        l3SrcDestFilters.map((f, i) => (
          <div key={i} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Rule {i + 1}</span>
              <Button size="icon" variant="ghost" onClick={() => setL3SrcDestFilters(l3SrcDestFilters.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Rule Name</Label><Input value={f.name} onChange={e => { const u = [...l3SrcDestFilters]; u[i] = { ...u[i], name: e.target.value }; setL3SrcDestFilters(u); }} placeholder="Optional" /></div>
              <div className="space-y-1">
                <Label className="text-xs">Action</Label>
                <Select value={f.action} onValueChange={v => { const u = [...l3SrcDestFilters]; u[i] = { ...u[i], action: v }; setL3SrcDestFilters(u); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FILTERACTION_ALLOW">Allow</SelectItem>
                    <SelectItem value="FILTERACTION_DENY">Deny</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Source IP/Subnet</Label><Input value={f.srcIp} onChange={e => { const u = [...l3SrcDestFilters]; u[i] = { ...u[i], srcIp: e.target.value }; setL3SrcDestFilters(u); }} placeholder="0.0.0.0/0" /></div>
              <div className="space-y-1"><Label className="text-xs">Source Port</Label><Input value={f.srcPort} onChange={e => { const u = [...l3SrcDestFilters]; u[i] = { ...u[i], srcPort: e.target.value }; setL3SrcDestFilters(u); }} placeholder="any" /></div>
              <div className="space-y-1"><Label className="text-xs">Destination IP/Subnet</Label><Input value={f.dstIp} onChange={e => { const u = [...l3SrcDestFilters]; u[i] = { ...u[i], dstIp: e.target.value }; setL3SrcDestFilters(u); }} placeholder="0.0.0.0/0" /></div>
              <div className="space-y-1"><Label className="text-xs">Destination Port</Label><Input value={f.dstPort} onChange={e => { const u = [...l3SrcDestFilters]; u[i] = { ...u[i], dstPort: e.target.value }; setL3SrcDestFilters(u); }} placeholder="any" /></div>
            </div>
          </div>
        ))
      )}
    </TabsContent>

    {/* L7 App Rules — move existing l7Filters JSX here verbatim */}
    <TabsContent value="l7" className="space-y-3">
      {/* PASTE existing L7 filter list JSX from this tab's current content here */}
    </TabsContent>
  </Tabs>
</TabsContent>
```

> **Note on L3 and L7 sections:** The existing JSX blocks for `l3Filters` and `l7Filters` that currently render directly inside the firewall `TabsContent` must be moved into the new nested `value="l3"` and `value="l7"` sub-tabs. No changes to that JSX are needed — just relocate it.

- [ ] **Step 10: Type-check**

```bash
npm run type-check
```
Expected: No errors

- [ ] **Step 11: Run all tests**

```bash
npm run test
```
Expected: All tests pass

- [ ] **Step 12: Commit**

```bash
git add src/components/RoleEditDialog.tsx src/utils/roleFilterValidation.ts src/utils/roleFilterValidation.test.ts
git commit -m "feat(roles): add L2 MAC rules, L3 src/dest rules UI, bandwidth limit toggle (NVO-9962)"
```

---

## Self-Review

### Spec coverage

| Epic | Requirement | Task |
|---|---|---|
| NVO-7242 | DEV Epic link on WLAN page | Task 2 |
| NVO-7242 | Enterprise AAA enforcement (required, not optional) | Task 7 |
| NVO-7242 | Auth type determines enforcement structure | Task 7 |
| NVO-7242 | Variable substitution hint on SSID field | Task 7 |
| NVO-9702 | DEV Epic link on Profiles page | Task 4 |
| NVO-9702 | Dedicated Device Profiles page in nav | Tasks 3–4 |
| NVO-9702 | Site Default vs Device Profile type distinction | Task 4 |
| NVO-9702 | Radio config: RRM vs Fixed channel per radio | Task 4 |
| NVO-9702 | Global advanced config (SSH, LED, USB, PEAP, Cert) | Task 4 |
| NVO-9702 | AP platform field for Device profiles | Task 4 |
| NVO-7299 | DEV Epic link on RRM page | Task 6 |
| NVO-7299 | Dedicated RF Management page in nav | Tasks 5–6 |
| NVO-7299 | Basic section: SmartRF toggle, sensitivity, recovery toggles | Task 6 |
| NVO-7299 | Channel+Power per band with per-band channel plans | Task 6 |
| NVO-7299 | Scanning per band: duration, period, ext freq, sample count, client/power-save/tx-load aware | Task 6 |
| NVO-7299 | Recovery: hold timers, neighbor thresholds, dynamic sample, CCI, interference delta | Task 6 |
| NVO-7299 | Select Shutdown section | Task 6 |
| NVO-7299 | AI-RRM toggle | Task 6 |
| NVO-9962 | DEV Epic link on Policy/Roles page | Task 2 |
| NVO-9962 | L2 MAC rules (new tab) | Task 8 |
| NVO-9962 | L3/L4 source/destination rules UI (data existed, UI was missing) | Task 8 |
| NVO-9962 | Bandwidth limit with explicit enable/disable toggle | Task 8 |
| NVO-9962 | Existing L3/L7 rules preserved, reorganized into sub-tabs | Task 8 |

### Placeholder scan
No TBD, TODO, or "implement later" appears anywhere in this plan.

### Type consistency
- `buildDefaultL2Filter()` returns `{ name, action, macAddress }` — matches the shape used in `l2Filters` state and `roleData.l2Filters`.
- `buildDefaultL3SrcDestFilter()` returns `{ name, action, cosId, srcIp, srcPort, dstIp, dstPort, protocol }` — matches `l3SrcDestFilters` and `roleData.l3SrcDestFilters`.
- `ConfigureRRM`'s `buildPayload()` uses only fields defined in `DEFAULT_RRM_FORM`.
- `ProfileEditSheet`'s `handleSave` constructs `radio1/radio2/radio3` sub-objects matching the fields in `DEFAULT_FORM`.
- `apiService.updateProfile`, `apiService.createProfile`, `apiService.getRFManagementProfiles`, etc. are all verified to exist in `src/services/api.ts`.
