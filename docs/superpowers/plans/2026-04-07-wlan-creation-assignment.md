# WLAN Creation — Scope & Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unassigned/all-sites/selected-targets assignment scope to both WLAN creation flows, build a new Quick WLAN compact modal, and restructure CreateWLANDialog to lead with a prominent deployment section.

**Architecture:** A shared `AssignmentSection` controlled component handles the three-option radio group + chip-based site/group picker. `QuickWLANDialog` (new, compact modal) and `CreateWLANDialog` (restructured) both consume it. The service layer gains an `unassigned` early-return path. ConfigureNetworks gains a dismissible banner strip as the Quick WLAN entry point.

**Tech Stack:** React 19, TypeScript 5.7 strict, Tailwind CSS, shadcn/ui (Radix UI primitives), Vitest + React Testing Library + jsdom, Sonner (toast), Lucide icons.

---

### Task 1: Add `WlanAssignmentMode` type and extend `WLANFormData` + `Service`

**Files:**
- Modify: `src/types/network.ts` — add type + fields to `WLANFormData`
- Modify: `src/types/api.ts` — add optional fields to `Service`
- Test: `src/test/types/wlanAssignmentMode.test.ts`

- [ ] **Step 1: Write the failing type test**

Create `src/test/types/wlanAssignmentMode.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest';
import type { WlanAssignmentMode, WLANFormData } from '../../types/network';

describe('WlanAssignmentMode', () => {
  it('is a union of three string literals', () => {
    expectTypeOf<WlanAssignmentMode>().toEqualTypeOf<
      'unassigned' | 'all_sites' | 'selected_targets'
    >();
  });

  it('WLANFormData includes assignmentMode', () => {
    expectTypeOf<WLANFormData['assignmentMode']>().toEqualTypeOf<WlanAssignmentMode>();
  });

  it('WLANFormData includes assignedSiteIds and assignedSiteGroupIds', () => {
    expectTypeOf<WLANFormData['assignedSiteIds']>().toEqualTypeOf<string[]>();
    expectTypeOf<WLANFormData['assignedSiteGroupIds']>().toEqualTypeOf<string[]>();
  });

  it('WLANFormData includes optional templateId', () => {
    expectTypeOf<WLANFormData['templateId']>().toEqualTypeOf<string | undefined>();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Volumes/redq/Documents/NobaraShare/GitHub/AURA/.claude/worktrees/strange-hofstadter
npm run test -- src/test/types/wlanAssignmentMode.test.ts 2>&1 | tail -15
```

Expected: FAIL — `WlanAssignmentMode` not exported, fields missing from `WLANFormData`.

- [ ] **Step 3: Add `WlanAssignmentMode` to `src/types/network.ts`**

After the `DeploymentMode` type (line 407, `export type DeploymentMode = ...`), insert:

```typescript
export type WlanAssignmentMode = 'unassigned' | 'all_sites' | 'selected_targets';
```

Then add four fields to `WLANFormData` after the `selectedSiteGroups` field (around line 362):

```typescript
  // Assignment scope — chosen at creation time
  assignmentMode: WlanAssignmentMode;
  assignedSiteIds: string[];
  assignedSiteGroupIds: string[];
  templateId?: string; // forward-compatible hook for future template governance
```

- [ ] **Step 4: Add optional fields to `Service` in `src/types/api.ts`**

Add this import near the top of `src/types/api.ts` (after existing imports):

```typescript
import type { WlanAssignmentMode } from './network';
```

At the end of the `Service` interface body, before the final `[key: string]: any;` line, add:

```typescript
  // Assignment scope (tracked client-side; not persisted to controller)
  assignmentMode?: WlanAssignmentMode;
  assignedSiteIds?: string[];
  assignedSiteGroupIds?: string[];
  templateId?: string;
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run test -- src/test/types/wlanAssignmentMode.test.ts 2>&1 | tail -10
```

Expected: PASS (4 tests).

- [ ] **Step 6: Verify no new type errors in these two files**

```bash
npm run type-check 2>&1 | grep -E "types/network\.ts|types/api\.ts" | head -20
```

Expected: no new errors in `network.ts` or `api.ts` (pre-existing errors in other files are unrelated).

- [ ] **Step 7: Commit**

```bash
git add src/types/network.ts src/types/api.ts src/test/types/wlanAssignmentMode.test.ts
git commit -m "feat(types): add WlanAssignmentMode and assignment fields to WLANFormData and Service"
```

---

### Task 2: Add `createWLANUnassigned` to `WLANAssignmentService`

