/**
 * Classes of Service (/v1/cos) — grid (name, 802.1p, ToS/DSCP, mask, resolved
 * in/outbound limiter names) + CosEditor. Rate limiters are co-managed here so
 * the editor's inline limiter add/edit/delete persists through the real API.
 */
import React, { useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { Layers } from 'lucide-react';
import { cosService, rateLimitersService } from '../../../services/configure';
import type { Cos, RateLimiter } from '../../../types/configure';
import { ResourceGridPage, useDefaults, useResourceCrud } from '../_kit';
import { CosEditor } from './CosEditor';
import { withRowClick } from './gridHelpers';
import { fmtPriority, tosHex } from './policyUtils';

interface EditorState {
  record: Cos | null;
  seed: Partial<Cos> | null;
}

export function CosPage() {
  const crud = useResourceCrud<Cos>(cosService, {
    resourceLabel: 'Class of Service',
    getId: (c) => c.id,
    getName: (c) => c.cosName,
  });
  const rlCrud = useResourceCrud<RateLimiter>(rateLimitersService, {
    resourceLabel: 'rate limiter',
    getId: (r) => r.id,
    getName: (r) => r.name,
  });
  const defaults = useDefaults<Cos>(() => cosService.getDefault(), 'Class of Service');
  const [editor, setEditor] = useState<EditorState | null>(null);

  const openAdd = async () => {
    const seed = await defaults.load();
    const template: Partial<Cos> = seed ? { ...seed } : {};
    delete template.id;
    // The /default template flags itself predefined; user-created CoS are not.
    template.predefined = false;
    setEditor({ record: null, seed: template });
  };

  const limiters = rlCrud.items;
  const columns = useMemo<ColDef<Cos>[]>(() => {
    const rlName = (id: string | null | undefined) =>
      id ? (limiters.find((r) => r.id === id)?.name ?? id) : 'None';
    return withRowClick<Cos>(
        [
          { field: 'cosName', headerName: 'Name', flex: 1.5, minWidth: 200, sort: 'asc' },
          {
            headerName: '802.1p',
            minWidth: 110,
            valueGetter: (p) => fmtPriority(p.data?.cosQos?.priority),
          },
          {
            headerName: 'ToS/DSCP',
            minWidth: 110,
            valueGetter: (p) =>
              p.data?.cosQos?.tosDscp != null ? tosHex(p.data.cosQos.tosDscp) : '—',
          },
          {
            headerName: 'Inbound Rate Limit',
            minWidth: 160,
            valueGetter: (p) => rlName(p.data?.inboundRateLimiterId),
          },
          {
            headerName: 'Outbound Rate Limit',
            minWidth: 160,
            valueGetter: (p) => rlName(p.data?.outboundRateLimiterId),
          },
        ],
      (row) => setEditor({ record: row, seed: null })
    );
  }, [limiters]);

  return (
    <>
      <ResourceGridPage<Cos>
        title="Classes of Service"
        description="Priority and bandwidth marking applied by roles and networks"
        icon={Layers}
        rows={crud.items}
        columnDefs={columns}
        loading={crud.loading}
        storageKey="policy-cos"
        getRowId={(c) => c.id}
        getSearchText={(c) => c.cosName ?? ''}
        onAdd={() => void openAdd()}
        onRefresh={() => {
          void crud.refresh();
          void rlCrud.refresh();
        }}
        onDelete={async (rows) => {
          for (const row of rows) await crud.remove(row.id, row.cosName);
        }}
      />
      {editor && (
        <CosEditor
          key={editor.record?.id ?? 'new'}
          record={editor.record}
          seed={editor.seed}
          rateLimiters={rlCrud.items}
          saving={crud.saving}
          rlSaving={rlCrud.saving}
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          onSave={async (payload, id) => {
            const saved = await crud.save(payload, id);
            if (saved) setEditor(null);
          }}
          onRlSave={(payload, id) => rlCrud.save(payload, id)}
          onRlDelete={(limiter) => rlCrud.remove(limiter.id, limiter.name)}
        />
      )}
    </>
  );
}
