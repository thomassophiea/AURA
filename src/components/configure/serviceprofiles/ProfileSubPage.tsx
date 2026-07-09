/**
 * Generic Service Profile sub-page: ResourceGridPage + live CRUD via
 * useResourceCrud, Add seeded from the controller /default via useDefaults,
 * confirm-gated delete honoring canDelete. The area-specific editor is
 * supplied through the `renderEditor` render-prop.
 */
import React, { useCallback, useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import type { LucideIcon } from 'lucide-react';
import { ResourceGridPage, useDefaults, useResourceCrud } from '../_kit';
import type { ResourceClient } from '../../../services/configure';

export interface ProfileRecord {
  id: string;
  name?: string;
  canEdit?: boolean | null;
  canDelete?: boolean | null;
}

export interface EditorRenderArgs<T> {
  record: T | null;
  seed: T;
  rows: T[];
  saving: boolean;
  onSave: (payload: Partial<T>, id?: string) => Promise<void>;
  close: () => void;
}

export interface ProfileSubPageProps<T extends ProfileRecord> {
  service: ResourceClient<T>;
  /** Singular label for toasts, e.g. 'ESL profile'. */
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  storageKey: string;
  columns: (openEdit: (row: T) => void) => ColDef<T>[];
  /** Adjust the /default template into a fresh create scaffold. */
  seed: (def: T) => T;
  renderEditor: (args: EditorRenderArgs<T>) => React.ReactNode;
}

interface EditorState<T> {
  record: T | null;
  seed: T | null;
}

export function ProfileSubPage<T extends ProfileRecord>({
  service,
  label,
  title,
  description,
  icon,
  storageKey,
  columns,
  seed,
  renderEditor,
}: ProfileSubPageProps<T>) {
  const crud = useResourceCrud<T>(service, {
    resourceLabel: label,
    getId: (r) => r.id,
    getName: (r) => r.name ?? r.id,
  });
  const defaults = useDefaults<T>(
    useCallback(() => service.getDefault(), [service]),
    label
  );
  const [editor, setEditor] = useState<EditorState<T> | null>(null);

  const openEdit = useCallback((record: T) => setEditor({ record, seed: null }), []);
  const openAdd = useCallback(async () => {
    const def = await defaults.load();
    if (!def) return;
    setEditor({ record: null, seed: seed(def) });
  }, [defaults, seed]);

  const columnDefs = useMemo(() => columns(openEdit), [columns, openEdit]);

  const handleDelete = useCallback(
    async (rows: T[]) => {
      for (const row of rows) await crud.remove(row.id, row.name);
    },
    [crud]
  );

  const handleSave = useCallback(
    async (payload: Partial<T>, id?: string) => {
      const saved = await crud.save(payload, id);
      if (saved) setEditor(null);
    },
    [crud]
  );

  return (
    <>
      <ResourceGridPage<T>
        title={title}
        description={description}
        icon={icon}
        rows={crud.items}
        columnDefs={columnDefs}
        loading={crud.loading}
        storageKey={storageKey}
        getRowId={(row) => row.id}
        onAdd={() => void openAdd()}
        onDelete={handleDelete}
        onRefresh={() => void crud.refresh()}
      />
      {editor &&
        renderEditor({
          record: editor.record,
          seed: (editor.seed ?? editor.record) as T,
          rows: crud.items,
          saving: crud.saving,
          onSave: handleSave,
          close: () => setEditor(null),
        })}
    </>
  );
}