**Files:**
- Modify: `src/services/wlanAssignment.ts` — add method before closing `}`
- Test: `src/test/services/wlanAssignment.unassigned.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/services/wlanAssignment.unassigned.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({
  apiService: {
    createService: vi.fn(),
    getSites: vi.fn().mockResolvedValue([]),
    getRoles: vi.fn().mockResolvedValue([]),
  },
}));

// Import after mock
const { WLANAssignmentService } = await import('../../services/wlanAssignment');
const { apiService } = await import('../../services/api');

describe('WLANAssignmentService.createWLANUnassigned', () => {
  let service: InstanceType<typeof WLANAssignmentService>;

  beforeEach(() => {
    service = new WLANAssignmentService();
    vi.clearAllMocks();
  });

  it('calls createService once and returns without assignment', async () => {
    vi.mocked(apiService.createService).mockResolvedValue({ id: 'svc-123', ssid: 'TestNet' });

    const result = await service.createWLANUnassigned({
      ssid: 'TestNet',
      security: 'wpa2-psk',
      band: 'dual',
      enabled: true,
      sites: [],
    });

    expect(apiService.createService).toHaveBeenCalledOnce();
    expect(result.serviceId).toBe('svc-123');
    expect(result.sitesProcessed).toBe(0);
    expect(result.profilesAssigned).toBe(0);
    expect(result.assignments).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('returns success: false and captures error message on failure', async () => {
    vi.mocked(apiService.createService).mockRejectedValue(new Error('Network timeout'));

    const result = await service.createWLANUnassigned({
      ssid: 'TestNet',
      security: 'wpa2-psk',
      band: 'dual',
      enabled: true,
      sites: [],
    });

    expect(result.success).toBe(false);
    expect(result.serviceId).toBe('');
    expect(result.errors).toContain('Network timeout');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test -- src/test/services/wlanAssignment.unassigned.test.ts 2>&1 | tail -15
```

Expected: FAIL — `createWLANUnassigned is not a function`.

- [ ] **Step 3: Add `createWLANUnassigned` to `src/services/wlanAssignment.ts`**

Find the end of the `WLANAssignmentService` class body (line 732, just before `export const wlanAssignmentService = ...`). Add this method inside the class, before the closing `}`:

```typescript
  /**
   * Creates a WLAN at global scope with no site assignment.
   * No profile discovery or sync is triggered.
   */
  async createWLANUnassigned(
    serviceData: CreateServiceRequest
  ): Promise<AutoAssignmentResponse> {
    try {
      const servicePayload = buildServicePayload(serviceData);
      const service = await apiService.createService(servicePayload);
      return {
        serviceId: service.id,
        sitesProcessed: 0,
        deviceGroupsFound: 0,
        profilesAssigned: 0,
        assignments: [],
        success: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        serviceId: '',
        sitesProcessed: 0,
        deviceGroupsFound: 0,
        profilesAssigned: 0,
        assignments: [],
        success: false,
        errors: [message],
      };
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- src/test/services/wlanAssignment.unassigned.test.ts 2>&1 | tail -10
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/wlanAssignment.ts src/test/services/wlanAssignment.unassigned.test.ts
git commit -m "feat(services): add createWLANUnassigned to WLANAssignmentService"
```

---

### Task 3: Build `AssignmentSection` component

**Files:**
- Create: `src/components/AssignmentSection.tsx`
- Test: `src/test/components/AssignmentSection.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/components/AssignmentSection.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssignmentSection } from '../../components/AssignmentSection';
import type { WlanAssignmentMode } from '../../types/network';
import type { Site } from '../../types/network';
import type { SiteGroup } from '../../types/domain';

const mockSites: Site[] = [
  { id: 'site-1', name: 'NYC-HQ' },
  { id: 'site-2', name: 'Boston-01' },
];
const mockSiteGroups: SiteGroup[] = [
  {
    id: 'sg-1',
    name: 'East Coast',
    org_id: 'org-1',
    controller_url: 'https://ctrl1',
    connection_status: 'connected',
    is_default: false,
  },
];

function renderSection(
  value: WlanAssignmentMode = 'all_sites',
  overrides: Partial<React.ComponentProps<typeof AssignmentSection>> = {}
) {
  const onChange = vi.fn();
  const onSitesChange = vi.fn();
  const onSiteGroupsChange = vi.fn();
  render(
    <AssignmentSection
      value={value}
      onChange={onChange}
      selectedSiteIds={[]}
      selectedSiteGroupIds={[]}
      onSitesChange={onSitesChange}
      onSiteGroupsChange={onSiteGroupsChange}
      sites={mockSites}
      siteGroups={mockSiteGroups}
      {...overrides}
    />
  );
  return { onChange, onSitesChange, onSiteGroupsChange };
}

describe('AssignmentSection', () => {
  it('renders all three radio options', () => {
    renderSection();
    expect(screen.getByText('Not assigned')).toBeInTheDocument();
    expect(screen.getByText('All sites')).toBeInTheDocument();
    expect(screen.getByText('Select sites / site groups')).toBeInTheDocument();
  });

  it('calls onChange when a different radio option is clicked', () => {
    const { onChange } = renderSection('all_sites');
    fireEvent.click(screen.getByText('Not assigned'));
    expect(onChange).toHaveBeenCalledWith('unassigned');
  });

  it('does not show chip picker when mode is all_sites', () => {
    renderSection('all_sites');
    expect(screen.queryByPlaceholderText(/search sites/i)).not.toBeInTheDocument();
  });

  it('shows chip picker when mode is selected_targets', () => {
    renderSection('selected_targets');
    expect(screen.getByPlaceholderText(/search sites/i)).toBeInTheDocument();
  });

  it('renders selected site as a removable chip', () => {
    renderSection('selected_targets', { selectedSiteIds: ['site-1'] });
    expect(screen.getByText('NYC-HQ')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove NYC-HQ')).toBeInTheDocument();
  });

  it('calls onSitesChange without the removed id when chip X is clicked', () => {
    const { onSitesChange } = renderSection('selected_targets', {
      selectedSiteIds: ['site-1', 'site-2'],
    });
    fireEvent.click(screen.getByLabelText('Remove NYC-HQ'));
    expect(onSitesChange).toHaveBeenCalledWith(['site-2']);
  });

  it('shows validation hint when selected_targets but nothing selected', () => {
    renderSection('selected_targets', {
      selectedSiteIds: [],
      selectedSiteGroupIds: [],
    });
    expect(screen.getByText(/select at least one target/i)).toBeInTheDocument();
  });

  it('does not show validation hint when selected_targets has selections', () => {
    renderSection('selected_targets', { selectedSiteIds: ['site-1'] });
    expect(screen.queryByText(/select at least one target/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -- src/test/components/AssignmentSection.test.tsx 2>&1 | tail -15
```

