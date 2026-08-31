/**
 * Rules tab (/access-control/v1/rules) — grid + editor. The collection GET
 * returns rule SETS ({id, reorderable, rules[]}); the grid shows the flattened
 * rules and per-record CRUD is keyed by the RULE name (mirroring the
 * gateway's rule.html save path). Reference data (groups per criterion
 * category, roles) loads once on mount and again on manual Refresh — never on
 * a poll.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { ListChecks } from 'lucide-react';
import {
  acGroupsService,
  acPortalsService,
  acRulesService,
  type AcRule,
} from '../../../services/configure/accessControlFamilyService';
import { rolesService } from '../../../services/configure/rolesService';
import { logger } from '../../../services/logger';
import { ResourceGridPage, useResourceCrud } from '../_kit';
import { withRowClick } from '../policy/gridHelpers';
import { RuleEditor } from './RuleEditor';
import { RULE_CRITERIA, type RuleCriterionKey, criterionText, yesNo } from './accessControlModel';

interface EditorState {
  record: AcRule | null;
}

const EMPTY_GROUPS: Record<RuleCriterionKey, string[]> = {
  user_group: [],
  end_system_group: [],
  device_type_group: [],
  location_group: [],
  time_group: [],
};

export function RulesPage() {
  const crud = useResourceCrud<AcRule>(acRulesService, {
    resourceLabel: 'rule',
    getId: (r) => r.name,
    getName: (r) => r.name,
  });
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [groupOptions, setGroupOptions] =
    useState<Record<RuleCriterionKey, string[]>>(EMPTY_GROUPS);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const [portalNames, setPortalNames] = useState<string[]>([]);

  /** Groups (filtered per criterion category) + roles + portals for the editor selects. */
  const loadRefData = useCallback(async () => {
    try {
      const groups = await acGroupsService.list();
      const byCriterion = { ...EMPTY_GROUPS };
      for (const criterion of RULE_CRITERIA) {
        byCriterion[criterion.id] = groups
          .filter((g) => g.type_category === criterion.category)
          .map((g) => g.name)
          .sort((a, b) => a.localeCompare(b));
      }
      setGroupOptions(byCriterion);
    } catch (error) {
      logger.warn('[configure/ac-rules] failed to load groups for criteria selects', error);
    }
    try {
      const roles = await rolesService.list();
      setRoleOptions(
        roles
          .map((r) => r.name)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
      );
    } catch (error) {
      logger.warn('[configure/ac-rules] failed to load roles for the Role select', error);
    }
    try {
      const portals = await acPortalsService.list();
      setPortalNames(portals.map((p) => p.name).filter(Boolean));
    } catch (error) {
      logger.warn('[configure/ac-rules] failed to load portals for the Portal select', error);
    }
  }, []);

  useEffect(() => {
    void loadRefData();
  }, [loadRefData]);

  /**
   * The controller's portal collection (GET /access-control/v1/portals — the
   * same source the gateway's own rule editor uses), unioned with every value
   * already on the wire so an unlisted portal on an existing rule stays
   * selectable for round-trip.
   */
  const portalOptions = useMemo(() => {
    const seen = new Set<string>(portalNames.length > 0 ? portalNames : ['Default']);
    for (const rule of crud.items) {
      if (rule.portal?.value) seen.add(rule.portal.value);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [crud.items, portalNames]);

  const columns = useMemo<ColDef<AcRule>[]>(
    () =>
      withRowClick<AcRule>(
        [
          { field: 'name', headerName: 'Name', flex: 1.4, minWidth: 200 },
          {
            field: 'enabled',
            headerName: 'Enabled',
            minWidth: 100,
            valueFormatter: (p) => yesNo(p.value),
          },
          {
            headerName: 'User Group',
            minWidth: 150,
            valueGetter: (p) => criterionText(p.data?.user_group),
          },
          {
            headerName: 'End-System Group',
            minWidth: 170,
            valueGetter: (p) => criterionText(p.data?.end_system_group),
          },
          {
            headerName: 'Device Type Group',
            minWidth: 170,
            valueGetter: (p) => criterionText(p.data?.device_type_group),
          },
          {
            headerName: 'Location Group',
            minWidth: 160,
            valueGetter: (p) => criterionText(p.data?.location_group),
          },
          {
            headerName: 'Time Group',
            minWidth: 140,
            valueGetter: (p) => criterionText(p.data?.time_group),
          },
          {
            headerName: 'Role',
            minWidth: 150,
            cellClass: 'font-medium',
            valueGetter: (p) => p.data?.role?.value || '—',
          },
          {
            headerName: 'Portal',
            minWidth: 130,
            valueGetter: (p) => p.data?.portal?.value || '—',
          },
        ],
        (row) => setEditor({ record: row })
      ),
    []
  );

  const handleSave = async (payload: Partial<AcRule>, id?: string) => {
    const saved = await crud.save(payload, id);
    if (saved !== null) setEditor(null);
  };

  return (
    <>
      <ResourceGridPage<AcRule>
        title="Rules"
        description="Access Control rules mapping group criteria to a Role and Portal"
        icon={ListChecks}
        rows={crud.items}
        columnDefs={columns}
        loading={crud.loading}
        storageKey="ac-rules"
        getRowId={(r) => r.name}
        getSearchText={(r) => `${r.name} ${r.role?.value ?? ''} ${r.portal?.value ?? ''}`}
        onAdd={() => setEditor({ record: null })}
        onRefresh={() => {
          void crud.refresh();
          void loadRefData();
        }}
        onDelete={async (rows) => {
          for (const row of rows) await crud.remove(row.name, row.name);
        }}
      />
      {editor && (
        <RuleEditor
          key={editor.record?.name ?? 'new'}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          record={editor.record}
          groupOptions={groupOptions}
          roleOptions={roleOptions}
          portalOptions={portalOptions}
          siblingNames={crud.items.map((r) => r.name)}
          saving={crud.saving}
          onSave={handleSave}
        />
      )}
    </>
  );
}
