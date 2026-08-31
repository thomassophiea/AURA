/**
 * LDAP Configurations tab (/access-control/v1/ldap_configurations) — grid +
 * editor. Records are keyed by config_name (no id field on this API). Empty
 * on the lab appliance — that is its real state.
 */
import React, { useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { FolderTree } from 'lucide-react';
import {
  acLdapConfigurationsService,
  type AcLdapConfiguration,
} from '../../../services/configure/accessControlFamilyService';
import { ResourceGridPage, useResourceCrud } from '../_kit';
import { withRowClick } from '../policy/gridHelpers';
import { LdapEditor } from './LdapEditor';
import { dashText } from './accessControlModel';

interface EditorState {
  record: AcLdapConfiguration | null;
}

export function LdapConfigurationsPage() {
  const crud = useResourceCrud<AcLdapConfiguration>(acLdapConfigurationsService, {
    resourceLabel: 'LDAP configuration',
    getId: (r) => r.config_name,
    getName: (r) => r.config_name,
  });
  const [editor, setEditor] = useState<EditorState | null>(null);

  const columns = useMemo<ColDef<AcLdapConfiguration>[]>(
    () =>
      withRowClick<AcLdapConfiguration>(
        [
          {
            field: 'config_name',
            headerName: 'LDAP Configuration',
            flex: 1.4,
            minWidth: 200,
            sort: 'asc',
          },
          {
            headerName: 'URLs',
            width: 90,
            type: 'numeric',
            valueGetter: (p) =>
              Array.isArray(p.data?.ldap_configuration_urls)
                ? p.data.ldap_configuration_urls.length
                : 0,
          },
          {
            field: 'administrator_username',
            headerName: 'Administrator',
            minWidth: 180,
            flex: 1,
            valueFormatter: (p) => dashText(p.value),
          },
          {
            field: 'user_authentication_type',
            headerName: 'User Authentication Type',
            minWidth: 220,
            flex: 1,
            valueFormatter: (p) => dashText(p.value),
          },
          {
            field: 'user_search_root',
            headerName: 'User Search Root',
            minWidth: 240,
            flex: 1.4,
            valueFormatter: (p) => dashText(p.value),
          },
        ],
        (row) => setEditor({ record: row })
      ),
    []
  );

  const handleSave = async (payload: Partial<AcLdapConfiguration>, id?: string) => {
    const saved = await crud.save(payload, id);
    if (saved !== null) setEditor(null);
  };

  return (
    <>
      <ResourceGridPage<AcLdapConfiguration>
        title="LDAP Configurations"
        description="LDAP servers used for Access Control user authentication and lookup"
        icon={FolderTree}
        rows={crud.items}
        columnDefs={columns}
        loading={crud.loading}
        storageKey="ac-ldap-configurations"
        getRowId={(r) => r.config_name}
        getSearchText={(r) => `${r.config_name} ${r.administrator_username ?? ''}`}
        onAdd={() => setEditor({ record: null })}
        onRefresh={() => void crud.refresh()}
        onDelete={async (rows) => {
          for (const row of rows) await crud.remove(row.config_name, row.config_name);
        }}
      />
      {editor && (
        <LdapEditor
          key={editor.record?.config_name ?? 'new'}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          record={editor.record}
          siblingNames={crud.items.map((r) => r.config_name)}
          saving={crud.saving}
          onSave={handleSave}
        />
      )}
    </>
  );
}