Expected: FAIL — module `../../components/AssignmentSection` not found.

- [ ] **Step 3: Create `src/components/AssignmentSection.tsx`**

```tsx
import { useState, useMemo } from 'react';
import { X, Folder } from 'lucide-react';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import type { WlanAssignmentMode } from '../types/network';
import type { Site } from '../types/network';
import type { SiteGroup } from '../types/domain';

export interface AssignmentSectionProps {
  value: WlanAssignmentMode;
  onChange: (mode: WlanAssignmentMode) => void;
  selectedSiteIds: string[];
  selectedSiteGroupIds: string[];
  onSitesChange: (ids: string[]) => void;
  onSiteGroupsChange: (ids: string[]) => void;
  sites: Site[];
  siteGroups: SiteGroup[];
}

const MODES: { value: WlanAssignmentMode; label: string; description: string }[] = [
  { value: 'unassigned', label: 'Not assigned', description: 'Save globally, deploy later' },
  { value: 'all_sites', label: 'All sites', description: 'Deploy to every site immediately' },
  {
    value: 'selected_targets',
    label: 'Select sites / site groups',
    description: 'Choose specific targets',
  },
];

export function AssignmentSection({
  value,
  onChange,
  selectedSiteIds,
  selectedSiteGroupIds,
  onSitesChange,
  onSiteGroupsChange,
  sites,
  siteGroups,
}: AssignmentSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return { sites: [], siteGroups: [] };
    const q = searchQuery.toLowerCase();
    return {
      sites: sites.filter(
        s => !selectedSiteIds.includes(s.id) && (s.name ?? s.id).toLowerCase().includes(q)
      ),
      siteGroups: siteGroups.filter(
        sg => !selectedSiteGroupIds.includes(sg.id) && sg.name.toLowerCase().includes(q)
      ),
    };
  }, [searchQuery, sites, siteGroups, selectedSiteIds, selectedSiteGroupIds]);

  const hasDropdownResults =
    filteredResults.sites.length > 0 || filteredResults.siteGroups.length > 0;

  const selectedSiteObjects = sites.filter(s => selectedSiteIds.includes(s.id));
  const selectedGroupObjects = siteGroups.filter(sg => selectedSiteGroupIds.includes(sg.id));
  const hasSelections = selectedSiteIds.length > 0 || selectedSiteGroupIds.length > 0;

  const summaryText = useMemo(() => {
    const parts: string[] = [];
    if (selectedSiteGroupIds.length > 0)
      parts.push(
        `${selectedSiteGroupIds.length} group${selectedSiteGroupIds.length !== 1 ? 's' : ''}`
      );
    if (selectedSiteIds.length > 0)
      parts.push(`${selectedSiteIds.length} site${selectedSiteIds.length !== 1 ? 's' : ''}`);
    return parts.join(', ');
  }, [selectedSiteIds, selectedSiteGroupIds]);

  function removeSite(id: string) {
    onSitesChange(selectedSiteIds.filter(s => s !== id));
  }

  function removeSiteGroup(id: string) {
    onSiteGroupsChange(selectedSiteGroupIds.filter(sg => sg !== id));
  }

  function selectSite(site: Site) {
    onSitesChange([...selectedSiteIds, site.id]);
    setSearchQuery('');
    setShowDropdown(false);
  }

  function selectSiteGroup(sg: SiteGroup) {
    onSiteGroupsChange([...selectedSiteGroupIds, sg.id]);
    setSearchQuery('');
    setShowDropdown(false);
  }

  return (
    <div className="space-y-2">
      {MODES.map(mode => (
        <div
          key={mode.value}
          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            value === mode.value
              ? 'border-primary bg-primary/5'
              : 'border-border hover:bg-accent/50'
          }`}
          onClick={() => onChange(mode.value)}
          role="radio"
          aria-checked={value === mode.value}
        >
          <div
            className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-colors ${
              value === mode.value ? 'border-primary bg-primary' : 'border-muted-foreground'
            }`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-none">{mode.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{mode.description}</p>

            {/* Chip picker — only when this mode is active */}
            {mode.value === 'selected_targets' && value === 'selected_targets' && (
              <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                {/* Selected chips */}
                {hasSelections && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedGroupObjects.map(sg => (
                      <Badge key={sg.id} variant="secondary" className="gap-1 pr-1 text-xs">
                        <Folder className="h-3 w-3" />
                        {sg.name}
                        <button
                          type="button"
                          aria-label={`Remove ${sg.name}`}
                          className="ml-0.5 rounded-full hover:bg-muted"
                          onClick={() => removeSiteGroup(sg.id)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {selectedSiteObjects.map(s => (
                      <Badge key={s.id} variant="outline" className="gap-1 pr-1 text-xs">
                        {s.name ?? s.id}
                        <button
                          type="button"
                          aria-label={`Remove ${s.name ?? s.id}`}
                          className="ml-0.5 rounded-full hover:bg-muted"
                          onClick={() => removeSite(s.id)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                {hasSelections && (
                  <p className="text-xs text-muted-foreground">{summaryText} selected</p>
                )}

                {/* Search input */}
                <div className="relative">
                  <Input
                    placeholder="Search sites or groups..."
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    className="h-8 text-xs"
                  />
                  {showDropdown && hasDropdownResults && (
                    <div className="absolute z-50 top-full mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                      {filteredResults.siteGroups.length > 0 && (
                        <>
                          <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Site Groups
                          </p>
                          {filteredResults.siteGroups.map(sg => (
                            <button
                              key={sg.id}
                              type="button"
                              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-accent text-left"
                              onMouseDown={() => selectSiteGroup(sg)}
                            >
                              <Folder className="h-3 w-3 text-muted-foreground" />
                              {sg.name}
                            </button>
                          ))}
                        </>
                      )}
                      {filteredResults.sites.length > 0 && (
                        <>
                          <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Sites
                          </p>
                          {filteredResults.sites.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              className="w-full px-2 py-1.5 text-xs hover:bg-accent text-left pl-6"
                              onMouseDown={() => selectSite(s)}
                            >
                              {s.name ?? s.id}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Validation hint */}
                {!hasSelections && (
                  <p className="text-xs text-destructive">
                    Select at least one target to continue
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/test/components/AssignmentSection.test.tsx 2>&1 | tail -15
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/AssignmentSection.tsx src/test/components/AssignmentSection.test.tsx
git commit -m "feat(components): add AssignmentSection shared radio + chip picker"
```

