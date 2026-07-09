/**
 * Rate Limiters (/v1/ratelimiters) — grid + two-field editor (rate.html).
 * Create seeds from the controller's /default template; delete honors
 * canDelete. The record is exactly { name, cirKbps } — no CBS field exists.
 */
import React, { useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { Gauge } from 'lucide-react';
import { rateLimitersService } from '../../../services/configure';
import type { RateLimiter } from '../../../types/configure';
import { ResourceGridPage, useDefaults, useResourceCrud } from '../_kit';
import { RateLimiterDialog } from './RateLimiterDialog';
import { withRowClick } from './gridHelpers';

interface EditorState {
  record: RateLimiter | null;
  seed: Partial<RateLimiter> | null;
}

export function RateLimitersPage() {
  const crud = useResourceCrud<RateLimiter>(rateLimitersService, {
    resourceLabel: 'rate limiter',
    getId: (r) => r.id,
    getName: (r) => r.name,
  });
  const defaults = useDefaults<RateLimiter>(
    () => rateLimitersService.getDefault(),
    'rate limiter'
  );
  const [editor, setEditor] = useState<EditorState | null>(null);

  const openAdd = async () => {
    const seed = await defaults.load();
    const template = seed ? { ...seed } : {};
    delete (template as Partial<RateLimiter>).id;
    setEditor({ record: null, seed: template });
  };

  const columns = useMemo<ColDef<RateLimiter>[]>(
    () =>
      withRowClick<RateLimiter>(
        [
          { field: 'name', headerName: 'Name', flex: 1.5, minWidth: 200, sort: 'asc' },
          {
            field: 'cirKbps',
            headerName: 'Average Rate (CIR) Kbps',
            flex: 1,
            minWidth: 180,
            type: 'numeric',
          },
        ],
        (row) => setEditor({ record: row, seed: null })
      ),
    []
  );

  const handleSubmit = async (payload: Partial<RateLimiter>, id?: string) => {
    const body = id ? payload : { ...(editor?.seed ?? {}), ...payload };
    const saved = await crud.save(body, id);
    if (saved) setEditor(null);
  };

  return (
    <>
      <ResourceGridPage<RateLimiter>
        title="Rate Limiters"
        description="Committed information rate (CIR) limiters referenced by Classes of Service"
        icon={Gauge}
        rows={crud.items}
        columnDefs={columns}
        loading={crud.loading}
        storageKey="policy-ratelimiters"
        getRowId={(r) => r.id}
        onAdd={() => void openAdd()}
        onRefresh={() => void crud.refresh()}
        onDelete={async (rows) => {
          for (const row of rows) await crud.remove(row.id, row.name);
        }}
      />
      {editor && (
        <RateLimiterDialog
          key={editor.record?.id ?? 'new'}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          record={editor.record}
          saving={crud.saving}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}
