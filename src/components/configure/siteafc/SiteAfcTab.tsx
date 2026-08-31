/**
 * Site → Access Points → AFC sub-view: the three summary cards plus the per-AP
 * AFC grid whose columns match the controller (Status · Name · Model · Radio
 * Index · Anchor Type · Geo Location · Power Mode · Channel · Fallback Channel ·
 * Power · Req Power · Floor · AFC). Everything is config-derived; the runtime
 * banner keeps the honest boundary from the schema audit visible.
 */
import React, { useMemo } from 'react';
import { Info } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Badge } from '../../ui/badge';
import { AfcPowerBar, PowerModeBadge } from '../../wifi7/wifi7Viz';
import type { ApDetail } from '../../../types/configure';
import { AfcSummaryCards } from './AfcSummaryCards';
import { afcStatusVariant, buildAfcSummary, projectAfcApRow, type AfcApRow } from './siteAfcModel';

export interface SiteAfcTabProps {
  aps: ApDetail[];
  apRanging: boolean;
  loading: boolean;
}

const COLUMNS = [
  'Status',
  'Name',
  'Model',
  'Radio',
  'Anchor',
  'Geo Location',
  'Power Mode',
  'Channel',
  'Fallback',
  'Power',
  'Req Power',
  'Floor',
  'AFC',
] as const;

export function SiteAfcTab({ aps, apRanging, loading }: SiteAfcTabProps) {
  const rows = useMemo<AfcApRow[]>(() => aps.map(projectAfcApRow), [aps]);
  const summary = useMemo(() => buildAfcSummary(rows, apRanging), [rows, apRanging]);

  return (
    <div className="space-y-4">
      <AfcSummaryCards summary={summary} />

      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Grid values come from per-AP config (<code>/v1/aps/&#123;serial&#125;</code>).{' '}
          <span className="font-medium">Status</span> is a config-derived AFC eligibility signal
          (AFC enabled + GPS anchor + Standard-Power mode) — the controller&apos;s live &ldquo;AFC
          Available&rdquo;, expiry and subgraph state are runtime telemetry not exposed by the
          config API.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) => (
                <TableHead key={c} className="whitespace-nowrap">
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMNS.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  {loading ? 'Loading access points…' : 'No access points in this site.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.serialNumber}>
                  <TableCell>
                    <Badge variant={afcStatusVariant(row.status)}>{row.status}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium">{row.apName}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {row.model}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.radioIndex ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.anchorType}
                    {row.gpsAntennaDistance != null && (
                      <span className="ml-1 text-xs">({row.gpsAntennaDistance} m)</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={`whitespace-nowrap ${row.hasGeo ? 'tabular-nums' : 'text-muted-foreground'}`}
                  >
                    {row.geoLocation}
                  </TableCell>
                  <TableCell>
                    {row.powerMode ? <PowerModeBadge mode={row.powerMode} /> : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{row.channel}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {row.fallbackChannel}
                  </TableCell>
                  <TableCell className="min-w-[120px]">
                    {row.radio ? (
                      <AfcPowerBar radio={row.radio} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.reqPower != null ? `${row.reqPower} dBm` : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.floor ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={row.afcEnabled ? 'success' : 'outline'}>
                      {row.afcEnabled ? 'On' : 'Off'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