---

### Task 4: Build `QuickWLANDialog`

**Files:**
- Create: `src/components/QuickWLANDialog.tsx`
- Test: `src/test/components/QuickWLANDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/components/QuickWLANDialog.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../services/api', () => ({
  apiService: { getSites: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/wlanAssignment', () => ({
  WLANAssignmentService: vi.fn().mockImplementation(() => ({
    createWLANUnassigned: vi.fn().mockResolvedValue({ success: true, serviceId: 'svc-1', sitesProcessed: 0, profilesAssigned: 0, assignments: [] }),
    createWLANWithAutoAssignment: vi.fn().mockResolvedValue({ success: true, serviceId: 'svc-1', sitesProcessed: 2, profilesAssigned: 4, assignments: [] }),
    createWLANWithSiteCentricDeployment: vi.fn().mockResolvedValue({ success: true, serviceId: 'svc-1', sitesProcessed: 1, profilesAssigned: 2, assignments: [] }),
  })),
}));
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: () => ({ siteGroups: [] }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { QuickWLANDialog } = await import('../../components/QuickWLANDialog');

function renderDialog(open = true) {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  render(<QuickWLANDialog open={open} onOpenChange={onOpenChange} onSuccess={onSuccess} />);
  return { onOpenChange, onSuccess };
}

describe('QuickWLANDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders when open is true', () => {
    renderDialog();
    expect(screen.getByText('Quick WLAN')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    renderDialog(false);
    expect(screen.queryByText('Quick WLAN')).not.toBeInTheDocument();
  });

  it('Create button is disabled when SSID is empty', () => {
    renderDialog();
    const btn = screen.getByRole('button', { name: /create wlan/i });
    expect(btn).toBeDisabled();
  });

  it('Create button is enabled after SSID and passphrase are filled', () => {
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText(/network name/i), {
      target: { value: 'Corp-WiFi' },
    });
    fireEvent.change(screen.getByPlaceholderText(/passphrase/i), {
      target: { value: 'secret123' },
    });
    expect(screen.getByRole('button', { name: /create wlan/i })).not.toBeDisabled();
  });

  it('hides passphrase field when Open security is selected', async () => {
    renderDialog();
    // Change security to Open — find the select and change it
    const securitySelect = screen.getByRole('combobox', { name: /authentication/i });
    fireEvent.change(securitySelect, { target: { value: 'open' } });
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/passphrase/i)).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm run test -- src/test/components/QuickWLANDialog.test.tsx 2>&1 | tail -15
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/QuickWLANDialog.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { Loader2, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Separator } from './ui/separator';
import { toast } from 'sonner';
import { apiService } from '../services/api';
import { WLANAssignmentService } from '../services/wlanAssignment';
import { AssignmentSection } from './AssignmentSection';
import { useAppContext } from '@/contexts/AppContext';
import type { WlanAssignmentMode } from '../types/network';
import type { Site } from '../types/network';

interface QuickWLANDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type QuickSecurityType = 'wpa2-psk' | 'wpa3-personal' | 'wpa2-enterprise' | 'open';

const PSK_MODES: QuickSecurityType[] = ['wpa2-psk', 'wpa3-personal'];

export function QuickWLANDialog({ open, onOpenChange, onSuccess }: QuickWLANDialogProps) {
  const { siteGroups } = useAppContext();

  const [ssid, setSsid] = useState('');
  const [vlan, setVlan] = useState('1');
  const [security, setSecurity] = useState<QuickSecurityType>('wpa2-psk');
  const [passphrase, setPassphrase] = useState('');
  const [assignmentMode, setAssignmentMode] = useState<WlanAssignmentMode>('all_sites');
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [selectedSiteGroupIds, setSelectedSiteGroupIds] = useState<string[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Load sites when dialog opens
  useEffect(() => {
    if (!open) return;
    apiService.getSites().then(setSites).catch(() => setSites([]));
  }, [open]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSsid('');
      setVlan('1');
      setSecurity('wpa2-psk');
      setPassphrase('');
      setAssignmentMode('all_sites');
      setSelectedSiteIds([]);
      setSelectedSiteGroupIds([]);
    }
  }, [open]);

  const requiresPassphrase = PSK_MODES.includes(security);

  const isValid = () => {
    if (!ssid.trim()) return false;
    if (requiresPassphrase && !passphrase.trim()) return false;
    if (
      assignmentMode === 'selected_targets' &&
      selectedSiteIds.length === 0 &&
      selectedSiteGroupIds.length === 0
    )
      return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!isValid()) return;
    setSubmitting(true);

    const serviceData = {
      serviceName: ssid.trim(),
      ssid: ssid.trim(),
      security: security as string,
      passphrase: requiresPassphrase ? passphrase : undefined,
      vlan: vlan ? parseInt(vlan, 10) : 1,
      band: 'dual' as const,
      enabled: true,
      sites: selectedSiteIds,
      mbo: true,
      uapsdEnabled: true,
      clientToClientCommunication: true,
    };

    try {
      const assignmentService = new WLANAssignmentService();

      if (assignmentMode === 'unassigned') {
        const result = await assignmentService.createWLANUnassigned(serviceData);
        if (!result.success) throw new Error(result.errors?.[0] ?? 'Creation failed');
        toast.success('WLAN Created', { description: `${ssid} saved globally (not deployed)` });
      } else if (assignmentMode === 'all_sites') {
        const result = await assignmentService.createWLANWithAutoAssignment(serviceData);
        if (!result.success) throw new Error(result.errors?.[0] ?? 'Creation failed');
        toast.success('WLAN Created', {
          description: `Assigned to ${result.profilesAssigned} profile(s) across ${result.sitesProcessed} site(s)`,
        });
      } else {
        // selected_targets — apply ALL_PROFILES_AT_SITE to each selected site.
        // Cast sites to include site_group_id (present at runtime from API, not in network.ts Site type).
        const sitesWithGroup = sites as Array<Site & { site_group_id?: string }>;
        const allTargetSiteIds = Array.from(
          new Set([
            ...selectedSiteIds,
            ...sitesWithGroup
              .filter(s => s.site_group_id && selectedSiteGroupIds.includes(s.site_group_id))
              .map(s => s.id),
          ])
        );
        const siteAssignments = allTargetSiteIds.map(siteId => ({
          siteId,
          siteName: sites.find(s => s.id === siteId)?.name ?? siteId,
          deploymentMode: 'ALL_PROFILES_AT_SITE' as const,
          includedProfiles: [],
          excludedProfiles: [],
        }));
        const result = await assignmentService.createWLANWithSiteCentricDeployment(
          { ...serviceData, sites: allTargetSiteIds },
          siteAssignments
        );
        if (!result.success) throw new Error(result.errors?.[0] ?? 'Creation failed');
        toast.success('WLAN Created', {
          description: `Assigned to ${result.profilesAssigned} profile(s) across ${result.sitesProcessed} site(s)`,
        });
      }

      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error('Failed to create WLAN', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-green-400" />
            Quick WLAN
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* SSID + VLAN row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="qw-ssid">SSID Name</Label>
              <Input
                id="qw-ssid"
                placeholder="Network name"
                value={ssid}
                onChange={e => setSsid(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qw-vlan">VLAN</Label>
              <Input
                id="qw-vlan"
                placeholder="1"
                value={vlan}
                onChange={e => setVlan(e.target.value)}
                type="number"
                min={1}
                max={4094}
              />
            </div>
          </div>

          {/* Authentication */}
          <div className="space-y-1.5">
            <Label htmlFor="qw-security">Authentication</Label>
            <Select
              value={security}
              onValueChange={v => setSecurity(v as QuickSecurityType)}
            >
              <SelectTrigger id="qw-security" aria-label="Authentication">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wpa2-psk">WPA2-PSK (AES)</SelectItem>
                <SelectItem value="wpa3-personal">WPA3-Personal (SAE)</SelectItem>
                <SelectItem value="wpa2-enterprise">WPA2-Enterprise</SelectItem>
                <SelectItem value="open">Open</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Passphrase — hidden for open/enterprise */}
          {requiresPassphrase && (
            <div className="space-y-1.5">
              <Label htmlFor="qw-passphrase">Passphrase</Label>
              <Input
                id="qw-passphrase"
                placeholder="Passphrase"
                type="password"
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
              />
            </div>
          )}

          <Separator />

          {/* Deployment / assignment */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Deployment</Label>
            <AssignmentSection
              value={assignmentMode}
              onChange={setAssignmentMode}
              selectedSiteIds={selectedSiteIds}
              selectedSiteGroupIds={selectedSiteGroupIds}
              onSitesChange={setSelectedSiteIds}
              onSiteGroupsChange={setSelectedSiteGroupIds}
              sites={sites}
              siteGroups={siteGroups}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid() || submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create WLAN
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/test/components/QuickWLANDialog.test.tsx 2>&1 | tail -15
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/QuickWLANDialog.tsx src/test/components/QuickWLANDialog.test.tsx
git commit -m "feat(components): add QuickWLANDialog compact creation modal"
```

