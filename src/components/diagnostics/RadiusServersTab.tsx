/**
 * RADIUS Servers tab — the auth + accounting RADIUS servers configured across
 * every AAA policy (`/v1/aaapolicy`). Config truth only; there is no live
 * reachability status in the config API, so no up/down indicator is faked.
 */
import React from 'react';
import { KeyRound } from 'lucide-react';
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
import { collectRadiusServers } from './diagnosticsEngine';
import type { AaaPolicy } from '../../types/configure';

export function RadiusServersTab({ aaaPolicies }: { aaaPolicies: AaaPolicy[] }) {
  const rows = collectRadiusServers(aaaPolicies);
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <KeyRound className="h-8 w-8" />
          <p className="text-sm">No RADIUS servers configured in any AAA policy.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Policy</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Port</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Timeout</TableHead>
                <TableHead>Retries</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.policyName}-${r.role}-${r.ipAddress}-${i}`}>
                  <TableCell className="font-medium">{r.policyName}</TableCell>
                  <TableCell>
                    <Badge variant={r.role === 'Authentication' ? 'info' : 'secondary'}>
                      {r.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.ipAddress}</TableCell>
                  <TableCell>{r.port}</TableCell>
                  <TableCell>{r.serverType}</TableCell>
                  <TableCell>{r.timeout}s</TableCell>
                  <TableCell>{r.totalRetries}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default RadiusServersTab;
