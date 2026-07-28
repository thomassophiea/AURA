/**
 * Site → Access Points → Geo Diagnostics sub-view. Per-floor rollup of APs,
 * GPS anchor APs and FTM ranging participants, derived from per-AP gpsAnchor +
 * WGS-84 fix + floorNumber and gated on the site-level apRanging flag. The
 * controller's live diagnostics (Last Location Update, Subgraph Complete /
 * Incomplete) are runtime telemetry not exposed by the config API and are
 * surfaced as an honest empty state rather than fabricated.
 */
import React, { useMemo } from 'react';
import { Info } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { Badge } from '../../ui/badge';
import type { ApDetail } from '../../../types/configure';
import { buildGeoDiagnostics, type GeoFloorRow } from './siteAfcModel';

export interface SiteGeoDiagnosticsTabProps {
  aps: ApDetail[];
  apRanging: boolean;
  loading: boolean;
}

export function SiteGeoDiagnosticsTab({ aps, apRanging, loading }: SiteGeoDiagnosticsTabProps) {
  const rows = useMemo<GeoFloorRow[]>(() => buildGeoDiagnostics(aps, apRanging), [aps, apRanging]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">FTM Ranging (site-wide):</span>
        <Badge variant={apRanging ? 'success' : 'outline'}>
          {apRanging ? 'Enabled' : 'Disabled'}
        </Badge>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Rollup derived from per-AP config (GPS anchor, WGS-84 fix, floor number). Live
          per-floor diagnostics — Last Location Update, Subgraph Complete / Incomplete — are
          runtime telemetry not exposed by the controller config API.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Floor</TableHead>
              <TableHead className="text-right">APs</TableHead>
              <TableHead className="text-right">Anchor APs</TableHead>
              <TableHead className="text-right">FTM Ranging APs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  {loading ? 'Loading access points…' : 'No access points in this site.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.floorNumber}>
                  <TableCell className="font-medium">{row.floorLabel}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.apCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.anchorApCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.ftmRangingApCount}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