---

### Task 5: Add Quick WLAN banner to `ConfigureNetworks`

**Files:**
- Modify: `src/components/ConfigureNetworks.tsx`

- [ ] **Step 1: Add import for `QuickWLANDialog` and `Zap` icon**

In `src/components/ConfigureNetworks.tsx`, add to the existing imports:

After line 17 (`import { CreateWLANDialog } from './CreateWLANDialog';`), add:

```typescript
import { QuickWLANDialog } from './QuickWLANDialog';
```

In the lucide-react import on line 13, add `Zap` to the destructured list:

```typescript
import { ..., Zap } from 'lucide-react';
```

- [ ] **Step 2: Add `showQuickWLANDialog` state**

In the state declarations block (around line 391), add after `showCreateDialog`:

```typescript
  const [showQuickWLANDialog, setShowQuickWLANDialog] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem('quick_wlan_banner_dismissed') === '1'
  );
```

- [ ] **Step 3: Add the banner strip and `QuickWLANDialog` mount**

In the JSX, find the `<Card>` that wraps the page content (line 964). Between the `<CardHeader>` closing tag and the `<CardContent>` opening tag, insert the banner and mount the dialog:

```tsx
          {/* Quick WLAN banner — entry point for fast-path creation */}
          {!isOrgScope && !bannerDismissed && (
            <div className="mx-6 mb-0 mt-2 flex items-center justify-between rounded-lg border border-green-900/50 bg-green-950/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <Zap className="h-4 w-4 text-green-400 shrink-0" />
                <div>
                  <span className="text-sm font-semibold text-green-400">Quick WLAN</span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    Get a network live in seconds — name, auth, VLAN, deploy.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-green-800 text-green-400 hover:bg-green-950 h-7 text-xs"
                  onClick={() => setShowQuickWLANDialog(true)}
                >
                  Get Started →
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground"
                  onClick={() => {
                    sessionStorage.setItem('quick_wlan_banner_dismissed', '1');
                    setBannerDismissed(true);
                  }}
                  aria-label="Dismiss Quick WLAN banner"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Quick WLAN Dialog */}
          <QuickWLANDialog
            open={showQuickWLANDialog}
            onOpenChange={setShowQuickWLANDialog}
            onSuccess={() => {
              setShowQuickWLANDialog(false);
              loadNetworks();
            }}
          />
```

