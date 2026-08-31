/**
 * Groups tab (/access-control/v1/groups) — grid + editor. Records are keyed
 * by name; the LIST omits `entries`, so the detail is fetched before the
 * editor opens (and before Clone seeds a copy). Predefined groups
 * (is_readonly) are read-only on the Gateway: their editors render static and
 * they cannot be deleted — Clone is how you start from one.
 */
import React, { useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import { getUserFriendlyMessage } from '../../../services/errorHandler';
import {
  acGroupsService,
  type AcGroup,
} from '../../../services/configure/accessControlFamilyService';
import { ResourceGridPage, useResourceCrud } from '../_kit';
import { withRowClick } from '../policy/gridHelpers';
import { GroupEditor } from './GroupEditor';
import { GROUP_MODES, dashText, yesNo } from './accessControlModel';

interface EditorState {
  record: AcGroup | null;
  /** Clone seed — create mode with prefilled type/entries. */
  seed: AcGroup | null;
}

export function GroupsPage() {
  const crud = useResourceCrud<AcGroup>(acGroupsService, {
    resourceLabel: 'group',
    getId: (g) => g.name,
    getName: (g) => g.name,
  });
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  /** The list omits entries — always edit/clone from the full record. */
  const loadDetail = async (name: string): Promise<AcGroup | null> => {
    setDetailLoading(true);
    try {
      return await acGroupsService.get(name);
    } catch (error) {
      toast.error(`Failed to load group "${name}"`, {
        description: getUserFriendlyMessage(error),
      });
      return null;
    } finally {
      setDetailLoading(false);
    }
  };

  const openEdit = async (row: AcGroup) => {
    const detail = await loadDetail(row.name);
    if (detail) setEditor({ record: detail, seed: null });
  };

  const openClone = async (row: AcGroup) => {
    const detail = await loadDetail(row.name);
    if (!detail) return;
    setEditor({
      record: null,
      seed: {
        ...structuredClone(detail),
        name: '',
        is_readonly: false,
        is_registration: false,
      },
    });
  };

  const columns = useMemo<ColDef<AcGroup>[]>(
    () =>
      withRowClick<AcGroup>(
        [
          { field: 'name', headerName: 'Name', flex: 1.4, minWidth: 200, sort: 'asc' },
          {
            field: 'type',
            headerName: 'Group Type',
            minWidth: 190,
            flex: 1,
            cellClass: 'font-medium text-primary',
          },
          {
            field: 'type_category',
            headerName: 'Category',
            minWidth: 160,
            flex: 1,
            valueFormatter: (p) => dashText(p.value),
          },
          {
            headerName: 'Mode',
            minWidth: 120,
            valueGetter: (p) => {
              const mode = GROUP_MODES.find((m) => m.id === p.data?.mode);
              return mode ? mode.label : (p.data?.mode ?? '—');
            },
          },
          {
            headerName: 'Entries',
            width: 100,
            // The list payload omits entries; a count renders only when known.
            valueGetter: (p) =>
              Array.isArray(p.data?.entries) ? p.data.entries.length : null,
            valueFormatter: (p) => dashText(p.value),
          },
          {
            field: 'is_registration',
            headerName: 'Registration',
            minWidth: 130,
            valueFormatter: (p) => yesNo(p.value),
          },
          {
            field: 'is_readonly',
            headerName: 'Read Only',
            minWidth: 110,
            valueFormatter: (p) => yesNo(p.value),
          },
          {
            field: 'description',
            headerName: 'Description',
            minWidth: 240,
            flex: 1.6,
            valueFormatter: (p) => dashText(p.value),
          },
        ],
        (row) => void openEdit(row)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleSave = async (payload: Partial<AcGroup>, id?: string) => {
    const saved = await crud.save(payload, id);
    if (saved !== null) setEditor(null);
  };

  return (
    <>
      <ResourceGridPage<AcGroup>
        title="Groups"
        description="User, end-system, device type, location and time groups referenced by Access Control rules"
        icon={Users}
        rows={crud.items}
        columnDefs={columns}
        loading={crud.loading || detailLoading}
        storageKey="ac-groups"
        getRowId={(g) => g.name}
        getSearchText={(g) => `${g.name} ${g.type ?? ''} ${g.type_category ?? ''}`}
        canDeleteRow={(g) => !g.is_readonly && g.canDelete !== false}
        onAdd={() => setEditor({ record: null, seed: null })}
        onClone={(row) => void openClone(row)}
        onRefresh={() => void crud.refresh()}
        onDelete={async (rows) => {
          for (const row of rows) await crud.remove(row.name, row.name);
        }}
      />
      {editor && (
        <GroupEditor
          key={editor.record?.name ?? 'new'}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          record={editor.record}
          seed={editor.seed}
          siblingNames={crud.items.map((g) => g.name)}
          saving={crud.saving}
          onSave={handleSave}
        />
      )}
    </>
  );
}
