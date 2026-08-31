/**
 * Local Password Repository tab — lists the USERS inside the gateway's
 * password repositories (it ships exactly one, "Default"). The wire has no
 * per-user endpoint: every mutation is a read-modify-write PUT of the owning
 * repository (see acLocalPasswordUsersService). Row identity is the
 * repository:username composite.
 */
import React, { useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { KeyRound } from 'lucide-react';
import {
  acLocalPasswordUsersService,
  repoUserId,
  type AcRepoUserRecord,
} from '../../../services/configure/accessControlFamilyService';
import { ResourceGridPage, useResourceCrud } from '../_kit';
import { withRowClick } from '../policy/gridHelpers';
import { RepoUserEditor } from './RepoUserEditor';
import { dashText, yesNo } from './accessControlModel';

interface EditorState {
  record: AcRepoUserRecord | null;
}

export function LocalPasswordRepositoryPage() {
  const crud = useResourceCrud<AcRepoUserRecord>(acLocalPasswordUsersService, {
    resourceLabel: 'user',
    getId: repoUserId,
    getName: (u) => u.username,
  });
  const [editor, setEditor] = useState<EditorState | null>(null);

  const columns = useMemo<ColDef<AcRepoUserRecord>[]>(
    () =>
      withRowClick<AcRepoUserRecord>(
        [
          { field: 'username', headerName: 'Username', flex: 1.2, minWidth: 160, sort: 'asc' },
          {
            field: 'display_name',
            headerName: 'Display Name',
            minWidth: 160,
            flex: 1,
            valueFormatter: (p) => dashText(p.value),
          },
          {
            field: 'last_name',
            headerName: 'Last Name',
            minWidth: 140,
            flex: 1,
            valueFormatter: (p) => dashText(p.value),
          },
          {
            field: 'password_hash_type',
            headerName: 'Password Hash Type',
            minWidth: 200,
            flex: 1,
            valueFormatter: (p) => dashText(p.value),
          },
          {
            field: 'enabled',
            headerName: 'Enabled',
            minWidth: 100,
            valueFormatter: (p) => yesNo(p.value),
          },
          {
            field: 'description',
            headerName: 'Description',
            minWidth: 200,
            flex: 1.2,
            valueFormatter: (p) => dashText(p.value),
          },
        ],
        (row) => setEditor({ record: row })
      ),
    []
  );

  const handleSave = async (payload: Partial<AcRepoUserRecord>, id?: string) => {
    const saved = await crud.save(payload, id);
    if (saved !== null) setEditor(null);
  };

  const siblingUsernames = (repository: string) =>
    crud.items.filter((u) => u.repository === repository).map((u) => u.username);

  return (
    <>
      <ResourceGridPage<AcRepoUserRecord>
        title="Local Password Repository"
        description="Users stored in the gateway's local password repository"
        icon={KeyRound}
        rows={crud.items}
        columnDefs={columns}
        loading={crud.loading}
        storageKey="ac-local-password-repo"
        getRowId={repoUserId}
        getSearchText={(u) => `${u.username} ${u.display_name ?? ''} ${u.last_name ?? ''}`}
        onAdd={() => setEditor({ record: null })}
        onRefresh={() => void crud.refresh()}
        onDelete={async (rows) => {
          for (const row of rows) await crud.remove(repoUserId(row), row.username);
        }}
      />
      {editor && (
        <RepoUserEditor
          key={editor.record ? repoUserId(editor.record) : 'new'}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          record={editor.record}
          siblingUsernames={siblingUsernames(editor.record?.repository ?? 'Default')}
          saving={crud.saving}
          onSave={handleSave}
        />
      )}
    </>
  );
}