Note: `X` is already imported from lucide-react on line 13 — no new import needed.

- [ ] **Step 4: Verify the page renders without TypeScript errors**

```bash
npm run type-check 2>&1 | grep "ConfigureNetworks" | head -10
```

Expected: no errors in `ConfigureNetworks.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/components/ConfigureNetworks.tsx
git commit -m "feat(ui): add Quick WLAN banner strip to ConfigureNetworks"
```

---

### Task 6: Restructure `CreateWLANDialog` — add `AssignmentSection`, remove forced-site validation

**Files:**
- Modify: `src/components/CreateWLANDialog.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/components/CreateWLANDialog.tsx`, after the existing imports, add:

```typescript
import { AssignmentSection } from './AssignmentSection';
import type { WlanAssignmentMode } from '../types/network';
import type { SiteGroup } from '../types/domain';
```

Also add `useAppContext` import:

```typescript
import { useAppContext } from '@/contexts/AppContext';
```

- [ ] **Step 2: Add assignment state to the component**

Inside `CreateWLANDialog`, after the existing `const [formData, setFormData] = useState(...)` block (line 93), add:

```typescript
  const { siteGroups } = useAppContext();
  const [assignmentMode, setAssignmentMode] = useState<WlanAssignmentMode>('all_sites');
  const [assignedSiteIds, setAssignedSiteIds] = useState<string[]>([]);
  const [assignedSiteGroupIds, setAssignedSiteGroupIds] = useState<string[]>([]);
```

