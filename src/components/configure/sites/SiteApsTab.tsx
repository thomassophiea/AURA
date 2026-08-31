/**
 * Site editor · Access Points tab — a read-only visibility surface (golden
 * SITE_TABS "Access Points"), not an editor: the site's APs from the live
 * inventory (useSiteAps prefers /v1/aps/query, which carries live status)
 * with serial / name / model / status columns. Data loads on mount only —
 * no polling (house rule: pages hold still).
 */
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import type { SiteTabProps } from './siteEditorTypes';
import { useSiteAps } from './useSiteAps';

export function SiteApsTab({ form, isNew }: SiteTabProps) {
  const { aps, loading } = useSiteAps(form.siteName ?? '');

  if (isNew) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Save the site first — access points appear here once they are assigned to it.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Access points reporting this site as their host site. Assignment is managed through Device
        Groups.
      </p>
      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serial Number</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="w-32">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  Loading access points…
                </TableCell>
              </TableRow>
            ) : aps.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  No access points on this site.
                </TableCell>
              </TableRow>
            ) : (
              aps.map((ap) => (
                <TableRow key={ap.serialNumber}>
                  <TableCell className="font-mono text-xs">{ap.serialNumber}</TableCell>
                  <TableCell>{ap.apName || '—'}</TableCell>
                  <TableCell>{ap.hardwareType || '—'}</TableCell>
                  <TableCell>{ap.status || '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
