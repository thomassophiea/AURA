/**
 * SLE Root Cause Panel - Slide-out drill-down for a classifier
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Users, Wifi, AlertTriangle, CheckCircle } from 'lucide-react';
import type { SLERootCause } from '../../types/sle';

interface SLERootCausePanelProps {
  open: boolean;
  onClose: () => void;
  rootCause: SLERootCause | null;
}

export function SLERootCausePanel({ open, onClose, rootCause }: SLERootCausePanelProps) {
  if (!rootCause) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Root Cause: {rootCause.classifierName}
          </DialogTitle>
          <DialogDescription>{rootCause.description}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4">
            {/* Affected Clients */}
            {rootCause.affectedDevices.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4" />
                  Affected Clients ({rootCause.affectedDevices.length})
                </h4>
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="h-7">
                      <TableHead className="text-[10px]">Client</TableHead>
                      <TableHead className="text-[10px]">MAC Address</TableHead>
                      <TableHead className="text-[10px]">AP</TableHead>
                      {rootCause.affectedDevices[0]?.rssi !== undefined && (
                        <TableHead className="text-[10px]">RSSI</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rootCause.affectedDevices.slice(0, 20).map((dev, i) => (
                      <TableRow key={i} className="h-7">
                        <TableCell className="py-1">{dev.name || dev.mac || 'Unknown'}</TableCell>
                        <TableCell className="py-1 font-mono text-[10px]">{dev.mac}</TableCell>
                        <TableCell className="py-1">{dev.ap && dev.ap !== '-' ? dev.ap : '-'}</TableCell>
                        {dev.rssi !== undefined && (
                          <TableCell className="py-1">
                            <Badge variant={dev.rssi > -70 ? 'outline' : 'destructive'} className="text-[10px]">
                              {dev.rssi} dBm
                            </Badge>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rootCause.affectedDevices.length > 20 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    ...and {rootCause.affectedDevices.length - 20} more
                  </p>
                )}
              </div>
            )}

            {/* Affected APs */}
            {rootCause.affectedAPs.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Wifi className="h-4 w-4" />
                  Affected Access Points ({rootCause.affectedAPs.length})
                </h4>
                <div className="space-y-1">
                  {rootCause.affectedAPs.map((ap, i) => (
                    <div key={i} className="flex items-center justify-between text-xs px-2 py-1 bg-muted/30 rounded">
                      <span>{ap.name || ap.serial}</span>
                      <Badge variant={ap.status === 'online' ? 'outline' : 'destructive'} className="text-[10px]">
                        {ap.status || 'unknown'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {rootCause.recommendations.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Recommendations
                </h4>
                <ul className="space-y-1">
                  {rootCause.recommendations.map((rec, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">-</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