- [ ] **Step 3: Remove the forced-site validation**

In `handleSubmit` (line 602–605), remove these two lines:

```typescript
    const expandedSites = getExpandedSiteIds();
    if (expandedSites.length === 0) {
      errors.push('At least one site or site group must be selected');
    }
```

Replace with a check that only validates when `assignmentMode === 'selected_targets'`:

```typescript
    if (
      assignmentMode === 'selected_targets' &&
      assignedSiteIds.length === 0 &&
      assignedSiteGroupIds.length === 0
    ) {
      errors.push('Select at least one site or site group target');
    }
```

- [ ] **Step 4: Update the submit handler to branch on `assignmentMode`**

In `handleSubmit`, find the `setSubmitting(true)` block (line 648). Replace the entire `try` block with:

```typescript
    setSubmitting(true);
    try {
      const assignmentService = new WLANAssignmentService();

      const serviceData = {
        name: formData.serviceName,
        serviceName: formData.serviceName,
        ssid: formData.ssid,
        security: formData.security,
        passphrase: formData.passphrase || undefined,
        vlan: formData.vlan || undefined,
        band: formData.band,
        enabled: formData.enabled,
        sites: assignmentMode === 'selected_targets' ? getExpandedSiteIds() : [],
        authenticatedUserDefaultRoleID: formData.authenticatedUserDefaultRoleID || undefined,
        securityConfig: formData.securityConfig,
        hidden: formData.hidden,
        maxClients: formData.maxClients,
        description: formData.description || undefined,
        mbo: formData.mbo,
        accountingEnabled: formData.accountingEnabled,
        includeHostname: formData.includeHostname,
        enable11mcSupport: formData.enable11mcSupport,
        enabled11kSupport: formData.enabled11kSupport,
        uapsdEnabled: formData.uapsdEnabled,
        admissionControlVoice: formData.admissionControlVoice,
        admissionControlVideo: formData.admissionControlVideo,
        admissionControlBestEffort: formData.admissionControlBestEffort,
        admissionControlBackgroundTraffic: formData.admissionControlBackgroundTraffic,
        clientToClientCommunication: formData.clientToClientCommunication,
        purgeOnDisconnect: formData.purgeOnDisconnect,
        beaconProtection: formData.beaconProtection,
        preAuthenticatedIdleTimeout: formData.preAuthenticatedIdleTimeout,
        postAuthenticatedIdleTimeout: formData.postAuthenticatedIdleTimeout,
        sessionTimeout: formData.sessionTimeout,
        topologyId: formData.topologyId,
        cosId: formData.cosId,
      };

      let result;

      if (assignmentMode === 'unassigned') {
        result = await assignmentService.createWLANUnassigned(serviceData);
        if (!result.success) throw new Error(result.errors?.[0] ?? 'Creation failed');
        toast.success('WLAN Created', {
          description: `${formData.ssid} saved globally (not deployed to any site)`,
        });
      } else if (assignmentMode === 'all_sites') {
        result = await assignmentService.createWLANWithAutoAssignment(serviceData);
        if (!result.success) throw new Error(result.errors?.[0] ?? 'Creation failed');
        toast.success('WLAN Created Successfully', {
          description: `Assigned to ${result.profilesAssigned} profile(s) across ${result.sitesProcessed} site(s)`,
        });
      } else {
        // selected_targets — use per-site deployment config
        const expandedSites = getExpandedSiteIds();
        const siteAssignments = Array.from(siteConfigs.values()).map(config => ({
          siteId: config.siteId,
          siteName: config.siteName,
          deploymentMode: config.deploymentMode,
          includedProfiles: config.includedProfiles,
          excludedProfiles: config.excludedProfiles,
        }));
        result = await assignmentService.createWLANWithSiteCentricDeployment(
          { ...serviceData, sites: expandedSites },
          siteAssignments
        );
        if (!result.success) throw new Error(result.errors?.[0] ?? 'Creation failed');
        const successCount = result.assignments?.filter(a => a.success).length ?? 0;
        const failCount = result.assignments?.filter(a => !a.success).length ?? 0;
        if (failCount === 0) {
          toast.success('WLAN Created Successfully', {
            description: `Assigned to ${result.profilesAssigned} profile(s) across ${result.sitesProcessed} site(s)`,
          });
        } else {
          toast.warning('WLAN Created with Partial Deployment', {
            description: `✓ ${successCount} succeeded, ✗ ${failCount} failed`,
            duration: 8000,
          });
        }
      }

      onSuccess(result);
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to create WLAN', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSubmitting(false);
    }
```

