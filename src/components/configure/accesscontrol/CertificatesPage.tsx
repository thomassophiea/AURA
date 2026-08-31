/**
 * Certificates tab (/access-control/v1/certificates) — grid + editor.
 * Records are keyed by name. The header carries the "EP1 · Earmarked" badge:
 * this screen is Gateway-level configuration earmarked for the unified EP1
 * certificate story (golden §7f) — the badge states the organizational
 * earmark and changes no behavior. Empty on the lab appliance — that is its
 * real state.
 */
import React, { useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { FileBadge } from 'lucide-react';
import { Badge } from '../../ui/badge';
import {
  acCertificatesService,
  type AcCertificate,
} from '../../../services/configure/accessControlFamilyService';
import { ResourceGridPage, useResourceCrud } from '../_kit';
import { withRowClick } from '../policy/gridHelpers';
import { CertificateEditor } from './CertificateEditor';
import { dashText } from './accessControlModel';

interface EditorState {
  record: AcCertificate | null;
}

export function CertificatesPage() {
  const crud = useResourceCrud<AcCertificate>(acCertificatesService, {
    resourceLabel: 'certificate',
    getId: (c) => c.name,
    getName: (c) => c.name,
  });
  const [editor, setEditor] = useState<EditorState | null>(null);

  const columns = useMemo<ColDef<AcCertificate>[]>(
    () =>
      withRowClick<AcCertificate>(
        [
          { field: 'name', headerName: 'Name', flex: 1.2, minWidth: 180, sort: 'asc' },
          {
            field: 'subject',
            headerName: 'Subject',
            minWidth: 300,
            flex: 1.8,
            valueFormatter: (p) => dashText(p.value),
          },
          {
            field: 'issuer',
            headerName: 'Issuer',
            minWidth: 240,
            flex: 1.4,
            valueFormatter: (p) => dashText(p.value),
          },
          {
            field: 'valid_to',
            headerName: 'Valid To',
            minWidth: 160,
            flex: 1,
            valueFormatter: (p) => dashText(p.value),
          },
          {
            headerName: 'CRL URLs',
            width: 110,
            type: 'numeric',
            valueGetter: (p) => (Array.isArray(p.data?.crl_urls) ? p.data.crl_urls.length : 0),
          },
        ],
        (row) => setEditor({ record: row })
      ),
    []
  );

  const handleSave = async (payload: Partial<AcCertificate>, id?: string) => {
    const saved = await crud.save(payload, id);
    if (saved !== null) setEditor(null);
  };

  return (
    <>
      <ResourceGridPage<AcCertificate>
        title={
          <span className="flex items-center gap-2">
            Certificates
            <Badge variant="secondary">EP1 · Earmarked</Badge>
          </span>
        }
        description="Access Control certificate requests and revocation lists — issuance happens on the Gateway"
        icon={FileBadge}
        rows={crud.items}
        columnDefs={columns}
        loading={crud.loading}
        storageKey="ac-certificates"
        getRowId={(c) => c.name}
        getSearchText={(c) => `${c.name} ${c.subject ?? ''} ${c.issuer ?? ''}`}
        onAdd={() => setEditor({ record: null })}
        onRefresh={() => void crud.refresh()}
        onDelete={async (rows) => {
          for (const row of rows) await crud.remove(row.name, row.name);
        }}
      />
      {editor && (
        <CertificateEditor
          key={editor.record?.name ?? 'new'}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          record={editor.record}
          siblingNames={crud.items.map((c) => c.name)}
          saving={crud.saving}
          onSave={handleSave}
        />
      )}
    </>
  );
}
