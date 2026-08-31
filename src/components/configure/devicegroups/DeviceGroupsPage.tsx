/**
 * Aggregated Device Groups page (PLM §7e). Device groups live inside site
 * records on the wire (/v3/sites → site.deviceGroups[], verified live);
 * same-named records across sites aggregate into one row here. Saves and
 * deletes fan out site-by-site through sitesService (PUT the owning site),
 * and partial failure is reported honestly, naming which sites failed.
 * Data loads on mount + manual Refresh only.
 */
import React, { useCallback, useMemo, useState } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Boxes } from 'lucide-react';
import { toast } from 'sonner';
import { ResourceGridPage } from '../_kit';
import { sitesService } from '../../../services/configure/sitesService';
import { getUserFriendlyMessage } from '../../../services/errorHandler';
import {
  aggregateDeviceGroups,
  buildDeletePlans,
  buildSiteSavePlans,
  rfKindForProfile,
  type AggregatedDeviceGroup,
  type AggregatedGroupForm,
  type SiteSavePlan,
} from './devicegroupsModel';
import { useDeviceGroupsData } from './useDeviceGroupsData';
import { DeviceGroupEditorSheet } from './DeviceGroupEditorSheet';

interface EditorState {
  record: AggregatedDeviceGroup | null;
}

interface PlanOutcome {
  saved: string[];
  failed: { siteName: string; message: string }[];
}

/** Apply the per-site plans sequentially; never throw — report per site. */
async function applyPlans(plans: SiteSavePlan[]): Promise<PlanOutcome> {
  const outcome: PlanOutcome = { saved: [], failed: [] };
  for (const plan of plans) {
    try {
      await sitesService.update(plan.siteId, plan.site);
      outcome.saved.push(plan.siteName);
    } catch (error) {
      outcome.failed.push({ siteName: plan.siteName, message: getUserFriendlyMessage(error) });
    }
  }
  return outcome;
}

function reportOutcome(action: string, groupName: string, outcome: PlanOutcome): void {
  const total = outcome.saved.length + outcome.failed.length;
  if (outcome.failed.length === 0) {
    toast.success(
      `${action} device group "${groupName}" on ${total} site${total === 1 ? '' : 's'}`
    );
    return;
  }
  const failedNames = outcome.failed.map((f) => f.siteName).join(', ');
  toast.error(
    `${action} device group "${groupName}" reached ${outcome.saved.length} of ${total} sites`,
    { description: `Failed: ${failedNames} — ${outcome.failed[0].message}` }
  );
}

export function DeviceGroupsPage() {
  const data = useDeviceGroupsData();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => aggregateDeviceGroups(data.sites), [data.sites]);
  const profileById = useMemo(() => new Map(data.profiles.map((p) => [p.id, p])), [data.profiles]);
  const rfById = useMemo(() => new Map(data.rfPolicies.map((r) => [r.id, r])), [data.rfPolicies]);

  const openEdit = useCallback((record: AggregatedDeviceGroup) => setEditor({ record }), []);

  const columnDefs = useMemo<ColDef<AggregatedDeviceGroup>[]>(
    () => [
      {
        headerName: 'Name',
        field: 'groupName',
        flex: 1.4,
        minWidth: 160,
        cellRenderer: (params: ICellRendererParams<AggregatedDeviceGroup>) =>
          params.data ? (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => params.data && openEdit(params.data)}
            >
              {params.data.groupName}
            </button>
          ) : null,
      },
      {
        headerName: 'AP Platform',
        flex: 0.8,
        minWidth: 120,
        valueGetter: (p) => (p.data ? (profileById.get(p.data.profileId)?.apPlatform ?? '—') : ''),
      },
      {
        headerName: 'Profile',
        flex: 1,
        minWidth: 160,
        valueGetter: (p) => {
          if (!p.data) return '';
          const name = profileById.get(p.data.profileId)?.name ?? '—';
          return p.data.profileConflict ? `${name} (conflict)` : name;
        },
      },
      {
        headerName: 'RF Management',
        flex: 1,
        minWidth: 150,
        valueGetter: (p) => {
          if (!p.data) return '';
          const name = p.data.rfMgmtPolicyId
            ? (rfById.get(p.data.rfMgmtPolicyId)?.name ?? '—')
            : '—';
          return p.data.rfConflict ? `${name} (conflict)` : name;
        },
      },
      {
        headerName: 'Sites',
        width: 100,
        type: 'numeric',
        valueGetter: (p) => p.data?.siteCount ?? 0,
      },
      {
        headerName: 'Access Points',
        width: 140,
        type: 'numeric',
        valueGetter: (p) => p.data?.apCount ?? 0,
      },
    ],
    [openEdit, profileById, rfById]
  );

  const handleSave = useCallback(
    async (form: AggregatedGroupForm) => {
      setSaving(true);
      try {
        const rfKind = rfKindForProfile(profileById.get(form.profileId) ?? null);
        const plans = buildSiteSavePlans(data.sites, editor?.record ?? null, form, rfKind);
        if (plans.length === 0) {
          toast.error('Add the device group to at least one site before saving');
          return;
        }
        const outcome = await applyPlans(plans);
        reportOutcome(editor?.record ? 'Updated' : 'Created', form.groupName, outcome);
        setEditor(null);
        await data.refresh();
      } finally {
        setSaving(false);
      }
    },
    [data, editor, profileById]
  );

  const handleDelete = useCallback(
    async (record: AggregatedDeviceGroup) => {
      setSaving(true);
      try {
        const outcome = await applyPlans(buildDeletePlans(data.sites, record));
        reportOutcome('Deleted', record.groupName, outcome);
        setEditor(null);
        await data.refresh();
      } finally {
        setSaving(false);
      }
    },
    [data]
  );

  return (
    <>
      <ResourceGridPage<AggregatedDeviceGroup>
        title="Device Groups"
        description="One AP platform, one profile, one RF policy — applied to as many sites as needed. An access point belongs to one device group."
        icon={Boxes}
        rows={rows}
        columnDefs={columnDefs}
        loading={data.loading}
        storageKey="devicegroups"
        getRowId={(row) => row.groupName}
        getSearchText={(row) =>
          `${row.groupName} ${profileById.get(row.profileId)?.name ?? ''} ${profileById.get(row.profileId)?.apPlatform ?? ''}`
        }
        onAdd={() => setEditor({ record: null })}
        onRefresh={() => void data.refresh()}
      />
      {editor && (
        <DeviceGroupEditorSheet
          key={editor.record?.groupName ?? 'new'}
          record={editor.record}
          sites={data.sites}
          profiles={data.profiles}
          rfPolicies={data.rfPolicies}
          aps={data.aps}
          saving={saving}
          onSave={handleSave}
          onDelete={
            editor.record ? () => handleDelete(editor.record as AggregatedDeviceGroup) : undefined
          }
          onOpenChange={(o) => !o && setEditor(null)}
        />
      )}
    </>
  );
}

export default DeviceGroupsPage;
