/**
 * RADIUS Servers tab (/access-control/v1/radius_servers) — grid + editor.
 * Records are keyed by server_ip (no id field on this API). The list on the
 * lab appliance is truthfully empty — an empty grid is the appliance's real
 * state, not a gap.
 */
import React, { useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { Radio } from 'lucide-react';
import {
  acRadiusServersService,
  type AcRadiusServer,
} from '../../../services/configure/accessControlFamilyService';
import { ResourceGridPage, useResourceCrud } from '../_kit';
import { withRowClick } from '../policy/gridHelpers';
import { RadiusServerEditor } from './RadiusServerEditor';
import { dashText } from './accessControlModel';

interface EditorState {
  record: AcRadiusServer | null;
}

export function RadiusServersPage() {
  const crud = useResourceCrud<AcRadiusServer>(acRadiusServersService, {
    resourceLabel: 'RADIUS server',
    getId: (r) => r.server_ip,
    getName: (r) => r.server_ip,
  });
  const [editor, setEditor] = useState<EditorState | null>(null);

  const columns = useMemo<ColDef<AcRadiusServer>[]>(
    () =>
      withRowClick<AcRadiusServer>(
        [
          {
            field: 'server_ip',
            headerName: 'RADIUS Server IP',
            flex: 1.4,
            minWidth: 180,
            sort: 'asc',
          },
          {
            headerName: 'Auth Port',
            width: 110,
            type: 'numeric',
            valueGetter: (p) => p.data?.authorization_client_port,
          },
          {
            headerName: 'Acct Port',
            width: 110,
            type: 'numeric',
            valueGetter: (p) => p.data?.accounting_client_port,
          },
          {
            headerName: 'Timeout',
            width: 100,
            type: 'numeric',
            valueGetter: (p) => p.data?.authentication_timeout,
          },
          {
            headerName: 'Retries',
            width: 100,
            type: 'numeric',
            valueGetter: (p) => p.data?.authentication_retry_count,
          },
          {
            field: 'username_format',
            headerName: 'Username Format',
            minWidth: 160,
            flex: 1,
            valueFormatter: (p) => dashText(p.value),
          },
          {
            headerName: 'Health Check',
            minWidth: 130,
            valueGetter: (p) =>
              p.data?.use_server_status_request || p.data?.use_access_request ? 'On' : 'Off',
          },
        ],
        (row) => setEditor({ record: row })
      ),
    []
  );

  const handleSave = async (payload: Partial<AcRadiusServer>, id?: string) => {
    const saved = await crud.save(payload, id);
    if (saved !== null) setEditor(null);
  };

  return (
    <>
      <ResourceGridPage<AcRadiusServer>
        title="RADIUS Servers"
        description="Access Control RADIUS servers referenced by AAA configurations"
        icon={Radio}
        rows={crud.items}
        columnDefs={columns}
        loading={crud.loading}
        storageKey="ac-radius-servers"
        getRowId={(r) => r.server_ip}
        getSearchText={(r) => `${r.server_ip} ${r.username_format ?? ''}`}
        onAdd={() => setEditor({ record: null })}
        onRefresh={() => void crud.refresh()}
        onDelete={async (rows) => {
          for (const row of rows) await crud.remove(row.server_ip, row.server_ip);
        }}
      />
      {editor && (
        <RadiusServerEditor
          key={editor.record?.server_ip ?? 'new'}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          record={editor.record}
          saving={crud.saving}
          onSave={handleSave}
        />
      )}
    </>
  );
}