- [ ] **Step 5: Add `AssignmentSection` as the first section in the form JSX**

Find the beginning of the form body in the dialog JSX. Search for the first `<Card>` or the section heading that starts the form fields. Insert `AssignmentSection` as a new first section, before the existing SSID/security fields.

Find the line with the first form `<Card>` inside the dialog scrollable area, and prepend:

```tsx
                {/* ── 1. Deployment scope ─────────────────── */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Deployment Scope</CardTitle>
                    <CardDescription className="text-xs">
                      Choose where this WLAN will be deployed
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AssignmentSection
                      value={assignmentMode}
                      onChange={setAssignmentMode}
                      selectedSiteIds={assignedSiteIds}
                      selectedSiteGroupIds={assignedSiteGroupIds}
                      onSitesChange={ids => {
                        setAssignedSiteIds(ids);
                        setFormData(prev => ({ ...prev, selectedSites: ids }));
                      }}
                      onSiteGroupsChange={ids => {
                        setAssignedSiteGroupIds(ids);
                        setFormData(prev => ({ ...prev, selectedSiteGroups: ids }));
                      }}
                      sites={sites}
                      siteGroups={siteGroups}
                    />
                  </CardContent>
                </Card>
```

- [ ] **Step 6: Conditionalize the per-site DeploymentModeSelector section**

Find the `{/* Deployment Mode Selectors */}` block (line 1734). Change its render condition from:

```tsx
{formData.selectedSites.length > 0 && !discoveringProfiles && (
```

to:

```tsx
{assignmentMode === 'selected_targets' && formData.selectedSites.length > 0 && !discoveringProfiles && (
```

- [ ] **Step 7: Verify TypeScript compiles cleanly for this file**

```bash
npm run type-check 2>&1 | grep "CreateWLANDialog" | head -20
```

Expected: no new errors introduced by these changes (pre-existing errors in other files are unrelated).

- [ ] **Step 8: Commit**

```bash
git add src/components/CreateWLANDialog.tsx
git commit -m "feat(components): restructure CreateWLANDialog with prominent AssignmentSection"
```

---

## Verification Checklist

Run after all tasks complete:

```bash
# All new tests pass
npm run test -- src/test/types/wlanAssignmentMode.test.ts src/test/services/wlanAssignment.unassigned.test.ts src/test/components/AssignmentSection.test.tsx src/test/components/QuickWLANDialog.test.tsx 2>&1 | tail -20

# No new type errors in modified files
npm run type-check 2>&1 | grep -E "AssignmentSection|QuickWLANDialog|ConfigureNetworks|wlanAssignment\.ts" | head -20

# Dev server starts cleanly
npm run dev
```

**Manual smoke tests:**
1. Open Networks page → Quick WLAN banner visible (non-org scope)
2. Click "Get Started →" → QuickWLANDialog opens
3. Fill SSID + passphrase → select "Not assigned" → Create → WLAN appears in table, no profiles assigned
4. Repeat with "All sites" → toast shows profile count
5. Click "Create WLAN" header button → AssignmentSection appears first in dialog
6. Select "Not assigned" → per-site deployment section hidden → submit works
7. Select "Select sites / site groups" → chip picker appears → per-site section visible after sites selected
8. Dismiss banner → reload tab → banner gone; open new tab → banner reappears
