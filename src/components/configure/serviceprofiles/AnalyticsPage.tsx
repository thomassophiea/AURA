/**
 * Analytics Profiles sub-page (specialized-profiles-parity.md §5). Live CRUD
 * against /v3/analytics: Name / Collector Address / Export Interval grid.
 */
import React, { useCallback } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { BarChart3 } from 'lucide-react';
import { analyticsService } from '../../../services/configure';
import type { AnalyticsProfile } from '../../../types/configure';
import { ProfileSubPage } from './ProfileSubPage';
import { AnalyticsEditor } from './AnalyticsEditor';

function seed(def: AnalyticsProfile): AnalyticsProfile {
  const s = structuredClone(def);
  s.name = '';
  s.destAddr = s.destAddr ?? '0.0.0.0';
  s.reportFreq = s.reportFreq ?? 60;
  s.canEdit = true;
  s.canDelete = true;
  return s;
}

export function AnalyticsPage() {
  const columns = useCallback(
    (openEdit: (row: AnalyticsProfile) => void): ColDef<AnalyticsProfile>[] => [
      {
        headerName: 'Name',
        field: 'name',
        flex: 2,
        cellRenderer: (p: ICellRendererParams<AnalyticsProfile>) =>
          p.data ? (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => p.data && openEdit(p.data)}
            >
              {p.data.name}
            </button>
          ) : null,
      },
      { headerName: 'Collector Address', field: 'destAddr', flex: 1 },
      { headerName: 'Export Interval (s)', field: 'reportFreq', width: 170, type: 'numeric' },
    ],
    []
  );

  return (
    <ProfileSubPage<AnalyticsProfile>
      service={analyticsService}
      label="analytics profile"
      title="Analytics Profiles"
      description="NetFlow analytics profiles (/v3/analytics)"
      icon={BarChart3}
      storageKey="analyticsprofiles"
      columns={columns}
      seed={seed}
      renderEditor={({ record, seed: s, rows, saving, onSave, close }) => (
        <AnalyticsEditor
          key={record?.id ?? 'new'}
          open
          onOpenChange={(o) => !o && close()}
          record={record}
          seed={s}
          rows={rows}
          saving={saving}
          onSave={onSave}
        />
      )}
    />
  );
}

export default AnalyticsPage;
