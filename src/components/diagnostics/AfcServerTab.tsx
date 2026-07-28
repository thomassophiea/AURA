/**
 * AFC Server tab — the per-radio AFC *config* summary across the fleet, reusing
 * the Site AFC projection model. The controller's live AFC server status
 * (server URL up/down, response availability, subgraph, per-radio expiry) is
 * runtime telemetry not exposed by the config API and is labelled as such
 * rather than fabricated (schema audit: SITE_AFC_GEO_FINDINGS.md).
 */
import React, { useMemo } from 'react';
import { SatelliteDish } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  afcStatusVariant,
  buildAfcSummary,
  projectAfcApRow,
} from '../configure/siteafc/siteAfcModel';
import { PowerModeBadge } from '../wifi7/wifi7Viz';
import type { ApDetail } from '../../types/configure';

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

export function AfcServerTab({ aps }: { aps: ApDetail[] }) {
  const rows = useMemo(
    () => aps.map(projectAfcApRow).filter((r) => r.radioIndex != null),
    [aps]
  );
  const summary = useMemo(() => buildAfcSummary(rows, false), [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryStat label="6 GHz radios" value={summary.totalAps} />
        <SummaryStat label="AFC enabled" value={summary.afcRadios} />
        <SummaryStat label="SP eligible" value={summary.spEligibleRadios} />
        <SummaryStat label="Power-capped" value={summary.cappedRadios} />
      </div>

      <Alert variant="info">
        <SatelliteDish className="h-4 w-4" />
        <AlertTitle>AFC server runtime status not exposed</AlertTitle>
        <AlertDescription>
          The controller&apos;s live AFC server status (server URL reachability, response
          availability, per-radio expiry and subgraph) is runtime telemetry — every candidate
          endpoint 404s. The grid below is the config-derived AFC posture only.
        </AlertDescription>
      </Alert>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No 6 GHz radios found on this controller.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>AP</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Power Mode</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Power / Req</TableHead>
                    <TableHead>AFC</TableHead>
                    <TableHead>Eligibility</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.serialNumber}>
                      <TableCell className="font-medium">{r.apName}</TableCell>
                      <TableCell>{r.model}</TableCell>
                      <TableCell>
                        {r.powerMode ? <PowerModeBadge mode={r.powerMode} /> : '—'}
                      </TableCell>
                      <TableCell>{r.channel}</TableCell>
                      <TableCell>
                        {r.power != null ? `${r.power} / ${r.reqPower} dBm` : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.afcEnabled ? 'success' : 'secondary'}>
                          {r.afcEnabled ? 'On' : 'Off'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={afcStatusVariant(r.status)}>{r.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AfcServerTab;
